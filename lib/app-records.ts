// ─────────────────────────────────────────────────────────────────────────────
// APP RECORDS — lecture des collections d'apps génériques (table app_records).
//
// Toute donnée d'une app générée qui NE correspond PAS à une entité workspace
// atterrit ici (jsonb, par collection, isolée par tenant — cf. /api/data). Sans
// ce module, cette donnée est dans le cloud mais INVISIBLE à l'IA : l'agent et le
// copilote répondaient « je n'ai pas cette info » alors qu'elle existait. Ici on
// la rend LISIBLE. Lecture seule ; mêmes remparts tenant que /api/data (RLS pour
// une session, filtre tenant explicite pour l'exécuteur service_role).
// ─────────────────────────────────────────────────────────────────────────────

// Client base minimal (session RLS ou service_role) — motif lib/agent-tools.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FromClient = { from: (t: string) => any };

/** Aplati une ligne app_records → { id, ...data, created_at, updated_at }
 *  (même forme que le magasin générique de /api/data). */
function flat(r: Record<string, unknown>): Record<string, unknown> {
  const data = r.data && typeof r.data === "object" ? (r.data as Record<string, unknown>) : {};
  return { id: r.id, ...data, created_at: r.created_at, updated_at: r.updated_at };
}

/** Inventaire des collections d'un tenant : nom + nombre de fiches (les plus
 *  fournies d'abord). Vide si aucune app n'a stocké de donnée libre. */
export async function listAppCollections(
  db: FromClient,
  tenantId: string
): Promise<{ collection: string; count: number }[]> {
  const { data, error } = await db
    .from("app_records")
    .select("collection")
    .eq("tenant_id", tenantId)
    .limit(5000);
  if (error || !data) return [];
  const counts = new Map<string, number>();
  for (const row of data as { collection: string }[]) {
    const c = row.collection;
    if (!c) continue;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([collection, count]) => ({ collection, count }))
    .sort((a, b) => b.count - a.count);
}

/** Fiches d'une collection (lecture seule). `match` = filtre d'égalité sur les
 *  champs jsonb (ex : { statut: "en_retard" }). */
export async function listAppRecords(
  db: FromClient,
  tenantId: string,
  collection: string,
  opts: { match?: Record<string, unknown>; limit?: number; ascending?: boolean } = {}
): Promise<{ count: number; rows: Record<string, unknown>[] } | { error: string }> {
  if (!collection || collection.length > 80) return { error: "Collection invalide." };
  let q = db.from("app_records").select("*").eq("tenant_id", tenantId).eq("collection", collection);
  if (opts.match && typeof opts.match === "object" && Object.keys(opts.match).length) {
    q = q.contains("data", opts.match);
  }
  q = q
    .order("created_at", { ascending: opts.ascending === true })
    .limit(Math.min(Number(opts.limit) || 50, 200));
  const { data, error } = await q;
  if (error) return { error: error.message };
  const rows = (data ?? []).map((r: Record<string, unknown>) => flat(r));
  return { count: rows.length, rows };
}
