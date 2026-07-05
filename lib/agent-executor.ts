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
import { computeNextRun, type AgentAction, type AgentSchedule } from "./agent-rules";
import { getWorkspaceContext, buildWorkspaceBlock } from "./workspace-context";
import { runAgentLoop, buildWorkspaceToolsSystem, type ToolTrace } from "./agent-tools";
import { sendEmail, hasMailerKey } from "./mailer";
import { sendPushToUser } from "./push";
import { trackAiUsage } from "./ai-usage";
import { logActivity } from "./activity";
import { isFounderEmail } from "./founder";
import { TIER_SIMPLE, TIER_MEDIUM, TIER_COMPLEX } from "./models";

// MODÈLE PAR MISSION (règle user 2026-07-05) : figé au recrutement selon la
// complexité (simple=Haiku, medium=Sonnet, complex=Opus), whitelisté ici —
// une valeur inattendue stockée en base ne peut jamais viser un autre modèle.
const ALLOWED_EXEC_MODELS = new Set([TIER_SIMPLE, TIER_MEDIUM, TIER_COMPLEX]);
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
};

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
  mode: "email" | "notify" | "report";
  model: string;
  instruction: string;
  recipientNames: string;
  companyName: string;
  workspaceBlock: string;
  extraData: string;
  db: SupabaseClient;
  tenantId: string;
  userId: string | null;
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
        : `Ton livrable : un RAPPEL bref (notification) pour le patron de « ${opts.companyName} ». Deux phrases max.`;

  const system = `Tu es un agent autonome de Biltia, l'OS opérationnel du BTP. Tu exécutes un passage planifié de la mission confiée par l'utilisateur. Tu peux LIRE et ÉCRIRE dans le workspace avec les outils workspace_* si la mission le demande (vérifier des données, mettre à jour un statut, créer une tâche…).

${roleLine}

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
      actor: { tenantId: opts.tenantId, userId: opts.userId, label: `Agent « ${opts.agentTitle} »` },
      finishTool: COMPOSE_TOOL,
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
  return lines.join("\n");
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

  const notifyOwner = async (title: string, body: string) => {
    if (rule.created_by) {
      await sendPushToUser(rule.created_by, { title, body, url: "/agents", tag: `agent-${rule.id}` });
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

    // Envoi sortant : vérifier les MOYENS avant de rédiger (échec précoce et clair).
    if (action.type === "send_email") {
      if (!hasMailerKey()) {
        const reason = "envoi d'email non configuré (RESEND_API_KEY)";
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
      mode: action.type === "send_email" ? "email" : action.type === "report" ? "report" : "notify",
      model: execModel,
      instruction: action.contentInstruction || rule.instruction,
      recipientNames: (action.recipients ?? []).map((r) => r.name).join(", ") || "vous",
      companyName,
      workspaceBlock: buildWorkspaceBlock(ctx),
      extraData: focusData,
      db: admin,
      tenantId: rule.tenant_id,
      userId: rule.created_by,
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
            await notifyOwner("Agent en pause : crédits épuisés", `« ${rule.title} » : ${reason}.`);
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
      // REPLY-TO = l'email de l'artisan : l'envoi part du domaine Biltia
      // (Resend), mais la RÉPONSE du client atterrit dans SA boîte — sans ça,
      // les réponses aux relances se perdraient chez Biltia.
      const replyTo = creatorEmail && creatorEmail.includes("@") ? creatorEmail : undefined;

      const sent = await sendEmail({
        to: action.recipients.map((r) => r.email),
        subject: composed.subject,
        text: composed.body,
        replyTo,
      });
      if (!sent.ok) {
        await finishRun("blocked", `Envoi refusé : ${sent.reason}.`, { subject: composed.subject });
        await reschedule(sent.reason);
        await notifyOwner("Agent bloqué", `« ${rule.title} » : ${sent.reason}.`);
        return { status: "blocked", summary: sent.reason };
      }
      const who = action.recipients.map((r) => r.name).join(", ");
      const extra = composed.traces.length ? ` ${composed.traces.length} action(s) workspace.` : "";
      const summary = `Email « ${composed.subject} » envoyé à ${who}.${extra}`;
      await finishRun("success", summary, {
        subject: composed.subject,
        body: composed.body,
        to: action.recipients.map((r) => r.email),
        resend_id: sent.id,
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
    .select("id, tenant_id, created_by, title, instruction, schedule, action, status, next_run_at")
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
