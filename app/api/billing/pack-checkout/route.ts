// POST /api/billing/pack-checkout
// Crée une session Stripe Checkout (mode: PAYMENT, one-time) pour un pack de
// crédits. L'attribution des crédits (topup_balance, non expirable) se fait dans
// le webhook via redeem_credit_pack (idempotent), jamais ici.

import { createClient } from "@/lib/supabase-server";
import { getStripe, resolvePackPriceId } from "@/lib/stripe";
import { isValidPack } from "@/lib/plans";
import { getActiveMembershipServer } from "@/lib/tenant-server";
import { can } from "@/lib/permissions";
import type Stripe from "stripe";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return Response.json({ error: "Authentification requise." }, { status: 401 });
    }

    let body: { credits?: number };
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Corps de requête invalide." }, { status: 400 });
    }

    const credits = Number(body.credits);
    if (!isValidPack(credits)) {
      return Response.json({ error: "Pack de crédits invalide." }, { status: 400 });
    }

    const stripe = getStripe();
    if (!stripe) {
      return Response.json(
        { error: "Paiement non configuré (STRIPE_SECRET_KEY manquante)." },
        { status: 503 }
      );
    }

    const priceId = resolvePackPriceId(credits);
    if (!priceId) {
      return Response.json(
        { error: `Prix Stripe non configuré pour le pack ${credits} crédits.` },
        { status: 503 }
      );
    }

    const membership = await getActiveMembershipServer(supabase, user.id);
    const tenantId: string | undefined = membership?.tenant_id ?? undefined;
    if (!tenantId) {
      return Response.json({ error: "Aucun espace de travail." }, { status: 403 });
    }

    // RBAC : seul le propriétaire paie (les crédits vont sur son solde, cohérent
    // avec l'abonnement qui crédite déjà l'owner).
    if (!can(membership?.role, "billing.manage")) {
      return Response.json(
        { error: "Seul le propriétaire de l'espace peut recharger des crédits." },
        { status: 403 }
      );
    }

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const existingCustomer: string | undefined = sub?.stripe_customer_id ?? undefined;

    const origin =
      req.headers.get("origin") ??
      process.env.NEXT_PUBLIC_APP_URL ??
      new URL(req.url).origin;

    const metadata = {
      kind: "pack",
      user_id: user.id,
      tenant_id: tenantId,
      credits: String(credits),
    };

    const params: Stripe.Checkout.SessionCreateParams = {
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: user.id,
      metadata,
      // Recopie sur le PaymentIntent : filet si la session n'arrive pas au webhook.
      payment_intent_data: { metadata },
      allow_promotion_codes: true,
      success_url: `${origin}/settings?pack=success`,
      cancel_url: `${origin}/settings?pack=cancel`,
    };
    if (existingCustomer) params.customer = existingCustomer;
    else params.customer_email = user.email ?? undefined;

    const session = await stripe.checkout.sessions.create(params);
    return Response.json({ url: session.url });
  } catch (err) {
    console.error("[billing/pack-checkout]", err);
    const msg = err instanceof Error ? err.message : "Erreur de paiement.";
    return Response.json({ error: msg }, { status: 500 });
  }
}
