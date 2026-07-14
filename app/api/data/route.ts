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
import { getLocale } from "@/lib/i18n/server";
import { pick, type Locale } from "@/lib/i18n/config";
import { ENTITIES, ALLOWED_ENTITIES } from "@/lib/data-entities";
import { normalizeRecordValues, fieldErrorMessage } from "@/lib/vocabulaires";
import { runWorkspaceTransform, isTransformAction, invoiceFromDevis } from "@/lib/workspace-transforms";
import { coerceStoredScope, scopeReadFilter, type StoredScope } from "@/lib/data-scope";
import { getActiveMembershipServer } from "@/lib/tenant-server";
import { memberChantierScope, memberEmployeeIds, isPerimeterEntity } from "@/lib/employee-perimeter";
import {
  createEntityLink,
  deleteEntityLink,
  listEntityLinks,
  cleanupLinksForRecord,
  cleanupLinksForRecords,
  type LinkEndpoint,
} from "@/lib/entity-links";
import {
  emitDomainEvents,
  buildCreateEvent,
  buildDeleteEvent,
  buildUpdateEvents,
  buildLinkEvent,
  changedFields,
} from "@/lib/domain-events";
import { applyFilterGroup, applySearch, type AppFilterGroup } from "@/lib/app-filters";
import { getCustomEntityByKey, validateAgainstDefinition } from "@/lib/custom-entities";
import { can } from "@/lib/permissions";
import { getEntitlementsForTenant, frozenMessage } from "@/lib/entitlements";
import { logActivity } from "@/lib/activity";
import { recordSignal } from "@/lib/collective-brain";
import { attachRelationLabels } from "@/lib/data-labels";

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
  // Relations many-to-many (Phase 4) — écritures.
  "link", "unlink",
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

/**
 * VALEURS CANONIQUES — le point de passage OBLIGÉ de toute écriture typée.
 *
 * Le <select> du formulaire ne protège que le formulaire. Ici passent AUSSI les
 * apps générées par l'IA, le SDK `window.biltia`, l'action `act` des agents et
 * l'import CSV — et aucune contrainte CHECK n'existe en base. Sans ce filtre, un
 * `statut: "En cours"` s'insère sans broncher, et le veilleur qui cherche
 * `en_cours` ne voit jamais la fiche : l'automatisation « ne marche pas », sans
 * la moindre erreur nulle part.
 *
 * On CORRIGE ce qui est reconnaissable (alias : « Chef d'équipe » → chef_equipe)
 * et on REFUSE ce qui ne l'est pas, avec les valeurs proches en clair.
 */
function canonize(
  entity: string,
  values: Record<string, unknown>,
  locale: Locale
): { values: Record<string, unknown>; error?: string } {
  const { values: canon, errors } = normalizeRecordValues(entity, values);
  if (errors.length) {
    return { values: canon, error: errors.map((e) => fieldErrorMessage(entity, e, locale)).join(" ; ") };
  }
  return { values: canon };
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
  readFilter: { since?: string; ids?: string[] } | null | undefined,
  locale: Locale,
) {
  const T = "app_records";
  const flat = (r: Record<string, unknown>) => ({
    id: r.id,
    ...(r.data && typeof r.data === "object" ? (r.data as Record<string, unknown>) : {}),
    created_at: r.created_at,
    updated_at: r.updated_at,
  });
  // Événements de domaine pour les collections custom (Phase 5). Best-effort.
  const ectx = { tenantId, actorId: userId, moduleId: (body as { moduleId?: string }).moduleId ?? null };

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
    if (!body.id) return NextResponse.json({ error: pick(locale, "id manquant.", "Missing id.") }, { status: 400 });
    const { data, error } = await from(T).select("*").eq("tenant_id", tenantId).eq("collection", collection).eq("id", body.id).single();
    if (error) throw error;
    return NextResponse.json({ data: flat(data) });
  }
  if (action === "create") {
    // B5 : si la collection a une DÉFINITION custom, on valide/coerce le payload
    // contre son schéma (requis, types, options). Sinon (pas de définition) : libre.
    let values = cleanData(body.values);
    const def = await getCustomEntityByKey(from, tenantId, collection);
    if (def && def.fields.length) {
      const v = validateAgainstDefinition(values, def, { partial: false });
      if (!v.ok) return NextResponse.json({ error: v.errors.join(" ; ") }, { status: 400 });
      values = v.values;
    }
    const { data, error } = await from(T).insert({ tenant_id: tenantId, collection, data: values, created_by: userId }).select().single();
    if (error) throw error;
    const row = flat(data);
    await emitDomainEvents(from, ectx, [buildCreateEvent(collection, row)]);
    return NextResponse.json({ data: row });
  }
  if (action === "update") {
    if (!body.id) return NextResponse.json({ error: pick(locale, "id manquant.", "Missing id.") }, { status: 400 });
    const { data: prev } = await from(T).select("*").eq("tenant_id", tenantId).eq("collection", collection).eq("id", body.id).maybeSingle();
    let cleaned = cleanData(body.values);
    // B5 : validation partielle (pas de requis sur un update) + coercion des types.
    const defU = await getCustomEntityByKey(from, tenantId, collection);
    if (defU && defU.fields.length) {
      const v = validateAgainstDefinition(cleaned, defU, { partial: true });
      if (!v.ok) return NextResponse.json({ error: v.errors.join(" ; ") }, { status: 400 });
      cleaned = v.values;
    }
    const { data, error } = await from(T).update({ data: cleaned, updated_at: new Date().toISOString() }).eq("tenant_id", tenantId).eq("collection", collection).eq("id", body.id).select().single();
    if (error) throw error;
    const before = prev ? flat(prev as Record<string, unknown>) : null;
    const after = flat(data);
    await emitDomainEvents(from, ectx, buildUpdateEvents(collection, before, after, changedFields(before, cleaned)));
    return NextResponse.json({ data: after });
  }
  if (action === "delete") {
    if (!body.id) return NextResponse.json({ error: pick(locale, "id manquant.", "Missing id.") }, { status: 400 });
    const { error } = await from(T).delete().eq("tenant_id", tenantId).eq("collection", collection).eq("id", body.id);
    if (error) throw error;
    await cleanupLinksForRecord(from, tenantId, collection, body.id);
    await emitDomainEvents(from, ectx, [buildDeleteEvent(collection, String(body.id))]);
    return NextResponse.json({ ok: true });
  }
  if (action === "bulk_create") {
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!rows.length) return NextResponse.json({ error: pick(locale, "Aucune ligne à importer.", "No rows to import.") }, { status: 400 });
    if (rows.length > 2000) return NextResponse.json({ error: pick(locale, "Trop de lignes (max 2000).", "Too many rows (2000 max).") }, { status: 400 });
    const payload = rows.map((r) => ({ tenant_id: tenantId, collection, data: cleanData(r), created_by: userId }));
    const { data, error } = await from(T).insert(payload).select("id");
    if (error) throw error;
    return NextResponse.json({ ok: true, inserted: data?.length ?? payload.length });
  }
  if (action === "bulk_delete") {
    const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).filter(Boolean);
    if (!ids.length) return NextResponse.json({ error: pick(locale, "Aucun élément sélectionné.", "No items selected.") }, { status: 400 });
    if (ids.length > 500) return NextResponse.json({ error: pick(locale, "Trop d'éléments (max 500).", "Too many items (500 max).") }, { status: 400 });
    const { error } = await from(T).delete().eq("tenant_id", tenantId).eq("collection", collection).in("id", ids);
    if (error) throw error;
    await cleanupLinksForRecords(from, tenantId, collection, ids);
    return NextResponse.json({ ok: true, deleted: ids.length });
  }
  return NextResponse.json(
    { error: pick(locale, `Action inconnue : ${action}`, `Unknown action: ${action}`) },
    { status: 400 }
  );
}

export async function POST(req: Request) {
  const locale = await getLocale();

  if (!sameOrigin(req)) {
    return NextResponse.json({ error: pick(locale, "Origine non autorisée.", "Origin not allowed.") }, { status: 403 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: pick(locale, "Authentification requise.", "Authentication required.") }, { status: 401 });
  }

  const membership = await getActiveMembershipServer(supabase, user.id);

  if (!membership) {
    return NextResponse.json({ error: pick(locale, "Aucun espace de travail.", "No workspace.") }, { status: 403 });
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
    // Relations many-to-many (Phase 4) : deux extrémités + libellé + filtre.
    a?: { entity?: string; id?: string };
    b?: { entity?: string; id?: string };
    with?: string;
    relation?: string;
    // Filtres/recherche/pagination serveur (Phase 9).
    filters?: unknown;
    search?: string;
    searchFields?: string[];
    offset?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: pick(locale, "Corps de requête invalide.", "Invalid request body.") }, { status: 400 });
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
      {
        error: pick(
          locale,
          "Vous êtes en lecture seule sur cet espace : vous ne pouvez pas modifier les données.",
          "You have read-only access to this workspace: you cannot edit data."
        ),
      },
      { status: 403 }
    );
  }
  if (isWorkspaceEntity && DELETE_ACTIONS.has(action) && !can(membership.role, "data.delete")) {
    return NextResponse.json(
      {
        error: pick(
          locale,
          "Seuls le propriétaire ou un administrateur peuvent supprimer des données du workspace.",
          "Only the owner or an administrator can delete workspace data."
        ),
      },
      { status: 403 }
    );
  }

  // ── GEL LECTURE SEULE ── (s'applique aux DEUX chemins : entité workspace OU
  // collection générique). Un abonnement expiré fige l'espace en lecture seule ;
  // seules les écritures sont refusées. L'usage manuel ne coûte pas de crédit.
  if (WRITE_ACTIONS.has(action)) {
    const ent = await getEntitlementsForTenant(supabase, tenantId);
    if (!ent.writable) {
      return NextResponse.json({ error: frozenMessage(locale), frozen: true }, { status: 403 });
    }
  }

  // Accès dynamique à la table (nom validé) → cast contrôlé du client typé.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const from = (t: string) => (supabase.from as any)(t);

  // Contexte d'émission des événements de domaine (Phase 5) : qui, quel espace,
  // quelle app émettrice (module_id transmis par le pont de l'app). Best-effort.
  const emitCtx = { tenantId, actorId: user.id, moduleId: typeof body.moduleId === "string" ? body.moduleId : null };

  // ── FAIL-CLOSED (décision 2026-07-12) ── un compte `member` NON relié à une
  // fiche employé ne doit voir AUCUNE donnée métier en LECTURE (avant : il voyait
  // tout le tenant — fail-open). S'applique aux entités workspace ET aux
  // collections libres (app_records). Les écritures restent gouvernées par RBAC/RLS.
  const READ_GATE_ACTIONS = new Set(["list", "get", "chantier_rentabilite", "list_links"]);
  if (membership.role === "member" && READ_GATE_ACTIONS.has(action)) {
    const linkedEmpIds = await memberEmployeeIds(from, tenantId, user.id);
    if (linkedEmpIds.length === 0) {
      return NextResponse.json({ data: action === "get" ? null : [] });
    }
  }

  // ── RELATIONS MANY-TO-MANY (Phase 4) ── actions transverses (pas liées à UNE
  // entité) : elles opèrent sur entity_links entre deux extrémités quelconques
  // (canonique ou custom). RBAC/gel déjà vérifiés (link/unlink ∈ WRITE_ACTIONS).
  if (action === "link" || action === "unlink" || action === "list_links") {
    if (action === "list_links") {
      const r = await listEntityLinks(
        from,
        tenantId,
        String(body.entity ?? ""),
        String(body.id ?? ""),
        typeof body.with === "string" ? body.with : undefined
      );
      if (r.error) return NextResponse.json({ error: r.error }, { status: r.status ?? 400 });
      return NextResponse.json({ data: r.data });
    }
    const a: LinkEndpoint = { entity: String(body.a?.entity ?? ""), id: String(body.a?.id ?? "") };
    const b: LinkEndpoint = { entity: String(body.b?.entity ?? ""), id: String(body.b?.id ?? "") };
    const rel = typeof body.relation === "string" ? body.relation : "";
    const r =
      action === "link"
        ? await createEntityLink(from, tenantId, user.id, a, b, rel)
        : await deleteEntityLink(from, tenantId, a, b, rel);
    if (r.error) return NextResponse.json({ error: r.error }, { status: r.status ?? 400 });
    if (r.ok && a.entity && b.entity) {
      await emitDomainEvents(from, emitCtx, [
        buildLinkEvent(action === "link" ? "relation_added" : "relation_removed", a, b, rel),
      ]);
    }
    return NextResponse.json({ ok: r.ok, data: r.data });
  }

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
      return NextResponse.json({ error: pick(locale, "Collection invalide.", "Invalid collection.") }, { status: 400 });
    }
    try {
      return await handleAppStore(from, tenantId, user.id, entity, action, body, readFilter, locale);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : pick(locale, "Erreur base de données.", "Database error.");
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
      // Pagination serveur (Phase 9) : `offset` fourni → on renvoie aussi le total.
      const wantsPage = typeof body.offset === "number" && body.offset >= 0;
      const limit = Math.min(Number(body.limit) || 200, 500);
      let q = from(def.table)
        .select(typeof body.columns === "string" ? body.columns : "*", wantsPage ? { count: "exact" } : undefined)
        .eq("tenant_id", tenantId);
      // Périmètre employé : borne aux chantiers autorisés (racine par id, enfants
      // par chantier_id). null = pas de restriction ; [] = aucun chantier visible.
      if (allowedChantierIds !== null) q = q.in(perimeterCol, allowedChantierIds);
      if (body.match && typeof body.match === "object") q = q.match(body.match);
      // Portée des données : « vierge / import » = créés depuis le démarrage de
      // l'app ; « choisir » = uniquement les ids sélectionnés pour cette entité.
      if (readFilter?.since) q = q.gte("created_at", readFilter.since);
      if (readFilter?.ids) q = q.in("id", readFilter.ids);
      // ── FILTRES + RECHERCHE SERVEUR (Phase 9) ── colonnes whitelistées, valeurs
      // paramétrées (aucune chaîne SQL brute). `mine` → fiche employé de l'user.
      if (body.filters || (typeof body.search === "string" && body.search.trim())) {
        const allowedCols = new Set<string>([...def.writable, "id", "created_at", "updated_at"]);
        let employeeId: string | null = null;
        if (body.filters && JSON.stringify(body.filters).includes('"mine"')) {
          employeeId = (await memberEmployeeIds(from, tenantId, user.id))[0] ?? null;
        }
        try {
          if (body.filters) q = applyFilterGroup(q, body.filters as AppFilterGroup, { allowedColumns: allowedCols, employeeId });
          if (typeof body.search === "string" && body.search.trim() && Array.isArray(body.searchFields)) {
            q = applySearch(q, body.search, body.searchFields, allowedCols);
          }
        } catch (fe) {
          return NextResponse.json(
            { error: fe instanceof Error ? fe.message : pick(locale, "Filtre invalide.", "Invalid filter.") },
            { status: 400 }
          );
        }
      }
      if (typeof body.order === "string") {
        q = q.order(body.order, { ascending: body.ascending !== false });
      }
      if (wantsPage) {
        const from0 = Number(body.offset) || 0;
        q = q.range(from0, from0 + limit - 1);
        const { data, error, count } = await q;
        if (error) throw error;
        const total = typeof count === "number" ? count : null;
        // Un artisan ne doit JAMAIS voir « 84da6925-5d86-40bf… » dans une colonne
        // « Client ». On joint le nom à côté de l'id (client_id_label), le serveur
        // sachant déjà nommer une fiche (RELATION_DISPLAY).
        await attachRelationLabels(from, tenantId, entity, data as Record<string, unknown>[]);
        return NextResponse.json({ data, total, hasMore: total != null ? from0 + (data?.length ?? 0) < total : false });
      }
      q = q.limit(limit);
      const { data, error } = await q;
      if (error) throw error;
      await attachRelationLabels(from, tenantId, entity, data as Record<string, unknown>[]);
      return NextResponse.json({ data });
    }

    if (action === "get") {
      if (!body.id) return NextResponse.json({ error: pick(locale, "id manquant.", "Missing id.") }, { status: 400 });
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
        if (data) await attachRelationLabels(from, tenantId, entity, [data as Record<string, unknown>]);
        return NextResponse.json({ data: data ?? null });
      }
      const { data, error } = await from(def.table)
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("id", body.id)
        .single();
      if (error) throw error;
      // La fiche détail affiche « Client : Alpha Barry », jamais l'uuid.
      if (data) await attachRelationLabels(from, tenantId, entity, [data as Record<string, unknown>]);
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
      const canon = canonize(entity, sanitize(body.values, def.writable), locale);
      if (canon.error) return NextResponse.json({ error: canon.error }, { status: 400 });
      const values = canon.values;
      const { data, error } = await from(def.table)
        .insert({ ...values, tenant_id: tenantId })
        .select()
        .single();
      if (error) throw error;
      await log("create", `${def.label}${rowName(values)} — ajout`, data?.id ?? null);
      await emitDomainEvents(from, emitCtx, [buildCreateEvent(entity, data)]);
      return NextResponse.json({ data });
    }

    if (action === "bulk_create") {
      // Import CSV/Excel : insertion en masse. Chaque ligne est nettoyée
      // (colonnes whitelistées) et tenant_id est forcé côté serveur.
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (!rows.length) {
        return NextResponse.json({ error: pick(locale, "Aucune ligne à importer.", "No rows to import.") }, { status: 400 });
      }
      if (rows.length > 2000) {
        return NextResponse.json(
          { error: pick(locale, "Trop de lignes (max 2000 par import).", "Too many rows (2000 max per import).") },
          { status: 400 }
        );
      }
      const clean = rows
        .map((r) => sanitize(r, def.writable))
        .filter((r) => Object.values(r).some((v) => v !== null && v !== undefined && String(v).trim() !== ""));
      if (!clean.length) {
        return NextResponse.json(
          {
            error: pick(
              locale,
              "Aucune donnée exploitable (colonnes non reconnues ?).",
              "No usable data (unrecognized columns?)."
            ),
          },
          { status: 400 }
        );
      }
      // Un import est TOUT OU RIEN : mieux vaut renvoyer l'artisan corriger son
      // fichier que laisser entrer 300 lignes dont 12 invisibles aux agents. On
      // pointe les lignes fautives (numéro + valeur) au lieu d'un refus opaque.
      const canonRows: Record<string, unknown>[] = [];
      const bad: string[] = [];
      clean.forEach((r, i) => {
        const c = canonize(entity, r, locale);
        if (c.error) bad.push(pick(locale, `ligne ${i + 1} : ${c.error}`, `row ${i + 1}: ${c.error}`));
        else canonRows.push(c.values);
      });
      if (bad.length) {
        const head = bad.slice(0, 5).join(" | ");
        const reste =
          bad.length > 5
            ? pick(locale, ` (+ ${bad.length - 5} autre(s) ligne(s))`, ` (+ ${bad.length - 5} more row(s))`)
            : "";
        return NextResponse.json(
          {
            error: pick(
              locale,
              `Import annulé — ${bad.length} ligne(s) contiennent une valeur non reconnue. ${head}${reste}`,
              `Import cancelled — ${bad.length} row(s) contain an unrecognized value. ${head}${reste}`
            ),
          },
          { status: 400 }
        );
      }
      const payload = canonRows.map((r) => ({ ...r, tenant_id: tenantId }));
      const { data, error } = await from(def.table).insert(payload).select("id");
      if (error) throw error;
      await log("create", `${def.label} — import de ${data?.length ?? clean.length} ligne(s)`);
      return NextResponse.json({ ok: true, inserted: data?.length ?? clean.length });
    }

    if (action === "update") {
      if (!body.id) return NextResponse.json({ error: pick(locale, "id manquant.", "Missing id.") }, { status: 400 });
      const canonU = canonize(entity, sanitize(body.values, def.writable), locale);
      if (canonU.error) return NextResponse.json({ error: canonU.error }, { status: 400 });
      const values = canonU.values;
      // État AVANT (lookup PK, peu coûteux) → before/after + status_changed précis.
      const { data: before } = await from(def.table)
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("id", body.id)
        .maybeSingle();
      const { data, error } = await from(def.table)
        .update(values)
        .eq("tenant_id", tenantId)
        .eq("id", body.id)
        .select()
        .single();
      if (error) throw error;
      await log("update", `${def.label}${rowName(values)} — mise à jour`, body.id);
      captureLearningSignal(supabase, tenantId, entity, data as Record<string, unknown>);
      await emitDomainEvents(
        from,
        emitCtx,
        buildUpdateEvents(
          entity,
          before as Record<string, unknown> | null,
          data as Record<string, unknown>,
          changedFields(before as Record<string, unknown> | null, values)
        )
      );
      return NextResponse.json({ data });
    }

    if (action === "delete") {
      if (!body.id) return NextResponse.json({ error: pick(locale, "id manquant.", "Missing id.") }, { status: 400 });
      const { error } = await from(def.table)
        .delete()
        .eq("tenant_id", tenantId)
        .eq("id", body.id);
      if (error) throw error;
      // Relations (Phase 4) : la fiche disparaît → ses liens aussi (best-effort).
      await cleanupLinksForRecord(from, tenantId, entity, body.id);
      await log("delete", `${def.label} — suppression`, body.id);
      await emitDomainEvents(from, emitCtx, [buildDeleteEvent(entity, String(body.id))]);
      return NextResponse.json({ ok: true });
    }

    if (action === "bulk_delete") {
      const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).filter(Boolean);
      if (!ids.length) return NextResponse.json({ error: pick(locale, "Aucun élément sélectionné.", "No items selected.") }, { status: 400 });
      if (ids.length > 500) return NextResponse.json({ error: pick(locale, "Trop d'éléments (max 500).", "Too many items (500 max).") }, { status: 400 });
      const { error } = await from(def.table).delete().eq("tenant_id", tenantId).in("id", ids);
      if (error) throw error;
      await cleanupLinksForRecords(from, tenantId, entity, ids);
      await log("delete", `${def.label} — suppression de ${ids.length} élément(s)`);
      await emitDomainEvents(from, emitCtx, ids.slice(0, 20).map((id) => buildDeleteEvent(entity, id)));
      return NextResponse.json({ ok: true, deleted: ids.length });
    }

    // ── FACTURER UN DEVIS ── crée une facture À PARTIR d'un devis accepté, SANS
    // re-saisie : reprend client, chantier et montants, génère un numéro légal
    // (F-AAAA-NNN, unique par entreprise) côté serveur et relie devis_id. C'est le
    // maillon devis→facture ; réutilisable par l'app, le copilote et les agents.
    //   mode = "acompte" (pct %, défaut 30) · "situation" (pct %) · "solde" (reste
    //   à facturer = total du devis − déjà facturé). Appelé avec entity="factures".
    if (action === "invoice_from_devis") {
      // Logique déplacée dans lib/workspace-transforms (invoiceFromDevis) pour être
      // réutilisable par la validation d'un item d'agent. Comportement IDENTIQUE.
      const devisId =
        typeof body.devisId === "string" && body.devisId
          ? body.devisId
          : typeof body.id === "string"
            ? body.id
            : "";
      const mode = body.mode === "acompte" || body.mode === "situation" ? body.mode : "solde";
      const result = await invoiceFromDevis({
        from,
        tenantId,
        devisId,
        mode,
        pct: typeof body.pct === "number" ? body.pct : null,
        log,
        factureLabel: def.label,
      });
      if (result.error) return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
      return NextResponse.json({ data: result.data });
    }

    // ── TRANSFORMATIONS ATOMIQUES ── logique partagée (lib/workspace-transforms),
    // réutilisée À L'IDENTIQUE par les outils agent. La source est prise dans
    // devisId/demandeId/noteId, avec repli sur `id`. `invoice_from_devis` reste
    // au-dessus (numérotation LÉGALE des factures — chemin dédié, non extrait).
    if (isTransformAction(action)) {
      const sourceId = String(body.devisId || body.demandeId || body.noteId || body.id || "");
      const r = await runWorkspaceTransform({ from, tenantId, action, sourceId, log });
      if (r.error) return NextResponse.json({ error: r.error }, { status: r.status ?? 400 });
      return NextResponse.json({ data: r.data });
    }

    return NextResponse.json(
      { error: pick(locale, `Action inconnue : ${action}`, `Unknown action: ${action}`) },
      { status: 400 }
    );
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : pick(locale, "Erreur base de données.", "Database error.");
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
