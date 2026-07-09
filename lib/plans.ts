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

/** Crédits offerts à la création d'un compte Free (miroir de handle_new_user).
 *  300 = de quoi créer 1 app (hold 300, réconcilié au réel) + du courant ensuite. */
export const SIGNUP_FREE_CREDITS = 300;

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
  { credits: 1000, priceEur: 49 }, //   0,049 €/cr
  { credits: 2000, priceEur: 89 }, //   0,045 €/cr  (-9 %)
  { credits: 3000, priceEur: 129 }, //  0,043 €/cr  (-12 %)
  { credits: 10000, priceEur: 399 }, // 0,040 €/cr  (-19 %)
  { credits: 15000, priceEur: 579 }, // 0,039 €/cr  (-21 %)
  { credits: 25000, priceEur: 949 }, // 0,038 €/cr  (-22 %)
];

// Anciens paliers RETIRÉS de la vente, conservés UNIQUEMENT pour reconnaître au
// webhook les abonnements déjà en cours (leur renouvellement doit continuer à
// créditer). Jamais proposés à l'achat (isValidTier ne les accepte pas). Leurs
// Price Stripe (STRIPE_PRICE_PRO_<crédits>) restent donc en place tant qu'un
// abonné y est. Voir findTierByPriceId (lib/stripe.ts).
export const LEGACY_PRO_TIERS: CreditTier[] = [
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
    defaultCredits: 1000,
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
    "Capacité IA personnalisée, au meilleur tarif",
    "Marque blanche et URL personnalisée",
    "Multi-métiers (plusieurs activités)",
    "SSO et provisioning des comptes",
    "Contrat, DPA et hébergement dédié",
    "SLA, support et onboarding dédiés",
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
  { credits: 1000, priceEur: 59 }, //  0,059 €/cr  (vs Solo 1 000 à 49 €)
  { credits: 3000, priceEur: 149 }, // 0,050 €/cr  (vs Pro 3 000 à 129 €)
  { credits: 10000, priceEur: 449 }, // 0,045 €/cr (vs Business 10 000 à 399 €)
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
