// ─────────────────────────────────────────────────────────────────────────────
// STRIPE REVENUE — MRR et historique de revenus RÉELS, lus en direct sur Stripe.
//
// Pourquoi pas un ledger local ? La table `subscriptions` ne stocke pas le
// montant réel de chaque abonnement (schéma prod), et dupliquer cette donnée
// créerait une nouvelle source de drift à maintenir. Stripe a déjà tout
// l'historique réel depuis la mise en prod — on l'interroge directement.
//
// STRICTEMENT LECTURE SEULE : uniquement `list`/aucune écriture. Aucun risque
// de facturation ou de mutation d'abonnement depuis ce module.
// ─────────────────────────────────────────────────────────────────────────────

import type Stripe from "stripe";

/** Statuts Stripe considérés comme « payants actifs » (cohérent avec stats/route.ts). */
const PAID_STATUSES = new Set(["active", "trialing", "past_due"]);

/** Normalise le prix d'un item d'abonnement en équivalent MENSUEL, en euros. */
function itemMonthlyEur(item: Stripe.SubscriptionItem): number {
  const price = item.price;
  if (!price || price.unit_amount == null) return 0;
  const qty = item.quantity ?? 1;
  const amount = (price.unit_amount / 100) * qty;
  const interval = price.recurring?.interval ?? "month";
  const count = price.recurring?.interval_count ?? 1;
  switch (interval) {
    case "year":
      return amount / (12 * count);
    case "week":
      return (amount * 52) / (12 * count);
    case "day":
      return (amount * 365) / (12 * count);
    default:
      return amount / count;
  }
}

function customerIdOf(ref: string | Stripe.Customer | Stripe.DeletedCustomer | null): string | null {
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}

// ── Cache mémoire court (évite de marteler l'API Stripe à chaque clic) ──────
type CacheEntry<T> = { value: T; expiresAt: number };
const CACHE_TTL_MS = 90_000;
const cache = new Map<string, CacheEntry<unknown>>();

async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value as T;
  const value = await fn();
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

export type MrrSnapshot = { mrrEur: number; payingCount: number };

/**
 * MRR réel : pagine tous les abonnements Stripe (tous statuts), ne garde que
 * les statuts « payants actifs », exclut les clients fondateur/test, et somme
 * le prix RÉEL de chaque abonnement (mensualisé si annuel/hebdo).
 */
export async function getCurrentMrrEur(
  stripe: Stripe,
  excludedCustomerIds: Set<string>
): Promise<MrrSnapshot> {
  return cached(`mrr:${excludedCustomerIds.size}`, async () => {
    let mrrEur = 0;
    let payingCount = 0;
    const subs = stripe.subscriptions.list({
      status: "all",
      limit: 100,
      expand: ["data.items.data.price"],
    });
    for await (const sub of subs) {
      if (!PAID_STATUSES.has(sub.status)) continue;
      const customerId = customerIdOf(sub.customer);
      if (customerId && excludedCustomerIds.has(customerId)) continue;
      for (const item of sub.items.data) mrrEur += itemMonthlyEur(item);
      payingCount += 1;
    }
    return { mrrEur: Math.round(mrrEur * 100) / 100, payingCount };
  });
}

export type RevenueDay = { day: string; amountEur: number };

/**
 * Revenus ENCAISSÉS réels par jour sur la période — factures payées
 * (`amount_paid`), pas des abonnements en cours. C'est du cash réel, pas une
 * estimation. `sinceIso === null` → tout l'historique disponible.
 */
export async function getRevenueByRange(
  stripe: Stripe,
  sinceIso: string | null,
  excludedCustomerIds: Set<string>
): Promise<RevenueDay[]> {
  return cached(`revenue:${sinceIso ?? "all"}:${excludedCustomerIds.size}`, async () => {
    const byDay = new Map<string, number>();
    const params: Stripe.InvoiceListParams = { status: "paid", limit: 100 };
    if (sinceIso) {
      params.created = { gte: Math.floor(Date.parse(sinceIso) / 1000) };
    }
    const invoices = stripe.invoices.list(params);
    for await (const inv of invoices) {
      const customerId = customerIdOf(inv.customer);
      if (customerId && excludedCustomerIds.has(customerId)) continue;
      const amountEur = (inv.amount_paid ?? 0) / 100;
      if (amountEur <= 0) continue;
      const day = new Date(inv.created * 1000).toISOString().slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + amountEur);
    }
    return [...byDay.entries()]
      .map(([day, amountEur]) => ({ day, amountEur: Math.round(amountEur * 100) / 100 }))
      .sort((a, b) => a.day.localeCompare(b.day));
  });
}
