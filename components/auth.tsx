"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Briques des pages d'auth (split-screen façon produit) :
//  - AuthScene   : panneau droit, mesh Biltia vif + mini-conversation animée
//  - OAuthButtons: Google / Apple via Supabase (redirection /auth/callback)
//  - AUTH_INPUT / AUTH_LABEL : styles de champs partagés signup/login
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { createClient } from "@/lib/supabase";
import { useTypewriter } from "@/components/site";
import { Check, Mic, ArrowUpRight, FileText } from "lucide-react";

export const AUTH_INPUT =
  "w-full px-4 py-3 bg-white border border-[#E7E7E4] rounded-xl text-[#0A0A0A] placeholder-[#9A9AA6] text-sm focus:outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-500/15 transition-all";
export const AUTH_LABEL = "block text-xs font-semibold text-[#6E6E6C] mb-1.5";

// ── Logos fournisseurs ────────────────────────────────────────────────────────

function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden>
      <path fill="#4285F4" d="M23.52 12.273c0-.851-.076-1.67-.218-2.455H12v4.642h6.458a5.52 5.52 0 0 1-2.394 3.622v3.011h3.878c2.269-2.09 3.578-5.166 3.578-8.82z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.956-1.075 7.942-2.907l-3.878-3.011c-1.075.72-2.45 1.145-4.064 1.145-3.125 0-5.771-2.111-6.715-4.948H1.276v3.109A11.995 11.995 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.285 14.279A7.213 7.213 0 0 1 4.909 12c0-.79.136-1.56.376-2.279V6.612H1.276A11.995 11.995 0 0 0 0 12c0 1.936.464 3.769 1.276 5.388l4.009-3.109z" />
      <path fill="#EA4335" d="M12 4.773c1.762 0 3.344.605 4.587 1.794l3.442-3.442C17.951 1.19 15.235 0 12 0 7.31 0 3.253 2.69 1.276 6.612l4.009 3.109C6.229 6.884 8.875 4.773 12 4.773z" />
    </svg>
  );
}

// ── Boutons OAuth ─────────────────────────────────────────────────────────────

export function OAuthButtons({ next = "/dashboard", onError }: {
  /** Destination après le callback (le callback force /onboarding si besoin). */
  next?: string;
  onError?: (message: string) => void;
}) {
  const [pending, setPending] = useState(false);

  const go = async () => {
    if (pending) return;
    setPending(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) {
      setPending(false);
      onError?.("La connexion avec Google a échoué. Réessayez.");
    }
  };

  return (
    <button type="button" onClick={go} disabled={pending}
      className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl border border-[#E7E7E4] bg-white text-[14px] font-semibold text-[#0A0A0A] transition-all hover:border-[#C9BEF0] hover:shadow-[0_8px_22px_rgba(124,58,190,0.12)] active:scale-[0.99] disabled:opacity-60 disabled:cursor-wait">
      {pending
        ? <span className="h-4 w-4 rounded-full border-2 border-[#D6D0E4] border-t-[#7C3AED] animate-spin" />
        : <GoogleLogo />}
      Continuer avec Google
    </button>
  );
}

export function OrDivider({ label = "ou avec votre email" }: { label?: string }) {
  return (
    <div className="my-6 flex items-center gap-3" aria-hidden>
      <span className="h-px flex-1 bg-[#ECECF2]" />
      <span className="text-[12px] font-medium text-[#9A9AA6]">{label}</span>
      <span className="h-px flex-1 bg-[#ECECF2]" />
    </div>
  );
}

// ── Panneau droit : mesh Biltia + mini-conversation ───────────────────────────

const SCENE_PROMPTS = [
  "Fais-moi un outil de suivi pour mes 4 chantiers en cours…",
  "Rédige le PV de réception du chantier Morel…",
  "Quel taux de TVA pour une extension de maison ?",
  "Relance les 3 clients qui n'ont pas signé leur devis…",
];

export function AuthScene() {
  const typed = useTypewriter(SCENE_PROMPTS, { type: 42, del: 18, pause: 2100 });

  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden rounded-[30px]">
      {/* Mesh Biltia, version vive (le wow reste à droite, le calme à gauche) */}
      <div className="absolute inset-0" style={{ background: "linear-gradient(165deg, #EDEFFF 0%, #F5EDFF 38%, #FFECF6 72%, #FFF3EA 100%)" }} />
      <div className="absolute -top-[18%] -left-[12%] h-[58%] w-[58%] rounded-full blur-[110px] animate-drift-a" style={{ background: "radial-gradient(circle, rgba(99,102,241,0.55), transparent 66%)" }} />
      <div className="absolute top-[2%] right-[-14%] h-[54%] w-[54%] rounded-full blur-[120px] animate-drift-c" style={{ background: "radial-gradient(circle, rgba(168,85,247,0.5), transparent 66%)" }} />
      <div className="absolute bottom-[-16%] left-[6%] h-[56%] w-[56%] rounded-full blur-[120px] animate-drift-b" style={{ background: "radial-gradient(circle, rgba(236,72,153,0.48), transparent 66%)" }} />
      <div className="absolute bottom-[-10%] right-[0%] h-[46%] w-[46%] rounded-full blur-[110px] animate-drift-d" style={{ background: "radial-gradient(circle, rgba(251,146,60,0.4), transparent 66%)" }} />
      <div className="bg-grain pointer-events-none absolute inset-0 opacity-[0.045]" />

      {/* Pastilles flottantes (réparties dans les 4 coins, dégagées du centre) */}
      <span className="glass animate-float absolute left-[5%] top-[9%] z-10 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12px] font-semibold text-[#4A4A56]">
        <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500" /> 300 crédits offerts
      </span>
      <span className="glass animate-float delay-300 absolute right-[5%] top-[8%] z-10 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12px] font-semibold text-[#4A4A56]">
        <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-br from-pink-500 to-rose-500" /> Devis PDF en 2 min
      </span>
      <span className="glass animate-float delay-500 absolute left-[6%] bottom-[16%] z-10 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12px] font-semibold text-[#4A4A56]">
        <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500" /> Agents autonomes
      </span>
      <span className="glass animate-float delay-600 absolute right-[6%] bottom-[13%] z-10 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12px] font-semibold text-[#4A4A56]">
        <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-br from-orange-400 to-amber-500" /> Suivi de chantier
      </span>

      {/* Mini-conversation (décorative) */}
      <div className="relative z-10 w-[86%] max-w-[480px]" aria-hidden>
        <div className="animate-reveal-up delay-200 mb-3.5 flex justify-end">
          <div className="max-w-[85%] rounded-3xl rounded-br-lg bg-[#0A0A0A] px-[18px] py-3 text-[13.5px] leading-relaxed text-white shadow-[0_16px_40px_rgba(10,10,10,0.25)]">
            Fais-moi le devis pour la salle de bain de M. Costa, 8 m², rénovation complète.
          </div>
        </div>

        <div className="animate-reveal-up delay-400 mb-7 flex justify-start">
          <div className="max-w-[88%] rounded-3xl rounded-bl-lg border border-white/60 bg-white/85 px-[18px] py-3.5 shadow-[0_20px_50px_rgba(60,40,120,0.16)] backdrop-blur-xl">
            <div className="flex items-center gap-2">
              <span className="grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-pink-500">
                <Check className="h-3 w-3 text-white" strokeWidth={3.5} />
              </span>
              <p className="text-[13.5px] font-bold text-[#0A0A0A]">Devis prêt.</p>
            </div>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#5B5B66]">
              Rénovation SDB 8 m² · TVA 10 % appliquée · marge vérifiée.
            </p>
            <span className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-[#ECECF2] bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-[#4A4A56]">
              <FileText className="h-3.5 w-3.5 text-[#7C3AED]" /> devis-costa.pdf
            </span>
          </div>
        </div>

        {/* La barre de chat Biltia, avec sa bordure lumineuse animée */}
        <div className="animate-reveal-up delay-500 pointer-events-none">
          <div className="chatframe" style={{ borderRadius: 26 }}>
            <div className="chatcard rounded-[26px] border border-[#ECECF2] bg-white p-2.5 shadow-[0_20px_60px_rgba(60,40,120,0.12)]">
              <div className="relative min-h-[56px] px-4 pt-3.5 pb-1.5 text-left">
                <span className="text-[14px] leading-relaxed text-[#9A9AA6]">
                  {typed}
                  <span className="ml-0.5 inline-block h-[0.95em] w-[2px] translate-y-[2px] animate-blink bg-[#7C3AED]/80" />
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 px-2 pb-1">
                <span className="flex items-center gap-1.5 rounded-full border border-black/[0.06] bg-black/[0.04] px-3.5 py-2 text-[12.5px] font-medium text-[#4A4A56]">
                  <Mic className="h-3.5 w-3.5" /> Voix
                </span>
                <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 via-violet-500 to-pink-500 text-white shadow-[0_6px_20px_rgba(139,92,246,0.4)]">
                  <ArrowUpRight className="h-[17px] w-[17px]" />
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="absolute bottom-7 z-10 px-6 text-center text-[13px] font-medium text-[#5B5B66]">
        Décrivez votre problème. Biltia livre la solution, vos agents s&apos;occupent du reste.
      </p>
    </div>
  );
}
