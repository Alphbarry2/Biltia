// ─────────────────────────────────────────────────────────────────────────────
// /api/data — CRUD générique sur les entités partagées du workspace (Étape 2).
//
// Sécurité (défense en profondeur) :
//   1. Same-origin obligatoire (anti-CSRF) — seuls les modules servis par Biltia.
//   2. Auth de session (cookies) → rôle `authenticated`.
//   3. Whitelist d'entités (ALLOWED_ENTITIES) — pas d'accès à user_credits, audit_logs…
//   4. tenant_id FORCÉ côté serveur (jamais fourni par le client).
//   5. RLS Postgres : isolation tenant + rôle, appliquée quoi qu'il arrive.
//   6. Colonnes inscriptibles whitelistées — le reste est ignoré.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { ENTITIES, ALLOWED_ENTITIES } from "@/lib/data-entities";
import { coerceStoredScope, scopeReadFilter, type StoredScope } from "@/lib/data-scope";
import { getActiveMembershipServer } from "@/lib/tenant-server";
import { memberChantierScope, isPerimeterEntity } from "@/lib/employee-perimeter";
import { can } from "@/lib/permissions";
import { getEntitlementsForTenant, FROZEN_MESSAGE } from "@/lib/entitlements";
import { logActivity } from "@/lib/activity";
import { recordSignal } from "@/lib/collective-brain";

// CERVEAU COLLECTIF — capte un signal de succès/échec quand une entité atteint un
// statut terminal signifiant (devis tranché, facture payée). Anonymisé, privé au
// tenant, best-effort (jamais bloquant). Voir lib/collective-brain.ts.
function captureLearningSignal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  entity: string,
  row: Record<string, unknown> | null | undefined
) {
  if (!row) return;
  const statut = String(row.statut ?? "");
  const montant = Number(row.montant_ttc) || null;
  let signalType: string | null = null;
  let outcome: "success" | "fail" = "success";
  let context = "";

  if (entity === "devis") {
    if (statut === "accepte") {
      signalType = "devis_accepte";
      outcome = "success";
    } else if (statut === "refuse" || statut === "expire") {
      signalType = "devis_refuse";
      outcome = "fail";
    }
    // Les conditions commerciales sont la matière d'apprentissage (jamais les notes,
    // qui peuvent contenir des éléments nominatifs propres au client).
    context = typeof row.conditions === "string" ? row.conditions : "";
  } else if (entity === "factures" && statut === "payee") {
    signalType = "facture_payee";
    outcome = "success";
  }

  if (!signalType) return;
  void recordSignal({ supabase, tenantId, signalType, outcome, montant, context }).catch(() => {});
}

// Actions qui MODIFIENT les données : refusées si l'abonnement est gelé (lecture
// seule). `list`/`get` restent toujours ouverts (consultation + export garantis).
const WRITE_ACTIONS = new Set([
  "create", "bulk_create", "update", "delete", "bulk_delete", "invoice_from_devis",
  // Transformations atomiques (même famille que invoice_from_devis) — écritures.
  "chantier_from_devis", "devis_from_demande", "task_from_note", "reserve_from_note",
]);
const DELETE_ACTIONS = new Set(["delete", "bulk_delete"]);

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // srcdoc / requêtes sans Origin → tolérées (same-origin)
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

function sanitize(values: unknown, writable: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!values || typeof values !== "object") return out;
  const v = values as Record<string, unknown>;
  for (const key of writable) {
    if (!(key in v)) continue;
    let val = v[key];
    // Un champ de formulaire HTML non rempli renvoie "" (jamais null). Postgres
    // rejette "" pour un uuid/date/nombre → 400. On normalise toute chaîne vide
    // (ou " ") en null : un champ optionnel vide = null, un champ requis vide
    // déclenchera une vraie erreur NOT NULL explicite plutôt qu'un cast illisible.
    if (typeof val === "string" && val.trim() === "") val = null;
    out[key] = val;
  }
  return out;
}

// ── Magasin cloud GÉNÉRIQUE (app_records) : CRUD sur données jsonb par collection.
// Toute entité non-workspace atterrit ici → les apps persistent dans le cloud même
// sans schéma prédéfini. Isolé par tenant + collection ; l'id remonte à plat.
const RESERVED_KEYS = new Set(["id", "tenant_id", "collection", "created_at", "updated_at", "created_by"]);
function cleanData(values: unknown): Record<string, unknown> {
  if (!values || typeof values !== "object" || Array.isArray(values)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values as Record<string, unknown>)) {
    if (!RESERVED_KEYS.has(k)) out[k] = v;
  }
  return out;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FromFn = (t: string) => any;
async function handleAppStore(
  from: FromFn,
  tenantId: string,
  userId: string,
  collection: string,
  action: string,
  body: { id?: string; values?: unknown; rows?: unknown; ids?: unknown; match?: Record<string, unknown>; ascending?: boolean; limit?: number },
  readFilter?: { since?: string; ids?: string[] } | null,
) {
  const T = "app_records";
  const flat = (r: Record<string, unknown>) => ({
    id: r.id,
    ...(r.data && typeof r.data === "object" ? (r.data as Record<string, unknown>) : {}),
    created_at: r.created_at,
    updated_at: r.updated_at,
  });

  if (action === "list") {
    let q = from(T).select("*").eq("tenant_id", tenantId).eq("collection", collection);
    if (body.match && typeof body.match === "object") q = q.contains("data", body.match);
    // Portée « vierge / import » : n'afficher que les enregistrements créés depuis
    // le démarrage de l'app (les collections libres n'ont pas d'ids « choisis »).
    if (readFilter?.since) q = q.gte("created_at", readFilter.since);
    q = q.order("created_at", { ascending: body.ascending === true }).limit(Math.min(Number(body.limit) || 200, 500));
    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ data: (data ?? []).map(flat) });
  }
  if (action === "get") {
    if (!body.id) return NextResponse.json({ error: "id manquant." }, { status: 400 });
    const { data, error } = await from(T).select("*").eq("tenant_id", tenantId).eq("collection", collection).eq("id", body.id).single();
    if (error) throw error;
    return NextResponse.json({ data: flat(data) });
  }
  if (action === "create") {
    const { data, error } = await from(T).insert({ tenant_id: tenantId, collection, data: cleanData(body.values), created_by: userId }).select().single();
    if (error) throw error;
    return NextResponse.json({ data: flat(data) });
  }
  if (action === "update") {
    if (!body.id) return NextResponse.json({ error: "id manquant." }, { status: 400 });
    const { data, error } = await from(T).update({ data: cleanData(body.values), updated_at: new Date().toISOString() }).eq("tenant_id", tenantId).eq("collection", collection).eq("id", body.id).select().single();
    if (error) throw error;
    return NextResponse.json({ data: flat(data) });
  }
  if (action === "delete") {
    if (!body.id) return NextResponse.json({ error: "id manquant." }, { status: 400 });
    const { error } = await from(T).delete().eq("tenant_id", tenantId).eq("collection", collection).eq("id", body.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  }
  if (action === "bulk_create") {
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!rows.length) return NextResponse.json({ error: "Aucune ligne à importer." }, { status: 400 });
    if (rows.length > 2000) return NextResponse.json({ error: "Trop de lignes (max 2000)." }, { status: 400 });
    const payload = rows.map((r) => ({ tenant_id: tenantId, collection, data: cleanData(r), created_by: userId }));
    const { data, error } = await from(T).insert(payload).select("id");
    if (error) throw error;
    return NextResponse.json({ ok: true, inserted: data?.length ?? payload.length });
  }
  if (action === "bulk_delete") {
    const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).filter(Boolean);
    if (!ids.length) return NextResponse.json({ error: "Aucun élément sélectionné." }, { status: 400 });
    if (ids.length > 500) return NextResponse.json({ error: "Trop d'éléments (max 500)." }, { status: 400 });
    const { error } = await from(T).delete().eq("tenant_id", tenantId).eq("collection", collection).in("id", ids);
    if (error) throw error;
    return NextResponse.json({ ok: true, deleted: ids.length });
  }
  return NextResponse.json({ error: `Action inconnue : ${action}` }, { status: 400 });
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "Origine non autorisée." }, { status: 403 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }

  const membership = await getActiveMembershipServer(supabase, user.id);

  if (!membership) {
    return NextResponse.json({ error: "Aucun espace de travail." }, { status: 403 });
  }
  const tenantId = membership.tenant_id;

  let body: {
    entity?: string;
    action?: string;
    id?: string;
    values?: unknown;
    rows?: unknown;
    ids?: unknown;
    match?: Record<string, unknown>;
    columns?: string;
    order?: string;
    ascending?: boolean;
    limit?: number;
    // Portée des données de l'app appelante : soit l'id du module (on lit la
    // portée stockée), soit une portée inline (aperçu du générateur, avant save).
    moduleId?: string;
    dataScope?: unknown;
    // Facturation depuis un devis accepté (action invoice_from_devis).
    devisId?: string;
    mode?: string;
    pct?: number;
    // Transformations atomiques : id de la fiche SOURCE (fallback sur `id`).
    demandeId?: string;
    noteId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  const entity = body.entity ?? "";
  const action = body.action ?? "";
  const isWorkspaceEntity = ALLOWED_ENTITIES.includes(entity);

  // ── RBAC ── (double le RLS pour un message CLAIR au lieu d'une erreur brute).
  // • Écrire (create/update/import) : refusé au lecteur (lecture seule).
  // • Supprimer une ENTITÉ workspace (client, devis, facture…) : owner/admin
  //   seulement, comme les policies RLS. Les enregistrements d'app génériques
  //   (app_records) restent supprimables par tout collaborateur — c'est l'usage
  //   normal d'une app, pas une action destructrice sur le métier.
  if (WRITE_ACTIONS.has(action) && !can(membership.role, "data.write")) {
    return NextResponse.json(
      { error: "Vous êtes en lecture seule sur cet espace : vous ne pouvez pas modifier les données." },
      { status: 403 }
    );
  }
  if (isWorkspaceEntity && DELETE_ACTIONS.has(action) && !can(membership.role, "data.delete")) {
    return NextResponse.json(
      { error: "Seuls le propriétaire ou un administrateur peuvent supprimer des données du workspace." },
      { status: 403 }
    );
  }

  // ── GEL LECTURE SEULE ── (s'applique aux DEUX chemins : entité workspace OU
  // collection générique). Un abonnement expiré fige l'espace en lecture seule ;
  // seules les écritures sont refusées. L'usage manuel ne coûte pas de crédit.
  if (WRITE_ACTIONS.has(action)) {
    const ent = await getEntitlementsForTenant(supabase, tenantId);
    if (!ent.writable) {
      return NextResponse.json({ error: FROZEN_MESSAGE, frozen: true }, { status: 403 });
    }
  }

  // Accès dynamique à la table (nom validé) → cast contrôlé du client typé.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const from = (t: string) => (supabase.from as any)(t);

  // ── PORTÉE DES DONNÉES (data_scope) ── uniquement en LECTURE (`list`). La portée
  // vient du module appelant (id → on lit modules.data_scope) ou est fournie inline
  // (aperçu du générateur avant enregistrement). Les écritures ignorent la portée :
  // tout va au workspace (source unique). Absente/null = tout le workspace.
  let readFilter: { since?: string; ids?: string[] } | null = null;
  if (action === "list") {
    let stored: StoredScope | null = null;
    if (typeof body.moduleId === "string" && body.moduleId) {
      const { data: mod } = await from("modules")
        .select("data_scope")
        .eq("id", body.moduleId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (mod) stored = coerceStoredScope(mod.data_scope);
    } else if (body.dataScope != null) {
      stored = coerceStoredScope(body.dataScope);
    }
    readFilter = scopeReadFilter(stored, entity);
  }

  // Entité NON reconnue comme entité workspace → MAGASIN CLOUD GÉNÉRIQUE : l'app
  // persiste dans app_records (jsonb), isolé par tenant + collection. C'est ce qui
  // permet à N'IMPORTE QUELLE app de sauvegarder dans le cloud, sans schéma prédéfini.
  if (!isWorkspaceEntity) {
    if (!entity || entity.length > 80) {
      return NextResponse.json({ error: "Collection invalide." }, { status: 400 });
    }
    try {
      return await handleAppStore(from, tenantId, user.id, entity, action, body, readFilter);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur base de données.";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }

  const def = ENTITIES[entity];

  // ── PÉRIMÈTRE EMPLOYÉ ── un compte de rôle « member » relié à une fiche employé
  // ne voit, en LECTURE, que SES chantiers (chef / intervention / tâche) et leurs
  // enfants. Non relié → null → aucune restriction (l'existant ne casse pas). Les
  // autres rôles ne sont jamais restreints.
  let allowedChantierIds: string[] | null = null;
  if (
    (action === "list" || action === "get") &&
    membership.role === "member" &&
    isPerimeterEntity(entity)
  ) {
    allowedChantierIds = await memberChantierScope(from, tenantId, user.id);
  }
  const perimeterCol = entity === "chantiers" ? "id" : "chantier_id";

  // Nom lisible d'une ligne pour le journal d'activité.
  const rowName = (v: Record<string, unknown>): string => {
    const n = v.nom ?? v.designation ?? v.type ?? "";
    return typeof n === "string" && n.trim() ? ` : « ${n.trim().slice(0, 60)} »` : "";
  };
  const log = (action: string, description: string, entityId?: string | null) =>
    logActivity(supabase, {
      tenantId,
      userId: user.id,
      action,
      entityType: def.label,
      entityId,
      description,
    });

  try {
    if (action === "list") {
      let q = from(def.table)
        .select(typeof body.columns === "string" ? body.columns : "*")
        .eq("tenant_id", tenantId);
      // Périmètre employé : borne aux chantiers autorisés (racine par id, enfants
      // par chantier_id). null = pas de restriction ; [] = aucun chantier visible.
      if (allowedChantierIds !== null) q = q.in(perimeterCol, allowedChantierIds);
      if (body.match && typeof body.match === "object") q = q.match(body.match);
      // Portée des données : « vierge / import » = créés depuis le démarrage de
      // l'app ; « choisir » = uniquement les ids sélectionnés pour cette entité.
      if (readFilter?.since) q = q.gte("created_at", readFilter.since);
      if (readFilter?.ids) q = q.in("id", readFilter.ids);
      if (typeof body.order === "string") {
        q = q.order(body.order, { ascending: body.ascending !== false });
      }
      q = q.limit(Math.min(Number(body.limit) || 200, 500));
      const { data, error } = await q;
      if (error) throw error;
      return NextResponse.json({ data });
    }

    if (action === "get") {
      if (!body.id) return NextResponse.json({ error: "id manquant." }, { status: 400 });
      // Hors périmètre → comportement inchangé (.single()). Sous périmètre employé,
      // on borne et on renvoie null si l'enregistrement n'est pas dans sa portée.
      if (allowedChantierIds !== null) {
        const { data, error } = await from(def.table)
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("id", body.id)
          .in(perimeterCol, allowedChantierIds)
          .maybeSingle();
        if (error) throw error;
        return NextResponse.json({ data: data ?? null });
      }
      const { data, error } = await from(def.table)
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("id", body.id)
        .single();
      if (error) throw error;
      return NextResponse.json({ data });
    }

    // ── RENTABILITÉ RÉELLE PAR CHANTIER ── LA vue transversale du moteur : croise
    // factures + pointages + employés + matériaux pour donner la VRAIE marge
    // (facturé − heures pointées × taux horaire − achats matériaux), là où l'UI ne
    // montrait qu'un « budget engagé » tapé à la main. Agrégat en LECTURE (jamais
    // de crédit, jamais gelé), tenant-scopé, périmètre employé respecté. Trié du
    // moins rentable au plus rentable (« quel chantier me rapporte le moins ? »).
    // Réutilisable par l'app finance, le copilote et les agents.
    if (action === "chantier_rentabilite" && entity === "chantiers") {
      let scopeIds: string[] | null = null;
      if (membership.role === "member") {
        scopeIds = await memberChantierScope(from, tenantId, user.id);
      }
      let chQ = from("chantiers").select("id, nom, statut, budget").eq("tenant_id", tenantId);
      if (scopeIds !== null) chQ = chQ.in("id", scopeIds);
      if (body.match && typeof body.match === "object") chQ = chQ.match(body.match);
      chQ = chQ.limit(500);
      const { data: chs, error: chErr } = await chQ;
      if (chErr) throw chErr;
      const chantiers = (chs ?? []) as { id: string; nom: string | null; statut: string | null; budget: number | null }[];
      if (chantiers.length === 0) return NextResponse.json({ data: [] });
      const chIds = chantiers.map((c) => c.id);

      const [factRes, ptRes, matRes, empRes] = await Promise.all([
        from("factures").select("chantier_id, type, montant_ht, montant_paye").eq("tenant_id", tenantId).in("chantier_id", chIds),
        from("pointages").select("chantier_id, employee_id, heures, type").eq("tenant_id", tenantId).in("chantier_id", chIds),
        from("materials").select("chantier_id, prix_achat_ht, quantite").eq("tenant_id", tenantId).in("chantier_id", chIds),
        from("employees").select("id, taux_horaire").eq("tenant_id", tenantId),
      ]);

      const tauxById = new Map<string, number>();
      for (const e of (empRes.data ?? []) as { id: string; taux_horaire: number | null }[]) {
        tauxById.set(String(e.id), Number(e.taux_horaire) || 0);
      }

      type Agg = { facture: number; encaisse: number; coutMo: number; coutMat: number };
      const agg = new Map<string, Agg>();
      const getA = (id: string): Agg => {
        let a = agg.get(id);
        if (!a) { a = { facture: 0, encaisse: 0, coutMo: 0, coutMat: 0 }; agg.set(id, a); }
        return a;
      };

      for (const f of (factRes.data ?? []) as { chantier_id: string | null; type: string | null; montant_ht: number | null; montant_paye: number | null }[]) {
        if (!f.chantier_id) continue;
        const a = getA(String(f.chantier_id));
        const ht = Number(f.montant_ht) || 0;
        a.facture += f.type === "avoir" ? -ht : ht;
        a.encaisse += Number(f.montant_paye) || 0;
      }
      for (const p of (ptRes.data ?? []) as { chantier_id: string | null; employee_id: string | null; heures: number | null; type: string | null }[]) {
        if (!p.chantier_id || p.type === "absence") continue; // une absence n'est pas un coût de chantier
        const a = getA(String(p.chantier_id));
        a.coutMo += (Number(p.heures) || 0) * (p.employee_id ? tauxById.get(String(p.employee_id)) || 0 : 0);
      }
      for (const m of (matRes.data ?? []) as { chantier_id: string | null; prix_achat_ht: number | null; quantite: number | null }[]) {
        if (!m.chantier_id) continue;
        const a = getA(String(m.chantier_id));
        a.coutMat += (Number(m.prix_achat_ht) || 0) * (Number(m.quantite) || 1);
      }

      const round2 = (n: number) => Math.round(n * 100) / 100;
      const out = chantiers
        .map((c) => {
          const a = agg.get(c.id) ?? { facture: 0, encaisse: 0, coutMo: 0, coutMat: 0 };
          const facture = round2(a.facture);
          const coutTotal = round2(a.coutMo + a.coutMat);
          const marge = round2(facture - coutTotal);
          return {
            id: c.id,
            nom: c.nom,
            statut: c.statut,
            budget: Number(c.budget) || 0,
            facture,
            encaisse: round2(a.encaisse),
            reste_a_encaisser: round2(facture - a.encaisse),
            cout_mo: round2(a.coutMo),
            cout_materiaux: round2(a.coutMat),
            cout_total: coutTotal,
            marge,
            marge_pct: facture > 0 ? Math.round((marge / facture) * 100) : null,
          };
        })
        .sort((x, y) => x.marge - y.marge);

      return NextResponse.json({ data: out });
    }

    if (action === "create") {
      const values = sanitize(body.values, def.writable);
      const { data, error } = await from(def.table)
        .insert({ ...values, tenant_id: tenantId })
        .select()
        .single();
      if (error) throw error;
      await log("create", `${def.label}${rowName(values)} — ajout`, data?.id ?? null);
      return NextResponse.json({ data });
    }

    if (action === "bulk_create") {
      // Import CSV/Excel : insertion en masse. Chaque ligne est nettoyée
      // (colonnes whitelistées) et tenant_id est forcé côté serveur.
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (!rows.length) {
        return NextResponse.json({ error: "Aucune ligne à importer." }, { status: 400 });
      }
      if (rows.length > 2000) {
        return NextResponse.json({ error: "Trop de lignes (max 2000 par import)." }, { status: 400 });
      }
      const clean = rows
        .map((r) => sanitize(r, def.writable))
        .filter((r) => Object.values(r).some((v) => v !== null && v !== undefined && String(v).trim() !== ""));
      if (!clean.length) {
        return NextResponse.json({ error: "Aucune donnée exploitable (colonnes non reconnues ?)." }, { status: 400 });
      }
      const payload = clean.map((r) => ({ ...r, tenant_id: tenantId }));
      const { data, error } = await from(def.table).insert(payload).select("id");
      if (error) throw error;
      await log("create", `${def.label} — import de ${data?.length ?? clean.length} ligne(s)`);
      return NextResponse.json({ ok: true, inserted: data?.length ?? clean.length });
    }

    if (action === "update") {
      if (!body.id) return NextResponse.json({ error: "id manquant." }, { status: 400 });
      const values = sanitize(body.values, def.writable);
      const { data, error } = await from(def.table)
        .update(values)
        .eq("tenant_id", tenantId)
        .eq("id", body.id)
        .select()
        .single();
      if (error) throw error;
      await log("update", `${def.label}${rowName(values)} — mise à jour`, body.id);
      captureLearningSignal(supabase, tenantId, entity, data as Record<string, unknown>);
      return NextResponse.json({ data });
    }

    if (action === "delete") {
      if (!body.id) return NextResponse.json({ error: "id manquant." }, { status: 400 });
      const { error } = await from(def.table)
        .delete()
        .eq("tenant_id", tenantId)
        .eq("id", body.id);
      if (error) throw error;
      await log("delete", `${def.label} — suppression`, body.id);
      return NextResponse.json({ ok: true });
    }

    if (action === "bulk_delete") {
      const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).filter(Boolean);
      if (!ids.length) return NextResponse.json({ error: "Aucun élément sélectionné." }, { status: 400 });
      if (ids.length > 500) return NextResponse.json({ error: "Trop d'éléments (max 500)." }, { status: 400 });
      const { error } = await from(def.table).delete().eq("tenant_id", tenantId).in("id", ids);
      if (error) throw error;
      await log("delete", `${def.label} — suppression de ${ids.length} élément(s)`);
      return NextResponse.json({ ok: true, deleted: ids.length });
    }

    // ── FACTURER UN DEVIS ── crée une facture À PARTIR d'un devis accepté, SANS
    // re-saisie : reprend client, chantier et montants, génère un numéro légal
    // (F-AAAA-NNN, unique par entreprise) côté serveur et relie devis_id. C'est le
    // maillon devis→facture ; réutilisable par l'app, le copilote et les agents.
    //   mode = "acompte" (pct %, défaut 30) · "situation" (pct %) · "solde" (reste
    //   à facturer = total du devis − déjà facturé). Appelé avec entity="factures".
    if (action === "invoice_from_devis") {
      const devisId =
        typeof body.devisId === "string" && body.devisId
          ? body.devisId
          : typeof body.id === "string"
            ? body.id
            : "";
      if (!devisId) return NextResponse.json({ error: "Devis manquant." }, { status: 400 });

      const { data: dv, error: dErr } = await from("devis")
        .select("id, numero, client_id, chantier_id, montant_ht, montant_tva, montant_ttc, statut")
        .eq("tenant_id", tenantId)
        .eq("id", devisId)
        .single();
      if (dErr || !dv) return NextResponse.json({ error: "Devis introuvable." }, { status: 404 });

      const round2 = (n: number) => Math.round(n * 100) / 100;
      const totalHt = Number(dv.montant_ht) || 0;
      const totalTva = Number(dv.montant_tva) || 0;
      if (totalHt <= 0) {
        return NextResponse.json({ error: "Ce devis n'a pas de montant à facturer." }, { status: 400 });
      }

      // Déjà facturé pour ce devis (les avoirs se déduisent) → base du solde.
      const { data: prev } = await from("factures")
        .select("montant_ht, type")
        .eq("tenant_id", tenantId)
        .eq("devis_id", devisId);
      let invoicedHt = 0;
      for (const p of (prev ?? []) as { montant_ht: number | null; type: string | null }[]) {
        const v = Number(p.montant_ht) || 0;
        invoicedHt += p.type === "avoir" ? -v : v;
      }

      const mode = body.mode === "acompte" || body.mode === "situation" ? body.mode : "solde";
      let ht: number;
      let factType: string;
      if (mode === "acompte") {
        factType = "acompte";
        const pct = Math.min(100, Math.max(1, Number(body.pct) || 30));
        ht = round2(totalHt * (pct / 100));
      } else if (mode === "situation") {
        factType = "situation";
        const pct = Math.min(100, Math.max(1, Number(body.pct) || 0));
        ht = round2(totalHt * (pct / 100));
      } else {
        factType = "facture";
        ht = round2(totalHt - invoicedHt); // solde = total − déjà facturé
      }
      if (!(ht > 0)) {
        return NextResponse.json(
          { error: "Rien à facturer : le devis est déjà entièrement facturé." },
          { status: 400 }
        );
      }

      // TVA proportionnelle au HT du devis (conserve le taux moyen, multi-taux inclus).
      const tvaRate = totalHt > 0 ? totalTva / totalHt : 0.2;
      const tva = round2(ht * tvaRate);
      const ttc = round2(ht + tva);

      // Prochain numéro F-AAAA-NNN pour l'entreprise (base = max de l'année).
      const year = new Date().getFullYear();
      const pre = `F-${year}-`;
      const { data: existing } = await from("factures")
        .select("numero")
        .eq("tenant_id", tenantId)
        .ilike("numero", `${pre}%`);
      let seq = 0;
      for (const r of (existing ?? []) as { numero: string | null }[]) {
        const n = String(r.numero || "");
        if (!n.startsWith(pre)) continue;
        const val = parseInt(n.slice(pre.length), 10);
        if (Number.isFinite(val) && val > seq) seq = val;
      }

      const today = new Date();
      const dateFacture = today.toISOString().slice(0, 10);
      const dateEcheance = new Date(today.getTime() + 30 * 86_400_000).toISOString().slice(0, 10);

      // Insertion anti-collision : l'index unique (tenant_id, numero) est la
      // garantie légale. Sous course, on retente au rang suivant plutôt qu'échouer.
      let facture: Record<string, unknown> | null = null;
      let insErr: unknown = null;
      for (let attempt = 1; attempt <= 6; attempt++) {
        const numero = `${pre}${String(seq + attempt).padStart(3, "0")}`;
        const { data: ins, error } = await from("factures")
          .insert({
            tenant_id: tenantId,
            numero,
            client_id: dv.client_id ?? null,
            chantier_id: dv.chantier_id ?? null,
            devis_id: devisId,
            type: factType,
            statut: "brouillon",
            date_facture: dateFacture,
            date_echeance: dateEcheance,
            montant_ht: ht,
            montant_tva: tva,
            montant_ttc: ttc,
            montant_paye: 0,
          })
          .select()
          .single();
        if (!error) {
          facture = ins as Record<string, unknown>;
          break;
        }
        insErr = error;
        if ((error as { code?: string }).code !== "23505") break; // pas un conflit d'unicité → stop
      }
      if (!facture) throw insErr || new Error("Création de la facture impossible.");

      const kindLabel = factType === "acompte" ? "acompte" : factType === "situation" ? "situation" : "facture";
      await log(
        "create",
        `${def.label} ${facture.numero} — ${kindLabel} depuis le devis ${dv.numero ?? ""}`.trim(),
        (facture.id as string) ?? null
      );
      return NextResponse.json({ data: facture });
    }

    // ── DEVIS ACCEPTÉ → CHANTIER ── ouvre le chantier d'exécution SANS re-saisie :
    // reprend client/site/demande + l'adresse, budgète au montant HT du devis, et
    // RELIE le devis au chantier créé (devis.chantier_id). Idempotent : si le devis
    // pointe déjà un chantier, on le renvoie au lieu d'en créer un doublon.
    // Appelé avec entity="chantiers", devisId (ou id) = le devis source.
    if (action === "chantier_from_devis") {
      const devisId = String(body.devisId || body.id || "");
      if (!devisId) return NextResponse.json({ error: "Devis manquant." }, { status: 400 });
      const { data: dv, error: dErr } = await from("devis")
        .select("id, numero, client_id, chantier_id, site_id, demande_id, montant_ht")
        .eq("tenant_id", tenantId)
        .eq("id", devisId)
        .single();
      if (dErr || !dv) return NextResponse.json({ error: "Devis introuvable." }, { status: 404 });

      // Déjà relié → renvoie le chantier existant (pas de doublon).
      if (dv.chantier_id) {
        const { data: existing } = await from("chantiers")
          .select("*").eq("tenant_id", tenantId).eq("id", dv.chantier_id).maybeSingle();
        if (existing) return NextResponse.json({ data: existing });
      }

      // Nom + adresse : depuis le site s'il existe, sinon le client.
      let clientNom = "";
      let addr: { adresse: string | null; ville: string | null; code_postal: string | null } = {
        adresse: null, ville: null, code_postal: null,
      };
      if (dv.client_id) {
        const { data: cl } = await from("clients")
          .select("nom, adresse, ville, code_postal").eq("tenant_id", tenantId).eq("id", dv.client_id).maybeSingle();
        if (cl) {
          clientNom = String(cl.nom || "");
          addr = { adresse: cl.adresse ?? null, ville: cl.ville ?? null, code_postal: cl.code_postal ?? null };
        }
      }
      if (dv.site_id) {
        const { data: st } = await from("sites")
          .select("adresse, ville, code_postal").eq("tenant_id", tenantId).eq("id", dv.site_id).maybeSingle();
        if (st) addr = { adresse: st.adresse ?? null, ville: st.ville ?? null, code_postal: st.code_postal ?? null };
      }
      const nom = clientNom ? `Chantier — ${clientNom}` : `Chantier ${dv.numero ?? ""}`.trim();

      const { data: chantier, error: insErr } = await from("chantiers")
        .insert({
          tenant_id: tenantId,
          nom,
          client_id: dv.client_id ?? null,
          site_id: dv.site_id ?? null,
          demande_id: dv.demande_id ?? null,
          adresse: addr.adresse,
          ville: addr.ville,
          code_postal: addr.code_postal,
          budget: Number(dv.montant_ht) || 0,
          avancement: 0,
          statut: "en_attente",
        })
        .select()
        .single();
      if (insErr || !chantier) throw insErr || new Error("Création du chantier impossible.");

      // Lien retour : le devis pointe désormais son chantier.
      await from("devis").update({ chantier_id: chantier.id }).eq("tenant_id", tenantId).eq("id", devisId);
      await log("create", `${ENTITIES.chantiers.label} « ${nom} » — ouvert depuis le devis ${dv.numero ?? ""}`.trim(), (chantier.id as string) ?? null);
      return NextResponse.json({ data: chantier });
    }

    // ── DEMANDE → DEVIS ── amorce un devis brouillon depuis une demande entrante :
    // reprend client/site + relie demande_id, numérote D-AAAA-NNN côté serveur.
    // Idempotent : si un devis existe déjà pour cette demande, on le renvoie.
    // Appelé avec entity="devis", demandeId (ou id) = la demande source.
    if (action === "devis_from_demande") {
      const demandeId = String(body.demandeId || body.id || "");
      if (!demandeId) return NextResponse.json({ error: "Demande manquante." }, { status: 400 });
      const { data: dm, error: dErr } = await from("demandes")
        .select("id, titre, client_id, site_id, description")
        .eq("tenant_id", tenantId)
        .eq("id", demandeId)
        .single();
      if (dErr || !dm) return NextResponse.json({ error: "Demande introuvable." }, { status: 404 });

      const { data: dejaDevis } = await from("devis")
        .select("*").eq("tenant_id", tenantId).eq("demande_id", demandeId).limit(1);
      if (Array.isArray(dejaDevis) && dejaDevis[0]) return NextResponse.json({ data: dejaDevis[0] });

      // Numéro D-AAAA-NNN unique par entreprise (base = max de l'année).
      const year = new Date().getFullYear();
      const pre = `D-${year}-`;
      const { data: nums } = await from("devis").select("numero").eq("tenant_id", tenantId).ilike("numero", `${pre}%`);
      let seq = 0;
      for (const r of (nums ?? []) as { numero: string | null }[]) {
        const val = parseInt(String(r.numero || "").slice(pre.length), 10);
        if (Number.isFinite(val) && val > seq) seq = val;
      }
      const today = new Date();
      const dateDevis = today.toISOString().slice(0, 10);
      const dateValidite = new Date(today.getTime() + 30 * 86_400_000).toISOString().slice(0, 10);

      let devis: Record<string, unknown> | null = null;
      let insErr: unknown = null;
      for (let attempt = 1; attempt <= 6; attempt++) {
        const numero = `${pre}${String(seq + attempt).padStart(3, "0")}`;
        const { data: ins, error } = await from("devis")
          .insert({
            tenant_id: tenantId,
            numero,
            client_id: dm.client_id ?? null,
            site_id: dm.site_id ?? null,
            demande_id: demandeId,
            statut: "brouillon",
            date_devis: dateDevis,
            date_validite: dateValidite,
            montant_ht: 0,
            montant_tva: 0,
            montant_ttc: 0,
            notes: dm.description || dm.titre || null,
          })
          .select()
          .single();
        if (!error) { devis = ins as Record<string, unknown>; break; }
        insErr = error;
        if ((error as { code?: string }).code !== "23505") break;
      }
      if (!devis) throw insErr || new Error("Création du devis impossible.");

      // La demande passe « en cours » (best-effort, ne bloque pas la réponse).
      await from("demandes").update({ statut: "en_cours" }).eq("tenant_id", tenantId).eq("id", demandeId);
      await log("create", `${ENTITIES.devis.label} ${devis.numero} — ébauché depuis la demande « ${dm.titre ?? ""} »`.trim(), (devis.id as string) ?? null);
      return NextResponse.json({ data: devis });
    }

    // ── NOTE → TÂCHE / RÉSERVE ── transforme une note terrain en action suivie,
    // en reprenant ses rattachements (chantier, intervention, auteur). Appelé avec
    // entity="tasks" (task_from_note) ou entity="reserves" (reserve_from_note),
    // noteId (ou id) = la note source.
    if (action === "task_from_note" || action === "reserve_from_note") {
      const noteId = String(body.noteId || body.id || "");
      if (!noteId) return NextResponse.json({ error: "Note manquante." }, { status: 400 });
      const { data: nt, error: nErr } = await from("notes")
        .select("id, titre, contenu, chantier_id, client_id, intervention_id, auteur_id")
        .eq("tenant_id", tenantId)
        .eq("id", noteId)
        .single();
      if (nErr || !nt) return NextResponse.json({ error: "Note introuvable." }, { status: 404 });

      const titre = String(nt.titre || nt.contenu || "").trim().slice(0, 120) || "Note";
      if (action === "task_from_note") {
        const { data: task, error: insErr } = await from("tasks")
          .insert({
            tenant_id: tenantId,
            title: titre,
            description: nt.contenu || null,
            status: "todo",
            priority: "normal",
            chantier_id: nt.chantier_id ?? null,
            assignee_id: nt.auteur_id ?? null,
          })
          .select()
          .single();
        if (insErr || !task) throw insErr || new Error("Création de la tâche impossible.");
        await log("create", `${ENTITIES.tasks.label} « ${titre} » — créée depuis une note`, (task.id as string) ?? null);
        return NextResponse.json({ data: task });
      }
      const { data: reserve, error: insErr } = await from("reserves")
        .insert({
          tenant_id: tenantId,
          titre,
          description: nt.contenu || null,
          type: "reserve",
          gravite: "normale",
          statut: "ouverte",
          chantier_id: nt.chantier_id ?? null,
          client_id: nt.client_id ?? null,
          intervention_id: nt.intervention_id ?? null,
          assignee_id: nt.auteur_id ?? null,
          date_constat: new Date().toISOString().slice(0, 10),
        })
        .select()
        .single();
      if (insErr || !reserve) throw insErr || new Error("Création de la réserve impossible.");
      await log("create", `${ENTITIES.reserves.label} « ${titre} » — créée depuis une note`, (reserve.id as string) ?? null);
      return NextResponse.json({ data: reserve });
    }

    return NextResponse.json({ error: `Action inconnue : ${action}` }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur base de données.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
