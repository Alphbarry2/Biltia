// ─────────────────────────────────────────────────────────────────────────────
// LOGIQUE DE CLARIFICATION — arbre de décision avant chaque génération.
//
// Règle :
//  1. 1 seul secteur profil → génération immédiate
//  2. Plusieurs secteurs + demande identifie clairement un domaine → auto-select
//  3. Plusieurs secteurs + demande = workflow générique (planning, CRM…) → pas
//     de question (workflow universel)
//  4. Plusieurs secteurs + demande ambiguë → afficher chips de clarification
// ─────────────────────────────────────────────────────────────────────────────

import { getSubTrade } from "./btp-catalog";

// Workflows considérés comme "universels" — pas besoin de préciser le métier.
// Ces mots-clés dans la demande → on génère directement avec tous les secteurs.
const GENERIC_WORKFLOW_KEYWORDS = [
  "planning", "agenda", "calendrier", "planning semaine", "planning chantier",
  "crm", "clients", "contacts", "carnet d adresses", "annuaire",
  "stock", "inventaire", "matériaux", "fournitures", "commandes",
  "tableau de bord", "dashboard", "statistiques", "kpi", "reporting",
  "pointage", "heures", "rh", "paie", "salariés", "ouvriers", "équipe",
  "sous-traitants", "fournisseurs", "partenaires",
  "notes", "mémo", "bloc-notes",
];

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function isGenericWorkflow(prompt: string): boolean {
  const text = normalize(prompt);
  return GENERIC_WORKFLOW_KEYWORDS.some((kw) => text.includes(normalize(kw)));
}

/**
 * Score la demande contre les mots-clés d'un sous-métier.
 * Retourne le nombre de mots-clés matchés.
 */
function scoreSubTrade(prompt: string, subTradeId: string): number {
  const st = getSubTrade(subTradeId);
  if (!st) return 0;
  const text = normalize(prompt);
  return st.keywords.filter((kw) => text.includes(normalize(kw))).length;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type SectorOption = {
  id: string;
  label: string;
};

export type ClarifyDecision =
  | {
      type: "immediate";
      /** Sous-métiers à utiliser pour la génération */
      subTradeIds: string[];
    }
  | {
      type: "ask";
      /** Options à afficher à l'utilisateur */
      options: SectorOption[];
    };

// ── Décision principale ───────────────────────────────────────────────────────

/**
 * Retourne la décision de clarification avant génération.
 *
 * @param prompt       La demande de l'utilisateur
 * @param subTradeIds  Les sous-métiers enregistrés dans le profil
 * @param getLabel     Fonction pour obtenir le label d'un sous-métier
 */
export function decideClarification(
  prompt: string,
  subTradeIds: string[],
  getLabel: (id: string) => string
): ClarifyDecision {

  // Cas 1 — un seul secteur → immédiat, pas de question
  if (subTradeIds.length <= 1) {
    return { type: "immediate", subTradeIds };
  }

  // Cas 3 — workflow générique → universel, pas de question
  if (isGenericWorkflow(prompt)) {
    return { type: "immediate", subTradeIds };
  }

  // Cas 2 — scorer chaque secteur contre la demande
  const scores = subTradeIds.map((id) => ({
    id,
    score: scoreSubTrade(prompt, id),
  }));

  const maxScore = Math.max(...scores.map((s) => s.score));

  if (maxScore >= 1) {
    const winners = scores.filter((s) => s.score === maxScore);

    // Un seul gagnant clair → on choisit automatiquement
    if (winners.length === 1) {
      return { type: "immediate", subTradeIds: [winners[0].id] };
    }

    // Plusieurs gagnants à égalité → on propose seulement eux (réduit le bruit)
    return {
      type: "ask",
      options: [
        ...winners.map((s) => ({ id: s.id, label: getLabel(s.id) })),
        { id: "__multi__", label: "Plusieurs domaines" },
      ],
    };
  }

  // Cas 4 — aucun match clair → on propose tous les secteurs du profil
  return {
    type: "ask",
    options: [
      ...subTradeIds.map((id) => ({ id, label: getLabel(id) })),
      { id: "__multi__", label: "Plusieurs domaines" },
    ],
  };
}
