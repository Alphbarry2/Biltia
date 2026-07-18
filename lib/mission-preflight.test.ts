// Tests unitaires — PRÉ-VOL LÉGER. Lancer :
//   node --test --experimental-strip-types lib/mission-preflight.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizePreflight,
  fallbackPreflight,
  buildOutcomes,
  evaluateOutcomes,
  pendingOutcomes,
  missionComplete,
  checklistPromptBlock,
  buildChecklistReport,
  budgetForComplexity,
  appToolsAllowed,
  isLoopIntent,
} from "./mission-preflight.ts";

const MISSION = "Décale le chantier Dupont de trois jours, déplace les tâches associées et préviens l'équipe.";

// ── 1. Demande simple → une intention ─────────────────────────────────────────
test("1 · simple : une intention → complexity simple, budget 6", () => {
  const pf = normalizePreflight({ intents: ["retrieve"], goal: "trouver un devis" }, "answer", "le devis de Martin");
  assert.deepEqual(pf.intents, ["retrieve"]);
  assert.equal(pf.complexity, "simple");
  assert.equal(budgetForComplexity(pf.complexity), 6);
});

// ── 2-3. Multi-actions : chantier + tâches + communication ────────────────────
test("2-3 · multi_step : trois intentions (chantier + tâches + communication)", () => {
  const pf = normalizePreflight(
    { kind: "data", goal: "Décaler le chantier et coordonner", intents: ["update_chantier", "update_related_tasks", "prepare_communication"], expected_outputs: ["chantier +3j", "tâches +3j", "messages équipe préparés"], tool_groups: ["workspace_read", "workspace_write", "communication"], complexity: "multi_step", confidence: 0.9 },
    "data", MISSION
  );
  assert.deepEqual(pf.intents, ["update_chantier", "update_related_tasks", "prepare_communication"]);
  assert.equal(pf.complexity, "multi_step");
  assert.equal(budgetForComplexity(pf.complexity), 8);
  assert.equal(pf.toolGroups.includes("communication"), true);
});

// ── 4-5. Document / application seules → aucune intention de boucle ────────────
test("4 · document seul : aucune intention adressable par la boucle", () => {
  const pf = normalizePreflight({ intents: ["generate_document"] }, "document", "fais un devis");
  assert.equal(buildOutcomes(pf).length, 0);
  assert.equal(checklistPromptBlock(pf), "");
});
test("5 · application seule : create_application, hors boucle data", () => {
  const pf = normalizePreflight({ intents: ["create_application"] }, "module", "app de pointage");
  assert.equal(buildOutcomes(pf).length, 0);
  assert.equal(appToolsAllowed(pf), true); // groupe applications → app tools autorisés
});

// ── 6. Classification compatible (kind conservé) ──────────────────────────────
test("6 · le kind existant est conservé", () => {
  assert.equal(normalizePreflight({ intents: ["update_chantier"] }, "data", MISSION).kind, "data");
  assert.equal(fallbackPreflight("answer", "q").kind, "answer");
});

// ── 7-8. Invalide / faible confiance → fallback ───────────────────────────────
test("7 · pré-vol invalide → fallback (intents=other, non bloquant)", () => {
  const pf = normalizePreflight({ intents: ["zzz", 42] }, "data", MISSION);
  assert.deepEqual(pf.intents, ["other"]);
  assert.equal(pf.confidence, 0);
  assert.equal(buildOutcomes(pf).length, 0);
});
test("8 · absent → fallback minimal sûr", () => {
  const pf = normalizePreflight(undefined, "answer", "bonjour");
  assert.deepEqual(pf.intents, ["other"]);
  assert.equal(pf.complexity, "simple");
});

// Fixtures d'actions
const proposed3 = [
  { tool: "workspace_update", entity: "chantiers" },
  { tool: "workspace_update", entity: "tasks" },
  { tool: "send_email" },
];
const pfMulti = normalizePreflight({ intents: ["update_chantier", "update_related_tasks", "prepare_communication"], tool_groups: ["workspace_read", "workspace_write", "communication"], complexity: "multi_step" }, "data", MISSION);

// ── 9. Checklist entièrement proposée ─────────────────────────────────────────
test("9 · checklist entièrement proposée → mission complète, aucun pending", () => {
  const outcomes = evaluateOutcomes(pfMulti, { proposed: proposed3 });
  assert.equal(pendingOutcomes(outcomes).length, 0);
  assert.equal(missionComplete(outcomes), true);
  assert.ok(outcomes.every((o) => o.status === "proposed"));
});

// ── 10-11. Intention encore pending → mission incomplète ──────────────────────
test("10-11 · communication oubliée → pending, mission NON complète", () => {
  const outcomes = evaluateOutcomes(pfMulti, { proposed: [{ tool: "workspace_update", entity: "chantiers" }, { tool: "workspace_update", entity: "tasks" }] });
  const pend = pendingOutcomes(outcomes);
  assert.equal(pend.length, 1);
  assert.equal(pend[0].intent, "prepare_communication");
  assert.equal(missionComplete(outcomes), false);
});

// ── 12-13. Bloqué / partiel ───────────────────────────────────────────────────
test("12-13 · vérification mismatch → partial ; échec → failed", () => {
  const outcomes = evaluateOutcomes(pfMulti, {
    proposed: proposed3,
    verifications: [
      { toolName: "workspace_update", entity: "chantiers", status: "verified" },
      { toolName: "workspace_update", entity: "tasks", status: "mismatch" },
      { toolName: "send_email", status: "failed" },
    ],
  });
  const byIntent = Object.fromEntries(outcomes.map((o) => [o.intent, o.status]));
  assert.equal(byIntent["update_chantier"], "verified");
  assert.equal(byIntent["update_related_tasks"], "partial");
  assert.equal(byIntent["prepare_communication"], "failed");
});

// ── 14-16. Mapping action → outcome ───────────────────────────────────────────
test("14 · workspace_update chantiers → update_chantier", () => {
  const o = evaluateOutcomes(normalizePreflight({ intents: ["update_chantier"] }, "data", MISSION), { proposed: [{ tool: "workspace_update", entity: "chantiers" }] });
  assert.equal(o[0].status, "proposed");
});
test("15 · send_email proposé → prepare_communication", () => {
  const o = evaluateOutcomes(normalizePreflight({ intents: ["prepare_communication"] }, "data", MISSION), { proposed: [{ tool: "send_email" }] });
  assert.equal(o[0].status, "proposed");
});
test("16 · vérification verified → outcome verified ; not_verifiable → verified", () => {
  const o1 = evaluateOutcomes(normalizePreflight({ intents: ["update_chantier"] }, "data", MISSION), { verifications: [{ toolName: "workspace_update", entity: "chantiers", status: "verified" }] });
  assert.equal(o1[0].status, "verified");
  const o2 = evaluateOutcomes(normalizePreflight({ intents: ["prepare_communication"] }, "data", MISSION), { verifications: [{ toolName: "send_email", status: "not_verifiable" }] });
  assert.equal(o2[0].status, "verified");
});

// ── 17-20. Budget dynamique + plafond ─────────────────────────────────────────
test("17-20 · budget : simple 6, multi_step 8, complex 10, plafond dur", () => {
  assert.equal(budgetForComplexity("simple"), 6);
  assert.equal(budgetForComplexity("multi_step"), 8);
  assert.equal(budgetForComplexity("complex"), 10);
  assert.equal(budgetForComplexity(undefined), 6);
});

// ── 21-22. Gating des outils d'application ────────────────────────────────────
test("21 · mission chantier → app_collections NON autorisé", () => {
  assert.equal(appToolsAllowed(pfMulti), false);
});
test("22 · mission application → outils d'application autorisés", () => {
  const pf = normalizePreflight({ intents: ["create_application"], tool_groups: ["applications", "workspace_write"] }, "module", "app");
  assert.equal(appToolsAllowed(pf), true);
});

// ── 23. Compatibilité confirmation (les envois restent des intentions à proposer) ─
test("23 · send_email compte comme communication (soumise à confirmation ailleurs)", () => {
  assert.equal(isLoopIntent("prepare_communication"), true);
  assert.equal(isLoopIntent("generate_document"), false);
});

// ── 24. Compte rendu honnête en cas de volet non traité ───────────────────────
test("24 · compte rendu honnête : jamais « tout est prêt » si un volet est pending", () => {
  const outcomes = evaluateOutcomes(pfMulti, { proposed: [{ tool: "workspace_update", entity: "chantiers" }, { tool: "workspace_update", entity: "tasks" }] });
  const report = buildChecklistReport(outcomes);
  assert.match(report, /n'est pas entièrement préparée/i);
  assert.match(report, /✓/);
  assert.match(report, /non encore traité/i);
  assert.doesNotMatch(report, /tout est prêt/i);
});

// ── Prompt checklist ──────────────────────────────────────────────────────────
test("checklistPromptBlock : objectif + cases + règle de fin", () => {
  const block = checklistPromptBlock(pfMulti);
  assert.match(block, /RÉSULTATS ATTENDUS/);
  assert.match(block, /□/);
  assert.match(block, /ne termine PAS la mission/i);
  assert.match(block, /uniquement les outils utiles/i);
});
