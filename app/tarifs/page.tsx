"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, ArrowRight } from "lucide-react";
import { PLAN_LIST, getPlan, getTier, isPaidPlan, formatEur } from "@/lib/plans";
import { Reveal, Spot, InteractiveMesh, SiteNav, SiteFooter } from "@/components/site";

const FAQ: { q: string; a: string }[] = [
  { q: "Qu'est-ce qu'un crédit ?", a: "Un crédit correspond à une résolution : un document généré, une application créée, une automatisation lancée. Les modifications coûtent moins qu'une création." },
  { q: "Puis-je changer de palier ?", a: "Oui, à tout moment, à la hausse comme à la baisse. Le changement s'applique à l'échéance suivante." },
  { q: "Que se passe-t-il si je dépasse mes crédits ?", a: "Vous pouvez recharger à tout moment, ou passer à un palier supérieur. Rien n'est facturé sans votre accord." },
  { q: "Mes données sont-elles en sécurité ?", a: "Oui. Vos données sont hébergées en France, isolées par entreprise, et jamais utilisées pour entraîner des modèles d'IA." },
];

export default function TarifsPage() {
  const [proCredits, setProCredits] = useState<number>(getPlan("pro").defaultCredits ?? 400);
  const [bizCredits, setBizCredits] = useState<number>(getPlan("business").defaultCredits ?? 400);
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  const selected: Record<"pro" | "business", { credits: number; set: (n: number) => void }> = {
    pro: { credits: proCredits, set: setProCredits },
    business: { credits: bizCredits, set: setBizCredits },
  };

  return (
    <main className="bg-[#FCFCFD] min-h-screen overflow-x-hidden text-[#0A0A0A]">
      <SiteNav />

      {/* Hero */}
      <section className="relative overflow-hidden px-5 sm:px-8 pt-36 pb-16">
        <InteractiveMesh strong />
        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <span className="glass inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[13px] font-medium text-[#4A4A56] mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-br from-indigo-500 to-pink-500" />
            Tarifs
          </span>
          <h1 className="text-[48px] sm:text-[72px] font-black tracking-[-0.045em] leading-[0.92] text-[#0A0A0A]">Un prix <span className="text-gradient">clair.</span></h1>
          <p className="text-[17px] sm:text-[19px] text-[#5B5B66] max-w-[540px] mx-auto leading-[1.55] mt-6">Choisissez votre volume de crédits. Vous payez les résolutions, pas les saisies. Changez ou résiliez à tout moment.</p>
        </div>
      </section>

      {/* Plans */}
      <section className="relative px-5 sm:px-8 pb-24 overflow-hidden">
        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-5 items-stretch">
          {PLAN_LIST.map((plan, i) => {
            const paid = isPaidPlan(plan.id);
            const highlight = plan.id === "pro";
            const sel = paid ? selected[plan.id as "pro" | "business"] : null;
            const tier = paid && sel ? getTier(plan.id, sel.credits) : null;
            const priceLabel = tier ? formatEur(tier.priceEur) : "0 €";
            const cta = plan.id === "free" ? "Commencer gratuitement" : `Choisir ${plan.name}`;
            const href = plan.id === "free" ? "/signup" : `/signup?plan=${plan.id}&credits=${sel?.credits}`;
            return (
              <Reveal key={plan.id} delay={i * 0.08} className="relative">
                {highlight && <div className="absolute -inset-4 -z-10 rounded-[38px] blur-2xl opacity-60" style={{ background: "radial-gradient(closest-side, rgba(139,92,246,0.35), rgba(236,72,153,0.2), transparent)" }} />}
                <Spot className={`relative flex h-full flex-col rounded-[26px] p-7 overflow-hidden glass-hover ${highlight ? "grad-border" : "glass"}`}>
                  {highlight && <div className="absolute top-6 right-6 px-3 py-1 rounded-full text-white text-[11px] font-bold bg-gradient-to-r from-indigo-500 to-pink-500">Recommandé</div>}
                  <p className="font-bold text-lg tracking-[-0.01em] text-[#0A0A0A] mb-0.5">{plan.name}</p>
                  <p className="text-[13px] text-[#8B8B96] mb-6">{plan.tagline}</p>
                  <div className="flex items-baseline gap-1 mb-1"><span className="text-5xl font-black tabular-nums tracking-[-0.03em] text-[#0A0A0A]">{priceLabel}</span>{paid && <span className="text-[13px] text-[#9A9AA6]">/mois</span>}</div>
                  {paid && sel ? (
                    <div className="mt-4 mb-6">
                      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[#8B8B96]">Crédits par mois</label>
                      <div className="relative">
                        <select value={sel.credits} onChange={(e) => sel.set(Number(e.target.value))} aria-label={`Crédits par mois, ${plan.name}`} className="w-full cursor-pointer appearance-none rounded-xl border border-white/70 bg-white/70 px-3.5 py-2.5 pr-9 text-[14px] font-semibold text-[#0A0A0A] transition-colors focus:border-[#7C3AED] focus:outline-none">
                          {plan.tiers.map((t) => (<option key={t.credits} value={t.credits}>{t.credits.toLocaleString("fr-FR")} crédits</option>))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9A9AA6]" />
                      </div>
                    </div>
                  ) : (
                    <p className="text-[12px] text-[#7C3AED] mb-7 mt-2">10 crédits offerts, non renouvelables</p>
                  )}
                  <ul className="space-y-3 mb-8">
                    {plan.features.map((f) => (<li key={f} className="flex items-center gap-2.5 text-[13px]"><Check className="w-3.5 h-3.5 flex-shrink-0 text-[#7C3AED]" strokeWidth={2.5} /><span className="text-[#4A4A56]">{f}</span></li>))}
                  </ul>
                  <a href={href} className={`mt-auto flex items-center justify-center gap-2 py-3 rounded-full text-[14px] font-semibold transition-all ${highlight ? "bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 text-white shadow-[0_8px_24px_rgba(139,92,246,0.4)] hover:shadow-[0_10px_30px_rgba(139,92,246,0.55)]" : "bg-white/70 border border-white/60 text-[#0A0A0A] hover:bg-white"}`}>{cta} <ArrowRight className="w-3.5 h-3.5" /></a>
                </Spot>
              </Reveal>
            );
          })}
        </div>
        <Reveal delay={0.2}><p className="text-center text-[12px] text-[#9A9AA6] mt-6">Sans engagement. Paiement sécurisé via Stripe. Résiliation à tout moment.</p></Reveal>
      </section>

      {/* FAQ */}
      <section className="relative px-5 sm:px-8 py-24 sm:py-32 border-t border-[#EDEDEB]">
        <div className="max-w-2xl mx-auto">
          <Reveal className="text-center mb-12"><h2 className="text-[34px] sm:text-[44px] font-black text-[#0A0A0A] tracking-[-0.03em]">Vos questions.</h2></Reveal>
          <div className="space-y-2.5">
            {FAQ.map(({ q, a }, i) => (
              <Reveal key={i} delay={i * 0.04}>
                <div className="glass rounded-2xl overflow-hidden">
                  <button onClick={() => setOpenIdx(openIdx === i ? null : i)} className="w-full flex items-center justify-between px-5 py-4 text-left">
                    <span className="font-semibold text-[#0A0A0A] text-[14px] pr-4">{q}</span>
                    <ChevronDown className={`w-4 h-4 text-[#9A9AA6] flex-shrink-0 transition-transform ${openIdx === i ? "rotate-180" : ""}`} />
                  </button>
                  {openIdx === i && <p className="px-5 pb-5 text-[13.5px] text-[#5B5B66] leading-relaxed">{a}</p>}
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
