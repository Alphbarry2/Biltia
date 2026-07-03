// ─────────────────────────────────────────────────────────────────────────────
// BATIFY — Plans & tarification (SOURCE DE VÉRITÉ)
//
// Ce fichier est CLIENT-SAFE : aucune donnée secrète (pas de clé Stripe, pas de
// price ID). Il est importé aussi bien par la landing que par les routes serveur.
// La résolution des Stripe Price IDs se fait côté serveur uniquement
// (voir lib/stripe.ts), à partir du nom de variable d'env retourné ici.
//
// Tarifs validés le 2026-07-02.
// ─────────────────────────────────────────────────────────────────────────────

export type PlanId = "free" | "pro" | "business";

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
}

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
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

/** Crédits offerts à la création d'un compte Free (miroir de handle_new_user). */
export const SIGNUP_FREE_CREDITS = 10;

// ── Paliers de crédits ───────────────────────────────────────────────────────
// Pro et Business partagent les mêmes volumes de crédits, à des prix différents.

const PRO_TIERS: CreditTier[] = [
  { credits: 100, priceEur: 49 },
  { credits: 400, priceEur: 199 },
  { credits: 800, priceEur: 399 },
  { credits: 1200, priceEur: 579 },
  { credits: 2000, priceEur: 949 },
  { credits: 4000, priceEur: 1799 },
  { credits: 5000, priceEur: 2199 },
  { credits: 7500, priceEur: 3699 },
  { credits: 10000, priceEur: 4399 },
];

const BUSINESS_TIERS: CreditTier[] = [
  { credits: 100, priceEur: 99 },
  { credits: 400, priceEur: 399 },
  { credits: 800, priceEur: 799 },
  { credits: 1200, priceEur: 1149 },
  { credits: 2000, priceEur: 1899 },
  { credits: 4000, priceEur: 3699 },
  { credits: 5000, priceEur: 4399 },
  { credits: 7500, priceEur: 6499 },
  { credits: 10000, priceEur: 8499 },
];

// ── Définition des plans ─────────────────────────────────────────────────────

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    tagline: "Pour découvrir Batify",
    tiers: [],
    signupCredits: SIGNUP_FREE_CREDITS,
    features: [
      "10 crédits à l'inscription (non renouvelables)",
      "1 application",
      "1 utilisateur",
      "Documents & apps",
      "Pas de déploiement Live",
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
    },
  },

  pro: {
    id: "pro",
    name: "Pro",
    tagline: "Pour les artisans et PME",
    tiers: PRO_TIERS,
    defaultCredits: 400,
    features: [
      "Crédits mensuels, renouvelés chaque mois",
      "Apps Live illimitées",
      "Commande vocale",
      "Offline-first",
      "Workspace partagé",
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
      accountingConnectors: false,
    },
  },

  business: {
    id: "business",
    name: "Business",
    tagline: "Pour les entreprises et revendeurs",
    tiers: BUSINESS_TIERS,
    defaultCredits: 400,
    features: [
      "Tout le plan Pro",
      "Marque blanche",
      "URL personnalisée",
      "Multi-niche",
      "Connecteurs comptables",
    ],
    limits: {
      maxApps: UNLIMITED,
      maxUsers: UNLIMITED,
      liveDeploy: true,
      voice: true,
      offlineFirst: true,
      sharedWorkspace: true,
      whiteLabel: true,
      customUrl: true,
      multiNiche: true,
      accountingConnectors: true,
    },
  },
};

export const PLAN_LIST: Plan[] = [PLANS.free, PLANS.pro, PLANS.business];
export const PAID_PLAN_IDS: PlanId[] = ["pro", "business"];

// ── Helpers ──────────────────────────────────────────────────────────────────

export function getPlan(id: PlanId): Plan {
  return PLANS[id];
}

export function isPaidPlan(id: PlanId): id is "pro" | "business" {
  return id === "pro" || id === "business";
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

/**
 * Nom de la variable d'environnement contenant le Stripe Price ID de ce palier.
 * Ex : ("pro", 400) → "STRIPE_PRICE_PRO_400".
 * NB : retourne le NOM de la variable, jamais sa valeur (pas de secret ici).
 */
export function stripePriceEnvVar(planId: PlanId, credits: number): string {
  return `STRIPE_PRICE_${planId.toUpperCase()}_${credits}`;
}

/** Formate un montant en euros à la française : 1799 → "1 799 €". */
export function formatEur(amount: number): string {
  return `${amount.toLocaleString("fr-FR")} €`;
}
