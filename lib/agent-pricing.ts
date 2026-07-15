// ─────────────────────────────────────────────────────────────────────────────
// LE PRIX D'UN PASSAGE D'AGENT — calculé, jamais recopié.
//
// POURQUOI CE FICHIER EXISTE (et pourquoi il est PUR) : le prix vivait dans
// lib/agent-rules.ts, qui tire le SDK du modèle et Supabase — donc inatteignable
// depuis le navigateur. La galerie des agents prêts à l'emploi, elle, est un
// composant client. Elle ne pouvait donc pas CALCULER le prix : elle le
// RECOPIAIT, à la main, dans un champ texte (`pricing: "≈ 10 crédits / relance"`).
//
// Les six templates payants mentaient TOUS. Au 2026-07-15, ils annonçaient 10 ou
// 25 crédits là où la grille en débitait 40 — et le « planning équipe hebdo »
// affichait « Gratuit » alors qu'il coûte 40 par passage. Un prix écrit en dur ment
// tôt ou tard : c'est déjà arrivé aux 7 prix du produit le 2026-07-14, ça vient de
// recommencer ici, et ça recommencera à chaque changement de grille.
//
// Ici, le prix est PUR (aucun import serveur) : le chat, les agents, la galerie et
// la page /tarifs appellent tous la MÊME fonction. Plus personne ne le recopie.
//
// ⚠️ CE QUE CETTE FONCTION RENVOIE DOIT ÊTRE EXACTEMENT CE QUE lib/agent-executor.ts
// DÉBITE. C'est la seule règle qui compte : annoncer 10 et prélever 40, c'est la
// surprise sur la facture que tout ce fichier existe pour empêcher.
// ─────────────────────────────────────────────────────────────────────────────

import { ACTION_CREDITS } from "./plans";

export type AgentActionType =
  | "send_email"
  | "notify"
  | "report"
  | "team_planning"
  | "compte_rendu"
  | "act";

/**
 * LE TARIF SUIT LA VALEUR, PAS LES TOKENS (décision user 2026-07-14, étendue aux
 * agents le 2026-07-15). Un moteur 8× moins cher doit améliorer la MARGE, pas brader
 * l'offre — et un gabarit qui envoie 26 emails fait du travail, même sans modèle.
 *
 *     0  — rien à faire : alerte purement déterministe (échéance dépassée, impayé).
 *    20  — l'IA RÉFLÉCHIT : elle lit le workspace et décide s'il faut agir.
 *    40  — l'IA RÉDIGE ou COMMUNIQUE (relance, compte-rendu, rapport, planning).
 *   100  — l'IA MODIFIE le workspace (crée un devis, affecte une équipe…).
 */
export function estimateCreditsPerRun(
  type: AgentActionType,
  opts: { judged?: boolean } = {}
): number {
  switch (type) {
    // Alerte déterministe : le gabarit est déjà écrit, rien n'est décidé. Gratuit.
    // SAUF si le veilleur est JUGÉ par l'IA (elle lit chaque fiche pour trancher,
    // cf. WatcherDef.aiJudge) : là elle réfléchit vraiment, c'est un vrai passage.
    case "notify":
      return opts.judged ? ACTION_CREDITS.agent_passage : 0;

    // L'agent AGIT : boucle agentique sur les outils du workspace (jusqu'à 10
    // itérations × 4 fiches), soit ~10× le coût d'une simple relance.
    case "act":
      return ACTION_CREDITS.agent_action;

    // Tout ce qui RÉDIGE OU COMMUNIQUE : relance client, compte-rendu, rapport —
    // et le PLANNING transmis à l'équipe.
    //
    // team_planning était rangé avec les gabarits gratuits, au motif qu'il n'appelle
    // aucun modèle. C'était facturer la note de tokens au lieu du travail livré : lire
    // le planning, résoudre 26 employés et leur envoyer 26 emails personnalisés avec
    // l'adresse de leur chantier, chaque semaine, à vie, ne coûtait RIEN — pendant
    // qu'un simple email à UN client en coûtait 40, parce qu'un modèle l'avait écrit.
    // Le client n'achète pas des tokens, il achète du travail fait.
    case "send_email":
    case "report":
    case "compte_rendu":
    case "team_planning":
      return ACTION_CREDITS.agent_redaction;
  }
}

/** Passages par mois selon le planning (tous les jours = ~30). */
export function runsPerMonth(days: number[]): number {
  const d = (days ?? []).filter((x) => x >= 1 && x <= 7);
  return d.length === 0 ? 30 : Math.round(d.length * 4.33);
}
