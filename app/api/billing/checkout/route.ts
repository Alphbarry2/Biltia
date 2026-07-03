// POST /api/billing/checkout
// Crée une session Stripe Checkout (mode subscription) pour un palier (plan, credits).
// L'attribution des crédits se fait dans le webhook, jamais ici.

import { createClient } from "@/lib/supabase-server";
import { getStripe, resolvePriceId } from "@/lib/stripe";
import { isValidTier, type PlanId } from "@/lib/plans";
import type Stripe from "stripe";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return Response.json({ error: "Authentification requise." }, { status: 401 });
    }

    // ── Corps ─────────────────────────────────────────────────────────────
    let body: { plan?: string; credits?: number };
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Corps de requête invalide." }, { status: 400 });
    }

    const plan = body.plan as PlanId;
    const credits = Number(body.credits);
    if (!isValidTier(plan, credits)) {
      return Response.json(
        { error: "Plan ou palier de crédits invalide." },
        { status: 400 }
      );
    }

    // ── Stripe ────────────────────────────────────────────────────────────
    const stripe = getStripe();
    if (!stripe) {
      return Response.json(
        { error: "Paiement non configuré (STRIPE_SECRET_KEY manquante)." },
        { status: 503 }
      );
    }

    const priceId = resolvePriceId(plan, credits);
    if (!priceId) {
      return Response.json(
        { error: `Price Stripe non configuré pour ${plan} ${credits} crédits.` },
        { status: 503 }
      );
    }

    // `subscriptions` pas encore dans database.types.ts → accès non typé.
    const db = supabase as unknown as { from: (t: string) => any };

    // Workspace (tenant) de l'utilisateur — l'abonnement est indexé par tenant_id.
    const { data: membership } = await db
      .from("tenant_members")
      .select("tenant_id")
      .eq("user_id", user.id)
      .not("accepted_at", "is", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const tenantId: string | undefined = membership?.tenant_id ?? undefined;
    if (!tenantId) {
      return Response.json({ error: "Aucun espace de travail." }, { status: 403 });
    }

    // Réutilise le customer Stripe existant si connu (lecture RLS = son tenant).
    const { data: sub } = await db
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const existingCustomer: string | undefined = sub?.stripe_customer_id ?? undefined;

    const origin =
      req.headers.get("origin") ??
      process.env.NEXT_PUBLIC_APP_URL ??
      new URL(req.url).origin;

    const params: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: user.id,
      metadata: { user_id: user.id, tenant_id: tenantId, plan, credits: String(credits) },
      subscription_data: {
        metadata: { user_id: user.id, tenant_id: tenantId, plan, credits: String(credits) },
      },
      allow_promotion_codes: true,
      success_url: `${origin}/settings?checkout=success`,
      cancel_url: `${origin}/settings?checkout=cancel`,
    };
    if (existingCustomer) params.customer = existingCustomer;
    else params.customer_email = user.email ?? undefined;

    const session = await stripe.checkout.sessions.create(params);
    return Response.json({ url: session.url });
  } catch (err) {
    console.error("[billing/checkout]", err);
    const msg = err instanceof Error ? err.message : "Erreur de paiement.";
    return Response.json({ error: msg }, { status: 500 });
  }
}
