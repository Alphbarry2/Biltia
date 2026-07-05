// ─────────────────────────────────────────────────────────────────────────────
// AGENT RULES — le primitif « RECRUTER » (vision créer + recruter, 2026-07-05).
//
// L'utilisateur dicte une règle permanente en langage courant (« relance le
// client Martin tous les jours à midi », « chaque soir à 18h vérifie les
// pointages ») ; ce fichier la transforme en règle STRUCTURÉE et exécutable :
//
//   • parseInstruction()  — Haiku (tool use forcé) extrait déclencheur + action,
//                           repli TOUJOURS propre sur une heuristique pure
//                           (motif exact de kind-router.ts / router.ts).
//   • resolveRecipients() — résolution d'entité contre le WORKSPACE (le vrai
//                           client, le vrai employé). L'agent ne devine JAMAIS :
//                           destinataire introuvable/ambigu/sans email → état
//                           « bloqué » avec la question précise à poser.
//   • computeNextRun()    — prochain passage en HEURE DE PARIS (l'artisan pense
//                           en heure locale, le serveur en UTC).
//   • createAgentRule()   — orchestre le tout et écrit la règle (RLS tenant).
//
// L'EXÉCUTION vit dans lib/agent-executor.ts (serveur/cron uniquement).
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

const PARSE_MODEL = "claude-haiku-4-5";
const PARIS_TZ = "Europe/Paris";

// ── Types ────────────────────────────────────────────────────────────────────

export type AgentActionType = "send_email" | "notify" | "report";
export type AgentRecipientKind = "client" | "employee" | "team" | "me";

export type AgentSchedule = {
  /** "HH:MM" heure de Paris. */
  time: string;
  /** Jours ISO 1 (lundi) → 7 (dimanche). Vide = tous les jours. */
  days: number[];
  tz: string;
};

export type AgentAction = {
  type: AgentActionType;
  recipientKind: AgentRecipientKind;
  /** Nom dicté (« Martin ») — résolu contre le workspace à la création. */
  recipientName: string;
  /** Destinataires résolus : [{ name, email, entity, id }]. */
  recipients: { name: string; email: string; entity: string; id: string }[];
  /** Ce que l'agent doit dire/faire à chaque passage. */
  contentInstruction: string;
  /** Données du workspace à examiner (report) : « devis en attente »… */
  dataFocus: string;
};

export type MissingInfo = {
  entity: string;          // clients | employees
  id: string | null;       // null = fiche introuvable
  name: string;
  field: string;           // email | fiche
};

export type ParsedRule = {
  title: string;
  actionType: AgentActionType;
  recipientKind: AgentRecipientKind;
  recipientName: string;
  time: string;
  days: number[];
  contentInstruction: string;
  dataFocus: string;
  usage?: { model: string; inputTokens: number; outputTokens: number };
};

// ── Heure de Paris ───────────────────────────────────────────────────────────

/** Décalage (ms) entre l'heure locale `tz` et UTC à l'instant `date`. */
function tzOffsetMs(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const p: Record<string, string> = {};
  for (const { type, value } of parts) p[type] = value;
  const asUTC = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    p.hour === "24" ? 0 : Number(p.hour),
    Number(p.minute),
    Number(p.second)
  );
  return asUTC - date.getTime();
}

/**
 * Prochain passage dû (instant UTC) pour un planning en heure de Paris.
 * Retourne null si le planning est invalide.
 */
export function computeNextRun(schedule: AgentSchedule, from: Date = new Date()): Date | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(schedule.time ?? "");
  if (!m) return null;
  const hh = Math.min(23, Number(m[1]));
  const mm = Math.min(59, Number(m[2]));
  const days = (schedule.days ?? []).filter((d) => d >= 1 && d <= 7);

  // Date calendaire de Paris « aujourd'hui » (base d'itération).
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PARIS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(from);
  const p: Record<string, string> = {};
  for (const { type, value } of parts) p[type] = value;
  const y = Number(p.year);
  const mo = Number(p.month) - 1;
  const d = Number(p.day);

  for (let i = 0; i < 15; i++) {
    // Calendrier pur (Date.UTC normalise les dépassements de mois).
    const cal = new Date(Date.UTC(y, mo, d + i));
    const isoDay = ((cal.getUTCDay() + 6) % 7) + 1; // 1 = lundi
    if (days.length > 0 && !days.includes(isoDay)) continue;

    // Instant UTC de « ce jour-là à HH:MM heure de Paris » (double passe :
    // le décalage été/hiver dépend de l'instant visé, pas de maintenant).
    let guess = Date.UTC(cal.getUTCFullYear(), cal.getUTCMonth(), cal.getUTCDate(), hh, mm) - tzOffsetMs(from, PARIS_TZ);
    guess = Date.UTC(cal.getUTCFullYear(), cal.getUTCMonth(), cal.getUTCDate(), hh, mm) - tzOffsetMs(new Date(guess), PARIS_TZ);

    if (guess > from.getTime() + 30_000) return new Date(guess);
  }
  return null;
}

/** « lundi 7 juillet à 12:00 » — pour les messages du chat. */
export function formatRunDate(d: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: PARIS_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** Description lisible du planning (« tous les jours à 12:00 »). */
export function describeSchedule(s: AgentSchedule): string {
  const DAY_NAMES = ["", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
  const days = (s.days ?? []).filter((d) => d >= 1 && d <= 7);
  const when =
    days.length === 0
      ? "tous les jours"
      : days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))
        ? "du lundi au vendredi"
        : `chaque ${days.map((d) => DAY_NAMES[d]).join(", ")}`;
  return `${when} à ${s.time}`;
}

// ── Parsing (LLM + repli heuristique) ────────────────────────────────────────

const PARSE_TOOL: Anthropic.Tool = {
  name: "parse_rule",
  description: "Transforme l'instruction en règle d'agent structurée.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Libellé court de la mission (max 8 mots)." },
      action_type: {
        type: "string",
        enum: ["send_email", "notify", "report"],
        description:
          "send_email = écrire à un client/employé. notify = rappel/alerte push à l'utilisateur lui-même. report = examiner les données du workspace et envoyer la synthèse à l'utilisateur.",
      },
      recipient_kind: {
        type: "string",
        enum: ["client", "employee", "team", "me"],
        description: "Destinataire. team = tous les employés. me = l'utilisateur.",
      },
      recipient_name: { type: "string", description: "Nom du client/employé visé. Vide sinon." },
      time: { type: "string", description: "Heure d'exécution « HH:MM » (Paris). Défaut 09:00. « midi » = 12:00." },
      days: {
        type: "array",
        items: { type: "integer" },
        description: "Jours ISO 1=lundi…7=dimanche. VIDE = tous les jours.",
      },
      content_instruction: {
        type: "string",
        description: "Ce que l'agent doit dire/faire à chaque passage, reformulé clairement.",
      },
      data_focus: {
        type: "string",
        description: "Pour report : quelles données examiner (« pointages manquants », « devis sans réponse »…). Vide sinon.",
      },
    },
    required: ["title", "action_type", "recipient_kind", "recipient_name", "time", "days", "content_instruction", "data_focus"],
    additionalProperties: false,
  },
};

const PARSE_SYSTEM = `Tu es le RECRUTEUR d'agents de Biltia, l'OS opérationnel du BTP. L'utilisateur (artisan/chef d'entreprise) dicte une MISSION PERMANENTE en langage courant — une tâche que Biltia devra exécuter seul, à répétition, en temps et en heure. Tu la transformes en règle structurée. Tu ne résous rien : tu structures.

REPÈRES :
- « relance/écris/envoie un mail à [client X] » → send_email, recipient_kind=client.
- « rappelle-moi / préviens-moi / alerte-moi » → notify (notification à l'utilisateur), recipient_kind=me.
- « vérifie / contrôle / surveille [mes données] » → report (examen du workspace + synthèse à l'utilisateur), recipient_kind=me.
- « mes employés / l'équipe / les gars » → recipient_kind=team.
- « à midi » = 12:00, « le matin » = 09:00, « le soir » = 18:00. Heure de Paris. Aucune heure dictée → 09:00.
- « tous les jours » / rien de précisé → days VIDE. « chaque lundi » → [1]. « en semaine » → [1,2,3,4,5].

Réponds UNIQUEMENT en appelant l'outil parse_rule.`;

/** Repli heuristique pur — jamais d'exception, toujours une règle plausible. */
export function parseInstructionHeuristic(instruction: string): ParsedRule {
  const text = instruction
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

  // Heure.
  let time = "09:00";
  const hm = /\ba (\d{1,2})\s*h\s*(\d{2})?\b/.exec(text);
  if (text.includes("midi")) time = "12:00";
  else if (hm) time = `${String(Math.min(23, Number(hm[1]))).padStart(2, "0")}:${hm[2] ?? "00"}`;
  else if (text.includes("le soir") || text.includes("chaque soir") || text.includes("tous les soirs")) time = "18:00";

  // Jours.
  const DAY_KWS: [string, number][] = [
    ["lundi", 1], ["mardi", 2], ["mercredi", 3], ["jeudi", 4],
    ["vendredi", 5], ["samedi", 6], ["dimanche", 7],
  ];
  let days: number[] = [];
  for (const [kw, n] of DAY_KWS) if (text.includes(kw)) days.push(n);
  if (text.includes("en semaine") || text.includes("jours ouvres")) days = [1, 2, 3, 4, 5];

  // Action + destinataire.
  let actionType: AgentActionType = "notify";
  let recipientKind: AgentRecipientKind = "me";
  if (/(relance|ecris a|envoie (un )?(mail|email|message) a)/.test(text)) {
    actionType = "send_email";
    recipientKind = /employe|equipe|salarie|ouvrier|chef de chantier|les gars/.test(text) ? "team" : "client";
  } else if (/(verifie|controle|surveille|examine)/.test(text)) {
    actionType = "report";
  }

  const nameMatch = /client(?:e)?\s+([a-z][a-z' -]{1,40}?)(?=\s+(?:tous|chaque|a \d|le \d|du lundi|en semaine|$)|[,.!]|$)/.exec(text);

  return {
    title: instruction.slice(0, 60),
    actionType,
    recipientKind,
    recipientName: nameMatch ? nameMatch[1].trim() : "",
    time,
    days,
    contentInstruction: instruction.slice(0, 500),
    dataFocus: actionType === "report" ? instruction.slice(0, 200) : "",
  };
}

/** Parse l'instruction : Haiku si clé dispo, repli heuristique sinon/en erreur. */
export async function parseInstruction(instruction: string): Promise<ParsedRule> {
  const hasKey =
    !!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY.startsWith("your_");
  if (!hasKey) return parseInstructionHeuristic(instruction);

  try {
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: PARSE_MODEL,
      max_tokens: 512,
      system: PARSE_SYSTEM,
      tools: [PARSE_TOOL],
      tool_choice: { type: "tool", name: "parse_rule" },
      messages: [{ role: "user", content: `Mission dictée : « ${instruction} »` }],
    });
    const block = msg.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") return parseInstructionHeuristic(instruction);

    const i = block.input as Record<string, unknown>;
    const actionType =
      i.action_type === "send_email" || i.action_type === "notify" || i.action_type === "report"
        ? i.action_type
        : "notify";
    const recipientKind =
      i.recipient_kind === "client" || i.recipient_kind === "employee" || i.recipient_kind === "team" || i.recipient_kind === "me"
        ? i.recipient_kind
        : "me";
    const time = typeof i.time === "string" && /^\d{1,2}:\d{2}$/.test(i.time) ? i.time : "09:00";
    const days = Array.isArray(i.days)
      ? i.days.filter((d): d is number => typeof d === "number" && d >= 1 && d <= 7)
      : [];

    return {
      title: typeof i.title === "string" && i.title.trim() ? i.title.trim().slice(0, 80) : instruction.slice(0, 60),
      actionType,
      recipientKind,
      recipientName: typeof i.recipient_name === "string" ? i.recipient_name.trim().slice(0, 80) : "",
      time,
      days,
      contentInstruction:
        typeof i.content_instruction === "string" && i.content_instruction.trim()
          ? i.content_instruction.trim().slice(0, 600)
          : instruction.slice(0, 500),
      dataFocus: typeof i.data_focus === "string" ? i.data_focus.trim().slice(0, 200) : "",
      usage: {
        model: PARSE_MODEL,
        inputTokens: msg.usage.input_tokens,
        outputTokens: msg.usage.output_tokens,
      },
    };
  } catch {
    return parseInstructionHeuristic(instruction);
  }
}

// ── Résolution des destinataires (contre le workspace) ───────────────────────

export type ResolveResult =
  | { ok: true; recipients: AgentAction["recipients"] }
  | { ok: false; reason: string; missing: MissingInfo | null };

/**
 * Résout le destinataire d'un send_email contre les VRAIES fiches du workspace.
 * L'agent ne devine jamais : introuvable, ambigu ou sans email → { ok: false }
 * avec la question exacte à poser à l'utilisateur.
 */
export async function resolveRecipients(
  supabase: SupabaseClient,
  tenantId: string,
  kind: AgentRecipientKind,
  name: string,
  creatorEmail: string | null
): Promise<ResolveResult> {
  if (kind === "me") {
    if (!creatorEmail) {
      return { ok: false, reason: "votre adresse email est introuvable", missing: null };
    }
    return { ok: true, recipients: [{ name: "vous", email: creatorEmail, entity: "me", id: "" }] };
  }

  if (kind === "team") {
    const { data } = await supabase
      .from("employees")
      .select("id, nom, prenom, email")
      .eq("tenant_id", tenantId)
      .limit(100);
    const rows = (data ?? []) as { id: string; nom: string; prenom: string | null; email: string | null }[];
    const withEmail = rows.filter((r) => r.email && r.email.includes("@"));
    if (rows.length === 0) {
      return {
        ok: false,
        reason: "aucun employé dans votre workspace",
        missing: { entity: "employees", id: null, name: "équipe", field: "fiche" },
      };
    }
    if (withEmail.length === 0) {
      return {
        ok: false,
        reason: "aucun de vos employés n'a d'adresse email renseignée",
        missing: { entity: "employees", id: null, name: "équipe", field: "email" },
      };
    }
    return {
      ok: true,
      recipients: withEmail.map((r) => ({
        name: [r.prenom, r.nom].filter(Boolean).join(" "),
        email: r.email as string,
        entity: "employees",
        id: r.id,
      })),
    };
  }

  // client | employee — recherche par nom.
  const table = kind === "client" ? "clients" : "employees";
  const label = kind === "client" ? "client" : "employé";
  if (!name.trim()) {
    return { ok: false, reason: `quel ${label} dois-je contacter ?`, missing: null };
  }

  const { data } = await supabase
    .from(table)
    .select("id, nom, email")
    .eq("tenant_id", tenantId)
    .ilike("nom", `%${name.trim()}%`)
    .limit(5);
  const rows = (data ?? []) as { id: string; nom: string; email: string | null }[];

  if (rows.length === 0) {
    return {
      ok: false,
      reason: `je ne trouve aucun ${label} « ${name} » dans votre workspace`,
      missing: { entity: table, id: null, name, field: "fiche" },
    };
  }
  if (rows.length > 1) {
    const names = rows.map((r) => r.nom).join(", ");
    return { ok: false, reason: `plusieurs ${label}s correspondent (${names}) — précisez lequel`, missing: null };
  }

  const row = rows[0];
  if (!row.email || !row.email.includes("@")) {
    return {
      ok: false,
      reason: `je n'ai pas l'email de ${row.nom}`,
      missing: { entity: table, id: row.id, name: row.nom, field: "email" },
    };
  }
  return { ok: true, recipients: [{ name: row.nom, email: row.email, entity: table, id: row.id }] };
}

// ── Création (orchestration) ─────────────────────────────────────────────────

export type CreateRuleResult = {
  ok: boolean;
  ruleId: string | null;
  blocked: boolean;
  /** Message prêt pour le chat (« jamais muet »). */
  message: string;
  usage?: ParsedRule["usage"];
};

/**
 * Recrute un agent : parse l'instruction, résout les destinataires, calcule le
 * prochain passage et écrit la règle. Une info manquante ne REFUSE pas la
 * mission : la règle est créée « bloquée » avec la question précise, et
 * démarre dès que l'info est fournie (le workspace est complété au passage).
 */
export async function createAgentRule(opts: {
  supabase: SupabaseClient;
  userId: string;
  userEmail: string | null;
  tenantId: string;
  instruction: string;
}): Promise<CreateRuleResult> {
  const { supabase, userId, userEmail, tenantId, instruction } = opts;

  const parsed = await parseInstruction(instruction);
  const schedule: AgentSchedule = { time: parsed.time, days: parsed.days, tz: PARIS_TZ };

  // Résolution immédiate pour un envoi : on préfère bloquer MAINTENANT avec une
  // question claire plutôt qu'échouer en silence au premier passage.
  let recipients: AgentAction["recipients"] = [];
  let blockedReason: string | null = null;
  let missing: MissingInfo | null = null;
  if (parsed.actionType === "send_email") {
    const r = await resolveRecipients(supabase, tenantId, parsed.recipientKind, parsed.recipientName, userEmail);
    if (r.ok) recipients = r.recipients;
    else {
      blockedReason = r.reason;
      missing = r.missing;
    }
  }

  const action: AgentAction = {
    type: parsed.actionType,
    recipientKind: parsed.recipientKind,
    recipientName: parsed.recipientName,
    recipients,
    contentInstruction: parsed.contentInstruction,
    dataFocus: parsed.dataFocus,
  };

  const blocked = blockedReason !== null;
  const nextRun = blocked ? null : computeNextRun(schedule);

  const { data: inserted, error } = await supabase
    .from("agent_rules")
    .insert({
      tenant_id: tenantId,
      created_by: userId,
      title: parsed.title,
      instruction: instruction.slice(0, 2000),
      trigger_type: "schedule",
      schedule: schedule as unknown as Record<string, unknown>,
      action: action as unknown as Record<string, unknown>,
      status: blocked ? "blocked" : "active",
      blocked_reason: blockedReason,
      missing: missing as unknown as Record<string, unknown> | null,
      next_run_at: nextRun ? nextRun.toISOString() : null,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return {
      ok: false,
      ruleId: null,
      blocked: false,
      message:
        "Je n'ai pas pu enregistrer cet agent (base indisponible ou migration 020 non appliquée). Réessayez.",
      usage: parsed.usage,
    };
  }

  const planning = describeSchedule(schedule);
  let message: string;
  if (blocked) {
    message = `🤖 Agent recruté : **${parsed.title}** (${planning}). ⚠️ Mais avant de démarrer : ${blockedReason}.${
      missing?.field === "email"
        ? ` Donnez-moi l'email (ex : « son email est jean@exemple.fr ») ou complétez la fiche dans le Workspace — je démarre dès que je l'ai.`
        : ""
    } Retrouvez cet agent dans **Agents**.`;
  } else {
    message = `🤖 Agent recruté : **${parsed.title}** — ${planning}. Premier passage : ${
      nextRun ? formatRunDate(nextRun) : "à planifier"
    }. Chaque passage est tracé dans **Agents** (pause, journal, suppression). Je m'en occupe.`;
  }

  return { ok: true, ruleId: inserted.id, blocked, message, usage: parsed.usage };
}
