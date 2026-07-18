// Tests unitaires — AIGUILLAGE HYBRIDE. Lancer :
//   node --test --experimental-strip-types lib/hybrid-routing.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectOperationalSignals, resolveOperationalKind, deriveIntentsFromSignals } from "./hybrid-routing.ts";

const FLAGSHIP = "Décale le chantier Dupont de trois jours, déplace les tâches associées et préviens l'équipe.";
const resolve = (prompt, classifiedKind) => resolveOperationalKind({ prompt, classifiedKind });

// ── Signaux ───────────────────────────────────────────────────────────────────
test("signaux : mission phare → mutation + chantier/tâches + communication", () => {
  const s = detectOperationalSignals(FLAGSHIP);
  assert.equal(s.mutation, true);
  assert.equal(s.communication, true);
  assert.equal(s.hasBusinessMutation, true);
  assert.ok(s.entities.includes("chantier") && s.entities.includes("tasks") && s.entities.includes("employe"));
});

// ── 1-3. Override task/module → data ──────────────────────────────────────────
test("1 · chantier + tâches + communication → data", () => {
  assert.equal(resolve(FLAGSHIP, "data").resolvedKind, "data");
});
test("2 · modèle brut task → override data", () => {
  const r = resolve(FLAGSHIP, "task");
  assert.equal(r.resolvedKind, "data");
  assert.equal(r.classifiedKind, "task");
  assert.match(String(r.overrideReason), /inaccessible|data/i);
});
test("3 · modèle brut module → override data", () => {
  assert.equal(resolve(FLAGSHIP, "module").resolvedKind, "data");
});

// ── 4. « task » = message groupé ; une FICHE tâche = data ─────────────────────
test("4 · créer une fiche tâche → data (task = message groupé, pas une fiche)", () => {
  // Créer une tâche = écriture de fiche → data (même si le modèle dit « task »).
  assert.equal(resolve("Crée une tâche « rappeler le client » pour Karim", "task").resolvedKind, "data");
  // VRAI « task » = message à un GROUPE, sans écriture de fiche → préservé.
  assert.equal(resolve("Préviens toute l'équipe qu'on commence à 7h demain", "task").resolvedKind, "task");
});

// ── 5. Plusieurs tâches liées à un chantier → data ────────────────────────────
test("5 · modifier plusieurs tâches liées à un chantier → data", () => {
  assert.equal(resolve("Change les dates de toutes les tâches du chantier Morel", "task").resolvedKind, "data");
});

// ── 6. Email seul → email (préservé) ──────────────────────────────────────────
test("6 · envoyer un email à une personne, sans écriture → email préservé", () => {
  assert.equal(resolve("Envoie un email à jean@x.fr pour confirmer le rendez-vous", "email").resolvedKind, "email");
});

// ── 7. Modification + email → data ────────────────────────────────────────────
test("7 · modifier une fiche puis envoyer → data", () => {
  assert.equal(resolve("Passe le devis D-2026-04 en accepté et envoie-le au client", "email").resolvedKind, "data");
});

// ── 8. Application explicitement demandée → module (préservé) ──────────────────
test("8 · créer une application → module préservé", () => {
  assert.equal(resolve("Crée-moi une application de pointage des heures", "module").resolvedKind, "module");
  assert.equal(resolve("Mets en place un tableau de suivi des chantiers", "module").resolvedKind, "module");
});

// ── 9. « application » dans un autre sens → pas de sur-correction ──────────────
test("9 · « applique » ≠ créer une application", () => {
  // Mutation d'un objet métier classée module par erreur → data (pas d'app réelle).
  assert.equal(resolve("Modifie le devis Morel en appliquant une remise de 10%", "module").resolvedKind, "data");
});

// ── Non-mutations : pas d'override ────────────────────────────────────────────
test("lecture / question → pas d'override (answer préservé)", () => {
  assert.equal(resolve("Quels chantiers sont en retard ?", "answer").resolvedKind, "answer");
  assert.equal(resolve("Quel taux de TVA en rénovation ?", "answer").resolvedKind, "answer");
});
test("document (« fais un devis ») → pas d'override (pas de verbe de mutation de fiche)", () => {
  assert.equal(resolve("Fais-moi un devis pour la salle de bain de Mme Martin", "document").resolvedKind, "document");
});
test("data reste data", () => {
  assert.equal(resolve("Ajoute un client Jean Dupont, tel 0612", "data").resolvedKind, "data");
});

// ── Fallback déterministe des intentions ──────────────────────────────────────
test("deriveIntentsFromSignals : mission phare → 3 intentions fortes", () => {
  assert.deepEqual(deriveIntentsFromSignals(FLAGSHIP), ["update_chantier", "update_related_tasks", "prepare_communication"]);
});
test("deriveIntentsFromSignals : création d'un objet métier → create_object", () => {
  assert.deepEqual(deriveIntentsFromSignals("Ajoute un client Jean Dupont"), ["create_object"]);
});
test("deriveIntentsFromSignals : communication seule → prepare_communication", () => {
  assert.deepEqual(deriveIntentsFromSignals("Préviens l'équipe du retard"), ["prepare_communication"]);
});
test("deriveIntentsFromSignals : aucun signal fort → vide (comportement historique)", () => {
  assert.deepEqual(deriveIntentsFromSignals("Quel est le taux de TVA ?"), []);
});

test("UNION (LLM partiel + signaux) → mission phare complète (rattrape le volet manquant)", () => {
  // Le modèle n'a trouvé qu'UN volet sur trois ; les signaux complètent le reste.
  const llmPartial = ["update_chantier"];
  const merged = Array.from(new Set([...llmPartial, ...deriveIntentsFromSignals(FLAGSHIP)])).sort();
  assert.deepEqual(merged, ["prepare_communication", "update_chantier", "update_related_tasks"]);
});

// ── Un mot isolé ne suffit pas ────────────────────────────────────────────────
test("un mot isolé ne déclenche pas d'override", () => {
  // « tâche » sans verbe de mutation → pas de hasWorkspaceMutation.
  assert.equal(detectOperationalSignals("C'est une tâche importante").hasWorkspaceMutation, false);
  assert.equal(resolve("Explique-moi ce qu'est une tâche", "answer").resolvedKind, "answer");
});
