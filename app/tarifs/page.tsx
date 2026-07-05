"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ChevronDown, ArrowRight, ArrowUpRight, MessageCircle, FileText, LayoutGrid } from "lucide-react";
import {
  getPlan, getTier, formatEur, groupTiers, ENTERPRISE,
  tierDisplayMonthlyEur, annualTotalEur,
  type Plan, type BillingCycle,
} from "@/lib/plans";
import { Reveal, Spot, InteractiveMesh, SiteNav, SiteFooter, EASE } from "@/components/site";

const FAQ: { q: string; a: string }[] = [
  { q: "Comment je commence ?", a: "Vous créez un compte et vous utilisez Biltia gratuitement, tout de suite. Vous avez 300 crédits offerts pour découvrir l'outil et créer votre première application. Quand ils sont épuisés, vous passez à Pro en choisissant votre volume de crédits." },
  { q: "Qu'est-ce qu'un crédit ?", a: "Un crédit reflète le travail réel de l'IA sur votre demande, pas un jeton technique. Une question simple coûte quelques crédits ; créer une application complète en coûte davantage. Pour les grosses créations, l'estimation s'affiche avant de lancer." },
  { q: "Mensuel ou annuel ?", a: "Comme vous voulez. L'engagement annuel vous fait économiser 2 mois (environ 17 %) sur le même volume de crédits. Vous pouvez basculer depuis vos paramètres à tout moment." },
  { q: "Les fonctionnalités changent-elles selon le prix ?", a: "Non. Pro donne accès à tout l'outil, sans fonctionnalité bridée : que vous preniez le plus petit ou le plus gros volume de crédits, vous avez exactement les mêmes capacités. Vous payez l'usage, pas un catalogue d'options à débloquer. Seules les briques revendeur et grand compte (marque blanche, URL personnalisée, multi-métiers, SSO, DPA) passent par l'offre Entreprise, sur devis." },
  { q: "Que se passe-t-il si je dépasse mes crédits ?", a: "Vous pouvez recharger à tout moment, ou passer à un palier supérieur. Rien n'est facturé sans votre accord." },
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

// ── Visuel « ce que vous faites avec vos crédits » ────────────────────────────
const PROJECTION_VOLUMES = [1000, 4000, 12000];
const PROJECTION_TASKS = [
  { Icon: MessageCircle, label: "Questions rapides", sub: "Taux de TVA, relance client, mémo de chantier", cost: 10, grad: "from-indigo-500 to-violet-500" },
  { Icon: FileText, label: "Devis & documents", sub: "Devis, PV de réception, PPSPS prêts à imprimer", cost: 35, grad: "from-violet-500 to-fuchsia-500" },
  { Icon: LayoutGrid, label: "Applications créées", sub: "Suivi de chantier, planning, mini-CRM déployés en ligne", cost: 250, grad: "from-fuchsia-500 to-pink-500" },
];

function CreditProjection() {
  const [vol, setVol] = useState(4000);
  const counts = PROJECTION_TASKS.map((t) => Math.floor(vol / t.cost));
  const max = Math.max(...counts);
  return (
    <div className="glass rounded-[26px] p-6 sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7C3AED]">Projetez-vous</p>
          <p className="mt-1 text-[17px] font-bold tracking-[-0.01em] text-[#0A0A0A]">Ce qu&apos;un mois de crédits permet</p>
        </div>
        <div className="inline-flex rounded-full border border-[#E6E1F0] bg-white/70 p-1">
          {PROJECTION_VOLUMES.map((v) => (
            <button
              key={v}
              onClick={() => setVol(v)}
              className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold tabular-nums transition-all ${vol === v ? "bg-gradient-to-r from-indigo-500 to-pink-500 text-white shadow-[0_6px_16px_rgba(139,92,246,0.35)]" : "text-[#5B5B66] hover:text-[#0A0A0A]"}`}
            >
              {v.toLocaleString("fr-FR")}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-7 space-y-6">
        {PROJECTION_TASKS.map((t, i) => {
          const count = counts[i];
          const w = Math.max(7, Math.round((count / max) * 100));
          return (
            <div key={t.label}>
              <div className="mb-2 flex items-end justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className={`grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br ${t.grad} text-white shadow-[0_6px_16px_rgba(139,92,246,0.28)]`}>
                    <t.Icon className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[14px] font-bold text-[#0A0A0A] leading-tight">{t.label}</p>
                    <p className="text-[12px] text-[#8B8B96] leading-snug">{t.sub}</p>
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  <span className="text-[19px] font-black tabular-nums text-[#0A0A0A]">≈ {count.toLocaleString("fr-FR")}</span>
                  <span className="block text-[11px] text-[#9A9AA6]">/ mois</span>
                </div>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#EEEBF5]">
                <motion.div
                  className={`h-full rounded-full bg-gradient-to-r ${t.grad}`}
                  initial={false}
                  animate={{ width: `${w}%` }}
                  transition={{ duration: 0.5, ease: EASE }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-[12px] text-[#9A9AA6] leading-relaxed">Estimations moyennes, mélange possible. Le coût réel dépend de la longueur et de la complexité de chaque tâche : une estimation s&apos;affiche avant les grosses créations.</p>
    </div>
  );
}

export default function TarifsPage() {
  const pro = getPlan("pro");
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [proCredits, setProCredits] = useState<number>(pro.defaultCredits ?? 4000);
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

        <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-5 items-stretch">
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
                <a href={`mailto:${ENTERPRISE.contactEmail}?subject=Biltia%20Entreprise%20-%20demande%20de%20devis`} className="mt-auto flex items-center justify-center gap-2 py-3 rounded-full text-[14px] font-semibold bg-white text-[#1E1B3A] transition-transform hover:scale-[1.01] active:scale-[0.99]">
                  Nous contacter <ArrowUpRight className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.16}><p className="text-center text-[12px] text-[#9A9AA6] mt-6">Sans engagement sur le mensuel. Paiement sécurisé via Stripe. Résiliation à tout moment.</p></Reveal>
      </section>

      {/* Comment fonctionnent les crédits */}
      <section className="relative px-5 sm:px-8 py-24 sm:py-28 border-t border-[#EDEDEB] overflow-hidden">
        <div className="max-w-6xl mx-auto">
          <Reveal className="max-w-2xl mb-14">
            <h2 className="text-[34px] sm:text-[44px] font-black text-[#0A0A0A] tracking-[-0.03em]">Comment marchent les <span className="text-gradient">crédits.</span></h2>
            <p className="text-[16px] text-[#5B5B66] leading-[1.6] mt-4">Un crédit, ce n&apos;est pas une requête ni un jeton technique : c&apos;est une part du travail réel fait par l&apos;IA. Une question simple consomme quelques crédits, créer une application complète en consomme davantage. Vous ne voyez jamais de tokens, seulement des crédits.</p>
          </Reveal>

          {/* Visuel de projection + scénarios */}
          <div className="grid gap-5 lg:grid-cols-[1.05fr_1fr] items-start mb-6">
            <Reveal><CreditProjection /></Reveal>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
              {[
                { tag: "Tâches rapides", range: "5 à 15 crédits", ex: "« Quel taux de TVA pour une rénovation ? » ou relancer un client sur son devis." },
                { tag: "Documents & devis", range: "20 à 50 crédits", ex: "Générer un devis, un PV de réception ou un PPSPS prêt à imprimer." },
                { tag: "Créer un outil", range: "150 à 300 crédits", ex: "Une application de suivi de chantier multi-équipes, déployée en ligne." },
              ].map((c, i) => (
                <Reveal key={c.tag} delay={i * 0.08}>
                  <div className="glass rounded-[22px] p-5 h-full">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7C3AED] mb-2">{c.tag}</p>
                    <p className="text-[22px] font-black tracking-[-0.02em] text-[#0A0A0A] mb-2">{c.range}</p>
                    <p className="text-[13px] text-[#5B5B66] leading-relaxed">{c.ex}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>

          {/* Comment c'est calculé */}
          <div className="grid sm:grid-cols-3 gap-5">
            {[
              { t: "Vous payez le travail réel", d: "Chaque crédit reflète le vrai coût des meilleurs modèles (Claude, GPT, Gemini). Pas de licence par utilisateur, pas de minimum." },
              { t: "Le cache réduit la facture", d: "Biltia réutilise le contexte d'une tâche à l'autre : les demandes répétées coûtent moins que si tout était recalculé à chaque fois." },
              { t: "Estimation avant les gros travaux", d: "Pour une création importante, une estimation en crédits s'affiche avant de lancer. Vous gardez le contrôle, comme un devis." },
            ].map((c, i) => (
              <Reveal key={c.t} delay={i * 0.06}>
                <div className="rounded-[22px] p-6 h-full border border-[#EDEDEB] bg-white/50">
                  <p className="font-bold text-[15px] text-[#0A0A0A] mb-2">{c.t}</p>
                  <p className="text-[13.5px] text-[#5B5B66] leading-relaxed">{c.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
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
