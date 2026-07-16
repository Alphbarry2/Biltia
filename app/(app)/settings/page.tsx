"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { getActiveMembership } from "@/lib/tenant";
import { useRole } from "@/lib/use-role";
import { Dropdown } from "@/components/dropdown";
import { COUNTRIES, normalizeCountry } from "@/lib/countries";
import { CATEGORIES, catLabel } from "@/lib/btp-catalog";
import { useT, useLocale, useI18n } from "@/lib/i18n/context";
import { LOCALE_META, type Locale } from "@/lib/i18n/config";

// Métiers éditables en paramètres (mêmes catégories qu'à l'onboarding) +
// « Autre » pour couvrir le multi-services. Multi-sélection : un artisan peut
// être électricien ET chauffagiste.
function buildMetiers(t: (fr: string, en: string) => string, locale: Locale) {
  return [
    ...CATEGORIES.map((c) => ({ id: c.id, label: catLabel(c.label, locale), emoji: c.emoji })),
    { id: "autre", label: t("Autre / Multi-services", "Other / Multi-services"), emoji: "🧰" },
  ];
}
import {
  User,
  Building2,
  Users,
  CreditCard,
  Sparkles,
  Bell,
  Shield,
  Database,
  Zap,
  ArrowRight,
  CheckCircle,
  Check,
  Loader2,
  Save,
  Lock,
  Camera,
  Globe,
  Clock,
  Upload,
  Download,
  Trash2,
  Palette,
  RefreshCw,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  PLANS,
  getPlan,
  getTier,
  formatEur,
  tierDisplayMonthlyEur,
  annualTotalEur,
  localizePlan,
  type BillingCycle,
  type PlanId,
} from "@/lib/plans";
import { CreditPacksPanel } from "@/components/credit-packs";
import KnowledgeManager from "@/components/knowledge-manager";
import BrandSettings from "@/components/brand-settings";
import {
  DEFAULT_PREFERENCES,
  normalizePreferences,
  TONE_OPTIONS,
  type UserPreferences,
  type Tone,
} from "@/lib/user-preferences";

// ─────────────────────────────────────────────────────────────────────────────
// Paramètres — préférences métier, jamais de config technique.
// 9 sections, TOUTES fonctionnelles — jamais de « bientôt ».
// ─────────────────────────────────────────────────────────────────────────────

type SectionKey =
  | "account" | "company" | "brand" | "team" | "billing"
  | "ai" | "notifications" | "security" | "data";

// Les intégrations ont leur propre page (sidebar → /connectors).
const SECTIONS: { key: SectionKey; icon: LucideIcon }[] = [
  { key: "account", icon: User },
  { key: "company", icon: Building2 },
  { key: "brand", icon: Palette },
  { key: "team", icon: Users },
  { key: "billing", icon: CreditCard },
  { key: "ai", icon: Sparkles },
  { key: "notifications", icon: Bell },
  { key: "security", icon: Shield },
  { key: "data", icon: Database },
];

function sectionLabel(t: (fr: string, en: string) => string, key: SectionKey): string {
  switch (key) {
    case "account": return t("Mon compte", "My account");
    case "company": return t("Entreprise", "Company");
    case "brand": return t("Identité visuelle", "Visual identity");
    case "team": return t("Équipe", "Team");
    case "billing": return t("Facturation", "Billing");
    case "ai": return t("IA", "AI");
    case "notifications": return t("Notifications", "Notifications");
    case "security": return t("Sécurité", "Security");
    case "data": return t("Données", "Data");
  }
}

// ─── Primitives ──────────────────────────────────────────────────────────────
function SectionTitle({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2.5">
        <h2 className="text-lg font-bold text-[#0A0A0A] tracking-[-0.01em]">{title}</h2>
      </div>
      {desc && <p className="text-[13px] text-[#6E6E6C] mt-1">{desc}</p>}
    </div>
  );
}

const inputCls =
  "w-full px-3.5 py-2.5 rounded-xl border border-[#E7E7EE] bg-white text-[14px] text-[#0A0A0A] placeholder-[#9A9AA6] focus:outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10 transition-all disabled:bg-[#FAFAFA] disabled:text-[#9A9A97] disabled:cursor-not-allowed";

function Field({
  label, children, hint,
}: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="block text-[12px] font-semibold text-[#4A4A56] mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-[#9A9A97] mt-1">{hint}</p>}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-white border border-[#E7E7E4] rounded-2xl p-5 sm:p-6">{children}</div>;
}

function Switch({ on, onClick, disabled = false, ariaLabel }: { on: boolean; onClick: () => void; disabled?: boolean; ariaLabel?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className={`w-10 h-6 rounded-full flex items-center px-0.5 flex-shrink-0 transition-colors disabled:opacity-50 ${on ? "bg-violet-500" : "bg-black/[0.12]"}`}
    >
      <span className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${on ? "translate-x-4" : ""}`} />
    </button>
  );
}

function PrefRow({
  label, desc, on, onToggle,
}: { label: string; desc?: string; on: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5 border-b border-[#F1F1EC] last:border-0">
      <div className="min-w-0">
        <p className="text-[14px] text-[#0A0A0A]">{label}</p>
        {desc && <p className="text-[12px] text-[#9A9A97] mt-0.5">{desc}</p>}
      </div>
      <Switch on={on} onClick={onToggle} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const t = useT();
  const locale = useLocale();
  const { setLocale } = useI18n();
  const METIERS = buildMetiers(t, locale);
  const [section, setSection] = useState<SectionKey>("account");
  // Rôle dans l'espace actif → masque la Facturation aux non-propriétaires.
  // Pendant le chargement, on affiche (évite le clignotement pour le propriétaire).
  const { loading: roleLoading, can: roleCan } = useRole();

  const [credits, setCredits] = useState<number | null>(null);
  const [email, setEmail] = useState("");
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Compte
  const [fullName, setFullName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);

  // Entreprise (tenants.company_info : pays FR/BE, TVA, SIRET/BCE, adresse)
  const [companyName, setCompanyName] = useState("");
  const [companyInfo, setCompanyInfo] = useState({ country: "FR", vat: "", siret: "", address: "" });
  // company_info porte AUSSI des clés que cet écran n'édite pas (headcount,
  // activity_type et sector_detail posés à l'inscription, brand = identité
  // visuelle). On garde le JSON complet pour le REFUSIONNER à l'enregistrement :
  // sans ça, sauver la fiche écrase silencieusement tout le reste.
  const [companyRaw, setCompanyRaw] = useState<Record<string, unknown>>({});
  // Spécialités du métier (multi) : sectors[0] = principale (aiguille les agents).
  const [sectors, setSectors] = useState<string[]>([]);
  const [savingCompany, setSavingCompany] = useState(false);

  // Cerveau collectif : contribution (anonymisée) au corpus partagé. Opt-in (RGPD) :
  // décoché par défaut, activé uniquement sur consentement explicite du tenant.
  const [contributesToBrain, setContributesToBrain] = useState(false);
  const [savingBrain, setSavingBrain] = useState(false);

  // Sécurité : réinitialisation par email + 2FA TOTP
  const [resetSent, setResetSent] = useState(false);
  const [mfaFactors, setMfaFactors] = useState<{ id: string; status: string }[]>([]);
  const [mfaEnroll, setMfaEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaBusy, setMfaBusy] = useState(false);

  // Préférences IA
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [savingPrefs, setSavingPrefs] = useState(false);

  // Équipe
  type TeamMember = {
    id: string;
    user_id: string;
    email: string;
    full_name?: string;
    role: string;
    accepted: boolean;
    isYou: boolean;
    employeeId?: string | null;
  };
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [canManageTeam, setCanManageTeam] = useState(false);
  const [employeeOptions, setEmployeeOptions] = useState<{ id: string; nom: string; prenom: string | null }[]>([]);
  const [linkingUser, setLinkingUser] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);

  // Notifications push (Web Push)
  const [pushSupported, setPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  // Facturation
  type SubRow = { plan: PlanId; status: string; current_period_end: string | null };
  const [sub, setSub] = useState<SubRow | null>(null);
  const selectedPlan = "pro" as const; // offre payante unique en self-service
  const [selectedCredits, setSelectedCredits] = useState<number>(getPlan("pro").defaultCredits ?? 100);
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sec = params.get("section");
    // Deep-link vers une section précise (ex : un agent renvoie ici « activer les
    // notifications » → /settings?section=notifications).
    const KNOWN: SectionKey[] = ["account", "company", "team", "billing", "ai", "notifications", "security", "data"];
    if (sec && (KNOWN as string[]).includes(sec)) setSection(sec as SectionKey);
    if (params.get("upgrade") === "1") setSection("billing");
    if (params.get("checkout") === "success") { setNotice(t("Paiement confirmé. Votre abonnement sera actif d'ici quelques secondes.", "Payment confirmed. Your subscription will be active in a few seconds.")); setSection("billing"); }
    if (params.get("checkout") === "cancel") { setNotice(t("Paiement annulé. Aucun changement n'a été effectué.", "Payment cancelled. No changes were made.")); setSection("billing"); }

    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      setEmail(user.email ?? "");

      supabase.from("user_credits").select("balance, topup_balance").eq("user_id", user.id).single()
        .then(({ data }) => { if (data) setCredits((data.balance ?? 0) + (data.topup_balance ?? 0)); });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as unknown as { from: (t: string) => any })
        .from("profiles").select("full_name, sector, preferences").eq("user_id", user.id).maybeSingle()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .then(({ data }: any) => {
          if (data?.full_name) setFullName(data.full_name);
          // Spécialités : principale (profiles.sector) + additionnelles
          // (preferences.sectors), fusionnées et dédoublonnées.
          const p = (data?.preferences ?? {}) as Record<string, unknown>;
          const extra = Array.isArray(p.sectors) ? (p.sectors as unknown[]) : [];
          const primary = data?.sector && data.sector !== "autre" ? [String(data.sector)] : [];
          const all = Array.from(new Set([...primary, ...extra]))
            .filter((s): s is string => typeof s === "string" && !!s);
          setSectors(all);
        });

      // Préférences IA (best-effort — colonne absente → défauts).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as unknown as { from: (t: string) => any })
        .from("profiles").select("preferences").eq("user_id", user.id).maybeSingle()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .then(({ data }: any) => { if (data) setPrefs(normalizePreferences(data.preferences)); });

      const membership = await getActiveMembership(supabase, user.id);
      if (!membership?.tenant_id) return;
      setTenantId(membership.tenant_id);

      const { data: tenant } = await supabase
        .from("tenants").select("name").eq("id", membership.tenant_id).maybeSingle();
      if (tenant?.name) setCompanyName(tenant.name);

      const { data: subRow } = await supabase
        .from("subscriptions").select("plan, status, current_period_end")
        .eq("tenant_id", membership.tenant_id).maybeSingle();
      if (subRow) setSub(subRow as unknown as SubRow);
    });
  }, []);

  // Tout abonnement actif non-"free" (y compris un ancien "business") est présenté comme Pro.
  const currentPlanId: PlanId = sub && sub.plan !== "free" ? "pro" : "free";
  const currentPlan = localizePlan(getPlan(currentPlanId), locale);
  const selectedTier = getTier(selectedPlan, selectedCredits);

  function flash(msg: string) { setError(null); setNotice(msg); }

  // ── Équipe : chargement à l'ouverture de la section ─────────────────────────
  useEffect(() => {
    if (section !== "team") return;
    let cancelled = false;
    setTeamLoading(true);
    fetch("/api/team")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data.members)) {
          setTeam(data.members);
          setCanManageTeam(!!data.canManage);
          if (Array.isArray(data.employees)) setEmployeeOptions(data.employees);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setTeamLoading(false); });
    return () => { cancelled = true; };
  }, [section]);

  async function inviteMember() {
    setError(null);
    const email = inviteEmail.trim();
    if (!email) return;
    setInviting(true);
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("Invitation impossible.", "Invitation failed."));
      setTeam((prev) => [...prev, data.member]);
      setInviteEmail("");
      flash(
        data.invited
          ? t(`Invitation envoyée à ${data.member.email} : il la reçoit par email, clique, choisit son mot de passe et rejoint l'équipe (sans confirmation).`, `Invitation sent to ${data.member.email}: they receive it by email, click, choose their password and join the team (no confirmation needed).`)
          : t(`${data.member.email} a rejoint votre équipe.`, `${data.member.email} joined your team.`)
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Invitation impossible.", "Invitation failed."));
    }
    setInviting(false);
  }

  // Relie (ou délie) un compte à une fiche employé → active « ses chantiers ».
  async function linkEmployee(memberUserId: string, employeeId: string) {
    setLinkingUser(memberUserId);
    try {
      const res = await fetch("/api/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberUserId, employeeId: employeeId || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("Liaison impossible.", "Linking failed."));
      setTeam((prev) => prev.map((m) => (m.user_id === memberUserId ? { ...m, employeeId: employeeId || null } : m)));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Liaison impossible.", "Linking failed."));
    }
    setLinkingUser(null);
  }

  async function removeMember(memberId: string) {
    // Confirmation anti-fausse-manip : on nomme la personne concernée.
    const target = team.find((m) => m.id === memberId);
    const label = target?.full_name || target?.email || t("ce collaborateur", "this collaborator");
    if (!window.confirm(t(`Retirer ${label} de l'équipe ?\n\nIl perdra immédiatement l'accès à cet espace de travail.`, `Remove ${label} from the team?\n\nThey will immediately lose access to this workspace.`))) {
      return;
    }
    setError(null);
    setRemovingId(memberId);
    try {
      const res = await fetch("/api/team", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId }),
      });
      // 404 = la fiche n'existe déjà plus (déjà retirée depuis un autre onglet, double
      // clic...) : le résultat voulu (plus dans l'équipe) est de toute façon atteint,
      // pas la peine d'afficher une erreur qui donne l'impression que ça a échoué.
      if (res.status === 404) {
        setTeam((prev) => prev.filter((m) => m.id !== memberId));
        setRemovingId(null);
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("Retrait impossible.", "Removal failed."));
      setTeam((prev) => prev.filter((m) => m.id !== memberId));
      flash(t("Membre retiré de l'équipe.", "Member removed from the team."));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Retrait impossible.", "Removal failed."));
    }
    setRemovingId(null);
  }

  async function resendInvite(memberId: string) {
    setError(null);
    setResendingId(memberId);
    try {
      const res = await fetch("/api/team/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("Relance impossible.", "Resend failed."));
      flash(t("Invitation relancée : un nouveau lien vient d'être envoyé.", "Invitation resent: a new link was just sent."));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Relance impossible.", "Resend failed."));
    }
    setResendingId(null);
  }

  async function saveName() {
    setError(null); setSavingName(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t("Session expirée.", "Session expired."));
      const { error: e1 } = await supabase
        .from("profiles")
        .upsert({ user_id: user.id, full_name: fullName }, { onConflict: "user_id" });
      if (e1) throw e1;
      await supabase.auth.updateUser({ data: { full_name: fullName } });
      flash(t("Nom mis à jour.", "Name updated."));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Échec de l'enregistrement.", "Save failed."));
    }
    setSavingName(false);
  }

  // Fiche entreprise : chargée depuis tenants.company_info.
  useEffect(() => {
    if (!tenantId) return;
    const supabase = createClient();
    supabase.from("tenants").select("company_info, contributes_to_brain").eq("id", tenantId).maybeSingle().then(({ data }) => {
      const ci = (data?.company_info ?? {}) as Record<string, string>;
      setCompanyRaw((data?.company_info ?? {}) as Record<string, unknown>);
      setCompanyInfo({
        country: normalizeCountry(ci.country),
        vat: ci.vat ?? "",
        siret: ci.siret ?? "",
        address: ci.address ?? "",
      });
      setContributesToBrain(data?.contributes_to_brain === true);
    });
  }, [tenantId]);

  // Bascule opt-in/opt-out du cerveau collectif (écrit directement tenants, RLS
  // owner/admin — même chemin que la fiche entreprise).
  async function toggleBrain(next: boolean) {
    if (!tenantId || savingBrain) return;
    setSavingBrain(true);
    setContributesToBrain(next); // optimiste
    const supabase = createClient();
    const { error: err } = await supabase
      .from("tenants")
      .update({ contributes_to_brain: next })
      .eq("id", tenantId);
    if (err) {
      setContributesToBrain(!next); // rollback
      setError(t("Impossible de mettre à jour ce réglage.", "Couldn't update this setting."));
    } else {
      flash(next ? t("Contribution au cerveau collectif activée.", "Collective brain contribution enabled.") : t("Contribution désactivée.", "Contribution disabled."));
    }
    setSavingBrain(false);
  }

  // Facteurs 2FA existants.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.mfa.listFactors().then(({ data }) => {
      setMfaFactors((data?.totp ?? []).map((f) => ({ id: f.id, status: f.status })));
    });
  }, []);

  // Sécurité : le mot de passe ne se change JAMAIS directement depuis une
  // session ouverte (un compte volé serait verrouillé par le voleur). On
  // envoie un lien par email — le lien prouve la possession de la boîte mail.
  async function sendPasswordReset() {
    setError(null);
    setSavingPwd(true);
    try {
      const supabase = createClient();
      const { error: e } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (e) throw e;
      setResetSent(true);
      flash(t("Email envoyé. Ouvrez le lien reçu pour définir un nouveau mot de passe.", "Email sent. Open the link you receive to set a new password."));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Envoi impossible. Réessayez.", "Sending failed. Try again."));
    }
    setSavingPwd(false);
  }

  // ── 2FA TOTP (application d'authentification : Google Authenticator, 1Password…) ──
  async function startMfaEnroll() {
    setError(null); setMfaBusy(true);
    try {
      const supabase = createClient();
      const { data, error: e } = await supabase.auth.mfa.enroll({ factorType: "totp" });
      if (e) throw e;
      setMfaEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Activation impossible.", "Activation failed."));
    }
    setMfaBusy(false);
  }

  async function verifyMfaEnroll() {
    if (!mfaEnroll || mfaCode.trim().length < 6) return;
    setError(null); setMfaBusy(true);
    try {
      const supabase = createClient();
      const { data: ch, error: e1 } = await supabase.auth.mfa.challenge({ factorId: mfaEnroll.id });
      if (e1) throw e1;
      const { error: e2 } = await supabase.auth.mfa.verify({
        factorId: mfaEnroll.id,
        challengeId: ch.id,
        code: mfaCode.trim(),
      });
      if (e2) throw e2;
      setMfaEnroll(null); setMfaCode("");
      const { data } = await supabase.auth.mfa.listFactors();
      setMfaFactors((data?.totp ?? []).map((f) => ({ id: f.id, status: f.status })));
      flash(t("Double authentification activée.", "Two-factor authentication enabled."));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Code invalide. Réessayez.", "Invalid code. Try again."));
    }
    setMfaBusy(false);
  }

  async function disableMfa(factorId: string) {
    if (!confirm(t("Désactiver la double authentification ?", "Disable two-factor authentication?"))) return;
    setMfaBusy(true);
    try {
      const supabase = createClient();
      const { error: e } = await supabase.auth.mfa.unenroll({ factorId });
      if (e) throw e;
      setMfaFactors((prev) => prev.filter((f) => f.id !== factorId));
      flash(t("Double authentification désactivée.", "Two-factor authentication disabled."));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Échec de la désactivation.", "Failed to disable."));
    }
    setMfaBusy(false);
  }

  async function signOutEverywhere() {
    if (!confirm(t("Se déconnecter de TOUS les appareils (y compris celui-ci) ?", "Sign out of ALL devices (including this one)?"))) return;
    const supabase = createClient();
    await supabase.auth.signOut({ scope: "global" });
    window.location.href = "/login";
  }

  async function saveCompany() {
    setError(null);
    if (!tenantId) { setError(t("Aucun espace de travail.", "No workspace.")); return; }
    setSavingCompany(true);
    try {
      const supabase = createClient();
      const primarySector = sectors[0] ?? null;
      // tenants : nom + fiche (pays, TVA…) + spécialité principale/liste.
      // On repart du JSON COMPLET (companyRaw) : les clés que cet écran n'édite pas
      // — identité visuelle (brand), effectif, type d'activité posés à l'inscription —
      // doivent survivre à l'enregistrement de la fiche.
      const { error: e } = await supabase
        .from("tenants")
        .update({
          name: companyName,
          company_info: { ...companyRaw, ...companyInfo, sector: primarySector, sectors },
        })
        .eq("id", tenantId);
      if (e) throw e;

      // profiles : la spécialité PRINCIPALE aiguille les agents (lib/router).
      // Les additionnelles vivent dans preferences.sectors. Best-effort : un
      // échec ici ne perd pas l'enregistrement de la fiche entreprise.
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const db = supabase as unknown as { from: (t: string) => any };
          const { data: prof } = await db
            .from("profiles").select("preferences").eq("user_id", user.id).maybeSingle();
          const raw = (prof?.preferences && typeof prof.preferences === "object" ? prof.preferences : {}) as Record<string, unknown>;
          await db
            .from("profiles")
            .update({ sector: primarySector ?? "autre", preferences: { ...raw, sectors } })
            .eq("user_id", user.id);
          if (primarySector) await supabase.auth.updateUser({ data: { sector: primarySector } });
        }
      } catch { /* la spécialité est best-effort */ }

      flash(t("Entreprise mise à jour.", "Company updated."));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Échec (seuls Propriétaire et Admin peuvent modifier).", "Failed (only Owner and Admin can edit)."));
    }
    setSavingCompany(false);
  }

  // Ajoute/retire une spécialité (la première cochée devient la principale).
  const toggleSector = (id: string) =>
    setSectors((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  type BoolPref = "always_confirm" | "always_pdf" | "ai_notifications";
  // Sauvegarde AUTO au clic — comme les toggles cerveau collectif / push. Plus de
  // bouton « Enregistrer » séparé (donc plus de réglage perdu si on change de page).
  // Optimiste + rollback si l'écriture échoue.
  const togglePref = (k: BoolPref) => {
    const prev = prefs;
    const next: UserPreferences = { ...prefs, [k]: !prefs[k] };
    setPrefs(next);
    void persistPrefs(next).then((ok) => { if (!ok) setPrefs(prev); });
  };
  const setTone = (tone: Tone) => {
    const prev = prefs;
    const next: UserPreferences = { ...prefs, tone };
    setPrefs(next);
    void persistPrefs(next).then((ok) => { if (!ok) setPrefs(prev); });
  };

  // Persiste les préférences. Fusion avec les préférences brutes existantes (pays,
  // objectifs d'onboarding…) : ne JAMAIS écraser ce que d'autres écrans ont stocké.
  // Renvoie true si sauvé (silencieux en succès : le toggle EST le retour visuel).
  async function persistPrefs(next: UserPreferences): Promise<boolean> {
    setError(null); setSavingPrefs(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t("Session expirée.", "Session expired."));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as unknown as { from: (t: string) => any };
      const { data: prof } = await db
        .from("profiles").select("preferences").eq("user_id", user.id).maybeSingle();
      const raw = (prof?.preferences && typeof prof.preferences === "object" ? prof.preferences : {}) as Record<string, unknown>;
      const { error: e } = await db
        .from("profiles")
        .upsert({ user_id: user.id, preferences: { ...raw, ...next } }, { onConflict: "user_id" });
      if (e) throw e;
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Impossible d'enregistrer la préférence.", "Couldn't save the preference."));
      return false;
    } finally {
      setSavingPrefs(false);
    }
  }

  // Enregistrement (idempotent) du service worker — sans jamais pendre :
  // `serviceWorker.ready` ne résout QUE si un SW est enregistré, on passe donc
  // par register() + getRegistration() plutôt que d'attendre ready.
  async function getSWRegistration(): Promise<ServiceWorkerRegistration | null> {
    try {
      const existing = await navigator.serviceWorker.getRegistration();
      if (existing) return existing;
      return await navigator.serviceWorker.register("/sw.js");
    } catch {
      return null;
    }
  }

  // ── Notifications push : état de l'appareil courant ─────────────────────────
  useEffect(() => {
    if (section !== "notifications") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushSupported(false);
      return;
    }
    setPushSupported(true);
    getSWRegistration()
      .then((reg) => reg?.pushManager.getSubscription() ?? null)
      .then((s) => setPushEnabled(!!s))
      .catch(() => setPushEnabled(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  // Clé VAPID publique (base64url) → Uint8Array pour pushManager.subscribe.
  function urlBase64ToUint8Array(base64: string): Uint8Array {
    const padding = "=".repeat((4 - (base64.length % 4)) % 4);
    const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = window.atob(b64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  async function togglePush() {
    if (pushBusy || !pushSupported) return;
    setError(null);
    setPushBusy(true);
    try {
      const reg = await getSWRegistration();
      if (!reg) throw new Error(t("Service worker indisponible. Rechargez la page et réessayez.", "Service worker unavailable. Reload the page and try again."));
      if (pushEnabled) {
        // Désabonnement de CET appareil.
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await fetch("/api/push", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          await sub.unsubscribe();
        }
        setPushEnabled(false);
        flash(t("Notifications push désactivées sur cet appareil.", "Push notifications disabled on this device."));
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          throw new Error(t("Autorisez les notifications dans votre navigateur pour les activer.", "Allow notifications in your browser to enable them."));
        }
        const cfg = await fetch("/api/push").then((r) => r.json());
        if (!cfg.enabled || !cfg.publicKey) {
          throw new Error(t("Notifications push non configurées côté serveur.", "Push notifications not configured on the server."));
        }
        // subscribe() peut PENDRE si le service push du navigateur est
        // injoignable (pare-feu, offline) → timeout avec message clair.
        const sub = await Promise.race([
          reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(cfg.publicKey).buffer as ArrayBuffer,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error(t("Service de notifications injoignable. Vérifiez votre connexion et réessayez.", "Notification service unreachable. Check your connection and try again."))),
              12000
            )
          ),
        ]);
        const res = await fetch("/api/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription: sub.toJSON() }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? t("Activation impossible.", "Activation failed."));
        setPushEnabled(true);
        flash(
          data.testSent
            ? t("Notifications activées — une notification de test vient d'arriver.", "Notifications enabled — a test notification just arrived.")
            : t("Notifications activées sur cet appareil.", "Notifications enabled on this device.")
        );
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      // Erreurs navigateur brutes → messages compréhensibles.
      const friendly = /permission denied|incognito/i.test(raw)
        ? t("Votre navigateur bloque les notifications (navigation privée ?). Ouvrez Biltia dans une fenêtre normale et réessayez.", "Your browser blocks notifications (private browsing?). Open Biltia in a normal window and try again.")
        : /denied/i.test(raw)
        ? t("Autorisez les notifications dans votre navigateur pour les activer.", "Allow notifications in your browser to enable them.")
        : raw || t("Opération impossible.", "Operation failed.");
      setError(friendly);
    }
    setPushBusy(false);
  }

  async function subscribe() {
    setError(null); setCheckoutLoading(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: selectedPlan, credits: selectedCredits, cycle }),
      });
      const data = await res.json();
      if (res.ok && data.url) { window.location.href = data.url; return; }
      setError(data.error ?? t("Impossible de démarrer le paiement.", "Couldn't start the payment."));
    } catch {
      setError(t("Erreur réseau. Réessayez.", "Network error. Try again."));
    }
    setCheckoutLoading(false);
  }

  const roleLabel: Record<string, string> = {
    owner: t("Propriétaire", "Owner"), admin: t("Admin", "Admin"), manager: t("Manager", "Manager"), member: t("Employé", "Employee"), viewer: t("Lecture seule", "Read-only"),
  };

  return (
    <div className="min-h-full bg-[#FCFCFD]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* En-tête */}
        <div className="flex items-center gap-3 mb-1.5">
          <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500/15 to-pink-500/10 flex items-center justify-center flex-shrink-0">
            <User className="w-5 h-5 text-violet-600" />
          </span>
          <h1 className="text-xl sm:text-2xl font-black text-[#0A0A0A] tracking-[-0.03em]">{t("Paramètres", "Settings")}</h1>
        </div>
        <p className="text-[14px] text-[#6E6E6C] mb-6 ml-0 sm:ml-12">{t("Vos préférences, pas de la technique.", "Your preferences, not the tech.")}</p>

        <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
          {/* Nav interne — horizontale jusqu'à lg (évite l'écrasement des champs
              sur tablette : sidebar de l'app + nav verticale + formulaire 2 colonnes). */}
          <nav className="lg:w-56 flex-shrink-0">
            <div className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 -mx-1 px-1 lg:mx-0 lg:px-0">
              {SECTIONS.filter(
                (s) => s.key !== "billing" || roleLoading || roleCan("billing.manage")
              ).map(({ key, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => { setSection(key); setError(null); }}
                  className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13.5px] font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                    section === key
                      ? "bg-gradient-to-r from-violet-500/[0.12] to-pink-500/[0.08] text-[#0A0A0A]"
                      : "text-[#6E6E6C] hover:text-[#0A0A0A] hover:bg-black/[0.03]"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${section === key ? "text-violet-600" : ""}`} />
                  {sectionLabel(t, key)}
                </button>
              ))}
            </div>
          </nav>

          {/* Contenu */}
          <div className="flex-1 min-w-0 max-w-2xl space-y-5">
            {notice && (
              <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-700">{notice}</div>
            )}
            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
            )}

            {/* ─── MON COMPTE ─────────────────────────────────────────── */}
            {section === "account" && (
              <div className="space-y-5">
                <Card>
                  <SectionTitle title={t("Mon compte", "My account")} desc={t("Vos informations personnelles.", "Your personal information.")} />
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center">
                      <span className="text-xl font-bold text-white">{(fullName || email || "?")[0]?.toUpperCase()}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold text-[#0A0A0A] truncate">{fullName || email}</p>
                      <p className="text-[13px] text-[#9A9A97]">{t(`Plan ${currentPlan.name}`, `${currentPlan.name} plan`)}</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <Field label={t("Nom complet", "Full name")}>
                      <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={t("Jean Dupont", "John Smith")} className={inputCls} />
                    </Field>
                    <Field label={t("Email", "Email")} hint={t("Votre identifiant de connexion. Pour le changer, contactez le support (protection anti-détournement).", "Your sign-in ID. To change it, contact support (anti-hijacking protection).")}>
                      <input value={email} disabled className={inputCls} />
                    </Field>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label={t("Langue", "Language")}>
                        <Dropdown value={locale} onChange={(v) => setLocale(v as Locale)} ariaLabel={t("Langue", "Language")} size="sm"
                          options={[
                            { value: "fr", label: LOCALE_META.fr.label, icon: <Globe className="w-3.5 h-3.5 text-[#9A9A97]" /> },
                            { value: "en", label: LOCALE_META.en.label, icon: <Globe className="w-3.5 h-3.5 text-[#9A9A97]" /> },
                          ]} />
                      </Field>
                      <Field label={t("Fuseau", "Time zone")}>
                        <Dropdown value="paris" onChange={() => {}} ariaLabel={t("Fuseau horaire", "Time zone")} size="sm"
                          options={[{ value: "paris", label: "Europe/Paris", icon: <Clock className="w-3.5 h-3.5 text-[#9A9A97]" /> }]} />
                      </Field>
                    </div>
                    <button
                      onClick={saveName}
                      disabled={savingName}
                      className="inline-flex items-center gap-2 rounded-xl bg-[#0A0A0A] text-white text-[13.5px] font-semibold px-4 py-2.5 hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                      {savingName ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      {t("Enregistrer", "Save")}
                    </button>
                  </div>
                </Card>

                <Card>
                  <SectionTitle
                    title={t("Mot de passe", "Password")}
                    desc={t("Par sécurité, le changement passe par un lien envoyé à votre email — jamais directement depuis une session ouverte.", "For security, changes go through a link sent to your email — never directly from an open session.")}
                  />
                  {resetSent ? (
                    <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                      <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <p className="text-sm text-emerald-700">
                        {t("Lien envoyé à ", "Link sent to ")}<b>{email}</b>{t(". Ouvrez l'email et suivez le lien pour définir votre nouveau mot de passe.", ". Open the email and follow the link to set your new password.")}
                      </p>
                    </div>
                  ) : (
                    <button
                      onClick={sendPasswordReset}
                      disabled={savingPwd}
                      className="inline-flex items-center gap-2 rounded-xl bg-[#0A0A0A] text-white text-[13.5px] font-semibold px-4 py-2.5 hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                      {savingPwd ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                      {t("Recevoir le lien de réinitialisation", "Get the reset link")}
                    </button>
                  )}
                </Card>
              </div>
            )}

            {/* ─── ENTREPRISE ─────────────────────────────────────────── */}
            {section === "company" && (
              <Card>
                <SectionTitle title={t("Entreprise", "Company")} desc={t("Ces informations alimentent vos devis, factures et documents.", "This information feeds your quotes, invoices and documents.")} />
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label={t("Nom de l'entreprise", "Company name")}>
                      <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder={t("BTP Dupont SARL", "Dupont Construction Ltd")} className={inputCls} />
                    </Field>
                    <Field label={t("Pays", "Country")}>
                      <Dropdown
                        value={companyInfo.country}
                        onChange={(v) => setCompanyInfo((c) => ({ ...c, country: v }))}
                        ariaLabel={t("Pays de l'entreprise", "Company country")}
                        size="sm"
                        options={COUNTRIES.map((c) => ({
                          value: c.value,
                          label: c.label,
                          icon: <span>{c.icon}</span>,
                        }))}
                      />
                    </Field>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label={companyInfo.country === "BE" ? t("N° TVA (BE 0XXX.XXX.XXX)", "VAT no. (BE 0XXX.XXX.XXX)") : t("N° TVA intracommunautaire", "EU VAT number")}>
                      <input
                        value={companyInfo.vat}
                        onChange={(e) => setCompanyInfo((c) => ({ ...c, vat: e.target.value }))}
                        placeholder={companyInfo.country === "BE" ? "BE 0123.456.789" : "FR 12 345678901"}
                        className={inputCls}
                      />
                    </Field>
                    <Field label={companyInfo.country === "BE" ? t("N° d'entreprise (BCE)", "Company no. (BCE)") : t("SIRET", "SIRET")}>
                      <input
                        value={companyInfo.siret}
                        onChange={(e) => setCompanyInfo((c) => ({ ...c, siret: e.target.value }))}
                        placeholder={companyInfo.country === "BE" ? "0123.456.789" : "123 456 789 00012"}
                        className={inputCls}
                      />
                    </Field>
                  </div>
                  <Field label={t("Adresse", "Address")}>
                    <input
                      value={companyInfo.address}
                      onChange={(e) => setCompanyInfo((c) => ({ ...c, address: e.target.value }))}
                      placeholder={companyInfo.country === "BE" ? "Rue de la Loi 1, 1000 Bruxelles" : "12 rue des Acacias, 59000 Lille"}
                      className={inputCls}
                    />
                  </Field>

                  {/* Spécialité(s) du métier : multi-sélection. La 1re cochée
                      devient la principale (aiguille les agents et les réponses). */}
                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[#8B8B96]">
                      {t("Votre métier", "Your trade")}
                      <span className="ml-1.5 font-medium normal-case tracking-normal text-[#9A9A97]">
                        {t("(plusieurs possibles — la 1re est la principale)", "(several possible — the first is primary)")}
                      </span>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {METIERS.map((m) => {
                        const idx = sectors.indexOf(m.id);
                        const active = idx !== -1;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => toggleSector(m.id)}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-all active:scale-[0.97] ${
                              active
                                ? "border-[#7C3AED] bg-[#F3EFFC] text-[#0A0A0A]"
                                : "border-[#E7E7E4] bg-white text-[#3A3A46] hover:border-[#C9BEF0]"
                            }`}
                          >
                            <span className="text-[14px] leading-none">{m.emoji}</span>
                            {m.label}
                            {active && idx === 0 && (
                              <span className="rounded-full bg-[#7C3AED] px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                                {t("Principale", "Primary")}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <button
                    onClick={saveCompany}
                    disabled={savingCompany}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#0A0A0A] text-white text-[13.5px] font-semibold px-4 py-2.5 hover:opacity-90 disabled:opacity-50 transition-opacity"
                  >
                    {savingCompany ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {t("Enregistrer", "Save")}
                  </button>
                </div>
              </Card>
            )}

            {/* ─── IDENTITÉ VISUELLE ──────────────────────────────────── */}
            {/* Ce qui part chez les clients : logo, couleurs et mentions des devis
                et factures. Pas de la décoration — la vitrine de l'entreprise. */}
            {section === "brand" && (
              <Card>
                <SectionTitle
                  title={t("Identité visuelle", "Visual identity")}
                  desc={t(
                    "Votre logo et votre couleur sur tout ce qui part chez vos clients : devis, factures, emails. Vos informations légales restent dans l'onglet Entreprise.",
                    "Your logo and color on everything sent to your clients: quotes, invoices, emails. Your legal details stay in the Company tab."
                  )}
                />
                <BrandSettings tenantId={tenantId} canEdit={roleCan("workspace.settings")} t={t} />
              </Card>
            )}

            {/* ─── ÉQUIPE ─────────────────────────────────────────────── */}
            {section === "team" && (
              <Card>
                <SectionTitle
                  title={t("Équipe", "Team")}
                  desc={t("Vos collaborateurs partagent le workspace (clients, chantiers, documents) et les applications.", "Your collaborators share the workspace (clients, job sites, documents) and the apps.")}
                />

                {teamLoading ? (
                  <div className="flex items-center justify-center py-10 text-[#9A9A97]">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-2 mb-5">
                    {team.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center gap-3 p-3.5 rounded-xl bg-[#FAFAFC] border border-[#EDEDF2]"
                      >
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center flex-shrink-0">
                          <span className="text-[13px] font-bold text-white">
                            {(m.full_name || m.email || "?")[0]?.toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] text-[#0A0A0A] truncate">
                            {m.full_name || m.email || t("Membre", "Member")}
                            {m.isYou && <span className="text-[#9A9A97]">{t(" · vous", " · you")}</span>}
                          </p>
                          <p className="text-[12px] text-[#9A9A97] truncate">{m.email}</p>
                          {/* Périmètre : relier l'employé à sa fiche → il ne voit que SES chantiers */}
                          {canManageTeam && m.role === "member" && employeeOptions.length > 0 && (
                            <div className="mt-1.5 flex items-center gap-1.5">
                              <span className="text-[11px] text-[#9A9A97] flex-shrink-0">{t("Fiche :", "Record:")}</span>
                              <select
                                value={m.employeeId ?? ""}
                                onChange={(e) => linkEmployee(m.user_id, e.target.value)}
                                disabled={linkingUser === m.user_id}
                                className="text-[12px] bg-white border border-[#EDEDF2] rounded-md px-1.5 py-0.5 text-[#0A0A0A] max-w-[220px] disabled:opacity-50"
                                title={t("Relier ce compte à une fiche employé pour limiter sa vue à ses chantiers", "Link this account to an employee record to limit their view to their job sites")}
                              >
                                <option value="">{t("— non reliée (voit tout) —", "— not linked (sees all) —")}</option>
                                {employeeOptions.map((e) => (
                                  <option key={e.id} value={e.id}>
                                    {[e.prenom, e.nom].filter(Boolean).join(" ") || t("Employé", "Employee")}
                                  </option>
                                ))}
                              </select>
                              {linkingUser === m.user_id && <Loader2 className="w-3 h-3 animate-spin text-[#9A9A97] flex-shrink-0" />}
                            </div>
                          )}
                        </div>
                        {!m.isYou && (
                          <span
                            className={`flex-shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full ${
                              m.accepted
                                ? "text-emerald-700 bg-emerald-50 border border-emerald-200"
                                : "text-amber-700 bg-amber-50 border border-amber-200"
                            }`}
                          >
                            {m.accepted ? t("Actif", "Active") : t("En attente", "Pending")}
                          </span>
                        )}
                        <span className="flex-shrink-0 text-[11px] font-semibold text-violet-700 bg-violet-50 border border-violet-200 px-2.5 py-1 rounded-full">
                          {roleLabel[m.role] ?? m.role}
                        </span>
                        {canManageTeam && !m.isYou && !m.accepted && (
                          <button
                            onClick={() => resendInvite(m.id)}
                            disabled={resendingId === m.id}
                            className="flex-shrink-0 p-1.5 text-[#9A9A97] hover:text-violet-600 rounded-lg hover:bg-violet-50 transition-colors disabled:opacity-50"
                            title={t("Renvoyer l'invitation", "Resend invitation")}
                          >
                            {resendingId === m.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <RefreshCw className="w-4 h-4" />
                            )}
                          </button>
                        )}
                        {canManageTeam && !m.isYou && m.role !== "owner" && (
                          <button
                            onClick={() => removeMember(m.id)}
                            disabled={removingId === m.id}
                            className="flex-shrink-0 p-1.5 text-[#9A9A97] hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors disabled:opacity-50"
                            title={t("Retirer de l'équipe", "Remove from team")}
                          >
                            {removingId === m.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        )}
                      </div>
                    ))}
                    {team.length === 0 && (
                      <p className="text-[13px] text-[#9A9A97] py-4 text-center">
                        {t("Vous êtes seul dans cet espace pour l'instant.", "You're alone in this workspace for now.")}
                      </p>
                    )}
                  </div>
                )}

                {canManageTeam ? (
                  <>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") inviteMember(); }}
                        type="email"
                        placeholder={t("collaborateur@entreprise.fr", "colleague@company.com")}
                        className={inputCls}
                      />
                      <Dropdown
                        value={inviteRole}
                        onChange={setInviteRole}
                        ariaLabel={t("Rôle du collaborateur", "Collaborator role")}
                        size="sm"
                        stacked
                        className="flex-shrink-0 sm:w-60"
                        options={[
                          { value: "member", label: t("Employé", "Employee"), hint: t("Utilise les apps, voit ses données", "Uses the apps, sees own data") },
                          { value: "manager", label: t("Manager", "Manager"), hint: t("Crée et gère les données", "Creates and manages data") },
                          { value: "admin", label: t("Admin", "Admin"), hint: t("Gère l'équipe et les réglages", "Manages team and settings") },
                          { value: "viewer", label: t("Lecture seule", "Read-only"), hint: t("Consulte, sans rien modifier", "Views only, no changes") },
                        ]}
                      />
                      <button
                        onClick={inviteMember}
                        disabled={inviting || !inviteEmail.trim()}
                        className="flex-shrink-0 inline-flex items-center justify-center gap-2 rounded-xl bg-[#0A0A0A] text-white text-[13.5px] font-semibold px-4 py-2.5 hover:opacity-90 disabled:opacity-50 transition-opacity"
                      >
                        {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                        {t("Inviter", "Invite")}
                      </button>
                    </div>
                    <p className="text-[12px] text-[#9A9A97] mt-3">
                      {t("S'il a déjà un compte Biltia, il rejoint votre espace immédiatement. Sinon, il reçoit une invitation par email pour créer son compte et vous rejoindre — sans carte, sans crédits à lui offrir.", "If they already have a Biltia account, they join your workspace immediately. Otherwise, they get an email invitation to create their account and join you — no card, no credits to gift them.")}
                    </p>
                  </>
                ) : (
                  <p className="text-[12px] text-[#9A9A97]">
                    {t("Seul le propriétaire ou un admin peut gérer l'équipe.", "Only the owner or an admin can manage the team.")}
                  </p>
                )}
              </Card>
            )}

            {/* ─── FACTURATION ────────────────────────────────────────── */}
            {section === "billing" && (
              <div className="space-y-5">
                <Card>
                  <SectionTitle title={t("Facturation", "Billing")} desc={t("Votre plan et votre consommation de crédits.", "Your plan and your credit usage.")} />
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3.5 rounded-xl bg-gradient-to-r from-violet-500/[0.08] to-pink-500/[0.05] border border-violet-200/60 mb-5">
                    <Zap className="w-4 h-4 text-violet-600 flex-shrink-0" />
                    <span className="text-sm text-[#0A0A0A] font-semibold tabular-nums">
                      {credits !== null ? t(`${credits.toLocaleString("fr-FR")} crédits disponibles`, `${credits.toLocaleString("en-US")} credits available`) : t("Chargement…", "Loading…")}
                    </span>
                    <span className="ml-auto text-[12px] text-[#9A9A97]">
                      {t(`Plan ${currentPlan.name}`, `${currentPlan.name} plan`)}
                      {sub?.current_period_end && currentPlanId !== "free"
                        ? t(` · renouv. ${new Date(sub.current_period_end).toLocaleDateString("fr-FR")}`, ` · renews ${new Date(sub.current_period_end).toLocaleDateString("en-US")}`)
                        : ""}
                    </span>
                  </div>

                  <label className="mb-1.5 block text-[12px] font-semibold text-[#4A4A56]">{t("Facturation", "Billing")}</label>
                  <div className="mb-4 inline-flex items-center gap-1 rounded-xl border border-[#E7E7EE] bg-white p-1">
                    {(["monthly", "annual"] as const).map((c) => (
                      <button
                        key={c}
                        onClick={() => setCycle(c)}
                        className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition-all ${cycle === c ? "bg-violet-600 text-white" : "text-[#6E6E6C] hover:text-[#0A0A0A]"}`}
                      >
                        {c === "monthly" ? t("Mensuel", "Monthly") : t("Annuel", "Annual")}
                        {c === "annual" && <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${cycle === "annual" ? "bg-white/20 text-white" : "bg-violet-100 text-violet-700"}`}>{t("-2 mois", "-2 months")}</span>}
                      </button>
                    ))}
                  </div>

                  <label className="mb-1.5 block text-[12px] font-semibold text-[#4A4A56]">{t("Crédits par mois", "Credits per month")}</label>
                  <Dropdown
                    value={String(selectedCredits)}
                    onChange={(v) => setSelectedCredits(Number(v))}
                    ariaLabel={t("Crédits par mois", "Credits per month")}
                    className="mb-4"
                    options={getPlan(selectedPlan).tiers.map((tier) => ({
                      value: String(tier.credits),
                      label: t(`${tier.credits.toLocaleString("fr-FR")} crédits`, `${tier.credits.toLocaleString("en-US")} credits`),
                      hint: formatEur(tierDisplayMonthlyEur(tier, cycle)),
                    }))}
                  />

                  <div className="mb-5">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl font-black text-[#0A0A0A] tabular-nums tracking-[-0.02em]">
                        {selectedTier ? formatEur(tierDisplayMonthlyEur(selectedTier, cycle)) : "—"}
                      </span>
                      <span className="text-sm text-[#9A9A97]">{t("/mois", "/month")}</span>
                    </div>
                    {selectedTier && (
                      <p className="mt-1 text-[12px] text-[#9A9A97]">
                        {cycle === "annual"
                          ? t(`Soit ${formatEur(annualTotalEur(selectedTier.priceEur))} facturés une fois par an, 2 mois offerts.`, `That's ${formatEur(annualTotalEur(selectedTier.priceEur))} billed once a year, 2 months free.`)
                          : t("Passez à l'annuel pour économiser 2 mois.", "Switch to annual to save 2 months.")}
                      </p>
                    )}
                  </div>
                  <ul className="mb-6 space-y-2">
                    {localizePlan(getPlan(selectedPlan), locale).features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-[13px] text-[#0A0A0A]">
                        <Check className="h-3.5 w-3.5 flex-shrink-0 text-violet-600" strokeWidth={2.5} />
                        {f}
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={subscribe}
                    disabled={checkoutLoading || !selectedTier}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0A0A0A] py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {checkoutLoading
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("Redirection…", "Redirecting…")}</>
                      : <>{currentPlanId === "free" ? t("S'abonner", "Subscribe") : t("Changer d'offre", "Change plan")} <ArrowRight className="h-4 w-4" /></>}
                  </button>
                  <p className="text-xs text-[#9A9A97] mt-3 text-center">{t("Paiement via Stripe · Sans engagement · Résiliation à tout moment", "Payment via Stripe · No commitment · Cancel anytime")}</p>
                </Card>

                <Card>
                  <SectionTitle title={t("Recharger des crédits", "Top up credits")} desc={t("Un pack ponctuel qui s'ajoute à votre solde. Les crédits achetés ne périment jamais.", "A one-time pack added to your balance. Purchased credits never expire.")} />
                  <CreditPacksPanel showHeader={false} />
                </Card>

                <div className="space-y-3">
                  {Object.values(PLANS).map((planRaw) => {
                    const plan = localizePlan(planRaw, locale);
                    const isCurrent = plan.id === currentPlanId;
                    return (
                      <div key={plan.id} className={`flex items-center justify-between rounded-2xl border p-4 ${isCurrent ? "border-violet-400 bg-violet-50" : "border-[#E7E7E4] bg-white"}`}>
                        <div>
                          <div className="mb-0.5 flex items-center gap-2">
                            <span className="font-bold text-[#0A0A0A]">{plan.name}</span>
                            {isCurrent && <span className="rounded-full border border-violet-200 bg-white px-2 py-0.5 text-xs font-semibold text-violet-700">{t("Actuel", "Current")}</span>}
                          </div>
                          <p className="text-xs text-[#9A9A97]">{plan.tagline}</p>
                        </div>
                        {isCurrent && <CheckCircle className="h-5 w-5 text-violet-600" />}
                      </div>
                    );
                  })}
                </div>

                <div className="rounded-2xl border border-dashed border-[#E7E7E4] p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[13.5px] font-medium text-[#0A0A0A]">{t("Historique, factures & carte bancaire", "History, invoices & payment card")}</p>
                    <p className="text-[12px] text-[#9A9A97] mt-0.5">{t("Géré via le portail sécurisé Stripe.", "Managed via the secure Stripe portal.")}</p>
                  </div>
                  <a href="https://billing.stripe.com/p/login" target="_blank" rel="noopener noreferrer" className="flex-shrink-0 rounded-full border border-[#E7E7E4] px-3.5 py-1.5 text-[12px] font-semibold text-[#0A0A0A] hover:border-[#C9BEF0] transition-colors">{t("Ouvrir le portail", "Open the portal")}</a>
                </div>
              </div>
            )}

            {/* ─── IA ─────────────────────────────────────────────────── */}
            {section === "ai" && (
              <div className="space-y-5">
                <Card>
                  <SectionTitle title={t("Préférences IA", "AI preferences")} desc={t("Ces réglages changent réellement ce que Biltia génère.", "These settings actually change what Biltia generates.")} />
                  <div className="-my-1">
                    <PrefRow label={t("Toujours demander confirmation", "Always ask for confirmation")} desc={t("Avant toute action destructive dans vos applications.", "Before any destructive action in your apps.")} on={prefs.always_confirm} onToggle={() => togglePref("always_confirm")} />
                    <PrefRow label={t("Toujours prévoir un PDF", "Always include a PDF")} desc={t("Une sortie imprimable propre quand c'est pertinent.", "A clean printable output when relevant.")} on={prefs.always_pdf} onToggle={() => togglePref("always_pdf")} />
                    <PrefRow label={t("Notifications de l'IA", "AI notifications")} desc={t("Quand une tâche longue se termine.", "When a long task finishes.")} on={prefs.ai_notifications} onToggle={() => togglePref("ai_notifications")} />
                  </div>
                  <div className="mt-5">
                    <Field label={t("Ton des réponses", "Response tone")}>
                      <Dropdown
                        value={prefs.tone}
                        onChange={(v) => setTone(v as Tone)}
                        ariaLabel={t("Ton des réponses", "Response tone")}
                        size="sm"
                        options={TONE_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
                      />
                    </Field>
                  </div>
                  <p className="mt-5 flex items-center gap-2 text-[12px] text-[#9A9A97]">
                    {savingPrefs ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 text-emerald-500" strokeWidth={2.5} />}
                    {t("Enregistré automatiquement.", "Saved automatically.")}
                  </p>
                </Card>

                <Card>
                  <SectionTitle title={t("Base de connaissances (RAG)", "Knowledge base (RAG)")} desc={t("Le corpus métier qui garantit des réponses sans hallucination.", "The domain corpus that ensures answers without hallucination.")} />
                  <KnowledgeManager />
                </Card>
              </div>
            )}

            {/* ─── NOTIFICATIONS ──────────────────────────────────────── */}
            {section === "notifications" && (
              <Card>
                <SectionTitle title={t("Notifications", "Notifications")} desc={t("Comment Biltia vous tient au courant.", "How Biltia keeps you posted.")} />
                <div className="-my-1">
                  {/* Push : réel (Web Push) */}
                  <div className="flex items-center justify-between gap-4 py-3.5 border-b border-[#F1F1EC]">
                    <div className="min-w-0">
                      <p className="text-[14px] text-[#0A0A0A]">Push</p>
                      <p className="text-[12px] text-[#9A9A97] mt-0.5">
                        {pushSupported
                          ? t("Notifications sur cet appareil (ex : votre application est prête).", "Notifications on this device (e.g. your app is ready).")
                          : t("Non supporté par ce navigateur.", "Not supported by this browser.")}
                      </p>
                    </div>
                    {pushBusy ? (
                      <Loader2 className="w-5 h-5 animate-spin text-violet-500 flex-shrink-0" />
                    ) : (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={pushEnabled}
                        disabled={!pushSupported}
                        onClick={togglePush}
                        className={`w-10 h-6 rounded-full flex items-center px-0.5 flex-shrink-0 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${pushEnabled ? "bg-violet-500" : "bg-black/[0.12]"}`}
                      >
                        <span className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${pushEnabled ? "translate-x-4" : ""}`} />
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-[11px] text-[#9A9A97] mt-4">
                  {t("Astuce : installez Biltia sur votre écran d'accueil (PWA) pour recevoir les notifications même l'application fermée. Les notifications de fin de tâche IA se règlent dans l'onglet IA.", "Tip: install Biltia on your home screen (PWA) to get notifications even when the app is closed. AI task-completion notifications are set in the AI tab.")}
                </p>
              </Card>
            )}

            {/* ─── SÉCURITÉ ───────────────────────────────────────────── */}
            {section === "security" && (
              <Card>
                <SectionTitle title={t("Sécurité", "Security")} desc={t("Protégez l'accès à votre espace.", "Protect access to your workspace.")} />

                {/* 2FA TOTP réelle (Supabase MFA) */}
                <div className="rounded-xl border border-[#EDEDF2] bg-white p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[14px] font-medium text-[#0A0A0A]">{t("Double authentification (2FA)", "Two-factor authentication (2FA)")}</p>
                      <p className="text-[12px] text-[#9A9A97] mt-0.5">
                        {t("Un code à 6 chiffres depuis une application (Google Authenticator, 1Password…), demandé à chaque connexion.", "A 6-digit code from an app (Google Authenticator, 1Password…), required at each sign-in.")}
                      </p>
                    </div>
                    {mfaFactors.some((f) => f.status === "verified") ? (
                      <button
                        onClick={() => disableMfa(mfaFactors.find((f) => f.status === "verified")!.id)}
                        disabled={mfaBusy}
                        className="flex-shrink-0 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-[12px] font-semibold text-rose-600 hover:bg-rose-100 transition-colors disabled:opacity-50"
                      >
                        {t("Désactiver", "Disable")}
                      </button>
                    ) : !mfaEnroll ? (
                      <button
                        onClick={startMfaEnroll}
                        disabled={mfaBusy}
                        className="flex-shrink-0 rounded-full bg-[#0A0A0A] px-3.5 py-1.5 text-[12px] font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                      >
                        {mfaBusy ? "…" : t("Activer", "Enable")}
                      </button>
                    ) : null}
                  </div>

                  {mfaEnroll && (
                    <div className="mt-4 border-t border-[#F1F1EC] pt-4">
                      <div className="flex flex-col sm:flex-row gap-4 items-start">
                        {/* QR code fourni par Supabase (data URL SVG) */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={mfaEnroll.qr} alt={t("QR code 2FA", "2FA QR code")} className="w-36 h-36 rounded-lg border border-[#EDEDF2] bg-white" />
                        <div className="min-w-0 flex-1 space-y-3">
                          <p className="text-[13px] text-[#4A4A56] leading-relaxed">
                            {t("1. Scannez ce QR code avec votre application d'authentification.", "1. Scan this QR code with your authenticator app.")}<br />
                            {t("2. Saisissez le code à 6 chiffres affiché pour confirmer.", "2. Enter the 6-digit code shown to confirm.")}
                          </p>
                          <p className="text-[11px] text-[#9A9A97] break-all">{t("Clé manuelle : ", "Manual key: ")}{mfaEnroll.secret}</p>
                          <div className="flex gap-2">
                            <input
                              value={mfaCode}
                              onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                              placeholder="123456"
                              inputMode="numeric"
                              className={`${inputCls} w-32 text-center tracking-[0.3em] font-bold`}
                            />
                            <button
                              onClick={verifyMfaEnroll}
                              disabled={mfaBusy || mfaCode.length < 6}
                              className="rounded-xl bg-[#0A0A0A] px-4 text-[13px] font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                            >
                              {t("Confirmer", "Confirm")}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-3 rounded-xl border border-[#EDEDF2] bg-white p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[14px] font-medium text-[#0A0A0A]">{t("Se déconnecter partout", "Sign out everywhere")}</p>
                    <p className="text-[12px] text-[#9A9A97] mt-0.5">{t("Révoque toutes les sessions, sur tous les appareils.", "Revokes all sessions, on every device.")}</p>
                  </div>
                  <button
                    onClick={signOutEverywhere}
                    className="flex-shrink-0 rounded-full border border-[#E7E7E4] bg-white px-3.5 py-1.5 text-[12px] font-semibold text-[#0A0A0A] hover:border-rose-300 hover:text-rose-600 transition-colors"
                  >
                    {t("Déconnecter", "Sign out")}
                  </button>
                </div>
              </Card>
            )}

            {/* ─── DONNÉES ────────────────────────────────────────────── */}
            {section === "data" && (
              <div className="space-y-5">
                <Card>
                  <SectionTitle title={t("Vos données", "Your data")} desc={t("Vous restez propriétaire de tout.", "You stay the owner of everything.")} />
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-4 rounded-xl border border-[#EDEDF2] bg-white p-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <Download className="w-4 h-4 text-[#6E6E6C] flex-shrink-0" />
                        <div>
                          <p className="text-[13.5px] font-medium text-[#0A0A0A]">{t("Exporter mes données", "Export my data")}</p>
                          <p className="text-[12px] text-[#9A9A97]">{t("Tout votre workspace (clients, chantiers, équipe…).", "Your whole workspace (clients, job sites, team…).")}</p>
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <a href="/api/export?entity=all&format=xlsx" className="rounded-full bg-[#0A0A0A] px-3.5 py-1.5 text-[12px] font-semibold text-white hover:opacity-90 transition-opacity">Excel</a>
                        <a href="/api/export?entity=all&format=csv" className="rounded-full border border-[#E7E7E4] px-3.5 py-1.5 text-[12px] font-semibold text-[#0A0A0A] hover:border-[#C9BEF0] transition-colors">CSV</a>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-4 rounded-xl border border-[#EDEDF2] bg-white p-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <Upload className="w-4 h-4 text-[#6E6E6C] flex-shrink-0" />
                        <div>
                          <p className="text-[13.5px] font-medium text-[#0A0A0A]">{t("Importer des données", "Import data")}</p>
                          <p className="text-[12px] text-[#9A9A97]">{t("CSV / Excel, avec correspondance automatique des colonnes.", "CSV / Excel, with automatic column matching.")}</p>
                        </div>
                      </div>
                      <a href="/workspace" className="flex-shrink-0 rounded-full border border-[#E7E7E4] px-3.5 py-1.5 text-[12px] font-semibold text-[#0A0A0A] hover:border-[#C9BEF0] transition-colors">
                        {t("Ouvrir l'import", "Open import")}
                      </a>
                    </div>
                  </div>
                </Card>

                <Card>
                  <SectionTitle
                    title={t("Cerveau collectif", "Collective brain")}
                    desc={t("Biltia apprend des bonnes pratiques anonymisées pour améliorer les suggestions de tous.", "Biltia learns from anonymized best practices to improve everyone's suggestions.")}
                  />
                  <div className="flex items-center justify-between gap-4 rounded-xl border border-[#EDEDF2] bg-white p-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <Sparkles className="w-4 h-4 text-violet-500 flex-shrink-0" />
                      <div>
                        <p className="text-[13.5px] font-medium text-[#0A0A0A]">{t("Contribuer au cerveau collectif", "Contribute to the collective brain")}</p>
                        <p className="text-[12px] text-[#9A9A97]">
                          {t("Uniquement des enseignements agrégés (jamais vos clients, montants ou documents). Publiés seulement quand un pattern se retrouve chez plusieurs entreprises.", "Only aggregated insights (never your clients, amounts or documents). Published only when a pattern is found across several companies.")}
                        </p>
                      </div>
                    </div>
                    <Switch
                      on={contributesToBrain}
                      onClick={() => toggleBrain(!contributesToBrain)}
                      disabled={savingBrain}
                      ariaLabel={t("Contribuer au cerveau collectif", "Contribute to the collective brain")}
                    />
                  </div>
                </Card>

                <Card>
                  <SectionTitle title={t("Zone de danger", "Danger zone")} />
                  <div className="flex items-center justify-between gap-4 rounded-xl border border-rose-200 bg-rose-50/50 p-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <Trash2 className="w-4 h-4 text-rose-500 flex-shrink-0" />
                      <div>
                        <p className="text-[13.5px] font-medium text-[#0A0A0A]">{t("Supprimer le compte", "Delete account")}</p>
                        <p className="text-[12px] text-[#9A9A97]">{t("Action définitive et irréversible.", "Permanent and irreversible action.")}</p>
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        // Le mot à taper est localisé, mais on envoie TOUJOURS "SUPPRIMER" au serveur (contrat API).
                        const confirmWord = t("SUPPRIMER", "DELETE");
                        const typed = prompt(t(`Cette action est DÉFINITIVE : compte, conversations et rapports supprimés.\n\nTapez ${confirmWord} pour confirmer :`, `This action is PERMANENT: account, conversations and reports deleted.\n\nType ${confirmWord} to confirm:`));
                        if (typed !== confirmWord) return;
                        const res = await fetch("/api/account", {
                          method: "DELETE",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ confirmation: "SUPPRIMER" }),
                        });
                        if (res.ok) {
                          window.location.href = "/";
                        } else {
                          const d = await res.json().catch(() => ({}));
                          setError(d.error ?? t("Suppression impossible. Contactez le support.", "Deletion failed. Contact support."));
                        }
                      }}
                      className="flex-shrink-0 rounded-full border border-rose-300 bg-white px-3.5 py-1.5 text-[12px] font-semibold text-rose-600 hover:bg-rose-50 transition-colors"
                    >
                      {t("Supprimer", "Delete")}
                    </button>
                  </div>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
