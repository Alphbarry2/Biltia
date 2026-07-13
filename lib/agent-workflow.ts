// ─────────────────────────────────────────────────────────────────────────────
// AGENT WORKFLOW — moteur d'exécution V2 (Phase 2a.3), PARTIE PURE.
//
// Évalue les CONDITIONS d'une règle V2, INTERPOLE les paramètres d'une étape à
// partir des sorties des étapes précédentes ({{cle.champ}}), et CLASSE chaque
// opération par sensibilité (auto | validation | interdit) via un registre. Ces
// fonctions ne touchent NI la base NI le réseau : elles sont pures et testables.
//
// L'orchestration réelle (verrou, journal, notif, garde-fous) vit dans
// lib/agent-executor.ts (executeV2Rule), derrière une garde stricte + kill-switch.
// L'IMPLÉMENTATION des nouvelles opérations (create_chantier, create_invoice…)
// est la Phase 6 : ici on se contente de les CLASSER et de les PLANIFIER — jamais
// d'écriture arbitraire. Une opération inconnue tombe par défaut en « validation »
// (jamais auto), et rien de « interdit » ne s'exécute automatiquement.
// ─────────────────────────────────────────────────────────────────────────────

import type { AgentCondition, ConditionGroup, ActionStep, AgentRuleV2 } from "./agent-model";

// ── Conditions ───────────────────────────────────────────────────────────────

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}
function toTime(v: unknown): number {
  const t = Date.parse(String(v ?? ""));
  return Number.isNaN(t) ? NaN : t;
}
const DAY = 86_400_000;

function evalLeaf(c: AgentCondition, record: Record<string, unknown>): boolean {
  const raw = record[c.field];
  switch (c.operator) {
    case "eq": return String(raw ?? "") === String(c.value ?? "");
    case "neq": return String(raw ?? "") !== String(c.value ?? "");
    case "gt": { const a = toNum(raw), b = toNum(c.value); return !Number.isNaN(a) && !Number.isNaN(b) && a > b; }
    case "gte": { const a = toNum(raw), b = toNum(c.value); return !Number.isNaN(a) && !Number.isNaN(b) && a >= b; }
    case "lt": { const a = toNum(raw), b = toNum(c.value); return !Number.isNaN(a) && !Number.isNaN(b) && a < b; }
    case "lte": { const a = toNum(raw), b = toNum(c.value); return !Number.isNaN(a) && !Number.isNaN(b) && a <= b; }
    case "contains": return String(raw ?? "").toLowerCase().includes(String(c.value ?? "").toLowerCase());
    case "not_contains": return !String(raw ?? "").toLowerCase().includes(String(c.value ?? "").toLowerCase());
    case "is_empty": return raw == null || raw === "";
    case "is_not_empty": return !(raw == null || raw === "");
    case "in": {
      const set = Array.isArray(c.value) ? c.value.map(String) : String(c.value ?? "").split(",").map((s) => s.trim());
      return set.includes(String(raw));
    }
    case "not_in": {
      const set = Array.isArray(c.value) ? c.value.map(String) : String(c.value ?? "").split(",").map((s) => s.trim());
      return !set.includes(String(raw));
    }
    case "before": { const a = toTime(raw), b = toTime(c.value); return !Number.isNaN(a) && !Number.isNaN(b) && a < b; }
    case "after": { const a = toTime(raw), b = toTime(c.value); return !Number.isNaN(a) && !Number.isNaN(b) && a > b; }
    case "days_since_gt": { const a = toTime(raw); const n = toNum(c.value); return !Number.isNaN(a) && !Number.isNaN(n) && (Date.now() - a) / DAY > n; }
    case "days_until_lt": { const a = toTime(raw); const n = toNum(c.value); return !Number.isNaN(a) && !Number.isNaN(n) && (a - Date.now()) / DAY < n; }
    case "relation_exists": return raw != null && raw !== "" && raw !== false;
    case "relation_missing": return raw == null || raw === "" || raw === false;
    default: return false;
  }
}

function isGroup(node: AgentCondition | ConditionGroup): node is ConditionGroup {
  return typeof (node as ConditionGroup).type === "string" &&
    ((node as ConditionGroup).type === "all" || (node as ConditionGroup).type === "any" || (node as ConditionGroup).type === "not");
}

/**
 * Vraie si `record` satisfait le groupe (all/any/not, récursif). Un groupe absent
 * = vrai (pas de filtre). Ne throw jamais ; une comparaison ininterprétable = faux.
 */
export function evaluateConditions(group: ConditionGroup | undefined, record: Record<string, unknown>): boolean {
  if (!group) return true;
  if (group.type === "not") return !(isGroup(group.condition) ? evaluateConditions(group.condition, record) : evalLeaf(group.condition, record));
  const evalNode = (n: AgentCondition | ConditionGroup) => (isGroup(n) ? evaluateConditions(n, record) : evalLeaf(n, record));
  const rs = group.conditions.map(evalNode);
  return group.type === "all" ? rs.every(Boolean) : rs.some(Boolean);
}

// ── Interpolation {{cle}} / {{cle.champ}} ───────────────────────────────────

function getPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined), obj);
}

/** Remplace {{cle}} / {{cle.champ}} dans les valeurs STRING des params par les sorties accumulées. */
export function interpolateParams(params: Record<string, unknown>, outputs: Record<string, unknown>): Record<string, unknown> {
  const resolveStr = (s: string) => s.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, p) => { const v = getPath(outputs, p); return v == null ? "" : String(v); });
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    out[k] = typeof v === "string" ? resolveStr(v) : v;
  }
  return out;
}

// ── Registre d'opérations : politique de sensibilité (§9/§11) ───────────────

export type OpSensitivity = "auto" | "approval" | "forbidden";

/**
 * Politique par opération. `auto` = interne/sans effet externe → exécutable seul.
 * `approval` = communication externe / document / création engageante → validation
 * humaine (outbox) obligatoire. `forbidden` = jamais en automatique (suppression,
 * paiement…). Une opération ABSENTE du registre tombe par défaut en `approval`
 * (jamais auto) — on ne fait jamais tourner en silence une opération inconnue.
 */
export const OPERATION_REGISTRY: Record<string, { sensitivity: OpSensitivity; label: string }> = {
  // — auto (sûr) —
  send_notification: { sensitivity: "auto", label: "Notification interne" },
  create_task: { sensitivity: "auto", label: "Créer une tâche interne" },
  create_reminder: { sensitivity: "auto", label: "Créer un rappel" },
  create_note: { sensitivity: "auto", label: "Créer une note" },
  generate_report: { sensitivity: "auto", label: "Générer un rapport" },
  classify_document: { sensitivity: "auto", label: "Classer un document" },
  link_entities: { sensitivity: "auto", label: "Relier des fiches" },
  set_priority: { sensitivity: "auto", label: "Définir une priorité" },
  // — validation requise —
  send_email: { sensitivity: "approval", label: "Envoyer un email" },
  send_sms: { sensitivity: "approval", label: "Envoyer un SMS" },
  create_email_draft: { sensitivity: "approval", label: "Préparer un email" },
  create_quote: { sensitivity: "approval", label: "Créer un devis" },
  create_invoice: { sensitivity: "approval", label: "Créer une facture" },
  create_deposit_invoice: { sensitivity: "approval", label: "Créer une facture d'acompte" },
  create_chantier: { sensitivity: "approval", label: "Créer un chantier" },
  create_purchase_order: { sensitivity: "approval", label: "Créer une commande fournisseur" },
  convert_quote_to_chantier: { sensitivity: "approval", label: "Devis → chantier" },
  convert_quote_to_deposit_invoice: { sensitivity: "approval", label: "Devis → facture d'acompte" },
  convert_chantier_to_invoice: { sensitivity: "approval", label: "Chantier → facture" },
  update_status: { sensitivity: "approval", label: "Changer un statut" },
  close_chantier: { sensitivity: "approval", label: "Clôturer un chantier" },
  assign_employee: { sensitivity: "approval", label: "Affecter un intervenant" },
  create_tasks: { sensitivity: "approval", label: "Créer des tâches" },
  // — interdit en automatique —
  delete_record: { sensitivity: "forbidden", label: "Suppression" },
  record_payment: { sensitivity: "forbidden", label: "Enregistrer un paiement" },
  archive_record: { sensitivity: "forbidden", label: "Archiver" },
};

export function classifyOperation(op: string): { sensitivity: OpSensitivity; known: boolean; label: string } {
  const e = OPERATION_REGISTRY[op];
  if (e) return { sensitivity: e.sensitivity, known: true, label: e.label };
  return { sensitivity: "approval", known: false, label: op }; // inconnu → validation (jamais auto)
}

// ── Planification d'un workflow ──────────────────────────────────────────────

export type PlannedStep = {
  id: string;
  operation: string;
  label: string;
  sensitivity: OpSensitivity;
  known: boolean;
  /** condition d'étape satisfaite (true si pas de condition). */
  gatePassed: boolean;
  params: Record<string, unknown>;
};

/**
 * Établit le plan d'exécution d'une règle V2 pour un enregistrement déclencheur
 * (record) : conditions globales remplies ? puis, pour chaque étape, sa
 * sensibilité et si sa condition propre passe. NE fait rien d'autre (pas d'écriture).
 */
export function planWorkflow(spec: AgentRuleV2, record: Record<string, unknown>): { conditionsMet: boolean; steps: PlannedStep[] } {
  const conditionsMet = evaluateConditions(spec.conditions, record);
  const steps: PlannedStep[] = (spec.actions ?? []).map((a: ActionStep) => {
    const cls = classifyOperation(a.operation);
    return {
      id: a.id,
      operation: a.operation,
      label: cls.label,
      sensitivity: cls.sensitivity,
      known: cls.known,
      gatePassed: a.condition ? evaluateConditions(a.condition, record) : true,
      params: a.params ?? {},
    };
  });
  return { conditionsMet, steps };
}

/** Une règle V2 mérite-t-elle le runner V2 ? (spec natif ET séquence OU conditions.) */
export function isRichV2(spec: { version?: unknown; actions?: unknown; conditions?: unknown } | null | undefined): boolean {
  if (!spec || spec.version !== 2) return false;
  const multi = Array.isArray(spec.actions) && spec.actions.length > 1;
  return multi || !!spec.conditions;
}

/** Clé d'idempotence par ÉTAPE (miroir de agent_event_fires, granularité étape). */
export function stepFireKey(baseFireKey: string, stepId: string): string {
  return `${baseFireKey}:step:${stepId}`;
}
