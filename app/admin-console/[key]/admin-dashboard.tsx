"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import {
  ShieldCheck,
  RefreshCw,
  LogOut,
  TrendingUp,
  Wallet,
  Coins,
  Cpu,
  Users,
  Boxes,
  Pencil,
  FileText,
  BarChart3,
  MessageSquare,
  Building2,
  Layers,
  Tag,
  FileSignature,
  Wrench,
  Briefcase,
  HelpCircle,
  Rocket,
  Timer,
  Activity,
  Repeat,
  AlertTriangle,
  Lock,
  GitBranch,
  Plug,
  Upload,
  Globe,
  Trophy,
} from "lucide-react";
import { AGENTS } from "@/lib/agents";
import { getSector } from "@/lib/sectors";

// ── Types (miroir de /api/admin/stats) ───────────────────────────────────────
type Bucket = { key: string; calls: number; inTok: number; outTok: number; costUsd: number; credits: number };
type Count = { key: string; count: number };
type Stats = {
  generatedAt: string;
  totals: {
    calls: number;
    costUsd: number;
    costEur: number;
    credits: number;
    revenueEur: number;
    marginPct: number | null;
    inputTokens: number;
    outputTokens: number;
    salePerCreditEur: number;
  };
  product: {
    users: number;
    tenants: number;
    apps: number;
    edits: number;
    documents: number;
    reports: number;
    conversations: number;
    outstandingCredits: number;
  };
  activation: { totalUsers: number; activatedUsers: number; activationRatePct: number | null; ttfvMedianHours: number | null };
  engagement: { dau: number; wau: number; mau: number; stickinessPct: number | null; returningUsers: number };
  iteration: { avgVersionsPerApp: number | null; appsHeavilyIterated: number; editToCreate: number | null };
  quality: { generationsFailed: number; creditsBlocked: number; failureRatePct: number | null };
  adoption: { knowledgeUploads: number; reports: number; connectors: number; deployedApps: number; publicApps: number; generatedDocuments: number };
  topConsumers: { label: string; credits: number; costUsd: number; calls: number }[];
  byModel: Bucket[];
  byAction: Bucket[];
  byDay: { day: string; costUsd: number; credits: number; calls: number }[];
  demand: {
    byRequestType: Count[];
    byKind: Count[];
    byAppType: Count[];
    byDocType: Count[];
    byAgent: Count[];
    bySector: Count[];
    byQuestionTopic: Count[];
  };
  recentQuestions: { topic: string; question: string; agent: string | null; createdAt: string | null }[];
  signupsByDay: { day: string; count: number }[];
  plans: { key: string; count: number }[];
  demographics: { byCountry: Count[]; bySector: Count[]; byHeadcount: Count[] };
  byCompanySize: {
    size: string;
    tenants: number;
    paying: number;
    payingRatePct: number;
    totalCredits: number;
    avgCreditsPerTenant: number;
  }[];
  activity: { action: string; entityType: string; description: string; createdAt: string }[];
};

// ── Formatage ─────────────────────────────────────────────────────────────────
const nf = new Intl.NumberFormat("fr-FR");
const eur = (n: number) => `${nf.format(Math.round(n * 100) / 100)} €`;
const usd = (n: number) => `$${(Math.round(n * 100) / 100).toFixed(2)}`;
const tok = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`);
const pct = (n: number | null) => (n == null ? "—" : `${n} %`);
const dur = (h: number | null) =>
  h == null ? "—" : h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} j`;
const ACTION_LABELS: Record<string, string> = {
  create_app: "Création d'app",
  edit_app: "Modification d'app",
  ask: "Question (copilote)",
  analyze: "Analyse de fichier",
  automate: "Automatisation",
  classify_kind: "Aiguillage (format)",
  route_agent: "Routage (métier)",
  clarify: "Questionnaire",
  knowledge_extract: "Extraction document",
};
const label = (k: string) => ACTION_LABELS[k] ?? k.replace(/^claude-/, "");
const KIND_LABELS: Record<string, string> = {
  module: "Application",
  document: "Document PDF",
  action: "Action / traitement",
  answer: "Question",
};
const prettySlug = (s: string) => {
  const t = s.replace(/_/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : s;
};
const agentLabel = (k: string) => (k in AGENTS ? AGENTS[k as keyof typeof AGENTS].label : k);
const sectorLabel = (k: string) => getSector(k)?.label ?? k;
const COUNTRY_LABELS: Record<string, string> = {
  FR: "🇫🇷 France", BE: "🇧🇪 Belgique", LU: "🇱🇺 Luxembourg", CH: "🇨🇭 Suisse",
  CA: "🇨🇦 Canada", AUTRE: "🌍 Autre pays", "—": "Non renseigné",
};
const countryLabel = (k: string) => COUNTRY_LABELS[k] ?? k;
const HEADCOUNT_LABELS: Record<string, string> = {
  solo: "Solo (1)", "2-5": "2 à 5", "6-10": "6 à 10", "11-20": "11 à 20",
  "20+": "20 et plus", inconnu: "Non renseigné",
};
const headcountLabel = (k: string) => HEADCOUNT_LABELS[k] ?? k;

// ── Briques UI (design app : cartes blanches, dégradé indigo→violet→rose) ─────
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-[#ECECF2] bg-white p-5 shadow-[0_4px_14px_rgba(60,40,120,0.08)] ${className}`}
    >
      {children}
    </div>
  );
}

function Kpi({
  icon,
  value,
  label,
  hint,
  accent = false,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <Card className={accent ? "bg-gradient-to-br from-indigo-500 via-violet-500 to-pink-500 border-0 text-white shadow-[0_10px_30px_rgba(139,92,246,0.35)]" : ""}>
      <div className={`mb-2 flex items-center gap-2 ${accent ? "text-white/80" : "text-[#6E6E6C]"}`}>
        {icon}
        <span className="text-xs uppercase tracking-wide">{label}</span>
      </div>
      <p className={`text-2xl font-black tabular-nums ${accent ? "text-white" : "text-[#0A0A0A]"}`}>{value}</p>
      {hint && <p className={`mt-1 text-xs ${accent ? "text-white/75" : "text-[#9A9AA6]"}`}>{hint}</p>}
    </Card>
  );
}

function CostBars({ title, rows }: { title: string; rows: Bucket[] }) {
  const max = Math.max(1, ...rows.map((r) => r.costUsd));
  return (
    <Card>
      <h3 className="mb-4 text-sm font-bold text-[#0A0A0A]">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-[#6E6E6C]">Aucune donnée.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.key}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="truncate text-xs font-medium text-[#0A0A0A]">{label(r.key)}</span>
                <span className="tabular-nums text-xs font-semibold text-[#0A0A0A]">{usd(r.costUsd)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[#F6F6F9]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500"
                  style={{ width: `${(r.costUsd / max) * 100}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] text-[#9A9AA6]">
                {r.calls} appel{r.calls > 1 ? "s" : ""} · {tok(r.inTok)} in / {tok(r.outTok)} out · {nf.format(r.credits)} crédits
              </p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function CountBars({
  title,
  icon,
  rows,
  label: fmt,
  empty,
}: {
  title: string;
  icon: React.ReactNode;
  rows: Count[];
  label: (k: string) => string;
  empty?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Card>
      <div className="mb-4 flex items-center gap-2">
        <span className="text-[#7C3AED]">{icon}</span>
        <h3 className="text-sm font-bold text-[#0A0A0A]">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-[#6E6E6C]">{empty ?? "Aucune donnée."}</p>
      ) : (
        <div className="space-y-2.5">
          {rows.slice(0, 12).map((r) => (
            <div key={r.key} className="flex items-center gap-3">
              <span className="w-36 flex-shrink-0 truncate text-xs text-[#0A0A0A]">{fmt(r.key)}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#F6F6F9]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500"
                  style={{ width: `${(r.count / max) * 100}%` }}
                />
              </div>
              <span className="w-8 text-right tabular-nums text-xs font-semibold text-[#0A0A0A]">{r.count}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function AdminDashboard({ email }: { email: string }) {
  const router = useRouter();
  const [data, setData] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/stats", { cache: "no-store" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Erreur");
      setData((await res.json()) as Stats);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const signOut = async () => {
    await createClient().auth.signOut();
    router.refresh();
  };

  const maxDayCost = Math.max(1, ...(data?.byDay ?? []).map((d) => d.costUsd));
  const maxSignup = Math.max(1, ...(data?.signupsByDay ?? []).map((d) => d.count));

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      {/* En-tête */}
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-pink-500 shadow-[0_8px_20px_rgba(139,92,246,0.4)]">
            <ShieldCheck className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-[-0.02em] text-[#0A0A0A]">Console Biltia</h1>
            <p className="text-xs text-[#9A9AA6]">
              {email}
              {data && ` · maj ${new Date(data.generatedAt).toLocaleTimeString("fr-FR")}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-[#ECECF2] bg-white px-3.5 py-2 text-sm font-semibold text-[#0A0A0A] transition-colors hover:bg-[#F6F6F9] disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualiser
          </button>
          <button
            onClick={signOut}
            className="flex items-center gap-2 rounded-xl border border-[#ECECF2] bg-white px-3.5 py-2 text-sm font-semibold text-[#6E6E6C] transition-colors hover:bg-[#F6F6F9]"
          >
            <LogOut className="h-4 w-4" /> Quitter
          </button>
        </div>
      </div>

      {loading && !data && <p className="text-sm text-[#6E6E6C]">Chargement des statistiques…</p>}
      {error && (
        <Card className="border-rose-100 bg-rose-50">
          <p className="text-sm text-rose-600">{error}</p>
        </Card>
      )}

      {data && (
        <>
          {/* KPIs marge / argent */}
          <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi
              accent
              icon={<TrendingUp className="h-4 w-4" />}
              value={data.totals.marginPct === null ? "—" : `${data.totals.marginPct} %`}
              label="Marge brute"
              hint={`sur ${eur(data.totals.revenueEur)} de valeur vendue`}
            />
            <Kpi
              icon={<Wallet className="h-4 w-4" />}
              value={eur(data.totals.revenueEur)}
              label="Revenu estimé"
              hint={`${nf.format(data.totals.credits)} crédits × ${data.totals.salePerCreditEur.toFixed(3)} €`}
            />
            <Kpi
              icon={<Coins className="h-4 w-4" />}
              value={usd(data.totals.costUsd)}
              label="Coût API réel"
              hint={`${eur(data.totals.costEur)} · ${data.totals.calls} appels`}
            />
            <Kpi
              icon={<Cpu className="h-4 w-4" />}
              value={`${tok(data.totals.inputTokens)} / ${tok(data.totals.outputTokens)}`}
              label="Tokens in / out"
              hint={`${nf.format(data.totals.credits)} crédits consommés`}
            />
          </div>

          {/* KPIs produit / users */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            <Kpi icon={<Users className="h-4 w-4" />} value={nf.format(data.product.users)} label="Comptes" />
            <Kpi icon={<Building2 className="h-4 w-4" />} value={nf.format(data.product.tenants)} label="Espaces" />
            <Kpi icon={<Boxes className="h-4 w-4" />} value={nf.format(data.product.apps)} label="Apps" />
            <Kpi icon={<Pencil className="h-4 w-4" />} value={nf.format(data.product.edits)} label="Versions" />
            <Kpi icon={<FileText className="h-4 w-4" />} value={nf.format(data.product.documents)} label="Documents" />
            <Kpi icon={<BarChart3 className="h-4 w-4" />} value={nf.format(data.product.reports)} label="Rapports" />
            <Kpi icon={<MessageSquare className="h-4 w-4" />} value={nf.format(data.product.conversations)} label="Convers." />
            <Kpi icon={<Coins className="h-4 w-4" />} value={nf.format(data.product.outstandingCredits)} label="Crédits actifs" />
          </div>

          {/* Activation & rétention */}
          <h2 className="mb-3 mt-2 text-[13px] font-black uppercase tracking-wide text-[#6E6E6C]">
            Activation & rétention
          </h2>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Kpi
              icon={<Rocket className="h-4 w-4" />}
              value={pct(data.activation.activationRatePct)}
              label="Activation"
              hint={`${data.activation.activatedUsers}/${data.activation.totalUsers} ont créé`}
            />
            <Kpi
              icon={<Timer className="h-4 w-4" />}
              value={dur(data.activation.ttfvMedianHours)}
              label="Time-to-value"
              hint="inscription → 1ʳᵉ app"
            />
            <Kpi icon={<Activity className="h-4 w-4" />} value={nf.format(data.engagement.wau)} label="Actifs 7j" />
            <Kpi icon={<Activity className="h-4 w-4" />} value={nf.format(data.engagement.mau)} label="Actifs 30j" />
            <Kpi
              icon={<TrendingUp className="h-4 w-4" />}
              value={pct(data.engagement.stickinessPct)}
              label="Stickiness"
              hint="7j / 30j"
            />
            <Kpi
              icon={<Repeat className="h-4 w-4" />}
              value={nf.format(data.engagement.returningUsers)}
              label="Récurrents"
              hint="actifs ≥ 2 jours"
            />
          </div>

          {/* Qualité & signaux business */}
          <h2 className="mb-3 mt-2 text-[13px] font-black uppercase tracking-wide text-[#6E6E6C]">
            Qualité & signaux business
          </h2>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi
              icon={<AlertTriangle className="h-4 w-4" />}
              value={pct(data.quality.failureRatePct)}
              label="Échecs génération"
              hint={`${nf.format(data.quality.generationsFailed)} raté(s)`}
            />
            <Kpi
              icon={<Lock className="h-4 w-4" />}
              value={nf.format(data.quality.creditsBlocked)}
              label="Crédits bloqués"
              hint="occasions d'upsell"
            />
            <Kpi
              icon={<GitBranch className="h-4 w-4" />}
              value={data.iteration.avgVersionsPerApp == null ? "—" : `${data.iteration.avgVersionsPerApp}`}
              label="Versions / app"
              hint={`${data.iteration.appsHeavilyIterated} app(s) > 3 versions`}
            />
            <Kpi
              icon={<Repeat className="h-4 w-4" />}
              value={data.iteration.editToCreate == null ? "—" : `${data.iteration.editToCreate}×`}
              label="Modif / création"
              hint="itérations par app"
            />
          </div>

          {/* Coûts par modèle / action */}
          <div className="mb-6 grid gap-4 md:grid-cols-2">
            <CostBars title="Coût par modèle" rows={data.byModel} />
            <CostBars title="Coût par tâche" rows={data.byAction} />
          </div>

          {/* Coût par jour */}
          <Card className="mb-6">
            <h3 className="mb-4 text-sm font-bold text-[#0A0A0A]">Coût API par jour</h3>
            {data.byDay.length === 0 ? (
              <p className="text-sm text-[#6E6E6C]">Aucune activité.</p>
            ) : (
              <div className="flex h-36 items-end gap-1.5">
                {data.byDay.map((d) => (
                  <div
                    key={d.day}
                    className="flex flex-1 flex-col items-center justify-end"
                    title={`${d.day} · ${usd(d.costUsd)} · ${d.calls} appels`}
                  >
                    <div
                      className="w-full rounded-t bg-gradient-to-t from-indigo-500 to-pink-400"
                      style={{ height: `${(d.costUsd / maxDayCost) * 100}%`, minHeight: "3px" }}
                    />
                    <span className="mt-1 text-[9px] text-[#B4B4BE]">{d.day.slice(5)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Ce que demandent les utilisateurs — le gisement produit / templates */}
          <h2 className="mb-3 mt-2 text-[13px] font-black uppercase tracking-wide text-[#6E6E6C]">
            Ce que demandent les utilisateurs
          </h2>
          <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <CountBars
              title="Type de demande"
              icon={<HelpCircle className="h-4 w-4" />}
              rows={data.demand.byRequestType}
              label={label}
              empty="Aucune requête."
            />
            <CountBars
              title="Application vs Document"
              icon={<Layers className="h-4 w-4" />}
              rows={data.demand.byKind}
              label={(k) => KIND_LABELS[k] ?? k}
            />
            <CountBars
              title="Type d'application"
              icon={<Tag className="h-4 w-4" />}
              rows={data.demand.byAppType}
              label={prettySlug}
              empty="Pas encore d'app typée."
            />
            <CountBars
              title="Type de document"
              icon={<FileSignature className="h-4 w-4" />}
              rows={data.demand.byDocType}
              label={prettySlug}
              empty="Pas encore de document."
            />
            <CountBars
              title="Par métier"
              icon={<Wrench className="h-4 w-4" />}
              rows={data.demand.byAgent}
              label={agentLabel}
            />
            <CountBars
              title="Par secteur client"
              icon={<Briefcase className="h-4 w-4" />}
              rows={data.demand.bySector}
              label={sectorLabel}
            />
            <CountBars
              title="Sujets des questions"
              icon={<HelpCircle className="h-4 w-4" />}
              rows={data.demand.byQuestionTopic}
              label={(k) => k}
              empty="Aucune question posée."
            />
          </div>

          {/* Questions récentes — repérer les besoins émergents (contenu / RAG) */}
          <Card className="mb-6">
            <div className="mb-4 flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-[#7C3AED]" />
              <h3 className="text-sm font-bold text-[#0A0A0A]">Questions récentes</h3>
            </div>
            {data.recentQuestions.length === 0 ? (
              <p className="text-sm text-[#6E6E6C]">Aucune question posée pour l&apos;instant.</p>
            ) : (
              <div className="divide-y divide-[#F0F0F4]">
                {data.recentQuestions.map((q, i) => (
                  <div key={i} className="flex items-start gap-3 py-2.5">
                    <span className="mt-0.5 flex-shrink-0 rounded-md bg-[#F6F6F9] px-1.5 py-0.5 text-[10px] font-semibold text-[#7C3AED]">
                      {q.topic}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-[#0A0A0A]">« {q.question} »</p>
                      <p className="text-[11px] text-[#9A9AA6]">
                        {q.agent ? `${agentLabel(q.agent)} · ` : ""}
                        {q.createdAt ? new Date(q.createdAt).toLocaleString("fr-FR") : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Adoption des fonctionnalités */}
          <h2 className="mb-3 mt-2 text-[13px] font-black uppercase tracking-wide text-[#6E6E6C]">
            Adoption des fonctionnalités
          </h2>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Kpi icon={<Upload className="h-4 w-4" />} value={nf.format(data.adoption.knowledgeUploads)} label="Docs RAG" />
            <Kpi icon={<BarChart3 className="h-4 w-4" />} value={nf.format(data.adoption.reports)} label="Rapports" />
            <Kpi icon={<Plug className="h-4 w-4" />} value={nf.format(data.adoption.connectors)} label="Connecteurs" />
            <Kpi icon={<Globe className="h-4 w-4" />} value={nf.format(data.adoption.deployedApps)} label="Apps déployées" />
            <Kpi icon={<Globe className="h-4 w-4" />} value={nf.format(data.adoption.publicApps)} label="Apps publiques" />
            <Kpi icon={<FileSignature className="h-4 w-4" />} value={nf.format(data.adoption.generatedDocuments)} label="Docs générés" />
          </div>

          {/* Profil clientèle — qui sont-ils (onboarding) et qui paie combien par TAILLE */}
          <h2 className="mb-3 mt-2 text-[13px] font-black uppercase tracking-wide text-[#6E6E6C]">
            Profil clientèle
          </h2>
          <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <CountBars
              title="Par pays"
              icon={<Globe className="h-4 w-4" />}
              rows={data.demographics.byCountry}
              label={countryLabel}
              empty="Aucun profil renseigné à l'onboarding."
            />
            <CountBars
              title="Par effectif"
              icon={<Users className="h-4 w-4" />}
              rows={data.demographics.byHeadcount}
              label={headcountLabel}
              empty="Aucun profil renseigné à l'onboarding."
            />
          </div>
          <Card className="mb-6">
            <div className="mb-4 flex items-center gap-2">
              <Users className="h-4 w-4 text-[#7C3AED]" />
              <h3 className="text-sm font-bold text-[#0A0A0A]">Payé &amp; crédits par taille d&apos;entreprise</h3>
            </div>
            {data.byCompanySize.length === 0 ? (
              <p className="text-sm text-[#6E6E6C]">Aucune entreprise avec un effectif renseigné.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-[#9A9AA6]">
                      <th className="pb-2 font-semibold">Effectif</th>
                      <th className="pb-2 text-right font-semibold">Entreprises</th>
                      <th className="pb-2 text-right font-semibold">Payantes</th>
                      <th className="pb-2 text-right font-semibold">Crédits / entreprise</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0F0F4]">
                    {data.byCompanySize.map((r) => (
                      <tr key={r.size}>
                        <td className="py-2.5 font-semibold text-[#0A0A0A]">{headcountLabel(r.size)}</td>
                        <td className="py-2.5 text-right tabular-nums text-[#0A0A0A]">{r.tenants}</td>
                        <td className="py-2.5 text-right tabular-nums text-[#6E6E6C]">
                          {r.paying} <span className="text-[#9A9AA6]">({r.payingRatePct} %)</span>
                        </td>
                        <td className="py-2.5 text-right font-semibold tabular-nums text-[#7C3AED]">
                          {nf.format(r.avgCreditsPerTenant)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Top consommateurs — repérer les comptes lourds (marge / conversion) */}
          <Card className="mb-6">
            <div className="mb-4 flex items-center gap-2">
              <Trophy className="h-4 w-4 text-[#7C3AED]" />
              <h3 className="text-sm font-bold text-[#0A0A0A]">Top consommateurs (crédits)</h3>
            </div>
            {data.topConsumers.length === 0 ? (
              <p className="text-sm text-[#6E6E6C]">Aucune donnée.</p>
            ) : (
              <div className="divide-y divide-[#F0F0F4]">
                {data.topConsumers.map((c, i) => (
                  <div key={i} className="flex items-center gap-3 py-2.5">
                    <span className="w-5 tabular-nums text-xs text-[#9A9AA6]">{i + 1}</span>
                    <span className="flex-1 truncate text-sm text-[#0A0A0A]">{c.label}</span>
                    <span className="hidden w-24 text-right text-xs text-[#9A9AA6] sm:block">{c.calls} appels</span>
                    <span className="w-20 text-right text-xs text-[#9A9AA6]">{usd(c.costUsd)}</span>
                    <span className="w-16 text-right text-sm font-semibold tabular-nums text-[#0A0A0A]">
                      {nf.format(c.credits)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Inscriptions + abonnements */}
            <Card>
              <h3 className="mb-4 text-sm font-bold text-[#0A0A0A]">Inscriptions par jour</h3>
              {data.signupsByDay.length === 0 ? (
                <p className="text-sm text-[#6E6E6C]">Aucune inscription.</p>
              ) : (
                <div className="mb-5 flex h-24 items-end gap-1.5">
                  {data.signupsByDay.map((d) => (
                    <div key={d.day} className="flex flex-1 flex-col items-center justify-end" title={`${d.day} · ${d.count}`}>
                      <div className="w-full rounded-t bg-[#7C3AED]/80" style={{ height: `${(d.count / maxSignup) * 100}%`, minHeight: "3px" }} />
                    </div>
                  ))}
                </div>
              )}
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-[#9A9AA6]">Abonnements</h4>
              {data.plans.length === 0 ? (
                <p className="text-sm text-[#6E6E6C]">Aucun abonnement payant.</p>
              ) : (
                <div className="space-y-1.5">
                  {data.plans.map((p) => (
                    <div key={p.key} className="flex items-center justify-between text-sm">
                      <span className="text-[#0A0A0A]">{p.key}</span>
                      <span className="tabular-nums font-semibold text-[#0A0A0A]">{p.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Flux d'activité */}
            <Card>
              <h3 className="mb-4 text-sm font-bold text-[#0A0A0A]">Activité récente</h3>
              {data.activity.length === 0 ? (
                <p className="text-sm text-[#6E6E6C]">Aucune activité journalisée.</p>
              ) : (
                <div className="divide-y divide-[#F0F0F4]">
                  {data.activity.map((a, i) => (
                    <div key={i} className="flex items-start gap-3 py-2.5">
                      <span className="mt-0.5 rounded-md bg-[#F6F6F9] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[#7C3AED]">
                        {a.action}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-[#0A0A0A]">{a.description}</p>
                        <p className="text-[11px] text-[#9A9AA6]">
                          {a.entityType} · {new Date(a.createdAt).toLocaleString("fr-FR")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <p className="mt-6 text-center text-[11px] text-[#B4B4BE]">
            Coûts calculés au prix réel des modèles ({usd(data.totals.costUsd)} sur {data.totals.calls} appels).
            Revenu et marge estimés au tarif Pro de base.
          </p>
        </>
      )}
    </div>
  );
}
