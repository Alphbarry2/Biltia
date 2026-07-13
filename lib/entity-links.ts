// ─────────────────────────────────────────────────────────────────────────────
// RELATIONS MANY-TO-MANY (Phase 4) — helpers de la table `entity_links`.
//
// Relie deux enregistrements (entité canonique OU collection custom) de façon
// VALIDÉE, DÉDUPLIQUÉE, FILTRABLE et SUPPRIMABLE. La paire est CANONICALISÉE
// (ordre stable) → link(A,B) == link(B,A). Tenant TOUJOURS forcé par l'appelant.
//
// Accès via le `from` fourni par /api/data (client de SESSION → RLS de 045).
// Best-effort au niveau appelant : tant que 045 n'est pas déployée, la table
// n'existe pas → les erreurs sont capturées et remontées proprement.
// ─────────────────────────────────────────────────────────────────────────────

import { getLocale } from "./i18n/server";
import { pick } from "./i18n/config";

import { ALLOWED_ENTITIES } from "./data-entities";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type From = (t: string) => any;

const T = "entity_links";
const KEY_RE = /^[a-z][a-z0-9_]{1,79}$/;

/** La table n'existe pas encore (045 non déployée) → dégradation propre. */
function isMissingTable(msg: string | undefined): boolean {
  return !!msg && /does not exist|could not find the table|relation .* does not exist|schema cache/i.test(msg);
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface LinkEndpoint {
  entity: string;
  id: string;
}
export interface EntityLinkRow {
  entity: string;
  id: string;
  relation: string;
}

/** Nom d'entité valide pour un lien : canonique OU clé de collection bien formée. */
export function isValidLinkEntity(name: string): boolean {
  return ALLOWED_ENTITIES.includes(name) || KEY_RE.test(name);
}

/** Ordre canonique d'une paire → link(A,B) et link(B,A) donnent la même ligne. */
export function canonicalPair(a: LinkEndpoint, b: LinkEndpoint): { left: LinkEndpoint; right: LinkEndpoint } {
  const ka = `${a.entity}:${a.id}`;
  const kb = `${b.entity}:${b.id}`;
  return ka <= kb ? { left: a, right: b } : { left: b, right: a };
}

export interface LinkResult {
  ok?: boolean;
  data?: unknown;
  error?: string;
  status?: number;
}

function validateEndpoints(a: LinkEndpoint, b: LinkEndpoint): string | null {
  if (!a?.entity || !a?.id || !b?.entity || !b?.id) return "Les deux extrémités (entité + id) sont requises.";
  if (!isValidLinkEntity(a.entity) || !isValidLinkEntity(b.entity)) return "Type d'entité invalide.";
  if (!UUID_RE.test(a.id) || !UUID_RE.test(b.id)) return "Identifiant invalide.";
  if (a.entity === b.entity && a.id === b.id) return "Impossible de relier un élément à lui-même.";
  return null;
}

/** Crée un lien (idempotent : un doublon renvoie ok sans erreur). */
export async function createEntityLink(
  from: From,
  tenantId: string,
  userId: string | null,
  a: LinkEndpoint,
  b: LinkEndpoint,
  relation = ""
): Promise<LinkResult> {
  const locale = await getLocale();
  const err = validateEndpoints(a, b);
  if (err) return { error: err, status: 400 };
  const { left, right } = canonicalPair(a, b);
  const rel = String(relation || "").slice(0, 60);
  try {
    const { data, error } = await from(T)
      .insert({
        tenant_id: tenantId,
        left_entity: left.entity,
        left_id: left.id,
        right_entity: right.entity,
        right_id: right.id,
        relation: rel,
        created_by: userId,
      })
      .select()
      .single();
    if (error) {
      // Doublon (index unique) → lien déjà présent, ce n'est pas une erreur.
      if (/duplicate key|unique/i.test(error.message)) return { ok: true, data: null };
      if (isMissingTable(error.message))
        return { error: pick(locale, "Les relations ne sont pas encore activées sur cet espace.", "Relations are not enabled on this workspace yet."), status: 503 };
      return { error: error.message, status: 400 };
    }
    return { ok: true, data };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur de liaison.", status: 400 };
  }
}

/** Supprime un lien précis (peu importe le sens fourni). */
export async function deleteEntityLink(
  from: From,
  tenantId: string,
  a: LinkEndpoint,
  b: LinkEndpoint,
  relation = ""
): Promise<LinkResult> {
  const err = validateEndpoints(a, b);
  if (err) return { error: err, status: 400 };
  const { left, right } = canonicalPair(a, b);
  try {
    const { error } = await from(T)
      .delete()
      .eq("tenant_id", tenantId)
      .eq("left_entity", left.entity)
      .eq("left_id", left.id)
      .eq("right_entity", right.entity)
      .eq("right_id", right.id)
      .eq("relation", String(relation || "").slice(0, 60));
    if (error) return { error: error.message, status: 400 };
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur.", status: 400 };
  }
}

/**
 * Liste les enregistrements liés à (entity,id), dans les DEUX sens. `withEntity`
 * filtre par type d'entité liée (« les employees de ce chantier »).
 */
export async function listEntityLinks(
  from: From,
  tenantId: string,
  entity: string,
  id: string,
  withEntity?: string
): Promise<LinkResult> {
  const locale = await getLocale();
  if (!entity || !id || !isValidLinkEntity(entity) || !UUID_RE.test(id)) {
    return { error: pick(locale, "Entité/identifiant invalide.", "Invalid entity/identifier."), status: 400 };
  }
  try {
    const [asLeft, asRight] = await Promise.all([
      from(T).select("right_entity, right_id, relation").eq("tenant_id", tenantId).eq("left_entity", entity).eq("left_id", id).limit(500),
      from(T).select("left_entity, left_id, relation").eq("tenant_id", tenantId).eq("right_entity", entity).eq("right_id", id).limit(500),
    ]);
    if (isMissingTable(asLeft.error?.message) || isMissingTable(asRight.error?.message)) return { ok: true, data: [] };
    if (asLeft.error) return { error: asLeft.error.message, status: 400 };
    if (asRight.error) return { error: asRight.error.message, status: 400 };
    const out: EntityLinkRow[] = [];
    for (const r of (asLeft.data ?? []) as Record<string, unknown>[]) {
      out.push({ entity: String(r.right_entity), id: String(r.right_id), relation: String(r.relation ?? "") });
    }
    for (const r of (asRight.data ?? []) as Record<string, unknown>[]) {
      out.push({ entity: String(r.left_entity), id: String(r.left_id), relation: String(r.relation ?? "") });
    }
    const filtered = withEntity ? out.filter((r) => r.entity === withEntity) : out;
    return { ok: true, data: filtered };
  } catch (e) {
    // Table absente (045 non déployée) → aucune relation, jamais une erreur dure.
    return { ok: true, data: [] };
  }
}

/** Supprime TOUS les liens d'un enregistrement (au delete d'une fiche). Best-effort. */
export async function cleanupLinksForRecord(from: From, tenantId: string, entity: string, id: string): Promise<void> {
  if (!entity || !id) return;
  try {
    await from(T).delete().eq("tenant_id", tenantId).eq("left_entity", entity).eq("left_id", id);
    await from(T).delete().eq("tenant_id", tenantId).eq("right_entity", entity).eq("right_id", id);
  } catch {
    /* table absente / erreur → le delete de la fiche ne doit jamais échouer pour ça */
  }
}

/** Nettoyage en masse (bulk_delete) : 2 requêtes au total via .in(). Best-effort. */
export async function cleanupLinksForRecords(from: From, tenantId: string, entity: string, ids: string[]): Promise<void> {
  if (!entity || !ids.length) return;
  try {
    await from(T).delete().eq("tenant_id", tenantId).eq("left_entity", entity).in("left_id", ids);
    await from(T).delete().eq("tenant_id", tenantId).eq("right_entity", entity).in("right_id", ids);
  } catch {
    /* best-effort */
  }
}
