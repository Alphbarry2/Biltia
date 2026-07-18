// ─────────────────────────────────────────────────────────────────────────────
// WS-D — Vérification d'INTÉGRATION & de SÉCURITÉ du contexte workspace.
//
// Exécute les mêmes requêtes que getWorkspaceContextFor (mode admin, service_role)
// et la MÊME logique d'assemblage pure (assembleWorkspaceContext), contre de VRAIS
// tenants de TEST, pour prouver : isolation A/B, contexte vide, tenant inexistant,
// présence des dates et de l'état de retard.
//
// ⚠️ NE TOURNE PAS CONTRE LA PRODUCTION. Garde-fous :
//   - refuse par défaut le projet de prod (override explicite WSD_ALLOW_PROD=1) ;
//   - n'agit que sur des tenants de TEST identifiables (préfixe WSD_TEST_) ;
//   - par défaut LECTURE SEULE sur des tenants fournis (aucune écriture) ;
//   - avec WSD_CREATE=1 : crée un jeu minimal puis le NETTOIE en fin de course ;
//   - ne journalise jamais les données métier complètes (compteurs/status/ids seulement).
//
// Lancer (contre une branche Supabase de test, PAS la prod) :
//   WSD_INTEGRATION=1 \
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   WSD_TENANT_A=<uuid> WSD_TENANT_B=<uuid> [WSD_TENANT_EMPTY=<uuid>] \
//   node --experimental-strip-types scripts/wsd-context-check.mjs
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { assembleWorkspaceContext, civilTodayInTz, emptyCounts, resolveTenantTimeZone } from "../lib/workspace-retard.ts";

const PROD_REF = "docqrznkbtyctjqpvifu"; // projet de PRODUCTION — jamais par défaut
const TEST_PREFIX = "WSD_TEST_";

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

if (process.env.WSD_INTEGRATION !== "1") {
  console.log("WS-D integration check — désactivé par défaut.");
  console.log("Pour l'exécuter contre une base de TEST : WSD_INTEGRATION=1 (voir l'en-tête du fichier).");
  process.exit(0);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!url || !key) fail("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis.");
if (url.includes(PROD_REF) && process.env.WSD_ALLOW_PROD !== "1") {
  fail("Cible = projet de PRODUCTION. Refus. (Utiliser une branche de test, ou WSD_ALLOW_PROD=1 en toute connaissance de cause.)");
}

const db = createClient(url, key, { auth: { persistSession: false } });

// ── Réplique fidèle des requêtes de getWorkspaceContextFor (mode admin) ───────
async function loadContext(tenantId) {
  const errors = [];
  const msg = (e) => (e instanceof Error ? e.message : String(e));

  let tenantExists = false;
  let timeZone = resolveTenantTimeZone(null);
  {
    const { data, error } = await db.from("tenants").select("id, company_info").eq("id", tenantId).maybeSingle();
    if (error) errors.push({ source: "tenant", critical: true, message: msg(error) });
    else if (data) {
      tenantExists = true;
      timeZone = resolveTenantTimeZone(data.company_info);
    }
  }
  const today = civilTodayInTz(timeZone);
  if (!tenantExists) return { context: null, status: "failed", tenantExists: false, today };

  const counts = emptyCounts();
  const countTasks = [
    ["employees_actifs", db.from("employees").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("statut", "actif")],
    ["chantiers_total", db.from("chantiers").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId)],
    ["chantiers_actifs", db.from("chantiers").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("statut", "en_cours")],
    ["clients_total", db.from("clients").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId)],
    ["chantiers_en_retard", db.from("chantiers").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).or(`statut.eq.en_retard,and(statut.in.(en_cours,en_attente),date_fin_prevue.lt.${today},date_fin_reelle.is.null)`)],
  ];
  await Promise.all(
    countTasks.map(async ([k, p]) => {
      try {
        const { count, error } = await p;
        if (error) throw error;
        if (typeof count === "number") counts[k] = count;
      } catch (e) {
        errors.push({ source: `counts.${k}`, critical: false, message: msg(e) });
      }
    })
  );

  const readList = async (table, cols, apply, source, critical) => {
    try {
      let q = db.from(table).select(cols).eq("tenant_id", tenantId);
      q = apply(q);
      const { data, error } = await q.limit(20);
      if (error) throw error;
      return data ?? [];
    } catch (e) {
      errors.push({ source, critical, message: msg(e) });
      return [];
    }
  };
  const chantiers = await readList(
    "chantiers",
    "id, nom, statut, ville, avancement, date_debut, date_fin_prevue, date_fin_reelle",
    (q) => q.in("statut", ["en_cours", "en_attente", "en_retard"]).order("date_fin_prevue", { ascending: true, nullsFirst: false }),
    "chantiers",
    true
  );
  const employees = await readList("employees", "nom, prenom, role, corps_metier", (q) => q.eq("statut", "actif").order("nom"), "employees", false);
  const clients = await readList("clients", "nom, type, ville", (q) => q.order("nom"), "clients", false);

  const assembled = assembleWorkspaceContext({ tenantExists: true, counts, employees, chantiers, clients, errors }, today);
  return { context: assembled.context, status: assembled.status, tenantExists: true, today };
}

// ── Utilitaires de test ───────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
function check(name, cond) {
  if (cond) {
    passed += 1;
    console.log(`  ok  ${name}`);
  } else {
    failed += 1;
    console.error(`  KO  ${name}`);
  }
}

async function main() {
  const created = []; // { table, id } à nettoyer si WSD_CREATE

  try {
    let tenantA = process.env.WSD_TENANT_A;
    let tenantB = process.env.WSD_TENANT_B;
    let tenantEmpty = process.env.WSD_TENANT_EMPTY;

    if (process.env.WSD_CREATE === "1") {
      // Création d'un jeu minimal (à adapter au schéma réel des `tenants` si des
      // colonnes NOT NULL supplémentaires existent). Chaque insert est enregistré
      // pour nettoyage. NE PAS lancer contre la prod.
      const mkTenant = async (label) => {
        const name = `${TEST_PREFIX}${label}_${Date.now()}`;
        const { data, error } = await db.from("tenants").insert({ name }).select("id").single();
        if (error) fail(`création tenant ${label} : ${error.message}`);
        created.push({ table: "tenants", id: data.id });
        return data.id;
      };
      tenantA = await mkTenant("A");
      tenantB = await mkTenant("B");
      tenantEmpty = await mkTenant("EMPTY");

      const mkChantier = async (tid, row) => {
        const { data, error } = await db.from("chantiers").insert({ tenant_id: tid, ...row }).select("id").single();
        if (error) fail(`création chantier : ${error.message}`);
        created.push({ table: "chantiers", id: data.id });
      };
      await mkChantier(tenantA, { nom: `${TEST_PREFIX}A_retard`, statut: "en_retard", date_fin_prevue: "2026-01-10" });
      await mkChantier(tenantA, { nom: `${TEST_PREFIX}A_actif`, statut: "en_cours", date_fin_prevue: "2026-12-01" });
      await mkChantier(tenantB, { nom: `${TEST_PREFIX}B_actif`, statut: "en_cours", date_fin_prevue: "2026-11-01" });
    }

    if (!tenantA || !tenantB) {
      fail("Fournir WSD_TENANT_A et WSD_TENANT_B (tenants de TEST), ou WSD_CREATE=1.");
    }

    const a = await loadContext(tenantA);
    const b = await loadContext(tenantB);

    // 1) Structure non vide et cohérente (agent service_role → contexte rempli).
    check("A: status non failed", a.status !== "failed");
    check("A: contexte présent", !!a.context);

    // 2) Isolation A/B : aucun id de chantier partagé.
    const idsA = new Set((a.context?.chantiers ?? []).map((c) => c.id));
    const idsB = new Set((b.context?.chantiers ?? []).map((c) => c.id));
    const overlap = [...idsA].filter((id) => idsB.has(id));
    check("isolation A/B : aucun chantier croisé", overlap.length === 0);

    // 3) Dates présentes + état de retard déterministe.
    const anyChantier = (a.context?.chantiers ?? [])[0];
    if (anyChantier) {
      check("A: colonnes de dates présentes", "date_fin_prevue" in anyChantier);
      check("A: retard_state calculé", "retard_state" in anyChantier);
    }

    // 4) Tenant vide → status empty (si fourni/créé).
    if (tenantEmpty) {
      const e = await loadContext(tenantEmpty);
      check("EMPTY: status empty ou loaded sans données", e.status === "empty" || (e.status === "loaded" && (e.context?.chantiers.length ?? 0) === 0));
    }

    // 5) Tenant inexistant → failed contrôlé, pas d'exception.
    const ghost = await loadContext(randomUUID());
    check("GHOST: tenant inexistant → failed", ghost.status === "failed" && ghost.context === null);

    // Logs NON sensibles : compteurs/status uniquement.
    console.log("\nrésumé (non sensible):", JSON.stringify({
      A: { status: a.status, chantiers: a.context?.chantiers.length ?? 0, en_retard: a.context?.chantiers_en_retard ?? 0 },
      B: { status: b.status, chantiers: b.context?.chantiers.length ?? 0 },
    }));
  } finally {
    // Nettoyage de ce qui a été créé (ordre inverse).
    for (const { table, id } of created.reverse()) {
      const { error } = await db.from(table).delete().eq("id", id);
      if (error) console.error(`  (nettoyage) échec suppression ${table}/${id} : ${error.message}`);
    }
  }

  console.log(`\n${passed} ok, ${failed} KO`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
