// ─────────────────────────────────────────────────────────────────────────────
// PÉRIMÈTRE EMPLOYÉ — « chacun ne voit que SES chantiers ».
//
// Un compte de rôle « member » (employé) relié à une fiche employé
// (employees.user_id, migration 031) ne doit voir, dans /api/data, que les
// chantiers où il est impliqué — comme chef de chantier, OU via une intervention,
// OU via une tâche assignée — et leurs enfants directs. Les autres rôles
// (owner/admin/manager/viewer) voient tout ; un compte NON relié n'est pas
// restreint (fail-open : l'existant ne casse pas).
//
// Le filtre s'applique CÔTÉ SERVEUR, au-dessus du RLS tenant. Pur data-layer :
// on passe le `from` du client authentifié (donc déjà borné au tenant par RLS).
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type From = (table: string) => any;

/** Enfants directs d'un chantier soumis au périmètre (rattachés par chantier_id). */
export const CHANTIER_CHILD_ENTITIES = new Set<string>([
  "interventions",
  "documents",
  "tasks",
  "materials",
  "equipment",
]);

/** L'entité est-elle soumise au périmètre chantier ? (racine ou enfant) */
export function isPerimeterEntity(entity: string): boolean {
  return entity === "chantiers" || CHANTIER_CHILD_ENTITIES.has(entity);
}

/**
 * Fiches employé RELIÉES à ce compte (employees.user_id = userId, migration 031).
 * Tableau VIDE = compte non relié → aucune fiche employé.
 * Sert au fail-closed de /api/data (un membre non relié ne voit aucune donnée).
 */
export async function memberEmployeeIds(
  from: From,
  tenantId: string,
  userId: string
): Promise<string[]> {
  const { data: emps } = await from("employees")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId);
  return (emps ?? []).map((e: { id: string }) => e.id).filter(Boolean);
}

/**
 * Chantiers visibles par un compte employé.
 *   • null  → compte NON relié à une fiche → AUCUNE restriction (fail-open).
 *             NB : depuis 2026-07-12, /api/data bloque en amont les LECTURES d'un
 *             membre non relié (fail-closed) → ce cas `null` n'est plus atteint
 *             pour un `member` en lecture ; il reste pour la robustesse.
 *   • []    → relié mais affecté à aucun chantier → ne voit aucun chantier.
 *   • [ids] → ses chantiers (chef de chantier OU intervention OU tâche assignée).
 */
export async function memberChantierScope(
  from: From,
  tenantId: string,
  userId: string
): Promise<string[] | null> {
  const empIds = await memberEmployeeIds(from, tenantId, userId);
  if (empIds.length === 0) return null; // non relié → pas de périmètre

  const [chefs, itvs, tks] = await Promise.all([
    from("chantiers").select("id").eq("tenant_id", tenantId).in("chef_chantier_id", empIds),
    from("interventions").select("chantier_id").eq("tenant_id", tenantId).in("employee_id", empIds),
    from("tasks").select("chantier_id").eq("tenant_id", tenantId).in("assignee_id", empIds),
  ]);

  const ids = new Set<string>();
  (chefs.data ?? []).forEach((r: { id: string | null }) => r.id && ids.add(r.id));
  (itvs.data ?? []).forEach((r: { chantier_id: string | null }) => r.chantier_id && ids.add(r.chantier_id));
  (tks.data ?? []).forEach((r: { chantier_id: string | null }) => r.chantier_id && ids.add(r.chantier_id));
  return [...ids];
}
