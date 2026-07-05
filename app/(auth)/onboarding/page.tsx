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
import { CATEGORIES } from "@/lib/btp-catalog";
import { EASE } from "@/components/site";
import { Dropdown } from "@/components/dropdown";
import { ArrowRight, ChevronLeft, Check } from "lucide-react";

const METIERS = [
  ...CATEGORIES.map((c) => ({ id: c.id, label: c.label, emoji: c.emoji })),
  { id: "autre", label: "Autre / Multi-services", emoji: "🧰" },
];

const GOALS = [
  { id: "devis_factures", label: "Faire mes devis et factures", emoji: "🧾" },
  { id: "suivi_chantiers", label: "Suivre mes chantiers", emoji: "🏗️" },
  { id: "automatiser", label: "Automatiser l'administratif", emoji: "⚡" },
  { id: "outil_sur_mesure", label: "Créer un outil sur mesure", emoji: "🛠️" },
  { id: "questions_metier", label: "Réponses TVA, normes, règles", emoji: "📐" },
  { id: "decouverte", label: "Je découvre, tout simplement", emoji: "👀" },
];

// Pays : vrai Dropdown maison. FR/BE = TVA/SIRET pris en charge partout ; les
// autres sont stockés (utile pour la demande marché côté admin).
const COUNTRIES = [
  { value: "FR", label: "France", icon: "🇫🇷", hint: "TVA 20/10/5,5" },
  { value: "BE", label: "Belgique", icon: "🇧🇪", hint: "TVA 21/6" },
  { value: "LU", label: "Luxembourg", icon: "🇱🇺" },
  { value: "CH", label: "Suisse", icon: "🇨🇭" },
  { value: "CA", label: "Canada", icon: "🇨🇦" },
  { value: "AUTRE", label: "Autre pays", icon: "🌍" },
];

// Effectif : buckets que le patron reconnaît immédiatement + clé d'analyse admin.
const HEADCOUNTS = [
  { id: "solo", label: "Solo" },
  { id: "2-5", label: "2 à 5" },
  { id: "6-10", label: "6 à 10" },
  { id: "11-20", label: "11 à 20" },
  { id: "20+", label: "20 et +" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [country, setCountry] = useState<string | null>(null);
  const [headcount, setHeadcount] = useState<string | null>(null);
  const [sector, setSector] = useState<string | null>(null);
  const [goals, setGoals] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.replace("/login");
    });
  }, [router]);

  const pickSector = (id: string) => {
    setSector(id);
    setTimeout(() => setStep(2), 220);
  };

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
      const patch: { preferences: Json; sector?: string } = {
        preferences: {
          ...prefs, goals, onboarded: true, onboarding_skipped: skipped,
          country: country ?? "FR", headcount: headcount ?? null,
        },
      };
      if (sector) patch.sector = sector;
      await supabase.from("profiles").update(patch).eq("user_id", user.id);
      if (sector) await supabase.auth.updateUser({ data: { sector } });
      // Profil entreprise du tenant (adapte TVA/SIRET partout + tracking admin).
      // On FUSIONNE avec l'existant pour ne jamais écraser SIRET/adresse déjà saisis.
      try {
        const membership = await getActiveMembership(supabase, user.id);
        if (membership) {
          const { data: t } = await supabase
            .from("tenants").select("company_info").eq("id", membership.tenant_id).maybeSingle();
          const prev = (t?.company_info ?? {}) as Record<string, Json>;
          const company_info: Record<string, Json> = { ...prev };
          if (country) company_info.country = country;
          if (sector) company_info.sector = sector;
          if (headcount) company_info.headcount = headcount;
          await supabase.from("tenants").update({ company_info }).eq("id", membership.tenant_id);
        }
      } catch { /* best-effort */ }
    }
    void enablePushNotifications();
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
              Bienvenue. Parlez-nous de votre entreprise.
            </h1>
            <p className="mb-6 text-sm text-[#6E6E6C]">Deux infos rapides — ça adapte la TVA, les documents et vos outils.</p>

            <div className="space-y-5">
              <Dropdown
                label="Votre pays"
                value={country}
                onChange={setCountry}
                options={COUNTRIES}
                placeholder="Choisir un pays"
                ariaLabel="Votre pays"
              />

              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[#8B8B96]">Votre effectif</label>
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
              disabled={!country || !headcount}
              className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 py-3 font-semibold text-white shadow-[0_8px_24px_rgba(139,92,246,0.4)] transition-all hover:shadow-[0_10px_30px_rgba(139,92,246,0.55)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Continuer <ArrowRight className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => finish(true)} disabled={saving}
              className="mt-3 w-full text-center text-[13px] font-medium text-[#9A9AA6] transition-colors hover:text-[#0A0A0A]">
              Passer pour l&apos;instant
            </button>
          </motion.div>
        ) : step === 1 ? (
          <motion.div key="metier"
            initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.3, ease: EASE }}>
            <button type="button" onClick={() => setStep(0)}
              className="mb-4 flex items-center gap-1 text-[13px] font-medium text-[#9A9AA6] transition-colors hover:text-[#0A0A0A]">
              <ChevronLeft className="h-4 w-4" /> Retour
            </button>
            <h1 className="mb-1.5 text-[26px] font-black leading-tight tracking-[-0.03em] text-[#0A0A0A]">
              Quel est votre métier ?
            </h1>
            <p className="mb-6 text-sm text-[#6E6E6C]">Biltia adapte ses réponses et ses documents à votre métier.</p>
            <div className="grid grid-cols-2 gap-2.5">
              {METIERS.map((m) => (
                <button key={m.id} type="button" onClick={() => pickSector(m.id)} className={chip(sector === m.id)}>
                  <span className="text-[17px] leading-none">{m.emoji}</span>
                  <span className="min-w-0 truncate">{m.label}</span>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => finish(true)} disabled={saving}
              className="mt-6 text-[13px] font-medium text-[#9A9AA6] transition-colors hover:text-[#0A0A0A]">
              Passer pour l&apos;instant
            </button>
          </motion.div>
        ) : (
          <motion.div key="objectifs"
            initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.3, ease: EASE }}>
            <button type="button" onClick={() => setStep(1)}
              className="mb-4 flex items-center gap-1 text-[13px] font-medium text-[#9A9AA6] transition-colors hover:text-[#0A0A0A]">
              <ChevronLeft className="h-4 w-4" /> Retour
            </button>
            <h1 className="mb-1.5 text-[26px] font-black leading-tight tracking-[-0.03em] text-[#0A0A0A]">
              Qu&apos;est-ce que Biltia doit régler en premier ?
            </h1>
            <p className="mb-6 text-sm text-[#6E6E6C]">Plusieurs choix possibles. Ça oriente vos premiers outils.</p>
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
                <>C&apos;est parti <ArrowRight className="h-4 w-4" /></>
              )}
            </button>
            <button type="button" onClick={() => finish(true)} disabled={saving}
              className="mt-3 w-full text-center text-[13px] font-medium text-[#9A9AA6] transition-colors hover:text-[#0A0A0A]">
              Passer pour l&apos;instant
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
