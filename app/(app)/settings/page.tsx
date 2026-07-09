"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { getActiveMembership } from "@/lib/tenant";
import { useRole } from "@/lib/use-role";
import { Dropdown } from "@/components/dropdown";
import { COUNTRIES, normalizeCountry } from "@/lib/countries";
import { CATEGORIES } from "@/lib/btp-catalog";

// Métiers éditables en paramètres (mêmes catégories qu'à l'onboarding) +
// « Autre » pour couvrir le multi-services. Multi-sélection : un artisan peut
// être électricien ET chauffagiste.
const METIERS = [
  ...CATEGORIES.map((c) => ({ id: c.id, label: c.label, emoji: c.emoji })),
  { id: "autre", label: "Autre / Multi-services", emoji: "🧰" },
];
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
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  PLANS,
  getPlan,
  getTier,
  formatEur,
  tierDisplayMonthlyEur,
  annualTotalEur,
  type BillingCycle,
  type PlanId,
} from "@/lib/plans";
import { CreditPacksPanel } from "@/components/credit-packs";
import KnowledgeManager from "@/components/knowledge-manager";
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
  | "account" | "company" | "team" | "billing"
  | "ai" | "notifications" | "security" | "data";

// Les intégrations ont leur propre page (sidebar → /connectors).
const SECTIONS: { key: SectionKey; label: string; icon: LucideIcon }[] = [
  { key: "account", label: "Mon compte", icon: User },
  { key: "company", label: "Entreprise", icon: Building2 },
  { key: "team", label: "Équipe", icon: Users },
  { key: "billing", label: "Facturation", icon: CreditCard },
  { key: "ai", label: "IA", icon: Sparkles },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "security", label: "Sécurité", icon: Shield },
  { key: "data", label: "Données", icon: Database },
];

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

function Switch({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      className={`w-10 h-6 rounded-full flex items-center px-0.5 flex-shrink-0 transition-colors ${on ? "bg-violet-500" : "bg-black/[0.12]"}`}
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
  };
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [canManageTeam, setCanManageTeam] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

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
    if (params.get("section") === "billing" || params.get("upgrade") === "1") setSection("billing");
    if (params.get("checkout") === "success") { setNotice("Paiement confirmé. Votre abonnement sera actif d'ici quelques secondes."); setSection("billing"); }
    if (params.get("checkout") === "cancel") { setNotice("Paiement annulé. Aucun changement n'a été effectué."); setSection("billing"); }

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
  const currentPlan = getPlan(currentPlanId);
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
      if (!res.ok) throw new Error(data.error ?? "Invitation impossible.");
      setTeam((t) => [...t, data.member]);
      setInviteEmail("");
      flash(
        data.invited
          ? `Invitation envoyée à ${data.member.email} : il la reçoit par email, clique, choisit son mot de passe et rejoint l'équipe (sans confirmation).`
          : `${data.member.email} a rejoint votre équipe.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invitation impossible.");
    }
    setInviting(false);
  }

  async function removeMember(memberId: string) {
    // Confirmation anti-fausse-manip : on nomme la personne concernée.
    const target = team.find((m) => m.id === memberId);
    const label = target?.full_name || target?.email || "ce collaborateur";
    if (!window.confirm(`Retirer ${label} de l'équipe ?\n\nIl perdra immédiatement l'accès à cet espace de travail.`)) {
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
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Retrait impossible.");
      setTeam((t) => t.filter((m) => m.id !== memberId));
      flash("Membre retiré de l'équipe.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retrait impossible.");
    }
    setRemovingId(null);
  }

  async function saveName() {
    setError(null); setSavingName(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Session expirée.");
      const { error: e1 } = await supabase
        .from("profiles")
        .upsert({ user_id: user.id, full_name: fullName }, { onConflict: "user_id" });
      if (e1) throw e1;
      await supabase.auth.updateUser({ data: { full_name: fullName } });
      flash("Nom mis à jour.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'enregistrement.");
    }
    setSavingName(false);
  }

  // Fiche entreprise : chargée depuis tenants.company_info.
  useEffect(() => {
    if (!tenantId) return;
    const supabase = createClient();
    supabase.from("tenants").select("company_info, contributes_to_brain").eq("id", tenantId).maybeSingle().then(({ data }) => {
      const ci = (data?.company_info ?? {}) as Record<string, string>;
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
      setError("Impossible de mettre à jour ce réglage.");
    } else {
      flash(next ? "Contribution au cerveau collectif activée." : "Contribution désactivée.");
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
      flash("Email envoyé. Ouvrez le lien reçu pour définir un nouveau mot de passe.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Envoi impossible. Réessayez.");
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
      setError(err instanceof Error ? err.message : "Activation impossible.");
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
      flash("Double authentification activée.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Code invalide. Réessayez.");
    }
    setMfaBusy(false);
  }

  async function disableMfa(factorId: string) {
    if (!confirm("Désactiver la double authentification ?")) return;
    setMfaBusy(true);
    try {
      const supabase = createClient();
      const { error: e } = await supabase.auth.mfa.unenroll({ factorId });
      if (e) throw e;
      setMfaFactors((prev) => prev.filter((f) => f.id !== factorId));
      flash("Double authentification désactivée.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de la désactivation.");
    }
    setMfaBusy(false);
  }

  async function signOutEverywhere() {
    if (!confirm("Se déconnecter de TOUS les appareils (y compris celui-ci) ?")) return;
    const supabase = createClient();
    await supabase.auth.signOut({ scope: "global" });
    window.location.href = "/login";
  }

  async function saveCompany() {
    setError(null);
    if (!tenantId) { setError("Aucun espace de travail."); return; }
    setSavingCompany(true);
    try {
      const supabase = createClient();
      const primarySector = sectors[0] ?? null;
      // tenants : nom + fiche (pays, TVA…) + spécialité principale/liste.
      const { error: e } = await supabase
        .from("tenants")
        .update({
          name: companyName,
          company_info: { ...companyInfo, sector: primarySector, sectors },
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

      flash("Entreprise mise à jour.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec (seuls Propriétaire et Admin peuvent modifier).");
    }
    setSavingCompany(false);
  }

  // Ajoute/retire une spécialité (la première cochée devient la principale).
  const toggleSector = (id: string) =>
    setSectors((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  type BoolPref = "always_confirm" | "always_pdf" | "prefer_app" | "ai_notifications";
  const togglePref = (k: BoolPref) => setPrefs((p) => ({ ...p, [k]: !p[k] }));

  async function savePrefs() {
    setError(null); setSavingPrefs(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Session expirée.");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as unknown as { from: (t: string) => any };
      // Fusion avec les préférences brutes existantes (pays, objectifs
      // d'onboarding…) : ne JAMAIS écraser ce que d'autres écrans ont stocké.
      const { data: prof } = await db
        .from("profiles").select("preferences").eq("user_id", user.id).maybeSingle();
      const raw = (prof?.preferences && typeof prof.preferences === "object" ? prof.preferences : {}) as Record<string, unknown>;
      const { error: e } = await db
        .from("profiles")
        .upsert({ user_id: user.id, preferences: { ...raw, ...prefs } }, { onConflict: "user_id" });
      if (e) throw e;
      flash("Préférences IA enregistrées.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec — la migration 009 est-elle appliquée ?");
    }
    setSavingPrefs(false);
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
      if (!reg) throw new Error("Service worker indisponible. Rechargez la page et réessayez.");
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
        flash("Notifications push désactivées sur cet appareil.");
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          throw new Error("Autorisez les notifications dans votre navigateur pour les activer.");
        }
        const cfg = await fetch("/api/push").then((r) => r.json());
        if (!cfg.enabled || !cfg.publicKey) {
          throw new Error("Notifications push non configurées côté serveur.");
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
              () => reject(new Error("Service de notifications injoignable. Vérifiez votre connexion et réessayez.")),
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
        if (!res.ok) throw new Error(data.error ?? "Activation impossible.");
        setPushEnabled(true);
        flash(
          data.testSent
            ? "Notifications activées — une notification de test vient d'arriver."
            : "Notifications activées sur cet appareil."
        );
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      // Erreurs navigateur brutes → messages compréhensibles.
      const friendly = /permission denied|incognito/i.test(raw)
        ? "Votre navigateur bloque les notifications (navigation privée ?). Ouvrez Biltia dans une fenêtre normale et réessayez."
        : /denied/i.test(raw)
        ? "Autorisez les notifications dans votre navigateur pour les activer."
        : raw || "Opération impossible.";
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
      setError(data.error ?? "Impossible de démarrer le paiement.");
    } catch {
      setError("Erreur réseau. Réessayez.");
    }
    setCheckoutLoading(false);
  }

  const roleLabel: Record<string, string> = {
    owner: "Propriétaire", admin: "Admin", manager: "Manager", member: "Employé", viewer: "Lecture seule",
  };

  return (
    <div className="min-h-full bg-[#FCFCFD]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* En-tête */}
        <div className="flex items-center gap-3 mb-1.5">
          <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500/15 to-pink-500/10 flex items-center justify-center flex-shrink-0">
            <User className="w-5 h-5 text-violet-600" />
          </span>
          <h1 className="text-xl sm:text-2xl font-black text-[#0A0A0A] tracking-[-0.03em]">Paramètres</h1>
        </div>
        <p className="text-[14px] text-[#6E6E6C] mb-6 ml-0 sm:ml-12">Vos préférences, pas de la technique.</p>

        <div className="flex flex-col md:flex-row gap-6 md:gap-8">
          {/* Nav interne */}
          <nav className="md:w-56 flex-shrink-0">
            <div className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-2 md:pb-0 -mx-1 px-1 md:mx-0 md:px-0">
              {SECTIONS.filter(
                (s) => s.key !== "billing" || roleLoading || roleCan("billing.manage")
              ).map(({ key, label, icon: Icon }) => (
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
                  {label}
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
                  <SectionTitle title="Mon compte" desc="Vos informations personnelles." />
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center">
                      <span className="text-xl font-bold text-white">{(fullName || email || "?")[0]?.toUpperCase()}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold text-[#0A0A0A] truncate">{fullName || email}</p>
                      <p className="text-[13px] text-[#9A9A97]">Plan {currentPlan.name}</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <Field label="Nom complet">
                      <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jean Dupont" className={inputCls} />
                    </Field>
                    <Field label="Email" hint="Votre identifiant de connexion. Pour le changer, contactez le support (protection anti-détournement).">
                      <input value={email} disabled className={inputCls} />
                    </Field>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="Langue">
                        <Dropdown value="fr" onChange={() => {}} ariaLabel="Langue" size="sm"
                          options={[{ value: "fr", label: "Français", icon: <Globe className="w-3.5 h-3.5 text-[#9A9A97]" /> }]} />
                      </Field>
                      <Field label="Fuseau">
                        <Dropdown value="paris" onChange={() => {}} ariaLabel="Fuseau horaire" size="sm"
                          options={[{ value: "paris", label: "Europe/Paris", icon: <Clock className="w-3.5 h-3.5 text-[#9A9A97]" /> }]} />
                      </Field>
                    </div>
                    <button
                      onClick={saveName}
                      disabled={savingName}
                      className="inline-flex items-center gap-2 rounded-xl bg-[#0A0A0A] text-white text-[13.5px] font-semibold px-4 py-2.5 hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                      {savingName ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Enregistrer
                    </button>
                  </div>
                </Card>

                <Card>
                  <SectionTitle
                    title="Mot de passe"
                    desc="Par sécurité, le changement passe par un lien envoyé à votre email — jamais directement depuis une session ouverte."
                  />
                  {resetSent ? (
                    <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                      <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <p className="text-sm text-emerald-700">
                        Lien envoyé à <b>{email}</b>. Ouvrez l&apos;email et suivez le lien pour définir votre nouveau mot de passe.
                      </p>
                    </div>
                  ) : (
                    <button
                      onClick={sendPasswordReset}
                      disabled={savingPwd}
                      className="inline-flex items-center gap-2 rounded-xl bg-[#0A0A0A] text-white text-[13.5px] font-semibold px-4 py-2.5 hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                      {savingPwd ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                      Recevoir le lien de réinitialisation
                    </button>
                  )}
                </Card>
              </div>
            )}

            {/* ─── ENTREPRISE ─────────────────────────────────────────── */}
            {section === "company" && (
              <Card>
                <SectionTitle title="Entreprise" desc="Ces informations alimentent vos devis, factures et documents." />
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Nom de l'entreprise">
                      <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="BTP Dupont SARL" className={inputCls} />
                    </Field>
                    <Field label="Pays">
                      <Dropdown
                        value={companyInfo.country}
                        onChange={(v) => setCompanyInfo((c) => ({ ...c, country: v }))}
                        ariaLabel="Pays de l'entreprise"
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
                    <Field label={companyInfo.country === "BE" ? "N° TVA (BE 0XXX.XXX.XXX)" : "N° TVA intracommunautaire"}>
                      <input
                        value={companyInfo.vat}
                        onChange={(e) => setCompanyInfo((c) => ({ ...c, vat: e.target.value }))}
                        placeholder={companyInfo.country === "BE" ? "BE 0123.456.789" : "FR 12 345678901"}
                        className={inputCls}
                      />
                    </Field>
                    <Field label={companyInfo.country === "BE" ? "N° d'entreprise (BCE)" : "SIRET"}>
                      <input
                        value={companyInfo.siret}
                        onChange={(e) => setCompanyInfo((c) => ({ ...c, siret: e.target.value }))}
                        placeholder={companyInfo.country === "BE" ? "0123.456.789" : "123 456 789 00012"}
                        className={inputCls}
                      />
                    </Field>
                  </div>
                  <Field label="Adresse">
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
                      Votre métier
                      <span className="ml-1.5 font-medium normal-case tracking-normal text-[#9A9A97]">
                        (plusieurs possibles — la 1re est la principale)
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
                                Principale
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
                    Enregistrer
                  </button>
                </div>
              </Card>
            )}

            {/* ─── ÉQUIPE ─────────────────────────────────────────────── */}
            {section === "team" && (
              <Card>
                <SectionTitle
                  title="Équipe"
                  desc="Vos collaborateurs partagent le workspace (clients, chantiers, documents) et les applications."
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
                            {m.full_name || m.email || "Membre"}
                            {m.isYou && <span className="text-[#9A9A97]"> · vous</span>}
                          </p>
                          <p className="text-[12px] text-[#9A9A97] truncate">{m.email}</p>
                        </div>
                        <span className="flex-shrink-0 text-[11px] font-semibold text-violet-700 bg-violet-50 border border-violet-200 px-2.5 py-1 rounded-full">
                          {roleLabel[m.role] ?? m.role}
                        </span>
                        {canManageTeam && !m.isYou && m.role !== "owner" && (
                          <button
                            onClick={() => removeMember(m.id)}
                            disabled={removingId === m.id}
                            className="flex-shrink-0 p-1.5 text-[#9A9A97] hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors disabled:opacity-50"
                            title="Retirer de l'équipe"
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
                        Vous êtes seul dans cet espace pour l&apos;instant.
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
                        placeholder="collaborateur@entreprise.fr"
                        className={inputCls}
                      />
                      <Dropdown
                        value={inviteRole}
                        onChange={setInviteRole}
                        ariaLabel="Rôle du collaborateur"
                        size="sm"
                        className="flex-shrink-0 sm:w-44"
                        options={[
                          { value: "member", label: "Employé", hint: "Utilise l'outil" },
                          { value: "manager", label: "Manager", hint: "Gère les données" },
                          { value: "admin", label: "Admin", hint: "Gère l'équipe" },
                          { value: "viewer", label: "Lecture seule", hint: "Consulte" },
                        ]}
                      />
                      <button
                        onClick={inviteMember}
                        disabled={inviting || !inviteEmail.trim()}
                        className="flex-shrink-0 inline-flex items-center justify-center gap-2 rounded-xl bg-[#0A0A0A] text-white text-[13.5px] font-semibold px-4 py-2.5 hover:opacity-90 disabled:opacity-50 transition-opacity"
                      >
                        {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                        Inviter
                      </button>
                    </div>
                    <p className="text-[12px] text-[#9A9A97] mt-3">
                      S&apos;il a déjà un compte Biltia, il rejoint votre espace immédiatement.
                      Sinon, il reçoit une invitation par email pour créer son compte et vous rejoindre — sans carte, sans crédits à lui offrir.
                    </p>
                  </>
                ) : (
                  <p className="text-[12px] text-[#9A9A97]">
                    Seul le propriétaire ou un admin peut gérer l&apos;équipe.
                  </p>
                )}
              </Card>
            )}

            {/* ─── FACTURATION ────────────────────────────────────────── */}
            {section === "billing" && (
              <div className="space-y-5">
                <Card>
                  <SectionTitle title="Facturation" desc="Votre plan et votre consommation de crédits." />
                  <div className="flex items-center gap-3 p-3.5 rounded-xl bg-gradient-to-r from-violet-500/[0.08] to-pink-500/[0.05] border border-violet-200/60 mb-5">
                    <Zap className="w-4 h-4 text-violet-600 flex-shrink-0" />
                    <span className="text-sm text-[#0A0A0A] font-semibold tabular-nums">
                      {credits !== null ? `${credits.toLocaleString("fr-FR")} crédits disponibles` : "Chargement…"}
                    </span>
                    <span className="ml-auto text-[12px] text-[#9A9A97]">
                      Plan {currentPlan.name}
                      {sub?.current_period_end && currentPlanId !== "free"
                        ? ` · renouv. ${new Date(sub.current_period_end).toLocaleDateString("fr-FR")}`
                        : ""}
                    </span>
                  </div>

                  <label className="mb-1.5 block text-[12px] font-semibold text-[#4A4A56]">Facturation</label>
                  <div className="mb-4 inline-flex items-center gap-1 rounded-xl border border-[#E7E7EE] bg-white p-1">
                    {(["monthly", "annual"] as const).map((c) => (
                      <button
                        key={c}
                        onClick={() => setCycle(c)}
                        className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition-all ${cycle === c ? "bg-violet-600 text-white" : "text-[#6E6E6C] hover:text-[#0A0A0A]"}`}
                      >
                        {c === "monthly" ? "Mensuel" : "Annuel"}
                        {c === "annual" && <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${cycle === "annual" ? "bg-white/20 text-white" : "bg-violet-100 text-violet-700"}`}>-2 mois</span>}
                      </button>
                    ))}
                  </div>

                  <label className="mb-1.5 block text-[12px] font-semibold text-[#4A4A56]">Crédits par mois</label>
                  <Dropdown
                    value={String(selectedCredits)}
                    onChange={(v) => setSelectedCredits(Number(v))}
                    ariaLabel="Crédits par mois"
                    className="mb-4"
                    options={getPlan(selectedPlan).tiers.map((t) => ({
                      value: String(t.credits),
                      label: `${t.credits.toLocaleString("fr-FR")} crédits`,
                      hint: formatEur(tierDisplayMonthlyEur(t, cycle)),
                    }))}
                  />

                  <div className="mb-5">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl font-black text-[#0A0A0A] tabular-nums tracking-[-0.02em]">
                        {selectedTier ? formatEur(tierDisplayMonthlyEur(selectedTier, cycle)) : "—"}
                      </span>
                      <span className="text-sm text-[#9A9A97]">/mois</span>
                    </div>
                    {selectedTier && (
                      <p className="mt-1 text-[12px] text-[#9A9A97]">
                        {cycle === "annual"
                          ? `Soit ${formatEur(annualTotalEur(selectedTier.priceEur))} facturés une fois par an, 2 mois offerts.`
                          : "Passez à l'annuel pour économiser 2 mois."}
                      </p>
                    )}
                  </div>
                  <ul className="mb-6 space-y-2">
                    {getPlan(selectedPlan).features.map((f) => (
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
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Redirection…</>
                      : <>{currentPlanId === "free" ? "S'abonner" : "Changer d'offre"} <ArrowRight className="h-4 w-4" /></>}
                  </button>
                  <p className="text-xs text-[#9A9A97] mt-3 text-center">Paiement via Stripe · Sans engagement · Résiliation à tout moment</p>
                </Card>

                <Card>
                  <SectionTitle title="Recharger des crédits" desc="Un pack ponctuel qui s'ajoute à votre solde. Les crédits achetés ne périment jamais." />
                  <CreditPacksPanel showHeader={false} />
                </Card>

                <div className="space-y-3">
                  {Object.values(PLANS).map((plan) => {
                    const isCurrent = plan.id === currentPlanId;
                    return (
                      <div key={plan.id} className={`flex items-center justify-between rounded-2xl border p-4 ${isCurrent ? "border-violet-400 bg-violet-50" : "border-[#E7E7E4] bg-white"}`}>
                        <div>
                          <div className="mb-0.5 flex items-center gap-2">
                            <span className="font-bold text-[#0A0A0A]">{plan.name}</span>
                            {isCurrent && <span className="rounded-full border border-violet-200 bg-white px-2 py-0.5 text-xs font-semibold text-violet-700">Actuel</span>}
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
                    <p className="text-[13.5px] font-medium text-[#0A0A0A]">Historique, factures & carte bancaire</p>
                    <p className="text-[12px] text-[#9A9A97] mt-0.5">Géré via le portail sécurisé Stripe.</p>
                  </div>
                  <a href="https://billing.stripe.com/p/login" target="_blank" rel="noopener noreferrer" className="flex-shrink-0 rounded-full border border-[#E7E7E4] px-3.5 py-1.5 text-[12px] font-semibold text-[#0A0A0A] hover:border-[#C9BEF0] transition-colors">Ouvrir le portail</a>
                </div>
              </div>
            )}

            {/* ─── IA ─────────────────────────────────────────────────── */}
            {section === "ai" && (
              <div className="space-y-5">
                <Card>
                  <SectionTitle title="Préférences IA" desc="Ces réglages changent réellement ce que Biltia génère." />
                  <div className="-my-1">
                    <PrefRow label="Toujours demander confirmation" desc="Avant toute action destructive dans vos applications." on={prefs.always_confirm} onToggle={() => togglePref("always_confirm")} />
                    <PrefRow label="Toujours prévoir un PDF" desc="Une sortie imprimable propre quand c'est pertinent." on={prefs.always_pdf} onToggle={() => togglePref("always_pdf")} />
                    <PrefRow label="Privilégier une application" desc="Plutôt qu'un simple document ponctuel." on={prefs.prefer_app} onToggle={() => togglePref("prefer_app")} />
                    <PrefRow label="Notifications de l'IA" desc="Quand une tâche longue se termine." on={prefs.ai_notifications} onToggle={() => togglePref("ai_notifications")} />
                  </div>
                  <div className="mt-5">
                    <Field label="Ton des réponses">
                      <Dropdown
                        value={prefs.tone}
                        onChange={(v) => setPrefs((p) => ({ ...p, tone: v as Tone }))}
                        ariaLabel="Ton des réponses"
                        size="sm"
                        options={TONE_OPTIONS.map((t) => ({ value: t.value, label: t.label }))}
                      />
                    </Field>
                  </div>
                  <button
                    onClick={savePrefs}
                    disabled={savingPrefs}
                    className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#0A0A0A] text-white text-[13.5px] font-semibold px-4 py-2.5 hover:opacity-90 disabled:opacity-50 transition-opacity"
                  >
                    {savingPrefs ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Enregistrer les préférences
                  </button>
                </Card>

                <Card>
                  <SectionTitle title="Base de connaissances (RAG)" desc="Le corpus métier qui garantit des réponses sans hallucination." />
                  <KnowledgeManager />
                </Card>
              </div>
            )}

            {/* ─── NOTIFICATIONS ──────────────────────────────────────── */}
            {section === "notifications" && (
              <Card>
                <SectionTitle title="Notifications" desc="Comment Biltia vous tient au courant." />
                <div className="-my-1">
                  {/* Push : réel (Web Push) */}
                  <div className="flex items-center justify-between gap-4 py-3.5 border-b border-[#F1F1EC]">
                    <div className="min-w-0">
                      <p className="text-[14px] text-[#0A0A0A]">Push</p>
                      <p className="text-[12px] text-[#9A9A97] mt-0.5">
                        {pushSupported
                          ? "Notifications sur cet appareil (ex : votre application est prête)."
                          : "Non supporté par ce navigateur."}
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
                  Astuce : installez Biltia sur votre écran d&apos;accueil (PWA) pour recevoir les
                  notifications même l&apos;application fermée. Les notifications de fin de tâche IA
                  se règlent dans l&apos;onglet IA.
                </p>
              </Card>
            )}

            {/* ─── SÉCURITÉ ───────────────────────────────────────────── */}
            {section === "security" && (
              <Card>
                <SectionTitle title="Sécurité" desc="Protégez l'accès à votre espace." />

                {/* 2FA TOTP réelle (Supabase MFA) */}
                <div className="rounded-xl border border-[#EDEDF2] bg-white p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[14px] font-medium text-[#0A0A0A]">Double authentification (2FA)</p>
                      <p className="text-[12px] text-[#9A9A97] mt-0.5">
                        Un code à 6 chiffres depuis une application (Google Authenticator, 1Password…), demandé à chaque connexion.
                      </p>
                    </div>
                    {mfaFactors.some((f) => f.status === "verified") ? (
                      <button
                        onClick={() => disableMfa(mfaFactors.find((f) => f.status === "verified")!.id)}
                        disabled={mfaBusy}
                        className="flex-shrink-0 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-[12px] font-semibold text-rose-600 hover:bg-rose-100 transition-colors disabled:opacity-50"
                      >
                        Désactiver
                      </button>
                    ) : !mfaEnroll ? (
                      <button
                        onClick={startMfaEnroll}
                        disabled={mfaBusy}
                        className="flex-shrink-0 rounded-full bg-[#0A0A0A] px-3.5 py-1.5 text-[12px] font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                      >
                        {mfaBusy ? "…" : "Activer"}
                      </button>
                    ) : null}
                  </div>

                  {mfaEnroll && (
                    <div className="mt-4 border-t border-[#F1F1EC] pt-4">
                      <div className="flex flex-col sm:flex-row gap-4 items-start">
                        {/* QR code fourni par Supabase (data URL SVG) */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={mfaEnroll.qr} alt="QR code 2FA" className="w-36 h-36 rounded-lg border border-[#EDEDF2] bg-white" />
                        <div className="min-w-0 flex-1 space-y-3">
                          <p className="text-[13px] text-[#4A4A56] leading-relaxed">
                            1. Scannez ce QR code avec votre application d&apos;authentification.<br />
                            2. Saisissez le code à 6 chiffres affiché pour confirmer.
                          </p>
                          <p className="text-[11px] text-[#9A9A97] break-all">Clé manuelle : {mfaEnroll.secret}</p>
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
                              Confirmer
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-3 rounded-xl border border-[#EDEDF2] bg-white p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[14px] font-medium text-[#0A0A0A]">Se déconnecter partout</p>
                    <p className="text-[12px] text-[#9A9A97] mt-0.5">Révoque toutes les sessions, sur tous les appareils.</p>
                  </div>
                  <button
                    onClick={signOutEverywhere}
                    className="flex-shrink-0 rounded-full border border-[#E7E7E4] bg-white px-3.5 py-1.5 text-[12px] font-semibold text-[#0A0A0A] hover:border-rose-300 hover:text-rose-600 transition-colors"
                  >
                    Déconnecter
                  </button>
                </div>
              </Card>
            )}

            {/* ─── DONNÉES ────────────────────────────────────────────── */}
            {section === "data" && (
              <div className="space-y-5">
                <Card>
                  <SectionTitle title="Vos données" desc="Vous restez propriétaire de tout." />
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-4 rounded-xl border border-[#EDEDF2] bg-white p-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <Download className="w-4 h-4 text-[#6E6E6C] flex-shrink-0" />
                        <div>
                          <p className="text-[13.5px] font-medium text-[#0A0A0A]">Exporter mes données</p>
                          <p className="text-[12px] text-[#9A9A97]">Tout votre workspace (clients, chantiers, équipe…).</p>
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
                          <p className="text-[13.5px] font-medium text-[#0A0A0A]">Importer des données</p>
                          <p className="text-[12px] text-[#9A9A97]">CSV / Excel, avec correspondance automatique des colonnes.</p>
                        </div>
                      </div>
                      <a href="/workspace" className="flex-shrink-0 rounded-full border border-[#E7E7E4] px-3.5 py-1.5 text-[12px] font-semibold text-[#0A0A0A] hover:border-[#C9BEF0] transition-colors">
                        Ouvrir l&apos;import
                      </a>
                    </div>
                  </div>
                </Card>

                <Card>
                  <SectionTitle
                    title="Cerveau collectif"
                    desc="Biltia apprend des bonnes pratiques anonymisées pour améliorer les suggestions de tous."
                  />
                  <div className="flex items-center justify-between gap-4 rounded-xl border border-[#EDEDF2] bg-white p-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <Sparkles className="w-4 h-4 text-violet-500 flex-shrink-0" />
                      <div>
                        <p className="text-[13.5px] font-medium text-[#0A0A0A]">Contribuer au cerveau collectif</p>
                        <p className="text-[12px] text-[#9A9A97]">
                          Uniquement des enseignements agrégés (jamais vos clients, montants ou documents). Publiés seulement quand un pattern se retrouve chez plusieurs entreprises.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={contributesToBrain}
                      aria-label="Contribuer au cerveau collectif"
                      disabled={savingBrain}
                      onClick={() => toggleBrain(!contributesToBrain)}
                      className={`relative flex-shrink-0 h-6 w-11 rounded-full transition-colors disabled:opacity-50 ${
                        contributesToBrain ? "bg-violet-600" : "bg-[#D9D9D6]"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                          contributesToBrain ? "translate-x-[22px]" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>
                </Card>

                <Card>
                  <SectionTitle title="Zone de danger" />
                  <div className="flex items-center justify-between gap-4 rounded-xl border border-rose-200 bg-rose-50/50 p-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <Trash2 className="w-4 h-4 text-rose-500 flex-shrink-0" />
                      <div>
                        <p className="text-[13.5px] font-medium text-[#0A0A0A]">Supprimer le compte</p>
                        <p className="text-[12px] text-[#9A9A97]">Action définitive et irréversible.</p>
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        const typed = prompt("Cette action est DÉFINITIVE : compte, conversations et rapports supprimés.\n\nTapez SUPPRIMER pour confirmer :");
                        if (typed !== "SUPPRIMER") return;
                        const res = await fetch("/api/account", {
                          method: "DELETE",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ confirmation: typed }),
                        });
                        if (res.ok) {
                          window.location.href = "/";
                        } else {
                          const d = await res.json().catch(() => ({}));
                          setError(d.error ?? "Suppression impossible. Contactez le support.");
                        }
                      }}
                      className="flex-shrink-0 rounded-full border border-rose-300 bg-white px-3.5 py-1.5 text-[12px] font-semibold text-rose-600 hover:bg-rose-50 transition-colors"
                    >
                      Supprimer
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
