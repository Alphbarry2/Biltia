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

export type PlanId = "free" | "pro";

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

/** Crédits offerts à la création d'un compte Free (miroir de handle_new_user).
 *  300 = de quoi créer 1 app (hold 300, réconcilié au réel) + du courant ensuite. */
export const SIGNUP_FREE_CREDITS = 300;

// ── Paliers de crédits ───────────────────────────────────────────────────────
// Un seul plan payant en self-service (Pro). Toutes les fonctionnalités produit
// sont incluses ; le prix ne varie qu'avec le volume de crédits. Le premium
// (marque blanche, multi-métiers, SSO, revente) passe par l'offre Entreprise,
// sur devis (voir ENTERPRISE ci-dessous).

// Échelle ×10 (crédits fins, sans fraction). Prix en euros INCHANGÉS.
// ⚠️ Paliers 2 000 et 30 000 = NOUVEAUX (comblent les sauts) : prix interpolés,
//    à confirmer avant de créer les Prices Stripe.
const PRO_TIERS: CreditTier[] = [
  { credits: 1000, priceEur: 49 },
  { credits: 2000, priceEur: 99 }, // NEW
  { credits: 4000, priceEur: 199 },
  { credits: 8000, priceEur: 399 },
  { credits: 12000, priceEur: 579 },
  { credits: 20000, priceEur: 949 },
  { credits: 30000, priceEur: 1399 }, // NEW
  { credits: 40000, priceEur: 1799 },
  { credits: 50000, priceEur: 2199 },
  { credits: 75000, priceEur: 3699 },
  { credits: 100000, priceEur: 4399 },
  // Haut de gamme self-service (remplace l'ancien plafond Business, mais au VOLUME
  // et non en refacturant les mêmes crédits) : ~0,043 €/crédit, marge ≥ 91 %.
  { credits: 150000, priceEur: 6490 }, // NEW — à confirmer avant Prices Stripe
  { credits: 200000, priceEur: 8499 }, // NEW — = ancien plafond Business 100k, ici pour 200k crédits
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
      "300 crédits offerts pour découvrir (non renouvelables)",
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
    },
  },

  pro: {
    id: "pro",
    name: "Pro",
    tagline: "L'outil complet, sans limite de features",
    audience: "Pour les indépendants, artisans et TPE",
    tiers: PRO_TIERS,
    defaultCredits: 4000,
    features: [
      "Tout l'outil, aucune fonctionnalité bridée",
      "Applications en ligne illimitées",
      "Commande vocale et mode hors-ligne",
      "Workspace partagé, sièges illimités",
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
    },
  },
};

export const PLAN_LIST: Plan[] = [PLANS.free, PLANS.pro];
export const PAID_PLAN_IDS: PlanId[] = ["pro"];

// ── Plan Entreprise (sur devis, non facturé en self-service) ──────────────────
// Pas un PlanId : pas de Stripe Price, pas de paliers. Purement présentation +
// point de contact commercial. Le volume et le contrat sont négociés.

export const ENTERPRISE = {
  name: "Entreprise",
  tagline: "Sur devis",
  audience: "Pour les grands comptes et le secteur public",
  contactEmail: "contact@biltia.com",
  features: [
    "Tout le plan Pro, en volume sur mesure",
    "Marque blanche et URL personnalisée",
    "Multi-métiers (plusieurs activités)",
    "SSO et provisioning des comptes",
    "Contrat, DPA et hébergement dédié",
    "SLA, support et onboarding dédiés",
  ],
} as const;

// ── Regroupement des paliers par profil (pour le sélecteur de crédits) ────────
// Le plan Pro couvre tous les profils : ce découpage sert UNIQUEMENT à orienter
// l'utilisateur ("c'est destiné à qui"), pas à la facturation. Un TPE vit dans
// 1 000 a 4 000, une PME dans 8 000 a 20 000 ; au-dela = agences / revendeurs /
// gros volumes (surtout de l'ancrage tarifaire).

export const TIER_SEGMENTS: { label: string; maxCredits: number }[] = [
  { label: "Indépendant / TPE", maxCredits: 4000 },
  { label: "PME", maxCredits: 20000 },
  { label: "Grande équipe / agence", maxCredits: UNLIMITED },
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

// ── Helpers ──────────────────────────────────────────────────────────────────

export function getPlan(id: PlanId): Plan {
  return PLANS[id];
}

export function isPaidPlan(id: PlanId): id is "pro" {
  return id === "pro";
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
