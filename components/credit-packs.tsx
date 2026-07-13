"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Packs de crédits (recharges one-time). Réutilisé à 3 endroits : bouton
// « Recharger » de la barre latérale, Paramètres, et le widget « crédits
// insuffisants ». Achat = Stripe Checkout mode payment ; les crédits arrivent
// dans la poche topup_balance (non expirable) via le webhook.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import Link from "next/link";
import { Zap, Plus, Loader2, X, Check } from "lucide-react";
import { CREDIT_PACKS, formatEur } from "@/lib/plans";
import { useT, useLocale } from "@/lib/i18n/context";

// Le pack le plus « populaire » (mis en avant), au milieu de la gamme.
const HIGHLIGHT_CREDITS = 3000;

export function CreditPacksPanel({ onClose, showHeader = true }: { onClose?: () => void; showHeader?: boolean }) {
  const t = useT();
  const locale = useLocale();
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const buy = async (credits: number) => {
    if (busy !== null) return;
    setBusy(credits);
    setError(null);
    try {
      const res = await fetch("/api/billing/pack-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credits }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.error ?? t("Paiement indisponible pour le moment.", "Payment unavailable right now."));
    } catch {
      setError(t("Erreur réseau. Réessayez.", "Network error. Try again."));
    }
    setBusy(null);
  };

  return (
    <div className="w-full">
      {showHeader && (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-[15px] font-bold text-[#0A0A0A]">{t("Recharger des crédits", "Top up credits")}</p>
            <p className="text-[12.5px] text-[#6E6E6C] leading-snug">
              {t("Crédits ajoutés tout de suite. Ils ne périment jamais.", "Credits added instantly. They never expire.")}
            </p>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label={t("Fermer", "Close")}
              className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full text-[#9A9A97] hover:bg-black/[0.05] hover:text-[#0A0A0A]"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {CREDIT_PACKS.map((pack) => {
          const highlight = pack.credits === HIGHLIGHT_CREDITS;
          const loading = busy === pack.credits;
          return (
            <button
              key={pack.credits}
              type="button"
              onClick={() => buy(pack.credits)}
              disabled={busy !== null}
              className={`group flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-all disabled:opacity-60 ${
                highlight
                  ? "border-[#C9BEF0] bg-[#F7F4FD] hover:border-[#7C3AED]"
                  : "border-[#ECECF2] bg-white hover:border-[#C9BEF0]"
              }`}
            >
              <span className="flex items-center gap-3">
                <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-pink-500 text-white shadow-[0_6px_16px_rgba(139,92,246,0.28)]">
                  <Zap className="h-[17px] w-[17px]" />
                </span>
                <span>
                  <span className="flex items-center gap-2">
                    <span className="text-[15px] font-bold tabular-nums text-[#0A0A0A]">
                      +{pack.credits.toLocaleString(locale === "en" ? "en-US" : "fr-FR")}
                    </span>
                    {highlight && (
                      <span className="rounded-full bg-[#7C3AED]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#6D4AE0]">
                        {t("Populaire", "Popular")}
                      </span>
                    )}
                  </span>
                  <span className="block text-[12px] text-[#8B8B96]">{t("crédits, sans expiration", "credits, no expiry")}</span>
                </span>
              </span>
              <span className="flex flex-shrink-0 items-center gap-2">
                <span className="text-[15px] font-bold tabular-nums text-[#0A0A0A]">{formatEur(pack.priceEur)}</span>
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-[#7C3AED]" />
                ) : (
                  <Plus className="h-4 w-4 text-[#7C3AED] transition-transform group-hover:scale-110" strokeWidth={2.5} />
                )}
              </span>
            </button>
          );
        })}
      </div>

      {error && <p className="mt-2.5 text-[12px] text-rose-600">{error}</p>}

      <div className="mt-3 flex items-start gap-2 rounded-xl bg-[#F6F4FB] px-3 py-2.5">
        <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[#7C3AED]" strokeWidth={2.5} />
        <p className="text-[11.5px] leading-snug text-[#6E6E6C]">
          {t("Vous rechargez souvent ?", "Topping up often?")}{" "}
          <Link href="/tarifs" className="font-semibold text-[#6D4AE0] underline-offset-2 hover:underline">
            {t("Monter d'un cran de forfait", "Moving up a plan tier")}
          </Link>{" "}
          {t("revient moins cher au crédit.", "is cheaper per credit.")}
        </p>
      </div>
    </div>
  );
}

/** Fenêtre modale contenant les packs (barre latérale, upsell). */
export function CreditPacksDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[420px] max-h-[92dvh] overflow-y-auto rounded-t-3xl border border-[#ECECF2] bg-white p-5 pb-[calc(1.25rem+var(--safe-bottom))] shadow-[0_30px_80px_rgba(60,40,120,0.28)] sm:rounded-3xl sm:pb-5 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t("Recharger des crédits", "Top up credits")}
      >
        <CreditPacksPanel onClose={onClose} />
      </div>
    </div>
  );
}
