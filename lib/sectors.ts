// ─────────────────────────────────────────────────────────────────────────────
// SECTORS — thin wrapper autour de btp-catalog.ts.
// Maintenu pour la compatibilité avec le routeur et le code existant.
// ─────────────────────────────────────────────────────────────────────────────

export { CATEGORIES, getCategory, getSubTrade, getAllSubTrades, ACTIVITY_TYPES, getActivityType } from "./btp-catalog";

// AgentKey = identifiant de catégorie (12 catégories + généraliste).
export type AgentKey =
  | "generalist"
  | "gros_oeuvre"
  | "terrassement_vrd"
  | "structure_bois_toiture"
  | "electricite"
  | "plomberie_cvc"
  | "fermetures_menuiserie"
  | "isolation_cloisons"
  | "revetements_finitions"
  | "facades_etancheite"
  | "amenagements_exterieurs"
  | "maintenance_services"
  | "entreprise_generale";

// Mapping catégorie → AgentKey (identique car les IDs de catégorie sont les AgentKeys).
export type Sector = {
  id: string;
  label: string;
  agent: AgentKey;
};

import { CATEGORIES } from "./btp-catalog";

export const SECTORS: Sector[] = [
  ...CATEGORIES.map((c) => ({ id: c.id, label: c.label, agent: c.id as AgentKey })),
  { id: "autre", label: "Autre / Multi-services", agent: "generalist" },
];

const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));

export function getSector(id: string | null | undefined): Sector | undefined {
  if (!id) return undefined;
  return SECTOR_BY_ID.get(id);
}

export function agentForSector(id: string | null | undefined): AgentKey {
  return getSector(id)?.agent ?? "generalist";
}
