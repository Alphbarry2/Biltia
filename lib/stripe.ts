// ─────────────────────────────────────────────────────────────────────────────
// STRIPE — client + résolution des Price IDs. STRICTEMENT CÔTÉ SERVEUR.
//
// Ne jamais importer depuis un composant client : ce module lit STRIPE_SECRET_KEY
// et la table de correspondance des Price IDs (variables d'environnement).
// La data tarifaire publique vit dans lib/plans.ts (client-safe).
// ─────────────────────────────────────────────────────────────────────────────

import Stripe from "stripe";
import {
  PAID_PLAN_IDS,
  getPlan,
  stripePriceEnvVar,
  type BillingCycle,
  type CreditTier,
  type PlanId,
} from "./plans";

const BILLING_CYCLES: BillingCycle[] = ["monthly", "annual"];

let _stripe: Stripe | null | undefined;

/**
 * Retourne le client Stripe, ou `null` si `STRIPE_SECRET_KEY` n'est pas
 * configurée (permet aux routes de dégrader proprement en 503).
 */
export function getStripe(): Stripe | null {
  if (_stripe !== undefined) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  _stripe = key ? new Stripe(key) : null;
  return _stripe;
}

/**
 * Résout le Stripe Price ID d'un palier depuis l'environnement.
 * Ex : ("pro", 400) lit la variable STRIPE_PRICE_PRO_400.
 * Retourne `null` si non configuré.
 */
export function resolvePriceId(
  planId: PlanId,
  credits: number,
  cycle: BillingCycle = "monthly"
): string | null {
  const varName = stripePriceEnvVar(planId, credits, cycle);
  return process.env[varName] ?? null;
}

/**
 * Correspondance inverse : à partir d'un Price ID reçu d'un webhook Stripe,
 * retrouve le plan + palier (+ cycle) associés. Les deux cycles sont testés.
 * Retourne `null` si inconnu. Les crédits attribués sont les mêmes quel que
 * soit le cycle, donc le webhook peut ignorer `cycle`.
 */
export function findTierByPriceId(
  priceId: string
): { plan: PlanId; tier: CreditTier; cycle: BillingCycle } | null {
  for (const planId of PAID_PLAN_IDS) {
    for (const tier of getPlan(planId).tiers) {
      for (const cycle of BILLING_CYCLES) {
        if (resolvePriceId(planId, tier.credits, cycle) === priceId) {
          return { plan: planId, tier, cycle };
        }
      }
    }
  }
  return null;
}
