// Tests unitaires WS-D (logique PURE). Lancer :
//   node --test --experimental-strip-types lib/workspace-retard.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addCivilDays,
  assembleWorkspaceContext,
  civilDaysBetween,
  civilTodayInTz,
  computeJoursRetard,
  deriveRetardState,
  emptyCounts,
  isEmptyContext,
  mapChantier,
  renderWorkspaceBlock,
  resolveTenantTimeZone,
} from "./workspace-retard.ts";
import type { ChantierRow, RawContext, WorkspaceContext, WorkspaceContextResult } from "./workspace-retard.ts";

const TODAY = "2026-07-18";

function chantier(partial: Partial<ChantierRow>): ChantierRow {
  return {
    id: partial.id ?? "id-1",
    nom: partial.nom ?? "Chantier",
    statut: partial.statut ?? "en_cours",
    ville: partial.ville ?? null,
    avancement: partial.avancement ?? 0,
    date_debut: partial.date_debut ?? null,
    date_fin_prevue: partial.date_fin_prevue ?? null,
    date_fin_reelle: partial.date_fin_reelle ?? null,
  };
}

// ── deriveRetardState ────────────────────────────────────────────────────────

test("deriveRetardState: statut en_retard prime", () => {
  assert.equal(deriveRetardState({ statut: "en_retard", date_fin_prevue: null, date_fin_reelle: null }, TODAY), "en_retard");
});

test("deriveRetardState: terminé en retard (fin réelle > fin prévue)", () => {
  assert.equal(
    deriveRetardState({ statut: "termine", date_fin_prevue: "2026-06-01", date_fin_reelle: "2026-06-10" }, TODAY),
    "termine_en_retard"
  );
});

test("deriveRetardState: terminé à l'heure → null", () => {
  assert.equal(
    deriveRetardState({ statut: "termine", date_fin_prevue: "2026-06-10", date_fin_reelle: "2026-06-10" }, TODAY),
    null
  );
});

test("deriveRetardState: échéance dépassée, statut non à jour", () => {
  assert.equal(
    deriveRetardState({ statut: "en_cours", date_fin_prevue: "2026-07-01", date_fin_reelle: null }, TODAY),
    "echeance_depassee"
  );
});

test("deriveRetardState: échéance aujourd'hui n'est PAS un retard", () => {
  assert.equal(
    deriveRetardState({ statut: "en_cours", date_fin_prevue: TODAY, date_fin_reelle: null }, TODAY),
    null
  );
});

test("deriveRetardState: actif dans les temps → null", () => {
  assert.equal(
    deriveRetardState({ statut: "en_cours", date_fin_prevue: "2026-09-01", date_fin_reelle: null }, TODAY),
    null
  );
});

test("deriveRetardState: actif avec fin réelle (déjà livré) → pas echeance_depassee", () => {
  assert.equal(
    deriveRetardState({ statut: "en_cours", date_fin_prevue: "2026-07-01", date_fin_reelle: "2026-07-02" }, TODAY),
    null
  );
});

test("deriveRetardState: dates nulles → null", () => {
  assert.equal(deriveRetardState({ statut: "en_cours", date_fin_prevue: null, date_fin_reelle: null }, TODAY), null);
});

// ── computeJoursRetard ───────────────────────────────────────────────────────

test("computeJoursRetard: échéance dépassée = jours écoulés", () => {
  assert.equal(computeJoursRetard({ statut: "en_cours", date_fin_prevue: "2026-07-01", date_fin_reelle: null }, TODAY), 17);
});

test("computeJoursRetard: en_retard sans date → null", () => {
  assert.equal(computeJoursRetard({ statut: "en_retard", date_fin_prevue: null, date_fin_reelle: null }, TODAY), null);
});

test("computeJoursRetard: terminé en retard = écart prévu/réel", () => {
  assert.equal(
    computeJoursRetard({ statut: "termine", date_fin_prevue: "2026-06-01", date_fin_reelle: "2026-06-10" }, TODAY),
    9
  );
});

test("computeJoursRetard: sain → null", () => {
  assert.equal(computeJoursRetard({ statut: "en_cours", date_fin_prevue: "2026-09-01", date_fin_reelle: null }, TODAY), null);
});

// ── civilDaysBetween : insensible au changement d'heure ──────────────────────

test("civilDaysBetween: mêmes dates = 0", () => {
  assert.equal(civilDaysBetween("2026-07-18", "2026-07-18"), 0);
});

test("civilDaysBetween: passage à l'heure d'été (Bruxelles, 29/03/2026) sans erreur d'un jour", () => {
  assert.equal(civilDaysBetween("2026-03-28", "2026-03-30"), 2);
});

test("civilDaysBetween: retour heure d'hiver (25/10/2026) sans erreur d'un jour", () => {
  assert.equal(civilDaysBetween("2026-10-24", "2026-10-26"), 2);
});

test("civilDaysBetween: bascule d'année", () => {
  assert.equal(civilDaysBetween("2025-12-31", "2026-01-01"), 1);
});

// ── addCivilDays ─────────────────────────────────────────────────────────────

test("addCivilDays: fin de mois", () => {
  assert.equal(addCivilDays("2026-01-31", 1), "2026-02-01");
});

test("addCivilDays: +30 jours", () => {
  assert.equal(addCivilDays("2026-07-18", 30), "2026-08-17");
});

// ── civilTodayInTz : limites de journée ──────────────────────────────────────

test("civilTodayInTz: 23:30 UTC bascule au lendemain à Bruxelles (UTC+2 l'été)", () => {
  const now = new Date("2026-07-18T23:30:00Z");
  assert.equal(civilTodayInTz("Europe/Brussels", now), "2026-07-19");
});

test("civilTodayInTz: même instant reste la veille à Honolulu (UTC-10)", () => {
  const now = new Date("2026-07-18T23:30:00Z");
  assert.equal(civilTodayInTz("Pacific/Honolulu", now), "2026-07-18");
});

test("civilTodayInTz: fuseau invalide → repli Bruxelles", () => {
  const now = new Date("2026-07-18T23:30:00Z");
  assert.equal(civilTodayInTz("Not/AZone", now), civilTodayInTz("Europe/Brussels", now));
});

// ── resolveTenantTimeZone ────────────────────────────────────────────────────

test("resolveTenantTimeZone: fuseau valide conservé", () => {
  assert.equal(resolveTenantTimeZone({ timezone: "Europe/Paris" }), "Europe/Paris");
});

test("resolveTenantTimeZone: absent → Bruxelles", () => {
  assert.equal(resolveTenantTimeZone(null), "Europe/Brussels");
  assert.equal(resolveTenantTimeZone({}), "Europe/Brussels");
});

test("resolveTenantTimeZone: fuseau invalide → Bruxelles", () => {
  assert.equal(resolveTenantTimeZone({ timezone: "garbage/zone" }), "Europe/Brussels");
});

// ── assembleWorkspaceContext : status loaded / empty / partial / failed ──────

function rawBase(over: Partial<RawContext> = {}): RawContext {
  return {
    tenantExists: true,
    counts: emptyCounts(),
    employees: [],
    chantiers: [],
    clients: [],
    errors: [],
    ...over,
  };
}

test("assemble: tenant inexistant → failed, context null", () => {
  const r = assembleWorkspaceContext(rawBase({ tenantExists: false }), TODAY);
  assert.equal(r.status, "failed");
  assert.equal(r.context, null);
});

test("assemble: tout vide sans erreur → empty", () => {
  const r = assembleWorkspaceContext(rawBase(), TODAY);
  assert.equal(r.status, "empty");
  assert.ok(r.context && isEmptyContext(r.context));
});

test("assemble: données présentes → loaded + chantier enrichi", () => {
  const r = assembleWorkspaceContext(
    rawBase({
      counts: { ...emptyCounts(), chantiers_total: 1, chantiers_en_retard: 1 },
      chantiers: [chantier({ id: "c1", nom: "Dupont", statut: "en_retard", date_fin_prevue: "2026-07-10" })],
    }),
    TODAY
  );
  assert.equal(r.status, "loaded");
  assert.equal(r.context?.chantiers[0].retard_state, "en_retard");
  assert.equal(r.context?.chantiers[0].jours_retard, 8);
});

test("assemble: erreur NON critique → partial", () => {
  const r = assembleWorkspaceContext(
    rawBase({ errors: [{ source: "employees", critical: false, message: "boom" }] }),
    TODAY
  );
  assert.equal(r.status, "partial");
});

test("assemble: erreur CRITIQUE → failed (même avec des données)", () => {
  const r = assembleWorkspaceContext(
    rawBase({
      counts: { ...emptyCounts(), clients_total: 3 },
      errors: [{ source: "chantiers", critical: true, message: "boom" }],
    }),
    TODAY
  );
  assert.equal(r.status, "failed");
});

test("assemble: tri retards en tête puis échéance", () => {
  const r = assembleWorkspaceContext(
    rawBase({
      chantiers: [
        chantier({ id: "sain", nom: "Sain", statut: "en_cours", date_fin_prevue: "2026-12-01" }),
        chantier({ id: "retard", nom: "Retard", statut: "en_retard", date_fin_prevue: "2026-06-01" }),
        chantier({ id: "depasse", nom: "Depasse", statut: "en_cours", date_fin_prevue: "2026-07-01" }),
      ],
    }),
    TODAY
  );
  assert.deepEqual(
    r.context?.chantiers.map((c) => c.id),
    ["retard", "depasse", "sain"]
  );
});

// ── renderWorkspaceBlock ──────────────────────────────────────────────────────

function loadedContext(): WorkspaceContext {
  return {
    ...emptyCounts(),
    chantiers_total: 1,
    chantiers_actifs: 1,
    chantiers_en_retard: 1,
    employees: [],
    chantiers: [mapChantier(chantier({ nom: "Dupont", statut: "en_retard", ville: "Namur", date_fin_prevue: "2026-07-10", avancement: 40 }), TODAY)],
    clients: [],
  };
}

test("render: entrée null → chaîne vide", () => {
  assert.equal(renderWorkspaceBlock(null), "");
});

test("render: résultat avec context null → chaîne vide", () => {
  const res: WorkspaceContextResult = {
    context: null,
    meta: { mode: "admin", tenantId: "t", tenantExists: false, status: "failed", loaded: false, empty: false, durationMs: 1, counts: { employees: 0, chantiers: 0, clients: 0 }, fallbackUsed: true, errors: [] },
  };
  assert.equal(renderWorkspaceBlock(res), "");
});

test("render: workspace vide → bloc explicite (jamais vide)", () => {
  const empty: WorkspaceContext = { ...emptyCounts(), employees: [], chantiers: [], clients: [] };
  const out = renderWorkspaceBlock(empty);
  assert.notEqual(out, "");
  assert.match(out, /AUCUN chantier/);
  assert.match(out, /N'invente/);
});

test("render: chantier en retard visible avec jours + fin prévue", () => {
  const out = renderWorkspaceBlock(loadedContext());
  assert.match(out, /EN RETARD \(8 j\)/);
  assert.match(out, /fin prévue 2026-07-10/);
  assert.match(out, /chantier\(s\) en retard/);
});

test("render: note 'données partielles' quand status partial", () => {
  const res: WorkspaceContextResult = {
    context: loadedContext(),
    meta: { mode: "session", tenantId: "t", tenantExists: true, status: "partial", loaded: true, empty: false, durationMs: 1, counts: { employees: 0, chantiers: 1, clients: 0 }, fallbackUsed: true, errors: [{ source: "clients", critical: false, message: "x" }] },
  };
  const out = renderWorkspaceBlock(res);
  assert.match(out, /Données partielles/);
  assert.match(out, /clients/);
});

test("render: sanitize appliqué aux noms libres", () => {
  const out = renderWorkspaceBlock(loadedContext(), (s) => `⟦${s}⟧`);
  assert.match(out, /⟦Dupont⟧/);
});
