// Tests unitaires — RECHERCHE CANONIQUE. Lancer :
//   node --test --experimental-strip-types lib/workspace-search.test.ts
//
// Aucun LLM, aucune vraie base : faux client Supabase en mémoire.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  searchWorkspace,
  searchColumnFor,
  normalizeText,
  levenshtein,
  similarity,
  scoreCandidate,
  resolveResolution,
  formatSearchForModel,
  stripEntityPrefix,
  SEARCH_SPECS,
  WORKSPACE_SEARCH_TOOL,
  type MinimalDb,
} from "./workspace-search.ts";

type Store = Record<string, Record<string, unknown>[]>;
function makeDb(store: Store): MinimalDb {
  return {
    from(table: string) {
      const filters: { op: string; col?: string; val?: string; pattern?: string; vals?: string[] }[] = [];
      let limitN = Infinity;
      const run = () => {
        let rows = store[table] ?? [];
        for (const f of filters) {
          if (f.op === "eq") rows = rows.filter((r) => String(r[f.col!] ?? "") === f.val);
          else if (f.op === "in") rows = rows.filter((r) => f.vals!.includes(String(r[f.col!] ?? "")));
          else if (f.op === "ilike") {
            const needle = f.pattern!.replace(/%/g, "").toLowerCase();
            rows = rows.filter((r) => {
              const v = r[f.col!];
              return typeof v === "string" && v.toLowerCase().includes(needle); // array → pas de match (mimique erreur)
            });
          }
        }
        return rows.slice(0, limitN);
      };
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (col: string, val: unknown) => (filters.push({ op: "eq", col, val: String(val) }), builder),
        ilike: (col: string, pattern: string) => (filters.push({ op: "ilike", col, pattern }), builder),
        in: (col: string, vals: unknown[]) => (filters.push({ op: "in", col, vals: vals.map(String) }), builder),
        order: () => builder,
        limit: (n: number) => ((limitN = n), builder),
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve({ data: run(), error: null }).then(resolve, reject),
      };
      return builder;
    },
  };
}

// ── Helpers purs ──────────────────────────────────────────────────────────────
test("normalizeText : casse, accents, apostrophes, tirets, ponctuation, espaces", () => {
  assert.equal(normalizeText("  José  Bâtiment  "), "jose batiment");
  assert.equal(normalizeText("FAC-2026-004"), "fac 2026 004");
  assert.equal(normalizeText("L'Atelier d'André"), "l atelier d andre");
  assert.equal(normalizeText(["double prise", "bloc 2 prises"]), "double prise bloc 2 prises");
});

test("levenshtein / similarity", () => {
  assert.equal(levenshtein("dupon", "dupont"), 1);
  assert.ok(similarity("dupon", "dupont") > 0.8);
  assert.ok(similarity("xyzabc", "dupont") < 0.4);
});

test("stripEntityPrefix : « chantier Dupont » → « dupont »", () => {
  assert.equal(stripEntityPrefix("chantier dupont", "chantiers"), "dupont");
  assert.equal(stripEntityPrefix("dupont", "chantiers"), "dupont");
  assert.equal(stripEntityPrefix("chantier", "chantiers"), "chantier"); // seul → inchangé
});

// ── Fixtures ──────────────────────────────────────────────────────────────────
const T = "t1";
const chantiers = (rows: Record<string, unknown>[]): Store => ({ chantiers: rows });

// ── 1-2. Nom exact + casse ─────────────────────────────────────────────────────
test("nom exact + insensible à la casse → unique", async () => {
  const db = makeDb(chantiers([{ id: "ch1", tenant_id: T, nom: "Dupont", ville: "Bruxelles", statut: "en_cours" }]));
  for (const q of ["Dupont", "DUPONT", "dupont"]) {
    const r = await searchWorkspace(db, T, { query: q, entity: "chantiers" });
    assert.equal(r.resolution, "unique", q);
    assert.equal(r.results[0].id, "ch1");
    assert.equal(r.results[0].matchType, "label_exact");
  }
});

// ── 3. Accents ─────────────────────────────────────────────────────────────────
test("accents : « Jose Batiment » ≈ « José Bâtiment »", async () => {
  const db = makeDb(chantiers([{ id: "ch1", tenant_id: T, nom: "José Bâtiment" }]));
  const r = await searchWorkspace(db, T, { query: "Jose Batiment", entity: "chantiers" });
  assert.equal(r.resolution, "unique");
  assert.equal(r.results[0].matchType, "label_exact");
});

// ── 4-6. Tirets/ponctuation, référence, numéro ─────────────────────────────────
test("référence : « FAC 2026 004 » et « FAC-2026-004 » retrouvent la facture", async () => {
  const db = makeDb({ factures: [{ id: "f1", tenant_id: T, numero: "FAC-2026-004", statut: "envoyee" }] });
  for (const q of ["FAC-2026-004", "FAC 2026 004", "  fac-2026-004  "]) {
    const r = await searchWorkspace(db, T, { query: q, entity: "factures" });
    assert.equal(r.resolution, "unique", q);
    assert.equal(r.results[0].matchType, "reference_exact", q);
  }
});

test("numéro exact devis", async () => {
  const db = makeDb({ devis: [{ id: "d1", tenant_id: T, numero: "D-2026-014", statut: "accepte", client_id: "c1", chantier_id: "ch1" }] });
  const r = await searchWorkspace(db, T, { query: "D-2026-014", entity: "devis" });
  assert.equal(r.results[0].matchType, "reference_exact");
});

// ── 7-8. Préfixe, sous-chaîne ──────────────────────────────────────────────────
test("préfixe et sous-chaîne", async () => {
  const db = makeDb(chantiers([{ id: "ch1", tenant_id: T, nom: "Dupont" }]));
  assert.equal((await searchWorkspace(db, T, { query: "Dup", entity: "chantiers" })).results[0].matchType, "prefix");
  assert.equal((await searchWorkspace(db, T, { query: "pont", entity: "chantiers" })).results[0].matchType, "contains");
});

// ── 9. Petite faute → fuzzy, PAS d'action auto ─────────────────────────────────
test("petite faute : « Dupnt » propose « Dupont » mais reste ambiguë (pas d'action auto)", async () => {
  // « Dupnt » (o manquant) est une VRAIE faute — ni préfixe ni sous-chaîne de « Dupont ».
  const db = makeDb(chantiers([{ id: "ch1", tenant_id: T, nom: "Dupont" }]));
  const r = await searchWorkspace(db, T, { query: "Dupnt", entity: "chantiers" });
  assert.equal(r.results[0].matchType, "fuzzy");
  assert.equal(r.results[0].id, "ch1");
  assert.equal(r.resolution, "ambiguous"); // score fuzzy < seuil → confirmation demandée
});

// ── 10. Faute trop grande → not_found ──────────────────────────────────────────
test("faute trop importante → not_found", async () => {
  const db = makeDb(chantiers([{ id: "ch1", tenant_id: T, nom: "Dupont" }]));
  const r = await searchWorkspace(db, T, { query: "Xyzabc", entity: "chantiers" });
  assert.equal(r.resolution, "not_found");
  assert.equal(r.count, 0);
});

// ── 11-13. Homonymes / écart insuffisant / unique ──────────────────────────────
test("homonymes : deux « Dupont » → ambiguous, aucun choix auto", async () => {
  const db = makeDb(chantiers([
    { id: "ch1", tenant_id: T, nom: "Rénovation Dupont", ville: "Bruxelles", statut: "en_cours" },
    { id: "ch2", tenant_id: T, nom: "Toiture Dupont", ville: "Liège", statut: "planifie" },
  ]));
  const r = await searchWorkspace(db, T, { query: "Dupont", entity: "chantiers" });
  assert.equal(r.resolution, "ambiguous");
  assert.equal(r.count, 2);
  assert.match(String(formatSearchForModel(r).note), /NE choisis PAS/i);
});

test("un seul résultat fiable → unique", async () => {
  const db = makeDb(chantiers([{ id: "ch1", tenant_id: T, nom: "Rénovation Dupont" }, { id: "ch2", tenant_id: T, nom: "Extension Morel" }]));
  const r = await searchWorkspace(db, T, { query: "Dupont", entity: "chantiers" });
  assert.equal(r.resolution, "unique");
  assert.equal(r.results[0].id, "ch1");
});

// ── 14. Aucun résultat ─────────────────────────────────────────────────────────
test("aucun résultat", async () => {
  const db = makeDb(chantiers([{ id: "ch1", tenant_id: T, nom: "Dupont" }]));
  assert.equal((await searchWorkspace(db, T, { query: "Zzz introuvable", entity: "chantiers" })).resolution, "not_found");
});

// ── 15-16. Tenant forcé / autre tenant exclu ──────────────────────────────────
test("tenant forcé : un objet d'un AUTRE tenant est invisible", async () => {
  const db = makeDb(chantiers([{ id: "ch1", tenant_id: "AUTRE", nom: "Dupont" }]));
  const r = await searchWorkspace(db, T, { query: "Dupont", entity: "chantiers" });
  assert.equal(r.resolution, "not_found");
});

// ── 17. Limitation du nombre de résultats ──────────────────────────────────────
test("limit borne le nombre de résultats", async () => {
  const rows = Array.from({ length: 6 }, (_, i) => ({ id: `ch${i}`, tenant_id: T, nom: `Chantier Dupont ${i}` }));
  const db = makeDb(chantiers(rows));
  const r = await searchWorkspace(db, T, { query: "Dupont", entity: "chantiers", limit: 2 });
  assert.equal(r.results.length, 2);
});

// ── 18. Champs sensibles ABSENTS du résultat ───────────────────────────────────
test("champs sensibles non renvoyés : contenu de message / email de signataire", async () => {
  const dbMsg = makeDb({ messages: [{ id: "m1", tenant_id: T, objet: "Relance devis", corps: "IBAN FR76 1234 SECRET", canal: "email", direction: "sortant" }] });
  const rm = await searchWorkspace(dbMsg, T, { query: "IBAN", entity: "messages" });
  assert.equal(rm.results[0].id, "m1");
  assert.equal(rm.results[0].label, "Relance devis"); // objet, pas le corps
  assert.doesNotMatch(JSON.stringify(formatSearchForModel(rm)), /SECRET|FR76/); // le corps n'est jamais renvoyé

  const dbVal = makeDb({ validations: [{ id: "v1", tenant_id: T, type: "acceptation_devis", signataire_nom: "Martin Dupont", signataire_email: "martin@secret.fr", statut: "signe" }] });
  const rv = await searchWorkspace(dbVal, T, { query: "Martin", entity: "validations" });
  assert.equal(rv.results[0].id, "v1");
  assert.doesNotMatch(JSON.stringify(formatSearchForModel(rv)), /secret\.fr/); // email jamais renvoyé
});

// ── 19 + 26. Dix entités jadis cassées : colonne réelle, aucune SQL "nom" ───────
test("les 10 entités cassées : searchColumnFor renvoie une VRAIE colonne (jamais « nom »)", () => {
  const expected: Record<string, string> = {
    contrats: "reference",
    demandes: "titre",
    commandes: "numero",
    depenses: "numero",
    paiements: "reference",
    reserves: "titre",
    rappels: "titre",
    messages: "objet",
    notes: "titre",
    validations: "signataire_nom",
  };
  for (const [entity, col] of Object.entries(expected)) {
    assert.equal(searchColumnFor(entity), col, entity);
    assert.notEqual(searchColumnFor(entity), "nom", entity);
    // la colonne existe dans selectFields de l'entité (pas de colonne fantôme)
    assert.ok(SEARCH_SPECS[entity].selectFields.includes(col), `${entity}.${col} existe`);
  }
});

test("recherche effective sur chacune des 10 entités jadis cassées (aucune erreur)", async () => {
  const cases: [string, Record<string, unknown>, string][] = [
    ["contrats", { id: "x", tenant_id: T, reference: "CTR-2026-01", type: "entretien" }, "CTR-2026-01"],
    ["demandes", { id: "x", tenant_id: T, titre: "Fuite salle de bain" }, "Fuite salle de bain"],
    ["commandes", { id: "x", tenant_id: T, numero: "CMD-77" }, "CMD-77"],
    ["depenses", { id: "x", tenant_id: T, numero: "FF-2026-9" }, "FF-2026-9"],
    ["paiements", { id: "x", tenant_id: T, reference: "VIR-889" }, "VIR-889"],
    ["reserves", { id: "x", tenant_id: T, titre: "Carrelage fissuré" }, "Carrelage fissuré"],
    ["rappels", { id: "x", tenant_id: T, titre: "Relancer Morel" }, "Relancer Morel"],
    ["messages", { id: "x", tenant_id: T, objet: "Confirmation RDV" }, "Confirmation RDV"],
    ["notes", { id: "x", tenant_id: T, titre: "Compteur au sous-sol" }, "Compteur au sous-sol"],
    ["validations", { id: "x", tenant_id: T, type: "signature_pv", signataire_nom: "Karim" }, "Karim"],
  ];
  for (const [entity, row, query] of cases) {
    const db = makeDb({ [entity]: [row] });
    const r = await searchWorkspace(db, T, { query, entity });
    assert.equal(r.count >= 1, true, `${entity} devrait trouver « ${query} »`);
    assert.equal(r.results[0].id, "x", entity);
  }
});

// ── 20-22. Relations utiles résolues ───────────────────────────────────────────
test("chantier → client (libellé de relation résolu)", async () => {
  const db = makeDb({
    chantiers: [{ id: "ch1", tenant_id: T, nom: "Rénovation Dupont", client_id: "c1", ville: "Paris", statut: "en_cours" }],
    clients: [{ id: "c1", tenant_id: T, nom: "Martin" }],
  });
  const r = await searchWorkspace(db, T, { query: "Dupont", entity: "chantiers" });
  const rel = r.results[0].relationHints?.find((h) => h.entity === "clients");
  assert.equal(rel?.id, "c1");
  assert.equal(rel?.label, "Martin");
});

test("devis → client + chantier ; tâche → chantier", async () => {
  const db = makeDb({
    devis: [{ id: "d1", tenant_id: T, numero: "D-2026-014", client_id: "c1", chantier_id: "ch1", statut: "accepte" }],
    clients: [{ id: "c1", tenant_id: T, nom: "Martin" }],
    chantiers: [{ id: "ch1", tenant_id: T, nom: "rue des Lilas" }],
    tasks: [{ id: "tk1", tenant_id: T, title: "Poser prises", chantier_id: "ch1", status: "todo" }],
  });
  const rd = await searchWorkspace(db, T, { query: "D-2026-014", entity: "devis" });
  const rels = rd.results[0].relationHints ?? [];
  assert.ok(rels.some((h) => h.entity === "clients" && h.label === "Martin"));
  assert.ok(rels.some((h) => h.entity === "chantiers" && h.label === "rue des Lilas"));
  const rt = await searchWorkspace(db, T, { query: "Poser prises", entity: "tasks" });
  assert.ok((rt.results[0].relationHints ?? []).some((h) => h.entity === "chantiers"));
});

// ── 27-28. LLM ne fournit ni table ni colonne ; ambiguïté = pas d'action ────────
test("tool workspace_search : query/entity/limit uniquement (ni table, ni colonne, ni SQL)", () => {
  assert.equal(WORKSPACE_SEARCH_TOOL.name, "workspace_search");
  const props = WORKSPACE_SEARCH_TOOL.input_schema.properties as Record<string, unknown>;
  assert.deepEqual(Object.keys(props).sort(), ["entity", "limit", "query"]);
  for (const forbidden of ["table", "column", "colonne", "sql", "select", "tenant_id", "filter"]) {
    assert.ok(!(forbidden in props), forbidden);
  }
});

test("scoreCandidate / resolveResolution : cohérence des seuils", () => {
  const spec = SEARCH_SPECS.chantiers;
  assert.equal(scoreCandidate(spec, "dupont", "Dupont", { id: "1", nom: "Dupont" })?.matchType, "label_exact");
  assert.equal(scoreCandidate(spec, "zzz", "zzz", { id: "1", nom: "Dupont" }), null);
  assert.equal(resolveResolution([]), "not_found");
});

// ── Requête vide ────────────────────────────────────────────────────────────────
test("requête vide → not_found", async () => {
  assert.equal((await searchWorkspace(makeDb({}), T, { query: "  " })).resolution, "not_found");
});

// ── Recherche multi-entités (sans entity) ──────────────────────────────────────
test("sans entity : cherche dans un ensemble d'entités (ciblé serveur)", async () => {
  const db = makeDb({
    clients: [{ id: "c1", tenant_id: T, nom: "Point P Distribution" }],
    suppliers: [{ id: "s1", tenant_id: T, nom: "Point P", categorie: "fournisseur" }],
  });
  const r = await searchWorkspace(db, T, { query: "Point P" });
  assert.ok(r.count >= 1);
  assert.ok(r.results.some((x) => x.entity === "suppliers" && x.id === "s1"));
});
