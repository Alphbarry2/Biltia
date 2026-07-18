// ─────────────────────────────────────────────────────────────────────────────
// WS-E — Observabilité des passages d'agents. Trace RÉDIGÉE de chaque étape
// (lecture ET écriture), persistée dans agent_run_steps.
//
// POLITIQUE DE RÉDACTION (stricte) — on stocke : outil, entité, CLÉS de filtre,
// compteurs, id créé, résumé court, durée. On ne stocke JAMAIS : prompts, réponses
// ou raisonnement du modèle, valeurs de lignes, contenus de champs libres, PII.
//
// La partie "draft" est PURE (testable) ; persistRunSteps est TOLÉRANT : il ne
// jette jamais et no-op si la table n'existe pas encore (migration non appliquée).
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";

export type RunStepKind = "read" | "write" | "email" | "sms" | "blocked";

export interface RunStepDraft {
  kind: RunStepKind;
  tool: string;
  entity: string | null;
  inputRedacted: Record<string, unknown>;
  resultSummary: string;
}

const WRITE_TOOLS = new Set(["workspace_create", "workspace_update", "workspace_delete", "workspace_transform"]);

export function classifyToolKind(toolName: string): RunStepKind {
  if (toolName === "send_email") return "email";
  if (toolName === "send_sms") return "sms";
  if (WRITE_TOOLS.has(toolName)) return "write";
  return "read"; // lectures + outils inconnus → défaut sûr (aucune écriture supposée)
}

/**
 * Rédige l'input d'un outil : CLÉS, entité, limites, drapeaux — jamais de valeurs.
 * Ex. un `search: "Dupont"` devient `search: true` ; un `match: { statut: "x" }`
 * devient `filterKeys: ["statut"]` ; des `values: { nom: "x" }` deviennent
 * `fields: ["nom"]`. Aucun terme de recherche ni contenu de champ ne survit.
 */
export function redactToolInput(toolName: string, input: Record<string, unknown>): Record<string, unknown> {
  const entity = typeof input.entity === "string" ? input.entity : undefined;
  const out: Record<string, unknown> = {};
  if (entity) out.entity = entity;

  switch (toolName) {
    case "workspace_list":
      if (input.match && typeof input.match === "object") out.filterKeys = Object.keys(input.match as object);
      if (typeof input.search === "string" && input.search.trim()) out.search = true;
      if (typeof input.order === "string") out.order = input.order; // nom de colonne, sûr
      if (input.limit != null) out.limit = Number(input.limit) || undefined;
      break;
    case "workspace_get":
    case "workspace_delete":
      out.byId = !!input.id; // présence, pas la valeur
      break;
    case "workspace_create":
    case "workspace_update":
      if (input.values && typeof input.values === "object") out.fields = Object.keys(input.values as object);
      if (toolName === "workspace_update") out.byId = !!input.id;
      break;
    case "workspace_transform":
      if (typeof input.action === "string") out.action = input.action; // enum de transformation, sûr
      out.byId = !!(input.id ?? input.sourceId);
      break;
    case "app_data_list":
    case "app_collections":
      if (typeof input.collection === "string") out.collection = input.collection;
      break;
    default:
      out.fields = Object.keys(input); // clés seulement, jamais les valeurs
  }
  return out;
}

/** Résumé de résultat, borné et sans valeur de ligne (l'erreur détaillée vit au niveau run). */
export function summarizeResult(result: unknown): string {
  if (!result || typeof result !== "object") return "ok";
  const r = result as Record<string, unknown>;
  if (r.error) return "erreur";
  if (typeof r.count === "number") return `${r.count} ligne(s)`;
  if (Array.isArray(r.rows)) return `${r.rows.length} ligne(s)`;
  if (r.row) return "1 fiche";
  if (r.ok && typeof r.id === "string") return `id ${r.id}`; // uuid opaque — validé « id créé »
  if (r.ok) return "ok";
  if (Array.isArray(r.collections)) return `${r.collections.length} collection(s)`;
  return "ok";
}

export function draftToolStep(toolName: string, input: Record<string, unknown>, result: unknown): RunStepDraft {
  return {
    kind: classifyToolKind(toolName),
    tool: toolName,
    entity: typeof input.entity === "string" ? input.entity : null,
    inputRedacted: redactToolInput(toolName, input),
    resultSummary: summarizeResult(result),
  };
}

export function draftBlockedStep(toolName: string, input: Record<string, unknown>): RunStepDraft {
  return {
    kind: "blocked",
    tool: toolName,
    entity: typeof input.entity === "string" ? input.entity : null,
    inputRedacted: redactToolInput(toolName, input),
    resultSummary: "bloqué (plafond de sûreté)",
  };
}

/**
 * Persiste les étapes d'un passage. TOLÉRANT : ne jette jamais et no-op si la
 * table agent_run_steps n'existe pas encore (migration 066 non appliquée). Ainsi
 * le code peut être livré/commité AVANT l'application de la migration en prod.
 */
export async function persistRunSteps(
  db: SupabaseClient,
  runId: string,
  tenantId: string,
  drafts: RunStepDraft[],
  seqOffset = 0
): Promise<void> {
  if (!drafts.length) return;
  const rows = drafts.map((d, i) => ({
    run_id: runId,
    tenant_id: tenantId,
    seq: seqOffset + i,
    kind: d.kind,
    tool: d.tool,
    entity: d.entity,
    input_redacted: d.inputRedacted,
    result_summary: d.resultSummary.slice(0, 200),
  }));
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.from as any)("agent_run_steps").insert(rows);
  } catch {
    // table absente / erreur → observabilité best-effort, jamais bloquant.
  }
}
