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
import { getActiveMembershipServer } from "@/lib/tenant-server";
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
const WRITE_ACTIONS = new Set(["create", "bulk_create", "update", "delete", "bulk_delete"]);
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

  // Entité NON reconnue comme entité workspace → MAGASIN CLOUD GÉNÉRIQUE : l'app
  // persiste dans app_records (jsonb), isolé par tenant + collection. C'est ce qui
  // permet à N'IMPORTE QUELLE app de sauvegarder dans le cloud, sans schéma prédéfini.
  if (!isWorkspaceEntity) {
    if (!entity || entity.length > 80) {
      return NextResponse.json({ error: "Collection invalide." }, { status: 400 });
    }
    try {
      return await handleAppStore(from, tenantId, user.id, entity, action, body);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur base de données.";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }

  const def = ENTITIES[entity];

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
      if (body.match && typeof body.match === "object") q = q.match(body.match);
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
      const { data, error } = await from(def.table)
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("id", body.id)
        .single();
      if (error) throw error;
      return NextResponse.json({ data });
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

    return NextResponse.json({ error: `Action inconnue : ${action}` }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur base de données.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
