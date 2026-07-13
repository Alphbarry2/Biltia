// ─────────────────────────────────────────────────────────────────────────────
// AGENT MODEL V2 — le MODÈLE D'AGENT FIGÉ (Phase 1 de l'évolution du moteur).
//
// On grave ICI, une bonne fois, la STRUCTURE COMPLÈTE d'un agent. Une fois figée,
// tout le reste (nouveaux veilleurs, nouvelles actions, nouveaux déclencheurs)
// devient de la DONNÉE qui remplit ce modèle — on ne recode pas la charpente.
//
//   AgentRuleV2
//   ├── trigger      QUAND (schedule | event, avec sous-types)
//   ├── scope        SUR QUOI (entité + filtres : « seulement les chantiers de Pierre »)
//   ├── watcher      la condition surveillée (event watcher_scan)
//   ├── conditions   SI … (all | any | not sur des champs typés)
//   ├── actions[]    la SÉQUENCE ordonnée d'opérations
//   ├── recipients[] POUR QUI (résolution relationnelle : chef de CE chantier…)
//   ├── approval     validation humaine (auto | always | sensitive_only)
//   ├── escalation[] relances graduées (J+3 email → J+7 SMS → J+10 patron)
//   ├── retry        politique de ré-essai (erreur API…)
//   ├── execution    politique d'exécution (stop/continue, plafonds)
//   └── metadata     libre
//
// CE FICHIER NE DÉPEND DE RIEN AU RUNTIME (uniquement des `import type`) : il est
// pur, testable en isolation, et n'introduit aucun cycle. Il NE change AUCUN
// comportement — seul `normalizeRule()` est appelé plus tard pour lire une règle
// (legacy OU v2) sous une forme unifiée. La persistance de `spec` viendra en
// Phase 2 (quand le parseur produira des règles plus riches que les colonnes
// legacy `action`/`schedule`/`trigger` ne peuvent contenir).
// ─────────────────────────────────────────────────────────────────────────────

import type { AgentSchedule, AgentAction, AgentActionType, AgentRecipientKind } from "./agent-rules";
import type { WatcherKey } from "./agent-watchers";

export const AGENT_SPEC_VERSION = 2 as const;

// ── Conditions (all | any | not sur des champs typés) ────────────────────────
export type ConditionOperator =
  | "eq" | "neq" | "gt" | "gte" | "lt" | "lte"
  | "contains" | "not_contains" | "is_empty" | "is_not_empty"
  | "in" | "not_in" | "before" | "after"
  | "days_since_gt" | "days_until_lt"
  | "relation_exists" | "relation_missing";

export type AgentCondition = { field: string; operator: ConditionOperator; value?: unknown };

export type ConditionGroup =
  | { type: "all"; conditions: (AgentCondition | ConditionGroup)[] }
  | { type: "any"; conditions: (AgentCondition | ConditionGroup)[] }
  | { type: "not"; condition: AgentCondition | ConditionGroup };

// ── Déclencheur (2 familles + sous-types) ────────────────────────────────────
export type TriggerType = "schedule" | "event";
export type ScheduleSubtype =
  | "once" | "daily" | "weekly" | "interval" | "monthly"
  | "business_day" | "period_boundary" | "recurring";
export type EventSubtype =
  | "watcher_scan" | "record_created" | "record_updated" | "status_changed"
  | "field_changed" | "relation_added" | "relation_removed" | "relative_date"
  | "inactivity" | "missing_event" | "threshold_crossed" | "external_input" | "manual";

export type TriggerSpec = {
  type: TriggerType;
  subtype: ScheduleSubtype | EventSubtype;
  /** type=schedule : planning heure fixe (compatible AgentSchedule legacy). */
  schedule?: AgentSchedule;
  /** type=event : cadence de scan (min). */
  scanEveryMinutes?: number;
  // Champs des sous-types AVANCÉS (Phase 7) — optionnels, jamais peuplés par la compat.
  relative?: {
    entityType: string; dateField: string; offsetValue: number;
    offsetUnit: "minutes" | "hours" | "days" | "weeks" | "months"; direction: "before" | "after";
  };
  statusChange?: { entityType: string; field: string; from?: string; to?: string };
  fieldChange?: { entityType: string; field: string };
  inactivity?: { entityType: string; sinceField?: string; days: number };
  threshold?: { metric: string; operator: ConditionOperator; value: number };
};

// ── Périmètre (restreint le veilleur / la cible à un sous-ensemble) ──────────
export type ScopeSpec = { entity: string; filters: AgentCondition[] };

// ── Veilleur (event watcher_scan) ────────────────────────────────────────────
export type WatcherSpec = { key: WatcherKey | string; params: Record<string, unknown> };

// ── Destinataires relationnels ───────────────────────────────────────────────
export type RecipientResolverType =
  | "workspace_owner" | "specific_user" | "specific_employee" | "workspace_team"
  | "role" | "related_client" | "related_supplier" | "related_subcontractor"
  | "related_chantier_manager" | "related_task_assignee" | "related_intervention_employee"
  | "related_opportunity_owner" | "related_site_contact" | "record_creator"
  | "approval_owner" | "custom_email" | "system_destination"
  // Compat legacy (les 5 kinds actuels restent des valeurs valides) :
  | "me" | "team" | "client" | "employee" | "supplier";

export type RecipientResolver = {
  type: RecipientResolverType;
  id?: string;
  role?: string;
  /** Chemin relationnel (ex : "chantier.chef_chantier_id") pour la résolution par-fiche. */
  relationPath?: string;
  customEmail?: string;
  /** Renseignés quand le destinataire est DÉJÀ résolu et figé (compat recipients legacy). */
  name?: string;
  email?: string;
  fallback?: RecipientResolver;
};

// ── Actions (séquence ordonnée d'opérations) ─────────────────────────────────
export type ActionApproval = { required: boolean; approver?: RecipientResolver; reason?: string };

export type ActionStep = {
  id: string;
  /** Opération du registre (Phase 6) ; pour une règle legacy = l'action.type mappée. */
  operation: string;
  params: Record<string, unknown>;
  approval?: ActionApproval;
  condition?: ConditionGroup;
  onFailure?: "stop" | "continue" | "notify_owner" | "create_followup_task";
  /** Rend le résultat réutilisable par une étape suivante (ex : {{createdChantier.id}}). */
  outputKey?: string;
};

// ── Politiques ───────────────────────────────────────────────────────────────
export type ApprovalPolicy = { mode: "auto" | "always" | "sensitive_only" };

export type EscalationStep = {
  after?: { value: number; unit: "minutes" | "hours" | "days" };
  condition?: ConditionGroup;
  actions: ActionStep[];
};

export type RetryPolicy = {
  maxAttempts: number;
  backoffMinutes: number;
  retryOn?: ("api_error" | "channel_error" | "any")[];
};

export type ExecutionPolicy = {
  onFailure: "stop" | "continue";
  maxActions: number;
  maxDestructiveWrites: number;
  allowDelete: boolean;
};

// ── Le modèle FIGÉ ───────────────────────────────────────────────────────────
export type AgentRuleV2 = {
  version: typeof AGENT_SPEC_VERSION;
  trigger: TriggerSpec;
  scope?: ScopeSpec;
  watcher?: WatcherSpec;
  conditions?: ConditionGroup;
  actions: ActionStep[];
  recipients: RecipientResolver[];
  approval: ApprovalPolicy;
  escalation: EscalationStep[];
  retry: RetryPolicy;
  execution: ExecutionPolicy;
  metadata: Record<string, unknown>;
};

// ── Défauts sûrs (bornes de sécurité alignées sur l'exécuteur act actuel) ────
export const DEFAULT_RETRY: RetryPolicy = { maxAttempts: 1, backoffMinutes: 30, retryOn: ["api_error"] };
export const DEFAULT_EXECUTION: ExecutionPolicy = {
  onFailure: "stop",
  maxActions: 8,
  maxDestructiveWrites: 12,
  allowDelete: false,
};
export const DEFAULT_APPROVAL: ApprovalPolicy = { mode: "auto" };

// ─────────────────────────────────────────────────────────────────────────────
// COMPAT : lire N'IMPORTE QUELLE règle (legacy ou v2) comme un AgentRuleV2.
// ─────────────────────────────────────────────────────────────────────────────

/** Forme legacy minimale d'une ligne agent_rules (colonnes actuelles). */
export type LegacyRuleRow = {
  trigger_type?: string | null;
  schedule?: unknown;
  action?: unknown;
  trigger?: unknown;
};

/** action.type legacy → nom d'opération du futur registre (Phase 6). */
const OP_FROM_ACTION: Record<AgentActionType, string> = {
  send_email: "send_email",
  notify: "send_notification",
  report: "generate_report",
  team_planning: "send_team_planning",
  compte_rendu: "generate_report",
  act: "act",
};

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

/** Sous-type de planning déduit d'un AgentSchedule legacy (jours vides = quotidien). */
function scheduleSubtype(schedule: Record<string, unknown>): ScheduleSubtype {
  const days = Array.isArray(schedule.days) ? (schedule.days as unknown[]) : [];
  return days.length === 0 || days.length === 7 ? "daily" : "weekly";
}

/** Destinataires legacy → resolvers. Recipients figés → resolvers résolus ; sinon le kind. */
function recipientsFromLegacy(action: Record<string, unknown>): RecipientResolver[] {
  const kind = action.recipientKind as AgentRecipientKind | undefined;
  const resolved = Array.isArray(action.recipients) ? (action.recipients as Record<string, unknown>[]) : [];
  if (resolved.length > 0) {
    return resolved.map((r) => ({
      type: (kind ?? "custom_email") as RecipientResolverType,
      id: typeof r.id === "string" ? r.id : undefined,
      name: typeof r.name === "string" ? r.name : undefined,
      email: typeof r.email === "string" ? r.email : undefined,
    }));
  }
  // Event : destinataire résolu par-fiche à l'exécution → on garde juste le kind.
  return kind ? [{ type: kind as RecipientResolverType }] : [];
}

/** Reconstruit le modèle V2 à partir des colonnes legacy (fidèle, sans perte). */
export function liftLegacyToV2(row: LegacyRuleRow): AgentRuleV2 {
  const action = asRecord(row.action);
  const schedule = asRecord(row.schedule);
  const trig = asRecord(row.trigger);
  const isEvent = row.trigger_type === "event";
  const actionType = (typeof action.type === "string" ? action.type : "notify") as AgentActionType;

  const trigger: TriggerSpec = isEvent
    ? { type: "event", subtype: "watcher_scan", scanEveryMinutes: Number(trig.scanEveryMinutes) || 60 }
    : { type: "schedule", subtype: scheduleSubtype(schedule), schedule: schedule as unknown as AgentSchedule };

  const watcher: WatcherSpec | undefined = isEvent
    ? { key: String(trig.watcher ?? ""), params: { days: Number(asRecord(trig.params).days) || 0 } }
    : undefined;

  const step: ActionStep = {
    id: "a1",
    operation: OP_FROM_ACTION[actionType] ?? "send_notification",
    params: {
      contentInstruction: typeof action.contentInstruction === "string" ? action.contentInstruction : "",
      dataFocus: typeof action.dataFocus === "string" ? action.dataFocus : "",
    },
    onFailure: "stop",
  };

  const approvalMode: ApprovalPolicy["mode"] = action.approval === "always" ? "always" : "auto";

  return {
    version: AGENT_SPEC_VERSION,
    trigger,
    watcher,
    actions: [step],
    recipients: recipientsFromLegacy(action),
    approval: { mode: approvalMode },
    escalation: [],
    retry: { ...DEFAULT_RETRY },
    execution: { ...DEFAULT_EXECUTION },
    metadata: {
      liftedFromLegacy: true,
      legacyActionType: actionType,
      complexity: action.complexity,
      model: action.model,
      estimatedCreditsPerRun: action.estimatedCreditsPerRun,
    },
  };
}

/** Garantit que tous les champs requis d'un spec v2 stocké sont présents. */
function withDefaults(spec: AgentRuleV2): AgentRuleV2 {
  return {
    version: AGENT_SPEC_VERSION,
    trigger: spec.trigger,
    scope: spec.scope,
    watcher: spec.watcher,
    conditions: spec.conditions,
    actions: Array.isArray(spec.actions) ? spec.actions : [],
    recipients: Array.isArray(spec.recipients) ? spec.recipients : [],
    approval: spec.approval ?? { ...DEFAULT_APPROVAL },
    escalation: Array.isArray(spec.escalation) ? spec.escalation : [],
    retry: spec.retry ?? { ...DEFAULT_RETRY },
    execution: spec.execution ?? { ...DEFAULT_EXECUTION },
    metadata: spec.metadata && typeof spec.metadata === "object" ? spec.metadata : {},
  };
}

/**
 * Lit N'IMPORTE QUELLE règle sous la forme unifiée AgentRuleV2 :
 *   • si `spec.version === 2` (règle native v2, Phase 2+) → on l'utilise ;
 *   • sinon (règle legacy) → on relève les colonnes existantes.
 * C'est LE pont de compatibilité : tout le code aval pourra ne connaître que v2.
 */
export function normalizeRule(row: LegacyRuleRow & { spec?: unknown }): AgentRuleV2 {
  const spec = row.spec as Partial<AgentRuleV2> | undefined;
  if (spec && spec.version === AGENT_SPEC_VERSION && Array.isArray(spec.actions)) {
    return withDefaults(spec as AgentRuleV2);
  }
  return liftLegacyToV2(row);
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 2a.2 — construire un spec ENRICHI depuis la sortie du parseur.
// Le legacy reste la base (fidélité) ; on n'écrase `actions`/`conditions` QUE si
// le parseur a réellement produit du multi-étapes / des conditions chiffrées.
// ─────────────────────────────────────────────────────────────────────────────

/** Étape d'action telle qu'émise par le parseur (avant mapping en ActionStep). */
export type ParsedActionStep = { operation: string; instruction: string };
/** Enrichissements optionnels issus du parseur V2 (multi-actions, conditions, destinataires relationnels, déclencheur avancé). */
export type RichParse = {
  actions?: ParsedActionStep[];
  conditions?: ConditionGroup;
  recipients?: RecipientResolver[];
  /** Déclencheur non représentable par les colonnes legacy (ex : relative_date) → prime sur le trigger relevé. */
  trigger?: TriggerSpec;
};

/** Types de destinataires que le parseur peut émettre (relationnels, résolus à l'exécution). */
const RELATIONAL_RESOLVER_TYPES: RecipientResolverType[] = [
  "workspace_owner", "workspace_team", "related_client", "related_supplier", "related_subcontractor",
  "related_chantier_manager", "related_task_assignee", "related_intervention_employee", "record_creator",
];

/**
 * Valide DÉFENSIVEMENT une liste de types de destinataires (sortie LLM) en
 * resolvers. Whiteliste, déduplique, et ajoute un REPLI `workspace_owner` aux
 * types relationnels (le patron reçoit si la relation n'a pas de canal). Ne throw jamais.
 */
export function coerceRecipientTargets(input: unknown): RecipientResolver[] {
  const arr = Array.isArray(input) ? input : [];
  const out: RecipientResolver[] = [];
  const seen = new Set<string>();
  for (const item of arr) {
    const type = typeof item === "string"
      ? item
      : item && typeof item === "object"
        ? String((item as Record<string, unknown>).type ?? "")
        : "";
    if (!RELATIONAL_RESOLVER_TYPES.includes(type as RecipientResolverType) || seen.has(type)) continue;
    seen.add(type);
    const r: RecipientResolver = { type: type as RecipientResolverType };
    if (type !== "workspace_owner" && type !== "workspace_team") r.fallback = { type: "workspace_owner" };
    out.push(r);
  }
  return out;
}

const CONDITION_OPERATORS: ConditionOperator[] = [
  "eq", "neq", "gt", "gte", "lt", "lte", "contains", "not_contains", "is_empty",
  "is_not_empty", "in", "not_in", "before", "after", "days_since_gt", "days_until_lt",
  "relation_exists", "relation_missing",
];

function coerceLeaf(o: Record<string, unknown>): AgentCondition | undefined {
  const field = typeof o.field === "string" ? o.field.trim() : "";
  const operator = CONDITION_OPERATORS.includes(o.operator as ConditionOperator)
    ? (o.operator as ConditionOperator)
    : undefined;
  if (!field || !operator) return undefined;
  return { field, operator, value: o.value };
}

function coerceNode(input: unknown): AgentCondition | ConditionGroup | undefined {
  const o = input && typeof input === "object" ? (input as Record<string, unknown>) : null;
  if (!o) return undefined;
  if (o.type === "all" || o.type === "any" || o.type === "not") return coerceConditionGroup(o);
  return coerceLeaf(o);
}

/**
 * Valide/normalise DÉFENSIVEMENT une sortie LLM de conditions en ConditionGroup
 * (ou undefined si vide/invalide). Ne throw jamais. Récursif (groupes imbriqués).
 */
export function coerceConditionGroup(input: unknown): ConditionGroup | undefined {
  const o = input && typeof input === "object" ? (input as Record<string, unknown>) : null;
  if (!o) return undefined;
  if (o.type === "not") {
    const c = coerceNode(o.condition);
    return c ? { type: "not", condition: c } : undefined;
  }
  const type: "all" | "any" = o.type === "any" ? "any" : "all";
  const raw = Array.isArray(o.conditions) ? o.conditions : [];
  const conditions = raw.map(coerceNode).filter((c): c is AgentCondition | ConditionGroup => !!c);
  return conditions.length ? { type, conditions } : undefined;
}

/**
 * Spec canonique d'une règle : base = élévation legacy ; on ENRICHIT avec la
 * séquence multi-actions (si >1 étape) et les conditions du parseur. Pur, testable.
 */
export function buildSpec(legacy: LegacyRuleRow, rich?: RichParse): AgentRuleV2 {
  const spec = liftLegacyToV2(legacy);
  if (rich?.actions && rich.actions.length > 1) {
    spec.actions = rich.actions.slice(0, DEFAULT_EXECUTION.maxActions).map((a, idx) => ({
      id: `a${idx + 1}`,
      operation: String(a.operation || "send_notification").slice(0, 60),
      params: { instruction: String(a.instruction || "").slice(0, 300) },
      onFailure: "stop" as const,
    }));
  }
  if (rich?.conditions) spec.conditions = rich.conditions;
  // Destinataires relationnels du parseur → priment sur ceux relevés du legacy (kind).
  if (rich?.recipients && rich.recipients.length) spec.recipients = rich.recipients;
  // Déclencheur avancé (relative_date…) : les colonnes legacy ne savent pas l'exprimer,
  // donc le parseur le fournit ici et il PRIME sur le trigger relevé du legacy. Un
  // déclencheur générique sur date n'a pas de veilleur nommé → on efface le watcher relevé.
  if (rich?.trigger) {
    spec.trigger = rich.trigger;
    if (rich.trigger.subtype === "relative_date") spec.watcher = undefined;
  }
  return spec;
}
