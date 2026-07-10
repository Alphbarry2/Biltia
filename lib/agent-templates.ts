// ─────────────────────────────────────────────────────────────────────────────
// AGENT TEMPLATES — les agents PRÊTS À L'EMPLOI (« un clic = activé »).
//
// À côté de la recrue en langage courant (barre de chat → parseInstruction), on
// propose des agents DÉJÀ CONFIGURÉS pour les missions BTP les plus utiles.
// Curation (2026-07-09, choix user) : 5 agents, la logique GRATUIT vs PAYANT est
// lisible — GRATUIT = l'agent te PRÉVIENT (alerte par gabarit, 0 crédit) ;
// PAYANT = l'agent AGIT à ta place (rédige/envoie, débit par passage au réel).
//
//   Gratuits : alerte chantier en retard · veille des assurances & échéances.
//   Payants  : relance des devis · recouvrement des impayés · compte-rendu.
//
// Chaque entrée décrit une VRAIE règle exécutable — pas une maquette : elle mappe
// un veilleur événementiel (lib/agent-watchers.ts) évalué à chaque tick du cron.
// « Activer » écrit la règle dans agent_rules (via activateAgentTemplate,
// lib/agent-rules.ts) et l'agent se met au travail.
//
// CLIENT-SAFE : données pures uniquement (imports type-only), pour que la galerie
// (dashboard + page Agents) puisse l'importer directement.
// ─────────────────────────────────────────────────────────────────────────────

import type { AgentComplexity } from "./agent-rules";
import type { WatcherKey } from "./agent-watchers";

export type AgentTemplateKind = "event" | "schedule";

export type AgentTemplate = {
  id: string;
  /** Titre court (devient agent_rules.title). */
  name: string;
  /** UNE phrase : ce que fait l'agent, en clair (seul texte affiché sur la carte). */
  tagline: string;
  /** Nom d'icône lucide (mappé côté composant). */
  icon: string;
  /** Couleur d'accent. */
  accent: string;
  /** Note de prix courte (« Gratuit », « ≈ 10 crédits / relance »). */
  pricing: string;
  /** true = agir ne consomme aucun crédit IA (alerte par gabarit). */
  free: boolean;
  /** Complexité → modèle + estimation crédits (résolus à l'activation). */
  complexity: AgentComplexity;

  kind: AgentTemplateKind;

  // ── Déclencheur ÉVÉNEMENTIEL (« dès qu'une fiche remplit la condition ») ──
  watcher?: WatcherKey;
  /** Paramètre en jours du veilleur (0 = défaut du veilleur). */
  eventDays?: number;
  /** notify (alerte patron), send_email (relance client), compte_rendu (doc). */
  eventAction?: "notify" | "send_email" | "compte_rendu";

  // ── Déclencheur PLANIFIÉ (heure fixe) — réservé aux futurs modèles ──
  time?: string;
  days?: number[];
  scheduleAction?: "report" | "team_planning" | "notify";
  dataFocus?: string;

  /** Mission (devient instruction + contentInstruction : guide la rédaction). */
  instruction: string;
};

// ── LE CATALOGUE — 2 gratuits (alerte) puis 3 payants (action) ───────────────

export const AGENT_TEMPLATES: AgentTemplate[] = [
  // ── GRATUITS : l'agent te prévient (0 crédit) ──────────────────────────────
  {
    id: "alerte_chantiers_retard",
    name: "Alerte chantier en retard",
    tagline: "Te prévient dès qu'un chantier dépasse sa date de fin.",
    icon: "AlertTriangle",
    accent: "#4F46E5",
    pricing: "Gratuit",
    free: true,
    complexity: "simple",
    kind: "event",
    watcher: "chantier_en_retard",
    eventDays: 0,
    eventAction: "notify",
    instruction: "Préviens-moi dès qu'un chantier dépasse sa date de fin prévue et n'est pas terminé.",
  },
  {
    id: "veille_echeances",
    name: "Veille des assurances & échéances",
    tagline: "T'alerte avant qu'une assurance ou attestation n'expire.",
    icon: "ShieldCheck",
    accent: "#EF4444",
    pricing: "Gratuit",
    free: true,
    complexity: "simple",
    kind: "event",
    watcher: "echeance_proche",
    eventDays: 30,
    eventAction: "notify",
    instruction:
      "Préviens-moi 30 jours avant l'expiration d'une assurance, d'une attestation, d'un contrat d'entretien ou d'un contrôle de matériel.",
  },
  {
    id: "alerte_impayes",
    name: "Alerte impayés",
    tagline: "Te signale chaque facture qui dépasse son échéance sans être payée.",
    icon: "Wallet",
    accent: "#0EA5E9",
    pricing: "Gratuit",
    free: true,
    complexity: "simple",
    kind: "event",
    watcher: "facture_impayee",
    eventDays: 0,
    eventAction: "notify",
    instruction: "Préviens-moi dès qu'une facture est échue et n'a pas été payée.",
  },
  {
    id: "alerte_stock_bas",
    name: "Alerte stock bas",
    tagline: "Te prévient dès qu'un matériau passe sous son seuil d'alerte.",
    icon: "PackageOpen",
    accent: "#0D9488",
    pricing: "Gratuit",
    free: true,
    complexity: "simple",
    kind: "event",
    watcher: "stock_bas",
    eventDays: 0,
    eventAction: "notify",
    instruction: "Préviens-moi dès qu'un matériau passe sous son seuil d'alerte pour que je le recommande à temps.",
  },
  {
    id: "planning_equipe_hebdo",
    name: "Planning de la semaine à l'équipe",
    tagline: "Chaque lundi, envoie leur planning à tes équipes, sans que tu y penses.",
    icon: "CalendarDays",
    accent: "#F59E0B",
    pricing: "Gratuit",
    free: true,
    complexity: "simple",
    kind: "schedule",
    time: "07:00",
    days: [1],
    scheduleAction: "team_planning",
    instruction: "Chaque lundi matin, envoie à mon équipe le planning des prochains jours.",
  },

  // ── PAYANTS : l'agent agit à ta place (débit par passage) ──────────────────
  {
    id: "relance_devis",
    name: "Relance des devis",
    tagline: "Relance les clients qui n'ont pas répondu à un devis.",
    icon: "FileText",
    accent: "#0D9488",
    pricing: "≈ 10 crédits / relance",
    free: false,
    complexity: "simple",
    kind: "event",
    watcher: "devis_non_signe",
    eventDays: 7,
    eventAction: "send_email",
    instruction:
      "Relance par email, avec courtoisie, chaque client dont le devis est resté sans réponse. Rappelle l'objet du devis et propose ton aide.",
  },
  {
    id: "recouvrement_factures",
    name: "Recouvrement des impayés",
    tagline: "Relance chaque facture échue jusqu'au paiement.",
    icon: "Banknote",
    accent: "#6D5EF6",
    pricing: "≈ 10 crédits / relance",
    free: false,
    complexity: "simple",
    kind: "event",
    watcher: "facture_impayee",
    eventDays: 0,
    eventAction: "send_email",
    instruction:
      "Relance par email chaque client dont une facture est échue et impayée. Rappelle le numéro, le montant dû et l'échéance, reste courtois mais ferme.",
  },
  {
    id: "compte_rendu_visite",
    name: "Compte-rendu de visite",
    tagline: "Rédige le compte-rendu après chaque intervention terminée.",
    icon: "ClipboardCheck",
    accent: "#A855F7",
    pricing: "≈ 25 crédits / compte-rendu",
    free: false,
    complexity: "medium",
    kind: "event",
    watcher: "visite_terminee",
    eventDays: 3,
    eventAction: "compte_rendu",
    instruction:
      "Rédige un compte-rendu de visite professionnel après chaque intervention terminée et range-le dans la Bibliothèque.",
  },
  {
    id: "point_treso_matin",
    name: "Point trésorerie du matin",
    tagline: "Chaque matin en semaine, l'état de ton cash : ce qui rentre, ce qui traîne.",
    icon: "Sunrise",
    accent: "#3B82F6",
    pricing: "≈ 25 crédits / jour",
    free: false,
    complexity: "medium",
    kind: "schedule",
    time: "08:00",
    days: [1, 2, 3, 4, 5],
    scheduleAction: "report",
    dataFocus: "devis en attente de réponse et factures échues impayées",
    instruction:
      "Chaque matin, fais le point sur ma trésorerie : les devis en attente de réponse et les factures échues impayées. Dis-moi ce qui rentre, ce qui traîne et quoi relancer en priorité.",
  },
  {
    id: "bilan_semaine",
    name: "Bilan de la semaine",
    tagline: "Chaque vendredi, la synthèse de ton activité : chantiers, devis, encaissements.",
    icon: "BarChart3",
    accent: "#6366F1",
    pricing: "≈ 25 crédits / semaine",
    free: false,
    complexity: "medium",
    kind: "schedule",
    time: "17:00",
    days: [5],
    scheduleAction: "report",
    dataFocus:
      "activité de la semaine : chantiers en cours et leur avancement, devis signés et en attente, factures et encaissements",
    instruction:
      "Chaque vendredi, fais-moi le bilan de la semaine : où en sont mes chantiers, les devis signés et en attente, ce qui a été encaissé et ce qu'il faut surveiller la semaine prochaine.",
  },
];

export const AGENT_TEMPLATE_IDS = AGENT_TEMPLATES.map((t) => t.id);

export function getAgentTemplate(id: string): AgentTemplate | undefined {
  return AGENT_TEMPLATES.find((t) => t.id === id);
}
