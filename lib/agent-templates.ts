// ─────────────────────────────────────────────────────────────────────────────
// AGENT TEMPLATES — les agents PRÊTS À L'EMPLOI (« un clic = activé »).
//
// À côté de la recrue en langage courant (barre de chat → parseInstruction), on
// propose des agents DÉJÀ CONFIGURÉS pour les missions BTP les plus utiles.
// Curation (choix user) : la liste ci-dessous (AGENT_TEMPLATES) fait foi —
// ~10 agents aujourd'hui (4 gratuits + 6 payants). La logique GRATUIT vs PAYANT
// reste lisible — GRATUIT = l'agent te PRÉVIENT (alerte par gabarit, 0 crédit) ;
// PAYANT = l'agent AGIT à ta place (rédige/envoie/planifie, débit par passage).
//
//   Gratuits (ex.) : alerte chantier en retard · veille des échéances · impayés.
//   Payants  (ex.) : relance des devis · recouvrement · compte-rendu · planning.
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
import type { Locale } from "./i18n/config";
// PUR, donc importable côté client — c'est tout l'intérêt : la galerie CALCULE le
// prix au lieu de le recopier. (lib/agent-rules.ts, lui, tire le SDK du modèle.)
import { estimateCreditsPerRun, type AgentActionType } from "./agent-pricing";

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

  // ── LE PRIX N'EST PLUS ÉCRIT ICI. IL EST CALCULÉ. ──────────────────────────
  // Il y avait deux champs : `pricing: string` (« ≈ 10 crédits / relance ») et
  // `free: boolean`. Deux vérités recopiées à la main, et les SIX templates payants
  // mentaient : 10 ou 25 crédits annoncés là où la grille en débitait 40. Pire,
  // « planning équipe hebdo » affichait « Gratuit » alors qu'il coûte 40 par passage.
  //
  // `free` n'était même pas qu'un libellé : il sert de PORTE D'ABONNEMENT
  // (app/api/agents/activate/route.ts). Un `free: true` erroné laissait un utilisateur
  // du plan Free activer un agent que l'exécuteur refuse ensuite d'exécuter (il exige
  // Pro dès que l'agent AGIT). Agent recruté, affiché « Actif », qui ne tournera jamais.
  //
  // Tout se DÉDUIT maintenant de l'action, via templateCredits() plus bas. Il ne reste
  // ici que l'UNITÉ, qui est de la présentation et non un prix : elle dit à quelle
  // FRÉQUENCE l'artisan sera débité, pas combien.

  /** Unité affichée à côté du prix calculé : « relance », « compte-rendu », « jour ».
   *  PRÉSENTATION uniquement — le NOMBRE, lui, n'est jamais écrit à la main. */
  unit: string;

  /** Complexité → modèle (COMPLEXITY_MODEL). Elle ne décide PLUS du prix. */
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
    unit: "alerte",
    name: "Alerte chantier en retard",
    tagline: "Te prévient dès qu'un chantier dépasse sa date de fin.",
    icon: "AlertTriangle",
    accent: "#4F46E5",
    complexity: "simple",
    kind: "event",
    watcher: "chantier_en_retard",
    eventDays: 0,
    eventAction: "notify",
    instruction: "Préviens-moi dès qu'un chantier dépasse sa date de fin prévue et n'est pas terminé.",
  },
  {
    id: "veille_echeances",
    unit: "alerte",
    name: "Veille des assurances & échéances",
    tagline: "T'alerte avant qu'une assurance ou attestation n'expire.",
    icon: "ShieldCheck",
    accent: "#EF4444",
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
    unit: "alerte",
    name: "Alerte impayés",
    tagline: "Te signale chaque facture qui dépasse son échéance sans être payée.",
    icon: "Wallet",
    accent: "#0EA5E9",
    complexity: "simple",
    kind: "event",
    watcher: "facture_impayee",
    eventDays: 0,
    eventAction: "notify",
    instruction: "Préviens-moi dès qu'une facture est échue et n'a pas été payée.",
  },
  {
    id: "alerte_stock_bas",
    unit: "alerte",
    name: "Alerte stock bas",
    tagline: "Te prévient dès qu'un matériau passe sous son seuil d'alerte.",
    icon: "PackageOpen",
    accent: "#0D9488",
    complexity: "simple",
    kind: "event",
    watcher: "stock_bas",
    eventDays: 0,
    eventAction: "notify",
    instruction: "Préviens-moi dès qu'un matériau passe sous son seuil d'alerte pour que je le recommande à temps.",
  },
  {
    id: "planning_equipe_hebdo",
    unit: "envoi",
    name: "Planning de la semaine à l'équipe",
    tagline: "Chaque lundi, envoie leur planning à tes équipes, sans que tu y penses.",
    icon: "CalendarDays",
    accent: "#F59E0B",
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
    unit: "relance",
    name: "Relance des devis",
    tagline: "Relance les clients qui n'ont pas répondu à un devis.",
    icon: "FileText",
    accent: "#0D9488",
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
    unit: "relance",
    name: "Recouvrement des impayés",
    tagline: "Relance chaque facture échue jusqu'au paiement.",
    icon: "Banknote",
    accent: "#6D5EF6",
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
    unit: "compte-rendu",
    name: "Compte-rendu de visite",
    tagline: "Rédige le compte-rendu après chaque intervention terminée.",
    icon: "ClipboardCheck",
    accent: "#A855F7",
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
    unit: "jour",
    name: "Point trésorerie du matin",
    tagline: "Chaque matin en semaine, l'état de ton cash : ce qui rentre, ce qui traîne.",
    icon: "Sunrise",
    accent: "#3B82F6",
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
    unit: "semaine",
    name: "Bilan de la semaine",
    tagline: "Chaque vendredi, la synthèse de ton activité : chantiers, devis, encaissements.",
    icon: "BarChart3",
    accent: "#6366F1",
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

// ── i18n : surcharges EN (le texte visible + la mission utilisée à l'activation).
// Les `value`/`id`/`watcher`/`icon` ne changent pas ; seul le texte est traduit.
type AgentTemplateI18n = { name: string; tagline: string; unit: string; instruction: string; dataFocus?: string };
const AGENT_TEMPLATE_EN: Record<string, AgentTemplateI18n> = {
  alerte_chantiers_retard: {
    name: "Late job-site alert",
    tagline: "Alerts you the moment a job site runs past its end date.",
    unit: "alert",
    instruction: "Alert me as soon as a job site runs past its planned end date and isn't finished.",
  },
  veille_echeances: {
    name: "Insurance & expiry watch",
    tagline: "Warns you before an insurance policy or certificate expires.",
    unit: "alert",
    instruction: "Warn me 30 days before an insurance policy, certificate, maintenance contract or equipment inspection expires.",
  },
  alerte_impayes: {
    name: "Unpaid invoice alert",
    tagline: "Flags every invoice that passes its due date without being paid.",
    unit: "alert",
    instruction: "Alert me as soon as an invoice is overdue and hasn't been paid.",
  },
  alerte_stock_bas: {
    name: "Low-stock alert",
    tagline: "Alerts you as soon as a material drops below its reorder threshold.",
    unit: "alert",
    instruction: "Alert me as soon as a material drops below its low-stock threshold so I can reorder in time.",
  },
  planning_equipe_hebdo: {
    name: "Weekly schedule to the team",
    tagline: "Every Monday, sends your teams their schedule — without you thinking about it.",
    unit: "send",
    instruction: "Every Monday morning, send my team the schedule for the coming days.",
  },
  relance_devis: {
    name: "Quote follow-ups",
    tagline: "Follows up with clients who haven't answered a quote.",
    unit: "follow-up",
    instruction: "Politely follow up by email with every client whose quote went unanswered. Recall the quote's subject and offer your help.",
  },
  recouvrement_factures: {
    name: "Debt recovery",
    tagline: "Chases every overdue invoice until it's paid.",
    unit: "follow-up",
    instruction: "Follow up by email with every client who has an overdue, unpaid invoice. Recall the number, amount due and due date; stay courteous but firm.",
  },
  compte_rendu_visite: {
    name: "Visit report",
    tagline: "Writes the report after each completed job.",
    unit: "report",
    instruction: "Write a professional visit report after each completed job and file it in the Library.",
  },
  point_treso_matin: {
    name: "Morning cash check",
    tagline: "Every weekday morning, your cash status: what's coming in, what's dragging.",
    unit: "day",
    dataFocus: "quotes awaiting a reply and overdue unpaid invoices",
    instruction: "Every morning, review my cash flow: quotes awaiting a reply and overdue unpaid invoices. Tell me what's coming in, what's dragging, and what to chase first.",
  },
  bilan_semaine: {
    name: "Weekly wrap-up",
    tagline: "Every Friday, a summary of your activity: job sites, quotes, payments.",
    unit: "week",
    dataFocus: "the week's activity: ongoing job sites and their progress, signed and pending quotes, invoices and payments",
    instruction: "Every Friday, give me the week's wrap-up: where my job sites stand, signed and pending quotes, what was collected, and what to watch next week.",
  },
};

/** Renvoie le template avec son texte visible + sa mission traduits si EN. */
export function localizeAgentTemplate(tpl: AgentTemplate, locale: Locale): AgentTemplate {
  if (locale !== "en") return tpl;
  const en = AGENT_TEMPLATE_EN[tpl.id];
  return en ? { ...tpl, ...en } : tpl;
}

// ── LE PRIX, CALCULÉ ─────────────────────────────────────────────────────────
// Une seule source : estimateCreditsPerRun (lib/agent-pricing.ts), la MÊME fonction
// qui annonce le prix d'un agent recruté au chat, et la même grille que débite
// lib/agent-executor.ts. Plus aucune recopie, donc plus aucune dérive : quand la
// grille bouge, les cartes bougent avec elle, toutes seules.

/** L'action réellement exécutée par ce template (événementiel ou planifié). */
export function templateAction(tpl: AgentTemplate): AgentActionType {
  return (tpl.kind === "event" ? tpl.eventAction : tpl.scheduleAction) ?? "notify";
}

/**
 * Les crédits que CE template débitera par passage.
 *
 * `judged: false` : un veilleur JUGÉ par l'IA (WatcherDef.aiJudge) rendrait un simple
 * `notify` payant (20 cr — l'IA lit chaque fiche pour trancher). Aucun template n'en
 * utilise aujourd'hui : le seul veilleur jugé est `demande_urgente`. Si un template
 * venait à en adopter un, activateAgentTemplate (serveur, lib/agent-rules.ts) le
 * détecterait — il a accès au registre des veilleurs, contrairement à ce module qui
 * doit rester importable côté client.
 */
export function templateCredits(tpl: AgentTemplate): number {
  return estimateCreditsPerRun(templateAction(tpl), { judged: false });
}

/** Un template est GRATUIT si, et seulement si, il ne débite rien. Ce n'est plus une
 *  déclaration mais une CONSÉQUENCE — et c'est ce booléen qui garde aussi la porte du
 *  plan Pro (app/api/agents/activate/route.ts). */
export function isTemplateFree(tpl: AgentTemplate): boolean {
  return templateCredits(tpl) === 0;
}

/** La note de prix affichée sur la carte. Le NOMBRE est calculé ; seule l'unité est
 *  du texte (elle dit à quelle fréquence l'artisan sera débité, pas combien). */
export function templatePricingLabel(tpl: AgentTemplate, locale: Locale): string {
  const credits = templateCredits(tpl);
  if (credits === 0) return locale === "en" ? "Free" : "Gratuit";
  const t = localizeAgentTemplate(tpl, locale);
  return locale === "en"
    ? `≈ ${credits} credits / ${t.unit}`
    : `≈ ${credits} crédits / ${t.unit}`;
}
