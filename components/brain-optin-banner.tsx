"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { getActiveMembership } from "@/lib/tenant";
import { useT } from "@/lib/i18n/context";
import { Sparkles, Loader2, X } from "lucide-react";

/**
 * Bannière one-time d'opt-in au CERVEAU COLLECTIF, en haut du tableau de bord.
 *
 * Consentement HONNÊTE (RGPD) : elle DIT ce qui est partagé, « Non merci » est aussi
 * simple qu'« Activer », rien n'est pré-coché. But : faire décoller l'adoption — le
 * pipeline (capture → cron de promotion → RAG global servi au copilote ET à la
 * génération) est branché de bout en bout, mais reste VIDE tant qu'il n'y a pas assez
 * d'entreprises actives (seuil K-anonymat = 3 entreprises distinctes par signal).
 *
 * Ne s'affiche que pour owner/admin (seuls habilités à décider — RLS), quand le tenant
 * n'a pas encore activé ET que l'utilisateur n'a pas déjà écarté la carte. Comme
 * tenants.contributes_to_brain est NOT NULL default false, on ne peut pas distinguer
 * « jamais décidé » de « refusé » via cette colonne : un flag per-user
 * (preferences.brain_prompt_dismissed, dans le jsonb — aucune migration) sert de
 * mémoire « déjà proposé ». Best-effort partout : une bannière ne casse jamais le
 * tableau de bord.
 */
export function BrainOptInBanner() {
  const t = useT();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const membership = await getActiveMembership(supabase, user.id);
        if (!membership || !["owner", "admin"].includes(membership.role)) return;
        const [tenantRes, profileRes] = await Promise.all([
          supabase.from("tenants").select("contributes_to_brain").eq("id", membership.tenant_id).maybeSingle(),
          supabase.from("profiles").select("preferences").eq("user_id", user.id).maybeSingle(),
        ]);
        const optedIn = (tenantRes.data as { contributes_to_brain?: boolean } | null)?.contributes_to_brain === true;
        const prefs = ((profileRes.data as { preferences?: unknown } | null)?.preferences ?? {}) as Record<string, unknown>;
        const dismissed = prefs.brain_prompt_dismissed === true;
        if (!alive || optedIn || dismissed) return;
        setTenantId(membership.tenant_id);
        setUserId(user.id);
        setVisible(true);
      } catch {
        /* silencieux */
      }
    })();
    return () => { alive = false; };
  }, []);

  async function activate() {
    if (!tenantId || busy) return;
    setBusy(true);
    try {
      const supabase = createClient();
      await supabase.from("tenants").update({ contributes_to_brain: true }).eq("id", tenantId);
    } catch {
      /* best-effort */
    }
    setVisible(false);
  }

  async function dismiss() {
    if (!userId || busy) return;
    setBusy(true);
    try {
      const supabase = createClient();
      const { data } = await supabase.from("profiles").select("preferences").eq("user_id", userId).maybeSingle();
      const raw = (data?.preferences && typeof data.preferences === "object" ? data.preferences : {}) as Record<string, unknown>;
      await supabase.from("profiles").upsert(
        { user_id: userId, preferences: { ...raw, brain_prompt_dismissed: true } },
        { onConflict: "user_id" }
      );
    } catch {
      /* best-effort */
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <section className="relative z-10 px-4 sm:px-6 pt-6">
      <div className="max-w-[1680px] mx-auto">
        <div className="relative flex flex-col sm:flex-row sm:items-center gap-4 rounded-2xl border border-violet-200/70 bg-gradient-to-r from-violet-500/[0.07] to-pink-500/[0.05] p-4 sm:p-5">
          <button
            onClick={dismiss}
            aria-label={t("Fermer", "Dismiss")}
            className="absolute top-3 right-3 grid h-7 w-7 place-items-center rounded-full text-[#9A9A97] hover:bg-black/5 transition-colors sm:hidden"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl bg-white shadow-sm">
            <Sparkles className="w-5 h-5 text-violet-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-bold text-[#0A0A0A]">
              {t("Aidez Biltia à s'améliorer pour tout le BTP", "Help Biltia get better for the whole trade")}
            </p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-[#5A5A66]">
              {t(
                "Partagez des enseignements anonymes tirés de votre activité — jamais vos clients, vos montants ni vos documents. En retour, vous profitez des meilleures pratiques agrégées de la communauté.",
                "Share anonymous insights from your activity — never your clients, amounts or documents. In return, you benefit from the community's aggregated best practices."
              )}
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <button
              onClick={dismiss}
              disabled={busy}
              className="px-3 py-2 text-[13px] font-semibold text-[#6E6E6C] transition-colors hover:text-[#0A0A0A] disabled:opacity-50"
            >
              {t("Non merci", "No thanks")}
            </button>
            <button
              onClick={activate}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#0A0A0A] px-4 py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {t("Activer", "Enable")}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
