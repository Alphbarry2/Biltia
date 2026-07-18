// WS-E — agent_run_steps, redaction, ai_usage.run_id, supervision (base locale).
// Utilise les VRAIES fonctions (persistRunSteps, draftToolStep, buildSupervisionRows).
import { adminClient, testTenantIds, TEST_USERS, check, summary } from "./_guard.mjs";
import { persistRunSteps, draftToolStep, draftBlockedStep } from "../../lib/agent-observability.ts";
import { buildSupervisionRows, STALE_GRACE_MS } from "../../lib/agent-supervision.ts";

const admin = adminClient();
const t = await testTenantIds(admin);
const tenantId = t.A;

// 1) Règle + passage de test (FK).
const { data: rule, error: rErr } = await admin.from("agent_rules").insert({
  tenant_id: tenantId,
  created_by: TEST_USERS.ownerA,
  title: "BILTIA_TEST agent",
  instruction: "BILTIA_TEST surveiller",
  trigger_type: "schedule",
  status: "active",
  schedule: { time: "09:00", days: [5], tz: "Europe/Paris" },
  next_run_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // créneau passé
}).select("id").single();
check("agent_rules inséré", !rErr && !!rule?.id);

const { data: run, error: runErr } = await admin.from("agent_runs").insert({
  rule_id: rule?.id, tenant_id: tenantId, run_key: `test-${Date.now()}`, status: "running",
}).select("id").single();
check("agent_runs inséré", !runErr && !!run?.id);

// 2) Persistance des étapes RÉDIGÉES (vraie fonction).
const drafts = [
  draftToolStep("workspace_list", { entity: "chantiers", search: "Dupont" }, { count: 3, rows: [] }),
  draftToolStep("workspace_create", { entity: "devis", values: { nom: "Villa Secret" } }, { ok: true, id: "d-xyz" }),
  draftBlockedStep("workspace_delete", { entity: "clients", id: "secret-uuid" }),
];
await persistRunSteps(admin, run.id, tenantId, drafts);

const { data: steps } = await admin.from("agent_run_steps").select("seq, kind, tool, entity, input_redacted, result_summary").eq("run_id", run.id).order("seq");
check("3 étapes persistées", (steps ?? []).length === 3);
check("seq ordonné 0,1,2", JSON.stringify((steps ?? []).map((s) => s.seq)) === "[0,1,2]");
check("kinds read/write/blocked", JSON.stringify((steps ?? []).map((s) => s.kind)) === '["read","write","blocked"]');
const dump = JSON.stringify(steps ?? []);
check("AUCUNE donnée sensible (search/valeur/id) dans les étapes", !dump.includes("Dupont") && !dump.includes("Villa Secret") && !dump.includes("secret-uuid"));

// 3) Liaison ai_usage.run_id.
const { error: uErr } = await admin.from("ai_usage").insert({
  user_id: TEST_USERS.ownerA, tenant_id: tenantId, action: "data_op", model: "test",
  input_tokens: 1, output_tokens: 1, cost_usd: 0, credits: 0, run_id: run.id,
});
check("ai_usage inséré avec run_id", !uErr);
const { data: usage } = await admin.from("ai_usage").select("run_id").eq("run_id", run.id);
check("ai_usage relié au passage (run_id)", (usage ?? []).length >= 1);

// 4) Supervision (pur) : alerte stale sur un agent actif au créneau dépassé.
const nowMs = Date.now();
const rows = buildSupervisionRows(
  [{ id: rule.id, title: "T", status: "active", trigger_type: "schedule", next_run_at: new Date(nowMs - STALE_GRACE_MS - 60000).toISOString(), last_run_at: null }],
  [{ rule_id: rule.id, status: "running", summary: null, error: null, finished_at: null, created_at: new Date().toISOString() }],
  nowMs
);
check("supervision : agent actif dépassé → stale", rows[0]?.stale === true);
check("supervision : dernier passage rattaché", rows[0]?.last_status === "running");

summary("WS-E");
