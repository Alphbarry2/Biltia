// ─────────────────────────────────────────────────────────────────────────────
// AGENT TOOLS — le WORKSPACE ENTIER exposé comme outils IA (« accès à tout »).
//
// Les 16 entités du registre (lib/data-entities.ts) deviennent 5 outils Claude :
// lister/chercher, lire, créer, modifier, supprimer. Utilisés par :
//   • le CHAT (kind "data") — « ajoute un client Jean Dupont », « supprime le
//     client Martin », « passe le devis D-12 en accepté » → exécuté, confirmé.
//   • l'EXÉCUTEUR d'agents (lib/agent-executor.ts) — les missions planifiées
//     lisent ET écrivent le workspace à chaque passage.
//
// Sécurité (mêmes remparts que /api/data) :
//   1. Whitelist d'entités (ALLOWED_ENTITIES) — rien d'autre n'est accessible.
//   2. Colonnes inscriptibles whitelistées — le reste est ignoré.
//   3. tenant_id FORCÉ sur chaque opération (le modèle ne le voit jamais).
//   4. Suppression UNITAIRE uniquement (jamais de bulk par l'IA).
//   5. RLS en dernier rempart quand le client est une session ; l'exécuteur
//      (service_role) reste scopé par le filtre tenant explicite.
//   6. Chaque écriture est journalisée dans activity_logs.
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";
import { ENTITIES, ALLOWED_ENTITIES } from "./data-entities";
import { logActivity } from "./activity";

// Client base minimal (session RLS ou service_role) — motif lib/activity.ts.
type MinimalClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

// ── Définition des outils ────────────────────────────────────────────────────

const ENTITY_ENUM = ALLOWED_ENTITIES;

/** Colonne de recherche texte par entité (défaut : nom). */
const SEARCH_COLUMN: Record<string, string> = {
  catalogue: "designation",
  lignes: "designation",
  tasks: "title",
  devis: "numero",
  factures: "numero",
  interventions: "type",
  parc_installe: "type",
  pointages: "date_pointage",
  documents: "nom",
};

function entityCatalog(): string {
  return ALLOWED_ENTITIES.map((k) => `- ${k} (${ENTITIES[k].label}) : ${ENTITIES[k].fields}`).join("\n");
}

export const WORKSPACE_TOOLS: Anthropic.Tool[] = [
  {
    name: "workspace_list",
    description:
      "Liste ou cherche des fiches d'une entité du workspace. `search` filtre sur le champ principal (nom/désignation/numéro). `match` filtre par égalité exacte (ex: {\"statut\":\"en_cours\"}). Retourne au plus `limit` lignes.",
    input_schema: {
      type: "object",
      properties: {
        entity: { type: "string", enum: ENTITY_ENUM, description: "Entité à interroger." },
        search: { type: "string", description: "Texte cherché sur le champ principal (optionnel)." },
        match: {
          type: "object",
          description: "Filtres d'égalité exacte colonne→valeur (optionnel).",
          additionalProperties: true,
        },
        order: { type: "string", description: "Colonne de tri (défaut created_at)." },
        limit: { type: "integer", description: "Max lignes (défaut 20, max 50)." },
      },
      required: ["entity"],
      additionalProperties: false,
    },
  },
  {
    name: "workspace_get",
    description: "Lit UNE fiche par son id.",
    input_schema: {
      type: "object",
      properties: {
        entity: { type: "string", enum: ENTITY_ENUM },
        id: { type: "string", description: "uuid de la fiche." },
      },
      required: ["entity", "id"],
      additionalProperties: false,
    },
  },
  {
    name: "workspace_create",
    description:
      "Crée une fiche. `values` = les champs de l'entité (voir le catalogue dans le prompt système). Champ optionnel inconnu/vide → omets-le (jamais de chaîne vide).",
    input_schema: {
      type: "object",
      properties: {
        entity: { type: "string", enum: ENTITY_ENUM },
        values: { type: "object", description: "Champs à écrire.", additionalProperties: true },
      },
      required: ["entity", "values"],
      additionalProperties: false,
    },
  },
  {
    name: "workspace_update",
    description: "Met à jour UNE fiche existante (par id). `values` = uniquement les champs à changer.",
    input_schema: {
      type: "object",
      properties: {
        entity: { type: "string", enum: ENTITY_ENUM },
        id: { type: "string" },
        values: { type: "object", additionalProperties: true },
      },
      required: ["entity", "id", "values"],
      additionalProperties: false,
    },
  },
  {
    name: "workspace_delete",
    description:
      "Supprime UNE fiche (par id). UNIQUEMENT après l'avoir identifiée sans ambiguïté (workspace_list d'abord). Jamais en masse.",
    input_schema: {
      type: "object",
      properties: {
        entity: { type: "string", enum: ENTITY_ENUM },
        id: { type: "string" },
      },
      required: ["entity", "id"],
      additionalProperties: false,
    },
  },
];

/** Bloc système : le catalogue des entités + les règles d'opérateur. */
export function buildWorkspaceToolsSystem(): string {
  return `# LE WORKSPACE (tu y as accès TOTAL via les outils workspace_*)

## Entités disponibles
${entityCatalog()}

## Règles d'opérateur (ABSOLUES)
1. RÉSOUDRE AVANT D'AGIR : pour modifier/supprimer, commence par workspace_list (search) pour identifier LA fiche. Tu ne devines JAMAIS un id.
2. AMBIGUÏTÉ = STOP : plusieurs fiches correspondent → tu ne modifies RIEN, tu listes les candidats dans ta réponse et tu demandes de préciser.
3. INTROUVABLE = HONNÊTETÉ : la fiche n'existe pas → tu le dis, et tu proposes de la créer si pertinent.
4. Champs : respecte STRICTEMENT les noms et enums du catalogue. Optionnel vide → omets la clé (jamais "").
5. Relations : un champ *_id se remplit avec l'uuid d'une fiche EXISTANTE (workspace_list pour le trouver). Si la fiche liée n'existe pas, crée-la d'abord.
6. Suppression : UNE fiche à la fois, identifiée sans ambiguïté.`;
}

// ── Exécution des outils ─────────────────────────────────────────────────────

/** Nettoie les valeurs : colonnes whitelistées, "" → null (motif /api/data). */
function sanitize(values: unknown, writable: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!values || typeof values !== "object") return out;
  const v = values as Record<string, unknown>;
  for (const key of writable) {
    if (!(key in v)) continue;
    let val = v[key];
    if (typeof val === "string" && val.trim() === "") val = null;
    out[key] = val;
  }
  return out;
}

/** Nom lisible d'une ligne (journal + confirmations). */
function rowName(row: Record<string, unknown> | null | undefined): string {
  if (!row) return "";
  const n = row.nom ?? row.designation ?? row.title ?? row.numero ?? row.type ?? "";
  return typeof n === "string" && n.trim() ? n.trim().slice(0, 60) : "";
}

export type ToolActor = { tenantId: string; userId?: string | null; label: string };

export type ToolTrace = { action: "create" | "update" | "delete"; description: string };

/**
 * Exécute un appel d'outil workspace_*. Tenant forcé, colonnes whitelistées.
 * Retourne un résultat JSON-sérialisable pour le tool_result (jamais de throw :
 * l'erreur est renvoyée AU MODÈLE, qui la gère dans sa réponse).
 */
export async function runWorkspaceTool(
  db: MinimalClient,
  actor: ToolActor,
  toolName: string,
  input: Record<string, unknown>,
  traces: ToolTrace[]
): Promise<Record<string, unknown>> {
  const entity = typeof input.entity === "string" ? input.entity : "";
  if (!ALLOWED_ENTITIES.includes(entity)) {
    return { error: `Entité non autorisée : ${entity}` };
  }
  const def = ENTITIES[entity];
  const { tenantId } = actor;

  const log = (action: string, description: string, entityId?: string | null) =>
    logActivity(db, {
      tenantId,
      userId: actor.userId ?? undefined,
      action,
      entityType: def.label,
      entityId,
      description: `${actor.label} — ${description}`,
    });

  try {
    if (toolName === "workspace_list") {
      const limit = Math.min(Math.max(Number(input.limit) || 20, 1), 50);
      let q = db.from(def.table).select("*").eq("tenant_id", tenantId);
      if (typeof input.search === "string" && input.search.trim()) {
        const col = SEARCH_COLUMN[entity] ?? "nom";
        q = q.ilike(col, `%${input.search.trim()}%`);
      }
      if (input.match && typeof input.match === "object") {
        for (const [k, v] of Object.entries(input.match as Record<string, unknown>)) {
          // Colonnes de filtre limitées au schéma connu (id inclus pour les jointures).
          if (k === "id" || def.writable.includes(k)) q = q.eq(k, v);
        }
      }
      q = q.order(typeof input.order === "string" ? input.order : "created_at", { ascending: false }).limit(limit);
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { count: (data ?? []).length, rows: data ?? [] };
    }

    if (toolName === "workspace_get") {
      const { data, error } = await db
        .from(def.table)
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("id", String(input.id ?? ""))
        .maybeSingle();
      if (error) return { error: error.message };
      if (!data) return { error: "Fiche introuvable." };
      return { row: data };
    }

    if (toolName === "workspace_create") {
      const values = sanitize(input.values, def.writable);
      if (Object.keys(values).length === 0) return { error: "Aucun champ valide fourni." };
      const { data, error } = await db
        .from(def.table)
        .insert({ ...values, tenant_id: tenantId })
        .select()
        .single();
      if (error) return { error: error.message };
      const name = rowName(data);
      const desc = `${def.label}${name ? ` « ${name} »` : ""} — ajout`;
      traces.push({ action: "create", description: desc });
      await log("create", desc, data?.id ?? null);
      return { ok: true, row: data };
    }

    if (toolName === "workspace_update") {
      const id = String(input.id ?? "");
      if (!id) return { error: "id manquant." };
      const values = sanitize(input.values, def.writable);
      if (Object.keys(values).length === 0) return { error: "Aucun champ valide fourni." };
      const { data, error } = await db
        .from(def.table)
        .update(values)
        .eq("tenant_id", tenantId)
        .eq("id", id)
        .select()
        .single();
      if (error) return { error: error.message };
      const name = rowName(data);
      const desc = `${def.label}${name ? ` « ${name} »` : ""} — mise à jour (${Object.keys(values).join(", ")})`;
      traces.push({ action: "update", description: desc });
      await log("update", desc, id);
      return { ok: true, row: data };
    }

    if (toolName === "workspace_delete") {
      const id = String(input.id ?? "");
      if (!id) return { error: "id manquant." };
      // Lecture préalable : la confirmation cite CE qui a été supprimé.
      const { data: existing } = await db
        .from(def.table)
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("id", id)
        .maybeSingle();
      if (!existing) return { error: "Fiche introuvable (déjà supprimée ?)." };
      const { error } = await db.from(def.table).delete().eq("tenant_id", tenantId).eq("id", id);
      if (error) return { error: error.message };
      const name = rowName(existing);
      const desc = `${def.label}${name ? ` « ${name} »` : ""} — suppression`;
      traces.push({ action: "delete", description: desc });
      await log("delete", desc, id);
      return { ok: true, deleted: { id, name } };
    }

    return { error: `Outil inconnu : ${toolName}` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erreur base de données." };
  }
}

// ── Boucle agentique partagée ────────────────────────────────────────────────

export type AgentLoopResult = {
  /** Texte final du modèle (chat) — null si un outil final (compose) a été appelé. */
  finalText: string | null;
  /** Input de l'outil final si `finishToolName` a été appelé. */
  finishInput: Record<string, unknown> | null;
  /** Écritures effectuées (trace lisible). */
  traces: ToolTrace[];
  usage: { inputTokens: number; outputTokens: number };
  iterations: number;
};

/**
 * Boucle Claude + outils workspace. S'arrête quand le modèle répond en texte
 * (chat) ou appelle `finishToolName` (exécuteur : compose). Plafond d'itérations
 * strict — un agent ne part jamais en vrille.
 */
export async function runAgentLoop(opts: {
  model: string;
  system: string;
  userMessage: string;
  db: MinimalClient;
  actor: ToolActor;
  finishTool?: Anthropic.Tool;
  maxIterations?: number;
  maxTokens?: number;
}): Promise<AgentLoopResult> {
  const { model, system, userMessage, db, actor, finishTool, maxIterations = 6, maxTokens = 1500 } = opts;

  const client = new Anthropic();
  const tools: Anthropic.Tool[] = finishTool ? [...WORKSPACE_TOOLS, finishTool] : WORKSPACE_TOOLS;
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userMessage }];
  const traces: ToolTrace[] = [];
  let inputTokens = 0;
  let outputTokens = 0;

  for (let i = 0; i < maxIterations; i++) {
    const msg = await client.messages.create({ model, max_tokens: maxTokens, system, tools, messages });
    inputTokens += msg.usage.input_tokens;
    outputTokens += msg.usage.output_tokens;

    const toolBlocks = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");

    if (toolBlocks.length === 0) {
      // Réponse texte = fin de mission (chat).
      const text = msg.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { finalText: text || null, finishInput: null, traces, usage: { inputTokens, outputTokens }, iterations: i + 1 };
    }

    // Outil final (compose) → mission terminée avec livrable structuré.
    const finish = finishTool ? toolBlocks.find((b) => b.name === finishTool.name) : undefined;
    if (finish) {
      return {
        finalText: null,
        finishInput: finish.input as Record<string, unknown>,
        traces,
        usage: { inputTokens, outputTokens },
        iterations: i + 1,
      };
    }

    // Exécute les outils workspace et renvoie les résultats au modèle.
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolBlocks) {
      const result = await runWorkspaceTool(db, actor, block.name, block.input as Record<string, unknown>, traces);
      results.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(result).slice(0, 8000),
      });
    }
    messages.push({ role: "assistant", content: msg.content });
    messages.push({ role: "user", content: results });
  }

  return {
    finalText: null,
    finishInput: null,
    traces,
    usage: { inputTokens, outputTokens },
    iterations: maxIterations,
  };
}
