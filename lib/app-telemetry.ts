// ─────────────────────────────────────────────────────────────────────────────
// TÉLÉMÉTRIE D'USAGE (Phase 10) — que se passe-t-il quand une app est UTILISÉE.
//
// Complète la télémétrie de GÉNÉRATION (déjà dans app_events : app_created,
// coverage_score…) par des signaux d'USAGE réel : app ouverte, vue consultée,
// fiche créée depuis l'app, action échouée, rollback, agent activé… → mesure le
// taux d'erreur, le taux de rollback, les apps inutilisées, l'activation d'agents.
//
// Stockage : on RÉUTILISE `app_events` (même RLS user_id, même métadonnées jsonb)
// → aucune nouvelle table. Les événements d'usage portent `metadata.source='app'`
// et un `event_type` de la whitelist ci-dessous (rejet de tout le reste : pas de
// pollution). Ce module est PUR (whitelist + normalisation) → testable.
// ─────────────────────────────────────────────────────────────────────────────

/** Événements d'usage acceptés (tout autre est rejeté). */
export const USAGE_EVENTS = new Set<string>([
  "app_opened",
  "app_used",
  "view_opened",
  "action_clicked",
  "action_failed",
  "record_created_from_app",
  "app_modified",
  "rollback_used",
  "automation_suggested",
  "automation_activated",
  "generation_auto_fixed",
  "workspace_binding_failed",
]);

export interface UsageEventInput {
  type: string;
  meta?: Record<string, unknown>;
}

export interface NormalizedUsageEvent {
  event_type: string;
  metadata: Record<string, unknown>;
}

const MAX_BATCH = 20;
const MAX_META_KEYS = 12;

/** Ne garde qu'un scalaire court (anti-abus : pas d'objets lourds en télémétrie). */
function scalar(v: unknown): unknown {
  if (v == null) return null;
  if (typeof v === "number" || typeof v === "boolean") return v;
  return String(v).slice(0, 120);
}

/**
 * Valide + normalise un lot d'événements d'usage. Rejette les types hors whitelist,
 * borne la taille du lot et des métadonnées. `moduleId` est injecté dans chaque
 * metadata (quelle app émet). Pur, jamais d'exception.
 */
export function normalizeUsageEvents(
  events: unknown,
  moduleId: string | null
): NormalizedUsageEvent[] {
  if (!Array.isArray(events)) return [];
  const out: NormalizedUsageEvent[] = [];
  for (const e of events.slice(0, MAX_BATCH)) {
    const ev = (e ?? {}) as { type?: unknown; meta?: unknown };
    const type = typeof ev.type === "string" ? ev.type : "";
    if (!USAGE_EVENTS.has(type)) continue;
    const metaIn = ev.meta && typeof ev.meta === "object" ? (ev.meta as Record<string, unknown>) : {};
    const metadata: Record<string, unknown> = { source: "app" };
    if (moduleId) metadata.module_id = moduleId;
    let n = 0;
    for (const k of Object.keys(metaIn)) {
      if (n >= MAX_META_KEYS) break;
      if (k === "source" || k === "module_id") continue;
      metadata[k.slice(0, 40)] = scalar(metaIn[k]);
      n++;
    }
    out.push({ event_type: type, metadata });
  }
  return out;
}
