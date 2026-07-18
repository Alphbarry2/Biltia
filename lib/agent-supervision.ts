// ─────────────────────────────────────────────────────────────────────────────
// WS-E — Supervision des agents : pour chaque règle, dernier créneau prévu,
// dernier passage réel, résultat/erreur, prochain passage, et ALERTE si un agent
// actif aurait dû tourner mais ne l'a pas fait (secret cron absent, etc.).
//
// L'agrégation est PURE (testable). getAgentSupervision fait l'I/O et l'appelle.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";

export interface SupervisionRuleInput {
  id: string;
  title: string | null;
  status: string;
  trigger_type: string | null;
  next_run_at: string | null;
  last_run_at: string | null;
}

export interface SupervisionRunInput {
  rule_id: string;
  status: string | null;
  summary: string | null;
  error: string | null;
  finished_at: string | null;
  created_at: string | null;
}

export interface SupervisionRow {
  rule_id: string;
  title: string | null;
  status: string;
  trigger_type: string | null;
  next_run_at: string | null;
  last_run_at: string | null;
  last_status: string | null;
  last_summary: string | null;
  last_error: string | null;
  /** Agent actif dont le créneau prévu est dépassé au-delà de la tolérance → doit alerter. */
  stale: boolean;
}

/** 15 min : même tolérance que le reaper des passages zombies. */
export const STALE_GRACE_MS = 15 * 60 * 1000;

/**
 * Construit les lignes de supervision. Pur et déterministe (nowMs injecté).
 * `stale` = règle ACTIVE dont next_run_at est passé depuis plus que la tolérance :
 * le tick aurait dû la déclencher. C'est le signal « activé mais ne tourne pas ».
 */
export function buildSupervisionRows(
  rules: SupervisionRuleInput[],
  latestRuns: SupervisionRunInput[],
  nowMs: number,
  graceMs: number = STALE_GRACE_MS
): SupervisionRow[] {
  const byRule = new Map<string, SupervisionRunInput>();
  for (const run of latestRuns) {
    if (!byRule.has(run.rule_id)) byRule.set(run.rule_id, run); // 1re occurrence = la plus récente (tri desc en amont)
  }
  return rules.map((rule) => {
    const run = byRule.get(rule.id);
    const nextMs = rule.next_run_at ? Date.parse(rule.next_run_at) : NaN;
    const stale = rule.status === "active" && !Number.isNaN(nextMs) && nextMs < nowMs - graceMs;
    return {
      rule_id: rule.id,
      title: rule.title,
      status: rule.status,
      trigger_type: rule.trigger_type,
      next_run_at: rule.next_run_at,
      last_run_at: rule.last_run_at,
      last_status: run?.status ?? null,
      last_summary: run?.summary ?? null,
      last_error: run?.error ?? null,
      stale,
    };
  });
}

/**
 * Lecture de supervision d'un tenant. Réservée au serveur (l'appelant garantit
 * les droits — owner/admin). Renvoie [] en cas d'erreur (jamais bloquant).
 */
export async function getAgentSupervision(db: SupabaseClient, tenantId: string): Promise<SupervisionRow[]> {
  try {
    const [{ data: rules }, { data: runs }] = await Promise.all([
      db
        .from("agent_rules")
        .select("id, title, status, trigger_type, next_run_at, last_run_at")
        .eq("tenant_id", tenantId),
      db
        .from("agent_runs")
        .select("rule_id, status, summary, error, finished_at, created_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);
    return buildSupervisionRows(
      (rules ?? []) as SupervisionRuleInput[],
      (runs ?? []) as SupervisionRunInput[],
      Date.now()
    );
  } catch {
    return [];
  }
}
