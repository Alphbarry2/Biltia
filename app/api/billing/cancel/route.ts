// POST /api/billing/cancel — résiliation volontaire.
//
// Politique (décision user) : ZÉRO jour de grâce en plus, mais l'utilisateur
// garde l'accès jusqu'à la fin du mois DÉJÀ PAYÉ. On pose donc
// `cancel_at_period_end = true` : le statut reste `active` (writable) jusqu'à
// l'échéance, puis Stripe émet `customer.subscription.deleted` → gel (webhook).

import { createClient } from "@/lib/supabase-server";
import { getStripe } from "@/lib/stripe";
import { getActiveMembershipServer } from "@/lib/tenant-server";

export const runtime = "nodejs";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return Response.json({ error: "Authentification requise." }, { status: 401 });
  }

  const stripe = getStripe();
  if (!stripe) {
    return Response.json({ error: "Paiement non configuré." }, { status: 503 });
  }

  const membership = await getActiveMembershipServer(supabase, user.id);
  if (!membership?.tenant_id) {
    return Response.json({ error: "Aucun espace de travail." }, { status: 403 });
  }
  // Seul le propriétaire du workspace peut résilier.
  if (membership.role !== "owner") {
    return Response.json(
      { error: "Seul le propriétaire du workspace peut résilier l'abonnement." },
      { status: 403 }
    );
  }

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id")
    .eq("tenant_id", membership.tenant_id)
    .maybeSingle();
  const subId: string | undefined = sub?.stripe_subscription_id ?? undefined;
  if (!subId) {
    return Response.json({ error: "Aucun abonnement actif à résilier." }, { status: 400 });
  }

  try {
    const updated = await stripe.subscriptions.update(subId, {
      cancel_at_period_end: true,
    });
    // `current_period_end` est selon la version d'API sur l'abo ou sur l'item.
    const s = updated as unknown as {
      current_period_end?: number;
      items: { data: Array<{ current_period_end?: number }> };
    };
    const endTs = s.current_period_end ?? s.items.data[0]?.current_period_end;
    return Response.json({
      ok: true,
      cancelAtPeriodEnd: true,
      periodEnd: endTs ? new Date(endTs * 1000).toISOString() : null,
    });
  } catch (err) {
    console.error("[billing/cancel]", err);
    const msg = err instanceof Error ? err.message : "Erreur de résiliation.";
    return Response.json({ error: msg }, { status: 500 });
  }
}
