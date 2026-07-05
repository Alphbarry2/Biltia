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
import { getEntitlementsForTenant, FROZEN_MESSAGE } from "@/lib/entitlements";
import { trackAiUsage } from "@/lib/ai-usage";
import { logActivity } from "@/lib/activity";
import {
  createAgentRule,
  computeNextRun,
  formatRunDate,
  resolveRecipients,
  type AgentAction,
  type AgentSchedule,
  type MissingInfo,
  type AgentRecipientKind,
} from "@/lib/agent-rules";
import { executeRule, type AgentRuleRow } from "@/lib/agent-executor";

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
  const { supabase, user, membership } = await resolveSession();
  if (!user) return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  if (!membership) return NextResponse.json({ error: "Aucun espace de travail." }, { status: 403 });

  const [{ data: rules }, { data: runs }] = await Promise.all([
    supabase
      .from("agent_rules")
      .select("id, title, instruction, schedule, action, status, blocked_reason, missing, next_run_at, last_run_at, created_at")
      .eq("tenant_id", membership.tenant_id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("agent_runs")
      .select("id, rule_id, run_key, status, summary, error, created_at, finished_at")
      .eq("tenant_id", membership.tenant_id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return NextResponse.json({ rules: rules ?? [], runs: runs ?? [] });
}

// ── POST : recruter ──────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const { supabase, user, membership } = await resolveSession();
  if (!user) return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  if (!membership) return NextResponse.json({ error: "Aucun espace de travail." }, { status: 403 });

  const ent = await getEntitlementsForTenant(supabase, membership.tenant_id);
  if (!ent.writable) {
    return NextResponse.json({ error: FROZEN_MESSAGE, frozen: true }, { status: 403 });
  }

  let body: { instruction?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }
  const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
  if (!instruction) {
    return NextResponse.json({ error: "« instruction » est requise." }, { status: 400 });
  }

  const result = await createAgentRule({
    supabase,
    userId: user.id,
    userEmail: user.email ?? null,
    tenantId: membership.tenant_id,
    instruction: instruction.slice(0, 2000),
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

  return NextResponse.json(
    { ok: result.ok, kind: "rule", ruleId: result.ruleId, blocked: result.blocked, message: result.message },
    { status: result.ok ? 200 : 500 }
  );
}

// ── PATCH : piloter ──────────────────────────────────────────────────────────

export async function PATCH(req: Request) {
  const { supabase, user, membership } = await resolveSession();
  if (!user) return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  if (!membership) return NextResponse.json({ error: "Aucun espace de travail." }, { status: 403 });
  const tenantId = membership.tenant_id;

  let body: { id?: string; action?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  const action = typeof body.action === "string" ? body.action : "";
  if (!id || !action) return NextResponse.json({ error: "« id » et « action » requis." }, { status: 400 });

  // Gel lecture seule : toute commande d'agent est une écriture.
  const ent = await getEntitlementsForTenant(supabase, tenantId);
  if (!ent.writable) {
    return NextResponse.json({ error: FROZEN_MESSAGE, frozen: true }, { status: 403 });
  }

  // La règle DOIT appartenir au tenant actif (RLS + filtre explicite).
  const { data: rule } = await supabase
    .from("agent_rules")
    .select("id, tenant_id, created_by, title, instruction, schedule, action, status, blocked_reason, missing, next_run_at")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (!rule) return NextResponse.json({ error: "Agent introuvable." }, { status: 404 });

  const schedule = rule.schedule as unknown as AgentSchedule;

  if (action === "pause") {
    await supabase
      .from("agent_rules")
      .update({ status: "paused", next_run_at: null, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("tenant_id", tenantId);
    return NextResponse.json({ ok: true, status: "paused" });
  }

  if (action === "resume") {
    const next = computeNextRun(schedule);
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
      message: next ? `Prochain passage : ${formatRunDate(next)}.` : null,
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
    if (!admin) return NextResponse.json({ error: "Service role non configuré." }, { status: 503 });
    const outcome = await executeRule(
      admin,
      rule as unknown as AgentRuleRow,
      `manual:${new Date().toISOString()}`
    );
    return NextResponse.json({ ok: outcome.status === "success", outcome });
  }

  if (action === "provide") {
    // L'utilisateur fournit l'info manquante (email). Elle est écrite DANS LA
    // FICHE du workspace — l'agent ET tout le reste de Biltia en profitent.
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const missing = rule.missing as unknown as MissingInfo | null;
    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Email invalide." }, { status: 400 });
    }
    if (!missing || missing.field !== "email" || !missing.id) {
      return NextResponse.json({ error: "Cet agent n'attend pas d'email." }, { status: 400 });
    }
    if (missing.entity !== "clients" && missing.entity !== "employees") {
      return NextResponse.json({ error: "Entité inconnue." }, { status: 400 });
    }

    const { error: updErr } = await supabase
      .from(missing.entity)
      .update({ email })
      .eq("tenant_id", tenantId)
      .eq("id", missing.id);
    if (updErr) {
      return NextResponse.json({ error: "Impossible de compléter la fiche." }, { status: 400 });
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
      return NextResponse.json({ error: `Toujours bloqué : ${resolved.reason}.` }, { status: 400 });
    }

    const next = computeNextRun(schedule);
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
      message: `Fiche complétée, agent débloqué.${next ? ` Prochain passage : ${formatRunDate(next)}.` : ""}`,
    });
  }

  return NextResponse.json({ error: `Action inconnue : ${action}` }, { status: 400 });
}
