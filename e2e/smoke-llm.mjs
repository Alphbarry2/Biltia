// NIVEAU 2 — SMOKE TEST avec le VRAI modèle de la boucle data (une seule mission).
// LLM réel (via le credential DÉJÀ présent) ; base EN MÉMOIRE ; transport SIMULÉ
// (aucun envoi) ; AUCUNE exécution (tour 1 seulement : classification + proposition).
// Se saute proprement s'il n'y a aucun credential. Ne révèle aucune clé.
//
// Lancer : node --env-file=<.env.local> --experimental-strip-types --import ./e2e/register.mjs e2e/smoke-llm.mjs
import { runAgentLoop, buildWorkspaceToolsSystem } from "@/lib/agent-tools";
import { requiresConfirmation } from "@/lib/action-risk";
import { classifyKind } from "@/lib/kind-router";
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
const db = createFakeSupabase({
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

console.log("== SMOKE NIVEAU 2 (modèle RÉEL) ==");
console.log("Modèle classifieur :", MODEL_KIND, "| Modèle boucle data :", TIER_SIMPLE);
try {
  const k = await classifyKind({ prompt: MISSION, sector: null, useLLM: true, hasExistingApp: false, history: [] });
  console.log("Classification RÉELLE →", k.kind, "| méthode", k.method, "| conf", k.confidence);

  const loop = await runAgentLoop({
    model: TIER_SIMPLE, system: buildWorkspaceToolsSystem(), userMessage: MISSION, history: [], db, actor: ACTOR,
    allowEmail: true, allowSms: false, maxIterations: 6, maxTokens: 1500,
    confirmGate: (t) => requiresConfirmation(t, { alwaysConfirm: true }),
  });
  const seq = (loop.steps || []).map((s) => s.tool);
  console.log("Séquence outils RÉELLE :", seq.join(" → ") || "(aucun)");
  console.log("Itérations :", loop.iterations, "| proposées :", loop.proposed.length, "| écritures réelles :", db.__audit.writes, "| envois réels :", globalThis.__E2E_SENT.length);
  console.log("Actions proposées :", JSON.stringify(loop.proposed.map((p) => ({ tool: p.tool, entity: p.input?.entity, id: p.input?.id })).slice(0, 8)));
  console.log("finalText :", String(loop.finalText || "").replace(/\s+/g, " ").slice(0, 280));
  const usedSearch = seq.includes("workspace_search");
  const proposedUpdate = loop.proposed.some((p) => p.tool === "workspace_update");
  console.log("SMOKE_RESULT:", JSON.stringify({ classifiedData: k.kind === "data", usedSearch, proposedUpdate, realWrites: db.__audit.writes, realSends: globalThis.__E2E_SENT.length }));
} catch (e) {
  console.log("SMOKE_ERROR:", e?.message || String(e));
}
