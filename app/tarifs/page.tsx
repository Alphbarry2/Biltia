"use client";

import { useState } from "react";
import { Check, ChevronDown, ArrowRight, CalendarDays, MessageCircle, Camera, FileText, LayoutGrid, Bot, Gift, Wrench } from "lucide-react";
import {
  getPlan, getTier, formatEur, SIGNUP_FREE_CREDITS,
  tierDisplayMonthlyEur, annualTotalEur, localizeEnterprise,
  type CreditTier, type BillingCycle, ACTION_CREDITS, AGENT_CREDITS_PER_MONTH } from "@/lib/plans";
import { Reveal, Spot, InteractiveMesh, SiteNav, SiteFooter } from "@/components/site";
import { ReserveDemoButton } from "@/components/demo-booking";
import { useT, useLocale } from "@/lib/i18n/context";
import type { Locale } from "@/lib/i18n/config";

function buildFaq(tr: (fr: string, en: string) => string): { q: string; a: string }[] {
  return [
    { q: tr("Comment je commence ?", "How do I get started?"), a: tr(`Vous créez un compte et vous utilisez Biltia gratuitement, tout de suite, avec ${SIGNUP_FREE_CREDITS} crédits offerts. Quand ils sont épuisés, vous choisissez votre forfait.`, `You create an account and use Biltia for free, right away, with ${SIGNUP_FREE_CREDITS} free credits. When they run out, you pick your plan.`) },
    { q: tr("Qu'est-ce qu'un crédit ?", "What is a credit?"), a: tr(`Un crédit, c'est le prix d'une action, connu d'avance et toujours le même : ${ACTION_CREDITS.question} crédits une question, ${ACTION_CREDITS.document} un devis, ${ACTION_CREDITS.application} une application sur mesure. Ce prix ne bouge pas selon la difficulté de votre demande. Et manipuler vos apps à la main est toujours gratuit.`, `A credit is the price of an action, known upfront and always the same: ${ACTION_CREDITS.question} credits for a question, ${ACTION_CREDITS.document} for a quote, ${ACTION_CREDITS.application} for a custom app. That price never changes with how hard your request is. And handling your apps by hand is always free.`) },
    { q: tr("Quel palier je choisis ?", "Which tier should I pick?"), a: tr("Un seul plan payant, tout inclus : vous choisissez juste votre capacité en crédits. Un artisan solo démarre à 49 €, une équipe qui tourne prend un palier plus haut. Prenez le plus proche de votre volume — vous montez ou descendez d'un cran à tout moment.", "One paid plan, everything included: you just pick your credit capacity. A solo tradesperson starts at €49, a busy team takes a higher tier. Pick the one closest to your volume — move up or down a tier anytime.") },
    { q: tr("Et si je dépasse mes crédits ?", "What if I run out of credits?"), a: tr("Deux options : rechargez à la carte quand vous voulez (+1 000 crédits pour 29 €, +2 000 pour 59 €, +4 000 pour 109 €), ou passez au palier supérieur — souvent plus avantageux. En attendant, vos agents se mettent en pause et rien n'est facturé sans votre accord.", "Two options: top up on demand whenever you want (+1,000 credits for €29, +2,000 for €59, +4,000 for €109), or move up a tier — often the better deal. In the meantime, your agents pause and nothing is charged without your consent.") },
    { q: tr("Puis-je changer de palier quand je veux ?", "Can I change tier whenever I want?"), a: tr("Oui, à tout moment et sans engagement. Vous montez d'un cran quand vous grandissez, vous redescendez si besoin. Vos apps, données, historique, agents et paramètres restent intacts.", "Yes, anytime and with no commitment. Move up a tier as you grow, move back down if needed. Your apps, data, history, agents and settings stay intact.") },
    { q: tr("Mes données sont-elles en sécurité ?", "Is my data secure?"), a: tr("Oui. Hébergées en France, isolées par entreprise, jamais utilisées pour entraîner des modèles d'IA.", "Yes. Hosted in France, isolated per company, never used to train AI models.") },
  ];
}

function numFmt(locale: Locale, n: number): string {
  return n.toLocaleString(locale === "en" ? "en-US" : "fr-FR");
}

// ── Bascule Mensuel / Annuel ──────────────────────────────────────────────────
function CycleToggle({ cycle, setCycle }: { cycle: BillingCycle; setCycle: (c: BillingCycle) => void }) {
  const tr = useT();
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-[#E6E1F0] bg-white/80 p-1 backdrop-blur">
      <button
        onClick={() => setCycle("monthly")}
        className={`rounded-full px-4 py-2 text-[13px] font-semibold transition-all ${cycle === "monthly" ? "bg-[#0A0A0A] text-white shadow-[0_4px_14px_rgba(10,10,10,0.2)]" : "text-[#5B5B66] hover:text-[#0A0A0A]"}`}
      >
        {tr("Mensuel", "Monthly")}
      </button>
      <button
        onClick={() => setCycle("annual")}
        className={`flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold transition-all ${cycle === "annual" ? "bg-[#0A0A0A] text-white shadow-[0_4px_14px_rgba(10,10,10,0.2)]" : "text-[#5B5B66] hover:text-[#0A0A0A]"}`}
      >
        {tr("Annuel", "Annual")}
        <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${cycle === "annual" ? "bg-white/20 text-white" : "bg-gradient-to-r from-indigo-500 to-pink-500 text-white"}`}>{tr("-2 mois", "-2 months")}</span>
      </button>
    </div>
  );
}

// ── Sélecteur de capacité (menu déroulant : tous les paliers du forfait) ───────
// Un seul plan payant, un curseur de crédits. En liste déroulante pour tenir tous
// les paliers (de 2 000 à 60 000) sans serrer la carte. Le grand prix au-dessus
// se met à jour selon le palier choisi.
function TierSelect({ tiers, value, onChange }: { tiers: CreditTier[]; value: number; onChange: (n: number) => void }) {
  const tr = useT();
  const locale = useLocale();
  return (
    <div className="mt-4 mb-5">
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[#8B8B96]">{tr("Capacité IA / mois", "AI capacity / month")}</label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={tr("Capacité IA par mois", "AI capacity per month")}
          className="w-full cursor-pointer appearance-none rounded-2xl border border-[#E6E1F0] bg-[#F6F4FB] px-4 py-3.5 pr-10 text-[15px] font-bold tabular-nums text-[#0A0A0A] transition-shadow hover:bg-white focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/25"
        >
          {tiers.map((t) => (
            <option key={t.credits} value={t.credits}>
              {numFmt(locale, t.credits)} {tr("crédits / mois", "credits / month")}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9A9AA6]" />
      </div>
    </div>
  );
}

// ── Carte d'un forfait payant (Pro ou Équipe) ─────────────────────────────────
// Petit lien repliable « 🎁 Crédits offerts » (natif <details>, aucun JS d'état) :
// une flèche discrète, sans encadré ni couleur ; au clic → « N crédits offerts »
// (N = SIGNUP_FREE_CREDITS, jamais réécrit à la main).
// Placé juste sous le prix, sur chaque plan SAUF Entreprise (sur devis).
function GiftCredits() {
  const tr = useT();
  return (
    <details className="group my-3">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 text-[12.5px] font-medium text-[#6E6E7A] [&::-webkit-details-marker]:hidden">
        <Gift className="h-4 w-4 flex-shrink-0 text-[#7C3AED]" strokeWidth={2} />
        <span>{tr("Crédits offerts", "Free credits")}</span>
        <ChevronDown className="h-3.5 w-3.5 text-[#9A9AA6] transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <p className="mt-1.5 pl-[22px] text-[13px] font-semibold text-[#0A0A0A]">{tr(`${SIGNUP_FREE_CREDITS} crédits offerts`, `${SIGNUP_FREE_CREDITS} free credits`)}</p>
    </details>
  );
}

function PaidCard({ name, includedLine, features, tiers, checkoutPlan, cycle, badge, recommended }: {
  name: string;
  includedLine: string;
  features: readonly string[];
  tiers: CreditTier[];
  checkoutPlan: string;
  cycle: BillingCycle;
  badge: string;
  recommended?: boolean;
}) {
  const tr = useT();
  const [credits, setCredits] = useState<number>(tiers[0].credits);
  const tier = tiers.find((t) => t.credits === credits) ?? tiers[0];
  const monthly = formatEur(tierDisplayMonthlyEur(tier, cycle));

  const inner = (
    <>
      <div className="flex items-center justify-between gap-2 mb-4">
        <p className="font-bold text-lg tracking-[-0.01em] text-[#0A0A0A]">{name}</p>
        <span
          className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[10.5px] font-bold uppercase tracking-wide ${recommended
            ? "text-white bg-gradient-to-r from-indigo-500 to-pink-500 shadow-[0_4px_14px_rgba(139,92,246,0.35)]"
            : "text-[#6D4AE0] bg-[#F1ECFB]"}`}
        >
          {badge}
        </span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-5xl font-black tabular-nums tracking-[-0.03em] text-[#0A0A0A]">{monthly}</span>
        <span className="text-[13px] text-[#9A9AA6]">{tr("/mois", "/month")}</span>
      </div>
      {cycle === "annual" && (
        <p className="mt-1 text-[12px] text-[#9A9AA6]">{tr(`Soit ${formatEur(annualTotalEur(tier.priceEur))} par an.`, `That's ${formatEur(annualTotalEur(tier.priceEur))} per year.`)}</p>
      )}
      <GiftCredits />
      <TierSelect tiers={tiers} value={credits} onChange={setCredits} />
      <div className="mb-5 flex items-center gap-2 text-[13px] font-semibold text-[#0A0A0A]">
        <Check className="h-3.5 w-3.5 flex-shrink-0 text-[#7C3AED]" strokeWidth={3} /> {includedLine}
      </div>
      <ul className="space-y-2.5 mb-8">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-[13px]"><Check className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-[#7C3AED]" strokeWidth={2.5} /><span className="text-[#4A4A56]">{f}</span></li>
        ))}
      </ul>
      {/* Pro est self-serve (Stripe câblé : STRIPE_PRICE_PRO_*). Le signup/onboarding
          fait voyager le palier choisi jusqu'au checkout. L'offre Entreprise (sur
          devis) est une carte à part. Plus de plan Équipe : tout est inclus dans Pro. */}
      <a
        href={`/signup?plan=${checkoutPlan}&credits=${credits}&cycle=${cycle}`}
        className={`mt-auto flex items-center justify-center gap-2 py-3 rounded-full text-[14px] font-semibold transition-all ${recommended
          ? "bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 text-white shadow-[0_8px_24px_rgba(139,92,246,0.4)] hover:shadow-[0_10px_30px_rgba(139,92,246,0.55)]"
          : "border border-[#E7E2D7] text-[#0A0A0A] hover:bg-[#F6F6F9]"}`}
      >
        {tr(`Choisir ${name}`, `Choose ${name}`)} <ArrowRight className="w-3.5 h-3.5" />
      </a>
    </>
  );

  if (recommended) {
    return (
      <Reveal className="relative">
        <div className="absolute -inset-4 -z-10 rounded-[38px] blur-2xl opacity-60" style={{ background: "radial-gradient(closest-side, rgba(139,92,246,0.35), rgba(236,72,153,0.2), transparent)" }} />
        <Spot className="relative flex h-full flex-col rounded-[26px] p-7 grad-border glass-hover">{inner}</Spot>
      </Reveal>
    );
  }
  return (
    <Reveal className="relative">
      <div className="relative flex h-full flex-col rounded-[26px] p-7 border border-[#ECECF2] bg-white shadow-[0_4px_16px_rgba(60,40,120,0.06)]">{inner}</div>
    </Reveal>
  );
}

// ── « Projetez-vous » : ticket d'un mois type, volume au choix ────────────────
// Panier cumulatif (les lignes s'ADDITIONNENT, la somme fait PILE le volume).
//
// ⚠️ CE PANIER DOIT DIRE LA VÉRITÉ, et la somme doit tomber PILE sur le volume
// vendu. Tous les tarifs viennent de lib/plans.ts → ACTION_CREDITS, la source
// unique appliquée par le serveur :
//   question 3 · photo lue 10 · document/devis 30 · application 300
//   agent qui RÉDIGE : 40/passage → AGENT_CREDITS_PER_MONTH (880) sur 22 jours ouvrés
//
// L'ancien panier comptait l'agent à 300/mois : il promettait 2 450 crédits de
// valeur pour un forfait de 2 000. Un client qui compte ses crédits l'aurait vu.
// Deux invariants VÉRIFIÉS : chaque panier tombe PILE sur le volume vendu, et aucune
// ligne ne RÉGRESSE quand on monte de palier (payer plus ne peut pas donner moins).
const MONTH_MIX: { vol: number; agents: number; apps: number; docs: number; photos: number; questions: number }[] = [
  // 880 + 300 + 450 + 130 + 240 = 2000 — l'artisan SOLO
  { vol: 2000, agents: 1, apps: 1, docs: 15, photos: 13, questions: 80 },
  // 1760 + 300 + 1500 + 200 + 240 = 4000 — l'artisan + compagnons
  { vol: 4000, agents: 2, apps: 1, docs: 50, photos: 20, questions: 80 },
  // 2640 + 300 + 2400 + 300 + 360 = 6000 — la TPE
  { vol: 6000, agents: 3, apps: 1, docs: 80, photos: 30, questions: 120 },
];

function MonthTicket() {
  const tr = useT();
  const locale = useLocale();
  const [vol, setVol] = useState(2000);
  const mix = MONTH_MIX.find((m) => m.vol === vol) ?? MONTH_MIX[0];
  const tier = getTier("pro", vol);
  const bigPlan = vol >= 10000;
  const lines = [
    { n: mix.agents, label: mix.agents > 1 ? tr("agents autonomes actifs chaque jour", "autonomous agents running every day") : tr("agent autonome actif chaque jour", "autonomous agent running every day"), c: mix.agents * AGENT_CREDITS_PER_MONTH },
    { n: mix.apps, label: bigPlan ? tr("applications ou modifications importantes", "apps or major changes") : mix.apps > 1 ? tr("applications sur mesure", "custom apps") : tr("application sur mesure", "custom app"), c: mix.apps * ACTION_CREDITS.application },
    { n: mix.docs, label: tr("devis & documents", "quotes & documents"), c: mix.docs * ACTION_CREDITS.document },
    { n: mix.photos, label: tr("photos & plans analysés", "photos & plans analysed"), c: mix.photos * ACTION_CREDITS.lecture_fichier },
    { n: mix.questions, label: tr("questions IA", "AI questions"), c: mix.questions * ACTION_CREDITS.question },
  ];
  return (
    <div className="relative overflow-hidden rounded-[26px] p-6 sm:p-7 h-full text-white" style={{ background: "linear-gradient(150deg, #1E1B3A 0%, #3B2B6E 52%, #5B2B7E 100%)" }}>
      <div className="pointer-events-none absolute -right-14 -top-16 h-48 w-48 rounded-full blur-[80px]" style={{ background: "radial-gradient(circle, rgba(236,72,153,0.35), transparent 70%)" }} />
      <div className="relative">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-white/50">{tr("Projetez-vous : votre mois avec", "Picture it: your month with")}</p>
          <div className="inline-flex rounded-full bg-white/10 p-1">
            {MONTH_MIX.map((m) => (
              <button
                key={m.vol}
                onClick={() => setVol(m.vol)}
                className={`rounded-full px-3 py-1.5 text-[12px] font-semibold tabular-nums transition-all ${vol === m.vol ? "bg-white text-[#1E1B3A]" : "text-white/65 hover:text-white"}`}
              >
                {numFmt(locale, m.vol)}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-3.5">
          {lines.map((l) => (
            <div key={l.label} className="flex items-baseline gap-2">
              <span className="text-[15px] font-black tabular-nums">{numFmt(locale, l.n)}</span>
              <span className="text-[13.5px] text-white/85">{l.label}</span>
              <span className="flex-1 border-b border-dotted border-white/25 translate-y-[-3px]" />
              <span className="text-[13px] tabular-nums text-white/60">{numFmt(locale, l.c)}</span>
            </div>
          ))}
        </div>
        <div className="mt-5 border-t border-white/15 pt-4 flex items-baseline justify-between">
          <span className="text-[14px] font-bold">{tr("Le tout, dans le même mois", "All of it, in the same month")}</span>
          <span className="text-[17px] font-black tabular-nums">{numFmt(locale, vol)} {tr("cr", "cr")}</span>
        </div>
        <p className="mt-1.5 text-[12.5px] text-white/55">
          {tier ? <>{tr(`Soit le forfait Pro à ${formatEur(tier.priceEur)}/mois. `, `That's the Pro plan at ${formatEur(tier.priceEur)}/month. `)}</> : null}{tr("Vous utilisez vos crédits comme vous voulez.", "You use your credits however you like.")}
        </p>
      </div>
    </div>
  );
}


export default function TarifsPage() {
  const tr = useT();
  const locale = useLocale();
  const pro = getPlan("pro");
  const enterprise = localizeEnterprise(locale);
  const FAQ = buildFaq(tr);
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <main className="bg-[#FCFCFD] min-h-screen overflow-x-hidden text-[#0A0A0A]">
      <SiteNav />

      {/* Hero */}
      <section className="relative overflow-hidden px-5 sm:px-8 pt-36 pb-14">
        <InteractiveMesh strong />
        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <span className="glass inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[13px] font-medium text-[#4A4A56] mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-br from-indigo-500 to-pink-500" />
            {tr("Tarifs", "Pricing")}
          </span>
          <h1 className="text-[48px] sm:text-[72px] font-black tracking-[-0.045em] leading-[0.92] text-[#0A0A0A]">{tr("Un prix ", "One ")}<span className="text-gradient">{tr("clair.", "clear price.")}</span></h1>
          <p className="text-[17px] sm:text-[19px] text-[#5B5B66] max-w-[520px] mx-auto leading-[1.55] mt-6">{tr("Tout est inclus. Vous choisissez votre capacité IA, et la collaboration si vous êtes plusieurs. Gratuit pour commencer.", "Everything included. You choose your AI capacity, and collaboration if there are several of you. Free to start.")}</p>
          <div className="mt-8">
            <a href="/signup" className="inline-flex items-center gap-2 rounded-full bg-[#0A0A0A] px-6 py-3.5 text-[15px] font-semibold text-white transition-transform hover:scale-[1.02] active:scale-[0.98]">
              {tr("Commencer gratuitement", "Start for free")} <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>

      {/* Plans */}
      <section className="relative px-5 sm:px-8 pb-24 overflow-hidden">
        <Reveal className="flex justify-center mb-8">
          <CycleToggle cycle={cycle} setCycle={setCycle} />
        </Reveal>

        <div className="max-w-5xl mx-auto grid gap-5 md:grid-cols-2 lg:grid-cols-3 items-stretch">
          {/* Découverte (Free) */}
          <Reveal className="relative">
            <div className="relative flex h-full flex-col rounded-[26px] p-7 border border-[#ECECF2] bg-white shadow-[0_4px_16px_rgba(60,40,120,0.06)]">
              <div className="flex items-center justify-between gap-2 mb-4">
                <p className="font-bold text-lg tracking-[-0.01em] text-[#0A0A0A]">{tr("Découverte", "Starter")}</p>
                <span className="flex-shrink-0 px-2.5 py-1 rounded-full text-[10.5px] font-bold uppercase tracking-wide text-[#6D4AE0] bg-[#F1ECFB]">{tr("Gratuit", "Free")}</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-5xl font-black tabular-nums tracking-[-0.03em] text-[#0A0A0A]">0 €</span>
                <span className="text-[13px] text-[#9A9AA6]">{tr("/mois", "/month")}</span>
              </div>
              <GiftCredits />
              <div className="mb-5 mt-3 flex items-center gap-2 text-[13px] font-semibold text-[#0A0A0A]">
                <Check className="h-3.5 w-3.5 flex-shrink-0 text-[#7C3AED]" strokeWidth={3} /> {tr("Tout pour tester Biltia", "Everything to try Biltia")}
              </div>
              <ul className="space-y-2.5 mb-8">
                {[
                  tr("Créez une première application", "Build your first app"),
                  tr("Générez un vrai devis", "Generate a real quote"),
                  tr("Vos apps et données restent accessibles", "Your apps and data stay accessible"),
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[13px]"><Check className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-[#7C3AED]" strokeWidth={2.5} /><span className="text-[#4A4A56]">{f}</span></li>
                ))}
              </ul>
              <a href="/signup" className="mt-auto flex items-center justify-center gap-2 py-3 rounded-full text-[14px] font-semibold transition-all border border-[#E7E2D7] text-[#0A0A0A] hover:bg-[#F6F6F9]">
                {tr("Commencer", "Get started")} <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>
          </Reveal>

          {/* Pro — un seul plan payant, tout inclus, capacité au choix */}
          <PaidCard
            name={pro.name}
            includedLine={tr("Tout Biltia, seul ou en équipe", "All of Biltia, solo or as a team")}
            features={[
              tr("Tous les templates BTP + apps, devis, documents, agents IA", "All construction templates + apps, quotes, documents, AI agents"),
              tr("Email et SMS automatiques", "Automatic email and SMS"),
              tr("Utilisateurs illimités, comptes employés à périmètre", "Unlimited users, scoped employee accounts"),
              tr("Portails client & sous-traitant, marque personnalisée", "Client & subcontractor portals, custom branding"),
              tr("Crédits renouvelés chaque mois", "Credits renewed every month"),
            ]}
            tiers={pro.tiers}
            checkoutPlan="pro"
            cycle={cycle}
            badge={tr("Recommandé", "Recommended")}
            recommended
          />

          {/* Entreprise */}
          <Reveal delay={0.08} className="relative">
            <div className="relative flex h-full flex-col overflow-hidden rounded-[26px] p-7 text-white" style={{ background: "linear-gradient(150deg, #1E1B3A 0%, #3B2B6E 52%, #5B2B7E 100%)" }}>
              <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full blur-[90px]" style={{ background: "radial-gradient(circle, rgba(236,72,153,0.4), transparent 70%)" }} />
              <div className="pointer-events-none absolute -left-12 bottom-[-20%] h-56 w-56 rounded-full blur-[90px]" style={{ background: "radial-gradient(circle, rgba(99,102,241,0.45), transparent 70%)" }} />
              <div className="relative flex h-full flex-col">
                <div className="flex items-center justify-between gap-2 mb-4">
                  <p className="font-bold text-lg tracking-[-0.01em]">{enterprise.name}</p>
                  <span className="flex-shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide backdrop-blur-sm">{enterprise.tagline}</span>
                </div>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-5xl font-black tracking-[-0.03em]">{tr("Sur devis", "Custom quote")}</span>
                </div>
                <p className="text-[12px] text-white/50 min-h-[18px] mb-[26px]">{tr("Volume de crédits sur mesure.", "Tailored credit volume.")}</p>
                <ul className="space-y-2.5 mb-8">
                  {[
                    tr("URL personnalisée", "Custom URL"),
                    tr("SSO et gestion des comptes", "SSO and account management"),
                    tr("DPA, hébergement et SLA dédiés", "DPA, dedicated hosting and SLA"),
                    tr("Support et onboarding dédiés", "Dedicated support and onboarding"),
                  ].map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-[13px]"><Check className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-pink-300" strokeWidth={2.5} /><span className="text-white/90">{f}</span></li>
                  ))}
                </ul>
                <ReserveDemoButton className="mt-auto flex w-full items-center justify-center gap-2 py-3 rounded-full text-[14px] font-semibold bg-white text-[#1E1B3A] transition-transform hover:scale-[1.01] active:scale-[0.99]">
                  {tr("Réserver une démo", "Book a demo")} <CalendarDays className="w-3.5 h-3.5" />
                </ReserveDemoButton>
              </div>
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.16}><p className="text-center text-[12px] text-[#9A9AA6] mt-6">{tr("Tout est inclus dans chaque forfait — seule la capacité en crédits change. Rechargez à tout moment dans l'application. Sans engagement sur le mensuel.", "Everything is included in every plan — only the credit capacity changes. Top up anytime in the app. No commitment on monthly billing.")}</p></Reveal>
      </section>

      {/* Comment fonctionnent les crédits */}
      <section className="relative px-5 sm:px-8 py-24 sm:py-28 border-t border-[#EDEDEB] overflow-hidden">
        <div className="max-w-6xl mx-auto">
          <Reveal className="max-w-2xl mb-12">
            <h2 className="text-[34px] sm:text-[44px] font-black text-[#0A0A0A] tracking-[-0.03em]">{tr("Comment marchent les ", "How ")}<span className="text-gradient">{tr("crédits.", "credits work.")}</span></h2>
            <p className="text-[16px] text-[#5B5B66] leading-[1.6] mt-4">{tr("Parler à Biltia coûte presque rien. Construire ou modifier un système coûte plus. C'est tout.", "Talking to Biltia costs almost nothing. Building or changing a system costs more. That's it.")}</p>
          </Reveal>

          <div className="grid gap-5 lg:grid-cols-2 items-stretch max-w-5xl">
            {/* Le tarif de chaque tâche */}
            <Reveal>
              <div className="glass rounded-[26px] p-6 sm:p-7 h-full">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7C3AED] mb-4">{tr("Ce que ça coûte", "What it costs")}</p>
                <div className="divide-y divide-black/[0.05]">
                  {/* PRIX EXACTS, LUS DANS LA GRILLE (lib/plans.ts → ACTION_CREDITS).
                      Ce bloc affichait des FOURCHETTES écrites en dur (« une application :
                      150 à 300 »)... pendant que le panier juste à côté en comptait 600 et
                      que le serveur en débitait 600. La page se contredisait elle-même.
                      Et une fourchette dit « ça dépend » — or le prix ne dépend justement
                      plus de rien : ni du modèle, ni de la difficulté de la demande. La
                      SEULE fourchette légitime est le passage d'agent, parce que là ça
                      dépend vraiment de ce que l'agent FAIT (alerter, rédiger, agir). */}
                  {[
                    { Icon: MessageCircle, grad: "from-indigo-500 to-violet-500", label: tr("Une question", "A question"), c: `${ACTION_CREDITS.question}` },
                    { Icon: Camera, grad: "from-sky-500 to-cyan-500", label: tr("Lire une photo, un document", "Read a photo, a document"), c: `${ACTION_CREDITS.lecture_fichier}` },
                    { Icon: FileText, grad: "from-violet-500 to-fuchsia-500", label: tr("Un devis, une facture, un courrier", "A quote, an invoice, a letter"), c: `${ACTION_CREDITS.document}` },
                    { Icon: LayoutGrid, grad: "from-fuchsia-500 to-pink-500", label: tr("Une application sur mesure", "A custom app"), c: `${ACTION_CREDITS.application}` },
                    { Icon: Wrench, grad: "from-amber-500 to-orange-500", label: tr("La modifier", "Change it"), c: `${ACTION_CREDITS.modification_app}` },
                    { Icon: Bot, grad: "from-cyan-500 to-indigo-500", label: tr("Un passage d'agent", "An agent run"), c: tr(`0 à ${ACTION_CREDITS.agent_action}`, `0 to ${ACTION_CREDITS.agent_action}`) },
                  ].map((r) => (
                    <div key={r.label} className="flex items-center gap-3.5 py-4 first:pt-0 last:pb-0">
                      <span className={`grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br ${r.grad} text-white shadow-[0_6px_16px_rgba(139,92,246,0.28)]`}>
                        <r.Icon className="h-[18px] w-[18px]" />
                      </span>
                      <p className="min-w-0 flex-1 text-[14.5px] font-bold text-[#0A0A0A] leading-tight">{r.label}</p>
                      <span className="flex-shrink-0 rounded-full bg-[#F1ECFB] px-3 py-1.5 text-[13px] font-bold tabular-nums text-[#6D4AE0]">{r.c} {tr("cr", "cr")}</span>
                    </div>
                  ))}
                </div>
                {/* La seule fourchette du produit, et elle s'EXPLIQUE : le prix suit ce
                    que l'agent fait, pas une « complexité » devinée à sa création. */}
                <p className="mt-4 pt-4 border-t border-black/[0.05] text-[12.5px] leading-relaxed text-[#6E6E7A]">
                  {tr(
                    `Un agent qui vous alerte ne coûte rien. Il coûte ${ACTION_CREDITS.agent_passage} crédits s'il lit chaque fiche pour juger, ${ACTION_CREDITS.agent_redaction} s'il rédige (une relance, un compte-rendu), et ${ACTION_CREDITS.agent_action} s'il agit lui-même dans votre workspace. Le reste — saisir, facturer, importer, exporter — est gratuit.`,
                    `An agent that just alerts you costs nothing. It costs ${ACTION_CREDITS.agent_passage} credits if it reads every record to judge, ${ACTION_CREDITS.agent_redaction} if it writes (a follow-up, a report), and ${ACTION_CREDITS.agent_action} if it acts in your workspace itself. Everything else — entering, invoicing, importing, exporting — is free.`
                  )}
                </p>
              </div>
            </Reveal>

            {/* Un mois type, volume au choix */}
            <Reveal delay={0.08}>
              <MonthTicket />
            </Reveal>
          </div>

          {/* Garanties */}
          <Reveal delay={0.12}>
            <div className="mt-6 flex flex-wrap gap-2.5 max-w-5xl">
              {[
                // Cette garantie était MENSONGÈRE : on classait la phrase de l'utilisateur,
                // on décidait tout seuls que c'était une app, et on prélevait — sans jamais
                // le lui dire. Elle est désormais TENUE : /api/generate refuse de construire
                // une app tant que le prix n'a pas été affiché ET accepté (porte de coût).
                // Le libellé dit maintenant ce que le code fait, ni plus ni moins.
                tr(`Le prix affiché, et accepté, avant chaque création d'application`, `The price shown, and accepted, before every app build`),
                tr("Crédits épuisés : les agents se mettent en pause", "Out of credits: agents pause"),
                tr("Saisie manuelle et exports : toujours gratuits", "Manual entry and exports: always free"),
              ].map((g) => (
                <span key={g} className="inline-flex items-center gap-2 rounded-full border border-[#E6E1F0] bg-white/70 px-3.5 py-2 text-[12.5px] font-medium text-[#4A4A56]">
                  <Check className="h-3.5 w-3.5 flex-shrink-0 text-[#7C3AED]" strokeWidth={2.5} /> {g}
                </span>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* FAQ */}
      <section className="relative px-5 sm:px-8 py-24 sm:py-32 border-t border-[#EDEDEB]">
        <div className="max-w-2xl mx-auto">
          <Reveal className="text-center mb-12"><h2 className="text-[34px] sm:text-[44px] font-black text-[#0A0A0A] tracking-[-0.03em]">{tr("Vos questions.", "Your questions.")}</h2></Reveal>
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
