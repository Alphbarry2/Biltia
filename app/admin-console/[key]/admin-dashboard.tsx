"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase";
import {
  ShieldCheck, RefreshCw, LogOut, LayoutDashboard, Wallet, Coins, Users, Sparkles,
  TrendingUp, Cpu, Building2, Boxes, FileText, MessageSquare, Rocket, Timer, Activity,
  Repeat, AlertTriangle, Lock, GitBranch, Plug, Upload, Globe, Trophy, HelpCircle,
  Layers, Tag, FileSignature, Wrench, Briefcase, BarChart3,
} from "lucide-react";
import { AGENTS } from "@/lib/agents";
import { getSector } from "@/lib/sectors";
import {
  Card, Kpi, Tile, AreaChart, BarList, Donut, BlockTitle,
  nf, eur, usd, tok, pct, dur, type Point, type BarRow,
} from "./admin-ui";

// ── Type miroir de /api/admin/stats ──────────────────────────────────────────
type Bucket = { key: string; calls: number; inTok: number; outTok: number; costUsd: number; credits: number };
type Count = { key: string; count: number };
type Stats = {
  generatedAt: string;
  totals: {
    calls: number; costUsd: number; costEur: number; credits: number; revenueEur: number;
    marginPct: number | null; inputTokens: number; outputTokens: number; salePerCreditEur: number;
  };
  product: {
    users: number; tenants: number; apps: number; edits: number; documents: number;
    reports: number; conversations: number; outstandingCredits: number;
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
    byRequestType: Count[]; byKind: Count[]; byAppType: Count[]; byDocType: Count[];
    byAgent: Count[]; bySector: Count[]; byQuestionTopic: Count[];
  };
  recentQuestions: { topic: string; question: string; agent: string | null; createdAt: string | null }[];
  signupsByDay: { day: string; count: number }[];
  plans: { key: string; count: number }[];
  demographics: { byCountry: Count[]; bySector: Count[]; byHeadcount: Count[] };
  byCompanySize: { size: string; tenants: number; paying: number; payingRatePct: number; totalCredits: number; avgCreditsPerTenant: number }[];
  activity: { action: string; entityType: string; description: string; createdAt: string }[];
};

// ── Libellés ──────────────────────────────────────────────────────────────────
const ACTION_LABELS: Record<string, string> = {
  create_app: "Création d'app", edit_app: "Modification d'app", ask: "Question (copilote)",
  analyze: "Analyse de fichier", automate: "Automatisation", classify_kind: "Aiguillage (format)",
  route_agent: "Routage (métier)", clarify: "Questionnaire", knowledge_extract: "Extraction document",
};
const actionLabel = (k: string) => ACTION_LABELS[k] ?? k.replace(/^claude-/, "");
const KIND_LABELS: Record<string, string> = { module: "Application", document: "Document PDF", action: "Action / traitement", answer: "Question" };
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
  solo: "Solo (1)", "2-5": "2 à 5", "6-10": "6 à 10", "11-20": "11 à 20", "20+": "20 et plus", inconnu: "Non renseigné",
};
const headcountLabel = (k: string) => HEADCOUNT_LABELS[k] ?? k;

const toRows = (rows: Count[], fmt: (k: string) => string): BarRow[] => rows.map((r) => ({ label: fmt(r.key), value: r.count }));

// ── Sections ──────────────────────────────────────────────────────────────────
type SectionId = "overview" | "revenue" | "usage" | "clients" | "demand";
const NAV: { id: SectionId; label: string; icon: typeof LayoutDashboard; desc: string }[] = [
  { id: "overview", label: "Vue d'ensemble", icon: LayoutDashboard, desc: "L'essentiel en un coup d'œil : marge, argent, activité." },
  { id: "revenue", label: "Revenus", icon: Wallet, desc: "Revenu estimé, marge, abonnements et crédits par client." },
  { id: "usage", label: "Usage & coûts", icon: Coins, desc: "Coûts API réels par modèle, par tâche et dans le temps." },
  { id: "clients", label: "Clients & rétention", icon: Users, desc: "Activation, engagement et profil de la clientèle." },
  { id: "demand", label: "Demande produit", icon: Sparkles, desc: "Ce que demandent les utilisateurs et l'adoption." },
];

const costByDay = (d: Stats): Point[] => d.byDay.map((r) => ({ x: r.day.slice(5), y: r.costUsd, tip: `${r.calls} appel${r.calls > 1 ? "s" : ""}` }));
const revByDay = (d: Stats): Point[] => d.byDay.map((r) => ({ x: r.day.slice(5), y: r.credits * d.totals.salePerCreditEur, tip: `${nf.format(r.credits)} crédits` }));
const signupsPts = (d: Stats): Point[] => d.signupsByDay.map((r) => ({ x: r.day.slice(5), y: r.count, tip: r.day }));

function CompanySizeTable({ rows }: { rows: Stats["byCompanySize"] }) {
  if (!rows.length) return <p className="py-4 text-sm text-[#9A9AA6]">Aucune entreprise avec un effectif renseigné.</p>;
  return (
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
          {rows.map((r) => (
            <tr key={r.size}>
              <td className="py-2.5 font-semibold text-[#0A0A0A]">{headcountLabel(r.size)}</td>
              <td className="py-2.5 text-right tabular-nums text-[#0A0A0A]">{r.tenants}</td>
              <td className="py-2.5 text-right tabular-nums text-[#6E6E6C]">{r.paying} <span className="text-[#9A9AA6]">({r.payingRatePct} %)</span></td>
              <td className="py-2.5 text-right font-semibold tabular-nums text-[#7C3AED]">{nf.format(r.avgCreditsPerTenant)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TopConsumers({ rows, metric }: { rows: Stats["topConsumers"]; metric: "credits" | "cost" }) {
  if (!rows.length) return <p className="py-4 text-sm text-[#9A9AA6]">Aucune donnée.</p>;
  return (
    <div className="divide-y divide-[#F0F0F4]">
      {rows.map((c, i) => (
        <div key={i} className="flex items-center gap-3 py-2.5">
          <span className="w-5 tabular-nums text-xs text-[#9A9AA6]">{i + 1}</span>
          <span className="flex-1 truncate text-sm text-[#0A0A0A]">{c.label}</span>
          <span className="w-24 text-right text-xs text-[#9A9AA6]">{c.calls} appels</span>
          <span className="w-20 text-right text-sm font-semibold tabular-nums text-[#0A0A0A]">
            {metric === "credits" ? nf.format(c.credits) : usd(c.costUsd)}
          </span>
        </div>
      ))}
    </div>
  );
}

function ActivityFeed({ rows }: { rows: Stats["activity"] }) {
  if (!rows.length) return <p className="py-4 text-sm text-[#9A9AA6]">Aucune activité journalisée.</p>;
  return (
    <div className="divide-y divide-[#F0F0F4]">
      {rows.map((a, i) => (
        <div key={i} className="flex items-start gap-3 py-2.5">
          <span className="mt-0.5 rounded-md bg-[#F6F6F9] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[#7C3AED]">{a.action}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-[#0A0A0A]">{a.description}</p>
            <p className="text-[11px] text-[#9A9AA6]">{a.entityType} · {new Date(a.createdAt).toLocaleString("fr-FR")}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

const GRID4 = "grid grid-cols-2 gap-4 lg:grid-cols-4";
const GRID3 = "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3";

function Overview({ d }: { d: Stats }) {
  return (
    <div className="space-y-6">
      <div className={GRID4}>
        <Kpi accent icon={<TrendingUp className="h-4 w-4" />} value={pct(d.totals.marginPct)} label="Marge brute" hint={`sur ${eur(d.totals.revenueEur)} de valeur vendue`} />
        <Kpi icon={<Wallet className="h-4 w-4" />} value={eur(d.totals.revenueEur)} label="Revenu estimé" hint={`${nf.format(d.totals.credits)} crédits × ${d.totals.salePerCreditEur.toFixed(3)} €`} />
        <Kpi icon={<Coins className="h-4 w-4" />} value={usd(d.totals.costUsd)} label="Coût API réel" hint={`${eur(d.totals.costEur)} · ${d.totals.calls} appels`} />
        <Kpi icon={<Cpu className="h-4 w-4" />} value={`${tok(d.totals.inputTokens)} / ${tok(d.totals.outputTokens)}`} label="Tokens in / out" hint={`${nf.format(d.totals.credits)} crédits consommés`} />
      </div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        <Tile icon={<Users className="h-4 w-4" />} value={nf.format(d.product.users)} label="Comptes" />
        <Tile icon={<Building2 className="h-4 w-4" />} value={nf.format(d.product.tenants)} label="Espaces" />
        <Tile icon={<Boxes className="h-4 w-4" />} value={nf.format(d.product.apps)} label="Apps" />
        <Tile icon={<FileText className="h-4 w-4" />} value={nf.format(d.product.documents)} label="Documents" />
        <Tile icon={<MessageSquare className="h-4 w-4" />} value={nf.format(d.product.conversations)} label="Conversations" />
        <Tile icon={<Coins className="h-4 w-4" />} value={nf.format(d.product.outstandingCredits)} label="Crédits actifs" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5"><BlockTitle icon={<Coins className="h-4 w-4" />}>Coût API par jour</BlockTitle><AreaChart data={costByDay(d)} format={usd} color="#7C3AED" empty="Aucune activité facturée." /></Card>
        <Card className="p-5"><BlockTitle icon={<Wallet className="h-4 w-4" />}>Revenu estimé par jour</BlockTitle><AreaChart data={revByDay(d)} format={eur} color="#EC4899" empty="Aucun crédit consommé." /></Card>
      </div>
      <Card className="p-5"><BlockTitle icon={<Activity className="h-4 w-4" />}>Activité récente</BlockTitle><ActivityFeed rows={d.activity} /></Card>
    </div>
  );
}

function Revenue({ d }: { d: Stats }) {
  return (
    <div className="space-y-6">
      <div className={GRID4}>
        <Kpi accent icon={<Wallet className="h-4 w-4" />} value={eur(d.totals.revenueEur)} label="Revenu estimé" hint="crédits consommés × tarif Pro" />
        <Kpi icon={<TrendingUp className="h-4 w-4" />} value={pct(d.totals.marginPct)} label="Marge brute" hint={`coût API ${eur(d.totals.costEur)}`} />
        <Kpi icon={<Coins className="h-4 w-4" />} value={`${d.totals.salePerCreditEur.toFixed(3)} €`} label="Prix / crédit" hint="palier Pro de base" />
        <Kpi icon={<Coins className="h-4 w-4" />} value={nf.format(d.totals.credits)} label="Crédits vendus" hint="sur la fenêtre analysée" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5"><BlockTitle icon={<Wallet className="h-4 w-4" />}>Revenu estimé par jour</BlockTitle><AreaChart data={revByDay(d)} format={eur} color="#EC4899" empty="Aucun crédit consommé." /></Card>
        <Card className="p-5"><BlockTitle icon={<Layers className="h-4 w-4" />}>Répartition des abonnements</BlockTitle><Donut data={d.plans.map((p) => ({ label: p.key, value: p.count }))} empty="Aucun abonnement payant." /></Card>
      </div>
      <Card className="p-5"><BlockTitle icon={<Users className="h-4 w-4" />}>Payé &amp; crédits par taille d&apos;entreprise</BlockTitle><CompanySizeTable rows={d.byCompanySize} /></Card>
      <Card className="p-5"><BlockTitle icon={<Trophy className="h-4 w-4" />}>Top comptes (crédits)</BlockTitle><TopConsumers rows={d.topConsumers} metric="credits" /></Card>
    </div>
  );
}

function Usage({ d }: { d: Stats }) {
  const modelRows: BarRow[] = d.byModel.map((m) => ({ label: actionLabel(m.key), value: m.costUsd, title: `${m.calls} appels · ${tok(m.inTok)} in / ${tok(m.outTok)} out · ${nf.format(m.credits)} crédits` }));
  const actionRows: BarRow[] = d.byAction.map((m) => ({ label: actionLabel(m.key), value: m.costUsd, title: `${m.calls} appels · ${tok(m.inTok)} in / ${tok(m.outTok)} out · ${nf.format(m.credits)} crédits` }));
  return (
    <div className="space-y-6">
      <div className={GRID4}>
        <Kpi icon={<Coins className="h-4 w-4" />} value={usd(d.totals.costUsd)} label="Coût API (USD)" hint={`${d.totals.calls} appels`} />
        <Kpi icon={<Wallet className="h-4 w-4" />} value={eur(d.totals.costEur)} label="Coût API (EUR)" hint="conversion 0,92" />
        <Kpi icon={<Cpu className="h-4 w-4" />} value={tok(d.totals.inputTokens)} label="Tokens entrée" />
        <Kpi icon={<Cpu className="h-4 w-4" />} value={tok(d.totals.outputTokens)} label="Tokens sortie" />
      </div>
      <Card className="p-5"><BlockTitle icon={<Coins className="h-4 w-4" />}>Coût API par jour</BlockTitle><AreaChart data={costByDay(d)} format={usd} color="#7C3AED" height={200} empty="Aucune activité facturée." /></Card>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5"><BlockTitle icon={<Cpu className="h-4 w-4" />}>Coût par modèle</BlockTitle><BarList rows={modelRows} format={usd} empty="Aucun appel modèle." /></Card>
        <Card className="p-5"><BlockTitle icon={<Wrench className="h-4 w-4" />}>Coût par tâche</BlockTitle><BarList rows={actionRows} format={usd} empty="Aucune tâche facturée." /></Card>
      </div>
      <Card className="p-5"><BlockTitle icon={<Trophy className="h-4 w-4" />}>Comptes les plus coûteux</BlockTitle><TopConsumers rows={d.topConsumers} metric="cost" /></Card>
    </div>
  );
}

function Clients({ d }: { d: Stats }) {
  return (
    <div className="space-y-6">
      <div className={GRID4}>
        <Kpi icon={<Users className="h-4 w-4" />} value={nf.format(d.product.users)} label="Comptes" />
        <Kpi icon={<Building2 className="h-4 w-4" />} value={nf.format(d.product.tenants)} label="Espaces" />
        <Kpi icon={<Rocket className="h-4 w-4" />} value={pct(d.activation.activationRatePct)} label="Activation" hint={`${d.activation.activatedUsers}/${d.activation.totalUsers} ont créé`} />
        <Kpi icon={<Timer className="h-4 w-4" />} value={dur(d.activation.ttfvMedianHours)} label="Time-to-value" hint="inscription → 1ʳᵉ app" />
      </div>
      <div className={GRID4}>
        <Kpi icon={<Activity className="h-4 w-4" />} value={nf.format(d.engagement.wau)} label="Actifs 7j" />
        <Kpi icon={<Activity className="h-4 w-4" />} value={nf.format(d.engagement.mau)} label="Actifs 30j" />
        <Kpi icon={<TrendingUp className="h-4 w-4" />} value={pct(d.engagement.stickinessPct)} label="Stickiness" hint="7j / 30j" />
        <Kpi icon={<Repeat className="h-4 w-4" />} value={nf.format(d.engagement.returningUsers)} label="Récurrents" hint="actifs ≥ 2 jours" />
      </div>
      <Card className="p-5"><BlockTitle icon={<Rocket className="h-4 w-4" />}>Inscriptions par jour</BlockTitle><AreaChart data={signupsPts(d)} format={(n) => nf.format(n)} color="#6366F1" empty="Aucune inscription." /></Card>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5"><BlockTitle icon={<Globe className="h-4 w-4" />}>Par pays</BlockTitle><BarList rows={toRows(d.demographics.byCountry, countryLabel)} format={(n) => nf.format(n)} empty="Aucun profil renseigné." /></Card>
        <Card className="p-5"><BlockTitle icon={<Users className="h-4 w-4" />}>Par effectif</BlockTitle><BarList rows={toRows(d.demographics.byHeadcount, headcountLabel)} format={(n) => nf.format(n)} empty="Aucun profil renseigné." /></Card>
      </div>
      <div className={GRID4}>
        <Kpi icon={<AlertTriangle className="h-4 w-4" />} value={pct(d.quality.failureRatePct)} label="Échecs génération" hint={`${nf.format(d.quality.generationsFailed)} raté(s)`} />
        <Kpi icon={<Lock className="h-4 w-4" />} value={nf.format(d.quality.creditsBlocked)} label="Crédits bloqués" hint="occasions d'upsell" />
        <Kpi icon={<GitBranch className="h-4 w-4" />} value={d.iteration.avgVersionsPerApp == null ? "—" : `${d.iteration.avgVersionsPerApp}`} label="Versions / app" hint={`${d.iteration.appsHeavilyIterated} app(s) > 3 versions`} />
        <Kpi icon={<Repeat className="h-4 w-4" />} value={d.iteration.editToCreate == null ? "—" : `${d.iteration.editToCreate}×`} label="Modif / création" hint="itérations par app" />
      </div>
    </div>
  );
}

function Demand({ d }: { d: Stats }) {
  const nfmt = (n: number) => nf.format(n);
  return (
    <div className="space-y-6">
      <div className={GRID3}>
        <Card className="p-5"><BlockTitle icon={<HelpCircle className="h-4 w-4" />}>Type de demande</BlockTitle><BarList rows={toRows(d.demand.byRequestType, actionLabel)} format={nfmt} empty="Aucune requête." /></Card>
        <Card className="p-5"><BlockTitle icon={<Layers className="h-4 w-4" />}>Application vs Document</BlockTitle><BarList rows={toRows(d.demand.byKind, (k) => KIND_LABELS[k] ?? k)} format={nfmt} /></Card>
        <Card className="p-5"><BlockTitle icon={<Tag className="h-4 w-4" />}>Type d&apos;application</BlockTitle><BarList rows={toRows(d.demand.byAppType, prettySlug)} format={nfmt} empty="Pas encore d'app typée." /></Card>
        <Card className="p-5"><BlockTitle icon={<FileSignature className="h-4 w-4" />}>Type de document</BlockTitle><BarList rows={toRows(d.demand.byDocType, prettySlug)} format={nfmt} empty="Pas encore de document." /></Card>
        <Card className="p-5"><BlockTitle icon={<Wrench className="h-4 w-4" />}>Par métier</BlockTitle><BarList rows={toRows(d.demand.byAgent, agentLabel)} format={nfmt} empty="Aucun métier." /></Card>
        <Card className="p-5"><BlockTitle icon={<Briefcase className="h-4 w-4" />}>Par secteur client</BlockTitle><BarList rows={toRows(d.demand.bySector, sectorLabel)} format={nfmt} empty="Aucun secteur." /></Card>
      </div>
      <Card className="p-5">
        <BlockTitle icon={<MessageSquare className="h-4 w-4" />}>Questions récentes</BlockTitle>
        {d.recentQuestions.length === 0 ? (
          <p className="py-4 text-sm text-[#9A9AA6]">Aucune question posée pour l&apos;instant.</p>
        ) : (
          <div className="divide-y divide-[#F0F0F4]">
            {d.recentQuestions.map((q, i) => (
              <div key={i} className="flex items-start gap-3 py-2.5">
                <span className="mt-0.5 flex-shrink-0 rounded-md bg-[#F6F6F9] px-1.5 py-0.5 text-[10px] font-semibold text-[#7C3AED]">{q.topic}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-[#0A0A0A]">« {q.question} »</p>
                  <p className="text-[11px] text-[#9A9AA6]">{q.agent ? `${agentLabel(q.agent)} · ` : ""}{q.createdAt ? new Date(q.createdAt).toLocaleString("fr-FR") : ""}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      <div>
        <h3 className="mb-3 text-[13px] font-black uppercase tracking-wide text-[#8A8A96]">Adoption des fonctionnalités</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Tile icon={<Upload className="h-4 w-4" />} value={nf.format(d.adoption.knowledgeUploads)} label="Docs RAG" />
          <Tile icon={<BarChart3 className="h-4 w-4" />} value={nf.format(d.adoption.reports)} label="Rapports" />
          <Tile icon={<Plug className="h-4 w-4" />} value={nf.format(d.adoption.connectors)} label="Connecteurs" />
          <Tile icon={<Globe className="h-4 w-4" />} value={nf.format(d.adoption.deployedApps)} label="Apps déployées" />
          <Tile icon={<Globe className="h-4 w-4" />} value={nf.format(d.adoption.publicApps)} label="Apps publiques" />
          <Tile icon={<FileSignature className="h-4 w-4" />} value={nf.format(d.adoption.generatedDocuments)} label="Docs générés" />
        </div>
      </div>
    </div>
  );
}

// ── Shell ──────────────────────────────────────────────────────────────────────
export default function AdminDashboard({ email }: { email: string }) {
  const router = useRouter();
  const [data, setData] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<SectionId>("overview");

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

  const active = NAV.find((n) => n.id === section)!;

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-[#FCFCFD] text-[#0A0A0A]">
      {/* Sidebar */}
      <aside className="relative z-10 flex w-60 shrink-0 flex-col border-r border-[#ECECF2] bg-white">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-pink-500 shadow-[0_8px_20px_rgba(139,92,246,0.4)]">
            <ShieldCheck className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-[15px] font-black leading-tight tracking-[-0.02em]">Console Biltia</p>
            <p className="text-[11px] text-[#9A9AA6]">Terminal interne</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
          {NAV.map((item) => {
            const Icon = item.icon;
            const on = section === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setSection(item.id)}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  on
                    ? "bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 text-white shadow-[0_8px_20px_rgba(139,92,246,0.32)]"
                    : "text-[#4B4B55] hover:bg-[#F6F6F9]"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="border-t border-[#ECECF2] p-3">
          <div className="mb-2 flex items-center gap-2 px-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#F0EEFB] text-[11px] font-bold text-[#7C3AED]">
              {email.slice(0, 1).toUpperCase()}
            </div>
            <p className="min-w-0 flex-1 truncate text-[11px] text-[#6E6E6C]">{email}</p>
          </div>
          <button
            onClick={signOut}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#ECECF2] py-2 text-sm font-semibold text-[#6E6E6C] transition-colors hover:bg-[#F6F6F9]"
          >
            <LogOut className="h-4 w-4" /> Quitter
          </button>
        </div>
      </aside>

      {/* Contenu */}
      <main className="relative flex-1 overflow-y-auto">
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute -right-40 -top-40 h-96 w-96 rounded-full bg-pink-300/15 blur-[120px]" />
          <div className="absolute left-1/3 top-40 h-96 w-96 rounded-full bg-indigo-300/15 blur-[130px]" />
        </div>

        {/* Top bar */}
        <div className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-[#ECECF2] bg-[#FCFCFD]/80 px-8 py-4 backdrop-blur-md">
          <div>
            <h1 className="text-lg font-black tracking-[-0.02em]">{active.label}</h1>
            <p className="text-xs text-[#9A9AA6]">{active.desc}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-[11px] text-[#9A9AA6] sm:block">
              {data ? `maj ${new Date(data.generatedAt).toLocaleTimeString("fr-FR")}` : ""}
            </span>
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl border border-[#ECECF2] bg-white px-3.5 py-2 text-sm font-semibold text-[#0A0A0A] transition-colors hover:bg-[#F6F6F9] disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualiser
            </button>
          </div>
        </div>

        <div className="mx-auto max-w-[1400px] px-8 py-6">
          {loading && !data && (
            <div className="flex items-center gap-2 text-sm text-[#6E6E6C]">
              <RefreshCw className="h-4 w-4 animate-spin" /> Chargement des statistiques réelles…
            </div>
          )}
          {error && (
            <Card className="border-rose-100 bg-rose-50 p-4">
              <p className="text-sm text-rose-600">{error}</p>
            </Card>
          )}
          {data && (
            <AnimatePresence mode="wait">
              <motion.div
                key={section}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22 }}
              >
                {section === "overview" && <Overview d={data} />}
                {section === "revenue" && <Revenue d={data} />}
                {section === "usage" && <Usage d={data} />}
                {section === "clients" && <Clients d={data} />}
                {section === "demand" && <Demand d={data} />}
              </motion.div>
            </AnimatePresence>
          )}

          <p className="mt-8 text-center text-[11px] text-[#B4B4BE]">
            Données réelles calculées sur la base ({data ? `${usd(data.totals.costUsd)} de coût sur ${data.totals.calls} appels` : "…"}). Revenu et marge estimés au tarif Pro de base. Optimisé pour desktop.
          </p>
        </div>
      </main>
    </div>
  );
}
