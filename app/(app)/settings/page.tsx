"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import {
  User,
  Building2,
  Users,
  CreditCard,
  Sparkles,
  Bell,
  Shield,
  Puzzle,
  Database,
  Zap,
  ArrowRight,
  CheckCircle,
  Check,
  ChevronDown,
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
  type PlanId,
} from "@/lib/plans";
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
// 9 sections. Câblé : Compte (nom, mot de passe), Entreprise (nom), Facturation.
// Le reste attend son schema / ses intégrations → marqué « Bientôt ».
// ─────────────────────────────────────────────────────────────────────────────

type SectionKey =
  | "account" | "company" | "team" | "billing"
  | "ai" | "notifications" | "security" | "integrations" | "data";

const SECTIONS: { key: SectionKey; label: string; icon: LucideIcon }[] = [
  { key: "account", label: "Mon compte", icon: User },
  { key: "company", label: "Entreprise", icon: Building2 },
  { key: "team", label: "Équipe", icon: Users },
  { key: "billing", label: "Facturation", icon: CreditCard },
  { key: "ai", label: "IA", icon: Sparkles },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "security", label: "Sécurité", icon: Shield },
  { key: "integrations", label: "Intégrations", icon: Puzzle },
  { key: "data", label: "Données", icon: Database },
];

// ─── Primitives ──────────────────────────────────────────────────────────────
function SoonBadge() {
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wide text-[#9A9A97] bg-black/[0.04] px-2 py-0.5 rounded-full">
      Bientôt
    </span>
  );
}

function SectionTitle({ title, desc, soon }: { title: string; desc?: string; soon?: boolean }) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2.5">
        <h2 className="text-lg font-bold text-[#0A0A0A] tracking-[-0.01em]">{title}</h2>
        {soon && <SoonBadge />}
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

function ToggleRow({ label, desc }: { label: string; desc?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5 border-b border-[#F1F1EC] last:border-0">
      <div className="min-w-0">
        <p className="text-[14px] text-[#0A0A0A]">{label}</p>
        {desc && <p className="text-[12px] text-[#9A9A97] mt-0.5">{desc}</p>}
      </div>
      <div className="w-10 h-6 rounded-full bg-black/[0.08] flex items-center px-0.5 flex-shrink-0 cursor-not-allowed" title="Bientôt">
        <div className="w-5 h-5 rounded-full bg-white shadow-sm" />
      </div>
    </div>
  );
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

  const [credits, setCredits] = useState<number | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Compte
  const [fullName, setFullName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);

  // Entreprise
  const [companyName, setCompanyName] = useState("");
  const [savingCompany, setSavingCompany] = useState(false);

  // Préférences IA
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [savingPrefs, setSavingPrefs] = useState(false);

  // Facturation
  type SubRow = { plan: PlanId; status: string; current_period_end: string | null };
  const [sub, setSub] = useState<SubRow | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<"pro" | "business">("pro");
  const [selectedCredits, setSelectedCredits] = useState<number>(getPlan("pro").defaultCredits ?? 400);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") { setNotice("Paiement confirmé. Votre abonnement sera actif d'ici quelques secondes."); setSection("billing"); }
    if (params.get("checkout") === "cancel") { setNotice("Paiement annulé. Aucun changement n'a été effectué."); setSection("billing"); }

    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      setEmail(user.email ?? "");

      supabase.from("user_credits").select("balance").eq("user_id", user.id).single()
        .then(({ data }) => { if (data) setCredits(data.balance); });

      supabase.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle()
        .then(({ data }) => { if (data?.full_name) setFullName(data.full_name); });

      // Préférences IA (best-effort — colonne absente → défauts).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as unknown as { from: (t: string) => any })
        .from("profiles").select("preferences").eq("user_id", user.id).maybeSingle()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .then(({ data }: any) => { if (data) setPrefs(normalizePreferences(data.preferences)); });

      const { data: membership } = await supabase
        .from("tenant_members")
        .select("tenant_id, role")
        .eq("user_id", user.id)
        .not("accepted_at", "is", null)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!membership?.tenant_id) return;
      setTenantId(membership.tenant_id);
      setRole(membership.role);

      const { data: tenant } = await supabase
        .from("tenants").select("name").eq("id", membership.tenant_id).maybeSingle();
      if (tenant?.name) setCompanyName(tenant.name);

      const { data: subRow } = await supabase
        .from("subscriptions").select("plan, status, current_period_end")
        .eq("tenant_id", membership.tenant_id).maybeSingle();
      if (subRow) setSub(subRow as unknown as SubRow);
    });
  }, []);

  const currentPlanId: PlanId = sub?.plan ?? "free";
  const currentPlan = getPlan(currentPlanId);
  const selectedTier = getTier(selectedPlan, selectedCredits);

  function flash(msg: string) { setError(null); setNotice(msg); }

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

  async function savePassword() {
    setError(null);
    if (newPwd.length < 8) { setError("Le mot de passe doit faire au moins 8 caractères."); return; }
    if (newPwd !== confirmPwd) { setError("Les mots de passe ne correspondent pas."); return; }
    setSavingPwd(true);
    try {
      const supabase = createClient();
      const { error: e } = await supabase.auth.updateUser({ password: newPwd });
      if (e) throw e;
      setNewPwd(""); setConfirmPwd("");
      flash("Mot de passe modifié.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de la modification.");
    }
    setSavingPwd(false);
  }

  async function saveCompany() {
    setError(null);
    if (!tenantId) { setError("Aucun espace de travail."); return; }
    setSavingCompany(true);
    try {
      const supabase = createClient();
      const { error: e } = await supabase.from("tenants").update({ name: companyName }).eq("id", tenantId);
      if (e) throw e;
      flash("Entreprise mise à jour.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec (droits insuffisants ?).");
    }
    setSavingCompany(false);
  }

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
      const { error: e } = await db
        .from("profiles")
        .upsert({ user_id: user.id, preferences: prefs }, { onConflict: "user_id" });
      if (e) throw e;
      flash("Préférences IA enregistrées.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec — la migration 009 est-elle appliquée ?");
    }
    setSavingPrefs(false);
  }

  function onPlanChange(plan: "pro" | "business") {
    setSelectedPlan(plan);
    if (!getTier(plan, selectedCredits)) setSelectedCredits(getPlan(plan).defaultCredits ?? 400);
  }

  async function subscribe() {
    setError(null); setCheckoutLoading(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: selectedPlan, credits: selectedCredits }),
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

  const INTEGRATIONS = [
    "Google Calendar", "Google Drive", "OneDrive", "Dropbox",
    "Outlook", "Zapier", "Make", "Pennylane", "Sage",
  ];

  return (
    <div className="min-h-full bg-[#FCFCFD]">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* En-tête */}
        <div className="flex items-center gap-3 mb-1.5">
          <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500/15 to-pink-500/10 flex items-center justify-center">
            <User className="w-5 h-5 text-violet-600" />
          </span>
          <h1 className="text-2xl font-black text-[#0A0A0A] tracking-[-0.03em]">Paramètres</h1>
        </div>
        <p className="text-[14px] text-[#6E6E6C] mb-6 ml-12">Vos préférences, pas de la technique.</p>

        <div className="flex flex-col md:flex-row gap-8">
          {/* Nav interne */}
          <nav className="md:w-56 flex-shrink-0">
            <div className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-2 md:pb-0 -mx-1 px-1 md:mx-0 md:px-0">
              {SECTIONS.map(({ key, label, icon: Icon }) => (
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
                    <div className="relative">
                      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center">
                        <span className="text-xl font-bold text-white">{(fullName || email || "?")[0]?.toUpperCase()}</span>
                      </div>
                      <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white border border-[#E7E7E4] flex items-center justify-center text-[#9A9A97]" title="Bientôt">
                        <Camera className="w-3 h-3" />
                      </span>
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
                    <Field label="Email" hint="Le changement d'email arrive bientôt.">
                      <input value={email} disabled className={inputCls} />
                    </Field>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <Field label="Téléphone"><input disabled placeholder="Bientôt" className={inputCls} /></Field>
                      <Field label="Langue">
                        <div className="relative">
                          <select disabled className={`${inputCls} appearance-none pr-9`}><option>Français</option></select>
                          <Globe className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#C9C9C4]" />
                        </div>
                      </Field>
                      <Field label="Fuseau">
                        <div className="relative">
                          <select disabled className={`${inputCls} appearance-none pr-9`}><option>Europe/Paris</option></select>
                          <Clock className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#C9C9C4]" />
                        </div>
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
                  <SectionTitle title="Mot de passe" desc="Choisissez un mot de passe d'au moins 8 caractères." />
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="Nouveau mot de passe">
                        <input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} placeholder="••••••••" className={inputCls} />
                      </Field>
                      <Field label="Confirmer">
                        <input type="password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} placeholder="••••••••" className={inputCls} />
                      </Field>
                    </div>
                    <button
                      onClick={savePassword}
                      disabled={savingPwd || !newPwd}
                      className="inline-flex items-center gap-2 rounded-xl bg-[#0A0A0A] text-white text-[13.5px] font-semibold px-4 py-2.5 hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                      {savingPwd ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                      Modifier le mot de passe
                    </button>
                  </div>
                </Card>
              </div>
            )}

            {/* ─── ENTREPRISE ─────────────────────────────────────────── */}
            {section === "company" && (
              <Card>
                <SectionTitle title="Entreprise" desc="Ces informations alimentent vos devis, factures et documents." />
                <div className="space-y-4">
                  <Field label="Nom de l'entreprise">
                    <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="BTP Dupont SARL" className={inputCls} />
                  </Field>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="N° TVA"><input disabled placeholder="Bientôt" className={inputCls} /></Field>
                    <Field label="SIRET"><input disabled placeholder="Bientôt" className={inputCls} /></Field>
                  </div>
                  <Field label="Adresse"><input disabled placeholder="Bientôt" className={inputCls} /></Field>
                  <div className="rounded-xl border border-dashed border-[#E7E7E4] p-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[13.5px] font-medium text-[#0A0A0A]">Logo, signature, tampon & couleurs</p>
                      <p className="text-[12px] text-[#9A9A97] mt-0.5">Pour personnaliser vos documents générés.</p>
                    </div>
                    <SoonBadge />
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
                <SectionTitle title="Équipe" desc="Invitez vos collaborateurs et gérez leurs rôles." soon />
                {role && (
                  <div className="flex items-center gap-3 p-3.5 rounded-xl bg-[#FAFAFC] border border-[#EDEDF2] mb-5">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center">
                      <span className="text-[13px] font-bold text-white">{(email || "?")[0]?.toUpperCase()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] text-[#0A0A0A] truncate">{email}</p>
                      <p className="text-[12px] text-[#9A9A97]">Vous · {roleLabel[role] ?? role}</p>
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <input disabled placeholder="collaborateur@entreprise.fr" className={inputCls} />
                  <button disabled className="flex-shrink-0 rounded-xl bg-black/[0.06] text-[#9A9A97] text-[13.5px] font-semibold px-4 py-2.5 cursor-not-allowed">Inviter</button>
                </div>
                <p className="text-[12px] text-[#9A9A97] mt-3">Rôles à venir : Admin, Manager, Employé.</p>
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
                      {credits !== null ? `${credits} crédits disponibles` : "Chargement…"}
                    </span>
                    <span className="ml-auto text-[12px] text-[#9A9A97]">
                      Plan {currentPlan.name}
                      {sub?.current_period_end && currentPlanId !== "free"
                        ? ` · renouv. ${new Date(sub.current_period_end).toLocaleDateString("fr-FR")}`
                        : ""}
                    </span>
                  </div>

                  {/* Onglets Pro / Business */}
                  <div className="flex gap-2 mb-5">
                    {(["pro", "business"] as const).map((p) => (
                      <button
                        key={p}
                        onClick={() => onPlanChange(p)}
                        className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all ${
                          selectedPlan === p
                            ? "border-violet-400 bg-violet-50 text-violet-700"
                            : "border-[#E7E7E4] bg-white text-[#6E6E6C] hover:text-[#0A0A0A]"
                        }`}
                      >
                        {PLANS[p].name}
                      </button>
                    ))}
                  </div>

                  <label className="mb-1.5 block text-[12px] font-semibold text-[#4A4A56]">Crédits par mois</label>
                  <div className="relative mb-4">
                    <select
                      value={selectedCredits}
                      onChange={(e) => setSelectedCredits(Number(e.target.value))}
                      className={`${inputCls} appearance-none pr-9 cursor-pointer font-semibold`}
                    >
                      {getPlan(selectedPlan).tiers.map((t) => (
                        <option key={t.credits} value={t.credits}>{t.credits.toLocaleString("fr-FR")} crédits</option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9A9A97]" />
                  </div>

                  <div className="mb-5 flex items-baseline gap-1.5">
                    <span className="text-3xl font-black text-[#0A0A0A] tabular-nums tracking-[-0.02em]">
                      {selectedTier ? formatEur(selectedTier.priceEur) : "—"}
                    </span>
                    <span className="text-sm text-[#9A9A97]">/mois</span>
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
                    <p className="text-[12px] text-[#9A9A97] mt-0.5">Géré via le portail Stripe.</p>
                  </div>
                  <SoonBadge />
                </div>
              </div>
            )}

            {/* ─── IA ─────────────────────────────────────────────────── */}
            {section === "ai" && (
              <div className="space-y-5">
                <Card>
                  <SectionTitle title="Préférences IA" desc="Ces réglages changent réellement ce que Batify génère." />
                  <div className="-my-1">
                    <PrefRow label="Toujours demander confirmation" desc="Avant toute action destructive dans vos applications." on={prefs.always_confirm} onToggle={() => togglePref("always_confirm")} />
                    <PrefRow label="Toujours prévoir un PDF" desc="Une sortie imprimable propre quand c'est pertinent." on={prefs.always_pdf} onToggle={() => togglePref("always_pdf")} />
                    <PrefRow label="Privilégier une application" desc="Plutôt qu'un simple document ponctuel." on={prefs.prefer_app} onToggle={() => togglePref("prefer_app")} />
                    <PrefRow label="Notifications de l'IA" desc="Quand une tâche longue se termine." on={prefs.ai_notifications} onToggle={() => togglePref("ai_notifications")} />
                  </div>
                  <div className="mt-5">
                    <Field label="Ton des réponses">
                      <div className="relative">
                        <select
                          value={prefs.tone}
                          onChange={(e) => setPrefs((p) => ({ ...p, tone: e.target.value as Tone }))}
                          className={`${inputCls} appearance-none pr-9 cursor-pointer`}
                        >
                          {TONE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9A9A97]" />
                      </div>
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
                <SectionTitle title="Notifications" desc="Comment Batify vous tient au courant." soon />
                <div className="-my-1">
                  <ToggleRow label="Email" desc="Résumés et alertes par email." />
                  <ToggleRow label="Push" desc="Notifications sur cet appareil." />
                  <ToggleRow label="SMS" desc="Pour les alertes urgentes." />
                  <ToggleRow label="Rapports périodiques" desc="Un récapitulatif hebdomadaire." />
                  <ToggleRow label="Relances automatiques" desc="Devis et factures en attente." />
                </div>
              </Card>
            )}

            {/* ─── SÉCURITÉ ───────────────────────────────────────────── */}
            {section === "security" && (
              <Card>
                <SectionTitle title="Sécurité" desc="Protégez l'accès à votre espace." soon />
                <div className="-my-1">
                  <ToggleRow label="Double authentification (2FA)" desc="Un code en plus du mot de passe." />
                </div>
                <div className="mt-4 space-y-2">
                  <div className="rounded-xl border border-[#EDEDF2] bg-[#FAFAFC] p-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[13.5px] font-medium text-[#0A0A0A]">Sessions & appareils connectés</p>
                      <p className="text-[12px] text-[#9A9A97] mt-0.5">Voir et déconnecter les appareils.</p>
                    </div>
                    <SoonBadge />
                  </div>
                </div>
              </Card>
            )}

            {/* ─── INTÉGRATIONS ───────────────────────────────────────── */}
            {section === "integrations" && (
              <Card>
                <SectionTitle title="Intégrations" desc="Connectez vos outils du quotidien." soon />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {INTEGRATIONS.map((name) => (
                    <div key={name} className="flex items-center justify-between gap-3 rounded-xl border border-[#EDEDF2] bg-white p-3.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-8 h-8 rounded-lg bg-black/[0.04] flex items-center justify-center flex-shrink-0">
                          <Puzzle className="w-4 h-4 text-[#9A9A97]" />
                        </span>
                        <span className="text-[13.5px] text-[#0A0A0A] truncate">{name}</span>
                      </div>
                      <button disabled className="text-[12px] font-semibold text-[#9A9A97] bg-black/[0.04] px-3 py-1.5 rounded-full cursor-not-allowed flex-shrink-0">Connecter</button>
                    </div>
                  ))}
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
                          <p className="text-[12px] text-[#9A9A97]">Tout votre workspace en un fichier.</p>
                        </div>
                      </div>
                      <SoonBadge />
                    </div>
                    <div className="flex items-center justify-between gap-4 rounded-xl border border-[#EDEDF2] bg-white p-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <Upload className="w-4 h-4 text-[#6E6E6C] flex-shrink-0" />
                        <div>
                          <p className="text-[13.5px] font-medium text-[#0A0A0A]">Importer des données</p>
                          <p className="text-[12px] text-[#9A9A97]">Depuis un tableur ou un autre outil.</p>
                        </div>
                      </div>
                      <SoonBadge />
                    </div>
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
                    <SoonBadge />
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
