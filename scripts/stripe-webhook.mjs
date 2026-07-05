// ─────────────────────────────────────────────────────────────────────────────
// BILTIA — Création (idempotente) du webhook Stripe pour la facturation.
//
// Crée un endpoint webhook pointant vers /api/billing/webhook, abonné aux 4
// événements gérés par le code. Affiche le signing secret (whsec_...) À COLLER
// dans STRIPE_WEBHOOK_SECRET (.env.local + Vercel). Le secret n'est renvoyé
// QUE à la création : si l'endpoint existe déjà, le script propose de le
// recréer (--recreate) pour obtenir un nouveau secret.
//
// USAGE :
//   node scripts/stripe-webhook.mjs                 # crée (ou signale l'existant)
//   node scripts/stripe-webhook.mjs --recreate      # supprime l'existant et recrée
//   URL par défaut : https://biltia.com/api/billing/webhook  (override: WEBHOOK_URL=...)
// ─────────────────────────────────────────────────────────────────────────────

import fs from "node:fs";
import path from "node:path";
import Stripe from "stripe";

const URL = process.env.WEBHOOK_URL || "https://biltia.com/api/billing/webhook";
const EVENTS = [
  "checkout.session.completed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
];
const RECREATE = process.argv.includes("--recreate");

function readSecretKey() {
  if (process.env.STRIPE_SECRET_KEY) return process.env.STRIPE_SECRET_KEY.trim();
  try {
    const line = fs
      .readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8")
      .split("\n")
      .find((l) => l.startsWith("STRIPE_SECRET_KEY="));
    if (line) return line.slice("STRIPE_SECRET_KEY=".length).trim().replace(/^["']|["']$/g, "");
  } catch {}
  return "";
}

const key = readSecretKey();
if (!key.startsWith("sk_")) {
  console.error("❌ STRIPE_SECRET_KEY absente/invalide dans .env.local.");
  process.exit(1);
}
const stripe = new Stripe(key);
const mode = key.startsWith("sk_live_") ? "LIVE 🔴" : "TEST 🟢";
console.log(`\nMode Stripe : ${mode}\nEndpoint cible : ${URL}\n`);

const list = await stripe.webhookEndpoints.list({ limit: 100 });
let existing = list.data.find((e) => e.url === URL);

if (existing && RECREATE) {
  await stripe.webhookEndpoints.del(existing.id);
  console.log(`↻ ancien endpoint ${existing.id} supprimé (recreate).`);
  existing = null;
}

if (existing) {
  console.log(`⚠️ Un endpoint existe déjà : ${existing.id}`);
  console.log(`   Stripe ne renvoie le secret QU'À la création.`);
  console.log(`   Relance avec --recreate pour obtenir un nouveau whsec_, ou récupère le secret dans le dashboard.`);
  process.exit(0);
}

const ep = await stripe.webhookEndpoints.create({
  url: URL,
  enabled_events: EVENTS,
  description: "Biltia — facturation (crédits, abonnements)",
});
console.log(`✅ Webhook créé : ${ep.id}`);
console.log(`   événements : ${EVENTS.join(", ")}\n`);
console.log(`Colle cette ligne dans .env.local ET Vercel :\n`);
console.log(`STRIPE_WEBHOOK_SECRET=${ep.secret}`);
