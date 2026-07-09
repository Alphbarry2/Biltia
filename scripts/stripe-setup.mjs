// ─────────────────────────────────────────────────────────────────────────────
// BILTIA — Création automatique des Produits + Prix Stripe (plan Pro).
//
// Crée, pour chaque palier de crédits, un Produit + 2 Prix récurrents (mensuel
// et annuel = 10 mois facturés, 2 offerts). Idempotent : relançable sans créer
// de doublon (ancrage sur `lookup_key`). Affiche à la fin le bloc de variables
// d'environnement à coller dans .env.local ET sur Vercel.
//
// USAGE :
//   1) Mets ta clé secrète Stripe dans .env.local :  STRIPE_SECRET_KEY=sk_test_...
//      (commence en TEST. Pour la prod, relance avec une clé sk_live_...)
//   2) node scripts/stripe-setup.mjs
//
// Les paliers ci-dessous doivent rester alignés sur PRO_TIERS (lib/plans.ts).
// ─────────────────────────────────────────────────────────────────────────────

import fs from "node:fs";
import path from "node:path";
import Stripe from "stripe";

// [credits, prixMensuelEUR] — miroir EXACT de PRO_TIERS (lib/plans.ts).
// Grille resserrée 2026-07-09 : 6 paliers (2 cartes Solo/TPE + Business).
// Les ANCIENS paliers (4000, 8000, …) ne sont PAS recréés ici : leurs Prices
// restent en place tant qu'un abonné y est (grandfathering, cf. LEGACY_PRO_TIERS
// + findTierByPriceId). Ne PAS les supprimer côté Stripe.
const TIERS = [
  [1000, 49],
  [2000, 89],
  [3000, 129],
  [10000, 399],
  [15000, 579],
  [25000, 949],
];
const ANNUAL_MONTHS_BILLED = 10; // 2 mois offerts

// ── Clé : env d'abord, sinon .env.local ──────────────────────────────────────
function readSecretKey() {
  if (process.env.STRIPE_SECRET_KEY) return process.env.STRIPE_SECRET_KEY.trim();
  try {
    const envPath = path.resolve(process.cwd(), ".env.local");
    const line = fs
      .readFileSync(envPath, "utf8")
      .split("\n")
      .find((l) => l.startsWith("STRIPE_SECRET_KEY="));
    if (line) return line.slice("STRIPE_SECRET_KEY=".length).trim().replace(/^["']|["']$/g, "");
  } catch {
    /* pas de .env.local */
  }
  return "";
}

const key = readSecretKey();
if (!key || !key.startsWith("sk_")) {
  console.error(
    "❌ STRIPE_SECRET_KEY absente ou invalide. Mets STRIPE_SECRET_KEY=sk_test_... dans .env.local (ou en variable d'env), puis relance."
  );
  process.exit(1);
}

const stripe = new Stripe(key);
const mode = key.startsWith("sk_live_") ? "LIVE 🔴" : "TEST 🟢";
console.log(`\nMode Stripe : ${mode}\nCréation des produits + prix Pro (${TIERS.length} paliers × 2 cycles)…\n`);

const productByCredits = {};
const envLines = [];

async function findOrCreateProduct(credits) {
  if (productByCredits[credits]) return productByCredits[credits];
  // Réutilise le produit d'un prix déjà créé (l'un des deux cycles).
  for (const cycle of ["monthly", "annual"]) {
    const found = await stripe.prices.list({ lookup_keys: [lk(credits, cycle)], limit: 1 });
    if (found.data[0]) {
      const pid =
        typeof found.data[0].product === "string" ? found.data[0].product : found.data[0].product.id;
      productByCredits[credits] = pid;
      return pid;
    }
  }
  const product = await stripe.products.create({
    name: `Biltia Pro — ${credits.toLocaleString("fr-FR")} crédits / mois`,
    metadata: { biltia_plan: "pro", biltia_credits: String(credits) },
  });
  productByCredits[credits] = product.id;
  return product.id;
}

const lk = (credits, cycle) => `biltia_pro_${credits}_${cycle}`;

async function ensurePrice(credits, monthlyEur, cycle) {
  const lookupKey = lk(credits, cycle);
  const unitAmount =
    cycle === "monthly" ? monthlyEur * 100 : monthlyEur * ANNUAL_MONTHS_BILLED * 100;

  const existing = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
  const prev = existing.data[0];
  // Prix déjà présent AU BON MONTANT → on réutilise tel quel.
  if (prev && prev.unit_amount === unitAmount) return { id: prev.id, reused: true };

  const productId = await findOrCreateProduct(credits);
  // Un Price Stripe est IMMUABLE : si le montant a changé (ex. 2000 crédits
  // 99 → 89 €), on crée un nouveau Price et on lui TRANSFÈRE la lookup_key
  // (l'ancien Price se détache de la clé mais reste valable pour les abonnés
  // qui le référencent déjà). `transfer_lookup_key` ne casse aucun abonnement.
  const price = await stripe.prices.create({
    product: productId,
    currency: "eur",
    unit_amount: unitAmount,
    recurring: { interval: cycle === "monthly" ? "month" : "year" },
    lookup_key: lookupKey,
    transfer_lookup_key: Boolean(prev),
    nickname: `Pro ${credits} crédits (${cycle === "monthly" ? "mensuel" : "annuel"})`,
    metadata: { biltia_plan: "pro", biltia_credits: String(credits), biltia_cycle: cycle },
  });
  return { id: price.id, reused: false, retariffed: Boolean(prev) };
}

for (const [credits, monthlyEur] of TIERS) {
  for (const cycle of ["monthly", "annual"]) {
    const { id, reused, retariffed } = await ensurePrice(credits, monthlyEur, cycle);
    const envName = `STRIPE_PRICE_PRO_${credits}${cycle === "annual" ? "_ANNUAL" : ""}`;
    envLines.push(`${envName}=${id}`);
    const status = reused ? "(déjà présent)" : retariffed ? "✓ recréé (nouveau tarif)" : "✓ créé";
    console.log(`  ${String(credits).padStart(6)} ${cycle.padEnd(7)} ${id} ${status}`);
  }
}

// ── Packs de crédits (one-time) ───────────────────────────────────────────────
// Miroir EXACT de CREDIT_PACKS (lib/plans.ts). Prix « payment » (pas d'abonnement).
const PACKS = [
  [1000, 59],
  [3000, 149],
  [10000, 449],
];
const lkPack = (credits) => `biltia_pack_${credits}`;

async function findOrCreatePackProduct(credits) {
  const found = await stripe.prices.list({ lookup_keys: [lkPack(credits)], limit: 1 });
  if (found.data[0]) {
    return typeof found.data[0].product === "string" ? found.data[0].product : found.data[0].product.id;
  }
  const product = await stripe.products.create({
    name: `Biltia — Pack ${credits.toLocaleString("fr-FR")} crédits`,
    metadata: { biltia_kind: "pack", biltia_credits: String(credits) },
  });
  return product.id;
}

async function ensurePackPrice(credits, eur) {
  const lookupKey = lkPack(credits);
  const unitAmount = eur * 100;
  const existing = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
  const prev = existing.data[0];
  if (prev && prev.unit_amount === unitAmount) return { id: prev.id, reused: true };
  const productId = await findOrCreatePackProduct(credits);
  const price = await stripe.prices.create({
    product: productId,
    currency: "eur",
    unit_amount: unitAmount,
    lookup_key: lookupKey,
    transfer_lookup_key: Boolean(prev),
    nickname: `Pack ${credits} crédits`,
    metadata: { biltia_kind: "pack", biltia_credits: String(credits) },
  });
  return { id: price.id, reused: false, retariffed: Boolean(prev) };
}

console.log(`\nPacks de crédits (one-time)…\n`);
for (const [credits, eur] of PACKS) {
  const { id, reused, retariffed } = await ensurePackPrice(credits, eur);
  envLines.push(`STRIPE_PACK_${credits}=${id}`);
  const status = reused ? "(déjà présent)" : retariffed ? "✓ recréé (nouveau tarif)" : "✓ créé";
  console.log(`  pack ${String(credits).padStart(6)}        ${id} ${status}`);
}

console.log(
  `\n────────────────────────────────────────────────────────────\n` +
    `✅ Terminé. Colle ces lignes dans .env.local ET dans les Environment Variables Vercel :\n`
);
console.log(envLines.join("\n"));
console.log(
  `\n(Ces STRIPE_PRICE_* remplacent les placeholders « your_price_id ». N'oublie pas :\n` +
    ` - STRIPE_SECRET_KEY (déjà en place pour ce run)\n` +
    ` - STRIPE_WEBHOOK_SECRET (à créer via le webhook, voir instructions)\n)`
);
