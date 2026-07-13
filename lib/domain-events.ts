// ─────────────────────────────────────────────────────────────────────────────
// ÉVÉNEMENTS MÉTIER (Phase 5) — émission (outbox) + consommation.
//
// Émet ce qui se passe DANS les données (pas la génération : ça, c'est app_events).
// Un événement = { type, entity, recordId, before?, after?, metadata }. Émis en
// LOT (un seul insert) et en BEST-EFFORT : jamais bloquant, dégradation propre si
// la table n'existe pas encore (046 non déployée). Les agents consomment ensuite
// les événements non traités (processed_at is null).
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type From = (t: string) => any;

const T = "domain_events";

export type DomainEventType =
  | "record_created"
  | "record_updated"
  | "record_archived"
  | "status_changed"
  | "field_changed"
  | "relation_added"
  | "relation_removed"
  | "form_submitted"
  | "document_uploaded"
  | "photo_uploaded"
  | "action_clicked"
  | "approval_requested"
  | "approval_completed"
  | "assignment_changed";

export interface DomainEventInput {
  type: DomainEventType;
  entity: string;
  recordId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}

export interface EmitContext {
  tenantId: string;
  actorId?: string | null;
  moduleId?: string | null;
}

function isMissingTable(msg: string | undefined): boolean {
  return !!msg && /does not exist|could not find the table|relation .* does not exist|schema cache/i.test(msg);
}

/** Colonnes de statut / d'affectation selon les entités du workspace. */
const STATUS_COLS = ["statut", "status"];
const ASSIGN_COLS = ["assignee_id", "chef_chantier_id", "employee_id", "demandeur_id", "auteur_id", "supplier_id"];

/** Émet un LOT d'événements (un seul insert). Best-effort, jamais bloquant. */
export async function emitDomainEvents(
  from: From,
  ctx: EmitContext,
  events: DomainEventInput[]
): Promise<void> {
  if (!events.length) return;
  const rows = events.slice(0, 20).map((e) => ({
    tenant_id: ctx.tenantId,
    module_id: ctx.moduleId ?? null,
    type: e.type,
    entity: e.entity,
    record_id: e.recordId ?? null,
    actor_id: ctx.actorId ?? null,
    before: e.before ?? null,
    after: e.after ?? null,
    metadata: e.metadata ?? {},
  }));
  try {
    const { error } = await from(T).insert(rows);
    if (error && !isMissingTable(error.message)) {
      // Erreur non fatale (l'écriture métier a déjà réussi) — on log en silence.
      // eslint-disable-next-line no-console
      console.error("domain_events insert failed:", error.message);
    }
  } catch {
    /* table absente / réseau → jamais bloquant */
  }
}

// ── CONSTRUCTEURS D'ÉVÉNEMENTS ────────────────────────────────────────────────

const idOf = (row: unknown): string | null => {
  if (row && typeof row === "object" && "id" in row) {
    const v = (row as Record<string, unknown>).id;
    return v == null ? null : String(v);
  }
  return null;
};

export function buildCreateEvent(entity: string, row: unknown): DomainEventInput {
  return { type: "record_created", entity, recordId: idOf(row), after: row };
}

export function buildDeleteEvent(entity: string, recordId: string): DomainEventInput {
  return { type: "record_archived", entity, recordId };
}

/**
 * Événements d'une mise à jour : toujours `record_updated`, plus `status_changed`
 * et `assignment_changed` quand ces champs bougent RÉELLEMENT (before ≠ after).
 * `before` peut être null (capture ratée) → seul record_updated est émis.
 */
export function buildUpdateEvents(
  entity: string,
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  changedKeys: string[]
): DomainEventInput[] {
  const recordId = idOf(after) ?? idOf(before);
  const out: DomainEventInput[] = [
    { type: "record_updated", entity, recordId, before: before ?? null, after: after ?? null, metadata: { changedFields: changedKeys } },
  ];
  if (!before || !after) return out;

  for (const col of STATUS_COLS) {
    if (col in after && before[col] !== after[col]) {
      out.push({
        type: "status_changed",
        entity,
        recordId,
        before: before[col] ?? null,
        after: after[col] ?? null,
        metadata: { field: col },
      });
      break; // une entité n'a qu'une colonne de statut
    }
  }
  for (const col of ASSIGN_COLS) {
    if (col in after && before[col] !== after[col]) {
      out.push({
        type: "assignment_changed",
        entity,
        recordId,
        before: before[col] ?? null,
        after: after[col] ?? null,
        metadata: { field: col },
      });
    }
  }
  return out;
}

export function buildLinkEvent(
  type: "relation_added" | "relation_removed",
  a: { entity: string; id: string },
  b: { entity: string; id: string },
  relation: string
): DomainEventInput {
  return {
    type,
    entity: a.entity,
    recordId: a.id,
    metadata: { related: { entity: b.entity, id: b.id }, relation: relation || "" },
  };
}

/** Clés RÉELLEMENT modifiées (before ≠ after) parmi les champs écrits. */
export function changedFields(
  before: Record<string, unknown> | null | undefined,
  values: Record<string, unknown>
): string[] {
  if (!before) return Object.keys(values);
  return Object.keys(values).filter((k) => before[k] !== values[k]);
}

// ── CONSOMMATION (moteur d'agents, via service_role) ──────────────────────────

export interface DomainEventRow {
  id: string;
  tenant_id: string;
  module_id: string | null;
  type: string;
  entity: string;
  record_id: string | null;
  actor_id: string | null;
  before: unknown;
  after: unknown;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** Événements non traités d'un tenant (FIFO). Pour le moteur d'agents. Best-effort. */
export async function fetchUnprocessedEvents(
  admin: From | null,
  tenantId: string,
  opts: { types?: DomainEventType[]; limit?: number } = {}
): Promise<DomainEventRow[]> {
  if (!admin) return [];
  try {
    let q = admin(T).select("*").eq("tenant_id", tenantId).is("processed_at", null);
    if (opts.types?.length) q = q.in("type", opts.types);
    q = q.order("created_at", { ascending: true }).limit(Math.min(opts.limit ?? 200, 500));
    const { data, error } = await q;
    if (error || !data) return [];
    return data as DomainEventRow[];
  } catch {
    return [];
  }
}

/** Marque des événements comme traités (idempotence côté agents). Best-effort. */
export async function markEventsProcessed(admin: From | null, ids: string[]): Promise<void> {
  if (!admin || !ids.length) return;
  try {
    await admin(T).update({ processed_at: new Date().toISOString() }).in("id", ids.slice(0, 500));
  } catch {
    /* best-effort */
  }
}
