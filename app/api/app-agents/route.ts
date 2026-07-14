// ─────────────────────────────────────────────────────────────────────────────
// /api/app-agents — LIAISON APPLICATION ↔ AGENTS (Phase 6).
//
// Permet à une app générée (via window.biltia.*) de piloter les agents QUI LUI
// SONT RATTACHÉS. Le lien app→règle est porté par `agent_rules.meta.source_module_id`
// (aucune migration : la colonne meta jsonb existe déjà).
//
// Actions : list_attached / create / pause / resume / trigger / pending_approvals.
// Sécurité : auth + tenant + RBAC (agents.manage pour créer/piloter, lecture pour
// lister) + gel (créer/déclencher = écriture). Le pont public bloque déjà __endpoint,
// donc ces actions ne sont jamais accessibles depuis un lien de partage.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getActiveMembershipServer } from "@/lib/tenant-server";
import { can } from "@/lib/permissions";
import { getEntitlementsForTenant, FROZEN_MESSAGE, frozenMessage } from "@/lib/entitlements";
import { createAgentRule, computeNextRun, type AgentSchedule } from "@/lib/agent-rules";
import { executeRule, type AgentRuleRow } from "@/lib/agent-executor";
import { getLocale } from "@/lib/i18n/server";
import { pick } from "@/lib/i18n/config";

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

const WRITE = new Set(["create", "trigger"]);
const MANAGE = new Set(["create", "pause", "resume", "trigger"]);

export async function POST(req: Request) {
  const locale = await getLocale();
  if (!sameOrigin(req))
    return NextResponse.json({ error: pick(locale, "Origine non autorisée.", "Origin not allowed.") }, { status: 403 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(
      { error: pick(locale, "Authentification requise.", "Authentication required.") },
      { status: 401 }
    );

  const membership = await getActiveMembershipServer(supabase, user.id);
  if (!membership)
    return NextResponse.json({ error: pick(locale, "Aucun espace de travail.", "No workspace.") }, { status: 403 });
  const tenantId = membership.tenant_id;

  let body: {
    action?: string;
    moduleId?: string;
    instruction?: string;
    viewId?: string;
    ruleId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: pick(locale, "Corps de requête invalide.", "Invalid request body.") },
      { status: 400 }
    );
  }
  const action = body.action ?? "";
  const moduleId = typeof body.moduleId === "string" ? body.moduleId : "";

  // RBAC : piloter des agents = agents.manage (owner/admin/manager). Lister est ouvert.
  if (MANAGE.has(action) && !can(membership.role, "agents.manage")) {
    return NextResponse.json(
      {
        error: pick(
          locale,
          "Votre rôle ne permet pas de gérer les agents (Manager/Admin/Propriétaire requis).",
          "Your role does not allow managing agents (Manager/Admin/Owner required)."
        ),
      },
      { status: 403 }
    );
  }
  // Gel lecture seule : créer/déclencher un agent = action facturable.
  if (WRITE.has(action)) {
    const ent = await getEntitlementsForTenant(supabase, tenantId);
    if (!ent.writable) return NextResponse.json({ error: frozenMessage(locale, ent), frozen: true }, { status: 403 });
  }

  const admin = createAdminClient();
  if (!admin)
    return NextResponse.json({ error: pick(locale, "Service indisponible.", "Service unavailable.") }, { status: 503 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aFrom = (t: string) => (admin.from as any)(t);

  // ── Agents rattachés à cette app ─────────────────────────────────────────
  if (action === "list_attached") {
    if (!moduleId) return NextResponse.json({ data: [] });
    const { data } = await aFrom("agent_rules")
      .select("id, title, status, trigger_type, last_run_at, next_run_at, blocked_reason")
      .eq("tenant_id", tenantId)
      .contains("meta", { source_module_id: moduleId })
      .order("created_at", { ascending: false })
      .limit(50);
    return NextResponse.json({ data: data ?? [] });
  }

  // ── Créer un agent DEPUIS l'app (rattaché via meta.source_module_id) ──────
  if (action === "create") {
    const instruction = (body.instruction ?? "").trim();
    if (!instruction)
      return NextResponse.json(
        { error: pick(locale, "Décrivez la mission de l'agent.", "Describe the agent's mission.") },
        { status: 400 }
      );
    const result = await createAgentRule({
      supabase,
      userId: user.id,
      userEmail: user.email ?? null,
      tenantId,
      instruction,
      locale,
    });
    // Rattache la règle à l'app (best-effort, fusion de meta).
    if (result.ok && result.ruleId && moduleId) {
      try {
        const { data: r } = await aFrom("agent_rules").select("meta").eq("id", result.ruleId).eq("tenant_id", tenantId).maybeSingle();
        const meta = r?.meta && typeof r.meta === "object" ? (r.meta as Record<string, unknown>) : {};
        await aFrom("agent_rules")
          .update({ meta: { ...meta, source_module_id: moduleId, source_view_id: body.viewId ?? null } })
          .eq("id", result.ruleId)
          .eq("tenant_id", tenantId);
      } catch {
        /* best-effort */
      }
    }
    // Télémétrie d'usage (Phase 10) : agents activés depuis une app.
    if (result.ok) {
      try {
        await aFrom("app_events").insert({
          user_id: user.id,
          tenant_id: tenantId,
          event_type: "automation_activated",
          metadata: { source: "app", module_id: moduleId || null, rule_id: result.ruleId },
        });
      } catch {
        /* best-effort */
      }
    }
    return NextResponse.json({ ok: result.ok, ruleId: result.ruleId, message: result.message, blocked: result.blocked });
  }

  // ── Pause / reprise (scopées aux agents de l'app) ────────────────────────
  if (action === "pause" || action === "resume") {
    const ruleId = typeof body.ruleId === "string" ? body.ruleId : "";
    if (!ruleId)
      return NextResponse.json(
        { error: pick(locale, "ruleId requis.", "“ruleId” is required.") },
        { status: 400 }
      );
    const { data: rule } = await aFrom("agent_rules")
      .select("id, status, schedule, trigger_type, meta")
      .eq("id", ruleId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!rule)
      return NextResponse.json({ error: pick(locale, "Agent introuvable.", "Agent not found.") }, { status: 404 });
    // Ne piloter QUE les agents rattachés à cette app.
    const src = (rule.meta as Record<string, unknown> | null)?.source_module_id;
    if (moduleId && src !== moduleId) {
      return NextResponse.json(
        {
          error: pick(
            locale,
            "Cet agent n'appartient pas à cette application.",
            "This agent does not belong to this app."
          ),
        },
        { status: 403 }
      );
    }
    if (action === "pause") {
      await aFrom("agent_rules").update({ status: "paused", next_run_at: null }).eq("id", ruleId).eq("tenant_id", tenantId);
      return NextResponse.json({ ok: true, status: "paused" });
    }
    // resume : réarme le prochain passage (planifié) ; les agents-événement se
    // réveillent au tick suivant (next_run non utilisé pareil).
    let next: string | null = null;
    if (rule.trigger_type !== "event") {
      const d = computeNextRun((rule.schedule ?? {}) as AgentSchedule);
      next = d ? d.toISOString() : new Date().toISOString();
    }
    await aFrom("agent_rules").update({ status: "active", next_run_at: next }).eq("id", ruleId).eq("tenant_id", tenantId);
    return NextResponse.json({ ok: true, status: "active" });
  }

  // ── Déclenchement manuel (« lance-le maintenant ») ───────────────────────
  if (action === "trigger") {
    const ruleId = typeof body.ruleId === "string" ? body.ruleId : "";
    if (!ruleId)
      return NextResponse.json(
        { error: pick(locale, "ruleId requis.", "“ruleId” is required.") },
        { status: 400 }
      );
    const { data: rule } = await aFrom("agent_rules").select("*").eq("id", ruleId).eq("tenant_id", tenantId).maybeSingle();
    if (!rule)
      return NextResponse.json({ error: pick(locale, "Agent introuvable.", "Agent not found.") }, { status: 404 });
    const src = (rule.meta as Record<string, unknown> | null)?.source_module_id;
    if (moduleId && src !== moduleId) {
      return NextResponse.json(
        {
          error: pick(
            locale,
            "Cet agent n'appartient pas à cette application.",
            "This agent does not belong to this app."
          ),
        },
        { status: 403 }
      );
    }
    try {
      // runKey manuel unique → n'entre pas en collision avec les créneaux planifiés.
      const runKey = `manual-${user.id.slice(0, 8)}-${Date.now()}`;
      const outcome = await executeRule(admin, rule as AgentRuleRow, runKey);
      return NextResponse.json({ ok: true, status: outcome?.status ?? "done", summary: outcome?.summary ?? "" });
    } catch (e) {
      return NextResponse.json(
        {
          error:
            e instanceof Error ? e.message : pick(locale, "Exécution impossible.", "Execution failed."),
        },
        { status: 400 }
      );
    }
  }

  // ── Validations en attente (agent_outbox), scopées à l'app ───────────────
  if (action === "pending_approvals") {
    // Règles de l'app → on ne montre que les validations de SES agents.
    const { data: rules } = await aFrom("agent_rules")
      .select("id")
      .eq("tenant_id", tenantId)
      .contains("meta", { source_module_id: moduleId })
      .limit(200);
    const ruleIds = (rules ?? []).map((r: { id: string }) => r.id);
    if (!ruleIds.length) return NextResponse.json({ data: [] });
    const { data } = await aFrom("agent_outbox")
      .select("id, rule_id, kind, fiche_label, to_email, subject, body, status, created_at")
      .eq("tenant_id", tenantId)
      .eq("status", "pending")
      .in("rule_id", ruleIds)
      .order("created_at", { ascending: false })
      .limit(100);
    return NextResponse.json({ data: data ?? [] });
  }

  return NextResponse.json(
    { error: pick(locale, `Action inconnue : ${action}`, `Unknown action: ${action}`) },
    { status: 400 }
  );
}
