// Tests unitaires WS-B — déclencheur d'outils de lecture. Lancer :
//   node --test --experimental-strip-types lib/answer-tools.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { answerNeedsWorkspace, WSB_TOOL_ADDENDUM } from "./answer-tools.ts";

// ── Doit déclencher les outils (question OPÉRATIONNELLE) ─────────────────────

for (const q of [
  "Quels chantiers sont en retard ?",
  "Retrouve-moi le devis signé du client Martin.",
  "Combien j'ai de clients ?",
  "Montre-moi mon planning de la semaine",
  "Mes factures impayées ?",
  "Qui est le chef sur le chantier Dupont ?",
  "Liste mes devis en attente",
  "Où est le devis de Morel ?",
]) {
  test(`needsWorkspace = true : « ${q} »`, () => {
    assert.equal(answerNeedsWorkspace(q), true);
  });
}

// ── Ne doit PAS déclencher (question GÉNÉRALE / métier) ──────────────────────

for (const q of [
  "Quelle TVA en rénovation ?",
  "Comment créer un devis ?",
  "C'est quoi un DTU ?",
  "Explique-moi la garantie décennale",
  "Bonjour, tu peux m'aider ?",
  // NB : « quelle marge sur un chantier de peinture » (conseil général mais qui
  // nomme « chantier ») déclenche volontairement les outils — faux positif ASSUMÉ
  // et peu coûteux : le modèle n'appellera aucun outil s'il n'en a pas besoin.
]) {
  test(`needsWorkspace = false : « ${q} »`, () => {
    assert.equal(answerNeedsWorkspace(q), false);
  });
}

test("entrée vide → false", () => {
  assert.equal(answerNeedsWorkspace(""), false);
});

// ── IDENTITÉ ENTREPRISE → déclenche les outils (company_profile_get) ──────────

for (const q of [
  "Quel est mon numéro de TVA ?",
  "C'est quoi mon SIRET ?",
  "Rappelle-moi notre raison sociale",
  "Mon adresse d'entreprise ?",
  "Quel est notre IBAN ?",
]) {
  test(`needsWorkspace = true (identité entreprise) : « ${q} »`, () => {
    assert.equal(answerNeedsWorkspace(q), true);
  });
}

test("« quel taux de TVA en rénovation ? » reste une question fiscale (pas l'identité)", () => {
  assert.equal(answerNeedsWorkspace("Quel taux de TVA en rénovation ?"), false);
});

test("l'addendum mentionne company_profile_get", () => {
  assert.match(WSB_TOOL_ADDENDUM, /company_profile_get/);
});

// ── Addendum : outils décrits + honnêteté + lecture seule ────────────────────

test("l'addendum impose la recherche, l'honnêteté et la lecture seule", () => {
  assert.match(WSB_TOOL_ADDENDUM, /workspace_list/);
  assert.match(WSB_TOOL_ADDENDUM, /workspace_get/);
  assert.match(WSB_TOOL_ADDENDUM, /Je n'ai pas cette information/);
  assert.match(WSB_TOOL_ADDENDUM, /N'invente JAMAIS/);
  assert.match(WSB_TOOL_ADDENDUM, /LECTURE/);
});
