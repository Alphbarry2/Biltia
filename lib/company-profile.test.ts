// Tests unitaires — PROFIL D'ENTREPRISE canonique. Lancer :
//   node --test --experimental-strip-types lib/company-profile.test.ts
//
// Aucun LLM, aucune vraie base : faux client Supabase en mémoire + taux de TVA
// injectés (stub du référentiel lib/tva.ts). On teste la logique réelle.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildCompanyProfile,
  getCompanyProfile,
  formatCompanyProfileForModel,
  companyProfileToDocumentBlock,
  COMPANY_PROFILE_TOOL,
  type CompanyRow,
  type MinimalDb,
} from "./company-profile.ts";

// Stub INJECTÉ du référentiel TVA (mêmes valeurs que lib/tva.ts, injectées ici).
const vatRatesForCountry = (c: "FR" | "BE") => (c === "BE" ? [21, 6, 12, 0] : [20, 10, 5.5, 0]);
const opts = { vatRatesForCountry };

// Faux client Supabase : store par tenant id.
function makeDb(rowsById: Record<string, CompanyRow>): MinimalDb {
  return {
    from() {
      const filters: [string, string][] = [];
      const builder: Record<string, unknown> = {
        select() {
          return builder;
        },
        eq(col: string, val: unknown) {
          filters.push([col, String(val)]);
          return builder;
        },
        maybeSingle() {
          const id = filters.find(([c]) => c === "id")?.[1] ?? "";
          return Promise.resolve({ data: rowsById[id] ?? null, error: null });
        },
      };
      return builder;
    },
  };
}

const FR_ROW: CompanyRow = {
  name: "Dupont Électricité SARL",
  logo_url: "https://cdn.biltia.com/logo.png",
  company_info: { country: "FR", siret: "12345678900012", vat: "FR12345678900", address: "10 rue des Lilas, 75011 Paris", brand: { phone: "0612345678", email: "contact@dupont-elec.fr" } },
};
const BE_ROW: CompanyRow = {
  name: "Janssens Bouw BV",
  logo_url: null,
  company_info: { country: "BE", siret: "0123.456.789", vat: "BE0123456789", address: "Nieuwstraat 5, 1000 Bruxelles", brand: { phone: "+32470112233", email: "info@janssens.be" } },
};

// ── 1. Profil français complet ────────────────────────────────────────────────
test("profil FR complet : SIRET (pas BCE), TVA, adresse, contact, logo", () => {
  const p = buildCompanyProfile("t1", FR_ROW, opts);
  assert.equal(p.legalName, "Dupont Électricité SARL");
  assert.equal(p.registration?.country, "FR");
  assert.equal(p.registration?.siret, "12345678900012");
  assert.equal(p.registration?.bce, undefined); // pas de BCE en France
  assert.equal(p.registration?.vatNumber, "FR12345678900");
  assert.equal(p.contact?.phone, "0612345678");
  assert.equal(p.contact?.email, "contact@dupont-elec.fr");
  assert.equal(p.branding?.logoUrl, "https://cdn.biltia.com/logo.png");
  assert.deepEqual(p.documents?.defaultVatRates, [20, 10, 5.5, 0]);
  assert.equal(p.missingFields.length, 0);
});

// ── 2. Profil belge complet ───────────────────────────────────────────────────
test("profil BE complet : BCE (pas SIRET), taux belges, logo manquant", () => {
  const p = buildCompanyProfile("t2", BE_ROW, opts);
  assert.equal(p.registration?.country, "BE");
  assert.equal(p.registration?.bce, "0123.456.789");
  assert.equal(p.registration?.siret, undefined); // pas de SIRET en Belgique
  assert.deepEqual(p.documents?.defaultVatRates, [21, 6, 12, 0]);
  assert.deepEqual(p.missingFields, ["logo"]); // tout est là sauf le logo
});

// ── 3. Profil partiel ─────────────────────────────────────────────────────────
test("profil partiel : seuls nom + pays → le reste listé manquant", () => {
  const p = buildCompanyProfile("t3", { name: "Petit Artisan", company_info: { country: "FR" } }, opts);
  assert.equal(p.legalName, "Petit Artisan");
  assert.ok(p.missingFields.includes("SIRET"));
  assert.ok(p.missingFields.includes("numéro de TVA"));
  assert.ok(p.missingFields.includes("adresse"));
  assert.ok(p.missingFields.includes("téléphone"));
});

// ── 4. Données réparties colonnes + JSONB ─────────────────────────────────────
test("nom en COLONNE (tenants.name), reste en JSONB (company_info)", () => {
  const p = buildCompanyProfile("t4", FR_ROW, opts);
  assert.equal(p.sources["legalName"], "tenants.name");
  assert.equal(p.sources["registration.vatNumber"], "tenants.company_info.vat");
  assert.equal(p.sources["branding.logoUrl"], "tenants.logo_url");
});

// ── 5. Priorité nom / nom commercial ──────────────────────────────────────────
test("nom commercial distinct du nom légal → tradeName ; identique → non dupliqué", () => {
  const diff = buildCompanyProfile("t5", { name: "SARL Dupont", company_info: { company_name: "Dupont Élec", country: "FR" } }, opts);
  assert.equal(diff.legalName, "SARL Dupont");
  assert.equal(diff.tradeName, "Dupont Élec");
  const same = buildCompanyProfile("t5", { name: "Dupont", company_info: { company_name: "Dupont", country: "FR" } }, opts);
  assert.equal(same.tradeName, undefined);
});

// ── 6. + 18(io). Tenant imposé côté serveur (lecture scopée `.eq(id)`) ─────────
test("getCompanyProfile lit UNIQUEMENT le tenant passé (serveur)", async () => {
  const db = makeDb({ tA: FR_ROW });
  const p = await getCompanyProfile(db, "tA", opts);
  assert.equal(p.tenantId, "tA");
  assert.equal(p.legalName, "Dupont Électricité SARL");
});

// ── 7. Impossibilité de lire un autre tenant ──────────────────────────────────
test("un tenant inconnu (ou autre) → profil tout-manquant, aucune donnée d'autrui", async () => {
  const db = makeDb({ tA: FR_ROW });
  const p = await getCompanyProfile(db, "tB", opts); // tB n'existe pas
  assert.equal(p.tenantId, "tB");
  assert.equal(p.legalName, undefined);
  assert.equal(p.registration?.vatNumber, undefined);
  assert.ok(p.missingFields.includes("raison sociale"));
});

// ── 8-13. Champs disponibles ──────────────────────────────────────────────────
test("champs disponibles : nom, SIRET, BCE, TVA, tél, email, logo", () => {
  const fr = buildCompanyProfile("t", FR_ROW, opts);
  assert.ok(fr.legalName && fr.registration?.siret && fr.registration?.vatNumber && fr.contact?.phone && fr.contact?.email && fr.branding?.logoUrl);
  const be = buildCompanyProfile("t", BE_ROW, opts);
  assert.ok(be.registration?.bce);
});

// ── 14. IBAN absent signalé manquant (jamais inventé) ─────────────────────────
test("include_banking : IBAN/BIC non stockés → signalés manquants, jamais inventés", () => {
  const p = buildCompanyProfile("t", FR_ROW, { ...opts, includeBanking: true });
  assert.ok(p.banking); // le bloc bancaire est présent (demandé)
  assert.equal(p.banking?.iban, undefined); // jamais inventé
  assert.equal(p.banking?.bic, undefined);
  assert.ok(p.missingFields.includes("IBAN"));
  assert.ok(p.missingFields.includes("BIC"));
});

// ── 15. Aucune valeur inventée ────────────────────────────────────────────────
test("aucune valeur inventée : un champ absent reste undefined", () => {
  const p = buildCompanyProfile("t", { name: "X", company_info: { country: "FR" } }, opts);
  assert.equal(p.registration?.siret, undefined);
  assert.equal(p.registration?.vatNumber, undefined);
  assert.equal(p.address?.line1, undefined);
});

// ── 16. Provenance renseignée ─────────────────────────────────────────────────
test("provenance : chaque champ présent a une source, les absents n'en ont pas", () => {
  const p = buildCompanyProfile("t", FR_ROW, opts);
  assert.equal(p.sources["registration.siret"], "tenants.company_info.siret");
  assert.equal(p.sources["contact.email"], "tenants.company_info.brand.email");
  assert.equal(p.sources["documents.defaultVatRates"], "lib/tva.ts (taux par pays)");
  assert.equal(p.sources["registration.bce"], undefined); // FR → pas de BCE → pas de source
});

// ── 17. missingFields correct (libellé pays-dépendant) ────────────────────────
test("missingFields : « numéro BCE » en Belgique, « SIRET » en France", () => {
  const beVide = buildCompanyProfile("t", { name: "N", company_info: { country: "BE" } }, opts);
  assert.ok(beVide.missingFields.includes("numéro BCE"));
  assert.ok(!beVide.missingFields.includes("SIRET"));
  const frVide = buildCompanyProfile("t", { name: "N", company_info: { country: "FR" } }, opts);
  assert.ok(frVide.missingFields.includes("SIRET"));
});

// ── 18. Outil exposé, SANS paramètre de tenant ────────────────────────────────
test("tool company_profile_get : nommé, sans paramètre de tenant, avec include_banking", () => {
  assert.equal(COMPANY_PROFILE_TOOL.name, "company_profile_get");
  const props = COMPANY_PROFILE_TOOL.input_schema.properties as Record<string, unknown>;
  assert.ok(!("tenant_id" in props) && !("tenantId" in props) && !("entity" in props));
  assert.ok("include_banking" in props);
});

// ── 19. Document utilisant la source canonique ────────────────────────────────
test("companyProfileToDocumentBlock : bloc en-tête depuis le MÊME profil (téléphone/email inclus)", () => {
  const block = companyProfileToDocumentBlock(buildCompanyProfile("t", FR_ROW, opts));
  assert.match(block, /Dupont Électricité SARL/);
  assert.match(block, /SIRET : 12345678900012/);
  assert.match(block, /N° TVA : FR12345678900/);
  assert.match(block, /Téléphone : 0612345678/);
  assert.match(block, /Email : contact@dupont-elec.fr/);
  assert.match(block, /placeholder clair \[entre crochets\]/);
  // Belgique → libellé BCE, pas SIRET.
  assert.match(companyProfileToDocumentBlock(buildCompanyProfile("t", BE_ROW, opts)), /N° BCE : 0123\.456\.789/);
  // Aucune info → bloc vide (documents inchangés).
  assert.equal(companyProfileToDocumentBlock(buildCompanyProfile("t", null, opts)), "");
});

// ── 20. Données bancaires NON incluses par défaut ─────────────────────────────
test("résumé modèle : pas de banque par défaut ; présente seulement si demandée", () => {
  const general = formatCompanyProfileForModel(buildCompanyProfile("t", FR_ROW, opts));
  assert.ok(!("iban" in general) && !("bic" in general)); // jamais dans un résumé général
  assert.equal(general.vat_number, "FR12345678900");
  assert.equal(general.id_label, "SIRET");
  const facture = formatCompanyProfileForModel(buildCompanyProfile("t", FR_ROW, { ...opts, includeBanking: true }));
  assert.ok("iban" in facture); // présent (et null : non renseigné) quand demandé
});
