"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Widget « crédits insuffisants » affiché DANS le chat dès qu'une action est
// refusée faute de crédits (pré-vérification client ou 402 serveur). Le
// blocage devient une action : checkout Pro en un clic + lien vers les offres.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import Link from "next/link";
import { Zap, ArrowRight, Loader2 } from "lucide-react";

export function CreditsUpsell({
  balance,
  required,
}: {
  /** Solde affiché (null si inconnu). */
  balance: number | null;
  /** Crédits estimés nécessaires pour l'action refusée. */
  required?: number;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Palier d'entrée Pro (1 000 crédits / 49 €/mois) : le plus simple pour
  // débloquer immédiatement. Les autres paliers vivent sur /tarifs.
  const goPro = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "pro", credits: 1000, cycle: "monthly" }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.error ?? "Paiement indisponible pour le moment.");
    } catch {
      setError("Erreur réseau. Réessayez.");
    }
    setBusy(false);
  };

  return (
    <div className="w-full max-w-[460px] rounded-2xl border border-[#ECECF2] bg-white shadow-[0_12px_36px_rgba(60,40,120,0.08)] overflow-hidden animate-scale-in">
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-center gap-3 mb-2.5">
          <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-pink-500 flex items-center justify-center flex-shrink-0 shadow-[0_6px_18px_rgba(139,92,246,0.35)]">
            <Zap className="w-[18px] h-[18px] text-white" />
          </span>
          <div className="min-w-0">
            <p className="text-[14px] font-bold text-[#0A0A0A] leading-tight">
              Crédits insuffisants
            </p>
            <p className="text-[12px] text-[#6E6E6C] tabular-nums">
              {balance !== null ? `Solde : ${balance} crédits` : "Solde épuisé"}
              {required ? ` · nécessaire : ≈ ${required}` : ""}
            </p>
          </div>
        </div>
        <p className="text-[13px] text-[#4A4A56] leading-relaxed">
          Rechargez votre compte pour continuer : vos questions, applications et
          documents repartent immédiatement, sans rien perdre de la conversation.
        </p>
        {error && <p className="mt-2 text-[12px] text-rose-600">{error}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2 px-4 pb-4">
        <button
          type="button"
          onClick={goPro}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 px-4 py-2 text-[13px] font-semibold text-white shadow-[0_6px_18px_rgba(139,92,246,0.35)] transition-all hover:shadow-[0_8px_24px_rgba(139,92,246,0.5)] active:scale-[0.98] disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              Passer à Pro · 1 000 crédits / 49 €/mois
              <ArrowRight className="w-3.5 h-3.5" />
            </>
          )}
        </button>
        <Link
          href="/tarifs"
          className="inline-flex items-center rounded-full border border-[#ECECF2] bg-white px-4 py-2 text-[13px] font-semibold text-[#4A4A56] transition-colors hover:border-[#C9C9D6] hover:text-[#0A0A0A]"
        >
          Toutes les offres
        </Link>
      </div>
    </div>
  );
}
