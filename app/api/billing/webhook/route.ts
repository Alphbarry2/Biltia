// POST /api/billing/webhook — réception des événements Stripe.
//
// Sécurité : signature vérifiée via STRIPE_WEBHOOK_SECRET. Écritures DB via le
// client service_role (contourne la RLS ; jamais exposé au navigateur).
//
// Politique crédits (validée) : RESET au forfait.
//   • checkout.session.completed / invoice.paid → balance = crédits du palier.
//   • customer.subscription.updated              → sync (plan, statut, période).
//   • customer.subscription.deleted              → retour au plan Free.

import { getStripe, findTierByPriceId } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase-admin";
import type Stripe from "stripe";

export const runtime = "nodejs";

// La table `subscriptions` n'est pas encore dans database.types.ts : on opère en
// non typé sur le client service_role (cf. lib/entitlements.ts).
type AnyDb = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (t: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<unknown>;
};

/**
 * Résout le workspace (tenant) + son owner à partir d'un abonnement Stripe.
 * Le schéma prod indexe `subscriptions` par tenant_id ; les crédits restent
 * per-user (table `user_credits`), d'où la résolution de l'owner.
 */
async function resolveTenant(
  db: AnyDb,
  sub: Stripe.Subscription
): Promise<{ tenantId: string; ownerUserId: string | null } | null> {
  const userIdMeta: string | null = sub.metadata?.user_id ?? null;

  // 1. tenant_id posé dans les metadata par /api/billing/checkout.
  let tenantId: string | null = sub.metadata?.tenant_id ?? null;

  // 2. Repli : retrouver le tenant via le customer Stripe déjà enregistré.
  if (!tenantId) {
    const customerId =
      typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
    if (customerId) {
      const { data } = await db
        .from("subscriptions")
        .select("tenant_id")
        .eq("stripe_customer_id", customerId)
        .maybeSingle();
      tenantId = data?.tenant_id ?? null;
    }
  }

  // 3. Repli : via l'user_id des metadata → son workspace owner.
  if (!tenantId && userIdMeta) {
    const { data } = await db
      .from("tenant_members")
      .select("tenant_id")
      .eq("user_id", userIdMeta)
      .eq("role", "owner")
      .not("accepted_at", "is", null)
      .limit(1)
      .maybeSingle();
    tenantId = data?.tenant_id ?? null;
  }

  if (!tenantId) return null;

  // Owner du workspace (pour recharger ses crédits — per-user).
  const { data: owner } = await db
    .from("tenant_members")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("role", "owner")
    .not("accepted_at", "is", null)
    .limit(1)
    .maybeSingle();

  return { tenantId, ownerUserId: owner?.user_id ?? userIdMeta };
}

const VERCEL_API = "https://api.vercel.com";

// Statuts Stripe qui déclenchent le GEL (lecture seule + crédits à 0 + apps
// dépubliées). `past_due` en est ABSENT : c'est la fenêtre de grâce (accès complet).
const FROZEN_STATUSES = new Set(["canceled", "unpaid", "incomplete_expired", "paused"]);

/**
 * Dépublie (best-effort) les apps en ligne d'un tenant : la mise en ligne est
 * une feature d'abonnement, on la coupe au gel. Ne throw jamais. No-op si
 * VERCEL_TOKEN absent (déploiement non configuré → rien à couper).
 */
async function unpublishTenantApps(db: AnyDb, tenantId: string): Promise<void> {
  const token = process.env.VERCEL_TOKEN;
  if (!token) return;
  try {
    const { data: apps } = await db
      .from("modules")
      .select("id, vercel_project_id")
      .eq("tenant_id", tenantId)
      .not("deployment_url", "is", null);
    const teamId = process.env.VERCEL_TEAM_ID;
    for (const app of (apps ?? []) as Array<{ id: string; vercel_project_id: string | null }>) {
      if (!app.vercel_project_id) continue;
      try {
        const url = new URL(`${VERCEL_API}/v9/projects/${app.vercel_project_id}`);
        if (teamId) url.searchParams.set("teamId", teamId);
        await fetch(url.toString(), {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        await db.from("modules").update({ deployment_url: null }).eq("id", app.id);
      } catch (e) {
        console.error("[billing/webhook] unpublish échec", app.id, e);
      }
    }
  } catch (e) {
    console.error("[billing/webhook] unpublishTenantApps", e);
  }
}

/**
 * GEL d'un workspace : les crédits du forfait EXPIRENT à la résiliation (ils
 * étaient « pour ce mois »), et les apps en ligne sont dépubliées. Les données
 * ne sont jamais supprimées (consultation + export restent ouverts).
 */
async function freezeTenant(
  db: AnyDb,
  tenantId: string,
  ownerUserId: string | null
): Promise<void> {
  if (ownerUserId) {
    await db.from("user_credits").upsert(
      { user_id: ownerUserId, balance: 0, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
  }
  await unpublishTenantApps(db, tenantId);
}

/**
 * Applique l'état d'un abonnement Stripe à notre DB. Si `resetCredits`, remet le
 * solde de crédits au forfait du palier (souscription / renouvellement).
 */
async function applySubscription(
  db: AnyDb,
  sub: Stripe.Subscription,
  resetCredits: boolean
): Promise<void> {
  const resolved = await resolveTenant(db, sub);
  if (!resolved) {
    console.error("[billing/webhook] tenant introuvable pour subscription", sub.id);
    return;
  }
  const { tenantId, ownerUserId } = resolved;

  const priceId = sub.items.data[0]?.price?.id ?? null;
  const match = priceId ? findTierByPriceId(priceId) : null;
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
  // Stripe a déplacé `current_period_end` sur les items selon la version d'API :
  // on lit l'un ou l'autre de façon défensive.
  const s = sub as unknown as {
    current_period_end?: number;
    items: { data: Array<{ current_period_end?: number }> };
  };
  const periodEndTs = s.current_period_end ?? s.items.data[0]?.current_period_end;
  const periodEnd = periodEndTs ? new Date(periodEndTs * 1000).toISOString() : null;

  // Schéma prod : subscriptions est indexé par tenant_id (pas de user_id /
  // credits_per_month / stripe_price_id / cancel_at_period_end).
  await db.from("subscriptions").upsert(
    {
      tenant_id: tenantId,
      plan: match?.plan ?? "free",
      status: sub.status,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      current_period_end: periodEnd,
    },
    { onConflict: "tenant_id" }
  );

  // Reset des crédits au forfait (souscription / renouvellement). Les crédits
  // sont per-user (table user_credits) → on recharge l'owner du workspace.
  // NB : la RPC set_credit_balance n'existe pas en prod ; le client service_role
  // écrit directement dans user_credits (contourne la RLS).
  if (resetCredits && match && ownerUserId) {
    await db.from("user_credits").upsert(
      {
        user_id: ownerUserId,
        balance: match.tier.credits,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
  }
}

export async function POST(req: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return Response.json({ error: "Webhook non configuré." }, { status: 503 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) return Response.json({ error: "Signature manquante." }, { status: 400 });

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch (err) {
    console.error("[billing/webhook] signature invalide", err);
    return Response.json({ error: "Signature invalide." }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) {
    console.error("[billing/webhook] service_role non configuré");
    return Response.json({ error: "Service indisponible." }, { status: 500 });
  }
  const db = admin as unknown as AnyDb;

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const subId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          await applySubscription(db, sub, /* resetCredits */ true);
        }
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        // Selon la version d'API, l'abonnement est sur `subscription` ou
        // `parent.subscription_details.subscription`.
        const inv = invoice as unknown as {
          subscription?: string | { id: string };
          parent?: { subscription_details?: { subscription?: string | { id: string } } };
        };
        const rawSub =
          inv.subscription ?? inv.parent?.subscription_details?.subscription;
        const subId = typeof rawSub === "string" ? rawSub : rawSub?.id;
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          // Renouvellement mensuel → reset au forfait.
          await applySubscription(db, sub, /* resetCredits */ true);
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        await applySubscription(db, sub, /* resetCredits */ false);
        // Si la relance a échoué et Stripe marque l'abo `unpaid`/`canceled`
        // (plutôt que de le supprimer), on gèle ici aussi.
        if (FROZEN_STATUSES.has(sub.status)) {
          const resolved = await resolveTenant(db, sub);
          if (resolved) await freezeTenant(db, resolved.tenantId, resolved.ownerUserId);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const resolved = await resolveTenant(db, sub);
        if (resolved) {
          await db
            .from("subscriptions")
            .update({
              plan: "free",
              status: "canceled",
              stripe_subscription_id: null,
            })
            .eq("tenant_id", resolved.tenantId);
          // GEL : crédits du forfait à 0 + apps en ligne dépubliées.
          await freezeTenant(db, resolved.tenantId, resolved.ownerUserId);
        }
        break;
      }

      default:
        // Événements non gérés : accusé de réception silencieux.
        break;
    }
  } catch (err) {
    console.error(`[billing/webhook] échec traitement ${event.type}`, err);
    return Response.json({ error: "Erreur de traitement." }, { status: 500 });
  }

  return Response.json({ received: true });
}
