// ─────────────────────────────────────────────────────────────────────────────
// /api/admin/stats — agrégats de la console admin. DEUX barrières :
//   1. La session doit appartenir à un email de la liste blanche (lib/admin.ts).
//   2. Les données sont lues avec le client service_role (bypass RLS) — donc
//      cette route NE DOIT jamais répondre sans avoir validé le point 1.
//
// FIABILITÉ (2026-07-08) — trois vérités que la v1 mélangeait :
//   • REVENU ≠ crédits consommés. Le CA réel = abonnements PAYANTS (MRR). Les
//     crédits consommés × tarif = une VALEUR THÉORIQUE (« si c'était vendu »),
//     jamais du chiffre d'affaires. La v1 affichait ~240 € de « revenu » qui
//     n'existait pas (aucun abonné payant).
//   • FONDATEUR ≠ client. ~100 % de l'usage actuel vient du compte fondateur
//     (tests internes, crédits jamais facturés). On l'ISOLE : les métriques
//     business (revenu, marge, clients, demande) ne comptent QUE de vrais
//     clients ; le coût des tests est montré à part (« R&D interne »).
//   • TOTAL = tout. On agrège TOUTES les lignes ai_usage (pagination), jamais un
//     échantillon des 5000 dernières qui tronque silencieusement les totaux.
//
// Le coût API affiché est un ESTIMÉ interne (calcCost sur les tokens, tarif
// catalogue). Il peut différer légèrement de la facture du fournisseur : tarif
// intro Sonnet facturé au standard (marge prudente) et coût du cache non modélisé.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { isAdminEmail } from "@/lib/admin";
import { isFounderEmail } from "@/lib/founder";
import { PLANS } from "@/lib/plans";

/** Coûts modèles facturés en USD, marge exprimée en EUR (cohérent ai-usage.ts). */
const USD_TO_EUR = 0.92;

/** Statuts d'abonnement considérés comme « payants actifs » pour le MRR. */
const PAID_STATUSES = new Set(["active", "trialing", "past_due"]);

/** Prix de vente d'un crédit au palier Pro de base (49 € / 1000 crédits). */
function salePerCreditEur(): number {
  const base = PLANS.pro.tiers[0];
  return base ? base.priceEur / base.credits : 0.049;
}

/** Prix mensuel du palier Pro de base — plancher honnête pour le MRR tant que le
 *  palier réel de chaque abonnement n'est pas stocké (schéma subscriptions). */
function proBaseMonthlyEur(): number {
  return PLANS.pro.tiers[0]?.priceEur ?? 49;
}

type UsageRow = {
  user_id: string | null;
  model: string | null;
  action: string | null;
  cost_usd: number | null;
  credits: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: string | null;
};

type Bucket = { key: string; calls: number; inTok: number; outTok: number; costUsd: number; credits: number };

/**
 * IDs des comptes fondateur (tests internes), résolus via l'API admin auth. En
 * cas d'échec on renvoie un ensemble vide → dégradation SÛRE : on n'exclut
 * personne plutôt que d'exclure au hasard (les totaux restent justes, seule la
 * séparation client/interne est neutralisée).
 */
async function founderUserIds(admin: SupabaseClient): Promise<Set<string>> {
  const ids = new Set<string>();
  try {
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      const users = data?.users ?? [];
      if (error || users.length === 0) break;
      for (const u of users) if (isFounderEmail(u.email)) ids.add(u.id);
      if (users.length < 1000) break;
    }
  } catch {
    // API admin indisponible → aucun fondateur exclu (sûr).
  }
  return ids;
}

/**
 * Récupère TOUTES les lignes ai_usage par pages de 1000. Aucun plafond
 * silencieux : les totaux sont de vrais totaux. Garde-fou dur à 200 000 lignes
 * (au-delà, basculer cette agrégation dans une RPC SQL service_role-only).
 */
async function fetchAllUsage(admin: SupabaseClient): Promise<{ rows: UsageRow[]; truncated: boolean }> {
  const rows: UsageRow[] = [];
  const PAGE = 1000;
  const HARD_CAP = 200_000;
  for (let from = 0; from < HARD_CAP; from += PAGE) {
    const { data, error } = await admin
      .from("ai_usage")
      .select("user_id, model, action, cost_usd, credits, input_tokens, output_tokens, created_at")
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    const batch = (data ?? []) as UsageRow[];
    if (error || batch.length === 0) break;
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return { rows, truncated: rows.length >= HARD_CAP };
}

export async function GET() {
  // Barrière 1 — email autorisé.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) {
    return Response.json({ error: "Accès refusé." }, { status: 403 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return Response.json({ error: "Service role non configuré." }, { status: 503 });
  }

  // ── Comptes de tables (rapides : head:true, aucune ligne rapatriée) ─────────
  // .from() attend un nom de table littéral (types générés) ; la table est ici
  // dynamique, on passe par une référence souplement typée (motif déjà utilisé
  // ailleurs côté serveur pour les accès génériques).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as unknown as { from: (t: string) => any };
  const countOf = async (table: string): Promise<number> => {
    const { count, error } = await db.from(table).select("*", { count: "exact", head: true });
    return error ? 0 : count ?? 0;
  };

  const [users, tenants, apps, edits, documents, reports, conversations, founderIds] = await Promise.all([
    countOf("profiles"),
    countOf("tenants"),
    countOf("modules"),
    countOf("module_versions"),
    countOf("documents"),
    countOf("reports"),
    countOf("conversations"),
    founderUserIds(admin),
  ]);
  const isFounder = (uid: string | null | undefined): boolean => !!uid && founderIds.has(uid);

  // ── ai_usage : le cœur coûts / marge (TOUTES les lignes, pagination) ────────
  const { rows, truncated } = await fetchAllUsage(admin);

  const byModelMap = new Map<string, Bucket>();
  const byActionMap = new Map<string, Bucket>();
  const byDayMap = new Map<string, { costUsd: number; credits: number; calls: number }>();

  // Totaux TOUT COMPRIS (coût API réel, tests inclus) — c'est l'argent dépensé.
  let totCost = 0;
  let totCredits = 0;
  let totIn = 0;
  let totOut = 0;
  // Split client / interne (fondateur).
  let clientCost = 0;
  let clientCredits = 0;
  let internalCost = 0;
  let internalCredits = 0;
  let internalCalls = 0;

  const bump = (map: Map<string, Bucket>, key: string, r: UsageRow) => {
    const b = map.get(key) ?? { key, calls: 0, inTok: 0, outTok: 0, costUsd: 0, credits: 0 };
    b.calls += 1;
    b.inTok += r.input_tokens ?? 0;
    b.outTok += r.output_tokens ?? 0;
    b.costUsd += Number(r.cost_usd) || 0;
    b.credits += r.credits ?? 0;
    map.set(key, b);
  };

  for (const r of rows) {
    const cost = Number(r.cost_usd) || 0;
    const credits = r.credits ?? 0;
    totCost += cost;
    totCredits += credits;
    totIn += r.input_tokens ?? 0;
    totOut += r.output_tokens ?? 0;
    if (isFounder(r.user_id)) {
      internalCost += cost;
      internalCredits += credits;
      internalCalls += 1;
    } else {
      clientCost += cost;
      clientCredits += credits;
    }
    // byModel / byAction / byDay = TOUT COMPRIS (vue « où part l'argent API »).
    bump(byModelMap, r.model ?? "inconnu", r);
    bump(byActionMap, r.action ?? "inconnu", r);
    const day = (r.created_at ?? "").slice(0, 10);
    if (day) {
      const d = byDayMap.get(day) ?? { costUsd: 0, credits: 0, calls: 0 };
      d.costUsd += cost;
      d.credits += credits;
      d.calls += 1;
      byDayMap.set(day, d);
    }
  }

  const round = (n: number, p = 2) => Math.round(n * 10 ** p) / 10 ** p;
  const sale = salePerCreditEur();

  // ── Abonnements → CA RÉEL (MRR) + répartition par plan ──────────────────────
  const { data: subs } = await admin.from("subscriptions").select("tenant_id, plan, status");
  const planMap = new Map<string, number>();
  const payingTenantSet = new Set<string>();
  for (const s of (subs ?? []) as { tenant_id?: string; plan?: string; status?: string }[]) {
    const k = `${s.plan ?? "—"}/${s.status ?? "—"}`;
    planMap.set(k, (planMap.get(k) ?? 0) + 1);
    if (s.tenant_id && s.plan && s.plan !== "free" && PAID_STATUSES.has(s.status ?? "")) {
      payingTenantSet.add(s.tenant_id);
    }
  }
  const payingTenants = payingTenantSet.size;
  // Le palier exact d'un abonnement n'est pas stocké (schéma subscriptions) : on
  // prend le palier Pro de base comme PLANCHER honnête. Quand le palier réel sera
  // persisté, remplacer par la somme des prix réels. Aujourd'hui : 0 payant → 0 €.
  const mrrEur = round(payingTenants * proBaseMonthlyEur(), 2);

  // Valeur THÉORIQUE de la consommation CLIENT (« si facturée au tarif Pro ») —
  // ce n'est PAS du chiffre d'affaires, juste un repère d'unit-economics.
  const clientConsumedValueEur = round(clientCredits * sale, 2);
  const clientCostEur = round(clientCost * USD_TO_EUR, 2);
  const internalCostEur = round(internalCost * USD_TO_EUR, 2);
  const costEur = round(totCost * USD_TO_EUR, 2);

  // Marge STRUCTURELLE sur la consommation client (crédits débités au coût réel →
  // ~90 %+ par construction). Null tant qu'aucun client n'a rien consommé.
  const marginPct =
    clientConsumedValueEur > 0 ? round((1 - clientCostEur / clientConsumedValueEur) * 100, 1) : null;
  // Marge BUSINESS réelle = (MRR − coût API imputable aux clients) / MRR.
  const businessMarginPct = mrrEur > 0 ? round((1 - clientCostEur / mrrEur) * 100, 1) : null;

  const { data: credits } = await admin.from("user_credits").select("balance").limit(10000);
  const outstandingCredits = (credits ?? []).reduce((a, c) => a + (c.balance ?? 0), 0);

  // Profil entreprise (renseigné à l'onboarding) + appartenances, pour la
  // démographie et l'analyse « payé / crédits PAR TAILLE d'entreprise ».
  const { data: tenantRows } = await admin.from("tenants").select("id, company_info").limit(10000);
  const { data: memberRows } = await admin.from("tenant_members").select("tenant_id, user_id, role").limit(20000);

  // ── Inscriptions par jour (30 j) — hors comptes fondateur ───────────────────
  const { data: profs } = await admin
    .from("profiles")
    .select("user_id, company_name, created_at")
    .order("created_at", { ascending: false })
    .limit(5000);
  const clientProfiles = (profs ?? []).filter((p) => !isFounder((p as { user_id?: string }).user_id));
  const founderAccounts = (profs ?? []).length - clientProfiles.length;
  const signupsMap = new Map<string, number>();
  for (const p of clientProfiles) {
    const day = ((p as { created_at?: string }).created_at ?? "").slice(0, 10);
    if (day) signupsMap.set(day, (signupsMap.get(day) ?? 0) + 1);
  }

  // ── « CE QUE DEMANDENT LES UTILISATEURS » (clients réels uniquement) ────────
  const USER_FACING = new Set(["create_app", "edit_app", "ask", "analyze", "automate"]);
  const reqTypeMap = new Map<string, number>();
  for (const r of rows) {
    if (isFounder(r.user_id)) continue;
    const a = r.action ?? "";
    if (USER_FACING.has(a)) reqTypeMap.set(a, (reqTypeMap.get(a) ?? 0) + 1);
  }

  // 2) Thèmes des créations : depuis app_events (apps + documents).
  const { data: eventRows } = await admin
    .from("app_events")
    .select("user_id, event_type, created_at, agent, sector, app_type, metadata")
    .order("created_at", { ascending: false })
    .limit(5000);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allEvents = (eventRows ?? []) as any[];
  // Les tests fondateur ne doivent pas polluer « ce que demandent les clients ».
  const events = allEvents.filter((e) => !isFounder(e.user_id));
  const creationEvents = events.filter(
    (e) => e.event_type === "app_created" || e.event_type === "app_edited"
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tally = (extract: (e: any) => unknown) => {
    const m = new Map<string, number>();
    for (const e of creationEvents) {
      const k = String(extract(e) ?? "").trim();
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
  };

  const questionEvents = events.filter((e) => e.event_type === "question_asked");
  const qTopicMap = new Map<string, number>();
  for (const e of questionEvents) {
    const t = String(e.metadata?.topic ?? "").trim();
    if (t) qTopicMap.set(t, (qTopicMap.get(t) ?? 0) + 1);
  }
  const recentQuestions = questionEvents.slice(0, 15).map((e) => ({
    topic: String(e.metadata?.topic ?? "—"),
    question: String(e.metadata?.question ?? ""),
    agent: e.agent ?? null,
    createdAt: e.created_at ?? null,
  }));

  const demand = {
    byRequestType: [...reqTypeMap.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count),
    byKind: tally((e) => e.metadata?.kind),
    byAppType: tally((e) => e.app_type),
    byDocType: tally((e) => e.metadata?.doc_type),
    byAgent: tally((e) => e.agent),
    bySector: tally((e) => e.sector),
    byQuestionTopic: [...qTopicMap.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count),
  };

  // ── ACTIVATION / RÉTENTION / QUALITÉ / ADOPTION (clients réels) ─────────────
  const now = Date.now();
  const DAY = 86_400_000;
  const median = (arr: number[]): number | null => {
    if (!arr.length) return null;
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  };

  const signupAt = new Map<string, number>();
  const companyOf = new Map<string, string>();
  for (const p of clientProfiles) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pp = p as any;
    if (pp.user_id && pp.created_at) signupAt.set(pp.user_id, Date.parse(pp.created_at));
    if (pp.user_id && pp.company_name) companyOf.set(pp.user_id, pp.company_name);
  }

  const activatedSet = new Set<string>();
  const firstCreation = new Map<string, number>();
  for (const e of events) {
    if (e.event_type !== "app_created" || !e.user_id) continue;
    activatedSet.add(e.user_id);
    const ts = e.created_at ? Date.parse(e.created_at) : null;
    if (ts != null) {
      const cur = firstCreation.get(e.user_id);
      if (cur == null || ts < cur) firstCreation.set(e.user_id, ts);
    }
  }
  const ttfvHours: number[] = [];
  for (const [uid, ts] of firstCreation) {
    const s = signupAt.get(uid);
    if (s != null && ts >= s) ttfvHours.push((ts - s) / 3_600_000);
  }
  const ttfvMed = median(ttfvHours);

  // Engagement (fenêtres glissantes) + coût par user — clients réels uniquement.
  const d1 = new Set<string>();
  const d7 = new Set<string>();
  const d30 = new Set<string>();
  const userAgg = new Map<string, { credits: number; costUsd: number; calls: number; days: Set<string> }>();
  for (const r of rows) {
    const uid = r.user_id;
    if (!uid || isFounder(uid)) continue;
    const g = userAgg.get(uid) ?? { credits: 0, costUsd: 0, calls: 0, days: new Set<string>() };
    g.credits += r.credits ?? 0;
    g.costUsd += Number(r.cost_usd) || 0;
    g.calls += 1;
    const day = (r.created_at ?? "").slice(0, 10);
    if (day) g.days.add(day);
    userAgg.set(uid, g);
    const ts = r.created_at ? Date.parse(r.created_at) : 0;
    if (ts >= now - DAY) d1.add(uid);
    if (ts >= now - 7 * DAY) d7.add(uid);
    if (ts >= now - 30 * DAY) d30.add(uid);
  }
  const returningUsers = [...userAgg.values()].filter((g) => g.days.size >= 2).length;
  const topConsumers = [...userAgg.entries()]
    .map(([uid, g]) => ({
      label: companyOf.get(uid) || `${uid.slice(0, 8)}…`,
      credits: g.credits,
      costUsd: round(g.costUsd, 4),
      calls: g.calls,
    }))
    .sort((a, b) => b.credits - a.credits)
    .slice(0, 8);

  // Qualité : échecs de génération + blocages crédits (clients réels).
  const evtCount = new Map<string, number>();
  for (const e of events) evtCount.set(e.event_type ?? "", (evtCount.get(e.event_type ?? "") ?? 0) + 1);
  const createdN = evtCount.get("app_created") ?? 0;
  const editedN = evtCount.get("app_edited") ?? 0;
  const failedN = evtCount.get("generation_failed") ?? 0;
  const blockedN = evtCount.get("credits_blocked") ?? 0;
  const attempts = createdN + editedN + failedN;
  const failureRatePct = attempts > 0 ? round((failedN / attempts) * 100, 1) : null;

  // Profondeur d'itération : versions par app (global — non attribué à un user).
  const { data: verRows } = await admin.from("module_versions").select("module_id").limit(10000);
  const perModule = new Map<string, number>();
  for (const v of verRows ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mid = (v as any).module_id as string | null;
    if (mid) perModule.set(mid, (perModule.get(mid) ?? 0) + 1);
  }
  const avgVersionsPerApp = perModule.size > 0 ? round((verRows?.length ?? 0) / perModule.size, 2) : null;
  const appsHeavilyIterated = [...perModule.values()].filter((c) => c > 3).length;
  const createCalls = reqTypeMap.get("create_app") ?? 0;
  const editToCreate = createCalls > 0 ? round((reqTypeMap.get("edit_app") ?? 0) / createCalls, 2) : null;

  // Adoption des fonctionnalités (comptes filtrés).
  const countWhere = async (
    table: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    build: (q: any) => any
  ): Promise<number> => {
    const { count, error } = await build(db.from(table).select("*", { count: "exact", head: true }));
    return error ? 0 : count ?? 0;
  };
  const [knowledgeUploads, connectors, deployedApps, publicApps] = await Promise.all([
    countWhere("knowledge_documents", (q) => q.not("tenant_id", "is", null)),
    countOf("user_connections"),
    countWhere("modules", (q) => q.not("deployment_url", "is", null)),
    countWhere("modules", (q) => q.eq("is_public", true)),
  ]);
  const generatedDocuments = demand.byKind.find((k) => k.key === "document")?.count ?? 0;

  // ── Flux d'activité récent ──────────────────────────────────────────────────
  const { data: activity } = await admin
    .from("activity_logs")
    .select("action, entity_type, description, created_at")
    .order("created_at", { ascending: false })
    .limit(15);

  // ── DÉMOGRAPHIE + AGRÉGATION PAR TAILLE D'ENTREPRISE (clients réels) ────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantsList = (tenantRows ?? []) as { id: string; company_info: any }[];

  // user → tenant (on privilégie le tenant POSSÉDÉ = owner).
  const userTenant = new Map<string, string>();
  for (const m of (memberRows ?? []) as { tenant_id: string; user_id: string; role: string }[]) {
    if (!userTenant.has(m.user_id) || m.role === "owner") userTenant.set(m.user_id, m.tenant_id);
  }
  // Tenant appartenant à un fondateur → exclu de la démographie business.
  const founderTenants = new Set<string>();
  for (const m of (memberRows ?? []) as { tenant_id: string; user_id: string }[]) {
    if (isFounder(m.user_id)) founderTenants.add(m.tenant_id);
  }
  const tenantCredits = new Map<string, number>();
  for (const [uid, g] of userAgg) {
    const tid = userTenant.get(uid);
    if (tid) tenantCredits.set(tid, (tenantCredits.get(tid) ?? 0) + g.credits);
  }

  const SIZE_ORDER = ["solo", "2-5", "6-10", "11-20", "20+", "inconnu"];
  const sizeAgg = new Map<string, { tenants: number; paying: number; credits: number }>();
  const countryTally = new Map<string, number>();
  const sectorTally = new Map<string, number>();
  const headcountTally = new Map<string, number>();
  for (const t of tenantsList) {
    if (founderTenants.has(t.id)) continue; // hors espaces de test
    const info = (t.company_info ?? {}) as Record<string, unknown>;
    const size = String(info.headcount ?? "inconnu") || "inconnu";
    const cty = String(info.country ?? "—") || "—";
    const sec = String(info.sector ?? "—") || "—";
    countryTally.set(cty, (countryTally.get(cty) ?? 0) + 1);
    sectorTally.set(sec, (sectorTally.get(sec) ?? 0) + 1);
    headcountTally.set(size, (headcountTally.get(size) ?? 0) + 1);
    const a = sizeAgg.get(size) ?? { tenants: 0, paying: 0, credits: 0 };
    a.tenants += 1;
    if (payingTenantSet.has(t.id)) a.paying += 1;
    a.credits += tenantCredits.get(t.id) ?? 0;
    sizeAgg.set(size, a);
  }
  const tallyToArr = (m: Map<string, number>) =>
    [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
  const byCompanySize = SIZE_ORDER.filter((s) => sizeAgg.has(s)).map((size) => {
    const a = sizeAgg.get(size)!;
    return {
      size,
      tenants: a.tenants,
      paying: a.paying,
      payingRatePct: a.tenants > 0 ? round((a.paying / a.tenants) * 100, 0) : 0,
      totalCredits: a.credits,
      avgCreditsPerTenant: a.tenants > 0 ? round(a.credits / a.tenants, 0) : 0,
    };
  });

  const sortDesc = (a: Bucket, b: Bucket) => b.costUsd - a.costUsd;
  const clientUsers = Math.max(0, users - founderAccounts);

  return Response.json({
    generatedAt: new Date().toISOString(),
    meta: {
      truncated, // true si le garde-fou 200k a été atteint (agrégats à basculer en RPC)
      founderAccounts, // nb de comptes fondateur isolés des métriques business
      costIsEstimate: true, // coût = estimé interne, ≈ facture fournisseur
    },
    // Totaux TOUT COMPRIS = argent réellement dépensé en API (tests inclus).
    totals: {
      calls: rows.length,
      costUsd: round(totCost, 4),
      costEur,
      credits: totCredits,
      inputTokens: totIn,
      outputTokens: totOut,
      salePerCreditEur: sale,
    },
    // CHIFFRE D'AFFAIRES réel + économie unitaire côté clients.
    business: {
      mrrEur, // CA récurrent mensuel réel (0 tant qu'aucun abonné payant)
      payingTenants,
      businessMarginPct, // (MRR − coût client) / MRR
      clientConsumedValueEur, // valeur THÉORIQUE de la conso client (≠ CA)
      clientCredits,
      clientCostUsd: round(clientCost, 4),
      clientCostEur,
      marginPct, // marge structurelle sur la consommation client
      salePerCreditEur: sale,
    },
    // R&D / tests internes (compte fondateur) — isolé du business.
    internal: {
      costUsd: round(internalCost, 4),
      costEur: internalCostEur,
      credits: internalCredits,
      calls: internalCalls,
    },
    product: { users, tenants, apps, edits, documents, reports, conversations, outstandingCredits, clientUsers },
    demographics: {
      byCountry: tallyToArr(countryTally),
      bySector: tallyToArr(sectorTally),
      byHeadcount: tallyToArr(headcountTally),
    },
    byCompanySize,
    activation: {
      totalUsers: clientUsers,
      activatedUsers: activatedSet.size,
      activationRatePct: clientUsers > 0 ? round((activatedSet.size / clientUsers) * 100, 1) : null,
      ttfvMedianHours: ttfvMed == null ? null : round(ttfvMed, 1),
    },
    engagement: {
      dau: d1.size,
      wau: d7.size,
      mau: d30.size,
      stickinessPct: d30.size > 0 ? round((d7.size / d30.size) * 100, 0) : null,
      returningUsers,
    },
    iteration: { avgVersionsPerApp, appsHeavilyIterated, editToCreate },
    quality: { generationsFailed: failedN, creditsBlocked: blockedN, failureRatePct },
    adoption: { knowledgeUploads, reports, connectors, deployedApps, publicApps, generatedDocuments },
    topConsumers,
    byModel: [...byModelMap.values()].map((b) => ({ ...b, costUsd: round(b.costUsd, 4) })).sort(sortDesc),
    byAction: [...byActionMap.values()].map((b) => ({ ...b, costUsd: round(b.costUsd, 4) })).sort(sortDesc),
    byDay: [...byDayMap.entries()]
      .map(([day, v]) => ({ day, costUsd: round(v.costUsd, 4), credits: v.credits, calls: v.calls }))
      .sort((a, b) => a.day.localeCompare(b.day)),
    signupsByDay: [...signupsMap.entries()]
      .map(([day, count]) => ({ day, count }))
      .sort((a, b) => a.day.localeCompare(b.day)),
    demand,
    recentQuestions,
    plans: [...planMap.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count),
    activity: (activity ?? []).map((a) => ({
      action: a.action,
      entityType: a.entity_type,
      description: a.description,
      createdAt: a.created_at,
    })),
  });
}
