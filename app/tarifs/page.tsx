"use client";

import { useState } from "react";
import { Check, ChevronDown, ArrowRight, CalendarDays, MessageCircle, Camera, FileText, LayoutGrid, Bot, Gift } from "lucide-react";
import {
  getPlan, getTier, formatEur, ENTERPRISE, EQUIPE, SIGNUP_FREE_CREDITS,
  tierDisplayMonthlyEur, annualTotalEur,
  type CreditTier, type BillingCycle,
} from "@/lib/plans";
import { Reveal, Spot, InteractiveMesh, SiteNav, SiteFooter } from "@/components/site";
import { ReserveDemoButton } from "@/components/demo-booking";

const FAQ: { q: string; a: string }[] = [
  { q: "Comment je commence ?", a: "Vous créez un compte et vous utilisez Biltia gratuitement, tout de suite, avec 300 crédits offerts. Quand ils sont épuisés, vous choisissez votre forfait." },
  { q: "Qu'est-ce qu'un crédit ?", a: "Un crédit reflète le travail réel de l'IA. Une question coûte quelques crédits ; créer une application en coûte plus. Manipuler vos apps à la main est toujours gratuit." },
  { q: "Pro ou Équipe ?", a: "Pro, c'est Biltia pour vous : apps, devis, documents, agents personnels. Équipe ajoute tout ce qui fait entrer d'autres personnes : salariés, clients, sous-traitants, rôles et portails. Si Biltia travaille juste pour vous, c'est Pro ; s'il fait travailler d'autres personnes, c'est Équipe (Pro + 50 €/mois)." },
  { q: "Et si je dépasse mes crédits ?", a: "Deux options : rechargez à la carte quand vous voulez (+1 000 crédits pour 29 €, +3 000 pour 99 €, +10 000 pour 499 €), ou passez au palier supérieur. En attendant, vos agents se mettent en pause et rien n'est facturé sans votre accord." },
  { q: "Puis-je revenir de Équipe à Pro ?", a: "Oui, à tout moment. Vos apps, données, historique et paramètres restent intacts. Seuls les accès équipe se suspendent : comptes collaborateurs, portails client et sous-traitant, rôles avancés, agents collaboratifs. Tout se réactive si vous repassez sur Équipe." },
  { q: "Mes données sont-elles en sécurité ?", a: "Oui. Hébergées en France, isolées par entreprise, jamais utilisées pour entraîner des modèles d'IA." },
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

// ── Sélecteur de capacité (paliers du forfait, ouverts) ───────────────────────
function TierSelect({ tiers, value, onChange }: { tiers: CreditTier[]; value: number; onChange: (n: number) => void }) {
  return (
    <div className="mt-4 mb-5">
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[#8B8B96]">Capacité IA / mois</label>
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
              <span className={`text-[15px] font-bold tabular-nums ${active ? "text-[#0A0A0A]" : "text-[#3A3A46]"}`}>{t.credits.toLocaleString("fr-FR")}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Carte d'un forfait payant (Pro ou Équipe) ─────────────────────────────────
// Bandeau « Crédits offerts » repliable (natif <details>, aucun JS d'état). Montre
// le bonus de 300 crédits accordé À LA CRÉATION DU COMPTE, EN PLUS du forfait
// (mode "welcome" du webhook : solde = crédits du palier + 300). Sur chaque plan
// SAUF Entreprise (sur devis). monthlyCredits = crédits mensuels du palier (0 = Free).
function GiftCredits({ monthlyCredits }: { monthlyCredits: number }) {
  const total = monthlyCredits + SIGNUP_FREE_CREDITS;
  return (
    <details className="group mb-4 rounded-xl border border-[#EDE9FB] bg-[#F8F6FF] px-3.5 py-2.5">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-[13px] font-semibold text-[#5B3FBF] [&::-webkit-details-marker]:hidden">
        <Gift className="h-4 w-4 flex-shrink-0" strokeWidth={2.2} />
        <span className="flex-1">Crédits offerts</span>
        <ChevronDown className="h-4 w-4 text-[#9A8FD0] transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <div className="mt-2.5 pl-6 text-[12.5px] leading-relaxed">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[17px] font-black tabular-nums text-[#5B3FBF]">+{SIGNUP_FREE_CREDITS.toLocaleString("fr-FR")}</span>
          <span className="font-semibold text-[#4A4A56]">crédits offerts à la création du compte</span>
        </div>
        <p className="mt-1 text-[#9A9AA6]">
          {monthlyCredits > 0
            ? `Soit ${total.toLocaleString("fr-FR")} crédits pour démarrer, en plus de vos crédits renouvelés chaque mois.`
            : "De quoi créer votre première application et un vrai devis, sans carte bancaire."}
        </p>
      </div>
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
      <div className="flex items-baseline gap-1 mb-1">
        <span className="text-[13px] text-[#9A9AA6]">dès</span>
        <span className="text-5xl font-black tabular-nums tracking-[-0.03em] text-[#0A0A0A]">{monthly}</span>
        <span className="text-[13px] text-[#9A9AA6]">/mois</span>
      </div>
      <p className="text-[12px] text-[#9A9AA6] min-h-[18px]">
        {cycle === "annual"
          ? <>Soit {formatEur(annualTotalEur(tier.priceEur))} par an.</>
          : <>{tier.credits.toLocaleString("fr-FR")} crédits chaque mois.</>}
      </p>
      <TierSelect tiers={tiers} value={credits} onChange={setCredits} />
      <div className="mb-5 flex items-center gap-2 text-[13px] font-semibold text-[#0A0A0A]">
        <Check className="h-3.5 w-3.5 flex-shrink-0 text-[#7C3AED]" strokeWidth={3} /> {includedLine}
      </div>
      <ul className="space-y-2.5 mb-8">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-[13px]"><Check className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-[#7C3AED]" strokeWidth={2.5} /><span className="text-[#4A4A56]">{f}</span></li>
        ))}
      </ul>
      <GiftCredits monthlyCredits={credits} />
      {/* Pro ET Équipe sont self-serve (Stripe câblé : STRIPE_PRICE_PRO_* et
          STRIPE_PRICE_EQUIPE_*). Le signup/onboarding fait voyager le plan choisi
          jusqu'au checkout. L'offre Entreprise (sur devis) est une carte à part. */}
      <a
        href={`/signup?plan=${checkoutPlan}&credits=${credits}&cycle=${cycle}`}
        className={`mt-auto flex items-center justify-center gap-2 py-3 rounded-full text-[14px] font-semibold transition-all ${recommended
          ? "bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 text-white shadow-[0_8px_24px_rgba(139,92,246,0.4)] hover:shadow-[0_10px_30px_rgba(139,92,246,0.55)]"
          : "border border-[#E7E2D7] text-[#0A0A0A] hover:bg-[#F6F6F9]"}`}
      >
        Choisir {name} <ArrowRight className="w-3.5 h-3.5" />
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
  const [vol, setVol] = useState(2000);
  const mix = MONTH_MIX.find((m) => m.vol === vol) ?? MONTH_MIX[0];
  const tier = getTier("pro", vol);
  const bigPlan = vol >= 10000;
  const lines = [
    { n: mix.agents, label: mix.agents > 1 ? "agents autonomes actifs chaque jour" : "agent autonome actif chaque jour", c: mix.agents * 300 },
    { n: mix.apps, label: bigPlan ? "applications ou modifications importantes" : mix.apps > 1 ? "applications sur mesure" : "application sur mesure", c: mix.apps * 250 },
    { n: mix.docs, label: "devis & documents", c: mix.docs * 30 },
    { n: mix.questions, label: "questions IA", c: mix.questions * 3 },
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
          {tier ? <>Soit le forfait Pro à {formatEur(tier.priceEur)}/mois. </> : null}Vous utilisez vos crédits comme vous voulez.
        </p>
      </div>
    </div>
  );
}


export default function TarifsPage() {
  const pro = getPlan("pro");
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
            Tarifs
          </span>
          <h1 className="text-[48px] sm:text-[72px] font-black tracking-[-0.045em] leading-[0.92] text-[#0A0A0A]">Un prix <span className="text-gradient">clair.</span></h1>
          <p className="text-[17px] sm:text-[19px] text-[#5B5B66] max-w-[520px] mx-auto leading-[1.55] mt-6">Tout est inclus. Vous choisissez votre capacité IA, et la collaboration si vous êtes plusieurs. Gratuit pour commencer.</p>
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

        <div className="max-w-6xl mx-auto grid gap-5 md:grid-cols-2 lg:grid-cols-4 items-stretch">
          {/* Découverte (Free) */}
          <Reveal className="relative">
            <div className="relative flex h-full flex-col rounded-[26px] p-7 border border-[#ECECF2] bg-white shadow-[0_4px_16px_rgba(60,40,120,0.06)]">
              <div className="flex items-center justify-between gap-2 mb-4">
                <p className="font-bold text-lg tracking-[-0.01em] text-[#0A0A0A]">Découverte</p>
                <span className="flex-shrink-0 px-2.5 py-1 rounded-full text-[10.5px] font-bold uppercase tracking-wide text-[#6D4AE0] bg-[#F1ECFB]">Gratuit</span>
              </div>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-5xl font-black tabular-nums tracking-[-0.03em] text-[#0A0A0A]">0 €</span>
                <span className="text-[13px] text-[#9A9AA6]">/mois</span>
              </div>
              <p className="text-[12px] text-[#9A9AA6] min-h-[18px]">300 crédits offerts, sans carte bancaire.</p>
              <div className="mb-5 mt-[26px] flex items-center gap-2 text-[13px] font-semibold text-[#0A0A0A]">
                <Check className="h-3.5 w-3.5 flex-shrink-0 text-[#7C3AED]" strokeWidth={3} /> Tout pour tester Biltia
              </div>
              <ul className="space-y-2.5 mb-8">
                {[
                  "Créez une première application",
                  "Générez un vrai devis",
                  "Vos apps et données restent accessibles",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[13px]"><Check className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-[#7C3AED]" strokeWidth={2.5} /><span className="text-[#4A4A56]">{f}</span></li>
                ))}
              </ul>
              <GiftCredits monthlyCredits={0} />
              <a href="/signup" className="mt-auto flex items-center justify-center gap-2 py-3 rounded-full text-[14px] font-semibold transition-all border border-[#E7E2D7] text-[#0A0A0A] hover:bg-[#F6F6F9]">
                Commencer <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>
          </Reveal>

          {/* Pro (mis en avant) */}
          <PaidCard
            name={pro.name}
            includedLine="Tout Biltia, pour travailler seul"
            features={[
              "Tous les templates BTP inclus",
              "Apps, devis, documents et agents IA selon crédits",
              "Email et SMS automatiques",
              "Crédits renouvelés chaque mois",
            ]}
            tiers={pro.tiers}
            checkoutPlan="pro"
            cycle={cycle}
            badge="Recommandé"
            recommended
          />

          {/* Équipe */}
          <PaidCard
            name={EQUIPE.name}
            includedLine="Tout Pro + la collaboration"
            features={[
              "Tout Pro, avec plusieurs utilisateurs",
              "Salariés, clients et sous-traitants",
              "Rôles, portail et partage sécurisé",
            ]}
            tiers={[...EQUIPE.tiers]}
            checkoutPlan="equipe"
            cycle={cycle}
            badge="Pour les équipes"
          />

          {/* Entreprise */}
          <Reveal delay={0.08} className="relative">
            <div className="relative flex h-full flex-col overflow-hidden rounded-[26px] p-7 text-white" style={{ background: "linear-gradient(150deg, #1E1B3A 0%, #3B2B6E 52%, #5B2B7E 100%)" }}>
              <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full blur-[90px]" style={{ background: "radial-gradient(circle, rgba(236,72,153,0.4), transparent 70%)" }} />
              <div className="pointer-events-none absolute -left-12 bottom-[-20%] h-56 w-56 rounded-full blur-[90px]" style={{ background: "radial-gradient(circle, rgba(99,102,241,0.45), transparent 70%)" }} />
              <div className="relative flex h-full flex-col">
                <div className="flex items-center justify-between gap-2 mb-4">
                  <p className="font-bold text-lg tracking-[-0.01em]">{ENTERPRISE.name}</p>
                  <span className="flex-shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide backdrop-blur-sm">{ENTERPRISE.tagline}</span>
                </div>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-5xl font-black tracking-[-0.03em]">Sur devis</span>
                </div>
                <p className="text-[12px] text-white/50 min-h-[18px] mb-[26px]">Volume de crédits sur mesure.</p>
                <ul className="space-y-2.5 mb-8">
                  {[
                    "URL personnalisée",
                    "SSO et gestion des comptes",
                    "DPA, hébergement et SLA dédiés",
                    "Support et onboarding dédiés",
                  ].map((f) => (
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

        <Reveal delay={0.16}><p className="text-center text-[12px] text-[#9A9AA6] mt-6">Équipe = Pro + 50 €/mois. Rechargez vos crédits à tout moment dans l&apos;application. Sans engagement sur le mensuel.</p></Reveal>
      </section>

      {/* Comment fonctionnent les crédits */}
      <section className="relative px-5 sm:px-8 py-24 sm:py-28 border-t border-[#EDEDEB] overflow-hidden">
        <div className="max-w-6xl mx-auto">
          <Reveal className="max-w-2xl mb-12">
            <h2 className="text-[34px] sm:text-[44px] font-black text-[#0A0A0A] tracking-[-0.03em]">Comment marchent les <span className="text-gradient">crédits.</span></h2>
            <p className="text-[16px] text-[#5B5B66] leading-[1.6] mt-4">Parler à Biltia coûte presque rien. Construire ou modifier un système coûte plus. C&apos;est tout.</p>
          </Reveal>

          <div className="grid gap-5 lg:grid-cols-2 items-stretch max-w-5xl">
            {/* Le tarif de chaque tâche */}
            <Reveal>
              <div className="glass rounded-[26px] p-6 sm:p-7 h-full">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7C3AED] mb-4">Ce que ça coûte</p>
                <div className="divide-y divide-black/[0.05]">
                  {[
                    { Icon: MessageCircle, grad: "from-indigo-500 to-violet-500", label: "Une question", c: "1 à 10" },
                    { Icon: Camera, grad: "from-sky-500 to-cyan-500", label: "Analyser une photo, un document", c: "5 à 15" },
                    { Icon: FileText, grad: "from-violet-500 to-fuchsia-500", label: "Un devis, un document", c: "30 à 60" },
                    { Icon: LayoutGrid, grad: "from-fuchsia-500 to-pink-500", label: "Une application", c: "150 à 300" },
                    { Icon: Bot, grad: "from-cyan-500 to-indigo-500", label: "Un passage d'agent", c: "10 à 50" },
                  ].map((r) => (
                    <div key={r.label} className="flex items-center gap-3.5 py-4 first:pt-0 last:pb-0">
                      <span className={`grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br ${r.grad} text-white shadow-[0_6px_16px_rgba(139,92,246,0.28)]`}>
                        <r.Icon className="h-[18px] w-[18px]" />
                      </span>
                      <p className="min-w-0 flex-1 text-[14.5px] font-bold text-[#0A0A0A] leading-tight">{r.label}</p>
                      <span className="flex-shrink-0 rounded-full bg-[#F1ECFB] px-3 py-1.5 text-[13px] font-bold tabular-nums text-[#6D4AE0]">{r.c} cr</span>
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
                "Estimation affichée avant les grosses créations",
                "Crédits épuisés : les agents se mettent en pause",
                "Saisie manuelle et exports : toujours gratuits",
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
