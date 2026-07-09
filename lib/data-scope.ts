// ─────────────────────────────────────────────────────────────────────────────
// PORTÉE DES DONNÉES D'UNE APP (data_scope) — logique partagée.
//
// Au démarrage d'une app (template ou création IA), l'utilisateur choisit sa
// source de données. On stocke le choix sur `modules.data_scope` (migration 028)
// et /api/data l'applique en LECTURE (les écritures vont toujours au workspace,
// qui reste la source unique) :
//   • Vierge → mode "fresh" : n'affiche que les enregistrements créés DEPUIS le
//     démarrage de l'app (created_at >= since) → l'app démarre vide, et ce qu'on
//     y saisit (donc créé après) apparaît, tout en alimentant le workspace.
//   • Import → même mode "fresh" : on insère d'abord les lignes du fichier dans
//     le workspace, elles sont donc « depuis le démarrage » et s'affichent.
//   • Workspace → "all" (tout) ou "select" (une sélection d'ids par entité).
//
// `null`/absent = "all" = comportement historique (fenêtre sur tout le workspace).
// ─────────────────────────────────────────────────────────────────────────────

/** Portée stockée sur la ligne `modules` (jsonb). */
export type StoredScope =
  | { mode: "all" }
  | { mode: "fresh"; since: string }
  | { mode: "select"; records: Record<string, string[]> };

/** Choix brut envoyé par le client (générateur / chooser de template). */
export type ClientScope =
  | { source: "workspace"; mode: "all" }
  | { source: "workspace"; mode: "select"; records: { entity: string; id: string }[] }
  | { source: "import" }
  | { source: "zero" };

/** Choix normalisé, PRÊT à être daté (`since` posé côté serveur pour "fresh"). */
export type NormalizedScope =
  | { mode: "all" }
  | { mode: "fresh" } // `since` posé à l'instanciation (created_at du module)
  | { mode: "select"; records: Record<string, string[]> };

/** Normalise le choix client. Renvoie null si non exploitable (→ "all"). */
export function normalizeClientScope(input: unknown): NormalizedScope | null {
  if (!input || typeof input !== "object") return null;
  const s = input as Partial<ClientScope> & { records?: unknown };
  if (s.source === "zero" || s.source === "import") return { mode: "fresh" };
  if (s.source === "workspace") {
    if (s.mode === "select" && Array.isArray(s.records)) {
      const records: Record<string, string[]> = {};
      for (const r of s.records as { entity?: unknown; id?: unknown }[]) {
        const entity = typeof r?.entity === "string" ? r.entity : "";
        const id = r?.id == null ? "" : String(r.id);
        if (!entity || !id) continue;
        (records[entity] ||= []).push(id);
      }
      return Object.keys(records).length ? { mode: "select", records } : { mode: "all" };
    }
    return { mode: "all" };
  }
  return null;
}

/** True si la portée demande un import (fichier) au moment de l'instanciation. */
export function scopeWantsImport(input: unknown): boolean {
  return !!input && typeof input === "object" && (input as { source?: string }).source === "import";
}

/** Coerce une valeur jsonb (colonne modules.data_scope) en StoredScope sûr. */
export function coerceStoredScope(raw: unknown): StoredScope {
  if (!raw || typeof raw !== "object") return { mode: "all" };
  const s = raw as { mode?: unknown; since?: unknown; records?: unknown };
  if (s.mode === "fresh" && typeof s.since === "string") return { mode: "fresh", since: s.since };
  if (s.mode === "select" && s.records && typeof s.records === "object" && !Array.isArray(s.records)) {
    const records: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(s.records as Record<string, unknown>)) {
      if (Array.isArray(v)) records[k] = v.map(String).filter(Boolean);
    }
    return { mode: "select", records };
  }
  return { mode: "all" };
}

/** Calcule la portée À STOCKER sur un module fraîchement créé, à partir du choix
 *  client et de l'horodatage de création (DB). `all`/null → null (défaut = tout).
 *  Utilisé à la création CHAT (persistance client) comme à l'instanciation d'un
 *  template. Client-safe (pure). */
export function computeStoredScope(clientScope: unknown, createdAtIso: string): StoredScope | null {
  const n = normalizeClientScope(clientScope);
  if (!n || n.mode === "all") return null;
  if (n.mode === "fresh") return { mode: "fresh", since: createdAtIso };
  if (n.mode === "select") return { mode: "select", records: n.records };
  return null;
}

/** Filtre de LECTURE à appliquer à une `list` pour une entité donnée.
 *  - null              → aucune restriction (tout).
 *  - { since }         → created_at >= since (mode "fresh" : vierge/import).
 *  - { ids }           → id ∈ ids (mode "select", pour l'entité choisie).
 *  - { empty:true }    → aucun résultat (jamais utilisé pour l'instant). */
export function scopeReadFilter(
  scope: StoredScope | null | undefined,
  entity: string,
): { since?: string; ids?: string[] } | null {
  if (!scope || scope.mode === "all") return null;
  if (scope.mode === "fresh") return { since: scope.since };
  if (scope.mode === "select") {
    const ids = scope.records[entity];
    // Entité explicitement sélectionnée → on restreint à ces ids.
    // Entité non listée (ex. collection libre non « choisissable ») → pas de
    // restriction : on n'ampute pas ce que l'utilisateur n'a pas cherché à scoper.
    return Array.isArray(ids) && ids.length ? { ids } : null;
  }
  return null;
}
