// ─────────────────────────────────────────────────────────────────────────────
// ROUTEUR / ORCHESTRATEUR — choisit l'agent spécialiste pour une demande donnée.
//
// Deux niveaux :
//   1. Heuristique (gratuite, déterministe) : score des mots-clés + secteur client.
//   2. LLM léger (Haiku) : classification fine via tool use forcé.
//
// `routeRequest` essaie le LLM si une clé API est dispo, et retombe TOUJOURS
// proprement sur l'heuristique. La génération elle-même reste inchangée (étape 4).
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";
import { AGENTS, AGENT_LIST } from "./agents";
import type { AgentKey } from "./sectors";
import { agentForSector } from "./sectors";

const ROUTER_MODEL = "claude-haiku-4-5";

export type RouteMethod = "llm" | "heuristic" | "sector" | "default";

export type RouteResult = {
  /** Agent spécialiste retenu. */
  agent: AgentKey;
  /** Type d'app inféré (slug court : 'devis', 'crm', 'suivi_chantier', ...). */
  appType: string | null;
  /** Comment la décision a été prise. */
  method: RouteMethod;
  /** Confiance 0..1. */
  confidence: number;
  /** Explication courte (debug / tracking). */
  reasoning?: string;
  /** Tokens consommés SI le routage a appelé le LLM (Haiku). Absent sur le
   *  chemin heuristique (gratuit). Sert au tracking de coût côté route. */
  usage?: { model: string; inputTokens: number; outputTokens: number };
};

const AGENT_KEYS = AGENT_LIST.map((a) => a.key);

// ── 1. HEURISTIQUE ───────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Choix sans appel API : score les mots-clés de chaque agent dans la demande,
 * puis retombe sur l'agent du secteur, puis sur le généraliste.
 */
export function routeHeuristic(prompt: string, sector?: string | null): RouteResult {
  const text = normalize(prompt);

  let best: AgentKey | null = null;
  let bestScore = 0;
  for (const agent of AGENT_LIST) {
    let score = 0;
    for (const kw of agent.keywords) {
      if (text.includes(normalize(kw))) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      best = agent.key;
    }
  }

  if (best && bestScore > 0) {
    return {
      agent: best,
      appType: null,
      method: "heuristic",
      confidence: Math.min(0.5 + bestScore * 0.15, 0.9),
      reasoning: `${bestScore} mot(s)-clé(s) du métier ${best} détecté(s)`,
    };
  }

  const sectorAgent = agentForSector(sector);
  if (sectorAgent !== "generalist") {
    return {
      agent: sectorAgent,
      appType: null,
      method: "sector",
      confidence: 0.5,
      reasoning: `aucun mot-clé fort ; secteur du client (${sector})`,
    };
  }

  return {
    agent: "generalist",
    appType: null,
    method: "default",
    confidence: 0.4,
    reasoning: "demande transverse ou ambiguë",
  };
}

// ── 2. LLM (Haiku + tool use forcé) ──────────────────────────────────────────

function agentCatalog(): string {
  return AGENT_LIST.map(
    (a) => `- ${a.key} — ${a.label} : ${a.description}`
  ).join("\n");
}

function buildRouterSystem(): string {
  return `Tu es le ROUTEUR de Biltia, un générateur d'applications de gestion pour le BTP français.
On te donne la description d'une application que veut un artisan/PME du bâtiment. Tu choisis l'agent spécialiste le plus adapté pour la construire.

AGENTS DISPONIBLES :
${agentCatalog()}

RÈGLES :
- Choisis "generalist" pour les apps transverses (CRM, suivi clients, tableau de bord, planning) qui ne relèvent pas d'un corps de métier précis.
- Choisis un spécialiste métier seulement si la demande mentionne clairement ce métier (vocabulaire, ouvrages, documents).
- Le secteur déclaré par le client est un INDICE, pas une obligation : une demande de devis générique reste "generalist" même venant d'un électricien si rien n'indique de l'électricité.
- "app_type" : un slug court décrivant le type d'app (ex: "devis", "facture", "crm", "suivi_chantier", "pointage", "metre", "planning", "stock").
- "confidence" : 0 à 1.

Réponds UNIQUEMENT en appelant l'outil select_agent.`;
}

// `strict: true` (structured outputs) garantit que l'input valide le schéma.
const SELECT_AGENT_TOOL = {
  name: "select_agent",
  description: "Sélectionne l'agent spécialiste et le type d'app pour la demande.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      agent: {
        type: "string",
        enum: AGENT_KEYS,
        description: "Clé de l'agent spécialiste retenu.",
      },
      app_type: {
        type: "string",
        description: "Slug court du type d'app (devis, crm, suivi_chantier, ...).",
      },
      confidence: {
        type: "number",
        description: "Confiance de 0 à 1.",
      },
    },
    required: ["agent", "app_type", "confidence"],
    additionalProperties: false,
  },
} as Anthropic.Tool;

async function routeWithLLM(
  prompt: string,
  sector?: string | null
): Promise<RouteResult | null> {
  const client = new Anthropic();

  const userContent = sector
    ? `Secteur déclaré du client : ${sector}\n\nDemande : « ${prompt} »`
    : `Demande : « ${prompt} »`;

  const message = await client.messages.create({
    model: ROUTER_MODEL,
    max_tokens: 512,
    system: buildRouterSystem(),
    tools: [SELECT_AGENT_TOOL],
    tool_choice: { type: "tool", name: "select_agent" },
    messages: [{ role: "user", content: userContent }],
  });

  const block = message.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") return null;

  const input = block.input as { agent?: string; app_type?: string; confidence?: number };
  if (!input.agent || !(input.agent in AGENTS)) return null;

  return {
    agent: input.agent as AgentKey,
    appType: input.app_type?.trim() || null,
    method: "llm",
    confidence: typeof input.confidence === "number" ? input.confidence : 0.7,
    reasoning: "classification Haiku",
    usage: {
      model: ROUTER_MODEL,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    },
  };
}

// ── ENTRÉE PUBLIQUE ──────────────────────────────────────────────────────────

/**
 * Route une demande vers un agent. Tente le LLM si possible, retombe sur
 * l'heuristique en cas d'absence de clé API ou d'erreur (jamais d'exception).
 */
export async function routeRequest(opts: {
  prompt: string;
  sector?: string | null;
  useLLM?: boolean;
}): Promise<RouteResult> {
  const { prompt, sector, useLLM = true } = opts;

  // HEURISTIQUE D'ABORD (gratuite). Le choix de l'agent métier est peu risqué
  // (il ne conditionne que le bloc d'expertise injecté), donc on ne dépense un
  // Haiku QUE lorsque l'heuristique doute : confiance < 0.8, soit 0-1 mot-clé
  // métier détecté. Deux mots-clés concordants ou plus → décision directe.
  const heuristic = routeHeuristic(prompt, sector);

  const hasKey =
    !!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY.startsWith("your_");

  if (useLLM && hasKey && heuristic.confidence < 0.8) {
    try {
      const llm = await routeWithLLM(prompt, sector);
      if (llm) return llm;
    } catch {
      // Crédits Anthropic épuisés, réseau, etc. → repli silencieux.
    }
  }

  return heuristic;
}
