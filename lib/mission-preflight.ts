// ─────────────────────────────────────────────────────────────────────────────
// PRÉ-VOL LÉGER — une CHECKLIST de résultats attendus, PAS un plan persistant.
//
// Le classifieur (lib/kind-router.ts) produit déjà un `kind`. On étend SA sortie
// (même appel LLM) avec : goal, intents[], expectedOutputs[], toolGroups[],
// complexity. La boucle agentique reçoit alors une checklist : elle ne peut plus
// « oublier » silencieusement un volet (ex. « prévenir l'équipe ») ni sur-explorer.
//
// Suivi DÉTERMINISTE : chaque intention est reliée aux actions RÉELLES (proposées /
// vérifiées), jamais au seul texte libre du modèle. Aucune table, aucune
// persistance : la structure vit dans l'exécution courante.
//
// Module PUR (aucun import de valeur locale) → testable par `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

export type PreflightIntent =
  | "retrieve"
  | "update_chantier"
  | "update_related_tasks"
  | "create_object"
  | "prepare_communication"
  | "send_communication"
  | "generate_document"
  | "create_application"
  | "create_automation"
  | "monitor"
  | "other";

export type PreflightToolGroup =
  | "workspace_read"
  | "workspace_write"
  | "company_profile"
  | "communication"
  | "documents"
  | "applications"
  | "automation";

export type PreflightComplexity = "simple" | "multi_step" | "complex";

export interface LightAgentPreflight {
  kind: string;
  goal: string;
  intents: PreflightIntent[];
  expectedOutputs: string[];
  toolGroups: PreflightToolGroup[];
  complexity: PreflightComplexity;
  confidence: number;
}

export type OutcomeStatus = "pending" | "proposed" | "verified" | "partial" | "blocked" | "failed";

export interface MissionOutcome {
  id: string;
  label: string;
  intent: PreflightIntent;
  status: OutcomeStatus;
  evidence?: string[];
}

export const PREFLIGHT_INTENTS: PreflightIntent[] = [
  "retrieve", "update_chantier", "update_related_tasks", "create_object",
  "prepare_communication", "send_communication", "generate_document",
  "create_application", "create_automation", "monitor", "other",
];
export const PREFLIGHT_TOOL_GROUPS: PreflightToolGroup[] = [
  "workspace_read", "workspace_write", "company_profile", "communication", "documents", "applications", "automation",
];
const COMPLEXITIES: PreflightComplexity[] = ["simple", "multi_step", "complex"];

const INTENT_LABEL: Record<PreflightIntent, string> = {
  retrieve: "Information retrouvée",
  update_chantier: "Chantier modifié",
  update_related_tasks: "Tâches associées modifiées",
  create_object: "Objet métier créé",
  prepare_communication: "Communications préparées",
  send_communication: "Communications envoyées",
  generate_document: "Document généré",
  create_application: "Application créée",
  create_automation: "Automatisation créée",
  monitor: "Surveillance mise en place",
  other: "Demande traitée",
};

// Groupe d'outils « naturel » d'une intention (pour compléter toolGroups si absent).
const INTENT_GROUP: Record<PreflightIntent, PreflightToolGroup | null> = {
  retrieve: "workspace_read",
  update_chantier: "workspace_write",
  update_related_tasks: "workspace_write",
  create_object: "workspace_write",
  prepare_communication: "communication",
  send_communication: "communication",
  generate_document: "documents",
  create_application: "applications",
  create_automation: "automation",
  monitor: "automation",
  other: null,
};

// Action observée : outil + entité workspace éventuelle.
export type ObservedAction = { tool: string; entity?: string };

// Une intention est-elle SATISFAITE par une action ? (matcher déterministe.)
const WRITE_TOOLS = new Set(["workspace_update", "workspace_create", "workspace_transform"]);
const READ_TOOLS = new Set(["workspace_search", "workspace_list", "workspace_get", "company_profile_get", "app_collections", "app_data_list"]);
const COMM_TOOLS = new Set(["send_email", "send_sms"]);

const INTENT_MATCHER: Partial<Record<PreflightIntent, (a: ObservedAction) => boolean>> = {
  retrieve: (a) => READ_TOOLS.has(a.tool),
  update_chantier: (a) => (WRITE_TOOLS.has(a.tool) || a.tool === "create_avenant") && (a.entity === "chantiers" || a.entity === "lots"),
  update_related_tasks: (a) => WRITE_TOOLS.has(a.tool) && (a.entity === "tasks" || a.entity === "interventions"),
  create_object: (a) => a.tool === "workspace_create" || a.tool === "create_avenant" || a.tool === "workspace_transform",
  prepare_communication: (a) => COMM_TOOLS.has(a.tool),
  send_communication: (a) => COMM_TOOLS.has(a.tool),
};

/** Intentions RÉELLEMENT adressables par la boucle (les autres relèvent d'une autre
 *  branche : document/app/automation) → seules celles-ci bloquent la fin de mission. */
export function isLoopIntent(intent: PreflightIntent): boolean {
  return !!INTENT_MATCHER[intent];
}

// ── Normalisation & fallback ─────────────────────────────────────────────────

function asStr(v: unknown, max = 300): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
function asStrArray(v: unknown, max = 12): string[] {
  return Array.isArray(v) ? v.map((x) => asStr(x, 200)).filter(Boolean).slice(0, max) : [];
}

export function fallbackPreflight(kind: string, prompt: string): LightAgentPreflight {
  return {
    kind,
    goal: asStr(prompt, 200) || "Répondre à la demande",
    intents: ["other"],
    expectedOutputs: ["répondre correctement à la demande"],
    toolGroups: [],
    complexity: "simple",
    confidence: 0,
  };
}

function deriveComplexity(intents: PreflightIntent[]): PreflightComplexity {
  const loop = intents.filter(isLoopIntent);
  if (loop.length <= 1) return "simple";
  if (loop.length <= 3) return "multi_step";
  return "complex";
}

/**
 * Valide/normalise la sortie brute du classifieur. Entrée invalide / vide →
 * fallback minimal (§9 : on n'invente pas une checklist trop spécifique).
 */
export function normalizePreflight(raw: unknown, kind: string, prompt: string): LightAgentPreflight {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const intents = (Array.isArray(o.intents) ? o.intents : [])
    .map((x) => asStr(x, 40))
    .filter((x): x is PreflightIntent => (PREFLIGHT_INTENTS as string[]).includes(x));
  if (!intents.length) return fallbackPreflight(kind, prompt);

  const uniqIntents = Array.from(new Set(intents));
  let toolGroups = (Array.isArray(o.tool_groups) ? o.tool_groups : [])
    .map((x) => asStr(x, 40))
    .filter((x): x is PreflightToolGroup => (PREFLIGHT_TOOL_GROUPS as string[]).includes(x));
  if (!toolGroups.length) {
    toolGroups = Array.from(new Set(uniqIntents.map((i) => INTENT_GROUP[i]).filter((g): g is PreflightToolGroup => !!g)));
  }

  const complexityRaw = asStr(o.complexity, 20) as PreflightComplexity;
  const complexity = COMPLEXITIES.includes(complexityRaw) ? complexityRaw : deriveComplexity(uniqIntents);

  const expectedOutputs = asStrArray(o.expected_outputs);
  const confidence = typeof o.confidence === "number" ? o.confidence : 0.7;

  return {
    kind,
    goal: asStr(o.goal, 200) || asStr(prompt, 200) || "Traiter la demande",
    intents: uniqIntents,
    expectedOutputs: expectedOutputs.length ? expectedOutputs : uniqIntents.filter(isLoopIntent).map((i) => INTENT_LABEL[i]),
    toolGroups,
    complexity,
    confidence,
  };
}

// ── Checklist / outcomes ─────────────────────────────────────────────────────

/** Construit la checklist initiale (une entrée par intention ADRESSABLE, pending). */
export function buildOutcomes(pf: LightAgentPreflight): MissionOutcome[] {
  const loopIntents = pf.intents.filter(isLoopIntent);
  return loopIntents.map((intent, i) => ({
    id: `${intent}#${i}`,
    label: pf.expectedOutputs[i] || INTENT_LABEL[intent],
    intent,
    status: "pending" as OutcomeStatus,
  }));
}

export type OutcomeEvidence = {
  proposed?: ObservedAction[];
  verifications?: { toolName: string; entity?: string; status: "verified" | "mismatch" | "not_verifiable" | "failed" }[];
};

/**
 * Recalcule le statut de chaque résultat attendu à partir des actions RÉELLES.
 * Priorité : verified/accepté(not_verifiable) > partial(mismatch) > failed >
 * proposed > pending.
 */
export function evaluateOutcomes(pf: LightAgentPreflight, ev: OutcomeEvidence): MissionOutcome[] {
  const proposed = ev.proposed ?? [];
  const verifs = ev.verifications ?? [];
  return buildOutcomes(pf).map((o) => {
    const match = INTENT_MATCHER[o.intent]!;
    const vs = verifs.filter((v) => match({ tool: v.toolName, entity: v.entity }));
    const evidence: string[] = [];
    let status: OutcomeStatus = "pending";
    if (vs.some((v) => v.status === "verified" || v.status === "not_verifiable")) status = "verified";
    else if (vs.some((v) => v.status === "mismatch")) status = "partial";
    else if (vs.some((v) => v.status === "failed")) status = "failed";
    else if (proposed.some((p) => match(p))) status = "proposed";
    for (const v of vs) evidence.push(`${v.toolName}:${v.status}`);
    for (const p of proposed) if (match(p)) evidence.push(`proposé:${p.tool}${p.entity ? `(${p.entity})` : ""}`);
    return { ...o, status, evidence: evidence.length ? evidence : undefined };
  });
}

/** Résultats encore `pending` (bloquent la fin de mission). */
export function pendingOutcomes(outcomes: MissionOutcome[]): MissionOutcome[] {
  return outcomes.filter((o) => o.status === "pending");
}

/** Toutes les intentions adressables sont-elles traitées (≠ pending) ? */
export function missionComplete(outcomes: MissionOutcome[]): boolean {
  return outcomes.every((o) => o.status !== "pending");
}

// ── Prompt (checklist) + compte rendu déterministe ───────────────────────────

/** Bloc système transmis à la boucle : objectif + checklist + règle de fin. */
export function checklistPromptBlock(pf: LightAgentPreflight): string {
  const outcomes = buildOutcomes(pf);
  if (!outcomes.length) return ""; // aucune intention adressable → pas de checklist
  const lines = outcomes.map((o) => `□ ${o.label}`).join("\n");
  const groups = pf.toolGroups.length ? pf.toolGroups.join(", ") : "les outils utiles";
  return `# MISSION — RÉSULTATS ATTENDUS (ne conclus pas avant de les avoir TOUS traités)
Objectif : ${pf.goal}
Résultats attendus :
${lines}

RÈGLE DE FIN : ne termine PAS la mission tant que CHAQUE résultat ci-dessus n'est pas soit ACCOMPLI, soit PROPOSÉ à confirmation, soit IMPOSSIBLE (avec une raison claire), soit explicitement signalé comme PARTIEL. Ne conclus jamais parce que tu as fait le premier volet.
OUTILS : utilise uniquement les outils utiles (${groups}). N'explore pas au hasard ; n'appelle pas d'outil hors sujet.`;
}

/** Compte rendu déterministe de la checklist (honnêteté si un volet reste à faire). */
export function buildChecklistReport(outcomes: MissionOutcome[]): string {
  if (!outcomes.length) return "";
  const mark = (o: MissionOutcome) => {
    if (o.status === "verified" || o.status === "proposed") return `✓ ${o.label}`;
    if (o.status === "partial") return `⚠ ${o.label} — partiel`;
    if (o.status === "failed" || o.status === "blocked") return `✕ ${o.label}`;
    return `⚠ ${o.label} — non encore traité`;
  };
  const header = missionComplete(outcomes) ? "Checklist de mission :" : "La mission n'est pas entièrement préparée.";
  return `${header}\n${outcomes.map(mark).join("\n")}`;
}

// ── Budget dynamique + gating des outils ─────────────────────────────────────

const BUDGET: Record<PreflightComplexity, number> = { simple: 6, multi_step: 8, complex: 10 };
const HARD_CAP = 10;

/** Budget d'itérations selon la complexité (plafond dur). Calculé côté CODE. */
export function budgetForComplexity(complexity: PreflightComplexity | undefined): number {
  const b = complexity ? BUDGET[complexity] : BUDGET.simple;
  return Math.min(b, HARD_CAP);
}

/**
 * Les outils de DONNÉES D'APPLICATION (app_collections/app_data_list) doivent-ils
 * être présentés ? Non pour une mission sans volet « applications » (évite le
 * détour app_collections observé). Pré-vol absent / toolGroups vide → autorisé
 * (jamais de barrière trop stricte : fallback permissif).
 */
export function appToolsAllowed(pf: LightAgentPreflight | null | undefined): boolean {
  if (!pf || !pf.toolGroups || !pf.toolGroups.length) return true;
  return pf.toolGroups.includes("applications");
}
