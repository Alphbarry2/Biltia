// ─────────────────────────────────────────────────────────────────────────────
// /api/agents — GESTION DES AGENTS RECRUTÉS (règles permanentes).
//
// GET   : liste les agents du tenant + les derniers passages (journal).
// POST  : recrute un agent depuis une instruction en langage courant
//         (aussi appelé par /api/generate quand le chat détecte kind="rule").
// PATCH : pilote un agent — pause | resume | delete | run_now | provide.
//         `provide` répond à l'état « bloqué » : l'utilisateur donne l'info
//         manquante (ex : l'email du client) → elle est enregistrée DANS LE
//         WORKSPACE (la fiche client/employé est complétée, pas juste l'agent),
//         puis l'agent redémarre. Le workspace s'enrichit en travaillant.
//
// Sécurité : session + membership actif (motif /api/data), tenant_id forcé
// côté serveur, RLS en dernier rempart. Gel lecture seule respecté (un
// abonnement expiré ne recrute pas et ne relance pas d'agent).
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getActiveMembershipServer } from "@/lib/tenant-server";
import { getEntitlementsForTenant, FROZEN_MESSAGE, frozenMessage } from "@/lib/entitlements";
import { trackAiUsage } from "@/lib/ai-usage";
import { logActivity } from "@/lib/activity";
import {
  createAgentRule,
  computeNextRun,
  formatRunDate,
  resolveRecipients,
  PENDING_CONNECTION_REASON,
  type AgentAction,
  type AgentSchedule,
  type MissingInfo,
  type AgentRecipientKind,
} from "@/lib/agent-rules";
import { checkAgentReadiness, summarizeGaps } from "@/lib/agent-readiness";
import { connectorsForCapability } from "@/lib/connectors";
import type { WatcherKey } from "@/lib/agent-watchers";
import { executeRule, type AgentRuleRow } from "@/lib/agent-executor";
import { can } from "@/lib/permissions";
import { getLocale } from "@/lib/i18n/server";
import { pick } from "@/lib/i18n/config";

async function resolveSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, membership: null };
  const membership = await getActiveMembershipServer(supabase, user.id);
  return { supabase, user, membership };
}

// ── GET : liste + journal ────────────────────────────────────────────────────

export async function GET() {
  const locale = await getLocale();
  const { supabase, user, membership } = await resolveSession();
  if (!user)
    return NextResponse.json(
      { error: pick(locale, "Authentification requise.", "Authentication required.") },
      { status: 401 }
    );
  if (!membership)
    return NextResponse.json({ error: pick(locale, "Aucun espace de travail.", "No workspace.") }, { status: 403 });

  // agent_outbox est une table récente (035) : cast souple le temps que les
  // types générés la connaissent (même convention que les autres tables neuves).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loose = supabase as unknown as { from: (t: string) => any };

  const [{ data: rules }, { data: runs }, { data: pending }] = await Promise.all([
    supabase
      .from("agent_rules")
      .select("id, title, instruction, trigger_type, trigger, schedule, action, status, blocked_reason, missing, next_run_at, last_run_at, meta, created_at")
      .eq("tenant_id", membership.tenant_id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      // `output` porte le LIVRABLE de l'agent : le corps du rapport, de la
      // synthèse, du compte rendu. Il n'était pas sélectionné — donc jamais
      // affiché. L'artisan payait un « rapport quotidien » en crédits, voyait la
      // ligne de journal « Contrôle effectué », et ne lisait JAMAIS le rapport.
      // (lib/agent-readiness.ts promet pourtant « chaque alerte reste consultable
      // dans Agents ».) Seule la notification push en transportait 240 caractères.
      .from("agent_runs")
      .select("id, rule_id, run_key, status, summary, output, error, credits_used, created_at, finished_at")
      .eq("tenant_id", membership.tenant_id)
      .order("created_at", { ascending: false })
      .limit(50),
    loose
      .from("agent_outbox")
      .select("id, rule_id, fiche_label, kind, level, to_email, subject, body, status, created_at")
      .eq("tenant_id", membership.tenant_id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  // ── AGENTS EN ATTENTE DE CONNEXION ───────────────────────────────────────────
  // Ceux-là existent mais ne tournent pas : il leur manque une messagerie ou un
  // agenda. On calcule ICI ce qu'il leur faut (plutôt que de le figer en base au
  // recrutement) parce que l'état des connexions CHANGE : un agent peut être devenu
  // activable depuis, et une liste figée le laisserait afficher un bouton inutile.
  // Le preflight est refait uniquement pour ces agents-là (en pratique 0 ou 1).
  const rows = (rules ?? []) as { id: string; status: string; blocked_reason: string | null; trigger_type: string; trigger: unknown; action: unknown }[];
  const waiting = rows.filter((r) => r.status === "blocked" && r.blocked_reason === PENDING_CONNECTION_REASON);
  const pendingConnectors: Record<string, string[]> = {};
  await Promise.all(
    waiting.map(async (r) => {
      const action = (r.action ?? {}) as AgentAction;
      const trigger = (r.trigger ?? {}) as { watcher?: WatcherKey | null };
      const readiness = await checkAgentReadiness({
        supabase,
        tenantId: membership.tenant_id,
        userId: user.id,
        userEmail: user.email ?? null,
        plan: {
          actionType: action.type,
          recipientKind: action.recipientKind,
          watcher: r.trigger_type === "event" ? (trigger.watcher ?? null) : null,
        },
        locale,
      });
      const ids = [
        ...new Set(
          readiness.gaps.filter((g) => g.severity === "block").flatMap((g) => connectorsForCapability(g.code))
        ),
      ];
      if (ids.length) pendingConnectors[r.id] = ids;
    })
  );

  return NextResponse.json({
    rules: rules ?? [],
    runs: runs ?? [],
    pending: pending ?? [],
    pendingConnectors,
  });
}

// ── POST : recruter ──────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const locale = await getLocale();
  const { supabase, user, membership } = await resolveSession();
  if (!user)
    return NextResponse.json(
      { error: pick(locale, "Authentification requise.", "Authentication required.") },
      { status: 401 }
    );
  if (!membership)
    return NextResponse.json({ error: pick(locale, "Aucun espace de travail.", "No workspace.") }, { status: 403 });

  // RBAC : recruter un agent autonome est réservé aux chefs d'équipe et plus
  // (owner / admin / manager). Un collaborateur ou un lecteur ne crée pas d'agent.
  if (!can(membership.role, "agents.manage")) {
    return NextResponse.json(
      {
        error: pick(
          locale,
          "Seuls le propriétaire, un administrateur ou un chef d'équipe peuvent recruter un agent.",
          "Only the owner, an admin or a team lead can hire an agent."
        ),
      },
      { status: 403 }
    );
  }

  const ent = await getEntitlementsForTenant(supabase, membership.tenant_id);
  if (!ent.writable) {
    return NextResponse.json({ error: frozenMessage(locale), frozen: true }, { status: 403 });
  }

  let body: { instruction?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: pick(locale, "Corps de requête invalide.", "Invalid request body.") },
      { status: 400 }
    );
  }
  const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
  if (!instruction) {
    return NextResponse.json(
      { error: pick(locale, "« instruction » est requise.", "“instruction” is required.") },
      { status: 400 }
    );
  }

  const result = await createAgentRule({
    supabase,
    userId: user.id,
    userEmail: user.email ?? null,
    tenantId: membership.tenant_id,
    instruction: instruction.slice(0, 2000),
    locale,
  });

  // Coût du parsing Haiku : journalisé (jamais bloquant).
  if (result.usage) {
    void trackAiUsage({
      supabase,
      userId: user.id,
      tenantId: membership.tenant_id,
      action: "agent_recruit",
      model: result.usage.model,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      internal: true, // recrutement (parsing de la règle) : coût réel, pas de plancher 5cr
    }).catch(() => {});
  }

  if (result.ok) {
    await logActivity(supabase, {
      tenantId: membership.tenant_id,
      userId: user.id,
      action: "create",
      entityType: "agent",
      description: `Agent recruté : « ${instruction.slice(0, 80)} »`,
      entityId: result.ruleId,
    });
  }

  // `gaps` était JETÉ ici (l'appelant ne savait donc pas QUOI connecter), et un
  // simple manque de capacité repartait en HTTP 500 — une panne serveur, alors que
  // c'est une réponse parfaitement normale. On aligne sur /api/agents/activate :
  // 200 + ok:false + gaps + cartes.
  const connectors = [
    ...new Set(
      (result.gaps ?? [])
        .filter((g) => g.severity === "block")
        .flatMap((g) => connectorsForCapability(g.code))
    ),
  ];
  return NextResponse.json({
    ok: result.ok,
    kind: "rule",
    ruleId: result.ruleId,
    blocked: result.blocked,
    message: result.message,
    gaps: result.gaps ?? [],
    ...(connectors.length ? { connectors } : {}),
    ...(result.ok && result.blocked && result.ruleId ? { pendingRuleId: result.ruleId } : {}),
  });
}

// ── PATCH : piloter ──────────────────────────────────────────────────────────

export async function PATCH(req: Request) {
  const locale = await getLocale();
  const { supabase, user, membership } = await resolveSession();
  if (!user)
    return NextResponse.json(
      { error: pick(locale, "Authentification requise.", "Authentication required.") },
      { status: 401 }
    );
  if (!membership)
    return NextResponse.json({ error: pick(locale, "Aucun espace de travail.", "No workspace.") }, { status: 403 });
  const tenantId = membership.tenant_id;

  // RBAC : piloter un agent (pause / relance / suppression) = même droit que le
  // recrutement (owner / admin / manager).
  if (!can(membership.role, "agents.manage")) {
    return NextResponse.json(
      {
        error: pick(
          locale,
          "Seuls le propriétaire, un administrateur ou un chef d'équipe peuvent piloter un agent.",
          "Only the owner, an admin or a team lead can manage an agent."
        ),
      },
      { status: 403 }
    );
  }

  let body: { id?: string; action?: string; email?: string; content?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: pick(locale, "Corps de requête invalide.", "Invalid request body.") },
      { status: 400 }
    );
  }
  const id = typeof body.id === "string" ? body.id : "";
  const action = typeof body.action === "string" ? body.action : "";
  if (!id || !action)
    return NextResponse.json(
      { error: pick(locale, "« id » et « action » requis.", "“id” and “action” are required.") },
      { status: 400 }
    );

  // Gel lecture seule : toute commande d'agent est une écriture.
  const ent = await getEntitlementsForTenant(supabase, tenantId);
  if (!ent.writable) {
    return NextResponse.json({ error: frozenMessage(locale), frozen: true }, { status: 403 });
  }

  // La règle DOIT appartenir au tenant actif (RLS + filtre explicite).
  const { data: rule } = await supabase
    .from("agent_rules")
    .select("id, tenant_id, created_by, title, instruction, trigger_type, trigger, schedule, action, status, blocked_reason, missing, next_run_at, monthly_credit_budget, daily_credit_budget")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (!rule)
    return NextResponse.json({ error: pick(locale, "Agent introuvable.", "Agent not found.") }, { status: 404 });

  const schedule = rule.schedule as unknown as AgentSchedule;
  const isEvent = rule.trigger_type === "event";
  // Agent-événement : « prochain passage » = un scan imminent (pas un créneau
  // horaire). computeNextRun(schedule) renverrait null (schedule vide) → on force
  // une reprise immédiate pour que le cron le réévalue au prochain tick.
  const nextRunFor = (): Date | null => (isEvent ? new Date() : computeNextRun(schedule));

  if (action === "pause") {
    await supabase
      .from("agent_rules")
      .update({ status: "paused", next_run_at: null, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("tenant_id", tenantId);
    return NextResponse.json({ ok: true, status: "paused" });
  }

  if (action === "resume") {
    // ── ON NE RÉVEILLE PAS UN AGENT QUI NE PEUT TOUJOURS PAS TRAVAILLER ─────────
    // « resume » remettait `status: active` et effaçait `blocked_reason` SANS aucune
    // vérification : un clic sur ▶ suffisait à rendre « Actif » un agent qui n'a
    // toujours pas de messagerie branchée. C'est exactement le mensonge qu'on vient
    // de fermer à la création — il ne doit pas rentrer par cette porte.
    if (rule.status === "blocked" && rule.blocked_reason === PENDING_CONNECTION_REASON) {
      const ruleAction = (rule.action ?? {}) as unknown as AgentAction;
      const ruleTrigger = (rule.trigger ?? {}) as unknown as { watcher?: WatcherKey | null };
      const readiness = await checkAgentReadiness({
        supabase,
        tenantId,
        userId: user.id,
        userEmail: user.email ?? null,
        plan: {
          actionType: ruleAction.type,
          recipientKind: ruleAction.recipientKind,
          watcher: isEvent ? (ruleTrigger.watcher ?? null) : null,
        },
        locale,
      });
      if (!readiness.ok) {
        const blocking = readiness.gaps.filter((g) => g.severity === "block");
        const connectors = [...new Set(blocking.flatMap((g) => connectorsForCapability(g.code)))];
        return NextResponse.json({
          ok: false,
          status: "blocked",
          gaps: readiness.gaps,
          ...(connectors.length ? { connectors } : {}),
          message: pick(
            locale,
            `Je ne peux pas le lancer : il me manque toujours **${summarizeGaps(blocking)}**.`,
            `I can't start it: I'm still missing **${summarizeGaps(blocking)}**.`
          ),
        });
      }
    }
    const next = nextRunFor();
    await supabase
      .from("agent_rules")
      .update({
        status: "active",
        blocked_reason: null,
        next_run_at: next ? next.toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("tenant_id", tenantId);
    return NextResponse.json({
      ok: true,
      status: "active",
      message: next
        ? pick(locale, `Prochain passage : ${formatRunDate(next)}.`, `Next run: ${formatRunDate(next)}.`)
        : null,
    });
  }

  if (action === "delete") {
    await supabase.from("agent_rules").delete().eq("id", id).eq("tenant_id", tenantId);
    await logActivity(supabase, {
      tenantId,
      userId: user.id,
      action: "delete",
      entityType: "agent",
      description: `Agent supprimé : « ${rule.title} »`,
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "run_now") {
    // Exécution immédiate (test / rattrapage) via service_role, APRÈS la
    // vérification d'appartenance ci-dessus. run_key dédié : ne consomme pas
    // le créneau planifié.
    const admin = createAdminClient();
    if (!admin)
      return NextResponse.json(
        { error: pick(locale, "Service role non configuré.", "Service role not configured.") },
        { status: 503 }
      );
    const outcome = await executeRule(
      admin,
      rule as unknown as AgentRuleRow,
      `manual:${new Date().toISOString()}`
    );
    return NextResponse.json({ ok: outcome.status === "success", outcome });
  }

  if (action === "provide") {
    const missing = rule.missing as unknown as MissingInfo | null;

    // ── Contenu manquant : l'utilisateur dit ENFIN quoi envoyer ──────────────
    // On complète le message de l'agent (action.contentInstruction) et on le
    // débloque. Le contenu vit dans l'agent (ce n'est pas une fiche workspace).
    if (missing?.field === "content") {
      const content = typeof body.content === "string" ? body.content.trim() : "";
      if (content.length < 3) {
        return NextResponse.json(
          {
            error: pick(
              locale,
              "Dites-moi quoi envoyer (message trop court).",
              "Tell me what to send (message too short)."
            ),
          },
          { status: 400 }
        );
      }
      const act = rule.action as unknown as AgentAction;
      const next = nextRunFor();
      await supabase
        .from("agent_rules")
        .update({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          action: { ...act, contentInstruction: content.slice(0, 600) } as any,
          status: "active",
          blocked_reason: null,
          missing: null,
          next_run_at: next ? next.toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("tenant_id", tenantId);
      return NextResponse.json({
        ok: true,
        status: "active",
        message: pick(
          locale,
          `Message enregistré, agent débloqué.${next ? ` Prochain passage : ${formatRunDate(next)}.` : ""}`,
          `Message saved, agent unblocked.${next ? ` Next run: ${formatRunDate(next)}.` : ""}`
        ),
      });
    }

    // L'utilisateur fournit l'info manquante (email). Elle est écrite DANS LA
    // FICHE du workspace — l'agent ET tout le reste de Biltia en profitent.
    const email = typeof body.email === "string" ? body.email.trim() : "";
    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: pick(locale, "Email invalide.", "Invalid email.") }, { status: 400 });
    }
    if (!missing || missing.field !== "email" || !missing.id) {
      return NextResponse.json(
        { error: pick(locale, "Cet agent n'attend pas d'email.", "This agent is not waiting for an email.") },
        { status: 400 }
      );
    }
    if (missing.entity !== "clients" && missing.entity !== "employees") {
      return NextResponse.json({ error: pick(locale, "Entité inconnue.", "Unknown entity.") }, { status: 400 });
    }

    const { error: updErr } = await supabase
      .from(missing.entity)
      .update({ email })
      .eq("tenant_id", tenantId)
      .eq("id", missing.id);
    if (updErr) {
      return NextResponse.json(
        { error: pick(locale, "Impossible de compléter la fiche.", "Could not update the record.") },
        { status: 400 }
      );
    }

    // Re-résolution → l'agent redémarre avec le destinataire complet.
    const act = rule.action as unknown as AgentAction;
    const resolved = await resolveRecipients(
      supabase,
      tenantId,
      act.recipientKind as AgentRecipientKind,
      act.recipientName,
      user.email ?? null
    );
    if (!resolved.ok) {
      return NextResponse.json(
        {
          error: pick(
            locale,
            `Toujours bloqué : ${resolved.reason}.`,
            `Still blocked: ${resolved.reason}.`
          ),
        },
        { status: 400 }
      );
    }

    const next = nextRunFor();
    await supabase
      .from("agent_rules")
      .update({
        // Les types générés attendent Json ; AgentAction est un objet JSON simple.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        action: { ...act, recipients: resolved.recipients } as any,
        status: "active",
        blocked_reason: null,
        missing: null,
        next_run_at: next ? next.toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("tenant_id", tenantId);

    return NextResponse.json({
      ok: true,
      status: "active",
      message: pick(
        locale,
        `Fiche complétée, agent débloqué.${next ? ` Prochain passage : ${formatRunDate(next)}.` : ""}`,
        `Record completed, agent unblocked.${next ? ` Next run: ${formatRunDate(next)}.` : ""}`
      ),
    });
  }

  return NextResponse.json(
    { error: pick(locale, `Action inconnue : ${action}`, `Unknown action: ${action}`) },
    { status: 400 }
  );
}
