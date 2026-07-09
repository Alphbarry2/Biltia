"use client";

import { useState } from "react";
import { Check, ChevronDown, ArrowRight, CalendarDays, MessageCircle, Camera, FileText, LayoutGrid, Bot } from "lucide-react";
import {
  getPlan, getTier, formatEur, groupTiers, ENTERPRISE,
  tierDisplayMonthlyEur, annualTotalEur,
  type CreditTier, type BillingCycle,
} from "@/lib/plans";
import { Reveal, Spot, InteractiveMesh, SiteNav, SiteFooter } from "@/components/site";
import { ReserveDemoButton } from "@/components/demo-booking";

const FAQ: { q: string; a: string }[] = [
  { q: "Comment je commence ?", a: "Vous créez un compte et vous utilisez Biltia gratuitement, tout de suite. Vous avez 300 crédits offerts pour découvrir l'outil et créer votre première application. Quand ils sont épuisés, vous choisissez votre forfait selon la capacité IA dont vous avez besoin." },
  { q: "Qu'est-ce qu'un crédit ?", a: "Un crédit reflète le travail réel de l'IA sur votre demande, pas un jeton technique. Une question simple coûte un à quelques crédits ; créer une application complète ou faire travailler un agent tous les jours en coûte davantage. Pour les grosses créations et au recrutement d'un agent, l'estimation s'affiche avant de lancer." },
  { q: "Les fonctionnalités changent-elles selon le prix ?", a: "Non, jamais. Tous les forfaits donnent accès à tout l'outil, sans fonctionnalité bridée : applications, agents, connecteurs, équipe. Ce qui varie, ce n'est pas ce que vous pouvez faire, c'est votre capacité IA mensuelle : vous créez autant d'apps et d'agents que vos crédits le permettent. Seules les briques grand compte (marque blanche, URL personnalisée, multi-métiers, SSO, DPA) passent par l'offre Entreprise, sur devis." },
  { q: "Combien coûte un agent ?", a: "Recruter un agent est gratuit : vous dictez la mission, c'est tout. Ensuite, chaque passage est débité selon la complexité : environ 10 crédits pour un message ou un rappel, 25 pour un contrôle de vos données, 50 pour une analyse complète. Un agent quotidien simple utilise donc environ 300 crédits par mois, inclus dans votre forfait. Le coût réel de chaque passage est visible dans son journal, et si vos crédits s'épuisent l'agent se met en pause : jamais de facture surprise." },
  { q: "Mensuel ou annuel ?", a: "Comme vous voulez. L'engagement annuel vous fait économiser 2 mois (environ 17 %) sur le même volume de crédits. Vous pouvez basculer depuis vos paramètres à tout moment." },
  { q: "Que se passe-t-il si je dépasse mes crédits ?", a: "Vous passez au palier supérieur, ou vous attendez le renouvellement du mois. Vos agents se mettent en pause en attendant, et rien n'est facturé sans votre accord. Vous payez d'avance, vous ne devez jamais rien." },
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

// ── Sélecteur de capacité (3 paliers d'un profil, ouverts) ────────────────────
// Les 3 options d'un profil sont visibles d'un coup (pas de menu qui se referme) :
// sur une page tarifs on veut voir l'échelle de capacité tout de suite.
function TierSelect({ tiers, value, basePerCredit, onChange }: { tiers: CreditTier[]; value: number; basePerCredit: number; onChange: (n: number) => void }) {
  // Économie calculée par rapport au tarif d'ENTRÉE de toute la gamme (le palier
  // le moins cher au crédit = 1 000 à 49 €), pas au premier palier du groupe :
  // sinon Business afficherait un misérable -3 % au lieu de -19 % réel.
  const base = basePerCredit;
  return (
    <div className="mt-4 mb-5">
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[#8B8B96]">Capacité IA / mois</label>
      <div className="grid grid-cols-3 gap-1.5 rounded-2xl border border-[#E6E1F0] bg-[#F6F4FB] p-1.5">
        {tiers.map((t) => {
          const active = t.credits === value;
          const perCredit = t.priceEur / t.credits;
          const save = base > 0 ? Math.round((1 - perCredit / base) * 100) : 0;
          return (
            <button
              key={t.credits}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(t.credits)}
              className={`flex flex-col items-center gap-0.5 rounded-xl py-2.5 transition-all ${active ? "bg-white shadow-[0_6px_18px_rgba(124,58,190,0.16)] ring-1 ring-[#7C3AED]/25" : "text-[#5B5B66] hover:bg-white/60"}`}
            >
              <span className={`text-[15px] font-bold tabular-nums ${active ? "text-[#0A0A0A]" : "text-[#3A3A46]"}`}>{t.credits.toLocaleString("fr-FR")}</span>
              <span className={`text-[10px] font-semibold tabular-nums ${save > 0 ? "text-[#17915E]" : active ? "text-[#7C3AED]" : "text-[#9A9AA6]"}`}>
                {save > 0 ? `-${save} %` : "crédits"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Carte d'un profil payant (Solo/TPE ou Business), sélecteur intégré ─────────
function ProCard({ group, cycle, basePerCredit, badge, recommended }: { group: { label: string; tiers: CreditTier[] }; cycle: BillingCycle; basePerCredit: number; badge: string; recommended?: boolean }) {
  const [credits, setCredits] = useState<number>(group.tiers[0].credits);
  const tier = group.tiers.find((t) => t.credits === credits) ?? group.tiers[0];
  const monthly = formatEur(tierDisplayMonthlyEur(tier, cycle));
  const isBusiness = group.label === "Business";
  const audience = isBusiness ? "PME, équipe" : "Artisan solo, TPE";
  const tagline = isBusiness
    ? "Pour les entreprises qui font tourner plusieurs process avec Biltia."
    : "Pour créer vos premiers outils, générer vos devis et tester vos premiers agents.";
  const features = isBusiness
    ? [
        "Tout Solo / TPE, en plus grande capacité",
        "Plusieurs apps, agents et documents en parallèle",
        "Usage en équipe, workspace partagé",
        "Support prioritaire",
      ]
    : [
        "Apps, devis, questions et agents selon vos crédits IA",
        "Workspace partagé, équipe incluse",
        "Crédits renouvelés chaque mois",
        "Sans engagement",
      ];

  const inner = (
    <>
      <div className="flex items-center justify-between gap-2 mb-1">
        <p className="font-bold text-lg tracking-[-0.01em] text-[#0A0A0A]">{group.label}</p>
        <span
          className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[10.5px] font-bold uppercase tracking-wide ${recommended
            ? "text-white bg-gradient-to-r from-indigo-500 to-pink-500 shadow-[0_4px_14px_rgba(139,92,246,0.35)]"
            : "text-[#6D4AE0] bg-[#F1ECFB]"}`}
        >
          {badge}
        </span>
      </div>
      <p className="inline-flex w-fit items-center rounded-full bg-[#F4F1FB] px-2.5 py-1 text-[12px] font-semibold text-[#6D4AE0] mb-4">{audience}</p>
      <p className="text-[13px] text-[#8B8B96] mb-2 leading-snug">{tagline}</p>
      <div className="flex items-baseline gap-1 mb-1">
        <span className="text-5xl font-black tabular-nums tracking-[-0.03em] text-[#0A0A0A]">{monthly}</span>
        <span className="text-[13px] text-[#9A9AA6]">/mois</span>
      </div>
      <p className="text-[12px] text-[#9A9AA6] min-h-[18px]">
        {cycle === "annual"
          ? <>Soit {formatEur(annualTotalEur(tier.priceEur))} par an, 2 mois offerts.</>
          : <>{tier.credits.toLocaleString("fr-FR")} crédits chaque mois.</>}
      </p>
      <TierSelect tiers={group.tiers} value={credits} basePerCredit={basePerCredit} onChange={setCredits} />
      <div className="mb-6 flex items-center gap-2 text-[13px] font-semibold text-[#0A0A0A]">
        <Check className="h-3.5 w-3.5 flex-shrink-0 text-[#7C3AED]" strokeWidth={3} /> Toutes les fonctionnalités incluses
      </div>
      <ul className="space-y-3 mb-8">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-[13px]"><Check className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-[#7C3AED]" strokeWidth={2.5} /><span className="text-[#4A4A56]">{f}</span></li>
        ))}
      </ul>
      <a
        href={`/signup?plan=pro&credits=${credits}&cycle=${cycle}`}
        className={`mt-auto flex items-center justify-center gap-2 py-3 rounded-full text-[14px] font-semibold transition-all ${recommended
          ? "bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 text-white shadow-[0_8px_24px_rgba(139,92,246,0.4)] hover:shadow-[0_10px_30px_rgba(139,92,246,0.55)]"
          : "border border-[#E7E2D7] text-[#0A0A0A] hover:bg-[#F6F6F9]"}`}
      >
        Choisir ce forfait <ArrowRight className="w-3.5 h-3.5" />
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
// PANIER CUMULATIF (les lignes s'ADDITIONNENT, la somme fait PILE le volume).
// Coûts unitaires pris au BAS des fourchettes (le but est de vendre, pas de faire
// peur) : question rapide 3 · devis/doc standard 30 · app 250 · agent quotidien
// 300/mois. Chaque exemple montre donc des compteurs généreux ET honnêtes.
// Volumes = vrais paliers (le prix affiché vient de lib/plans).
const MONTH_MIX: { vol: number; agents: number; apps: number; docs: number; questions: number }[] = [
  { vol: 1000, agents: 1, apps: 1, docs: 10, questions: 50 },        // 300+250+300+150
  { vol: 3000, agents: 2, apps: 3, docs: 30, questions: 250 },       // 600+750+900+750
  { vol: 10000, agents: 6, apps: 10, docs: 130, questions: 600 },    // 1800+2500+3900+1800
  { vol: 25000, agents: 12, apps: 25, docs: 300, questions: 2050 },  // 3600+6250+9000+6150
];

function MonthTicket() {
  const [vol, setVol] = useState(1000);
  const mix = MONTH_MIX.find((m) => m.vol === vol) ?? MONTH_MIX[0];
  const tier = getTier("pro", vol);
  // Au-delà de 10 000 crédits, l'usage réel est surtout création + ajustements :
  // personne ne crée 25 apps neuves par mois, on en crée et on en modifie.
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
          {tier ? <>Soit le forfait à {formatEur(tier.priceEur)}/mois. </> : null}Exemple de répartition : vous utilisez vos crédits comme vous voulez, selon vos besoins.
        </p>
      </div>
    </div>
  );
}


export default function TarifsPage() {
  const free = getPlan("free");
  const pro = getPlan("pro");
  const groups = groupTiers(pro.tiers); // [Solo / TPE, Business]
  // Tarif d'entrée au crédit (1 000 à 49 € = 0,049 €/cr) : référence des badges d'économie.
  const basePerCredit = pro.tiers[0].priceEur / pro.tiers[0].credits;
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
          <p className="text-[17px] sm:text-[19px] text-[#5B5B66] max-w-[580px] mx-auto leading-[1.55] mt-6">Toutes les fonctionnalités sont incluses. Vous choisissez seulement la capacité IA dont votre entreprise a besoin. Commencez gratuitement, sans carte bancaire.</p>
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
          {/* Free */}
          <Reveal className="relative">
            <div className="relative flex h-full flex-col rounded-[26px] p-7 border border-[#ECECF2] bg-white shadow-[0_4px_16px_rgba(60,40,120,0.06)]">
              <p className="font-bold text-lg tracking-[-0.01em] text-[#0A0A0A] mb-1">{free.name}</p>
              <p className="inline-flex w-fit items-center rounded-full bg-[#F4F1FB] px-2.5 py-1 text-[12px] font-semibold text-[#6D4AE0] mb-4">Pour tester</p>
              <p className="text-[13px] text-[#8B8B96] mb-2 leading-snug">Le tour du propriétaire, sans engagement.</p>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-5xl font-black tabular-nums tracking-[-0.03em] text-[#0A0A0A]">0 €</span>
                <span className="text-[13px] text-[#9A9AA6]">/mois</span>
              </div>
              <p className="text-[12px] text-[#9A9AA6] min-h-[18px]">300 crédits offerts, sans carte bancaire.</p>
              <div className="mb-6 mt-[26px] flex items-center gap-2 text-[13px] font-semibold text-[#0A0A0A]">
                <Check className="h-3.5 w-3.5 flex-shrink-0 text-[#7C3AED]" strokeWidth={3} /> Toutes les fonctionnalités incluses
              </div>
              <ul className="space-y-3 mb-8">
                {[
                  "Créez votre première application",
                  "Générez un vrai devis ou document",
                  "Testez un agent, posez vos questions",
                  "300 crédits non renouvelables",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[13px]"><Check className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-[#7C3AED]" strokeWidth={2.5} /><span className="text-[#4A4A56]">{f}</span></li>
                ))}
              </ul>
              <a href="/signup" className="mt-auto flex items-center justify-center gap-2 py-3 rounded-full text-[14px] font-semibold transition-all border border-[#E7E2D7] text-[#0A0A0A] hover:bg-[#F6F6F9]">
                Commencer gratuitement <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>
          </Reveal>

          {/* Solo / TPE (mis en avant) + Business */}
          <ProCard group={groups[0]} cycle={cycle} basePerCredit={basePerCredit} badge="Idéal pour démarrer" recommended />
          {groups[1] && <ProCard group={groups[1]} cycle={cycle} basePerCredit={basePerCredit} badge="Pour les équipes" />}

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
                <p className="text-[13px] text-white/60 mb-2 leading-snug">Volume et contrat négociés selon vos besoins.</p>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-5xl font-black tracking-[-0.03em]">Sur devis</span>
                </div>
                <p className="text-[12px] text-white/50 min-h-[18px] mb-[26px]">À partir de 50 000 crédits / mois.</p>
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
            <p className="text-[16px] text-[#5B5B66] leading-[1.6] mt-4">Un crédit paie du travail fait. Parler à Biltia coûte presque rien ; construire ou modifier un système coûte plus. C&apos;est tout.</p>
          </Reveal>

          <div className="grid gap-5 lg:grid-cols-2 items-stretch max-w-5xl">
            {/* Le tarif de chaque tâche (menu) */}
            <Reveal>
              <div className="glass rounded-[26px] p-6 sm:p-7 h-full">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7C3AED] mb-4">Ce que ça coûte</p>
                <div className="divide-y divide-black/[0.05]">
                  {[
                    { Icon: MessageCircle, grad: "from-indigo-500 to-violet-500", label: "Une question", sub: "« Quel taux de TVA ? », un client ajouté à la voix", c: "1 à 10" },
                    { Icon: Camera, grad: "from-sky-500 to-cyan-500", label: "Analyser une photo, un document", sub: "extraire et compléter à votre place", c: "5 à 15" },
                    { Icon: FileText, grad: "from-violet-500 to-fuchsia-500", label: "Un devis, un document", sub: "prêt à imprimer et à signer", c: "30 à 60" },
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
