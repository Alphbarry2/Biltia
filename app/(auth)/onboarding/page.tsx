"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Onboarding conversationnel (pas un formulaire) : 3 étapes courtes.
// 1. Entreprise : pays (vrai Dropdown maison) + effectif  →  connaître le client
//    et alimenter la console admin (payé/crédits par TAILLE d'entreprise).
// 2. Métier (aiguille les agents IA).   3. Objectif (la donnée « pourquoi »).
// Alimente profiles.sector + profiles.preferences + tenants.company_info
// { country, sector, headcount }, puis /generate ou /dashboard.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase";
import { getActiveMembership } from "@/lib/tenant";
import { enablePushNotifications } from "@/lib/push-client";
import type { Json } from "@/lib/database.types";
import { CATEGORIES, ACTIVITY_TYPES, catLabel } from "@/lib/btp-catalog";
import type { Locale } from "@/lib/i18n/config";
import { COUNTRIES } from "@/lib/countries";
import { EASE } from "@/components/site-fx";
import { Dropdown } from "@/components/dropdown";
import { ArrowRight, ChevronLeft, Check } from "lucide-react";
import { useT, useLocale } from "@/lib/i18n/context";

// Icônes retouchées pour l'onboarding : plus lisibles et sans doublon
// (le 🧱 est réservé au Gros œuvre ; charpente/toiture → bois).
const METIER_ICON: Record<string, string> = {
  structure_bois_toiture: "🪵",
  isolation_cloisons: "🧊",
};
function buildMetiers(t: (fr: string, en: string) => string, locale: Locale) {
  return [
    ...CATEGORIES.map((c) => ({
      id: c.id,
      label: catLabel(c.label, locale),
      emoji: METIER_ICON[c.id] ?? c.emoji,
      // Exemples concrets tirés des sous-métiers du catalogue → chacun comprend
      // ce que couvre la famille, sans jargon ni deviner.
      examples: c.subTrades
        .slice(0, 3)
        .map((s) => catLabel(s.label, locale).split(" / ")[0])
        .join(" · "),
    })),
    { id: "autre", label: t("Autre / Multi-services", "Other / Multi-services"), emoji: "🧰", examples: t("Vous exercez plusieurs métiers", "You work across several trades") },
  ];
}

function buildGoals(t: (fr: string, en: string) => string) {
  return [
    { id: "devis_factures", label: t("Faire mes devis et factures", "Make my quotes and invoices"), emoji: "🧾" },
    { id: "suivi_chantiers", label: t("Suivre mes chantiers", "Track my job sites"), emoji: "🏗️" },
    { id: "automatiser", label: t("Automatiser l'administratif", "Automate admin work"), emoji: "⚡" },
    { id: "outil_sur_mesure", label: t("Créer un outil sur mesure", "Build a custom tool"), emoji: "🛠️" },
    { id: "questions_metier", label: t("Réponses TVA, normes, règles", "Answers on VAT, standards, rules"), emoji: "📐" },
    { id: "decouverte", label: t("Je découvre, tout simplement", "I'm just exploring"), emoji: "👀" },
  ];
}

// Pays : liste UNIQUE partagée avec les paramètres (lib/countries.ts) — plus
// d'incohérence « 6 pays à l'inscription, FR/BE en paramètres ».

// Effectif : buckets que le patron reconnaît immédiatement + clé d'analyse admin.
function buildHeadcounts(t: (fr: string, en: string) => string) {
  return [
    { id: "solo", label: t("Solo", "Solo") },
    { id: "2-5", label: t("2 à 5", "2 to 5") },
    { id: "6-10", label: t("6 à 10", "6 to 10") },
    { id: "11-20", label: t("11 à 20", "11 to 20") },
    { id: "20+", label: t("20 et +", "20+") },
  ];
}

export default function OnboardingPage() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const METIERS = buildMetiers(t, locale);
  const GOALS = buildGoals(t);
  const HEADCOUNTS = buildHeadcounts(t);
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [companyName, setCompanyName] = useState("");
  const [country, setCountry] = useState<string | null>(null);
  const [headcount, setHeadcount] = useState<string | null>(null);
  const [sectors, setSectors] = useState<string[]>([]);
  const [sectorDetail, setSectorDetail] = useState("");
  const [activityType, setActivityType] = useState<string | null>(null);
  const [goals, setGoals] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.replace("/login");
    });
  }, [router]);

  // On NE saute plus à l'étape suivante : après le métier, on révèle la précision
  // libre + le type de travail (aussi importants que la famille pour l'adaptation).
  // Sélection MULTIPLE : un artisan qui fait plomberie ET électricité coche les deux.
  const pickSector = (id: string) =>
    setSectors((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const toggleGoal = (id: string) =>
    setGoals((g) => (g.includes(id) ? g.filter((x) => x !== id) : [...g, id]));

  const finish = async (skipped = false) => {
    if (saving) return;
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: prof } = await supabase
        .from("profiles").select("preferences").eq("user_id", user.id).maybeSingle();
      const prefs = (prof?.preferences ?? {}) as Record<string, Json>;
      const detail = sectorDetail.trim();
      const primarySector = sectors[0] ?? null;
      const patch: { preferences: Json; sector?: string } = {
        preferences: {
          ...prefs, goals, onboarded: true, onboarding_skipped: skipped,
          country: country ?? "FR", headcount: headcount ?? null,
          // Contexte métier consommé par la génération (buildKnowledgeBlock).
          activity_type: activityType ?? null,
          sector_detail: detail || null,
          // Métiers déclarés (un ou PLUSIEURS) — chacun colore la génération.
          sectors,
        },
      };
      if (primarySector) patch.sector = primarySector;
      await supabase.from("profiles").update(patch).eq("user_id", user.id);
      if (primarySector) await supabase.auth.updateUser({ data: { sector: primarySector } });
      // Profil entreprise du tenant (adapte TVA/SIRET partout + tracking admin).
      // On FUSIONNE avec l'existant pour ne jamais écraser SIRET/adresse déjà saisis.
      try {
        const membership = await getActiveMembership(supabase, user.id);
        if (membership) {
          const { data: t } = await supabase
            .from("tenants").select("company_info").eq("id", membership.tenant_id).maybeSingle();
          const prev = (t?.company_info ?? {}) as Record<string, Json>;
          const company_info: Record<string, Json> = { ...prev };
          const trimmedCompany = companyName.trim();
          if (trimmedCompany) company_info.company_name = trimmedCompany;
          if (country) company_info.country = country;
          if (primarySector) company_info.sector = primarySector;
          company_info.sectors = sectors;
          if (headcount) company_info.headcount = headcount;
          if (activityType) company_info.activity_type = activityType;
          if (detail) company_info.sector_detail = detail;
          // tenants.name = le nom d'entreprise (repris dans l'en-tête des apps,
          // les devis/factures, le sélecteur de workspace). company_info garde
          // la copie « raison sociale ».
          await supabase
            .from("tenants")
            .update(trimmedCompany ? { name: trimmedCompany, company_info } : { company_info })
            .eq("id", membership.tenant_id);
        }
      } catch { /* best-effort */ }
    }
    void enablePushNotifications();

    // Offre Pro choisie depuis la page tarifs (« choisir Pro ») : on lance le
    // paiement Stripe MAINTENANT. Après paiement, retour dans l'app avec les
    // crédits du palier (attribués par le webhook), les 300 crédits d'inscription
    // étant préservés (forfait + bonus). En cas d'échec, on ne bloque pas l'accès.
    try {
      // Plan payant : d'abord la query URL (lien de confirmation → survit à un
      // AUTRE appareil), sinon localStorage (même navigateur). L'URL fait foi.
      let plan = "";
      let credits = 0;
      let cycle = "monthly";
      const sp = new URLSearchParams(window.location.search);
      const urlPlan = sp.get("plan");
      if ((urlPlan === "pro" || urlPlan === "equipe") && Number(sp.get("credits")) > 0) {
        plan = urlPlan;
        credits = Number(sp.get("credits"));
        cycle = sp.get("cycle") === "annual" ? "annual" : "monthly";
      } else {
        const pending = localStorage.getItem("biltia_pending_plan");
        if (pending) {
          const p = JSON.parse(pending) as { plan?: string; credits: number; cycle: string };
          plan = p.plan === "equipe" ? "equipe" : "pro"; // rétro-compat : ancien pending sans plan = pro
          credits = p.credits;
          cycle = p.cycle;
        }
      }
      if (plan && credits > 0) {
        localStorage.removeItem("biltia_pending_plan");
        const res = await fetch("/api/billing/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan, credits, cycle }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.url) {
          window.location.href = data.url as string; // → Stripe Checkout
          return;
        }
        console.error("[onboarding] checkout indisponible", data?.error);
      }
    } catch (e) {
      console.error("[onboarding] plan en attente", e);
    }

    const savedPrompt = sessionStorage.getItem("biltia_prompt");
    router.refresh();
    router.push(savedPrompt ? "/generate" : "/dashboard");
  };

  const chip = (active: boolean) =>
    `flex items-center gap-2.5 rounded-2xl border px-4 py-3 text-left text-[13.5px] font-semibold transition-all duration-200 active:scale-[0.98] ${
      active
        ? "border-[#7C3AED] bg-[#F3EFFC] text-[#0A0A0A] shadow-[0_8px_22px_rgba(124,58,190,0.16)]"
        : "border-[#E7E7E4] bg-white text-[#3A3A46] hover:border-[#C9BEF0] hover:shadow-[0_8px_22px_rgba(124,58,190,0.1)]"
    }`;

  return (
    <div>
      {/* Progression */}
      <div className="mb-8 flex items-center gap-2">
        {[0, 1, 2].map((i) => (
          <span key={i} className={`h-1.5 rounded-full transition-all duration-300 ${step >= i ? "w-8 bg-gradient-to-r from-indigo-500 to-pink-500" : "w-4 bg-[#ECECF2]"}`} />
        ))}
        <span className="ml-2 text-[12px] font-semibold text-[#9A9AA6]">{step + 1}/3</span>
      </div>

      <AnimatePresence mode="wait">
        {step === 0 ? (
          <motion.div key="entreprise"
            initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.3, ease: EASE }}>
            <h1 className="mb-1.5 text-[26px] font-black leading-tight tracking-[-0.03em] text-[#0A0A0A]">
              {t("Bienvenue. Parlez-nous de votre entreprise.", "Welcome. Tell us about your company.")}
            </h1>
            <p className="mb-6 text-sm text-[#6E6E6C]">{t("Deux infos rapides — ça adapte la TVA, les documents et vos outils.", "Two quick details — it tailors VAT, documents and your tools.")}</p>

            <div className="space-y-5">
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[#8B8B96]">{t("Nom de votre entreprise", "Your company name")}</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder={t("Ex. Barry Élec, SARL Dupont…", "e.g. Barry Elec, Dupont Ltd…")}
                  className="w-full rounded-xl border border-[#E7E7E4] bg-white px-4 py-3 text-[14px] text-[#0A0A0A] placeholder:text-[#B9B9B6] outline-none transition-all focus:border-[#7C3AED] focus:shadow-[0_0_0_3px_rgba(124,58,246,0.14)]"
                />
              </div>

              <Dropdown
                label={t("Votre pays", "Your country")}
                value={country}
                onChange={setCountry}
                options={COUNTRIES}
                placeholder={t("Choisir un pays", "Choose a country")}
                ariaLabel={t("Votre pays", "Your country")}
              />

              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[#8B8B96]">{t("Votre effectif", "Your headcount")}</label>
                <div className="grid grid-cols-5 gap-2">
                  {HEADCOUNTS.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => setHeadcount(h.id)}
                      className={`rounded-xl border px-2 py-2.5 text-center text-[13px] font-semibold transition-all duration-200 active:scale-[0.97] ${
                        headcount === h.id
                          ? "border-[#7C3AED] bg-[#F3EFFC] text-[#0A0A0A] shadow-[0_6px_18px_rgba(124,58,190,0.16)]"
                          : "border-[#E7E7E4] bg-white text-[#3A3A46] hover:border-[#C9BEF0]"
                      }`}
                    >
                      {h.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setStep(1)}
              disabled={!companyName.trim() || !country || !headcount}
              className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 py-3 font-semibold text-white shadow-[0_8px_24px_rgba(139,92,246,0.4)] transition-all hover:shadow-[0_10px_30px_rgba(139,92,246,0.55)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("Continuer", "Continue")} <ArrowRight className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => finish(true)} disabled={saving}
              className="mt-3 w-full text-center text-[13px] font-medium text-[#9A9AA6] transition-colors hover:text-[#0A0A0A]">
              {t("Passer pour l'instant", "Skip for now")}
            </button>
          </motion.div>
        ) : step === 1 ? (
          <motion.div key="metier"
            initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.3, ease: EASE }}>
            <button type="button" onClick={() => setStep(0)}
              className="mb-4 flex items-center gap-1 text-[13px] font-medium text-[#9A9AA6] transition-colors hover:text-[#0A0A0A]">
              <ChevronLeft className="h-4 w-4" /> {t("Retour", "Back")}
            </button>
            <h1 className="mb-1.5 text-[26px] font-black leading-tight tracking-[-0.03em] text-[#0A0A0A]">
              {t("Quel est votre métier ?", "What's your trade?")}
            </h1>
            <p className="mb-1 text-sm text-[#6E6E6C]">{t("Biltia adapte ses réponses et ses documents à votre métier.", "Biltia tailors its answers and documents to your trade.")}</p>
            <p className="mb-5 text-[13px] font-medium text-[#7C3AED]">{t("Vous pouvez en sélectionner plusieurs.", "You can select several.")}</p>
            <div className="grid grid-cols-1 gap-2.5">
              {METIERS.map((m) => {
                const active = sectors.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => pickSector(m.id)}
                    className={`flex items-center gap-3.5 rounded-2xl border p-3.5 text-left transition-all duration-200 active:scale-[0.99] ${
                      active
                        ? "border-[#7C3AED] bg-[#F6F3FD] shadow-[0_6px_20px_rgba(124,58,190,0.12)]"
                        : "border-[#EAEAF0] bg-white hover:border-[#C9BEF0] hover:bg-[#FCFBFE]"
                    }`}
                  >
                    {/* Case à cocher — TOUJOURS à gauche (multi-sélection) */}
                    <span
                      className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md border-2 transition-all ${
                        active ? "border-[#7C3AED] bg-[#7C3AED]" : "border-[#D4D4DE] bg-white"
                      }`}
                    >
                      {active && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
                    </span>
                    {/* Icône métier */}
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F5F4F9] text-[19px] leading-none">
                      {m.emoji}
                    </span>
                    {/* Libellé + exemples */}
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14.5px] font-semibold leading-tight text-[#0A0A0A]">{m.label}</span>
                      {m.examples && (
                        <span className="mt-0.5 block text-[12px] font-medium leading-snug text-[#8A8A96]">{m.examples}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            <AnimatePresence initial={false}>
              {sectors.length > 0 && (
                <motion.div
                  key="metier-affine"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.28, ease: EASE }}
                  className="overflow-hidden"
                >
                  <div className="mt-5 space-y-5 border-t border-[#F0EFF4] pt-5">
                    <div>
                      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[#8B8B96]">
                        {t("Précisez votre spécialité", "Specify your specialty")} <span className="font-medium normal-case text-[#B9B9B6]">{t("(optionnel)", "(optional)")}</span>
                      </label>
                      <input
                        type="text"
                        value={sectorDetail}
                        onChange={(e) => setSectorDetail(e.target.value)}
                        placeholder={t("Ex. électricien spécialisé bornes de recharge", "e.g. electrician specialized in EV charging")}
                        className="w-full rounded-xl border border-[#E7E7E4] bg-white px-4 py-3 text-[14px] text-[#0A0A0A] placeholder:text-[#B9B9B6] outline-none transition-all focus:border-[#7C3AED] focus:shadow-[0_0_0_3px_rgba(124,58,246,0.14)]"
                      />
                      <p className="mt-1.5 text-[12px] text-[#9A9AA6]">{t("Biltia parlera précisément votre langage métier.", "Biltia will speak your trade's language precisely.")}</p>
                    </div>

                    <div>
                      <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-[#8B8B96]">
                        {t("Vous travaillez plutôt sur…", "You mostly work on…")} <span className="font-medium normal-case text-[#B9B9B6]">{t("(optionnel)", "(optional)")}</span>
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {ACTIVITY_TYPES.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => setActivityType((cur) => (cur === a.id ? null : a.id))}
                            className={chip(activityType === a.id)}
                          >
                            <span className="min-w-0 truncate">{catLabel(a.label, locale)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={sectors.length === 0}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 py-3 font-semibold text-white shadow-[0_8px_24px_rgba(139,92,246,0.4)] transition-all hover:shadow-[0_10px_30px_rgba(139,92,246,0.55)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("Continuer", "Continue")} <ArrowRight className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => finish(true)} disabled={saving}
              className="mt-3 w-full text-center text-[13px] font-medium text-[#9A9AA6] transition-colors hover:text-[#0A0A0A]">
              {t("Passer pour l'instant", "Skip for now")}
            </button>
          </motion.div>
        ) : (
          <motion.div key="objectifs"
            initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.3, ease: EASE }}>
            <button type="button" onClick={() => setStep(1)}
              className="mb-4 flex items-center gap-1 text-[13px] font-medium text-[#9A9AA6] transition-colors hover:text-[#0A0A0A]">
              <ChevronLeft className="h-4 w-4" /> {t("Retour", "Back")}
            </button>
            <h1 className="mb-1.5 text-[26px] font-black leading-tight tracking-[-0.03em] text-[#0A0A0A]">
              {t("Qu'est-ce que Biltia doit régler en premier ?", "What should Biltia tackle first?")}
            </h1>
            <p className="mb-6 text-sm text-[#6E6E6C]">{t("Plusieurs choix possibles. Ça oriente vos premiers outils.", "Several choices possible. It shapes your first tools.")}</p>
            <div className="grid gap-2.5">
              {GOALS.map((g) => {
                const active = goals.includes(g.id);
                return (
                  <button key={g.id} type="button" onClick={() => toggleGoal(g.id)} className={chip(active)}>
                    <span className="text-[17px] leading-none">{g.emoji}</span>
                    <span className="min-w-0 flex-1 truncate">{g.label}</span>
                    <span className={`grid h-[18px] w-[18px] flex-shrink-0 place-items-center rounded-full border transition-all ${active ? "border-transparent bg-gradient-to-br from-indigo-500 to-pink-500" : "border-[#D6D0E4]"}`}>
                      {active && <Check className="h-2.5 w-2.5 text-white" strokeWidth={4} />}
                    </span>
                  </button>
                );
              })}
            </div>
            <button type="button" onClick={() => finish(false)} disabled={saving || goals.length === 0}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 py-3 font-semibold text-white shadow-[0_8px_24px_rgba(139,92,246,0.4)] transition-all hover:shadow-[0_10px_30px_rgba(139,92,246,0.55)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40">
              {saving ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <>{t("C'est parti", "Let's go")} <ArrowRight className="h-4 w-4" /></>
              )}
            </button>
            <button type="button" onClick={() => finish(true)} disabled={saving}
              className="mt-3 w-full text-center text-[13px] font-medium text-[#9A9AA6] transition-colors hover:text-[#0A0A0A]">
              {t("Passer pour l'instant", "Skip for now")}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
