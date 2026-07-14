// ─────────────────────────────────────────────────────────────────────────────
// LIBELLÉS DES RELATIONS — pour qu'une app n'affiche JAMAIS un uuid à un artisan.
//
// /api/data renvoyait les clés étrangères BRUTES (`client_id: "84da6925-5d86-…"`)
// et laissait chaque app générée se débrouiller pour retrouver le nom. Certaines
// le faisaient, d'autres non : la colonne « Client » affichait alors une bouillie
// d'uuid. C'est le genre de détail qui fait dire « c'est cassé » et rien d'autre.
//
// Le serveur SAIT déjà nommer une fiche (RELATION_DISPLAY, lib/data-entities). On
// joint donc le libellé À CÔTÉ de l'id, sans jamais l'écraser :
//     { client_id: "84da…", client_id_label: "Alpha Barry" }
// L'id reste disponible (les liens, les filtres et les écritures en ont besoin) ;
// le label est là pour l'affichage. Le prompt de génération impose d'afficher le
// label et JAMAIS l'id.
//
// Coût : une requête par entité CIBLE réellement référencée (ids dédupliqués),
// pas une par ligne. Un tableau de 200 devis → 1 requête clients + 1 chantiers.
// Best-effort : si la résolution échoue, on renvoie les lignes telles quelles —
// un libellé manquant ne doit jamais faire échouer une lecture.
// ─────────────────────────────────────────────────────────────────────────────

import { FORM_FIELDS, RELATION_DISPLAY } from "@/lib/data-entities";

/** Le `from` non typé de /api/data (le fichier de types est en retard sur la prod). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type From = (table: string) => any;

type Row = Record<string, unknown>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Suffixe du champ ajouté. Exporté : le prompt de génération le cite mot pour mot. */
export const LABEL_SUFFIX = "_label";

/** Les champs de `entity` qui pointent vers une autre fiche, avec leur cible. */
function relationFields(entity: string): { key: string; target: string }[] {
  return (FORM_FIELDS[entity] ?? [])
    .filter((f) => f.type === "relation" && typeof f.relation === "string" && f.relation)
    .map((f) => ({ key: f.key, target: f.relation as string }));
}

/** Assemble le libellé d'une fiche cible (« Jean Dupont », « DEV-2026-027 »). */
function labelOf(row: Row, cols: string[]): string {
  const parts = cols
    .map((c) => row[c])
    .filter((v) => typeof v === "string" && v.trim())
    .map((v) => (v as string).trim());
  return parts.join(" ");
}

/**
 * Ajoute `<champ>_label` à chaque ligne, pour chaque clé étrangère renseignée.
 * Mute et renvoie `rows`. Ne throw jamais.
 */
export async function attachRelationLabels(
  from: From,
  tenantId: string,
  entity: string,
  rows: Row[] | null | undefined
): Promise<Row[]> {
  if (!Array.isArray(rows) || rows.length === 0) return rows ?? [];

  const relations = relationFields(entity);
  if (relations.length === 0) return rows;

  // Regroupe par entité CIBLE : deux champs peuvent viser la même table
  // (`client_id` et `sous_traitant_id` → clients) → une seule requête.
  const idsByTarget = new Map<string, Set<string>>();
  for (const { key, target } of relations) {
    if (!RELATION_DISPLAY[target]) continue; // cible sans champ-libellé connu
    for (const row of rows) {
      const v = row[key];
      if (typeof v === "string" && UUID_RE.test(v)) {
        const set = idsByTarget.get(target) ?? new Set<string>();
        set.add(v);
        idsByTarget.set(target, set);
      }
    }
  }
  if (idsByTarget.size === 0) return rows;

  // Une requête par table cible, ids dédupliqués. Bornée : au-delà de 500 ids
  // référencés, la page affichée est de toute façon déjà tronquée.
  const labels = new Map<string, Map<string, string>>();
  await Promise.all(
    [...idsByTarget.entries()].map(async ([target, ids]) => {
      const cols = RELATION_DISPLAY[target];
      try {
        const { data } = await from(target)
          .select(["id", ...cols].join(", "))
          .eq("tenant_id", tenantId)
          .in("id", [...ids].slice(0, 500));
        const byId = new Map<string, string>();
        for (const r of (data ?? []) as Row[]) {
          const id = r.id;
          if (typeof id !== "string") continue;
          const label = labelOf(r, cols);
          if (label) byId.set(id, label);
        }
        labels.set(target, byId);
      } catch {
        /* cible illisible (RLS, table absente) → pas de libellé pour celle-ci */
      }
    })
  );

  for (const { key, target } of relations) {
    const byId = labels.get(target);
    if (!byId) continue;
    for (const row of rows) {
      const v = row[key];
      if (typeof v === "string") {
        const label = byId.get(v);
        // Fiche liée supprimée / hors périmètre → PAS de label bidon : on n'écrit
        // rien plutôt que d'afficher un uuid déguisé en nom.
        if (label) row[`${key}${LABEL_SUFFIX}`] = label;
      }
    }
  }

  return rows;
}
