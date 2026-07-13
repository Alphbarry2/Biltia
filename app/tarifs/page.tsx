"use client";

import { useState } from "react";
import { Check, ChevronDown, ArrowRight, CalendarDays, MessageCircle, Camera, FileText, LayoutGrid, Bot, Gift } from "lucide-react";
import {
  getPlan, getTier, formatEur, ENTERPRISE, EQUIPE, SIGNUP_FREE_CREDITS,
  tierDisplayMonthlyEur, annualTotalEur, localizeEnterprise, localizeEquipe,
  type CreditTier, type BillingCycle,
} from "@/lib/plans";
import { Reveal, Spot, InteractiveMesh, SiteNav, SiteFooter } from "@/components/site";
import { ReserveDemoButton } from "@/components/demo-booking";
import { useT, useLocale } from "@/lib/i18n/context";
import type { Locale } from "@/lib/i18n/config";

function buildFaq(tr: (fr: string, en: string) => string): { q: string; a: string }[] {
  return [
    { q: tr("Comment je commence ?", "How do I get started?"), a: tr("Vous créez un compte et vous utilisez Biltia gratuitement, tout de suite, avec 300 crédits offerts. Quand ils sont épuisés, vous choisissez votre forfait.", "You create an account and use Biltia for free, right away, with 300 free credits. When they run out, you pick your plan.") },
    { q: tr("Qu'est-ce qu'un crédit ?", "What is a credit?"), a: tr("Un crédit reflète le travail réel de l'IA. Une question coûte quelques crédits ; créer une application en coûte plus. Manipuler vos apps à la main est toujours gratuit.", "A credit reflects the AI's actual work. A question costs a few credits; building an app costs more. Handling your apps by hand is always free.") },
    { q: tr("Pro ou Équipe ?", "Pro or Team?"), a: tr("Pro, c'est Biltia pour vous : apps, devis, documents, agents personnels. Équipe ajoute tout ce qui fait entrer d'autres personnes : salariés, clients, sous-traitants, rôles et portails. Si Biltia travaille juste pour vous, c'est Pro ; s'il fait travailler d'autres personnes, c'est Équipe (Pro + 50 €/mois).", "Pro is Biltia for you: apps, quotes, documents, personal agents. Team adds everything that brings other people in: employees, clients, subcontractors, roles and portals. If Biltia works just for you, it's Pro; if it puts other people to work, it's Team (Pro + €50/month).") },
    { q: tr("Et si je dépasse mes crédits ?", "What if I run out of credits?"), a: tr("Deux options : rechargez à la carte quand vous voulez (+1 000 crédits pour 29 €, +3 000 pour 99 €, +10 000 pour 499 €), ou passez au palier supérieur. En attendant, vos agents se mettent en pause et rien n'est facturé sans votre accord.", "Two options: top up on demand whenever you want (+1,000 credits for €29, +3,000 for €99, +10,000 for €499), or move up a tier. In the meantime, your agents pause and nothing is charged without your consent.") },
    { q: tr("Puis-je revenir de Équipe à Pro ?", "Can I switch from Team back to Pro?"), a: tr("Oui, à tout moment. Vos apps, données, historique et paramètres restent intacts. Seuls les accès équipe se suspendent : comptes collaborateurs, portails client et sous-traitant, rôles avancés, agents collaboratifs. Tout se réactive si vous repassez sur Équipe.", "Yes, anytime. Your apps, data, history and settings stay intact. Only team access is suspended: collaborator accounts, client and subcontractor portals, advanced roles, collaborative agents. Everything reactivates if you go back to Team.") },
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

// ── Sélecteur de capacité (paliers du forfait, ouverts) ───────────────────────
function TierSelect({ tiers, value, onChange }: { tiers: CreditTier[]; value: number; onChange: (n: number) => void }) {
  const tr = useT();
  const locale = useLocale();
  return (
    <div className="mt-4 mb-5">
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[#8B8B96]">{tr("Capacité IA / mois", "AI capacity / month")}</label>
      <div
        className="grid gap-1.5 rounded-2xl border border-[#E6E1F0] bg-[#F6F4FB] p-1.5"
        style={{ gridTemplateColumns: `repeat(${tiers.length}, minmax(0,1fr))` }}
      >
        {tiers.map((t) => {
          const active = t.credits === value;
          return (
            <button
              key={t.credits}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(t.credits)}
              className={`flex items-center justify-center rounded-xl py-3.5 transition-all ${active ? "bg-white shadow-[0_6px_18px_rgba(124,58,190,0.16)] ring-1 ring-[#7C3AED]/25" : "text-[#5B5B66] hover:bg-white/60"}`}
            >
              <span className={`text-[15px] font-bold tabular-nums ${active ? "text-[#0A0A0A]" : "text-[#3A3A46]"}`}>{numFmt(locale, t.credits)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Carte d'un forfait payant (Pro ou Équipe) ─────────────────────────────────
// Petit lien repliable « 🎁 Crédits offerts » (natif <details>, aucun JS d'état) :
// une flèche discrète, sans encadré ni couleur ; au clic → « 300 crédits offerts ».
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
      {/* Pro ET Équipe sont self-serve (Stripe câblé : STRIPE_PRICE_PRO_* et
          STRIPE_PRICE_EQUIPE_*). Le signup/onboarding fait voyager le plan choisi
          jusqu'au checkout. L'offre Entreprise (sur devis) est une carte à part. */}
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
// Coûts unitaires au bas des fourchettes : question 3 · devis 30 · app 250 ·
// agent quotidien 300/mois. Volumes = vrais paliers Pro (prix depuis lib/plans).
const MONTH_MIX: { vol: number; agents: number; apps: number; docs: number; questions: number }[] = [
  { vol: 2000, agents: 1, apps: 2, docs: 30, questions: 100 },  // 300+500+900+300
  { vol: 3000, agents: 2, apps: 3, docs: 30, questions: 250 },  // 600+750+900+750
  { vol: 5000, agents: 3, apps: 5, docs: 45, questions: 500 },  // 900+1250+1350+1500
];

function MonthTicket() {
  const tr = useT();
  const locale = useLocale();
  const [vol, setVol] = useState(2000);
  const mix = MONTH_MIX.find((m) => m.vol === vol) ?? MONTH_MIX[0];
  const tier = getTier("pro", vol);
  const bigPlan = vol >= 10000;
  const lines = [
    { n: mix.agents, label: mix.agents > 1 ? tr("agents autonomes actifs chaque jour", "autonomous agents running every day") : tr("agent autonome actif chaque jour", "autonomous agent running every day"), c: mix.agents * 300 },
    { n: mix.apps, label: bigPlan ? tr("applications ou modifications importantes", "apps or major changes") : mix.apps > 1 ? tr("applications sur mesure", "custom apps") : tr("application sur mesure", "custom app"), c: mix.apps * 250 },
    { n: mix.docs, label: tr("devis & documents", "quotes & documents"), c: mix.docs * 30 },
    { n: mix.questions, label: tr("questions IA", "AI questions"), c: mix.questions * 3 },
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
  const equipe = localizeEquipe(locale);
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

        <div className="max-w-6xl mx-auto grid gap-5 md:grid-cols-2 lg:grid-cols-4 items-stretch">
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

          {/* Pro (mis en avant) */}
          <PaidCard
            name={pro.name}
            includedLine={tr("Tout Biltia, pour travailler seul", "All of Biltia, to work solo")}
            features={[
              tr("Tous les templates BTP inclus", "All construction templates included"),
              tr("Apps, devis, documents et agents IA selon crédits", "Apps, quotes, documents and AI agents per credits"),
              tr("Email et SMS automatiques", "Automatic email and SMS"),
              tr("Crédits renouvelés chaque mois", "Credits renewed every month"),
            ]}
            tiers={pro.tiers}
            checkoutPlan="pro"
            cycle={cycle}
            badge={tr("Recommandé", "Recommended")}
            recommended
          />

          {/* Équipe */}
          <PaidCard
            name={equipe.name}
            includedLine={tr("Toutes les fonctionnalités Pro", "All Pro features")}
            features={[
              tr("Utilisateurs illimités", "Unlimited users"),
              tr("Comptes employés : chacun voit ses chantiers", "Employee accounts: each sees their own job sites"),
              tr("Portail client et sous-traitant, partage sécurisé", "Client and subcontractor portal, secure sharing"),
              tr("Agents qui assignent, relancent et rendent compte", "Agents that assign, follow up and report back"),
              tr("Support prioritaire", "Priority support"),
            ]}
            tiers={[...EQUIPE.tiers]}
            checkoutPlan="equipe"
            cycle={cycle}
            badge={tr("Pour les équipes", "For teams")}
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

        <Reveal delay={0.16}><p className="text-center text-[12px] text-[#9A9AA6] mt-6">{tr("Équipe = Pro + 50 €/mois. Rechargez vos crédits à tout moment dans l'application. Sans engagement sur le mensuel.", "Team = Pro + €50/month. Top up your credits anytime in the app. No commitment on monthly billing.")}</p></Reveal>
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
                  {[
                    { Icon: MessageCircle, grad: "from-indigo-500 to-violet-500", label: tr("Une question", "A question"), c: tr("1 à 10", "1 to 10") },
                    { Icon: Camera, grad: "from-sky-500 to-cyan-500", label: tr("Analyser une photo, un document", "Analyze a photo, a document"), c: tr("5 à 15", "5 to 15") },
                    { Icon: FileText, grad: "from-violet-500 to-fuchsia-500", label: tr("Un devis, un document", "A quote, a document"), c: tr("30 à 60", "30 to 60") },
                    { Icon: LayoutGrid, grad: "from-fuchsia-500 to-pink-500", label: tr("Une application", "An app"), c: tr("150 à 300", "150 to 300") },
                    { Icon: Bot, grad: "from-cyan-500 to-indigo-500", label: tr("Un passage d'agent", "An agent run"), c: tr("10 à 50", "10 to 50") },
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
                tr("Estimation affichée avant les grosses créations", "Estimate shown before big builds"),
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
