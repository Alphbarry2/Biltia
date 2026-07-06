"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ChevronDown, ArrowRight, CalendarDays, MessageCircle, FileText, LayoutGrid, Bot } from "lucide-react";
import {
  getPlan, getTier, formatEur, groupTiers, ENTERPRISE,
  tierDisplayMonthlyEur, annualTotalEur,
  type Plan, type BillingCycle,
} from "@/lib/plans";
import { Reveal, Spot, InteractiveMesh, SiteNav, SiteFooter, EASE } from "@/components/site";
import { ReserveDemoButton } from "@/components/demo-booking";

const FAQ: { q: string; a: string }[] = [
  { q: "Comment je commence ?", a: "Vous créez un compte et vous utilisez Biltia gratuitement, tout de suite. Vous avez 300 crédits offerts pour découvrir l'outil et créer votre première application. Quand ils sont épuisés, vous passez à Pro en choisissant votre volume de crédits." },
  { q: "Qu'est-ce qu'un crédit ?", a: "Un crédit reflète le travail réel de l'IA sur votre demande, pas un jeton technique. Une question simple coûte quelques crédits ; créer une application complète ou faire travailler un agent tous les jours en coûte davantage. Pour les grosses créations et au recrutement d'un agent, l'estimation s'affiche avant de lancer." },
  { q: "Combien coûte un agent ?", a: "Recruter un agent est gratuit : vous dictez la mission, c'est tout. Ensuite, chaque passage est débité selon la complexité : environ 10 crédits pour un message ou un rappel, 25 pour un contrôle de vos données, 50 pour une analyse complète. Un agent quotidien simple utilise donc environ 300 crédits par mois, inclus dans votre forfait. L'estimation est annoncée au recrutement, le coût réel de chaque passage est visible dans son journal, et si vos crédits s'épuisent l'agent se met en pause : jamais de facture surprise." },
  { q: "Mensuel ou annuel ?", a: "Comme vous voulez. L'engagement annuel vous fait économiser 2 mois (environ 17 %) sur le même volume de crédits. Vous pouvez basculer depuis vos paramètres à tout moment." },
  { q: "Les fonctionnalités changent-elles selon le prix ?", a: "Non. Pro donne accès à tout l'outil, sans fonctionnalité bridée : que vous preniez le plus petit ou le plus gros volume de crédits, vous avez exactement les mêmes capacités. Vous payez l'usage, pas un catalogue d'options à débloquer. Seules les briques revendeur et grand compte (marque blanche, URL personnalisée, multi-métiers, SSO, DPA) passent par l'offre Entreprise, sur devis." },
  { q: "Que se passe-t-il si je dépasse mes crédits ?", a: "Vous pouvez recharger à tout moment, ou passer à un palier supérieur. Vos agents se mettent en pause en attendant, et rien n'est facturé sans votre accord." },
  { q: "Mes données sont-elles en sécurité ?", a: "Oui. Vos données sont hébergées en France, isolées par entreprise, et jamais utilisées pour entraîner des modèles d'IA." },
];

// ── Bascule Mensuel / Annuel ──────────────────────────────────────────────────
function CycleToggle({ cycle, setCycle }: { cycle: BillingCycle; setCycle: (c: BillingCycle) => void }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-[#E6E1F0] bg-white/80 p-1 backdrop-blur">
      <button
        onClick={() => setCycle("monthly")}
        className={`rounded-full px-4 py-2 text-[13px] font-semibold transition-all ${cycle === "monthly" ? "bg-[#0A0A0A] text-white shadow-[0_4px_14px_rgba(10,10,10,0.2)]" : "text-[#5B5B66] hover:text-[#0A0A0A]"}`}
      >
        Mensuel
      </button>
      <button
        onClick={() => setCycle("annual")}
        className={`flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold transition-all ${cycle === "annual" ? "bg-[#0A0A0A] text-white shadow-[0_4px_14px_rgba(10,10,10,0.2)]" : "text-[#5B5B66] hover:text-[#0A0A0A]"}`}
      >
        Annuel
        <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${cycle === "annual" ? "bg-white/20 text-white" : "bg-gradient-to-r from-indigo-500 to-pink-500 text-white"}`}>-2 mois</span>
      </button>
    </div>
  );
}

// ── Sélecteur de crédits (dropdown custom en portail, regroupé par profil) ─────
function CreditSelect({ plan, value, cycle, onChange }: { plan: Plan; value: number; cycle: BillingCycle; onChange: (n: number) => void }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const current = getTier(plan.id, value);
  const groups = groupTiers(plan.tiers);
  const priceOf = (t: { credits: number; priceEur: number }) => formatEur(tierDisplayMonthlyEur(t, cycle));

  const place = () => {
    const b = btnRef.current?.getBoundingClientRect();
    if (b) setPos({ top: b.bottom + 8, left: b.left, width: b.width });
  };

  useEffect(() => {
    if (!open) return;
    place();
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onReflow = () => setOpen(false); // fermeture propre au scroll/resize de la page
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onReflow, { passive: true });
    window.addEventListener("resize", onReflow);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onReflow);
      window.removeEventListener("resize", onReflow);
    };
  }, [open]);

  return (
    <div className="relative mt-4 mb-6">
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[#8B8B96]">Volume de crédits / mois</label>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`group flex w-full items-center justify-between gap-3 rounded-2xl border bg-white px-4 py-3 text-left transition-all duration-200 ${open ? "border-[#7C3AED] ring-2 ring-[#7C3AED]/25 shadow-[0_12px_30px_rgba(124,58,190,0.18)]" : "border-[#E6E1F0] hover:border-[#C9BEF0] hover:shadow-[0_8px_22px_rgba(124,58,190,0.12)]"}`}
      >
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="text-[15px] font-bold tabular-nums text-[#0A0A0A]">{value.toLocaleString("fr-FR")}</span>
          <span className="text-[12.5px] text-[#8B8B96]">crédits / mois</span>
        </span>
        <span className="flex flex-shrink-0 items-center gap-2.5">
          {current && <span className="text-[13px] font-bold tabular-nums text-[#7C3AED]">{priceOf(current)}</span>}
          <span className={`grid h-6 w-6 place-items-center rounded-full bg-[#F1ECFB] text-[#7C3AED] transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
            <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.5} />
          </span>
        </span>
      </button>

      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {open && pos && (
            <motion.div
              ref={menuRef}
              style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 100 }}
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.16, ease: EASE }}
              role="listbox"
              aria-label={`Volume de crédits, ${plan.name}`}
              className="max-h-[300px] overflow-y-auto overscroll-contain rounded-2xl border border-[#ECE7F6] bg-white p-1.5 shadow-[0_30px_80px_rgba(60,40,120,0.28)]"
            >
              {groups.map((g) => (
                <div key={g.label} className="mb-0.5 last:mb-0">
                  <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#B4ADC4]">{g.label}</p>
                  {g.tiers.map((t) => {
                    const active = t.credits === value;
                    return (
                      <button
                        key={t.credits}
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => { onChange(t.credits); setOpen(false); }}
                        className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${active ? "bg-[#F3EFFC]" : "hover:bg-[#F6F4FB]"}`}
                      >
                        <span className="flex items-center gap-2.5">
                          <span className={`grid h-4 w-4 flex-shrink-0 place-items-center rounded-full border ${active ? "border-transparent bg-gradient-to-br from-indigo-500 to-pink-500" : "border-[#D6D0E4]"}`}>
                            {active && <Check className="h-2.5 w-2.5 text-white" strokeWidth={4} />}
                          </span>
                          <span className={`text-[13.5px] tabular-nums ${active ? "font-bold text-[#0A0A0A]" : "font-medium text-[#3A3A46]"}`}>{t.credits.toLocaleString("fr-FR")} crédits</span>
                        </span>
                        <span className={`text-[13px] tabular-nums ${active ? "font-bold text-[#7C3AED]" : "text-[#8B8B96]"}`}>{priceOf(t)}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}

// ── « Projetez-vous » : ticket d'un mois type, volume au choix ────────────────
// PANIER CUMULATIF (les lignes s'ADDITIONNENT, la somme fait pile le volume) —
// jamais de barres ni de « ≈400 au choix » : les deux anciennes versions se
// lisaient de travers (barre lue comme un coût, nombre lu comme un prix).
// Coûts unitaires : question 10 cr · document 35 · app 250 · agent quotidien
// 300/mois. Volumes = vrais paliers Pro (le prix affiché vient de lib/plans).
const MONTH_MIX: { vol: number; agents: number; apps: number; docs: number; questions: number }[] = [
  { vol: 1000, agents: 1, apps: 1, docs: 8, questions: 17 },      // 300+250+280+170
  { vol: 2000, agents: 2, apps: 2, docs: 20, questions: 20 },     // 600+500+700+200
  { vol: 4000, agents: 3, apps: 4, docs: 40, questions: 70 },     // 900+1000+1400+700
  { vol: 12000, agents: 8, apps: 12, docs: 160, questions: 100 }, // 2400+3000+5600+1000
];

function MonthTicket() {
  const [vol, setVol] = useState(1000);
  const mix = MONTH_MIX.find((m) => m.vol === vol) ?? MONTH_MIX[0];
  const tier = getTier("pro", vol);
  const lines = [
    { n: mix.agents, label: mix.agents > 1 ? "agents autonomes, au travail chaque jour" : "agent autonome, au travail chaque jour", c: mix.agents * 300 },
    { n: mix.apps, label: mix.apps > 1 ? "applications sur mesure" : "application sur mesure", c: mix.apps * 250 },
    { n: mix.docs, label: "devis & documents", c: mix.docs * 35 },
    { n: mix.questions, label: "questions rapides", c: mix.questions * 10 },
  ];
  return (
    <div className="relative overflow-hidden rounded-[26px] p-6 sm:p-7 h-full text-white" style={{ background: "linear-gradient(150deg, #1E1B3A 0%, #3B2B6E 52%, #5B2B7E 100%)" }}>
      <div className="pointer-events-none absolute -right-14 -top-16 h-48 w-48 rounded-full blur-[80px]" style={{ background: "radial-gradient(circle, rgba(236,72,153,0.35), transparent 70%)" }} />
      <div className="relative">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-white/50">Projetez-vous : votre mois avec</p>
          <div className="inline-flex rounded-full bg-white/10 p-1">
            {MONTH_MIX.map((m) => (
              <button
                key={m.vol}
                onClick={() => setVol(m.vol)}
                className={`rounded-full px-3 py-1.5 text-[12px] font-semibold tabular-nums transition-all ${vol === m.vol ? "bg-white text-[#1E1B3A]" : "text-white/65 hover:text-white"}`}
              >
                {m.vol.toLocaleString("fr-FR")}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-3.5">
          {lines.map((l) => (
            <div key={l.label} className="flex items-baseline gap-2">
              <span className="text-[15px] font-black tabular-nums">{l.n.toLocaleString("fr-FR")}</span>
              <span className="text-[13.5px] text-white/85">{l.label}</span>
              <span className="flex-1 border-b border-dotted border-white/25 translate-y-[-3px]" />
              <span className="text-[13px] tabular-nums text-white/60">{l.c.toLocaleString("fr-FR")}</span>
            </div>
          ))}
        </div>
        <div className="mt-5 border-t border-white/15 pt-4 flex items-baseline justify-between">
          <span className="text-[14px] font-bold">Le tout, dans le même mois</span>
          <span className="text-[17px] font-black tabular-nums">{vol.toLocaleString("fr-FR")} cr</span>
        </div>
        <p className="mt-1.5 text-[12.5px] text-white/55">
          {tier ? <>Soit le forfait à {formatEur(tier.priceEur)}/mois.</> : null} Un exemple de répartition : à vous de doser autrement.
        </p>
      </div>
    </div>
  );
}


export default function TarifsPage() {
  const pro = getPlan("pro");
  const free = getPlan("free");
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [proCredits, setProCredits] = useState<number>(pro.defaultCredits ?? 1000);
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  const tier = getTier("pro", proCredits);
  const monthlyLabel = tier ? formatEur(tierDisplayMonthlyEur(tier, cycle)) : "—";

  return (
    <main className="bg-[#FCFCFD] min-h-screen overflow-x-hidden text-[#0A0A0A]">
      <SiteNav />

      {/* Hero */}
      <section className="relative overflow-hidden px-5 sm:px-8 pt-36 pb-14">
        <InteractiveMesh strong />
        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <span className="glass inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[13px] font-medium text-[#4A4A56] mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-br from-indigo-500 to-pink-500" />
            Tarifs
          </span>
          <h1 className="text-[48px] sm:text-[72px] font-black tracking-[-0.045em] leading-[0.92] text-[#0A0A0A]">Un prix <span className="text-gradient">clair.</span></h1>
          <p className="text-[17px] sm:text-[19px] text-[#5B5B66] max-w-[560px] mx-auto leading-[1.55] mt-6">Commencez gratuitement, sans carte bancaire. Vous ne payez qu&apos;au moment de passer à Pro, et vous choisissez alors votre volume de crédits.</p>
          <div className="mt-8">
            <a href="/signup" className="inline-flex items-center gap-2 rounded-full bg-[#0A0A0A] px-6 py-3.5 text-[15px] font-semibold text-white transition-transform hover:scale-[1.02] active:scale-[0.98]">
              Commencer gratuitement <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>

      {/* Plans */}
      <section className="relative px-5 sm:px-8 pb-24 overflow-hidden">
        <Reveal className="flex justify-center mb-8">
          <CycleToggle cycle={cycle} setCycle={setCycle} />
        </Reveal>

        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-5 items-stretch">
          {/* Free — montrer qu'un plan gratuit existe (sans carte bancaire). */}
          <Reveal className="relative">
            <div className="relative flex h-full flex-col rounded-[26px] p-7 border border-[#ECECF2] bg-white shadow-[0_4px_16px_rgba(60,40,120,0.06)]">
              <p className="font-bold text-lg tracking-[-0.01em] text-[#0A0A0A] mb-1">{free.name}</p>
              <p className="inline-flex w-fit items-center rounded-full bg-[#F4F1FB] px-2.5 py-1 text-[12px] font-semibold text-[#6D4AE0] mb-4">{free.audience}</p>
              <p className="text-[13px] text-[#8B8B96] mb-6 leading-snug">{free.tagline}</p>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-5xl font-black tabular-nums tracking-[-0.03em] text-[#0A0A0A]">0 €</span>
                <span className="text-[13px] text-[#9A9AA6]">/mois</span>
              </div>
              <p className="text-[12px] text-[#9A9AA6] min-h-[18px]">300 crédits offerts, sans carte bancaire.</p>
              <ul className="space-y-3 mb-8 mt-6">
                {free.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[13px]"><Check className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-[#7C3AED]" strokeWidth={2.5} /><span className="text-[#4A4A56]">{f}</span></li>
                ))}
              </ul>
              <a href="/signup" className="mt-auto flex items-center justify-center gap-2 py-3 rounded-full text-[14px] font-semibold transition-all border border-[#E7E2D7] text-[#0A0A0A] hover:bg-[#F6F6F9]">
                Commencer gratuitement <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>
          </Reveal>

          {/* Pro */}
          <Reveal className="relative">
            <div className="absolute -inset-4 -z-10 rounded-[38px] blur-2xl opacity-60" style={{ background: "radial-gradient(closest-side, rgba(139,92,246,0.35), rgba(236,72,153,0.2), transparent)" }} />
            <Spot className="relative flex h-full flex-col rounded-[26px] p-7 grad-border glass-hover">
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="font-bold text-lg tracking-[-0.01em] text-[#0A0A0A]">{pro.name}</p>
                <span className="flex-shrink-0 px-2.5 py-1 rounded-full text-white text-[10.5px] font-bold uppercase tracking-wide bg-gradient-to-r from-indigo-500 to-pink-500 shadow-[0_4px_14px_rgba(139,92,246,0.35)]">
                  Recommandé
                </span>
              </div>
              <p className="inline-flex w-fit items-center rounded-full bg-[#F4F1FB] px-2.5 py-1 text-[12px] font-semibold text-[#6D4AE0] mb-4">{pro.audience}</p>
              <p className="text-[13px] text-[#8B8B96] mb-6 leading-snug">{pro.tagline}</p>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-5xl font-black tabular-nums tracking-[-0.03em] text-[#0A0A0A]">{monthlyLabel}</span>
                <span className="text-[13px] text-[#9A9AA6]">/mois</span>
              </div>
              <p className="text-[12px] text-[#9A9AA6] min-h-[18px]">
                {cycle === "annual"
                  ? tier ? <>Soit {formatEur(annualTotalEur(tier.priceEur))} facturés une fois par an, 2 mois offerts.</> : null
                  : <>Ou passez à l&apos;annuel pour 2 mois offerts.</>}
              </p>
              <CreditSelect plan={pro} value={proCredits} cycle={cycle} onChange={setProCredits} />
              <ul className="space-y-3 mb-8">
                {pro.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[13px]"><Check className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-[#7C3AED]" strokeWidth={2.5} /><span className="text-[#4A4A56]">{f}</span></li>
                ))}
              </ul>
              <a href={`/signup?plan=pro&credits=${proCredits}&cycle=${cycle}`} className="mt-auto flex items-center justify-center gap-2 py-3 rounded-full text-[14px] font-semibold transition-all bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 text-white shadow-[0_8px_24px_rgba(139,92,246,0.4)] hover:shadow-[0_10px_30px_rgba(139,92,246,0.55)]">
                Choisir Pro <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </Spot>
          </Reveal>

          {/* Entreprise */}
          <Reveal delay={0.08} className="relative">
            <div className="relative flex h-full flex-col overflow-hidden rounded-[26px] p-7 text-white" style={{ background: "linear-gradient(150deg, #1E1B3A 0%, #3B2B6E 52%, #5B2B7E 100%)" }}>
              <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full blur-[90px]" style={{ background: "radial-gradient(circle, rgba(236,72,153,0.4), transparent 70%)" }} />
              <div className="pointer-events-none absolute -left-12 bottom-[-20%] h-56 w-56 rounded-full blur-[90px]" style={{ background: "radial-gradient(circle, rgba(99,102,241,0.45), transparent 70%)" }} />
              <div className="relative flex h-full flex-col">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="font-bold text-lg tracking-[-0.01em]">{ENTERPRISE.name}</p>
                  <span className="flex-shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide backdrop-blur-sm">{ENTERPRISE.tagline}</span>
                </div>
                <p className="inline-flex w-fit items-center rounded-full bg-white/10 px-2.5 py-1 text-[12px] font-semibold text-white/80 mb-4">{ENTERPRISE.audience}</p>
                <p className="text-[13px] text-white/60 mb-6 leading-snug">Volume et contrat négociés selon vos besoins.</p>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-5xl font-black tracking-[-0.03em]">Sur devis</span>
                </div>
                <p className="text-[12px] text-white/50 min-h-[18px] mb-[26px]">Réponse sous 24 h ouvrées.</p>
                <ul className="space-y-3 mb-8">
                  {ENTERPRISE.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-[13px]"><Check className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-pink-300" strokeWidth={2.5} /><span className="text-white/90">{f}</span></li>
                  ))}
                </ul>
                <ReserveDemoButton className="mt-auto flex w-full items-center justify-center gap-2 py-3 rounded-full text-[14px] font-semibold bg-white text-[#1E1B3A] transition-transform hover:scale-[1.01] active:scale-[0.99]">
                  Réserver une démo <CalendarDays className="w-3.5 h-3.5" />
                </ReserveDemoButton>
              </div>
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.16}><p className="text-center text-[12px] text-[#9A9AA6] mt-6">Sans engagement sur le mensuel. Paiement sécurisé via Stripe. Résiliation à tout moment.</p></Reveal>
      </section>

      {/* Comment fonctionnent les crédits */}
      <section className="relative px-5 sm:px-8 py-24 sm:py-28 border-t border-[#EDEDEB] overflow-hidden">
        <div className="max-w-6xl mx-auto">
          <Reveal className="max-w-2xl mb-12">
            <h2 className="text-[34px] sm:text-[44px] font-black text-[#0A0A0A] tracking-[-0.03em]">Comment marchent les <span className="text-gradient">crédits.</span></h2>
            <p className="text-[16px] text-[#5B5B66] leading-[1.6] mt-4">Un crédit paie du travail fait. Une question en utilise quelques-uns, une application beaucoup plus. C&apos;est tout.</p>
          </Reveal>

          <div className="grid gap-5 lg:grid-cols-2 items-stretch max-w-5xl">
            {/* Le tarif de chaque tâche (menu) */}
            <Reveal>
              <div className="glass rounded-[26px] p-6 sm:p-7 h-full">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7C3AED] mb-4">Ce que ça coûte</p>
                <div className="divide-y divide-black/[0.05]">
                  {[
                    { Icon: MessageCircle, grad: "from-indigo-500 to-violet-500", label: "Une question", sub: "« Quel taux de TVA ? », un client ajouté à la voix", c: "5 à 15" },
                    { Icon: FileText, grad: "from-violet-500 to-fuchsia-500", label: "Un devis, un document", sub: "prêt à imprimer et à signer", c: "20 à 50" },
                    { Icon: LayoutGrid, grad: "from-fuchsia-500 to-pink-500", label: "Une application", sub: "générée sur mesure, en ligne", c: "150 à 300" },
                    { Icon: Bot, grad: "from-cyan-500 to-indigo-500", label: "Un passage d'agent", sub: "le recrutement, lui, est gratuit", c: "10 à 50" },
                  ].map((r) => (
                    <div key={r.label} className="flex items-center gap-3.5 py-4 first:pt-0 last:pb-0">
                      <span className={`grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br ${r.grad} text-white shadow-[0_6px_16px_rgba(139,92,246,0.28)]`}>
                        <r.Icon className="h-[18px] w-[18px]" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[14.5px] font-bold text-[#0A0A0A] leading-tight">{r.label}</p>
                        <p className="text-[12px] text-[#8B8B96] leading-snug">{r.sub}</p>
                      </div>
                      <span className="flex-shrink-0 rounded-full bg-[#F1ECFB] px-3 py-1.5 text-[13px] font-bold tabular-nums text-[#6D4AE0]">{r.c} cr</span>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>

            {/* Un mois type, façon devis, volume au choix */}
            <Reveal delay={0.08}>
              <MonthTicket />
            </Reveal>
          </div>

          {/* Trois garanties, une ligne */}
          <Reveal delay={0.12}>
            <div className="mt-6 flex flex-wrap gap-2.5 max-w-5xl">
              {[
                "Estimation affichée avant les grosses créations",
                "Crédits épuisés : les agents se mettent en pause, jamais de surprise",
                "Saisie manuelle, imports et exports : toujours gratuits",
              ].map((t) => (
                <span key={t} className="inline-flex items-center gap-2 rounded-full border border-[#E6E1F0] bg-white/70 px-3.5 py-2 text-[12.5px] font-medium text-[#4A4A56]">
                  <Check className="h-3.5 w-3.5 flex-shrink-0 text-[#7C3AED]" strokeWidth={2.5} /> {t}
                </span>
              ))}
            </div>
          </Reveal>
        </div>
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
