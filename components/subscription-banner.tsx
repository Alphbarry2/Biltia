"use client";

// Bandeau global d'état, affiché en haut de l'app. Quatre situations :
//   • ESSAI en cours (aucun abonnement)  → bandeau VIOLET, informatif : ce qu'il lui
//                                          reste (crédits ET jours), sans alarmisme.
//   • ESSAI terminé                      → bandeau ROUGE « votre essai est terminé ».
//   • past_due (grâce)                   → bandeau ORANGE « paiement refusé ».
//   • canceled / unpaid / … (gel)        → bandeau ROUGE « abonnement expiré ».
//
// ⚠️ Un essai terminé et un abonnement expiré NE SONT PAS la même chose. Dire « votre
// abonnement a expiré » à quelqu'un qui n'en a jamais eu est absurde, et le bouton
// n'est pas le même (« Passer à Pro » vs « Réactiver »).
//
// Le blocage réel des écritures est fait CÔTÉ SERVEUR (lib/entitlements.ts) ; ce
// bandeau ne fait qu'expliquer à l'utilisateur pourquoi ses actions échouent.
//
// L'ESSAI a DEUX limites, la première atteinte gagne : les CRÉDITS (le vrai verrou)
// et le TEMPS. Le bandeau affiche donc les deux, et met en avant CELLE QUI ARRIVE EN
// PREMIER — sinon on lui annonce « 12 jours restants » quand il lui reste 20 crédits.
// `trial_ends_at` est NULL tant qu'il n'a rien construit : le chrono n'a pas démarré,
// on ne lui met aucune pression, on lui montre juste ses crédits.

import Link from "next/link";
import { useT } from "@/lib/i18n/context";
import { useSession } from "@/components/session-provider";
import { AlertTriangle, Lock, Sparkles } from "lucide-react";

const FROZEN = new Set(["canceled", "unpaid", "incomplete", "incomplete_expired", "paused"]);

type BannerState =
  | { kind: "ok" }
  | { kind: "grace" }
  | { kind: "frozen" }
  | { kind: "trial"; credits: number; daysLeft: number | null }
  | { kind: "trial-over" };

/** Jours pleins restants avant une échéance ISO (0 si dépassée). */
function daysUntil(iso: string): number {
  const ms = Date.parse(iso) - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export function SubscriptionBanner() {
  const t = useT();
  // Plus AUCUN appel réseau ici. Ce bandeau refaisait sa propre chaîne complète
  // (getUser → membership → subscriptions → tenants + user_credits), en doublon
  // strict avec la sidebar — et son getUser() allongeait la file d'attente du
  // verrou d'auth, retardant TOUTE la page. Il lit maintenant la session partagée.
  const { billing, loading } = useSession();

  const state: BannerState = (() => {
    if (loading || !billing) return { kind: "ok" };
    const status = billing.status;

    // ── ABONNÉ (payant, ou ex-payant) ────────────────────────────────────────
    if (status) {
      if (FROZEN.has(status)) return { kind: "frozen" };
      if (status === "past_due") return { kind: "grace" };
      return { kind: "ok" };
    }

    // ── AUCUN ABONNEMENT → ESSAI GRATUIT ─────────────────────────────────────
    const daysLeft = billing.trialEndsAt ? daysUntil(billing.trialEndsAt) : null;
    // Essai terminé = le chrono a démarré ET il est écoulé. Les crédits épuisés,
    // eux, sont déjà refusés par deduct_credits — inutile d'en faire un état à part.
    if (daysLeft === 0) return { kind: "trial-over" };
    return { kind: "trial", credits: billing.credits, daysLeft };
  })();

  if (state.kind === "ok") return null;

  // ── ESSAI EN COURS ────────────────────────────────────────────────────────
  if (state.kind === "trial") {
    // On met en avant la limite qui arrive EN PREMIER. Sans ça, on annoncerait
    // « 12 jours restants » à quelqu'un qui n'a plus que 20 crédits — techniquement
    // vrai, et complètement trompeur.
    const creditsLine = t(`${state.credits} crédits restants`, `${state.credits} credits left`);
    const daysLine =
      state.daysLeft !== null
        ? t(
            `${state.daysLeft} jour${state.daysLeft > 1 ? "s" : ""} d'essai`,
            `${state.daysLeft} day${state.daysLeft > 1 ? "s" : ""} of trial`
          )
        : null;

    return (
      <div className="flex items-center gap-2 border-b border-violet-200 bg-violet-50 px-4 py-2.5 text-sm text-violet-900 flex-shrink-0">
        <Sparkles className="h-4 w-4 flex-shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="font-semibold">{t("Essai gratuit", "Free trial")}</span>
          {" · "}
          {creditsLine}
          {daysLine ? ` · ${daysLine}` : ""}
        </span>
        <Link
          href="/tarifs"
          className="whitespace-nowrap font-semibold underline hover:text-violet-950"
        >
          {t("Passer à Pro", "Go Pro")}
        </Link>
      </div>
    );
  }

  // ── ESSAI TERMINÉ (n'a JAMAIS payé) ───────────────────────────────────────
  if (state.kind === "trial-over") {
    return (
      <div className="flex items-center gap-2 border-b border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-800 flex-shrink-0">
        <Lock className="h-4 w-4 flex-shrink-0" />
        <span className="min-w-0 flex-1">
          {t(
            "Votre essai gratuit est terminé. Vos applications et vos données sont conservées — passez au plan Pro pour reprendre là où vous en étiez.",
            "Your free trial has ended. Your apps and data are kept — switch to the Pro plan to pick up where you left off."
          )}
        </span>
        <Link href="/tarifs" className="whitespace-nowrap font-semibold underline hover:text-rose-950">
          {t("Passer à Pro — 49 €/mois", "Go Pro — €49/month")}
        </Link>
      </div>
    );
  }

  if (state.kind === "grace") {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 bg-orange-50 border-b border-orange-200 text-orange-800 text-sm flex-shrink-0">
        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
        <span className="flex-1 min-w-0">
          {t("Paiement refusé. Mettez à jour votre moyen de paiement sous 5 jours pour éviter le gel de vos outils.", "Payment declined. Update your payment method within 5 days to avoid your tools being frozen.")}
        </span>
        <Link
          href="/settings?section=billing"
          className="font-semibold underline whitespace-nowrap hover:text-orange-950"
        >
          {t("Régulariser", "Fix payment")}
        </Link>
      </div>
    );
  }

  // ── ABONNEMENT PAYANT EXPIRÉ (il A payé, un jour) ─────────────────────────
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 bg-rose-50 border-b border-rose-200 text-rose-800 text-sm flex-shrink-0">
      <Lock className="w-4 h-4 flex-shrink-0" />
      <span className="flex-1 min-w-0">
        {t("Espace en lecture seule : votre abonnement a expiré. Vos données restent consultables et exportables. Réactivez pour reprendre votre activité.", "Read-only workspace: your subscription has expired. Your data stays viewable and exportable. Reactivate to resume your work.")}
      </span>
      <Link
        href="/settings?section=billing"
        className="font-semibold underline whitespace-nowrap hover:text-rose-950"
      >
        {t("Réactiver", "Reactivate")}
      </Link>
    </div>
  );
}
