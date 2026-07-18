// NIVEAU 2 — SMOKE VERTICAL avec le MODÈLE RÉEL (config par défaut inchangée) après
// la barrière hybride. Mesure, sur la mission phare : classifiedKind (brut) vs
// resolvedKind (après barrière), pré-vol/intentions (enrichis si besoin), puis la
// boucle data (recherche → proposition). Base EN MÉMOIRE, transport SIMULÉ, AUCUNE
// exécution. Se saute sans credential.
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
if (!hasAnyLlmKey()) { console.log("SMOKE_SKIP: aucun credential."); process.exit(0); }

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

console.log("== SMOKE VERTICAL (barrière hybride) — classifieur", MODEL_KIND, "| boucle", TIER_SIMPLE, "==");
const RUNS = 3;
let dataResolved = 0, completeCount = 0;
for (let r = 1; r <= RUNS; r++) {
  try {
    globalThis.__E2E_SENT = [];
    const k = await classifyKind({ prompt: MISSION, sector: null, useLLM: true, hasExistingApp: false, history: [] });
    const pf = k.preflight;
    console.log(`\n--- RUN ${r} --- classifiedKind(brut)=${k.classifiedKind} → resolvedKind=${k.kind}` + (k.overrideReason ? " [OVERRIDE]" : ""));
    console.log(`  pré-vol intents=${JSON.stringify(pf?.intents)} complexity=${pf?.complexity}`);
    if (k.kind === "data") dataResolved++;

    const loop = await runAgentLoop({
      model: TIER_SIMPLE, system: buildWorkspaceToolsSystem(), userMessage: MISSION, history: [], db: createFakeSupabase(seed()), actor: ACTOR,
      allowEmail: true, allowSms: false, maxTokens: 1500, confirmGate,
      preflight: pf, maxIterations: budgetForComplexity(pf?.complexity),
    });
    const seq = (loop.steps || []).map((s) => s.tool);
    const prop = loop.proposed.map((p) => ({ tool: p.tool, entity: p.input?.entity }));
    const chantier = prop.some((p) => p.tool === "workspace_update" && p.entity === "chantiers");
    const taskUpd = prop.filter((p) => p.tool === "workspace_update" && p.entity === "tasks").length;
    const comms = prop.filter((p) => p.tool === "send_email" || p.tool === "send_sms").length;
    const offTopic = seq.filter((t) => t === "app_collections" || t === "app_data_list").length;
    const complete = chantier && taskUpd >= 1 && comms >= 1;
    if (complete) completeCount++;
    console.log(`  boucle: iters=${loop.iterations} horsSujet=${offTopic} chantier=${chantier} tâches=${taskUpd} comms=${comms} complète=${complete}`);
    console.log(`  séquence: ${seq.join(" → ")}`);
  } catch (e) {
    console.log(`  RUN ${r} erreur:`, e?.message || String(e));
  }
}
console.log(`\n== SYNTHÈSE == resolvedKind=data : ${dataResolved}/${RUNS} | missions complètes : ${completeCount}/${RUNS}`);
console.log("SMOKE_DONE");
