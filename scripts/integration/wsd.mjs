// WS-D — contexte canonique & isolation tenant (base éphémère locale).
// Réplique fidèle des lectures de getWorkspaceContextFor (admin + session) et
// utilise la logique PURE réelle (assembleWorkspaceContext).
import { randomUUID } from "node:crypto";
import { adminClient, sessionClient, testTenantIds, TEST_USERS, check, summary } from "./_guard.mjs";
import { assembleWorkspaceContext, civilTodayInTz, emptyCounts, DEFAULT_TIME_ZONE } from "../../lib/workspace-retard.ts";

async function loadContext(db, tenantId) {
  const errors = [];
  const { data: tenant } = await db.from("tenants").select("id, company_info").eq("id", tenantId).maybeSingle();
  const today = civilTodayInTz(DEFAULT_TIME_ZONE);
  if (!tenant) return assembleWorkspaceContext({ tenantExists: false, counts: emptyCounts(), employees: [], chantiers: [], clients: [], errors }, today);

  const counts = emptyCounts();
  const countOf = async (table, apply) => {
    let q = db.from(table).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
    q = apply(q);
    const { count } = await q;
    return count ?? 0;
  };
  counts.employees_actifs = await countOf("employees", (q) => q.eq("statut", "actif"));
  counts.chantiers_total = await countOf("chantiers", (q) => q);
  counts.chantiers_actifs = await countOf("chantiers", (q) => q.eq("statut", "en_cours"));
  counts.clients_total = await countOf("clients", (q) => q);
  counts.chantiers_en_retard = await countOf("chantiers", (q) =>
    q.or(`statut.eq.en_retard,and(statut.in.(en_cours,en_attente),date_fin_prevue.lt.${today},date_fin_reelle.is.null)`)
  );

  const { data: chantiers } = await db.from("chantiers")
    .select("id, nom, statut, ville, avancement, date_debut, date_fin_prevue, date_fin_reelle")
    .eq("tenant_id", tenantId).in("statut", ["en_cours", "en_attente", "en_retard"])
    .order("date_fin_prevue", { ascending: true, nullsFirst: false }).limit(20);
  const { data: employees } = await db.from("employees")
    .select("nom, prenom, role, corps_metier").eq("tenant_id", tenantId).eq("statut", "actif").order("nom").limit(20);
  const { data: clients } = await db.from("clients")
    .select("nom, type, ville").eq("tenant_id", tenantId).order("nom").limit(20);

  return assembleWorkspaceContext(
    { tenantExists: true, counts, employees: employees ?? [], chantiers: chantiers ?? [], clients: clients ?? [], errors },
    today
  );
}

const admin = adminClient();
const t = await testTenantIds(admin);
check("seed : tenants A/B/vide résolus", !!t.A && !!t.B && !!t.EMPTY);

// ── Mode admin (service_role) ──
const a = await loadContext(admin, t.A);
check("A(admin) : status loaded", a.status === "loaded");
const retards = (a.context?.chantiers ?? []).map((c) => c.retard_state);
check("A(admin) : un chantier en_retard présent", retards.includes("en_retard"));
check("A(admin) : une échéance dépassée qualifiée", retards.includes("echeance_depassee"));
check("A(admin) : dates chantier présentes", (a.context?.chantiers ?? []).every((c) => "date_fin_prevue" in c));
check("A(admin) : compteur en_retard > 0", (a.context?.chantiers_en_retard ?? 0) > 0);

// ── Mode session (RLS + auth.uid()) ──
const aSess = await loadContext(sessionClient(TEST_USERS.ownerA), t.A);
check("A(session) : status loaded", aSess.status === "loaded");
check("A(session) : MÊME structure que admin (mêmes clés)", JSON.stringify(Object.keys(a.context ?? {}).sort()) === JSON.stringify(Object.keys(aSess.context ?? {}).sort()));

// ── Isolation ──
const b = await loadContext(admin, t.B);
const idsA = new Set((a.context?.chantiers ?? []).map((c) => c.id));
const idsB = new Set((b.context?.chantiers ?? []).map((c) => c.id));
check("isolation A/B (admin) : aucun chantier croisé", ![...idsA].some((id) => idsB.has(id)));

// Session de A ne peut PAS voir B (RLS bloque → tenant introuvable → failed).
const aSeesB = await loadContext(sessionClient(TEST_USERS.ownerA), t.B);
check("A(session) ne voit PAS le tenant B (RLS)", aSeesB.status === "failed");

// ── Tenant vide / inexistant ──
const empty = await loadContext(admin, t.EMPTY);
check("EMPTY : status empty", empty.status === "empty");
const ghost = await loadContext(admin, randomUUID());
check("GHOST : tenant inexistant → failed", ghost.status === "failed" && ghost.context === null);

summary("WS-D");
