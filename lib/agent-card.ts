// ─────────────────────────────────────────────────────────────────────────────
// LA CARTE « AGENT ACTIVÉ » — le contrat de données, PUR (aucun import serveur).
//
// POURQUOI CE FICHIER EXISTE : le serveur (lib/agent-rules.ts, qui tire Supabase +
// le SDK du modèle) CONSTRUIT la carte ; le chat (composant client) la REND. Le
// type et le formatage du coût doivent donc vivre dans un module que les DEUX
// importent sans embarquer le serveur dans le bundle du navigateur — même raison
// d'être que lib/agent-pricing.ts.
//
// CE QUE ÇA REMPLACE : le serveur concaténait un pavé markdown
//   « 🤖 Agent recruté : **X** — … ~40 crédits par passage (~880/mois)… »
// que le chat affichait EN BRUT (il n'y a AUCUN parseur markdown côté client) :
// les ** et l'emoji sortaient littéralement, dans un seul bloc sans hiérarchie et
// sans bouton. On envoie désormais des CHAMPS ; la mise en forme (badge « activé »,
// lignes Quand/Action/Coût, bouton « Voir l'agent ») appartient au front.
// ─────────────────────────────────────────────────────────────────────────────

/** actif = vert (« l'agent tourne ») ; pending = ambre (il manque une connexion
 *  ou une info avant de démarrer). */
export type AgentCardStatus = "active" | "pending";

/** Une ligne de la carte. L'ICÔNE et le LIBELLÉ sont dérivés de `kind` par le
 *  front (pour l'i18n de l'habillage) ; seule la VALEUR (déjà en français, comme
 *  tout le reste des messages d'agent) vient du serveur. */
export type AgentCardRow = {
  kind: "when" | "action" | "cost" | "recipients";
  value: string;
  /** Détail secondaire grisé sous la valeur (« ≈ 880 crédits / mois »). */
  hint?: string | null;
};

export type AgentCard = {
  /** Cible du bouton « Voir l'agent » (page /agents). null si non créé. */
  ruleId: string | null;
  title: string;
  status: AgentCardStatus;
  rows: AgentCardRow[];
  /** Note de bas de carte (« Premier passage demain à 8h »). null sinon. */
  footnote?: string | null;
  /** État `pending` : ce qui manque, en clair. Dans le chat, les cartes de
   *  connexion s'affichent juste en dessous. null si l'agent est actif. */
  pending?: string | null;
};

/**
 * LA LIGNE DE COÛT, calculée une fois, présentée partout pareil. Le MONTANT vient
 * de lib/agent-pricing (estimateCreditsPerRun) — ici on ne fait que le METTRE EN
 * FORME, jamais le recalculer (règle du fichier agent-pricing : annoncer ≠ débiter
 * est précisément le bug qu'on refuse de réintroduire).
 *
 *  • agent planifié   → « ~40 crédits / passage » + « ≈ 880 crédits / mois ».
 *  • agent événementiel → pas de mensuel fixe (dépend de l'activité réelle) :
 *    « ~40 crédits / <perUnitLabel> » + rappel que le débit réel fait foi.
 *  • coût nul (alerte purement déterministe) → « Gratuit ».
 */
export function agentCostRow(
  creditsPerRun: number,
  opts: { perMonth?: number | null; event?: boolean; perUnitLabel?: string } = {}
): AgentCardRow {
  if (creditsPerRun <= 0) {
    return { kind: "cost", value: "Gratuit", hint: "alerte automatique, aucun crédit" };
  }
  if (opts.event) {
    const unit = opts.perUnitLabel ?? "fiche traitée";
    return {
      kind: "cost",
      value: `~${creditsPerRun} crédits / ${unit}`,
      hint: "selon l'activité — le débit réel fait foi",
    };
  }
  return {
    kind: "cost",
    value: `~${creditsPerRun} crédits / passage`,
    hint: opts.perMonth && opts.perMonth > 0 ? `≈ ${opts.perMonth} crédits / mois` : null,
  };
}

/** Majuscule initiale d'un libellé d'action (« je relance… » → « Je relance… »)
 *  pour qu'il se lise proprement en valeur de ligne, sous le libellé « Action ». */
export function capitalizeAction(s: string): string {
  const t = (s ?? "").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}
