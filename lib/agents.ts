// ─────────────────────────────────────────────────────────────────────────────
// AGENTS — chaque agent correspond à une catégorie du catalogue BTP.
// Le knowledge détaillé vit dans btp-catalog.ts (buildKnowledgeBlock).
// Ce fichier fournit labels, descriptions et mots-clés pour le routeur.
// ─────────────────────────────────────────────────────────────────────────────

import type { AgentKey } from "./sectors";
import { CATEGORIES } from "./btp-catalog";

export type Agent = {
  key: AgentKey;
  label: string;
  description: string;
  keywords: string[];
};

// Construit les agents depuis le catalogue (source unique de vérité).
function buildAgents(): Record<AgentKey, Agent> {
  const agents: Partial<Record<AgentKey, Agent>> = {
    generalist: {
      key: "generalist",
      label: "Généraliste / Multi-services",
      description: "Apps transverses : CRM, suivi clients, planning, tableaux de bord.",
      keywords: ["crm", "client", "planning", "dashboard", "suivi", "stock", "tâches", "agenda"],
    },
  };

  for (const cat of CATEGORIES) {
    const keywords = cat.subTrades.flatMap((st) => st.keywords);
    agents[cat.id as AgentKey] = {
      key: cat.id as AgentKey,
      label: cat.label,
      description: cat.subTrades.map((st) => st.label).join(", "),
      keywords: [...new Set(keywords)],
    };
  }

  return agents as Record<AgentKey, Agent>;
}

export const AGENTS: Record<AgentKey, Agent> = buildAgents();
export const AGENT_LIST: Agent[] = Object.values(AGENTS);

export function getAgent(key: AgentKey): Agent {
  return AGENTS[key];
}
