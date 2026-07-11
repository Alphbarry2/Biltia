// ─────────────────────────────────────────────────────────────────────────────
// AGENT EXECUTOR — le moteur qui fait travailler les agents recrutés.
// STRICTEMENT CÔTÉ SERVEUR (service_role) : appelé par le cron (/api/agents/run)
// et par « Exécuter maintenant » (après vérification d'appartenance).
//
// Garanties d'exécution (« il faut qu'il exécute VRAIMENT bien ») :
//   1. IDEMPOTENCE — l'insert du run (rule_id, run_key UNIQUE) sert de verrou :
//      un créneau déjà consommé est ignoré, même si le cron rejoue. Jamais
//      deux relances au même client pour le même créneau.
//   2. ÉTAT BLOQUÉ — une info manquante (email disparu, Resend non configuré)
//      ne fait pas échouer en silence : le run ET la règle passent « blocked »
//      avec la raison lisible, et un push prévient l'utilisateur.
//   3. JOURNAL — chaque passage est tracé dans agent_runs (résumé, sortie,
//      erreur, coût) : l'utilisateur voit ce que son agent a fait, quand.
//   4. TEMPS ET EN HEURE — next_run_at est recalculé après chaque passage
//      (heure de Paris, lib/agent-rules.ts).
//
// Coût : l'usage IA est JOURNALISÉ (ai_usage, action "agent_run") mais pas
// encore débité — la tarification des agents sera tranchée séparément
// (décision utilisateur du 2026-07-05 : « on parlera crédits après »).
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeNextRun, type AgentAction, type AgentSchedule, type AgentTrigger } from "./agent-rules";
import { getEntitlementsForTenant } from "./entitlements";
import { getWorkspaceContext, buildWorkspaceBlock } from "./workspace-context";
import { runAgentLoop, buildWorkspaceToolsSystem, type ToolTrace } from "./agent-tools";
import { getWatcher, buildFireKey, isSupplierRelanceWatcher, type WatcherDef, type WatcherMatch } from "./agent-watchers";
import { readTeamAgenda } from "./gcal";
import { buildDocumentSystemPrompt, injectDocumentRuntime } from "./document-generator";
import { sendOutboundEmail, canSendOutbound } from "./outbound-email";
import { canSendSms } from "./outbound-sms";
import { sendPushToUser } from "./push";
import { trackAiUsage } from "./ai-usage";
import { logActivity } from "./activity";
import { isFounderEmail } from "./founder";
import { TIER_SIMPLE, TIER_MEDIUM, TIER_COMPLEX } from "./models";

// MODÈLE PAR MISSION (règle user 2026-07-05) : figé au recrutement selon la
// complexité (simple=Haiku, medium=Sonnet, complex=Opus), whitelisté ici —
// une valeur inattendue stockée en base ne peut jamais viser un autre modèle.
const ALLOWED_EXEC_MODELS = new Set([TIER_SIMPLE, TIER_MEDIUM, TIER_COMPLEX]);

// À partir de ce niveau d'escalade, une relance devient SENSIBLE (ton ferme :
// pénalités / recouvrement) → jamais envoyée automatiquement, toujours retenue
// pour validation humaine (#70), même hors mode brouillon.
const FIRM_RELANCE_LEVEL = 3;
function pickExecModel(action: AgentAction): string {
  if (action.model && ALLOWED_EXEC_MODELS.has(action.model)) return action.model;
  // Anciennes règles (sans modèle stocké) : un contrôle de données = Sonnet,
  // un message/rappel = Haiku.
  return action.type === "report" ? TIER_MEDIUM : TIER_SIMPLE;
}

export type AgentRuleRow = {
  id: string;
  tenant_id: string;
  created_by: string | null;
  title: string;
  instruction: string;
  schedule: AgentSchedule;
  action: AgentAction;
  status: string;
  next_run_at: string | null;
  /** 'schedule' (défaut, passage à heure fixe) | 'event' (surveillance d'une condition). */
  trigger_type?: string | null;
  /** Config du veilleur si trigger_type='event'. */
  trigger?: AgentTrigger | null;
  /** Plafond MENSUEL de crédits (0 = illimité). Atteint → agent en pause. Migration 026. */
  monthly_credit_budget?: number | null;
  /** Plafond QUOTIDIEN de crédits (0 = illimité). Atteint → fiches reportées à demain. Migration 026. */
  daily_credit_budget?: number | null;
};

/**
 * Dépense d'un agent (somme des crédits débités par ses passages) sur le mois et
 * sur la journée en cours. Sert aux garde-fous de budget (levier 1 + 4). Fenêtres
 * en UTC : suffisant pour un plafond de coût (throttle souple, pas de la compta).
 */
async function ruleSpend(
  admin: SupabaseClient,
  ruleId: string
): Promise<{ today: number; month: number }> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const dayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  ).toISOString();
  const { data } = await admin
    .from("agent_runs")
    .select("credits_used, created_at")
    .eq("rule_id", ruleId)
    .gte("created_at", monthStart);
  let today = 0;
  let month = 0;
  for (const r of (data ?? []) as { credits_used: number | null; created_at: string }[]) {
    const c = Number(r.credits_used) || 0;
    month += c;
    if (r.created_at >= dayStart) today += c;
  }
  return { today, month };
}

export type RunOutcome = {
  status: "success" | "blocked" | "failed" | "skipped";
  summary: string;
};

// ── Rédaction (Claude) ───────────────────────────────────────────────────────

const COMPOSE_TOOL: Anthropic.Tool = {
  name: "compose",
  description: "Rédige le message de ce passage de l'agent.",
  input_schema: {
    type: "object",
    properties: {
      subject: { type: "string", description: "Objet court (email) ou titre (notification)." },
      body: {
        type: "string",
        description: "Corps du message, prêt à envoyer. Français professionnel, direct, sans placeholder.",
      },
    },
    required: ["subject", "body"],
    additionalProperties: false,
  },
};

/**
 * Exécution agentique d'un passage : l'agent a ACCÈS TOTAL au workspace
 * (outils workspace_* : lire, chercher, créer, modifier, supprimer — tenant
 * forcé) pour accomplir sa mission, puis TERMINE en appelant `compose`
 * (le livrable du passage : email / notification / synthèse). Les écritures
 * effectuées en route sont tracées (traces) et journalisées.
 */
async function compose(opts: {
  mode: "email" | "notify" | "report" | "act";
  model: string;
  instruction: string;
  recipientNames: string;
  companyName: string;
  workspaceBlock: string;
  extraData: string;
  db: SupabaseClient;
  tenantId: string;
  userId: string | null;
  fromEmail: string | null;
  allowEmail: boolean;
  allowSms: boolean;
  agentTitle: string;
}): Promise<{
  subject: string;
  body: string;
  traces: ToolTrace[];
  usage: { inputTokens: number; outputTokens: number };
} | null> {
  const hasKey =
    !!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY.startsWith("your_");
  if (!hasKey) return null;

  const execModel = opts.model;
  const roleLine =
    opts.mode === "email"
      ? `Ton livrable : un EMAIL envoyé au nom de l'entreprise « ${opts.companyName} » à : ${opts.recipientNames}. Signe au nom de l'entreprise. Jamais de placeholder ([nom], XXX) : si une donnée manque, formule sans elle.`
      : opts.mode === "report"
        ? `Ton livrable : la SYNTHÈSE du contrôle demandé, pour le patron de « ${opts.companyName} ». Va droit aux faits : ce qui va, ce qui cloche, quoi faire. N'invente RIEN : uniquement ce que les données montrent. S'il n'y a rien à signaler, dis-le en une phrase.`
        : opts.mode === "act"
          ? `Ta mission : AGIR dans le workspace de « ${opts.companyName} » — tu ne te contentes pas d'écrire, tu CRÉES / METS À JOUR les fiches nécessaires via les outils workspace_* (workspace_create, workspace_update), à partir des DONNÉES RÉELLES. CRÉER ≠ INVENTER : n'invente AUCUN montant, prix, date ni coordonnée absent. S'il manque des éléments pour une fiche complète (ex : les prix d'un devis, le chantier de rattachement), crée quand même un BROUILLON avec ce que tu sais (statut brouillon, champs connus) et LISTE précisément ce qui reste à compléter. Rattache les relations (client_id, chantier_id…) aux fiches EXISTANTES (workspace_list pour trouver l'id). Tu ne SUPPRIMES jamais une fiche. Ton livrable compose = un COMPTE-RENDU de ce que tu as fait (fiches créées/mises à jour) + ce qui reste à compléter.`
          : `Ton livrable : un RAPPEL bref (notification) pour le patron de « ${opts.companyName} ». Deux phrases max.`;

  // Envois en cours de mission (opt-in) : réservés aux passages sans email de
  // livraison (report/notify), pour qu'une surveillance puisse VRAIMENT agir
  // (relancer un client) plutôt que seulement prévenir le patron. Garde-fou strict.
  const channels: string[] = [];
  if (opts.allowEmail) channels.push("send_email (email)");
  if (opts.allowSms) channels.push("send_sms (SMS, idéal si le client ne lit pas ses mails)");
  const outboundGuidance = channels.length
    ? `\nOUTILS D'ENVOI (${channels.join(" · ")}) : tu peux écrire au nom de « ${opts.companyName} » UNIQUEMENT si la mission le demande explicitement (ex : relancer un client précis, confirmer un RDV, prévenir des employés). Identifie d'abord le destinataire et son contact (email/numéro) dans le workspace ou les collections d'app. JAMAIS de placeholder ([nom], XXX) : si un contact ou une donnée manque, n'envoie pas et signale-le dans ton livrable. Ces envois s'ajoutent à ton livrable ci-dessous, ne le remplacent pas.\n`
    : "";

  const system = `Tu es un agent autonome de Biltia, l'OS opérationnel du BTP. Tu exécutes un passage planifié de la mission confiée par l'utilisateur. Tu peux LIRE et ÉCRIRE dans le workspace avec les outils workspace_* si la mission le demande (vérifier des données, mettre à jour un statut, créer une tâche…).

${roleLine}
${outboundGuidance}
MISSION DICTÉE PAR L'UTILISATEUR : « ${opts.instruction} »

${opts.workspaceBlock ? `${opts.workspaceBlock}\n` : ""}${opts.extraData ? `# DONNÉES DU JOUR (pré-chargées)\n${opts.extraData}\n` : ""}
${buildWorkspaceToolsSystem()}

Quand la mission du passage est accomplie, TERMINE OBLIGATOIREMENT en appelant l'outil compose (ton livrable). N'appelle compose qu'UNE fois, en dernier.`;

  try {
    const loop = await runAgentLoop({
      model: execModel,
      system,
      userMessage: "Exécute le passage d'aujourd'hui.",
      db: opts.db,
      actor: {
        tenantId: opts.tenantId,
        userId: opts.userId,
        label: `Agent « ${opts.agentTitle} »`,
        fromEmail: opts.fromEmail,
      },
      finishTool: COMPOSE_TOOL,
      allowEmail: opts.allowEmail,
      allowSms: opts.allowSms,
      // Un agent AUTONOME ne supprime jamais de fiche sans humain dans la boucle.
      allowDelete: opts.mode !== "act",
      maxIterations: 8,
      maxTokens: 1200,
    });

    const i = (loop.finishInput ?? {}) as { subject?: string; body?: string };
    if (!i.subject || !i.body) return null;
    return {
      subject: String(i.subject).slice(0, 180),
      body: String(i.body).slice(0, 6000),
      traces: loop.traces,
      usage: loop.usage,
    };
  } catch {
    return null;
  }
}

// ── Données du jour (report) ─────────────────────────────────────────────────

/** Extraits ciblés trésorerie/commercial — le nerf de la guerre de l'artisan. */
async function fetchFocusData(admin: SupabaseClient, tenantId: string): Promise<string> {
  const lines: string[] = [];
  try {
    const today = new Date().toISOString().slice(0, 10);
    const [{ data: devisRows }, { data: factRows }] = await Promise.all([
      admin
        .from("devis")
        .select("numero, statut, montant_ttc, date_devis")
        .eq("tenant_id", tenantId)
        .eq("statut", "envoye")
        .limit(20),
      admin
        .from("factures")
        .select("numero, statut, montant_ttc, date_echeance")
        .eq("tenant_id", tenantId)
        .in("statut", ["envoyee", "en_retard", "partiellement_payee"])
        .lt("date_echeance", today)
        .limit(20),
    ]);
    if (devisRows?.length) {
      lines.push(`Devis en attente de réponse : ${devisRows.length}`);
      for (const d of devisRows.slice(0, 10)) {
        lines.push(`- Devis ${d.numero ?? "?"} · ${d.montant_ttc ?? "?"} € TTC · envoyé le ${d.date_devis ?? "?"}`);
      }
    }
    if (factRows?.length) {
      lines.push(`Factures échues impayées : ${factRows.length}`);
      for (const f of factRows.slice(0, 10)) {
        lines.push(`- Facture ${f.numero ?? "?"} · ${f.montant_ttc ?? "?"} € TTC · échéance ${f.date_echeance ?? "?"}`);
      }
    }
  } catch {
    // tables absentes / migration non appliquée → l'agent travaille sans.
  }

  // BLOC PILOTAGE (chiffres agrégés) : donne au report de quoi calculer un vrai
  // CA / cash / marge plutôt que d'estimer à vue. Somme en JS sur volume borné
  // (une entreprise BTP typique). Isolé dans son propre try : une table absente
  // (depenses de la migration 037) ne prive pas le report du reste.
  try {
    const eur = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;
    const sum = (rows: { montant_ttc?: number | null; montant_paye?: number | null }[] | null, field: "montant_ttc" | "montant_paye") =>
      (rows ?? []).reduce((t, r) => t + (Number(r[field]) || 0), 0);

    const [{ data: devisAll }, { data: factAll }] = await Promise.all([
      admin.from("devis").select("statut, montant_ttc").eq("tenant_id", tenantId).limit(1000),
      admin.from("factures").select("statut, montant_ttc, montant_paye").eq("tenant_id", tenantId).limit(1000),
    ]);
    const dv = (devisAll ?? []) as { statut: string | null; montant_ttc: number | null }[];
    const fc = (factAll ?? []) as { statut: string | null; montant_ttc: number | null; montant_paye: number | null }[];

    const emises = fc.filter((f) => ["envoyee", "partiellement_payee", "payee", "en_retard"].includes(String(f.statut)));
    const caSigne = sum(dv.filter((d) => d.statut === "accepte"), "montant_ttc");
    const devisAttente = sum(dv.filter((d) => d.statut === "envoye"), "montant_ttc");
    const caFacture = sum(emises, "montant_ttc");
    const caEncaisse = sum(emises, "montant_paye");
    const caEnAttente = Math.max(0, caFacture - caEncaisse); // reste dû sur factures émises

    const pilot: string[] = [];
    if (caSigne > 0) pilot.push(`CA signé (devis acceptés) : ${eur(caSigne)}`);
    if (devisAttente > 0) pilot.push(`Devis en attente de réponse : ${eur(devisAttente)}`);
    if (caFacture > 0) pilot.push(`CA facturé (factures émises) : ${eur(caFacture)}`);
    if (caEncaisse > 0) pilot.push(`Encaissé : ${eur(caEncaisse)}`);
    if (caEnAttente > 0) pilot.push(`Reste à encaisser (clients) : ${eur(caEnAttente)}`);

    // Payables fournisseurs (ce que l'entreprise doit) — table 037, tolérée absente.
    const { data: depAll, error: depErr } = await admin
      .from("depenses")
      .select("statut, montant_ttc")
      .eq("tenant_id", tenantId)
      .in("statut", ["a_payer", "en_retard"])
      .limit(1000);
    if (!depErr) {
      const aPayer = sum((depAll ?? []) as { montant_ttc: number | null }[], "montant_ttc");
      if (aPayer > 0) pilot.push(`À payer aux fournisseurs : ${eur(aPayer)}`);
    }

    // Chantiers dont le coût engagé dépasse le budget (dérive de marge).
    const { data: chAll } = await admin
      .from("chantiers")
      .select("budget, budget_engage, statut")
      .eq("tenant_id", tenantId)
      .in("statut", ["en_attente", "en_cours", "en_retard"])
      .limit(500);
    const horsBudget = ((chAll ?? []) as { budget: number | null; budget_engage: number | null }[]).filter(
      (c) => (Number(c.budget) || 0) > 0 && (Number(c.budget_engage) || 0) > (Number(c.budget) || 0)
    ).length;
    if (horsBudget > 0) pilot.push(`Chantiers en dépassement de budget : ${horsBudget}`);

    if (pilot.length) {
      lines.push("");
      lines.push("Pilotage (chiffres à date) :");
      lines.push(...pilot.map((p) => `- ${p}`));
    }
  } catch {
    // agrégats indisponibles → le report se contente des extraits ci-dessus.
  }
  return lines.join("\n");
}

// ── Déclencheurs événementiels (« dès que… ») ────────────────────────────────

/**
 * Rédige UNE relance client focalisée sur une fiche déclenchante (appel IA unique).
 * `relanceLevel` (1 = première fois, 2, 3+…) fait ESCALADER le ton : doux au
 * début, ferme quand plusieurs relances sont restées sans suite. Le niveau est
 * déduit du nombre de déclenchements déjà enregistrés pour cette fiche.
 */
async function composeRelance(opts: {
  model: string;
  companyName: string;
  watcher: WatcherDef;
  match: WatcherMatch;
  instruction: string;
  relanceLevel: number;
  /** À qui s'adresse la relance : un CLIENT (défaut) ou un FOURNISSEUR/sous-traitant. */
  audience?: "client" | "supplier";
}): Promise<{ subject: string; body: string; usage: { inputTokens: number; outputTokens: number } } | null> {
  const hasKey = !!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY.startsWith("your_");
  if (!hasKey) return null;
  const level = Math.max(1, Math.floor(opts.relanceLevel) || 1);
  const isSupplier = opts.audience === "supplier";
  // ESCALADE (demande user) : le ton monte avec le nombre de relances sans suite.
  // Deux registres : CLIENT (peut aller jusqu'au recouvrement d'un impayé) vs
  // FOURNISSEUR/sous-traitant (chasse de livraison / d'attestation — JAMAIS de
  // menace de pénalités/recouvrement, ce n'est pas une créance client).
  const toneGuide = isSupplier
    ? level <= 1
      ? "PREMIÈRE relance : ton cordial et professionnel, simple rappel (livraison attendue, document/attestation à fournir, point à régler). Pars du principe d'un oubli."
      : level === 2
        ? "DEUXIÈME relance : cordial mais plus direct. Rappelle qu'un premier message est resté sans réponse et que cela impacte le chantier/le planning."
        : `RELANCE DE NIVEAU ${level} : plusieurs relances sans suite. Ton FERME et FACTUEL (jamais agressif) : rappelle l'engagement pris (délai de livraison, attestation obligatoire, réserve à lever), l'impact concret sur le chantier, et demande une régularisation SANS DÉLAI. N'ÉVOQUE PAS de pénalités de retard ni de recouvrement (ce n'est pas un impayé client).`
    : level <= 1
      ? "PREMIÈRE relance : ton chaleureux et courtois, un simple rappel amical, JAMAIS comminatoire. Pars du principe que c'est un oubli."
      : level === 2
        ? "DEUXIÈME relance : ton courtois mais plus direct. Rappelle poliment qu'un premier message est resté sans réponse et que le règlement/la réponse se fait attendre."
        : `RELANCE DE NIVEAU ${level} : plusieurs relances sont restées sans suite. Ton PROFESSIONNEL et FERME (jamais agressif ni insultant) : rappelle l'échéance dépassée et le montant dû, invite à régulariser SANS DÉLAI, et indique qu'à défaut de réponse tu seras contraint d'envisager les suites prévues (pénalités de retard, procédure de recouvrement). Reste correct, factuel et signe proprement.`;
  const destinataire = opts.match.contactName || (isSupplier ? "ce fournisseur / sous-traitant" : "un client");
  const client = new Anthropic();
  const system = `Tu es un agent de Biltia (OS opérationnel du BTP). Tu écris UN email de relance AU NOM de l'entreprise « ${opts.companyName} », adressé à ${destinataire} (${isSupplier ? "un FOURNISSEUR / SOUS-TRAITANT de l'entreprise" : "un CLIENT de l'entreprise"}).

SUJET DE LA RELANCE : ${opts.watcher.watching}.
FICHE CONCERNÉE (seule source de faits) : ${opts.match.label} — ${opts.match.detail}.
NIVEAU DE RELANCE : ${level}. ${toneGuide}
${opts.instruction ? `CONSIGNE DU PATRON : « ${opts.instruction} ».\n` : ""}
Règles : français professionnel, 4 à 6 phrases, signe au nom de « ${opts.companyName} ». N'invente AUCUN montant, date ni référence au-delà de la fiche ci-dessus. Aucun placeholder ([nom], XXX). Adapte l'objet au niveau (ex : « Relance », « 2e relance »${isSupplier ? ", « Relance — livraison en attente »" : ", « Relance — règlement en attente »"}).
Termine en appelant l'outil compose (objet + corps prêts à envoyer).`;
  try {
    const msg = await client.messages.create({
      model: opts.model,
      max_tokens: 800,
      system,
      tools: [COMPOSE_TOOL],
      tool_choice: { type: "tool", name: "compose" },
      messages: [{ role: "user", content: "Rédige la relance." }],
    });
    const block = msg.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") return null;
    const i = block.input as { subject?: string; body?: string };
    if (!i.subject || !i.body) return null;
    return {
      subject: String(i.subject).slice(0, 180),
      body: String(i.body).slice(0, 6000),
      usage: { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens },
    };
  } catch {
    return null;
  }
}

/**
 * CAS « l'IA LIT ET JUGE » (aiJudge) : parmi des candidats pré-filtrés en SQL,
 * ne garde que ceux qui remplissent un critère exprimé en langage naturel
 * (urgence, risque…). UN seul appel IA, borné, avec biais prudent (dans le doute,
 * on exclut — mieux vaut rater un cas limite que crier au loup). Retourne null
 * si l'IA est indisponible (l'appelant décide alors de ne rien affirmer).
 */
async function judgeMatches(opts: {
  model: string;
  criterion: string;
  companyName: string;
  matches: WatcherMatch[];
}): Promise<{ kept: WatcherMatch[]; usage: { inputTokens: number; outputTokens: number } } | null> {
  const hasKey = !!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY.startsWith("your_");
  if (!hasKey || opts.matches.length === 0) return null;
  const list = opts.matches.map((m, i) => `[${i}] ${m.label} — ${m.detail}`).join("\n");
  const tool: Anthropic.Tool = {
    name: "flag",
    description: "Retient les éléments qui remplissent STRICTEMENT le critère.",
    input_schema: {
      type: "object",
      properties: {
        indices: {
          type: "array",
          items: { type: "integer" },
          description: "Indices [i] des éléments RETENUS. Tableau vide si aucun ne remplit le critère.",
        },
      },
      required: ["indices"],
      additionalProperties: false,
    },
  };
  const system = `Tu tries une liste d'éléments pour l'entreprise « ${opts.companyName} ». Ne RETIENS que ceux qui remplissent STRICTEMENT ce critère :\n${opts.criterion}\n\nDans le doute, N'EXCLUS (il vaut mieux rater un cas limite que déclencher une fausse alerte). Réponds UNIQUEMENT en appelant l'outil flag avec les indices retenus.`;
  try {
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: opts.model,
      max_tokens: 400,
      system,
      tools: [tool],
      tool_choice: { type: "tool", name: "flag" },
      messages: [{ role: "user", content: `Liste à trier :\n${list}` }],
    });
    const block = msg.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") return null;
    const raw = (block.input as { indices?: unknown }).indices;
    const keep = new Set(
      (Array.isArray(raw) ? raw : [])
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && n >= 0 && n < opts.matches.length)
    );
    return {
      kept: opts.matches.filter((_, i) => keep.has(i)),
      usage: { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens },
    };
  } catch {
    return null;
  }
}

/** Génère le compte-rendu HTML d'une visite terminée (document A4 rangeable en bibliothèque). */
async function composeCompteRendu(opts: {
  model: string;
  companyName: string;
  match: WatcherMatch;
}): Promise<{ title: string; html: string; usage: { inputTokens: number; outputTokens: number } } | null> {
  const hasKey = !!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY.startsWith("your_");
  if (!hasKey) return null;
  const r = opts.match.raw ?? {};
  const line = (label: string, v: unknown) => (v != null && String(v).trim() !== "" ? `${label} : ${String(v).trim()}` : "");
  const dataBlock = [
    `Entreprise émettrice : ${opts.companyName}`,
    line("Type d'intervention", r.type),
    line("Chantier", r.chantier_nom),
    line("Adresse", r.chantier_adresse),
    line("Client", r.client_nom),
    line("Intervenant", r.employee_nom),
    line("Date de la visite", r.date_reelle),
    line("Durée (h)", r.duree_heures),
    line("Description de l'intervention", r.description),
    line("Notes de l'intervenant sur place", r.rapport),
  ]
    .filter(Boolean)
    .join("\n");

  const system = buildDocumentSystemPrompt({
    sources: `# DONNÉES DE LA VISITE (SEULE SOURCE DE VÉRITÉ — n'invente rien au-delà)\n${dataBlock}`,
  });
  try {
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: opts.model,
      max_tokens: 3200,
      system,
      messages: [
        {
          role: "user",
          content:
            "Rédige un COMPTE-RENDU DE VISITE DE CHANTIER professionnel à partir des données ci-dessus. Sections : en-tête entreprise + date ; titre « Compte-rendu de visite » ; contexte (chantier, client, intervenant) ; travaux réalisés / constatations ; observations et points de vigilance ; suites à donner. Prévois un pavé de signature (le client). N'invente aucun fait absent des données. Réponds UNIQUEMENT avec le HTML complet.",
        },
      ],
    });
    const html = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    if (!html.includes("<")) return null;
    const titleMatch = html.match(/<title>([^<]{2,120})<\/title>/i);
    const title = (titleMatch
      ? titleMatch[1].trim()
      : `Compte-rendu — ${String(r.chantier_nom || r.type || "visite")}${r.date_reelle ? ` (${String(r.date_reelle)})` : ""}`
    ).slice(0, 120);
    return {
      title,
      html: injectDocumentRuntime(html),
      usage: { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens },
    };
  } catch {
    return null;
  }
}

/**
 * ACT sur UNE fiche déclenchante : l'agent RÉALISE la mission dans le workspace
 * (crée/met à jour des fiches via les outils workspace_*), à partir des données
 * réelles de la fiche déclenchante, puis rend compte. Ne SUPPRIME jamais (agent
 * autonome). Une boucle agentique bornée par fiche. Retourne le compte-rendu +
 * les écritures effectuées (traces) pour le journal et la notification.
 */
async function composeAct(opts: {
  model: string;
  companyName: string;
  db: SupabaseClient;
  tenantId: string;
  userId: string | null;
  fromEmail: string | null;
  agentTitle: string;
  instruction: string;
  watcher: WatcherDef;
  match: WatcherMatch;
  allowEmail: boolean;
}): Promise<{ summary: string; traces: ToolTrace[]; usage: { inputTokens: number; outputTokens: number } } | null> {
  const hasKey = !!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY.startsWith("your_");
  if (!hasKey) return null;

  const m = opts.match;
  const ficheLine = m.entity
    ? `FICHE DÉCLENCHANTE : ${m.label} — entité \`${m.entity}\`, id \`${m.ficheId}\` (relis-la avec workspace_get si besoin).`
    : `FICHE DÉCLENCHANTE : ${m.label}.`;
  const rawBlock =
    m.raw && Object.keys(m.raw).length ? `\nDONNÉES DE LA FICHE :\n${JSON.stringify(m.raw).slice(0, 1500)}` : "";

  const system = `Tu es un agent autonome de Biltia, l'OS opérationnel du BTP. Un DÉCLENCHEUR vient de se produire (${opts.watcher.watching}) et tu dois RÉALISER la mission confiée, dans le workspace de « ${opts.companyName} ».

MISSION : « ${opts.instruction} »

${ficheLine}
DÉTAIL : ${m.detail}.${rawBlock}

RÈGLES (comme un employé consciencieux) :
- Tu AGIS vraiment : crée / mets à jour les fiches nécessaires via les outils workspace_* (à partir des données ci-dessus + le workspace). Ne devine JAMAIS un id : cherche la fiche liée (workspace_list) avant de la référencer.
- CRÉER ≠ INVENTER : n'invente AUCUN montant, prix, date ni coordonnée absent. S'il manque des éléments pour une fiche complète (ex : les prix/lignes d'un devis, le chantier de rattachement), crée quand même un BROUILLON (statut « brouillon » quand il existe) avec ce que tu sais, et LISTE précisément ce qui reste à compléter.
- Évite les doublons : si la fiche à créer semble déjà exister (même client/chantier/numéro), ne la recrée pas — mets-la à jour ou signale-le.
- Tu ne SUPPRIMES jamais une fiche.

${buildWorkspaceToolsSystem()}

Quand c'est fait, TERMINE en appelant l'outil compose : subject = titre court, body = COMPTE-RENDU de CE QUE TU AS FAIT (fiches créées/mises à jour) + ce qui reste à compléter. Français, factuel, sans placeholder.`;

  try {
    const loop = await runAgentLoop({
      model: opts.model,
      system,
      userMessage: "Réalise la mission sur cette fiche déclenchante.",
      db: opts.db,
      actor: {
        tenantId: opts.tenantId,
        userId: opts.userId,
        label: `Agent « ${opts.agentTitle} »`,
        fromEmail: opts.fromEmail,
      },
      finishTool: COMPOSE_TOOL,
      allowEmail: opts.allowEmail,
      allowSms: false,
      allowDelete: false, // agent autonome : création/màj seulement, jamais de suppression
      maxIterations: 10,
      maxTokens: 1500,
      maxDestructiveWrites: 8, // filet anti-emballement sur les mises à jour
    });
    const i = (loop.finishInput ?? {}) as { subject?: string; body?: string };
    const composed = [i.subject, i.body].filter(Boolean).join(" — ");
    // Compte-rendu du modèle sinon, à défaut, la liste des écritures effectuées.
    const summary =
      composed || (loop.traces.length ? loop.traces.map((t) => t.description).join(" · ") : "");
    if (!summary && loop.traces.length === 0) return null;
    return { summary: summary.slice(0, 800), traces: loop.traces, usage: loop.usage };
  } catch {
    return null;
  }
}

/** Planning à transmettre : agenda Google du patron si dispo, sinon repli workspace. Vide → { text:"" }. */
async function buildTeamPlanning(
  admin: SupabaseClient,
  tenantId: string,
  userId: string | null,
  days: number
): Promise<{ text: string; source: string }> {
  if (userId) {
    const cal = await readTeamAgenda({ tenantId, userId, days }).catch(() => null);
    if (cal && cal.ok && cal.text.trim()) return { text: cal.text, source: "agenda" };
  }
  const ws = await buildWorkspacePlanning(admin, tenantId, days).catch(() => "");
  if (ws.trim()) return { text: ws, source: "workspace" };
  return { text: "", source: "" };
}

/** Repli workspace : interventions planifiées + tâches à échéance dans la fenêtre. */
async function buildWorkspacePlanning(admin: SupabaseClient, tenantId: string, days: number): Promise<string> {
  const nowIso = new Date().toISOString();
  const todayIso = nowIso.slice(0, 10);
  const horizonIso = new Date(Date.now() + Math.max(1, days) * 86_400_000).toISOString();
  const [{ data: ivs }, { data: tks }] = await Promise.all([
    admin
      .from("interventions")
      .select("type, date_prevue, statut")
      .eq("tenant_id", tenantId)
      .in("statut", ["planifie", "en_cours"])
      .gte("date_prevue", nowIso)
      .lte("date_prevue", horizonIso)
      .order("date_prevue", { ascending: true })
      .limit(60),
    admin
      .from("tasks")
      .select("title, due_date, status")
      .eq("tenant_id", tenantId)
      .neq("status", "done")
      .gte("due_date", todayIso)
      .lte("due_date", horizonIso.slice(0, 10))
      .order("due_date", { ascending: true })
      .limit(60),
  ]);
  const lines: string[] = [];
  for (const iv of (ivs ?? []) as { type: string | null; date_prevue: string | null }[]) {
    const d = iv.date_prevue
      ? new Date(iv.date_prevue).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })
      : "";
    lines.push(`- ${d ? `${d} · ` : ""}${iv.type ?? "Intervention"}`);
  }
  for (const t of (tks ?? []) as { title: string | null; due_date: string | null }[]) {
    const d = t.due_date
      ? new Date(`${t.due_date}T00:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })
      : "";
    lines.push(`- ${d ? `${d} · ` : ""}${t.title ?? "Tâche"} (à faire)`);
  }
  return lines.join("\n");
}

/**
 * Exécute UN scan d'un agent-ÉVÉNEMENT : évalue le veilleur, RÉSERVE les fiches
 * nouvellement concernées (idempotence par fiche via agent_event_fires), puis
 * agit — compte-rendu, relance email par client OU alerte digest au patron.
 * Ne throw jamais. `runKey` = le créneau de scan (idempotence du passage).
 */
async function executeEventRule(
  admin: SupabaseClient,
  rule: AgentRuleRow,
  runKey: string
): Promise<RunOutcome> {
  // Verrou du SCAN (un même créneau ne scanne qu'une fois, même si le cron rejoue).
  const { data: run, error: lockErr } = await admin
    .from("agent_runs")
    .insert({ rule_id: rule.id, tenant_id: rule.tenant_id, run_key: runKey, status: "running" })
    .select("id")
    .single();
  if (lockErr || !run) return { status: "skipped", summary: "scan déjà exécuté (idempotence)" };

  const cadence = Math.min(1440, Math.max(5, Number(rule.trigger?.scanEveryMinutes) || 60));

  const finishRun = async (
    status: "success" | "blocked" | "failed",
    summary: string,
    output: Record<string, unknown> = {},
    error: string | null = null
  ) => {
    await admin
      .from("agent_runs")
      .update({ status, summary: summary.slice(0, 500), output, error, finished_at: new Date().toISOString() })
      .eq("id", run.id);
  };
  const reschedule = async (block?: string) => {
    const next = block ? null : new Date(Date.now() + cadence * 60_000);
    await admin
      .from("agent_rules")
      .update({
        last_run_at: new Date().toISOString(),
        next_run_at: next ? next.toISOString() : null,
        ...(block ? { status: "blocked", blocked_reason: block } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", rule.id);
  };
  const notifyOwner = async (title: string, body: string, url = "/agents") => {
    if (rule.created_by) await sendPushToUser(rule.created_by, { title, body, url, tag: `agent-${rule.id}` });
  };
  const releaseFire = async (m: WatcherMatch, watcher: WatcherDef) => {
    await admin
      .from("agent_event_fires")
      .delete()
      .eq("rule_id", rule.id)
      .eq("fire_key", buildFireKey(watcher, m));
  };

  try {
    const watcher = getWatcher(rule.trigger?.watcher);
    if (!watcher) {
      await finishRun("failed", "Veilleur inconnu — surveillance suspendue.");
      await reschedule("veilleur inconnu (mise à jour de Biltia requise)");
      return { status: "failed", summary: "veilleur inconnu" };
    }
    const action = rule.action;
    const execModel = pickExecModel(action);
    const days = Number(rule.trigger?.params?.days) || watcher.defaultDays;

    // 1) Évaluer la condition (lecture seule, tenant-scopée).
    const matches = await watcher.run(admin, rule.tenant_id, days).catch(() => [] as WatcherMatch[]);

    // 2) Réserver les fiches NOUVELLES : l'insert dans agent_event_fires échoue
    //    (UNIQUE) si la fiche a déjà déclenché → on ne la retraite pas.
    let fresh: WatcherMatch[] = [];
    for (const m of matches) {
      const { error } = await admin.from("agent_event_fires").insert({
        rule_id: rule.id,
        tenant_id: rule.tenant_id,
        fire_key: buildFireKey(watcher, m),
        label: m.label.slice(0, 120),
      });
      if (!error) fresh.push(m);
    }

    if (fresh.length === 0) {
      await finishRun("success", `Rien de nouveau (${watcher.watching}).`);
      await reschedule();
      return { status: "success", summary: "rien de nouveau" };
    }

    // Email du créateur (reply-to + exemption fondateur) + nom d'entreprise.
    let creatorEmail: string | null = null;
    if (rule.created_by) {
      try {
        const { data } = await admin.auth.admin.getUserById(rule.created_by);
        creatorEmail = data.user?.email ?? null;
      } catch {
        // sans email : pas de reply-to, débit normal
      }
    }
    const founder = isFounderEmail(creatorEmail);
    const { data: tenantRow } = await admin.from("tenants").select("name").eq("id", rule.tenant_id).single();
    const companyName = tenantRow?.name ?? "l'entreprise";

    // ── PLAN : « le Free goûte, le Pro exécute ». Un agent qui AGIT (relance email,
    //    compte-rendu) est réservé à Pro ; l'alerte patron (notify/digest) reste
    //    gratuite pour tous. Fondateur exempté. Filet pour une rétrogradation
    //    Pro→Free avec un agent-action resté actif (l'activation le bloque déjà). ──
    if (!founder && (action.type === "send_email" || action.type === "compte_rendu" || action.type === "act")) {
      const ent = await getEntitlementsForTenant(admin, rule.tenant_id);
      if (ent.plan !== "pro") {
        for (const m of fresh) await releaseFire(m, watcher);
        const reason = "action réservée au plan Pro — repassez à Pro pour que cet agent agisse";
        await finishRun("blocked", `Agent Pro requis : ${fresh.length} fiche(s) en attente.`, {
          deferred: fresh.length,
        });
        await reschedule(reason);
        await notifyOwner(
          "Agent en pause : réservé au plan Pro",
          `« ${rule.title} » agit à votre place (envoi / compte-rendu) — réservé au plan Pro. Repassez à Pro pour le réactiver.`,
          "/tarifs"
        );
        return { status: "blocked", summary: reason };
      }
    }

    // ── GARDE-FOUS DE COÛT PAR AGENT (levier 1 : budget mensuel · levier 4 :
    //    plafond quotidien). Ne concernent que les actions PAYANTES : le digest
    //    (notify, gabarit) est gratuit et n'est jamais bridé. Fondateur exempté.
    //    Mensuel atteint → PAUSE (+ notif). Quotidien atteint → fiches reportées
    //    à demain (pas de pause). On relâche les réservations pour qu'elles
    //    repartent « fraîches » au passage qui les traitera. ────────────────────
    const needsJudge = !!watcher.aiJudge;
    const paidAction = action.type === "compte_rendu" || action.type === "send_email" || action.type === "act" || needsJudge;
    if (!founder && paidAction) {
      const monthlyBudget = Number(rule.monthly_credit_budget) || 0; // 0 = illimité
      const dailyBudget = Number(rule.daily_credit_budget) || 0;
      if (monthlyBudget > 0 || dailyBudget > 0) {
        const spend = await ruleSpend(admin, rule.id);
        if (monthlyBudget > 0 && spend.month >= monthlyBudget) {
          for (const m of fresh) await releaseFire(m, watcher);
          const reason = `budget mensuel atteint (${spend.month}/${monthlyBudget} crédits) — reprise le mois prochain ou après relèvement du plafond`;
          await finishRun("blocked", `Budget mensuel atteint : ${fresh.length} fiche(s) en attente.`, {
            deferred: fresh.length,
            spent_month: spend.month,
            monthly_budget: monthlyBudget,
          });
          await reschedule(reason);
          await notifyOwner(
            "Agent en pause : budget mensuel atteint",
            `« ${rule.title} » a atteint son plafond de ${monthlyBudget} crédits ce mois-ci. Relevez-le pour reprendre.`
          );
          return { status: "blocked", summary: reason };
        }
        if (dailyBudget > 0 && spend.today >= dailyBudget) {
          for (const m of fresh) await releaseFire(m, watcher);
          await finishRun(
            "success",
            `Plafond quotidien atteint (${spend.today}/${dailyBudget} crédits) : ${fresh.length} fiche(s) reportée(s) à demain.`,
            { deferred: fresh.length, spent_today: spend.today, daily_budget: dailyBudget }
          );
          // Reporter au lendemain (≈ 00:05 UTC) plutôt qu'à la cadence : évite de
          // re-scanner en boucle jusqu'à minuit. Le budget du jour se remet à zéro
          // au changement de date, l'agent repart alors normalement.
          const n = new Date();
          const tomorrow = new Date(
            Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1, 0, 5, 0)
          );
          await admin
            .from("agent_rules")
            .update({
              last_run_at: n.toISOString(),
              next_run_at: tomorrow.toISOString(),
              updated_at: n.toISOString(),
            })
            .eq("id", rule.id);
          return { status: "success", summary: "plafond quotidien atteint — reporté à demain" };
        }
      }
    }

    // ── 3·0) JUGEMENT IA (« l'IA lit et juge ») : réduire les candidats à ceux
    //    qui remplissent VRAIMENT le critère en langage naturel (urgence…). Un
    //    appel IA borné, débité au coût réel. Les fiches écartées restent
    //    « consommées » (jugées une fois) → pas de re-paiement à chaque scan. ──
    if (needsJudge && watcher.aiJudge) {
      const judged = await judgeMatches({
        model: TIER_SIMPLE, // classer « urgent ou pas » = tâche simple → Haiku
        criterion: watcher.aiJudge.criterion,
        companyName,
        matches: fresh,
      });
      // IA indisponible → on n'affirme rien : relâcher pour re-juger plus tard.
      if (!judged) {
        for (const m of fresh) await releaseFire(m, watcher);
        await admin.from("agent_runs").update({ credits_used: 0 }).eq("id", run.id);
        await finishRun("success", "Examen indisponible — nouvel essai au prochain passage.");
        await reschedule();
        return { status: "success", summary: "jugement reporté" };
      }
      // Débit du jugement (fondateur exempté). Solde épuisé → pause + notif.
      let judgeCredits = 0;
      if (rule.created_by && judged.usage.inputTokens + judged.usage.outputTokens > 0) {
        try {
          const tracked = await trackAiUsage({
            supabase: admin,
            userId: rule.created_by,
            tenantId: rule.tenant_id,
            action: "agent_run",
            model: TIER_SIMPLE,
            inputTokens: judged.usage.inputTokens,
            outputTokens: judged.usage.outputTokens,
          });
          if (!founder) {
            const { data: debited } = await admin.rpc("deduct_credits_for_user", {
              p_user_id: rule.created_by,
              p_amount: tracked,
            });
            if (debited) {
              judgeCredits = tracked;
            } else {
              await admin.from("agent_runs").update({ credits_used: 0 }).eq("id", run.id);
              const reason = "crédits épuisés — rechargez puis relancez l'agent";
              await finishRun("blocked", `Examen effectué ; ${reason} — agent en pause.`);
              await reschedule(reason);
              await notifyOwner("Agent en pause : crédits épuisés", `« ${rule.title} » : ${reason}. Passez à un plan supérieur pour qu'il reprenne aussitôt.`, "/tarifs");
              return { status: "blocked", summary: "crédits épuisés" };
            }
          }
        } catch {
          // metering non bloquant
        }
      }
      await admin.from("agent_runs").update({ credits_used: judgeCredits }).eq("id", run.id);

      // Ne conserver que les fiches retenues par l'IA (les autres restent réservées).
      fresh = judged.kept;
      if (fresh.length === 0) {
        await finishRun("success", `Rien à signaler (${watcher.watching}).`);
        await reschedule();
        return { status: "success", summary: "rien retenu" };
      }

      // Digest patron sur les fiches RETENUES (le jugement est déjà débité, le
      // digest lui-même est gratuit → on ne re-touche pas credits_used).
      const shown = fresh.slice(0, 20);
      const lines = shown.map((m) => `• ${m.label} — ${m.detail}`).join("\n");
      const more = fresh.length > shown.length ? `\n… +${fresh.length - shown.length} autres` : "";
      const subject = `${watcher.label} : ${fresh.length} à traiter`;
      const body = `${fresh.length > 1 ? `${fresh.length} demandes nécessitent` : "1 demande nécessite"} votre attention.\n\n${lines}${more}`;
      await finishRun("success", `${subject}.`, { subject, body, matches: shown.map((m) => m.label) });
      await reschedule();
      await notifyOwner(subject, body.slice(0, 240));
      await logActivity(admin, {
        tenantId: rule.tenant_id,
        userId: rule.created_by ?? undefined,
        action: "document",
        entityType: "agent",
        description: `Agent « ${rule.title} » — ${subject}`,
      });
      return { status: "success", summary: subject };
    }

    // ── 3a-bis) COMPTE-RENDU : un document par visite terminée, rangé dans la
    //    bibliothèque (modules) + notification au patron. ──────────────────────
    if (action.type === "compte_rendu") {
      if (!rule.created_by) {
        await finishRun("failed", "Compte-rendu impossible : créateur inconnu.");
        await reschedule();
        return { status: "failed", summary: "créateur inconnu" };
      }
      const CAP = 3; // génération de document = lourde → borne stricte par passage
      const batch = fresh.slice(0, CAP);
      const deferred = fresh.slice(CAP);
      for (const m of deferred) await releaseFire(m, watcher);

      let made = 0;
      let inTok = 0;
      let outTok = 0;
      const okLabels: string[] = [];
      for (const m of batch) {
        const doc = await composeCompteRendu({ model: execModel, companyName, match: m });
        if (!doc) {
          await releaseFire(m, watcher);
          continue;
        }
        inTok += doc.usage.inputTokens;
        outTok += doc.usage.outputTokens;
        const { error: insErr } = await admin.from("modules").insert({
          tenant_id: rule.tenant_id,
          user_id: rule.created_by,
          created_by: rule.created_by,
          name: doc.title,
          description: `Compte-rendu généré par l'agent « ${rule.title} »`,
          html_content: doc.html,
          kind: "document",
          format: "document",
        });
        if (insErr) {
          await releaseFire(m, watcher);
          continue;
        }
        made++;
        okLabels.push(m.label);
        await logActivity(admin, {
          tenantId: rule.tenant_id,
          userId: rule.created_by ?? undefined,
          action: "document",
          entityType: "agent",
          description: `Agent « ${rule.title} » — compte-rendu généré : ${m.label}`,
        });
      }

      // Débit au coût réel (génération ~medium) — fondateur exempté.
      let creditsUsed = 0;
      if (inTok + outTok > 0) {
        try {
          const tracked = await trackAiUsage({
            supabase: admin,
            userId: rule.created_by,
            tenantId: rule.tenant_id,
            action: "agent_run",
            model: execModel,
            inputTokens: inTok,
            outputTokens: outTok,
          });
          if (!founder) {
            const { data: debited } = await admin.rpc("deduct_credits_for_user", {
              p_user_id: rule.created_by,
              p_amount: tracked,
            });
            if (debited) {
              creditsUsed = tracked;
            } else {
              await admin.from("agent_runs").update({ credits_used: 0 }).eq("id", run.id);
              const reason = "crédits épuisés — rechargez puis relancez l'agent";
              await finishRun("blocked", `${made} compte(s)-rendu générés ; ${reason} — agent en pause.`, { made: okLabels });
              await reschedule(reason);
              await notifyOwner("Agent en pause : crédits épuisés", `« ${rule.title} » : ${reason}. Passez à un plan supérieur pour qu'il reprenne aussitôt.`, "/tarifs");
              return { status: "blocked", summary: `${made} générés, crédits épuisés` };
            }
          }
        } catch {
          // metering non bloquant
        }
      }
      await admin.from("agent_runs").update({ credits_used: creditsUsed }).eq("id", run.id);

      const parts: string[] = [];
      if (made) parts.push(`${made} compte(s)-rendu prêt(s) : ${okLabels.join(", ")}`);
      if (deferred.length) parts.push(`${deferred.length} au prochain passage`);
      const summary = parts.join(" · ") || "aucun compte-rendu généré";
      await finishRun("success", summary, { made: okLabels, deferred: deferred.length });
      await reschedule();
      if (made) await notifyOwner(`${made} compte(s)-rendu prêt(s)`, `${okLabels.join(", ")} — dans votre Bibliothèque.`);
      return { status: "success", summary };
    }

    // ── 3a-ter) ACT : RÉALISER une action dans le workspace (créer/mettre à jour)
    //    pour chaque fiche déclenchante, via la boucle agentique. L'agent AGIT à
    //    partir des données réelles puis rend compte au patron. ──────────────────
    if (action.type === "act") {
      if (!rule.created_by) {
        await finishRun("failed", "Action impossible : créateur inconnu.");
        await reschedule();
        return { status: "failed", summary: "créateur inconnu" };
      }
      const CAP = 4; // écriture agentique = lourde → borne stricte par passage
      const batch = fresh.slice(0, CAP);
      const deferred = fresh.slice(CAP);
      for (const m of deferred) await releaseFire(m, watcher);

      // Un act peut aussi ENVOYER si un canal existe (« crée le devis ET envoie-le »).
      const channels = await canSendOutbound(rule.tenant_id, rule.created_by);

      let done = 0;
      let inTok = 0;
      let outTok = 0;
      const okLabels: string[] = [];
      const reports: string[] = [];
      const allTraces: ToolTrace[] = [];
      for (const m of batch) {
        const res = await composeAct({
          model: execModel,
          companyName,
          db: admin,
          tenantId: rule.tenant_id,
          userId: rule.created_by,
          fromEmail: creatorEmail,
          agentTitle: rule.title,
          instruction: action.contentInstruction || rule.instruction,
          watcher,
          match: m,
          allowEmail: channels.ok,
        });
        if (!res) {
          await releaseFire(m, watcher);
          continue;
        }
        inTok += res.usage.inputTokens;
        outTok += res.usage.outputTokens;
        done++;
        okLabels.push(m.label);
        reports.push(`${m.label} → ${res.summary}`);
        allTraces.push(...res.traces);
        await logActivity(admin, {
          tenantId: rule.tenant_id,
          userId: rule.created_by ?? undefined,
          action: "create",
          entityType: "agent",
          description: `Agent « ${rule.title} » — action réalisée : ${m.label}`,
        });
      }

      // Débit au coût réel (fondateur exempté) — même logique que le compte-rendu.
      let creditsUsed = 0;
      if (inTok + outTok > 0) {
        try {
          const tracked = await trackAiUsage({
            supabase: admin,
            userId: rule.created_by,
            tenantId: rule.tenant_id,
            action: "agent_run",
            model: execModel,
            inputTokens: inTok,
            outputTokens: outTok,
          });
          if (!founder) {
            const { data: debited } = await admin.rpc("deduct_credits_for_user", {
              p_user_id: rule.created_by,
              p_amount: tracked,
            });
            if (debited) {
              creditsUsed = tracked;
            } else {
              await admin.from("agent_runs").update({ credits_used: 0 }).eq("id", run.id);
              const reason = "crédits épuisés — rechargez puis relancez l'agent";
              await finishRun("blocked", `${done} action(s) réalisée(s) ; ${reason} — agent en pause.`, { made: okLabels });
              await reschedule(reason);
              await notifyOwner("Agent en pause : crédits épuisés", `« ${rule.title} » : ${reason}. Passez à un plan supérieur pour qu'il reprenne aussitôt.`, "/tarifs");
              return { status: "blocked", summary: `${done} réalisée(s), crédits épuisés` };
            }
          }
        } catch {
          // metering non bloquant
        }
      }
      await admin.from("agent_runs").update({ credits_used: creditsUsed }).eq("id", run.id);

      const parts: string[] = [];
      if (done) parts.push(`${done} action(s) réalisée(s) : ${okLabels.join(", ")}`);
      if (deferred.length) parts.push(`${deferred.length} au prochain passage`);
      const summary = parts.join(" · ") || "aucune action réalisée";
      await finishRun("success", summary, { done: okLabels, reports, workspace_actions: allTraces, deferred: deferred.length });
      await reschedule();
      if (done) await notifyOwner(`${watcher.label} : ${done} action(s) réalisée(s)`, reports.join("\n").slice(0, 240));
      return { status: "success", summary };
    }

    // ── 3a) RELANCE CLIENT (un email par fiche, borné par tick). ─────────────
    if (action.type === "send_email") {
      const withEmail = fresh.filter((m) => m.email && m.email.includes("@"));
      const withoutEmail = fresh.filter((m) => !(m.email && m.email.includes("@")));
      // Sans email : on relâche la réservation (relançable si l'email est ajouté).
      for (const m of withoutEmail) await releaseFire(m, watcher);

      const channels = await canSendOutbound(rule.tenant_id, rule.created_by);
      if (!channels.ok) {
        for (const m of withEmail) await releaseFire(m, watcher);
        const reason = "aucun canal d'envoi : connectez votre Gmail ou configurez l'envoi Biltia";
        await finishRun("blocked", `Relances suspendues : ${reason}.`);
        await reschedule(reason);
        await notifyOwner("Agent bloqué", `« ${rule.title} » : ${reason}.`);
        return { status: "blocked", summary: reason };
      }

      const CAP = 6; // borne par passage : le reste repart au prochain scan
      const batch = withEmail.slice(0, CAP);
      const deferred = withEmail.slice(CAP);
      for (const m of deferred) await releaseFire(m, watcher);

      // Levier 3 : une relance est un email court et cadré → Haiku suffit (÷5 sur
      // le coût vs Sonnet), sur le poste le plus fréquent. Les comptes-rendus
      // (plus riches, plus rares) restent, eux, sur execModel (Sonnet).
      const relanceModel = TIER_SIMPLE;

      // ESCALADE (demande user) : le NIVEAU de relance d'une fiche = le nombre de
      // déclenchements déjà enregistrés pour elle. On charge toutes les clés de
      // tir de la règle UNE fois (le tir courant est déjà réservé), puis on compte
      // par fiche → ton doux (1) → ferme (3+). startsWith évite les pièges LIKE.
      const { data: firesData } = await admin
        .from("agent_event_fires")
        .select("fire_key")
        .eq("rule_id", rule.id);
      const allFireKeys = (firesData ?? []).map((f) => String((f as { fire_key: string }).fire_key));

      let sent = 0;
      let held = 0; // relances préparées, mises en attente de validation (outbox)
      let inTok = 0;
      let outTok = 0;
      const okLabels: string[] = [];
      const heldLabels: string[] = [];
      // Mode brouillon (#67) : tout est soumis à validation. Sinon, seule une
      // relance devenue FERME (#70, niveau ≥ 3) est retenue pour validation.
      const draftMode = action.approval === "always";
      // Veilleur orienté fournisseur → ton NEUTRE (chasse de livraison/attestation),
      // jamais le registre « recouvrement » réservé aux impayés client.
      const audience: "client" | "supplier" = isSupplierRelanceWatcher(watcher.key) ? "supplier" : "client";
      for (const m of batch) {
        const firePrefix = `${watcher.key}:${m.ficheId}:`;
        const relanceLevel = Math.max(1, allFireKeys.filter((k) => k.startsWith(firePrefix)).length);
        const composed = await composeRelance({
          model: relanceModel,
          companyName,
          watcher,
          match: m,
          instruction: action.contentInstruction,
          relanceLevel,
          audience,
        });
        if (!composed) {
          await releaseFire(m, watcher);
          continue;
        }
        inTok += composed.usage.inputTokens;
        outTok += composed.usage.outputTokens;

        // RETENIR pour validation ? (brouillon systématique, ou relance sensible).
        if (draftMode || relanceLevel >= FIRM_RELANCE_LEVEL) {
          const { error: outErr } = await admin.from("agent_outbox").insert({
            tenant_id: rule.tenant_id,
            rule_id: rule.id,
            created_by: rule.created_by,
            fiche_id: m.ficheId,
            fiche_label: m.label.slice(0, 200),
            kind: "relance",
            level: relanceLevel,
            to_email: m.email as string,
            subject: composed.subject,
            body: composed.body,
            status: "pending",
          });
          // Table absente (pré-déploiement) ou erreur : on relâche → nouvel essai.
          if (outErr) {
            await releaseFire(m, watcher);
            continue;
          }
          held++;
          heldLabels.push(m.label);
          await logActivity(admin, {
            tenantId: rule.tenant_id,
            userId: rule.created_by ?? undefined,
            action: "document",
            entityType: "agent",
            description: `Agent « ${rule.title} » — relance ${relanceLevel >= FIRM_RELANCE_LEVEL ? "ferme " : ""}préparée (à valider) : ${m.label}`,
          });
          continue;
        }

        const res = await sendOutboundEmail({
          tenantId: rule.tenant_id,
          userId: rule.created_by,
          fromEmail: creatorEmail,
          to: [m.email as string],
          subject: composed.subject,
          body: composed.body,
        });
        if (!res.ok) {
          await releaseFire(m, watcher);
          continue;
        }
        sent++;
        okLabels.push(m.label);
        await logActivity(admin, {
          tenantId: rule.tenant_id,
          userId: rule.created_by ?? undefined,
          action: "send",
          entityType: "agent",
          description: `Agent « ${rule.title} » — relance envoyée : ${m.label}`,
        });
      }

      // Débit au coût réel des rédactions (fondateur exempté).
      let creditsUsed = 0;
      if (rule.created_by && inTok + outTok > 0) {
        try {
          const tracked = await trackAiUsage({
            supabase: admin,
            userId: rule.created_by,
            tenantId: rule.tenant_id,
            action: "agent_run",
            model: relanceModel,
            inputTokens: inTok,
            outputTokens: outTok,
          });
          if (!founder) {
            const { data: debited } = await admin.rpc("deduct_credits_for_user", {
              p_user_id: rule.created_by,
              p_amount: tracked,
            });
            if (debited) {
              creditsUsed = tracked;
            } else {
              await admin.from("agent_runs").update({ credits_used: 0 }).eq("id", run.id);
              const reason = "crédits épuisés — rechargez puis relancez l'agent";
              await finishRun("blocked", `${sent} relance(s) envoyée(s) ; ${reason} — agent en pause.`, { sent: okLabels });
              await reschedule(reason);
              await notifyOwner("Agent en pause : crédits épuisés", `« ${rule.title} » : ${reason}. Passez à un plan supérieur pour qu'il reprenne aussitôt.`, "/tarifs");
              return { status: "blocked", summary: `${sent} envoyé(s), crédits épuisés` };
            }
          }
        } catch {
          // le metering ne casse jamais un envoi déjà réussi
        }
      }
      await admin.from("agent_runs").update({ credits_used: creditsUsed }).eq("id", run.id);

      const parts: string[] = [];
      if (sent) parts.push(`${sent} relance(s) envoyée(s) : ${okLabels.join(", ")}`);
      if (held) parts.push(`${held} à valider : ${heldLabels.join(", ")}`);
      if (withoutEmail.length) parts.push(`${withoutEmail.length} sans email (à compléter)`);
      if (deferred.length) parts.push(`${deferred.length} au prochain passage`);
      const summary = parts.join(" · ") || "aucune relance envoyée";
      await finishRun("success", summary, {
        sent: okLabels,
        held: heldLabels,
        no_email: withoutEmail.map((m) => m.label),
        deferred: deferred.length,
      });
      await reschedule();
      // #70 : une relance EN ATTENTE prévient le patron AVANT l'envoi (à valider).
      if (held) {
        await notifyOwner(
          `${held} relance(s) à valider — ${watcher.label}`,
          `${heldLabels.join(", ")} : relance${held > 1 ? "s" : ""} préparée${held > 1 ? "s" : ""}, en attente de votre validation dans Agents.`
        );
      }
      if (sent) await notifyOwner(`${watcher.label} : ${sent} relance(s) envoyée(s)`, summary);
      return { status: "success", summary };
    }

    // ── 3b) ALERTE AU PATRON (digest par gabarit → 0 crédit IA). ─────────────
    const shown = fresh.slice(0, 20);
    const lines = shown.map((m) => `• ${m.label} — ${m.detail}`).join("\n");
    const more = fresh.length > shown.length ? `\n… +${fresh.length - shown.length} autres` : "";
    const subject = `${watcher.label} : ${fresh.length} à traiter`;
    const body = `${fresh.length > 1 ? `${fresh.length} fiches nécessitent` : "1 fiche nécessite"} votre attention.\n\n${lines}${more}`;
    await admin.from("agent_runs").update({ credits_used: 0 }).eq("id", run.id);
    await finishRun("success", `${subject}.`, { subject, body, matches: shown.map((m) => m.label) });
    await reschedule();
    await notifyOwner(subject, body.slice(0, 240));
    await logActivity(admin, {
      tenantId: rule.tenant_id,
      userId: rule.created_by ?? undefined,
      action: "document",
      entityType: "agent",
      description: `Agent « ${rule.title} » — ${subject}`,
    });
    return { status: "success", summary: subject };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "erreur inconnue";
    await finishRun("failed", "Scan en erreur — nouvelle tentative au prochain passage.", {}, msg.slice(0, 500));
    await reschedule();
    return { status: "failed", summary: msg };
  }
}

// ── Exécution d'une règle ────────────────────────────────────────────────────

/**
 * Exécute UN passage d'une règle. `runKey` identifie le créneau (idempotence).
 * Écrit toujours le journal et replanifie la règle. Ne throw jamais.
 */
export async function executeRule(
  admin: SupabaseClient,
  rule: AgentRuleRow,
  runKey: string
): Promise<RunOutcome> {
  // Agents-ÉVÉNEMENT : chemin dédié (surveille une condition, agit par fiche,
  // idempotence à la granularité de la fiche). Les agents PLANIFIÉS continuent ci-dessous.
  if (rule.trigger_type === "event") {
    return executeEventRule(admin, rule, runKey);
  }

  // ── VERROU IDEMPOTENT : l'insert échoue si le créneau est déjà consommé. ──
  const { data: run, error: lockErr } = await admin
    .from("agent_runs")
    .insert({ rule_id: rule.id, tenant_id: rule.tenant_id, run_key: runKey, status: "running" })
    .select("id")
    .single();
  if (lockErr || !run) {
    return { status: "skipped", summary: "créneau déjà exécuté (idempotence)" };
  }

  const finishRun = async (
    status: "success" | "blocked" | "failed",
    summary: string,
    output: Record<string, unknown> = {},
    error: string | null = null
  ) => {
    await admin
      .from("agent_runs")
      .update({ status, summary: summary.slice(0, 500), output, error, finished_at: new Date().toISOString() })
      .eq("id", run.id);
  };

  // Replanification systématique : même un passage raté ne fige pas l'agent —
  // sauf blocage explicite (info manquante), où l'on suspend en attendant l'info.
  const reschedule = async (block?: string) => {
    const next = block ? null : computeNextRun(rule.schedule);
    await admin
      .from("agent_rules")
      .update({
        last_run_at: new Date().toISOString(),
        next_run_at: next ? next.toISOString() : null,
        ...(block ? { status: "blocked", blocked_reason: block } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", rule.id);
  };

  const notifyOwner = async (title: string, body: string, url = "/agents") => {
    if (rule.created_by) {
      await sendPushToUser(rule.created_by, { title, body, url, tag: `agent-${rule.id}` });
    }
  };

  try {
    const action = rule.action;
    const execModel = pickExecModel(action);

    // Email du créateur : sert au reply-to (envois) ET à l'exemption fondateur.
    let creatorEmail: string | null = null;
    if (rule.created_by) {
      try {
        const { data: creator } = await admin.auth.admin.getUserById(rule.created_by);
        creatorEmail = creator.user?.email ?? null;
      } catch {
        // sans email : pas de reply-to, pas d'exemption — débit normal
      }
    }
    const founder = isFounderEmail(creatorEmail);

    // ── PLAN : « le Free goûte, le Pro exécute ». Un agent planifié qui AGIT
    //    (planning équipe, relance, rapport) est réservé à Pro ; l'alerte planifiée
    //    (notify) reste gratuite. Fondateur exempté. Filet anti-rétrogradation. ────
    if (!founder && action.type !== "notify") {
      const ent = await getEntitlementsForTenant(admin, rule.tenant_id);
      if (ent.plan !== "pro") {
        const reason = "action réservée au plan Pro — repassez à Pro pour réactiver cet agent";
        await finishRun("blocked", "Agent Pro requis : passage suspendu.");
        await reschedule(reason);
        await notifyOwner(
          "Agent en pause : réservé au plan Pro",
          `« ${rule.title} » agit à votre place — réservé au plan Pro. Repassez à Pro pour le réactiver.`,
          "/tarifs"
        );
        return { status: "blocked", summary: reason };
      }
      // Planning aux ÉQUIPES = collaboration → réservé au plan Équipe. Backstop
      // runtime (le recrutement le bloque déjà) : si le tenant n'est pas Équipe, on
      // suspend le passage plutôt que d'envoyer à l'équipe.
      if (action.type === "team_planning" && !ent.collaboration) {
        const reason = "planning équipe réservé au plan Équipe (collaboration)";
        await finishRun("blocked", "Plan Équipe requis : passage suspendu.");
        await reschedule(reason);
        await notifyOwner(
          "Agent en pause : plan Équipe requis",
          `« ${rule.title} » envoie le planning à votre équipe — réservé au plan Équipe. Ajoutez la collaboration (+50 €/mois) pour le réactiver.`,
          "/tarifs"
        );
        return { status: "blocked", summary: reason };
      }
    }

    // ── PLANNING AUX ÉQUIPES : récupérer le planning existant (agenda Google du
    //    patron, sinon workspace) et le TRANSMETTRE à l'équipe. Biltia relaie,
    //    n'invente pas. Gabarit → 0 crédit IA. ─────────────────────────────────
    if (action.type === "team_planning") {
      const teamEmails = (action.recipients ?? [])
        .map((r) => r.email)
        .filter((e) => e && e.includes("@")) as string[];
      if (teamEmails.length === 0) {
        const reason = "aucun employé avec email pour recevoir le planning";
        await finishRun("blocked", `Planning non transmis : ${reason}.`);
        await reschedule(reason);
        await notifyOwner("Agent bloqué", `« ${rule.title} » : ${reason}.`);
        return { status: "blocked", summary: reason };
      }
      const channels = await canSendOutbound(rule.tenant_id, rule.created_by);
      if (!channels.ok) {
        const reason = "aucun canal d'envoi : connectez votre Gmail ou configurez l'envoi Biltia";
        await finishRun("blocked", `Planning non transmis : ${reason}.`);
        await reschedule(reason);
        await notifyOwner("Agent bloqué", `« ${rule.title} » : ${reason}.`);
        return { status: "blocked", summary: reason };
      }
      const { data: tRow } = await admin.from("tenants").select("name").eq("id", rule.tenant_id).single();
      const companyName = tRow?.name ?? "l'entreprise";
      const planning = await buildTeamPlanning(admin, rule.tenant_id, rule.created_by, 7);
      if (!planning.text.trim()) {
        // Rien à transmettre : on prévient le patron, jamais un mail vide à l'équipe.
        await admin.from("agent_runs").update({ credits_used: 0 }).eq("id", run.id);
        await finishRun("success", "Rien de planifié sur la période — aucun planning envoyé.");
        await reschedule();
        await notifyOwner("Planning : rien à transmettre", "Aucun événement à venir à envoyer à l'équipe cette fois.");
        return { status: "success", summary: "rien à transmettre" };
      }
      const subject = `Votre planning des prochains jours — ${companyName}`;
      const body = `Bonjour,\n\nVoici le planning des prochains jours. Bon courage à toutes et tous.\n\n${planning.text}\n\n— ${companyName} (message automatique)`;
      const sent = await sendOutboundEmail({
        tenantId: rule.tenant_id,
        userId: rule.created_by,
        fromEmail: creatorEmail,
        to: teamEmails,
        subject,
        body,
      });
      if (!sent.ok) {
        await finishRun("blocked", `Envoi refusé : ${sent.reason}.`);
        await reschedule(sent.reason);
        await notifyOwner("Agent bloqué", `« ${rule.title} » : ${sent.reason}.`);
        return { status: "blocked", summary: sent.reason };
      }
      await admin.from("agent_runs").update({ credits_used: 0 }).eq("id", run.id);
      const src = planning.source === "agenda" ? "agenda Google" : "workspace";
      const summary = `Planning (${src}) transmis à ${teamEmails.length} membre(s) de l'équipe.`;
      await finishRun("success", summary, { subject, to: teamEmails, source: planning.source });
      await reschedule();
      await notifyOwner("Planning transmis à l'équipe", summary);
      await logActivity(admin, {
        tenantId: rule.tenant_id,
        userId: rule.created_by ?? undefined,
        action: "send",
        entityType: "agent",
        description: `Agent « ${rule.title} » — ${summary}`,
      });
      return { status: "success", summary };
    }

    // Envoi sortant : vérifier les MOYENS avant de rédiger (échec précoce et clair).
    // Un canal suffit : le Gmail connecté de l'utilisateur OU l'envoi Biltia (Resend).
    if (action.type === "send_email") {
      const channels = await canSendOutbound(rule.tenant_id, rule.created_by);
      if (!channels.ok) {
        const reason = "aucun canal d'envoi : connectez votre Gmail ou configurez l'envoi Biltia";
        await finishRun("blocked", `Passage suspendu : ${reason}.`);
        await reschedule(reason);
        await notifyOwner("Agent bloqué", `« ${rule.title} » : ${reason}.`);
        return { status: "blocked", summary: reason };
      }
      if (!action.recipients?.length) {
        const reason = "destinataire non résolu (email manquant ?)";
        await finishRun("blocked", `Passage suspendu : ${reason}.`);
        await reschedule(reason);
        await notifyOwner("Agent bloqué", `« ${rule.title} » : ${reason}.`);
        return { status: "blocked", summary: reason };
      }
    }

    // ── Contexte : le workspace est la mémoire de l'agent. ──────────────────
    const [ctx, focusData, tenantRow] = await Promise.all([
      getWorkspaceContext(admin, rule.tenant_id).catch(() => null),
      action.type === "report" ? fetchFocusData(admin, rule.tenant_id) : Promise.resolve(""),
      admin.from("tenants").select("name").eq("id", rule.tenant_id).single(),
    ]);
    const companyName = tenantRow.data?.name ?? "l'entreprise";

    // ── Exécution agentique du passage (accès workspace complet). ───────────
    const composed = await compose({
      mode:
        action.type === "send_email"
          ? "email"
          : action.type === "report"
            ? "report"
            : action.type === "act"
              ? "act"
              : "notify",
      model: execModel,
      instruction: action.contentInstruction || rule.instruction,
      recipientNames: (action.recipients ?? []).map((r) => r.name).join(", ") || "vous",
      companyName,
      workspaceBlock: buildWorkspaceBlock(ctx),
      extraData: focusData,
      db: admin,
      tenantId: rule.tenant_id,
      userId: rule.created_by,
      fromEmail: creatorEmail,
      // Envois en cours de route : uniquement pour les passages SANS email de
      // livraison (report/notify), sinon on doublonnerait l'envoi final. SMS
      // seulement si un fournisseur est configuré (sinon l'outil serait inutile).
      allowEmail: action.type !== "send_email",
      allowSms: action.type !== "send_email" && canSendSms(),
      agentTitle: rule.title,
    });
    if (!composed) {
      await finishRun("failed", "Rédaction impossible (IA indisponible) — nouveau passage au prochain créneau.");
      await reschedule();
      return { status: "failed", summary: "rédaction impossible" };
    }

    // ── DÉBIT ADAPTATIF (décision user 2026-07-05) : chaque passage est
    // journalisé (ai_usage) ET débité à son COÛT RÉEL — un rappel Haiku ≈ 5 cr,
    // une analyse Sonnet/Opus ≈ 20-65 cr. Fondateur : journalisé, jamais débité.
    // Solde insuffisant : le travail de CE passage est déjà livré (~qq centimes,
    // assumé) ; l'agent est mis en PAUSE pour la suite + notification — jamais
    // de solde négatif, jamais d'échec silencieux.
    let creditsUsed = 0;
    if (rule.created_by) {
      try {
        const tracked = await trackAiUsage({
          supabase: admin,
          userId: rule.created_by,
          tenantId: rule.tenant_id,
          action: "agent_run",
          model: execModel,
          inputTokens: composed.usage.inputTokens,
          outputTokens: composed.usage.outputTokens,
        });
        if (!founder) {
          const { data: debited } = await admin.rpc("deduct_credits_for_user", {
            p_user_id: rule.created_by,
            p_amount: tracked,
          });
          if (debited) {
            creditsUsed = tracked;
          } else {
            const reason = "crédits épuisés — rechargez puis relancez l'agent";
            const summary = `Passage effectué (${tracked} cr non débités, solde insuffisant) — agent mis en pause.`;
            await admin.from("agent_runs").update({ credits_used: 0 }).eq("id", run.id);
            await finishRun("blocked", summary, { subject: composed.subject });
            await reschedule(reason);
            await notifyOwner("Agent en pause : crédits épuisés", `« ${rule.title} » : ${reason}. Passez à un plan supérieur pour qu'il reprenne aussitôt.`, "/tarifs");
            return { status: "blocked", summary };
          }
        }
      } catch {
        // Le metering ne casse jamais un passage déjà réussi.
      }
    }
    // Trace le coût du passage dans son journal (visible dans /agents).
    await admin.from("agent_runs").update({ credits_used: creditsUsed }).eq("id", run.id);

    // ── Livraison. ───────────────────────────────────────────────────────────
    if (action.type === "send_email") {
      // CANAL AUTO : Gmail connecté de l'artisan si dispo (l'email part de SA
      // boîte, les réponses lui reviennent naturellement), sinon envoi Biltia
      // (Resend) avec reply-to = son email pour ne pas perdre les réponses.
      const sent = await sendOutboundEmail({
        tenantId: rule.tenant_id,
        userId: rule.created_by,
        fromEmail: creatorEmail,
        to: action.recipients.map((r) => r.email),
        subject: composed.subject,
        body: composed.body,
      });
      if (!sent.ok) {
        await finishRun("blocked", `Envoi refusé : ${sent.reason}.`, { subject: composed.subject });
        await reschedule(sent.reason);
        await notifyOwner("Agent bloqué", `« ${rule.title} » : ${sent.reason}.`);
        return { status: "blocked", summary: sent.reason };
      }
      const who = action.recipients.map((r) => r.name).join(", ");
      const channel = sent.via === "gmail" ? "depuis votre Gmail" : "via Biltia";
      const extra = composed.traces.length ? ` ${composed.traces.length} action(s) workspace.` : "";
      const summary = `Email « ${composed.subject} » envoyé à ${who} ${channel}.${extra}`;
      await finishRun("success", summary, {
        subject: composed.subject,
        body: composed.body,
        to: action.recipients.map((r) => r.email),
        email_id: sent.id,
        via: sent.via,
        workspace_actions: composed.traces,
      });
      await reschedule();
      await notifyOwner("Agent : envoi effectué", summary);
      await logActivity(admin, {
        tenantId: rule.tenant_id,
        userId: rule.created_by ?? undefined,
        action: "send",
        entityType: "agent",
        description: `Agent « ${rule.title} » — ${summary}`,
      });
      return { status: "success", summary };
    }

    // notify / report → notification push + journal (le corps complet vit dans
    // le journal, consultable dans /agents).
    const extra = composed.traces.length ? ` ${composed.traces.length} action(s) workspace.` : "";
    const summary =
      action.type === "report"
        ? `Contrôle effectué : ${composed.subject}${extra}`
        : action.type === "act"
          ? `Action effectuée : ${composed.subject}${extra}`
          : `Rappel envoyé : ${composed.subject}${extra}`;
    await finishRun("success", summary, {
      subject: composed.subject,
      body: composed.body,
      workspace_actions: composed.traces,
    });
    await reschedule();
    await notifyOwner(composed.subject, composed.body.slice(0, 240));
    await logActivity(admin, {
      tenantId: rule.tenant_id,
      userId: rule.created_by ?? undefined,
      action: "document",
      entityType: "agent",
      description: `Agent « ${rule.title} » — ${summary}`,
    });
    return { status: "success", summary };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "erreur inconnue";
    await finishRun("failed", "Passage en erreur — nouveau passage au prochain créneau.", {}, msg.slice(0, 500));
    await reschedule();
    return { status: "failed", summary: msg };
  }
}

/**
 * Balaye les règles dues (status active, next_run_at ≤ maintenant) et les
 * exécute. Appelé par le cron. Retourne un résumé lisible.
 */
export async function runDueRules(
  admin: SupabaseClient,
  limit = 20
): Promise<{ scanned: number; results: { ruleId: string; title: string; outcome: RunOutcome }[] }> {
  const { data } = await admin
    .from("agent_rules")
    .select("id, tenant_id, created_by, title, instruction, schedule, action, status, next_run_at, trigger_type, trigger, monthly_credit_budget, daily_credit_budget")
    .eq("status", "active")
    .lte("next_run_at", new Date().toISOString())
    .order("next_run_at", { ascending: true })
    .limit(limit);

  const rules = (data ?? []) as unknown as AgentRuleRow[];
  const results: { ruleId: string; title: string; outcome: RunOutcome }[] = [];

  for (const rule of rules) {
    // run_key = créneau planifié → un même créneau ne part jamais deux fois.
    const runKey = rule.next_run_at ?? new Date().toISOString();
    const outcome = await executeRule(admin, rule, runKey);
    results.push({ ruleId: rule.id, title: rule.title, outcome });
  }

  return { scanned: rules.length, results };
}
