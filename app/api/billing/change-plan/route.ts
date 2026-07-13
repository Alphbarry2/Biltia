// POST /api/billing/change-plan — changement d'offre (upgrade / downgrade).
//
// Politique validée (modèle B) :
//   • UPGRADE  → effet IMMÉDIAT. Stripe facture le PRORATA tout de suite
//     (`proration_behavior: "always_invoice"` + `payment_behavior:
//     "error_if_incomplete"` : l'appel LÈVE si la carte est refusée, donc on
//     n'accorde des crédits QUE si le paiement passe). Crédits ajoutés =
//     DIFFÉRENCE d'allocation (crédits_nouveau − crédits_ancien), quel que soit
//     le moment du cycle → aucune règle de date, non farmable.
//   • DOWNGRADE → prend effet À LA FIN de la période en cours (aucun
//     remboursement) via un Subscription Schedule. Les crédits ne bougent pas
//     tout de suite ; au renouvellement, le webhook reset au (plus petit) forfait.
//
// Seul le propriétaire du workspace peut changer d'offre. Le solde de crédits est
// per-user (table user_credits) et vit sur l'owner.

import { createClient } from "@/lib/supabase-server";
import { getStripe, resolvePriceId, findTierByPriceId } from "@/lib/stripe";
import { isValidTier, type BillingCycle, type PlanId } from "@/lib/plans";
import { getActiveMembershipServer } from "@/lib/tenant-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getLocale } from "@/lib/i18n/server";
import { pick } from "@/lib/i18n/config";
import type Stripe from "stripe";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const locale = await getLocale();
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return Response.json(
      { error: pick(locale, "Authentification requise.", "Authentication required.") },
      { status: 401 }
    );
  }

  let body: { credits?: number; cycle?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { error: pick(locale, "Corps de requête invalide.", "Invalid request body.") },
      { status: 400 }
    );
  }

  const plan: PlanId = "pro";
  const targetCredits = Number(body.credits);
  if (!isValidTier(plan, targetCredits)) {
    return Response.json(
      { error: pick(locale, "Palier de crédits invalide.", "Invalid credit tier.") },
      { status: 400 }
    );
  }

  const stripe = getStripe();
  if (!stripe) {
    return Response.json(
      { error: pick(locale, "Paiement non configuré.", "Payments are not configured.") },
      { status: 503 }
    );
  }

  const membership = await getActiveMembershipServer(supabase, user.id);
  if (!membership?.tenant_id) {
    return Response.json(
      { error: pick(locale, "Aucun espace de travail.", "No workspace found.") },
      { status: 403 }
    );
  }
  if (membership.role !== "owner") {
    return Response.json(
      {
        error: pick(
          locale,
          "Seul le propriétaire du workspace peut changer d'offre.",
          "Only the workspace owner can change the plan."
        ),
      },
      { status: 403 }
    );
  }

  const { data: subRow } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id")
    .eq("tenant_id", membership.tenant_id)
    .maybeSingle();
  const subId: string | undefined = subRow?.stripe_subscription_id ?? undefined;
  if (!subId) {
    return Response.json(
      {
        error: pick(
          locale,
          "Aucun abonnement actif. Souscris d'abord une offre.",
          "No active subscription. Subscribe to a plan first."
        ),
      },
      { status: 400 }
    );
  }

  try {
    const sub = await stripe.subscriptions.retrieve(subId);
    const item = sub.items.data[0];
    const currentPriceId = item?.price?.id ?? null;
    const current = currentPriceId ? findTierByPriceId(currentPriceId) : null;
    if (!item || !currentPriceId || !current) {
      return Response.json(
        {
          error: pick(
            locale,
            "Abonnement en cours introuvable ou illisible.",
            "Current subscription not found or unreadable."
          ),
        },
        { status: 409 }
      );
    }

    // On conserve le cycle courant sauf demande explicite (mensuel/annuel).
    const cycle: BillingCycle =
      body.cycle === "annual" ? "annual" : body.cycle === "monthly" ? "monthly" : current.cycle;
    const newPriceId = resolvePriceId(plan, targetCredits, cycle);
    if (!newPriceId) {
      return Response.json(
        {
          error: pick(
            locale,
            `Price Stripe non configuré (${plan} ${targetCredits} ${cycle}).`,
            `No Stripe price configured (${plan} ${targetCredits} ${cycle}).`
          ),
        },
        { status: 503 }
      );
    }
    if (newPriceId === currentPriceId) {
      return Response.json(
        { error: pick(locale, "C'est déjà ton offre actuelle.", "This is already your current plan.") },
        { status: 400 }
      );
    }

    const oldCredits = current.tier.credits;
    const isUpgrade = targetCredits > oldCredits;

    // ── UPGRADE : immédiat + prorata facturé, puis +différence de crédits ──────
    if (isUpgrade) {
      const delta = targetCredits - oldCredits;
      const updated = await stripe.subscriptions.update(subId, {
        items: [{ id: item.id, price: newPriceId }],
        proration_behavior: "always_invoice",
        payment_behavior: "error_if_incomplete",
        metadata: { ...sub.metadata, plan, credits: String(targetCredits), cycle },
      });

      // Le paiement du prorata a réussi (sinon l'appel ci-dessus aurait levé).
      // Modèle B : on AJOUTE la différence d'allocation au solde de l'owner.
      // Écriture via service_role (user_credits n'est pas writable côté client).
      if (delta > 0) {
        const admin = createAdminClient();
        if (admin) {
          const { data: cur } = await admin
            .from("user_credits")
            .select("balance")
            .eq("user_id", user.id)
            .maybeSingle();
          const base = (cur as { balance?: number } | null)?.balance ?? 0;
          await admin.from("user_credits").upsert(
            { user_id: user.id, balance: base + delta, updated_at: new Date().toISOString() },
            { onConflict: "user_id" }
          );
        } else {
          // service_role indisponible : on ne bloque pas le paiement déjà encaissé,
          // mais on le signale pour réconciliation manuelle.
          console.error("[billing/change-plan] service_role absent : delta non appliqué", {
            user: user.id,
            delta,
          });
        }
      }

      return Response.json({
        ok: true,
        kind: "upgrade",
        credits: targetCredits,
        creditsAdded: delta,
        status: updated.status,
      });
    }

    // ── DOWNGRADE : effet à la fin de période via Subscription Schedule ────────
    // Phase 1 = offre actuelle jusqu'à l'échéance, Phase 2 = nouvelle (plus petite)
    // offre. Aucun remboursement, aucun changement de crédits maintenant : au
    // renouvellement, le webhook (invoice.paid / subscription_cycle) reset au
    // nouveau forfait.
    const s = sub as unknown as {
      current_period_end?: number;
      items: { data: Array<{ current_period_end?: number }> };
      schedule?: string | { id: string } | null;
    };
    const periodEnd = s.current_period_end ?? s.items.data[0]?.current_period_end;

    const existingScheduleId =
      typeof s.schedule === "string" ? s.schedule : s.schedule?.id ?? null;
    const schedule = existingScheduleId
      ? await stripe.subscriptionSchedules.retrieve(existingScheduleId)
      : await stripe.subscriptionSchedules.create({ from_subscription: subId });

    // Phase courante telle que Stripe la connaît (on préserve ses dates).
    const curPhase = schedule.phases[schedule.phases.length - 1];
    const curItems = curPhase.items.map((it) => ({
      price: typeof it.price === "string" ? it.price : (it.price as { id: string }).id,
      quantity: it.quantity ?? 1,
    }));
    const phaseEnd = curPhase.end_date ?? periodEnd;

    const updateParams: Stripe.SubscriptionScheduleUpdateParams = {
      end_behavior: "release",
      phases: [
        { items: curItems, start_date: curPhase.start_date, end_date: phaseEnd },
        {
          items: [{ price: newPriceId, quantity: 1 }],
          metadata: { ...sub.metadata, plan, credits: String(targetCredits), cycle },
        },
      ],
    };
    await stripe.subscriptionSchedules.update(schedule.id, updateParams);

    return Response.json({
      ok: true,
      kind: "downgrade",
      credits: targetCredits,
      effectiveAt: phaseEnd ? new Date(phaseEnd * 1000).toISOString() : null,
    });
  } catch (err) {
    console.error("[billing/change-plan]", err);
    const msg =
      err instanceof Error
        ? err.message
        : pick(locale, "Erreur de changement d'offre.", "Plan change failed.");
    return Response.json({ error: msg }, { status: 500 });
  }
}
