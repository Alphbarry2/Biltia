// NIVEAU 2 — SMOKE TESTS avec le VRAI modèle de la boucle data (3 exécutions A/B).
// Compare SANS pré-vol (budget 6, pas de checklist) vs AVEC pré-vol (budget dynamique
// + checklist). LLM réel (credential DÉJÀ présent) ; base EN MÉMOIRE ; transport
// SIMULÉ ; AUCUNE exécution (tour 1). Se saute proprement sans credential.
//
// Lancer : node --env-file=<.env.local> --experimental-strip-types --import ./e2e/register.mjs e2e/smoke-llm.mjs
import { runAgentLoop, buildWorkspaceToolsSystem } from "@/lib/agent-tools";
import { requiresConfirmation } from "@/lib/action-risk";
import { classifyKind } from "@/lib/kind-router";
import { budgetForComplexity } from "@/lib/mission-preflight";
import { hasAnyLlmKey } from "@/lib/llm";
import { TIER_SIMPLE, MODEL_KIND } from "@/lib/models";
import { createFakeSupabase } from "./fake-supabase.mjs";

globalThis.__E2E_SENT = [];
globalThis.__E2E_TRANSPORT = {};

if (!hasAnyLlmKey()) {
  console.log("SMOKE_SKIP: aucun credential LLM déjà disponible — Niveau 2 non exécuté (le Niveau A déterministe fait foi).");
  process.exit(0);
}

const MISSION = "Décale le chantier Dupont de trois jours, déplace les tâches associées et préviens l'équipe.";
const ACTOR = { tenantId: "tenant-A", userId: "user-A", label: "Assistant", fromEmail: "owner@biltia.test" };
const seed = () => ({
  chantiers: [{ id: "A-ch", tenant_id: "tenant-A", nom: "Rénovation Dupont", client_id: "A-client", statut: "planifie", date_debut: "2026-08-10", date_fin_prevue: "2026-08-14" }],
  clients: [{ id: "A-client", tenant_id: "tenant-A", nom: "Dupont" }],
  tasks: [
    { id: "A-t1", tenant_id: "tenant-A", title: "Préparation", chantier_id: "A-ch", assignee_id: "A-e1", status: "todo", due_date: "2026-08-10" },
    { id: "A-t2", tenant_id: "tenant-A", title: "Installation", chantier_id: "A-ch", assignee_id: "A-e2", status: "todo", due_date: "2026-08-12" },
    { id: "A-t3", tenant_id: "tenant-A", title: "Contrôle", chantier_id: "A-ch", assignee_id: "A-e1", status: "todo", due_date: "2026-08-14" },
  ],
  employees: [
    { id: "A-e1", tenant_id: "tenant-A", nom: "Test", prenom: "Karim", email: "karim.test@biltia.test" },
    { id: "A-e2", tenant_id: "tenant-A", nom: "Test", prenom: "Lucas", email: "lucas.test@biltia.test" },
  ],
});
const confirmGate = (t) => requiresConfirmation(t, { alwaysConfirm: true });

function metrics(loop) {
  const seq = (loop.steps || []).map((s) => s.tool);
  const prop = loop.proposed.map((p) => ({ tool: p.tool, entity: p.input?.entity }));
  return {
    iterations: loop.iterations,
    toolCalls: seq.length,
    offTopic: seq.filter((t) => t === "app_collections" || t === "app_data_list").length,
    chantierUpd: prop.some((p) => p.tool === "workspace_update" && p.entity === "chantiers"),
    taskUpd: prop.filter((p) => p.tool === "workspace_update" && p.entity === "tasks").length,
    comms: prop.filter((p) => p.tool === "send_email" || p.tool === "send_sms").length,
    seq: seq.join(" → "),
  };
}
const complete = (m) => m.chantierUpd && m.taskUpd >= 1 && m.comms >= 1;

async function runLoop({ preflight }) {
  globalThis.__E2E_SENT = [];
  const loop = await runAgentLoop({
    model: TIER_SIMPLE, system: buildWorkspaceToolsSystem(), userMessage: MISSION, history: [], db: createFakeSupabase(seed()), actor: ACTOR,
    allowEmail: true, allowSms: false, maxTokens: 1500, confirmGate,
    preflight: preflight || undefined,
    maxIterations: preflight ? budgetForComplexity(preflight.complexity) : 6,
  });
  return metrics(loop);
}

console.log("== SMOKE NIVEAU 2 — modèles RÉELS ==");
console.log("classifieur :", MODEL_KIND, "| boucle data :", TIER_SIMPLE);
const RUNS = 3;
const agg = { without: { complete: 0, iters: [], offTopic: [], comms: [] }, with: { complete: 0, iters: [], offTopic: [], comms: [] } };

for (let r = 1; r <= RUNS; r++) {
  try {
    const k = await classifyKind({ prompt: MISSION, sector: null, useLLM: true, hasExistingApp: false, history: [] });
    const pf = k.preflight;
    console.log(`\n--- RUN ${r} --- classification: ${k.kind} | intents: ${JSON.stringify(pf?.intents)} | complexity: ${pf?.complexity}`);

    const mo = await runLoop({ preflight: null });
    console.log(`  SANS pré-vol : iters=${mo.iterations} outils=${mo.toolCalls} horsSujet=${mo.offTopic} chantier=${mo.chantierUpd} tâches=${mo.taskUpd} comms=${mo.comms} complet=${complete(mo)}`);
    console.log(`    séquence: ${mo.seq}`);

    const mw = await runLoop({ preflight: pf });
    console.log(`  AVEC pré-vol : iters=${mw.iterations} outils=${mw.toolCalls} horsSujet=${mw.offTopic} chantier=${mw.chantierUpd} tâches=${mw.taskUpd} comms=${mw.comms} complet=${complete(mw)}`);
    console.log(`    séquence: ${mw.seq}`);

    agg.without.complete += complete(mo) ? 1 : 0; agg.without.iters.push(mo.iterations); agg.without.offTopic.push(mo.offTopic); agg.without.comms.push(mo.comms);
    agg.with.complete += complete(mw) ? 1 : 0; agg.with.iters.push(mw.iterations); agg.with.offTopic.push(mw.offTopic); agg.with.comms.push(mw.comms);
  } catch (e) {
    console.log(`  RUN ${r} erreur:`, e?.message || String(e));
  }
}

const avg = (a) => (a.length ? (a.reduce((s, x) => s + x, 0) / a.length).toFixed(1) : "n/a");
console.log("\n== SYNTHÈSE (", RUNS, "runs ) ==");
console.log(`SANS pré-vol : missions complètes ${agg.without.complete}/${RUNS} | iters moy ${avg(agg.without.iters)} | horsSujet moy ${avg(agg.without.offTopic)} | comms moy ${avg(agg.without.comms)}`);
console.log(`AVEC pré-vol : missions complètes ${agg.with.complete}/${RUNS} | iters moy ${avg(agg.with.iters)} | horsSujet moy ${avg(agg.with.offTopic)} | comms moy ${avg(agg.with.comms)}`);
console.log("SMOKE_DONE");
