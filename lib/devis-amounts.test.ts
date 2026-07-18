// Tests unitaires Phase 2 — calcul des montants d'avenant/devis. Lancer :
//   node --test --experimental-strip-types lib/devis-amounts.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeDevisLines, computeDevisTotals, round2 } from "./devis-amounts.ts";

test("round2", () => {
  assert.equal(round2(0.1 + 0.2), 0.3);
  assert.equal(round2(2500.005), 2500.01);
});

test("computeDevisLines : quantité par défaut 1, TVA par défaut 20", () => {
  const lines = computeDevisLines([{ designation: "Travaux supplémentaires", prix_unitaire_ht: 2500 }]);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].quantite, 1);
  assert.equal(lines[0].taux_tva, 20);
  assert.equal(lines[0].total_ht, 2500);
  assert.equal(lines[0].position, 0);
});

test("computeDevisLines : quantité × PU", () => {
  const lines = computeDevisLines([{ designation: "Carrelage", quantite: 12, unite: "m²", prix_unitaire_ht: 45, taux_tva: 10 }]);
  assert.equal(lines[0].total_ht, 540);
  assert.equal(lines[0].taux_tva, 10);
  assert.equal(lines[0].unite, "m²");
});

test("computeDevisTotals : un avenant de 2500 € HT à 20 %", () => {
  const lines = computeDevisLines([{ designation: "Travaux sup.", prix_unitaire_ht: 2500 }]);
  const t = computeDevisTotals(lines);
  assert.deepEqual(t, { montant_ht: 2500, montant_tva: 500, montant_ttc: 3000 });
});

test("computeDevisTotals : TVA PAR LIGNE (mix 20 % et 10 %)", () => {
  const lines = computeDevisLines([
    { designation: "Neuf", prix_unitaire_ht: 1000, taux_tva: 20 },
    { designation: "Réno", prix_unitaire_ht: 1000, taux_tva: 10 },
  ]);
  const t = computeDevisTotals(lines);
  assert.equal(t.montant_ht, 2000);
  assert.equal(t.montant_tva, 300); // 200 + 100
  assert.equal(t.montant_ttc, 2300);
});

test("computeDevisTotals : TVA 5,5 rénovation énergétique", () => {
  const lines = computeDevisLines([{ designation: "Isolation", quantite: 2, prix_unitaire_ht: 1000, taux_tva: 5.5 }]);
  const t = computeDevisTotals(lines);
  assert.equal(t.montant_ht, 2000);
  assert.equal(t.montant_tva, 110);
  assert.equal(t.montant_ttc, 2110);
});

test("computeDevisLines : valeurs invalides tolérées (quantité 0 → 1, prix NaN → 0)", () => {
  const lines = computeDevisLines([{ designation: "X", quantite: 0, prix_unitaire_ht: Number("abc") as unknown as number }]);
  assert.equal(lines[0].quantite, 1);
  assert.equal(lines[0].total_ht, 0);
});
