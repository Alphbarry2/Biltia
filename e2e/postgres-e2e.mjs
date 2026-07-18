// ─────────────────────────────────────────────────────────────────────────────
// E2E RÉEL — PostgreSQL + Auth (GoTrue) + PostgREST + RLS RÉELLE.
//
// Le MÊME code d'orchestration (runAgentLoop, workspace_search, executeConfirmedPlan,
// vérification post-action) tourne contre un vrai Supabase local (schéma = baseline
// contractuel, PAS la chaîne historique), avec un utilisateur AUTHENTIFIÉ et la RLS
// active. Le modèle est SIMULÉ (aucune clé LLM) ; le transport email est SIMULÉ.
//
// Se saute proprement si SUPABASE_URL / clés absents (exécuté seulement en CI).
// ─────────────────────────────────────────────────────────────────────────────
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.ANTHROPIC_API_KEY ||= "e2e-test-key"; // classifieur → chemin LLM (intercepté)

import { createClient } from "@supabase/supabase-js";
import { runAgentLoop, executeConfirmedPlan, buildWorkspaceToolsSystem } from "@/lib/agent-tools";
import { requiresConfirmation } from "@/lib/action-risk";
import { classifyKind } from "@/lib/kind-router";
import { budgetForComplexity } from "@/lib/mission-preflight";
import { client } from "@/lib/llm";

const URL = process.env.SUPABASE_URL, SRK = process.env.SUPABASE_SERVICE_ROLE_KEY, ANON = process.env.SUPABASE_ANON_KEY;
const skip = !URL || !SRK || !ANON ? "env Supabase local absent (test réservé à la CI)" : false;

const MISSION = "Décale le chantier Dupont de trois jours, déplace les tâches associées et préviens l'équipe.";
const PW = "BILTIA_TEST_pw_123!";
const T_A = "aaaaaaaa-0000-4000-8000-000000000001", T_B = "bbbbbbbb-0000-4000-8000-000000000001";
const A_CLIENT = "aaaaaaaa-0000-4000-8000-000000000010", A_CH = "aaaaaaaa-0000-4000-8000-000000000020";
const A_T1 = "aaaaaaaa-0000-4000-8000-000000000021", A_T2 = "aaaaaaaa-0000-4000-8000-000000000022", A_T3 = "aaaaaaaa-0000-4000-8000-000000000023";
const A_E1 = "aaaaaaaa-0000-4000-8000-000000000030", A_E2 = "aaaaaaaa-0000-4000-8000-000000000031";
const B_CLIENT = "bbbbbbbb-0000-4000-8000-000000000010", B_CH = "bbbbbbbb-0000-4000-8000-000000000020", B_T1 = "bbbbbbbb-0000-4000-8000-000000000021";
const addDays = (iso, n) => new Date(new Date(iso + "T00:00:00Z").getTime() + n * 86400000).toISOString().slice(0, 10);

// ── Modèle SIMULÉ (réagit aux VRAIS résultats d'outils) ───────────────────────
function extractResults(messages) {
  const calls = {}; const out = [];
  for (const m of messages) {
    if (m.role === "assistant" && Array.isArray(m.content)) for (const b of m.content) if (b?.type === "tool_use") calls[b.id] = { name: b.name, input: b.input };
    if (m.role === "user" && Array.isArray(m.content)) for (const b of m.content) if (b?.type === "tool_result") { let c = {}; try { c = JSON.parse(typeof b.content === "string" ? b.content : "{}"); } catch {} out.push({ name: calls[b.tool_use_id]?.name, input: calls[b.tool_use_id]?.input, content: c }); }
  }
  return out;
}
let uid = 0;
function missionModel() {
  return async (params) => {
    const usage = { input_tokens: 10, output_tokens: 6 };
    const isClassify = (params.tools || []).some((t) => t.name === "classify_request") || params.tool_choice?.name === "classify_request";
    if (isClassify) return { content: [{ type: "tool_use", id: `k${++uid}`, name: "classify_request", input: { kind: "data", doc_type: "", email_to: "", email_subject: "", email_body: "", task_audience: "", targets_open_app: false, out_of_scope: false, oos_alternative: "", confidence: 0.96, goal: "Décaler le chantier et coordonner", intents: ["update_chantier", "update_related_tasks", "prepare_communication"], expected_outputs: ["chantier déplacé", "tâches déplacées", "équipe prévenue"], tool_groups: ["workspace_read", "workspace_write", "communication"], complexity: "multi_step" } }], usage, stop_reason: "tool_use" };
    const say = (t) => ({ content: [{ type: "text", text: t }], usage, stop_reason: "end_turn" });
    const T = (name, input) => ({ type: "tool_use", id: `t${++uid}`, name, input });
    const emit = (b) => ({ content: b, usage, stop_reason: "tool_use" });
    const r = extractResults(params.messages);
    const search = r.find((x) => x.name === "workspace_search");
    const got = r.find((x) => x.name === "workspace_get");
    const tks = r.find((x) => x.name === "workspace_list" && x.input?.entity === "tasks");
    const emp = r.find((x) => x.name === "workspace_list" && x.input?.entity === "employees");
    const wrote = r.some((x) => x.name === "workspace_update" || x.name === "send_email");
    if (!search) return emit([T("workspace_search", { query: "Dupont", entity: "chantiers" })]);
    if (search.content?.resolution !== "unique") return say("Ambigu ou introuvable — rien modifié.");
    const chId = search.content.results[0].id;
    if (!got || !tks || !emp) return emit([T("workspace_get", { entity: "chantiers", id: chId }), T("workspace_list", { entity: "tasks", match: { chantier_id: chId } }), T("workspace_list", { entity: "employees" })]);
    if (!wrote) {
      const ch = got.content.row; const tasks = tks.content.rows || []; const emps = emp.content.rows || [];
      return emit([
        T("workspace_update", { entity: "chantiers", id: chId, values: { date_debut: addDays(ch.date_debut, 3), date_fin_prevue: addDays(ch.date_fin_prevue, 3) } }),
        ...tasks.map((t) => T("workspace_update", { entity: "tasks", id: t.id, values: { due_date: addDays(t.due_date, 3) } })),
        ...emps.map((e) => T("send_email", { to: [e.email], subject: "Chantier décalé", body: `Bonjour ${e.prenom}, chantier décalé de 3 jours.` })),
      ]);
    }
    return say("Je vais décaler le chantier et prévenir l'équipe — dès ta confirmation.");
  };
}

test("PostgreSQL/Auth/RLS — parcours vertical réel + isolation tenant", { skip }, async () => {
  globalThis.__E2E_SENT = []; globalThis.__E2E_TRANSPORT = {};
  const admin = createClient(URL, SRK, { auth: { persistSession: false, autoRefreshToken: false } });

  // Idempotence : purge des fixtures (cascade) d'un run précédent.
  await admin.from("tenants").delete().in("id", [T_A, T_B]);

  // ── Auth réelle : deux utilisateurs (owner A, owner B) ──────────────────────
  const mkUser = async (email) => {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
    if (!error) return data.user.id;
    const list = await admin.auth.admin.listUsers();
    const u = list.data.users.find((x) => x.email === email);
    if (!u) throw error;
    return u.id;
  };
  const userA = await mkUser("owner-a@biltia.test");
  const userB = await mkUser("owner-b@biltia.test");

  // ── Seed (admin, bypass RLS) : tenants A/B + membres + fixtures ──────────────
  await admin.from("tenants").insert([{ id: T_A, name: "BILTIA_TEST Alpha Bâtiment" }, { id: T_B, name: "BILTIA_TEST Bravo" }]);
  await admin.from("tenant_members").insert([{ tenant_id: T_A, user_id: userA, role: "owner" }, { tenant_id: T_B, user_id: userB, role: "owner" }]);
  await admin.from("clients").insert([{ id: A_CLIENT, tenant_id: T_A, nom: "Dupont" }, { id: B_CLIENT, tenant_id: T_B, nom: "Dupont" }]);
  await admin.from("employees").insert([
    { id: A_E1, tenant_id: T_A, nom: "Test", prenom: "Karim", email: "karim.test@biltia.test" },
    { id: A_E2, tenant_id: T_A, nom: "Test", prenom: "Lucas", email: "lucas.test@biltia.test" },
  ]);
  await admin.from("chantiers").insert([
    { id: A_CH, tenant_id: T_A, nom: "Rénovation Dupont", client_id: A_CLIENT, statut: "planifie", date_debut: "2026-08-10", date_fin_prevue: "2026-08-14" },
    { id: B_CH, tenant_id: T_B, nom: "Dupont B", client_id: B_CLIENT, statut: "planifie", date_debut: "2026-09-01", date_fin_prevue: "2026-09-05" },
  ]);
  await admin.from("tasks").insert([
    { id: A_T1, tenant_id: T_A, title: "Préparation", chantier_id: A_CH, assignee_id: A_E1, due_date: "2026-08-10" },
    { id: A_T2, tenant_id: T_A, title: "Installation", chantier_id: A_CH, assignee_id: A_E2, due_date: "2026-08-12" },
    { id: A_T3, tenant_id: T_A, title: "Contrôle", chantier_id: A_CH, assignee_id: A_E1, due_date: "2026-08-14" },
    { id: B_T1, tenant_id: T_B, title: "Tâche B", chantier_id: B_CH, due_date: "2026-09-01" },
  ]);

  // ── Session AUTHENTIFIÉE (owner A) → client RLS-scopé ───────────────────────
  const A = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: signErr } = await A.auth.signInWithPassword({ email: "owner-a@biltia.test", password: PW });
  assert.ok(!signErr, `sign-in A: ${signErr?.message}`);

  // ── RLS RÉELLE : A voit son chantier, PAS celui du tenant B ─────────────────
  const seenA = await A.from("chantiers").select("id").eq("id", A_CH);
  assert.equal((seenA.data || []).length, 1, "A voit son propre chantier");
  const seenB = await A.from("chantiers").select("id").eq("id", B_CH);
  assert.equal((seenB.data || []).length, 0, "RLS : A ne voit PAS le chantier du tenant B");

  // ── Parcours : classification → boucle data (client A, RLS) → confirmation ──
  client.messages.create = missionModel();
  const actorA = { tenantId: T_A, userId: userA, label: "Assistant", fromEmail: "owner-a@biltia.test" };
  const k = await classifyKind({ prompt: MISSION, sector: null, useLLM: true, hasExistingApp: false, history: [] });
  assert.equal(k.kind, "data");
  const loop = await runAgentLoop({
    model: "test", system: buildWorkspaceToolsSystem(), userMessage: MISSION, history: [], db: A, actor: actorA,
    allowEmail: true, allowSms: false, maxTokens: 1200, confirmGate: (t) => requiresConfirmation(t, { alwaysConfirm: true }),
    preflight: k.preflight, maxIterations: budgetForComplexity(k.preflight?.complexity),
  });
  assert.equal(loop.proposed.length, 6, "6 actions proposées, 0 exécutée au tour 1");

  // ── Confirmation → exécution RÉELLE (écritures Postgres via A) + vérification ─
  const res = await executeConfirmedPlan(A, actorA, "owner", loop.proposed);
  assert.equal(res.denied, 0);

  // ── État final (relu via admin) ─────────────────────────────────────────────
  const ch = (await admin.from("chantiers").select("date_debut,date_fin_prevue").eq("id", A_CH).single()).data;
  assert.equal(ch.date_debut, "2026-08-13"); assert.equal(ch.date_fin_prevue, "2026-08-17");
  const dues = (await admin.from("tasks").select("due_date").eq("chantier_id", A_CH)).data.map((t) => t.due_date).sort();
  assert.deepEqual(dues, ["2026-08-13", "2026-08-15", "2026-08-17"]);
  assert.equal(globalThis.__E2E_SENT.length, 2, "2 emails acceptés (simulés)");
  const verified = res.verifications.filter((v) => v.status === "verified").length;
  assert.equal(verified, 4, "chantier + 3 tâches vérifiés");
  assert.equal(res.verified, false, "envois non vérifiables → pas « tout vérifié »");
  assert.doesNotMatch(res.report, /tout est terminé/i);

  // ── Isolation tenant B (aucune fuite/écriture) ──────────────────────────────
  const bch = (await admin.from("chantiers").select("date_debut,date_fin_prevue").eq("id", B_CH).single()).data;
  assert.equal(bch.date_debut, "2026-09-01"); assert.equal(bch.date_fin_prevue, "2026-09-05");
  const bt = (await admin.from("tasks").select("due_date").eq("id", B_T1).single()).data;
  assert.equal(bt.due_date, "2026-09-01");

  console.log("[PG] chantier", ch.date_debut, "→", ch.date_fin_prevue, "| tâches", dues.join(","), "| tenant B intact | RLS ok");
});
