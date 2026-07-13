"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Widget « crédits insuffisants » affiché DANS le chat dès qu'une action est
// refusée faute de crédits (pré-vérification client ou 402 serveur). Le blocage
// devient une action : recharge instantanée en un clic (packs), ou montée de
// forfait via le nudge. On ne bloque jamais sans issue.
// ─────────────────────────────────────────────────────────────────────────────

import { Zap } from "lucide-react";
import { CreditPacksPanel } from "@/components/credit-packs";
import { useT } from "@/lib/i18n/context";

export function CreditsUpsell({
  balance,
  required,
}: {
  /** Solde affiché (null si inconnu). */
  balance: number | null;
  /** Crédits estimés nécessaires pour l'action refusée. */
  required?: number;
}) {
  const t = useT();
  return (
    <div className="w-full max-w-[460px] rounded-2xl border border-[#ECECF2] bg-white p-5 shadow-[0_12px_36px_rgba(60,40,120,0.08)] animate-scale-in">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-pink-500 shadow-[0_6px_18px_rgba(139,92,246,0.35)]">
          <Zap className="h-[18px] w-[18px] text-white" />
        </span>
        <div className="min-w-0">
          <p className="text-[14px] font-bold leading-tight text-[#0A0A0A]">{t("Crédits insuffisants", "Insufficient credits")}</p>
          <p className="text-[12px] tabular-nums text-[#6E6E6C]">
            {balance !== null ? `${t("Solde", "Balance")} : ${balance.toLocaleString("fr-FR")} ${t("crédits", "credits")}` : t("Solde épuisé", "Balance depleted")}
            {required ? ` · ${t("nécessaire", "needed")} : ≈ ${required}` : ""}
          </p>
        </div>
      </div>

      <p className="mb-4 text-[13px] leading-relaxed text-[#4A4A56]">
        {t(
          "Rechargez pour continuer : les crédits arrivent tout de suite et ne périment jamais. Vous repartez sans rien perdre de la conversation.",
          "Top up to continue: credits arrive right away and never expire. You pick up right where you left off in the conversation.",
        )}
      </p>

      <CreditPacksPanel showHeader={false} />
    </div>
  );
}
