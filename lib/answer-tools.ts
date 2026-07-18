// ─────────────────────────────────────────────────────────────────────────────
// WS-B — Réponses qui CHERCHENT vraiment.
//
// Une question OPÉRATIONNELLE (« quels chantiers en retard ? », « le devis de
// Martin ») déclenche une phase de LECTURE réelle du workspace (outils read-only)
// avant de répondre — au lieu de raisonner sur un instantané figé et de risquer
// l'invention. Une question GÉNÉRALE (« quelle TVA en rénovation ? ») garde la
// voie rapide streamée, sans outil.
//
// answerNeedsWorkspace est PUR (testable). L'orchestration vit dans la route.
// ─────────────────────────────────────────────────────────────────────────────

// Entités du workspace nommées dans la question.
const ENTITY =
  /\b(chantiers?|clients?|devis|factures?|paiements?|impay[ée]?s?|plannings?|retards?|[ée]ch[ée]ances?|employ[ée]?s?|[ée]quipes?|interventions?|rendez[- ]?vous|rdv|stock|mat[ée]riels?|fournisseurs?|commandes?|t[âa]ches?|pointages?|contrats?|leads?)\b/i;

// Intention de CONSULTATION de données (compter, lister, filtrer, état…).
const DATA_INTENT =
  /\b(combien|quels?|quelles?|listes?|montrer?|affich|lesquels?|lesquelles?|qui\s|en\s+retard|en\s+cours|[àa]\s+faire|impay|[àa]\s+relancer|reste\s+[àa]|r[ée]sum|synth[èe]|bilan|[ée]tats?)\b/i;

// Intention de RETROUVER une fiche précise.
const RETRIEVE = /\b(retrouves?|retrouver|trouves?|trouver|cherches?|chercher|o[ùu]\s+(est|sont)|derni[eè]re?s?)\b/i;

// Possessif → l'artisan parle de SES données.
const POSSESSIVE = /\b(mes|mon|ma)\s+/i;

/**
 * Vrai quand la réponse a besoin des DONNÉES de l'entreprise (donc des outils de
 * lecture). Faux → question générale/métier, voie rapide streamée. Un faux positif
 * est peu coûteux (le modèle n'appellera pas d'outil s'il n'en a pas besoin) ; on
 * exige quand même une entité workspace ET une intention de consultation pour ne
 * pas basculer les simples « comment créer un devis ? ».
 */
export function answerNeedsWorkspace(prompt: string): boolean {
  const p = prompt || "";
  if (!ENTITY.test(p)) return false;
  return DATA_INTENT.test(p) || RETRIEVE.test(p) || POSSESSIVE.test(p);
}

/**
 * Addendum au prompt réponse quand les outils de lecture sont actifs. Constant
 * (aucune interpolation) : il décrit les outils, impose de CHERCHER avant de
 * répondre, et l'HONNÊTETÉ (« je n'ai pas cette information ») plutôt que d'inventer.
 */
export const WSB_TOOL_ADDENDUM = `# CONSULTER LES DONNÉES (outils de LECTURE SEULE)
Tu disposes d'outils de LECTURE pour consulter les vraies données de l'entreprise :
- workspace_list : lister/filtrer une entité (chantiers, clients, devis, factures, interventions…), avec recherche et filtres.
- workspace_get : lire une fiche précise par son id.
Tu peux aussi lister les collections d'applications de l'artisan si besoin.

MÉTHODE :
- Si la réponse n'est pas ENTIÈREMENT dans le CONTEXTE ci-dessus, UTILISE ces outils pour trouver la donnée exacte AVANT de répondre. Croise les entités au besoin (ex : un devis « signé » = statut accepté ; un chantier « en retard » = statut en_retard OU échéance dépassée).
- Quand tu as la donnée, réponds en texte, court et exact, en citant les vrais éléments (noms, numéros, dates).

HONNÊTETÉ (règle absolue) : si, APRÈS avoir cherché avec les outils, la donnée n'existe pas dans l'espace de l'artisan, dis-le clairement — « Je n'ai pas cette information dans ton espace. » — et propose l'action réelle la plus proche. N'invente JAMAIS un nom, un chiffre ni une fiche.

Tu ne peux RIEN modifier ni envoyer ici : uniquement LIRE et répondre.`;
