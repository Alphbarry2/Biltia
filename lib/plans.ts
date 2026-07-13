// ─────────────────────────────────────────────────────────────────────────────
// BILTIA — Plans & tarification (SOURCE DE VÉRITÉ)
//
// Ce fichier est CLIENT-SAFE : aucune donnée secrète (pas de clé Stripe, pas de
// price ID). Il est importé aussi bien par la landing que par les routes serveur.
// La résolution des Stripe Price IDs se fait côté serveur uniquement
// (voir lib/stripe.ts), à partir du nom de variable d'env retourné ici.
//
// Tarifs validés le 2026-07-02.
// ─────────────────────────────────────────────────────────────────────────────

import type { Locale } from "@/lib/i18n/config";

export type PlanId = "free" | "pro" | "equipe";

/** Un palier de crédits mensuels pour un plan payant. */
export interface CreditTier {
  /** Crédits IA inclus, renouvelés à chaque échéance mensuelle. */
  credits: number;
  /** Prix mensuel en euros (TTC affiché). */
  priceEur: number;
}

export interface PlanLimits {
  /** Nombre d'apps simultanées (Infinity = illimité). */
  maxApps: number;
  /** Sièges / utilisateurs (Infinity = illimité). */
  maxUsers: number;
  /** Déploiement d'apps en Live (URL publique Vercel). */
  liveDeploy: boolean;
  voice: boolean;
  offlineFirst: boolean;
  sharedWorkspace: boolean;
  whiteLabel: boolean;
  customUrl: boolean;
  multiNiche: boolean;
  accountingConnectors: boolean;
  /** Envoi automatique d'emails / SMS depuis les apps ET les agents. */
  autoMessaging: boolean;
  /** Agents qui AGISSENT (relance email, compte-rendu, rapport, planning équipe).
   *  Les alertes (notify) restent libres, même en Free : « le Free goûte, le Pro exécute ». */
  agentActions: boolean;
}

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  /** À qui s'adresse le plan (affiché en évidence sur la carte). */
  audience: string;
  /** Paliers de crédits (vide pour Free). */
  tiers: CreditTier[];
  /** Crédits offerts à l'inscription (Free uniquement, non renouvelables). */
  signupCredits?: number;
  /** Palier mis en avant par défaut dans l'UI. */
  defaultCredits?: number;
  /** Puces marketing affichées sur la carte tarifaire. */
  features: string[];
  limits: PlanLimits;
}

export const UNLIMITED = Number.POSITIVE_INFINITY;

/**
 * Coût interne (EUR) qu'UN crédit « achète ». C'est le levier de marge :
 *   marge = 1 − CREDIT_COST_EUR / prix_net_par_crédit.
 * Échelle ×10 : le crédit le moins cher vaut ~0,0355 €/crédit net (TTC − TVA 21 %
 * − Stripe). À 0,003 € la marge plancher est ~91,5 % (≥ 90 % garanti). Le débit
 * réel (lib/ai-usage.ts) arrondit au palier supérieur → marge ≥ ce plancher.
 * NB : suppose des prix affichés TTC. En HT, ce budget remonte à ~0,004 €.
 */
export const CREDIT_COST_EUR = 0.003;

// ─────────────────────────────────────────────────────────────────────────────
// LE TARIF D'UNE ACTION — SOURCE UNIQUE DE VÉRITÉ (code ET page /tarifs).
//
// ⚠️ Le crédit est un PRIX, pas un compteur de coût.
//
// Avant, le produit débitait au COÛT RÉEL de l'IA : il réservait 250 crédits pour
// une app, puis remboursait tout ce qui dépassait la facture du modèle. Tant que
// le moteur tournait chez Anthropic, ça donnait ~97 crédits par app — proche de la
// grille. Mais en basculant sur OpenRouter (8× moins cher), la même app est tombée
// à 15 crédits : un abonné à 49 € pouvait générer **133 applications**.
//
// Conséquence : le palier d'entrée couvrait les besoins de TOUT LE MONDE. Plus
// personne ne monte, l'ARPU s'écrase sur 49 €, et les paliers supérieurs ne servent
// plus à rien. Un prix d'entrée qui suffit à tous n'est pas un prix d'entrée, c'est
// un plafond.
//
// Donc : le tarif est FIXE, indépendant du modèle et de son coût. Baisser le coût
// améliore la marge — ça ne brade pas l'offre. Le coût réel reste journalisé dans
// `ai_usage.cost_usd` pour surveiller la marge (console admin), mais il ne pilote
// PLUS le débit.
//
// ── LE PRIX SUIT LA VALEUR, PAS LE COÛT (décision user 2026-07-14) ───────────
//
// Une fois le débit détaché du coût, il restait à décider ce que vaut une action.
// Le coût ne peut pas répondre : à 98-99 % de marge, TOUTES les réponses sont
// rentables. Un crédit se vend 0,0196 € net (49 € TTC / 2 000 cr, hors TVA 21 % et
// Stripe) ; une app coûte 0,02 à 0,15 € à produire. Le vrai critère, c'est donc :
// qu'est-ce qui fait monter un client de palier ?
//
// Deux architectures étaient possibles : plafonner (N apps, N agents par plan) ou
// compter (crédits seuls). Le user a tranché pour LES CRÉDITS SEULS : « tout est
// inclus, seul le volume change » — aucune fonctionnalité bridée, aucun quota. Le
// compteur est donc le SEUL levier, ce qui l'oblige à dire la vérité sur la valeur :
//
//   • une app sur mesure vaut 600 cr (14,70 € au tarif d'entrée). Une agence la
//     facturerait 2 000 €. À 250 cr elle était bradée, et le forfait 49 € en offrait
//     8 par mois — soit bien plus que ce dont un artisan a besoin dans une vie.
//   • une question reste à 3 cr : quasi gratuite. C'est elle qui crée l'habitude,
//     elle ne doit JAMAIS faire hésiter.
//
// Ces valeurs sont exactement celles annoncées sur /tarifs (MONTH_MIX) : le panier
// affiché y est recalculé depuis cette constante et tombe PILE sur le volume vendu.
// ─────────────────────────────────────────────────────────────────────────────
export const ACTION_CREDITS = {
  /** Une question au copilote (réponse texte). */
  question: 3,
  /** Une écriture directe dans le workspace (« ajoute un client Jean »). */
  donnee: 5,
  /** Lire une photo / un document (OCR), PAR FICHIER. */
  lecture_fichier: 10,
  /** Une dictée vocale transformée en devis structuré. */
  dictee_devis: 15,
  /** Annoter / transformer un document existant. */
  annotation: 15,
  /** Un livrable officiel : devis PDF, facture, courrier, PV, attestation. */
  document: 30,
  /** Un passage d'agent (veille simple, sans rédaction IA). */
  agent_passage: 10,
  /** Un passage d'agent qui RÉDIGE (relance, e-mail, rapport). */
  agent_redaction: 25,
  /** Un passage d'agent qui AGIT : boucle agentique (outils workspace, jusqu'à 10
   *  itérations × 4 fiches). Coût réel au plafond : 0,165 $ ≈ 0,15 € — 10× une simple
   *  relance. À 25 crédits la marge tombait à 75 %, sous la cible de 85-88 %. C'est
   *  aussi l'action la plus VALUABLE du produit (« occupe-t'en » : l'agent fait le
   *  travail, pas seulement l'alerte) : 50 crédits ≈ 1,22 € → marge ~88 %. */
  agent_action: 50,
  /** Un rendu client (« voilà à quoi ressemblera votre salle de bain »), joint au devis.
   *  Coût réel MESURÉ : 0,0388 $ ≈ 0,036 € — de loin l'action la plus CHÈRE du produit
   *  hors génération d'app (une question au copilote coûte 0,003 $, soit 13× moins).
   *  40 crédits ≈ 0,98 € au tarif d'entrée → marge ~96 %, et le prix reste juste : un
   *  artisan qui MONTRE le résultat gagne le chantier. Ça vaut plus qu'un document. */
  rendu_client: 40,
  /** Modifier une application existante (≈ 1/4 du prix d'une création). */
  modification_app: 150,
  /** Créer une application sur mesure. LE livrable phare du produit — voir l'en-tête. */
  application: 600,
} as const;

export type ActionCredit = keyof typeof ACTION_CREDITS;

/** Crédits offerts à la création d'un compte Free (miroir de handle_new_user).
 *
 *  DOIT rester ≥ ACTION_CREDITS.application : le plan Free promet « Créez votre
 *  première application », et le hold est prélevé d'AVANCE. À 300 crédits pour une
 *  app à 600, l'essai gratuit se serait heurté à un mur « crédits insuffisants »
 *  avant d'avoir rien produit — la pire première impression possible.
 *  700 = 1 app (600) + de quoi poser quelques questions ensuite.
 *  ⚠️ Miroir SQL : supabase/migrations/052_signup_credits_700.sql. */
export const SIGNUP_FREE_CREDITS = 700;

// ── Paliers de crédits ───────────────────────────────────────────────────────
// Un seul plan payant en self-service (Pro). Toutes les fonctionnalités produit
// sont incluses ; le prix ne varie qu'avec le volume de crédits. Le premium
// (marque blanche, multi-métiers, SSO, revente) passe par l'offre Entreprise,
// sur devis (voir ENTERPRISE ci-dessous).

// Grille dégressive resserrée (2026-07-09) : 6 paliers, regroupés en 2 cartes
// (Solo/TPE ≤ 3 000, Business ≤ 25 000) sur la page tarifs. Un seul plan payant,
// toutes les fonctionnalités incluses ; seul le VOLUME de crédits change. Le
// meilleur tarif au crédit est intégré dans le saut de palier (dégressif jusqu'à
// -22 %), c'est ce qui pousse à l'upgrade — pas un blocage de features.
// ⚠️ Chaque palier a besoin de son Price Stripe (STRIPE_PRICE_PRO_<crédits>).
//    Créer les prix AVANT de déployer (sinon checkout 503) : scripts/stripe-sync-prices.ts.
const PRO_TIERS: CreditTier[] = [
  // Grille DÉCIDÉE par le user le 2026-07-10 (stratégie « généreux à l'entrée, marge
  // sur l'expansion Équipe/Entreprise »). Marges ~85-88 % (COGS 0,003 €/cr, plancher
  // ~70 % respecté). ⚠️ NON strictement dégressive : 3000/89 (0,0297 €/cr) est plus
  // cher au crédit que 5000/129 (0,0258 €/cr) → il joue le rôle de LEURRE qui pousse
  // vers le palier recommandé 5000. Au-delà de 5000 : recharge in-app ou Équipe.
  { credits: 2000, priceEur: 49 }, //  0,0245 €/cr — entrée généreuse (~85 %)
  { credits: 3000, priceEur: 89 }, //  0,0297 €/cr — leurre → pousse vers 5000 (~88 %)
  { credits: 5000, priceEur: 129 }, // 0,0258 €/cr — RECOMMANDÉ (~86 %)
];

// ── Traduire des crédits en euros / en mois d'agent ──────────────────────────
// Source UNIQUE de ces deux conversions. Elles étaient jusqu'ici recopiées à la
// main dans la landing et la page tarifs, où elles ont fini par mentir : la
// landing annonçait « un agent ≈ 300 crédits/mois » alors qu'il en consomme 550.

/** Jours ouvrés retenus pour annoncer le coût MENSUEL d'un agent quotidien. */
export const AGENT_WORKING_DAYS_PER_MONTH = 22;

/** Ce que consomme un agent qui RÉDIGE (relance, compte-rendu) chaque jour ouvré. */
export const AGENT_CREDITS_PER_MONTH =
  ACTION_CREDITS.agent_redaction * AGENT_WORKING_DAYS_PER_MONTH;

/** Ce que « vaut » un crédit au palier d'ENTRÉE, c'est-à-dire le TARIF LE PLUS CHER
 *  (49 € / 2 000 cr = 0,0245 €). On annonce toujours au prix le plus cher : un client
 *  qui monte de palier paiera MOINS que ce qu'on lui a promis, jamais l'inverse. */
export function creditsToEur(credits: number): number {
  const entry = PRO_TIERS[0];
  return (credits * entry.priceEur) / entry.credits;
}

// Paliers ÉQUIPE (Pro + collaboration). Grille FINALE user 2026-07-10. 5000 = Pro
// 5000 (129) + 50 € d'add-on collaboration = 179 ; 10000/25000 propres à Équipe.
// Source unique partagée par PLANS.equipe (facturation) ET EQUIPE (page tarifs).
// ⚠️ Chaque palier a son Price Stripe (STRIPE_PRICE_EQUIPE_<crédits>[_ANNUAL]).
const EQUIPE_TIERS: CreditTier[] = [
  { credits: 5000, priceEur: 179 },
  { credits: 10000, priceEur: 449 },
  { credits: 25000, priceEur: 999 },
];

// Anciens paliers RETIRÉS de la vente, conservés UNIQUEMENT pour reconnaître au
// webhook les abonnements déjà en cours (leur renouvellement doit continuer à
// créditer). Jamais proposés à l'achat (isValidTier ne les accepte pas). Leurs
// Price Stripe (STRIPE_PRICE_PRO_<crédits>) restent donc en place tant qu'un
// abonné y est. Voir findTierByPriceId (lib/stripe.ts).
export const LEGACY_PRO_TIERS: CreditTier[] = [
  // Retirés de la vente : conservés pour créditer les abonnements en cours.
  { credits: 1000, priceEur: 49 },
  { credits: 2000, priceEur: 89 },
  { credits: 15000, priceEur: 579 },
  { credits: 25000, priceEur: 949 },
  { credits: 4000, priceEur: 199 },
  { credits: 8000, priceEur: 399 },
  { credits: 12000, priceEur: 579 },
  { credits: 20000, priceEur: 949 },
  { credits: 30000, priceEur: 1399 },
  { credits: 40000, priceEur: 1799 },
  { credits: 50000, priceEur: 2199 },
  { credits: 75000, priceEur: 3699 },
  { credits: 100000, priceEur: 4399 },
  { credits: 150000, priceEur: 6490 },
  { credits: 200000, priceEur: 8499 },
];

// ── Définition des plans ─────────────────────────────────────────────────────

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    tagline: "Le tour du propriétaire",
    audience: "Pour tester Biltia, sans carte bancaire",
    tiers: [],
    signupCredits: SIGNUP_FREE_CREDITS,
    features: [
      `${SIGNUP_FREE_CREDITS} crédits offerts pour découvrir (non renouvelables)`,
      "Créez votre première application",
      "Générez un vrai devis ou document",
      "1 utilisateur, 1 application",
      "Sans crédits mensuels ni mise en ligne",
    ],
    limits: {
      maxApps: 1,
      maxUsers: 1,
      liveDeploy: false,
      voice: false,
      offlineFirst: false,
      sharedWorkspace: false,
      whiteLabel: false,
      customUrl: false,
      multiNiche: false,
      accountingConnectors: false,
      autoMessaging: false,
      agentActions: false,
    },
  },

  pro: {
    id: "pro",
    name: "Pro",
    tagline: "L'outil complet, sans limite de features",
    audience: "Pour les indépendants, artisans et TPE",
    tiers: PRO_TIERS,
    defaultCredits: 5000,
    features: [
      "Tout l'outil, aucune fonctionnalité bridée",
      "Apps, devis, questions et agents selon vos crédits IA",
      "Commande vocale et mode hors-ligne",
      "Workspace partagé, sièges inclus",
      "Connecteurs comptables inclus",
      "Crédits renouvelés chaque mois",
    ],
    limits: {
      maxApps: UNLIMITED,
      maxUsers: UNLIMITED,
      liveDeploy: true,
      voice: true,
      offlineFirst: true,
      sharedWorkspace: true,
      whiteLabel: false, // réservé à l'offre Entreprise (sur devis)
      customUrl: false, // réservé à l'offre Entreprise (sur devis)
      multiNiche: false, // réservé à l'offre Entreprise (sur devis)
      accountingConnectors: true,
      autoMessaging: true,
      agentActions: true,
    },
  },

  // ÉQUIPE = Pro + collaboration (invitation, portail client/sous-traitant, agents
  // collaboratifs). Mêmes limites produit que Pro ; le déblocage collaboration se
  // fait via l'entitlement (subscriptions.plan="equipe" → collaboration=true).
  equipe: {
    id: "equipe",
    name: "Équipe",
    tagline: "Pour faire travailler vos salariés, clients et sous-traitants dans Biltia.",
    audience: "Artisans avec salariés, PME",
    tiers: EQUIPE_TIERS,
    defaultCredits: 5000,
    features: [
      "Tout le plan Pro, pour toute l'équipe",
      "Invitez vos collaborateurs : rôles et permissions",
      "Comptes employés : chacun ne voit que ses chantiers",
      "Portail client et sous-traitant, partage sécurisé",
      "Agents qui assignent, relancent et rendent compte",
      "Support prioritaire",
    ],
    limits: {
      maxApps: UNLIMITED,
      maxUsers: UNLIMITED,
      liveDeploy: true,
      voice: true,
      offlineFirst: true,
      sharedWorkspace: true,
      whiteLabel: false,
      customUrl: false,
      multiNiche: false,
      accountingConnectors: true,
      autoMessaging: true,
      agentActions: true,
    },
  },
};

export const PLAN_LIST: Plan[] = [PLANS.free, PLANS.pro];
export const PAID_PLAN_IDS: PlanId[] = ["pro", "equipe"];

// ── Plan Entreprise (sur devis, non facturé en self-service) ──────────────────
// Pas un PlanId : pas de Stripe Price, pas de paliers. Purement présentation +
// point de contact commercial. Le volume et le contrat sont négociés.

export const ENTERPRISE = {
  name: "Entreprise",
  tagline: "Sur devis",
  audience: "Pour les grands comptes et le secteur public",
  contactEmail: "contact@biltia.com",
  features: [
    "Capacité IA personnalisée, au meilleur tarif",
    "Marque blanche et URL personnalisée",
    "Multi-métiers (plusieurs activités)",
    "SSO et provisioning des comptes",
    "Contrat, DPA et hébergement dédié",
    "SLA, support et onboarding dédiés",
  ],
} as const;

// ── Offre Équipe (collaboration) ─────────────────────────────────────────────
// PRÉSENTATION UNIQUEMENT pour l'instant : le branchement Stripe et le flag
// d'entitlement `collaboration` (gates équipe/portail/périmètre + split agent)
// viennent ensuite. Équipe = Pro + LA COLLABORATION : tout ce qui « fait entrer
// quelqu'un d'autre dans Biltia » (inviter des salariés, comptes employés à
// périmètre, portail client/sous-traitant, rôles, agents qui interagissent avec
// l'externe). Le reste (créer/modifier, devis, questions, agents SOLO) est déjà
// dans Pro. L'add-on collaboration = +50 € sur le plan Pro 5 000 (129 → 179). Les
// paliers 10 000 et 25 000 n'ont pas d'équivalent Pro (Pro s'arrête à 5 000) : ils
// sont propres à Équipe. Volumes ≥ 5 000 : collaborer suppose déjà un usage sérieux.
export const COLLABORATION_ADDON_EUR = 50;

export const EQUIPE = {
  name: "Équipe",
  tagline: "Pour faire travailler vos salariés, clients et sous-traitants dans Biltia.",
  audience: "Artisans avec salariés, PME",
  /** 5 000 = Pro 5 000 (129 €) + 50 €. 10 000/25 000 sont propres à Équipe.
   *  Source partagée avec PLANS.equipe.tiers (pas de divergence de prix). */
  tiers: EQUIPE_TIERS,
  features: [
    "Tout le plan Pro, pour toute l'équipe",
    "Invitez vos collaborateurs : rôles et permissions",
    "Comptes employés : chacun ne voit que ses chantiers",
    "Portail client et sous-traitant, partage sécurisé",
    "Agents qui assignent, relancent et rendent compte",
    "Support prioritaire",
  ],
} as const;

// ── Packs de crédits (recharges one-time, NON expirables) ─────────────────────
// Achetés à l'unité quand le solde est bas. Volontairement PLUS CHERS au crédit
// que l'abonnement équivalent : recharger doit toujours coûter plus que monter
// d'un cran de forfait, pour pousser l'upgrade (modèle usage-based). One-time
// (Stripe mode:payment), crédités dans user_credits.topup_balance (ne périme
// jamais, cf. migration 027).
export interface CreditPack {
  credits: number;
  priceEur: number;
}

export const CREDIT_PACKS: CreditPack[] = [
  { credits: 1000, priceEur: 29 }, //   0,029 €/cr — dépannage ponctuel
  { credits: 3000, priceEur: 99 }, //   0,033 €/cr
  { credits: 10000, priceEur: 499 }, // 0,050 €/cr
  { credits: 25000, priceEur: 1099 }, // 0,044 €/cr
];

export function getPack(credits: number): CreditPack | undefined {
  return CREDIT_PACKS.find((p) => p.credits === credits);
}

export function isValidPack(credits: number): boolean {
  return !!getPack(credits);
}

/** Nom de la variable d'env contenant le Stripe Price ID (one-time) d'un pack.
 *  Ex : 1000 → "STRIPE_PACK_1000". Retourne le NOM, jamais la valeur (pas de secret). */
export function stripePackEnvVar(credits: number): string {
  return `STRIPE_PACK_${credits}`;
}

// ── Regroupement des paliers par profil (pour le sélecteur de crédits) ────────
// Le plan Pro couvre tous les profils : ce découpage sert UNIQUEMENT à orienter
// l'utilisateur ("c'est destiné à qui") et à rendre 2 cartes sur la page tarifs,
// pas à la facturation. Solo/TPE = 1 000 à 3 000 ; Business = 10 000 à 25 000.
// Au-delà de 25 000 : offre Entreprise, sur devis.

export const TIER_SEGMENTS: { label: string; maxCredits: number }[] = [
  { label: "Solo / TPE", maxCredits: 3000 },
  { label: "Business", maxCredits: UNLIMITED },
];

/** Segment (profil) auquel appartient un volume de crédits. */
export function segmentForCredits(credits: number): string {
  return (TIER_SEGMENTS.find((s) => credits <= s.maxCredits) ?? TIER_SEGMENTS[TIER_SEGMENTS.length - 1]).label;
}

/** Paliers d'un plan regroupés par profil, dans l'ordre, groupes vides omis. */
export function groupTiers(tiers: CreditTier[]): { label: string; tiers: CreditTier[] }[] {
  return TIER_SEGMENTS
    .map((s, i) => {
      const min = i === 0 ? 0 : TIER_SEGMENTS[i - 1].maxCredits;
      return { label: s.label, tiers: tiers.filter((t) => t.credits > min && t.credits <= s.maxCredits) };
    })
    .filter((g) => g.tiers.length > 0);
}

// ── i18n : textes des plans en anglais ───────────────────────────────────────
// Le contenu FR (name/tagline/audience/features) reste la source ; on surcharge
// avec l'anglais quand l'interface est en EN. Les prix/limites/ids ne changent pas.
type PlanText = { name: string; tagline: string; audience: string; features: string[] };
const PLAN_EN: Record<string, PlanText> = {
  free: {
    name: "Free",
    tagline: "The guided tour",
    audience: "To try Biltia, no credit card",
    features: [
      `${SIGNUP_FREE_CREDITS} free credits to explore (non-renewable)`,
      "Create your first app",
      "Generate a real quote or document",
      "1 user, 1 app",
      "No monthly credits, no publishing",
    ],
  },
  pro: {
    name: "Pro",
    tagline: "The complete tool, no feature limits",
    audience: "For freelancers, tradespeople and small businesses",
    features: [
      "The whole tool, nothing held back",
      "Apps, quotes, questions and agents, per your AI credits",
      "Voice commands and offline mode",
      "Shared workspace, seats included",
      "Accounting connectors included",
      "Credits renewed every month",
    ],
  },
  equipe: {
    name: "Team",
    tagline: "Put your staff, clients and subcontractors to work inside Biltia.",
    audience: "Tradespeople with staff, SMBs",
    features: [
      "The whole Pro plan, for the whole team",
      "Invite your teammates: roles and permissions",
      "Employee accounts: each sees only their own job sites",
      "Client and subcontractor portal, secure sharing",
      "Agents that assign, follow up and report back",
      "Priority support",
    ],
  },
  enterprise: {
    name: "Enterprise",
    tagline: "Custom quote",
    audience: "For large accounts and the public sector",
    features: [
      "Custom AI capacity, at the best rate",
      "White-label and custom URL",
      "Multi-trade (several activities)",
      "SSO and account provisioning",
      "Contract, DPA and dedicated hosting",
      "Dedicated SLA, support and onboarding",
    ],
  },
};

const TIER_SEGMENT_EN: Record<string, string> = {
  "Solo / TPE": "Solo / Small biz",
  "Business": "Business",
};

/** Plan (free/pro/equipe) avec textes EN si l'interface est en anglais. */
export function localizePlan<T extends { id: PlanId; name: string; tagline: string; audience: string; features: string[] }>(plan: T, locale: Locale): T {
  if (locale !== "en") return plan;
  const en = PLAN_EN[plan.id];
  return en ? { ...plan, ...en } : plan;
}
// ENTERPRISE et EQUIPE sont figés `as const` (types littéraux en lecture seule) :
// on ne peut pas y réinjecter des chaînes EN sans élargir le type de retour.
export type LocalizedOffer = {
  name: string;
  tagline: string;
  audience: string;
  features: readonly string[];
};

/** Offre Entreprise (sur devis) avec textes EN. */
export function localizeEnterprise(locale: Locale): LocalizedOffer & { contactEmail: string } {
  return locale === "en" ? { ...ENTERPRISE, ...PLAN_EN.enterprise } : ENTERPRISE;
}
/** Offre Équipe (page tarifs) avec textes EN. */
export function localizeEquipe(locale: Locale): LocalizedOffer & { tiers: CreditTier[] } {
  return locale === "en" ? { ...EQUIPE, ...PLAN_EN.equipe } : EQUIPE;
}
/** Libellé de segment de crédits (Solo / TPE · Business) traduit si EN. */
export function tierSegmentLabel(label: string, locale: Locale): string {
  return locale === "en" ? TIER_SEGMENT_EN[label] ?? label : label;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function getPlan(id: PlanId): Plan {
  return PLANS[id];
}

export function isPaidPlan(id: PlanId): id is "pro" | "equipe" {
  return id !== "free";
}

/** Retourne le palier {credits, priceEur} d'un plan payant, ou undefined. */
export function getTier(planId: PlanId, credits: number): CreditTier | undefined {
  return getPlan(planId).tiers.find((t) => t.credits === credits);
}

/** Vrai si (plan, credits) est une combinaison de facturation valide. */
export function isValidTier(planId: PlanId, credits: number): boolean {
  return isPaidPlan(planId) && !!getTier(planId, credits);
}

export function getLimits(planId: PlanId): PlanLimits {
  return getPlan(planId).limits;
}

// ── Cycle de facturation (mensuel / annuel) ──────────────────────────────────
// L'annuel offre 2 mois : total/an = mensuel × 10 (soit ~17 % d'économie). Les
// prix mensuels de PRO_TIERS restent la référence ; l'annuel s'en déduit.

export type BillingCycle = "monthly" | "annual";

/** Nombre de mois facturés sur un engagement annuel (2 mois offerts). */
export const ANNUAL_MONTHS_BILLED = 10;

/** Total facturé sur un an à partir d'un prix mensuel. */
export function annualTotalEur(monthlyEur: number): number {
  return monthlyEur * ANNUAL_MONTHS_BILLED;
}

/** Équivalent mensuel affiché quand on paie à l'année (arrondi à l'euro). */
export function annualMonthlyEur(monthlyEur: number): number {
  return Math.round((monthlyEur * ANNUAL_MONTHS_BILLED) / 12);
}

/** Prix mensuel AFFICHÉ d'un palier selon le cycle (annuel = équivalent/mois). */
export function tierDisplayMonthlyEur(tier: CreditTier, cycle: BillingCycle): number {
  return cycle === "annual" ? annualMonthlyEur(tier.priceEur) : tier.priceEur;
}

/**
 * Nom de la variable d'environnement contenant le Stripe Price ID de ce palier.
 * Ex : ("pro", 4000) → "STRIPE_PRICE_PRO_4000" ; annuel → suffixe "_ANNUAL".
 * NB : retourne le NOM de la variable, jamais sa valeur (pas de secret ici).
 */
export function stripePriceEnvVar(planId: PlanId, credits: number, cycle: BillingCycle = "monthly"): string {
  const base = `STRIPE_PRICE_${planId.toUpperCase()}_${credits}`;
  return cycle === "annual" ? `${base}_ANNUAL` : base;
}

/** Formate un montant en euros à la française : 1799 → "1 799 €". */
export function formatEur(amount: number): string {
  return `${amount.toLocaleString("fr-FR")} €`;
}
