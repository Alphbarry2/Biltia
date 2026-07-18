// Tests unitaires — VÉRIFICATION POST-ACTION. Lancer :
//   node --test --experimental-strip-types lib/action-verification.test.ts
//
// Aucun LLM, aucune vraie base : un faux client Supabase en mémoire + les VRAIES
// fonctions de calcul déterministe (lib/devis-amounts.ts) injectées. On teste la
// logique de vérification réelle, pas un mock d'elle-même.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  verifyAction,
  buildVerifiedReport,
  composeVerifiedText,
  allVerified,
  summarizeVerificationForModel,
  valuesEqual,
  compareFields,
  targetKey,
  isCorrectionBudgetExhausted,
  isVerifiableWrite,
  type ActionVerification,
  type MinimalClient,
} from "./action-verification.ts";
import { computeDevisLines, computeDevisTotals } from "./devis-amounts.ts";

const deps = { computeLines: computeDevisLines, computeTotals: computeDevisTotals, now: () => "2026-07-18T00:00:00.000Z" };

// ── Faux client Supabase (en mémoire) ────────────────────────────────────────
type Store = Record<string, Record<string, unknown>[]>;
function makeDb(store: Store, errorTables: Set<string> = new Set()): MinimalClient {
  return {
    from(table: string) {
      const filters: [string, string][] = [];
      const rowsMatching = () =>
        (store[table] ?? []).filter((r) => filters.every(([c, v]) => String(r[c] ?? "") === v));
      const builder: Record<string, unknown> = {
        select() {
          return builder;
        },
        eq(col: string, val: unknown) {
          filters.push([col, String(val)]);
          return builder;
        },
        maybeSingle() {
          if (errorTables.has(table)) return Promise.resolve({ data: null, error: { message: "lecture KO" } });
          return Promise.resolve({ data: rowsMatching()[0] ?? null, error: null });
        },
        // Awaitable → readManyBy (liste).
        then(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) {
          const res = errorTables.has(table)
            ? { data: null, error: { message: "lecture KO" } }
            : { data: rowsMatching(), error: null };
          return Promise.resolve(res).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

const actor = { tenantId: "t1" };

// ── 1. Création vérifiée ─────────────────────────────────────────────────────
test("création vérifiée", async () => {
  const db = makeDb({ clients: [{ id: "c1", tenant_id: "t1", nom: "Jean Dupont", telephone: "0612" }] });
  const v = await verifyAction(
    db,
    actor,
    { toolName: "workspace_create", input: { entity: "clients", values: { nom: "Jean Dupont", telephone: "0612" } }, result: { ok: true, row: { id: "c1" } }, table: "clients", writable: ["nom", "telephone"] },
    deps
  );
  assert.equal(v.status, "verified");
  assert.equal(v.objectId, "c1");
});

// ── 2. Création avec champ différent ─────────────────────────────────────────
test("création : champ enregistré différent → mismatch", async () => {
  const db = makeDb({ clients: [{ id: "c1", tenant_id: "t1", nom: "Jean Dupond" }] }); // 'd' ≠ 't'
  const v = await verifyAction(
    db,
    actor,
    { toolName: "workspace_create", input: { entity: "clients", values: { nom: "Jean Dupont" } }, result: { ok: true, row: { id: "c1" } }, table: "clients", writable: ["nom"] },
    deps
  );
  assert.equal(v.status, "mismatch");
  assert.equal(v.mismatches?.[0]?.field, "nom");
});

// ── 13. Outil réussi mais objet absent → mismatch ────────────────────────────
test("création annoncée ok mais objet absent en base → mismatch", async () => {
  const db = makeDb({ clients: [] });
  const v = await verifyAction(
    db,
    actor,
    { toolName: "workspace_create", input: { entity: "clients", values: { nom: "X" } }, result: { ok: true, row: { id: "ghost" } }, table: "clients", writable: ["nom"] },
    deps
  );
  assert.equal(v.status, "mismatch");
});

// ── 3. Mise à jour vérifiée ──────────────────────────────────────────────────
test("mise à jour vérifiée", async () => {
  const db = makeDb({ chantiers: [{ id: "ch1", tenant_id: "t1", statut: "en_cours", date_debut: "2026-07-21" }] });
  const v = await verifyAction(
    db,
    actor,
    { toolName: "workspace_update", input: { entity: "chantiers", id: "ch1", values: { date_debut: "2026-07-21" } }, result: { ok: true, row: { id: "ch1" } }, table: "chantiers", writable: ["statut", "date_debut"] },
    deps
  );
  assert.equal(v.status, "verified");
});

// ── 4. Mise à jour partielle (un champ ok, un champ non) ─────────────────────
test("mise à jour partielle → mismatch sur le champ divergent", async () => {
  const db = makeDb({ chantiers: [{ id: "ch1", tenant_id: "t1", statut: "en_cours", avancement: 50 }] });
  const v = await verifyAction(
    db,
    actor,
    { toolName: "workspace_update", input: { entity: "chantiers", id: "ch1", values: { statut: "en_cours", avancement: 80 } }, result: { ok: true, row: { id: "ch1" } }, table: "chantiers", writable: ["statut", "avancement"] },
    deps
  );
  assert.equal(v.status, "mismatch");
  assert.deepEqual(v.mismatches?.map((m) => m.field), ["avancement"]);
});

// ── 5. Mauvaise date après update ────────────────────────────────────────────
test("mauvaise date enregistrée après update → mismatch", async () => {
  const db = makeDb({ chantiers: [{ id: "ch1", tenant_id: "t1", date_debut: "2026-07-22" }] });
  const v = await verifyAction(
    db,
    actor,
    { toolName: "workspace_update", input: { entity: "chantiers", id: "ch1", values: { date_debut: "2026-07-21" } }, result: { ok: true, row: { id: "ch1" } }, table: "chantiers", writable: ["date_debut"] },
    deps
  );
  assert.equal(v.status, "mismatch");
  assert.equal(v.mismatches?.[0]?.field, "date_debut");
});

// ── 6. Suppression vérifiée ──────────────────────────────────────────────────
test("suppression vérifiée (objet absent)", async () => {
  const db = makeDb({ clients: [] });
  const v = await verifyAction(
    db,
    actor,
    { toolName: "workspace_delete", input: { entity: "clients", id: "c1" }, result: { ok: true, deleted: { id: "c1" } }, table: "clients" },
    deps
  );
  assert.equal(v.status, "verified");
});

// ── 7. Suppression : objet encore visible → mismatch ─────────────────────────
test("suppression mais objet encore présent → mismatch", async () => {
  const db = makeDb({ clients: [{ id: "c1", tenant_id: "t1", nom: "Toujours là" }] });
  const v = await verifyAction(
    db,
    actor,
    { toolName: "workspace_delete", input: { entity: "clients", id: "c1" }, result: { ok: true, deleted: { id: "c1" } }, table: "clients" },
    deps
  );
  assert.equal(v.status, "mismatch");
});

// ── 8. Erreur de relecture → not_verifiable (distinct de « absent ») ──────────
test("erreur de relecture → not_verifiable", async () => {
  const db = makeDb({ chantiers: [{ id: "ch1", tenant_id: "t1" }] }, new Set(["chantiers"]));
  const v = await verifyAction(
    db,
    actor,
    { toolName: "workspace_update", input: { entity: "chantiers", id: "ch1", values: { statut: "termine" } }, result: { ok: true, row: { id: "ch1" } }, table: "chantiers", writable: ["statut"] },
    deps
  );
  assert.equal(v.status, "not_verifiable");
});

// ── 9. Objet cross-tenant inaccessible → mismatch (invisible) ────────────────
test("objet d'un AUTRE tenant → invisible → mismatch", async () => {
  const db = makeDb({ chantiers: [{ id: "ch1", tenant_id: "AUTRE", statut: "en_cours" }] });
  const v = await verifyAction(
    db,
    actor, // t1
    { toolName: "workspace_update", input: { entity: "chantiers", id: "ch1", values: { statut: "termine" } }, result: { ok: true, row: { id: "ch1" } }, table: "chantiers", writable: ["statut"] },
    deps
  );
  assert.equal(v.status, "mismatch");
});

// ── Avenant : fixture correcte réutilisée ────────────────────────────────────
function avenantStore(overrides: Record<string, unknown> = {}): Store {
  return {
    devis: [
      { id: "d1", tenant_id: "t1", client_id: "c1", chantier_id: "ch1", numero: "D-2026-001" },
      { id: "av1", tenant_id: "t1", type: "avenant", parent_devis_id: "d1", client_id: "c1", chantier_id: "ch1", montant_ht: 2000, montant_tva: 400, montant_ttc: 2400, ...overrides },
    ],
    lignes: [{ id: "l1", tenant_id: "t1", devis_id: "av1", total_ht: 2000 }],
  };
}
const avenantInput = { devis_id: "d1", lignes: [{ designation: "Travaux supplémentaires", quantite: 2, prix_unitaire_ht: 1000, taux_tva: 20 }] };

// ── 10. Avenant correct ──────────────────────────────────────────────────────
test("avenant correct → verified (type, parent, client, chantier, montants, lignes)", async () => {
  const db = makeDb(avenantStore());
  const v = await verifyAction(db, actor, { toolName: "create_avenant", input: avenantInput, result: { ok: true, row: { id: "av1" } } }, deps);
  assert.equal(v.status, "verified", JSON.stringify(v.mismatches));
});

// ── 11. Mauvais parent_devis_id ──────────────────────────────────────────────
test("avenant : parent_devis_id incorrect → mismatch", async () => {
  const db = makeDb(avenantStore({ parent_devis_id: "AUTRE" }));
  const v = await verifyAction(db, actor, { toolName: "create_avenant", input: avenantInput, result: { ok: true, row: { id: "av1" } } }, deps);
  assert.equal(v.status, "mismatch");
  assert.ok(v.mismatches?.some((m) => m.field === "parent_devis_id"));
});

// ── 12. Mauvais total TVA ────────────────────────────────────────────────────
test("avenant : TVA enregistrée ≠ calcul serveur → mismatch", async () => {
  const db = makeDb(avenantStore({ montant_tva: 999 }));
  const v = await verifyAction(db, actor, { toolName: "create_avenant", input: avenantInput, result: { ok: true, row: { id: "av1" } } }, deps);
  assert.equal(v.status, "mismatch");
  assert.ok(v.mismatches?.some((m) => m.field === "montant_tva"));
});

// ── Transform : lien source vérifié ──────────────────────────────────────────
test("transform devis_from_demande : lien demande_id vérifié", async () => {
  const db = makeDb({ devis: [{ id: "dv9", tenant_id: "t1", demande_id: "dem1" }] });
  const v = await verifyAction(
    db,
    actor,
    { toolName: "workspace_transform", input: { action: "devis_from_demande", source_id: "dem1" }, result: { ok: true, row: { id: "dv9" } }, targetTable: "devis" },
    deps
  );
  assert.equal(v.status, "verified");
});

test("transform : lien source rompu → mismatch", async () => {
  const db = makeDb({ devis: [{ id: "dv9", tenant_id: "t1", demande_id: "AUTRE" }] });
  const v = await verifyAction(
    db,
    actor,
    { toolName: "workspace_transform", input: { action: "devis_from_demande", source_id: "dem1" }, result: { ok: true, row: { id: "dv9" } }, targetTable: "devis" },
    deps
  );
  assert.equal(v.status, "mismatch");
});

// ── Envoi : accepté ≠ livré → not_verifiable ─────────────────────────────────
test("send_email : accepté par le fournisseur → not_verifiable (jamais « reçu »)", async () => {
  const db = makeDb({});
  const v = await verifyAction(db, actor, { toolName: "send_email", input: { to: ["a@b.fr"] }, result: { ok: true, via: "gmail" } }, deps);
  assert.equal(v.status, "not_verifiable");
  assert.match(String(v.reason), /livraison|réception/i);
});

// ── Une seule tentative corrective (prédicat partagé avec la boucle) ─────────
test("budget de correction : bloque APRÈS 1 correction non conforme", () => {
  assert.equal(isCorrectionBudgetExhausted(undefined, 1), false); // rien encore
  assert.equal(isCorrectionBudgetExhausted({ attempts: 1, lastStatus: "mismatch" }, 1), false); // 1re correction permise
  assert.equal(isCorrectionBudgetExhausted({ attempts: 2, lastStatus: "mismatch" }, 1), true); // 2e bloquée
  assert.equal(isCorrectionBudgetExhausted({ attempts: 2, lastStatus: "verified" }, 1), false); // corrigé → libre
});

// ── Compte rendu partiel honnête + impossibilité de dire « terminé » ─────────
test("buildVerifiedReport : partiel honnête, jamais « tout terminé » sur mismatch", () => {
  const vs = [
    { status: "verified" as const, toolName: "workspace_update", entity: "chantiers", objectId: "ch1", verifiedAt: "" },
    { status: "not_verifiable" as const, toolName: "send_email", verifiedAt: "", reason: "accepté" },
    { status: "mismatch" as const, toolName: "workspace_update", entity: "chantiers", objectId: "ch2", verifiedAt: "", mismatches: [{ field: "date_debut", expected: "2026-07-21", observed: "2026-07-22" }] },
  ];
  assert.equal(allVerified(vs), false);
  const report = buildVerifiedReport(vs);
  assert.match(report, /✓/);
  assert.match(report, /⚠/);
  assert.match(report, /non vérifié|non annonce|n'annonce pas/i);
  assert.doesNotMatch(report, /tout(es)? (est|ont) .*(terminé|confirmé)/i);
});

test("buildVerifiedReport : tout vérifié → en-tête de confirmation", () => {
  const vs = [{ status: "verified" as const, toolName: "workspace_create", entity: "clients", objectId: "c1", verifiedAt: "" }];
  assert.equal(allVerified(vs), true);
  assert.match(buildVerifiedReport(vs), /toutes les actions ont été confirmées/i);
});

// ── Directive au modèle : mismatch interdit d'annoncer « fait » ──────────────
test("summarizeVerificationForModel : mismatch → directive « NE présente PAS »", () => {
  const s = summarizeVerificationForModel({ status: "mismatch", toolName: "workspace_update", verifiedAt: "", mismatches: [{ field: "x", expected: 1, observed: 2 }] });
  assert.equal(s.status, "mismatch");
  assert.match(String(s.directive), /NE présente PAS/i);
});

// ── Helpers purs ─────────────────────────────────────────────────────────────
test("valuesEqual : vide/null équivalents, monnaie tolérante, dates au jour, booléens", () => {
  assert.equal(valuesEqual("", null), true);
  assert.equal(valuesEqual(null, undefined), true);
  assert.equal(valuesEqual(2000, 2000.004), true); // tolérance monétaire
  assert.equal(valuesEqual(2000, 2001), false);
  assert.equal(valuesEqual("2026-07-21", "2026-07-21T00:00:00Z"), true); // même jour
  assert.equal(valuesEqual("2026-07-21", "2026-07-22"), false);
  assert.equal(valuesEqual(true, "true"), true);
  assert.equal(valuesEqual("en_cours", "en_cours"), true);
  assert.equal(valuesEqual("en_cours", "termine"), false);
});

test("compareFields : n'affirme QUE les champs fournis", () => {
  const m = compareFields({ nom: "A" }, { nom: "A", statut: "x" }, ["nom", "statut"]);
  assert.equal(m.length, 0); // statut absent de expected → non comparé
});

test("targetKey / isVerifiableWrite", () => {
  assert.equal(targetKey("workspace_update", { entity: "chantiers", id: "x" }), "chantiers:x");
  assert.equal(targetKey("workspace_create", { entity: "clients", values: {} }), null);
  assert.equal(targetKey("workspace_transform", { action: "chantier_from_devis", source_id: "s" }), "transform:chantier_from_devis:s");
  assert.equal(targetKey("create_avenant", { devis_id: "d" }), "avenant:d");
  assert.equal(isVerifiableWrite("workspace_list"), false);
  assert.equal(isVerifiableWrite("create_avenant"), true);
});

// ════════════════════════════════════════════════════════════════════════════
//  DURCISSEMENT SUPPRESSION (une lecture à zéro ligne NE prouve PAS la suppression)
// ════════════════════════════════════════════════════════════════════════════

test("suppression confirmée (outil a lu puis supprimé) + absente → verified", async () => {
  const db = makeDb({ clients: [] });
  const v = await verifyAction(db, actor, { toolName: "workspace_delete", input: { entity: "clients", id: "c1" }, result: { ok: true, deleted: { id: "c1" } }, table: "clients" }, deps);
  assert.equal(v.status, "verified");
});

test("suppression SANS preuve d'existence préalable (accès refusé / RLS) → not_verifiable", async () => {
  // L'outil n'a pas confirmé avoir supprimé une fiche existante (pas de `deleted`).
  // Une relecture à zéro ligne peut être une invisibilité RLS → jamais « verified ».
  const db = makeDb({ clients: [] });
  const v = await verifyAction(db, actor, { toolName: "workspace_delete", input: { entity: "clients", id: "c1" }, result: { ok: true }, table: "clients" }, deps);
  assert.equal(v.status, "not_verifiable");
  assert.match(String(v.reason), /RLS|invisible|non prouvée/i);
});

test("suppression, relecture en erreur → failed (suppression NON prouvée)", async () => {
  const db = makeDb({ clients: [{ id: "c1", tenant_id: "t1" }] }, new Set(["clients"]));
  const v = await verifyAction(db, actor, { toolName: "workspace_delete", input: { entity: "clients", id: "c1" }, result: { ok: true, deleted: { id: "c1" } }, table: "clients" }, deps);
  assert.equal(v.status, "failed");
});

// ════════════════════════════════════════════════════════════════════════════
//  CHEMIN confirmPlan (simulé : boucle verifyAction → buildVerifiedReport)
//  route.ts appelle verifyExecutedTool (= verifyAction) puis buildVerifiedReport.
// ════════════════════════════════════════════════════════════════════════════

// Reproduit la boucle serveur du chemin de confirmation, sans HTTP ni LLM.
async function runConfirmPlan(db: MinimalClient, plan: { tool: string; input: Record<string, unknown>; result: Record<string, unknown> }[]) {
  const verifications: ActionVerification[] = [];
  for (const a of plan) {
    if (isVerifiableWrite(a.tool) && (a.result as { ok?: boolean }).ok) {
      const schema =
        a.tool === "workspace_update" || a.tool === "workspace_delete"
          ? { table: String(a.input.entity), writable: ["statut", "date_debut", "avancement", "nom"] }
          : {};
      verifications.push(await verifyAction(db, actor, { toolName: a.tool, input: a.input, result: a.result, ...schema }, deps));
    }
  }
  return { verifications, message: buildVerifiedReport(verifications), verified: allVerified(verifications) };
}

test("confirmPlan : update confirmé puis vérifié", async () => {
  const db = makeDb({ chantiers: [{ id: "ch1", tenant_id: "t1", statut: "termine" }] });
  const r = await runConfirmPlan(db, [{ tool: "workspace_update", input: { entity: "chantiers", id: "ch1", values: { statut: "termine" } }, result: { ok: true, row: { id: "ch1" } } }]);
  assert.equal(r.verified, true);
  assert.match(r.message, /✓/);
});

test("confirmPlan : update confirmé avec mismatch → pas de succès", async () => {
  const db = makeDb({ chantiers: [{ id: "ch1", tenant_id: "t1", date_debut: "2026-07-22" }] });
  const r = await runConfirmPlan(db, [{ tool: "workspace_update", input: { entity: "chantiers", id: "ch1", values: { date_debut: "2026-07-21" } }, result: { ok: true, row: { id: "ch1" } } }]);
  assert.equal(r.verified, false);
  assert.match(r.message, /⚠/);
  assert.doesNotMatch(r.message, /tout(es)? (est|ont) .*(terminé|confirmé)/i);
});

test("confirmPlan : suppression confirmée puis vérifiée", async () => {
  const db = makeDb({ clients: [] });
  const r = await runConfirmPlan(db, [{ tool: "workspace_delete", input: { entity: "clients", id: "c1" }, result: { ok: true, deleted: { id: "c1" } } }]);
  assert.equal(r.verified, true);
});

test("confirmPlan : suppression invisible (accès refusé) → non vérifiée", async () => {
  const db = makeDb({ clients: [] });
  const r = await runConfirmPlan(db, [{ tool: "workspace_delete", input: { entity: "clients", id: "c1" }, result: { ok: true } }]);
  assert.equal(r.verified, false); // not_verifiable ≠ verified
  assert.match(r.message, /•/);
});

test("confirmPlan : email seulement accepté → jamais « reçu »", async () => {
  const db = makeDb({});
  const r = await runConfirmPlan(db, [{ tool: "send_email", input: { to: ["a@b.fr"] }, result: { ok: true, via: "gmail" } }]);
  assert.equal(r.verified, false);
  assert.match(r.message, /•/);
  assert.doesNotMatch(r.message, /reçu/i);
});

test("confirmPlan : plan multi-actions à résultat PARTIEL reste partiel", async () => {
  const db = makeDb({ chantiers: [{ id: "ch1", tenant_id: "t1", statut: "en_cours" }] });
  const r = await runConfirmPlan(db, [
    { tool: "workspace_update", input: { entity: "chantiers", id: "ch1", values: { statut: "en_cours" } }, result: { ok: true, row: { id: "ch1" } } }, // verified
    { tool: "send_email", input: { to: ["x@y.fr"] }, result: { ok: true, via: "resend" } }, // not_verifiable
    { tool: "workspace_update", input: { entity: "chantiers", id: "ch1", values: { statut: "termine" } }, result: { ok: true, row: { id: "ch1" } } }, // mismatch (statut réel en_cours)
  ]);
  assert.equal(r.verified, false);
  assert.match(r.message, /✓/);
  assert.match(r.message, /•/);
  assert.match(r.message, /⚠/);
});

// ════════════════════════════════════════════════════════════════════════════
//  RÉSUMÉ EXECUTOR + RÉPONSE DATA (composeVerifiedText = la garantie partagée)
// ════════════════════════════════════════════════════════════════════════════

const V = (status: ActionVerification["status"], extra: Partial<ActionVerification> = {}): ActionVerification => ({ status, toolName: "workspace_update", entity: "chantiers", objectId: "ch1", verifiedAt: "", ...extra });

test("executor : résumé avec toutes actions vérifiées → texte du modèle conservé", () => {
  const out = composeVerifiedText("Compte-rendu : 3 fiches mises à jour.", [V("verified"), V("verified")]);
  assert.equal(out, "Compte-rendu : 3 fiches mises à jour.");
});

test("executor : résumé avec mismatch → rapport déterministe en tête", () => {
  const out = composeVerifiedText("Compte-rendu : fait.", [V("verified"), V("mismatch", { mismatches: [{ field: "statut", expected: "termine", observed: "en_cours" }] })]) ?? "";
  assert.match(out, /^État vérifié/);
  assert.match(out, /⚠/);
});

test("executor : LLM affirme un faux succès → le rapport le PRÉCÈDE", () => {
  const faux = "Tout est terminé avec succès.";
  const out = composeVerifiedText(faux, [V("mismatch", { mismatches: [{ field: "date_debut", expected: "2026-07-21", observed: "2026-07-22" }] })]) ?? "";
  const idxReport = out.indexOf("État vérifié");
  const idxFaux = out.indexOf(faux);
  assert.ok(idxReport >= 0 && idxReport < idxFaux, "le rapport déterministe doit précéder le faux succès");
  assert.match(out, /n'annonce pas comme terminé/i);
});

test("executor : notification partielle honnête (verified + not_verifiable + mismatch)", () => {
  const out = composeVerifiedText("Fait.", [V("verified"), V("not_verifiable", { toolName: "send_email" }), V("mismatch", { objectId: "ch2" })]) ?? "";
  assert.match(out, /✓/);
  assert.match(out, /•/);
  assert.match(out, /⚠/);
});

test("executor : not_verifiable jamais présenté comme réception/réussite définitive", () => {
  const report = buildVerifiedReport([V("not_verifiable", { toolName: "send_sms" })]);
  assert.match(report, /•/);
  assert.doesNotMatch(report, /✓/);
  assert.doesNotMatch(report, /reçu|livré/i);
});

test("route data : verifiedReport atteint bien le texte final (finalText = composeVerifiedText)", () => {
  // Le chemin data renvoie loop.finalText, qui EST composeVerifiedText(modelText, verifs).
  const finalText = composeVerifiedText("✓ Opération effectuée.", [V("mismatch", { mismatches: [{ field: "statut", expected: "termine", observed: "en_cours" }] })]);
  assert.notEqual(finalText, null);
  assert.match(String(finalText), /⚠/); // le mismatch est visible dans la réponse
  assert.match(String(finalText), /État vérifié/);
});

test("route data : jamais « tout terminé » quand le rapport n'est pas entièrement vérifié", () => {
  const finalText = String(composeVerifiedText("Tout est terminé.", [V("verified"), V("mismatch")]));
  assert.doesNotMatch(finalText, /^Tout est terminé/);
  assert.match(finalText, /n'annonce pas comme terminé/i);
});
