"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { getActiveMembership } from "@/lib/tenant";
import { toPreviewHtml } from "@/lib/app-preview";
import {
  Library,
  Search,
  Sparkles,
  ArrowUpRight,
  Pencil,
  Trash2,
  MoreHorizontal,
  Clock,
  AppWindow,
  FileText,
  GitBranch,
  BarChart3,
  MessageCircle,
  AppWindow as AppLinkIcon,
} from "lucide-react";
import type { ChatMessage } from "@/lib/conversations";

// ─────────────────────────────────────────────────────────────────────────────
// Bibliothèque — « Mes créations ». Tout ce que Biltia a produit.
// v1 : les applications (table modules). PDF / rapports / automatisations à venir.
// ─────────────────────────────────────────────────────────────────────────────

type App = {
  id: string;
  name: string;
  slug: string | null;
  description: string;
  html_content: string;
  kind: string;
  updated_at: string | null;
};

type ReportListItem = {
  id: string;
  type: string;
  title: string;
  file_count: number;
  created_at: string;
};

function formatRelative(iso: string | null) {
  if (!iso) return "-";
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return "Aujourd'hui";
  if (d === 1) return "Hier";
  if (d < 7) return `Il y a ${d} jours`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

const FILTERS = [
  { key: "apps", label: "Applications", icon: AppWindow, live: true },
  { key: "chats", label: "Conversations", icon: MessageCircle, live: true },
  { key: "docs", label: "Documents PDF", icon: FileText, live: true },
  { key: "reports", label: "Rapports", icon: BarChart3, live: true },
  { key: "automations", label: "Automatisations", icon: GitBranch, live: true },
] as const;

// Ligne de rapport (analyse de document ou contrôle par lot).
function ReportRowCard({ report, onDelete }: { report: ReportListItem; onDelete: () => void }) {
  const router = useRouter();
  const isControle = report.type === "controle";
  const Icon = isControle ? GitBranch : BarChart3;
  return (
    <div
      onClick={() => router.push(`/reports/${report.id}`)}
      className="group flex cursor-pointer items-center gap-4 rounded-2xl border border-[#E7E7E4] bg-white px-5 py-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-[#C9BEF0] hover:shadow-[0_12px_32px_rgba(124,58,190,0.1)]"
    >
      <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-500/15 to-pink-500/10">
        <Icon className="h-[18px] w-[18px] text-violet-600" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[#0A0A0A]">{report.title}</p>
        <p className="mt-0.5 text-[12px] text-[#9A9A97]">
          {isControle ? "Contrôle par lot" : "Analyse de document"} · {report.file_count} fichier(s) · {formatRelative(report.created_at)}
        </p>
      </div>
      <div className="flex flex-shrink-0 items-center gap-3">
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          aria-label="Supprimer le rapport"
          className="rounded-lg p-1.5 text-[#9A9A97] opacity-0 transition-all hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        <ArrowUpRight className="h-4 w-4 text-[#C9C9C4] transition-colors group-hover:text-[#7C3AED]" />
      </div>
    </div>
  );
}

type Conversation = {
  id: string;
  title: string;
  messages: ChatMessage[];
  app_id: string | null;
  updated_at: string;
};

// Ligne de conversation : titre, dernier échange, nombre de messages, réouverture.
function ConversationRowCard({ conv, onDelete }: { conv: Conversation; onDelete: () => void }) {
  const router = useRouter();
  const last = conv.messages[conv.messages.length - 1];
  const snippet = (last?.content ?? "").replace(/[#*`>]/g, "").split("\n")[0];

  return (
    <div
      onClick={() => router.push(`/generate?chat=${conv.id}`)}
      className="group flex cursor-pointer items-center gap-4 rounded-2xl border border-[#E7E7E4] bg-white px-5 py-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-[#C9BEF0] hover:shadow-[0_12px_32px_rgba(124,58,190,0.1)]"
    >
      <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-500/15 to-pink-500/10">
        <MessageCircle className="h-[18px] w-[18px] text-violet-600" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[#0A0A0A]">{conv.title}</p>
        <p className="mt-0.5 truncate text-[12px] text-[#9A9A97]">{snippet || "Conversation vide"}</p>
      </div>
      <div className="flex flex-shrink-0 items-center gap-3">
        {conv.app_id && (
          <span className="hidden sm:inline-flex items-center gap-1 rounded-full border border-[#E2D9F8] bg-[#F3EFFC] px-2 py-0.5 text-[10.5px] font-semibold text-[#7C3AED]">
            <AppLinkIcon className="h-3 w-3" /> App liée
          </span>
        )}
        <span className="hidden text-[11px] tabular-nums text-[#9A9A97] sm:block">
          {conv.messages.length} msg · {formatRelative(conv.updated_at)}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          aria-label="Supprimer la conversation"
          className="rounded-lg p-1.5 text-[#9A9A97] opacity-0 transition-all hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        <ArrowUpRight className="h-4 w-4 text-[#C9C9C4] transition-colors group-hover:text-[#7C3AED]" />
      </div>
    </div>
  );
}

function AppCard({ app, index, onDelete }: { app: App; index: number; onDelete: () => void }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  // Aperçu figé : stub des données → pas de « Chargement du workspace… ».
  const preview = useMemo(() => toPreviewHtml(app.html_content), [app.html_content]);

  return (
    <div
      className="group relative flex flex-col bg-white border border-[#E7E7E4] rounded-2xl overflow-hidden transition-all duration-300 hover:border-[#C9C9C4] hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(0,0,0,0.06)]"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div
        className="relative overflow-hidden bg-[#F1F1EC] cursor-pointer"
        style={{ height: "192px" }}
        onClick={() => router.push(`/apps/${app.id}`)}
      >
        {app.html_content ? (
          <>
            <iframe
              srcDoc={preview}
              sandbox="allow-scripts"
              loading="lazy"
              className="absolute top-0 left-0 border-0 pointer-events-none select-none"
              style={{
                width: "1280px",
                height: "960px",
                transform: hovered ? "scale(0.26)" : "scale(0.25)",
                transformOrigin: "top left",
                transition: "transform 600ms cubic-bezier(0.16,1,0.3,1)",
              }}
              title={app.name}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#F1F1EC]/60 via-transparent to-transparent pointer-events-none" />
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <Sparkles className="w-8 h-8 text-[#D5D5D1]" />
          </div>
        )}

        <div className={`absolute inset-0 bg-[#0A0A0A]/55 flex items-center justify-center gap-3 transition-opacity duration-300 ${hovered ? "opacity-100" : "opacity-0"}`}>
          <span className="flex items-center gap-1.5 px-3 py-1.5 bg-white/15 backdrop-blur-sm border border-white/20 text-white text-xs font-medium rounded-full">
            <ArrowUpRight className="w-3.5 h-3.5" />
            Ouvrir
          </span>
          <Link
            href={`/generate?edit=${app.id}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/15 backdrop-blur-sm border border-white/20 text-white text-xs font-medium rounded-full hover:bg-white/25 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            Modifier
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-3 px-4 py-3 bg-white">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-[#0A0A0A] truncate">{app.name}</h3>
          <div className="flex items-center gap-1 mt-0.5">
            <Clock className="w-3 h-3 text-[#9A9A97] flex-shrink-0" />
            <p className="text-[11px] text-[#9A9A97]">{formatRelative(app.updated_at)}</p>
          </div>
        </div>

        <div className="relative flex-shrink-0">
          <button
            onClick={(e) => { e.preventDefault(); setMenuOpen(!menuOpen); }}
            className="p-1.5 text-[#9A9A97] hover:text-[#0A0A0A] rounded-lg hover:bg-black/[0.04] transition-colors opacity-0 group-hover:opacity-100"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute bottom-full right-0 mb-1 z-20 bg-white border border-[#E7E7E4] rounded-xl shadow-[0_8px_28px_rgba(0,0,0,0.1)] py-1 w-36">
                <button
                  onClick={() => { onDelete(); setMenuOpen(false); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs text-[#D95C4A] hover:bg-[#fdf2f0] transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Supprimer
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white border border-[#E7E7E4] rounded-2xl overflow-hidden animate-pulse">
      <div className="bg-[#F1F1EC]" style={{ height: "192px" }} />
      <div className="px-4 py-3 flex items-center gap-3">
        <div className="flex-1 space-y-2">
          <div className="h-3.5 bg-[#E7E7E4] rounded-full w-2/3" />
          <div className="h-2.5 bg-[#E7E7E4] rounded-full w-1/3" />
        </div>
      </div>
    </div>
  );
}

export default function LibraryPage() {
  const [apps, setApps] = useState<App[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("apps");

  const fetchApps = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    // Apps, conversations et rapports appartiennent au workspace actif : on cloisonne.
    const membership = await getActiveMembership(supabase, user.id);
    if (!membership?.tenant_id) {
      setApps([]); setConversations([]); setReports([]); setLoading(false); return;
    }
    const tenantId = membership.tenant_id;
    const [{ data }, { data: convs }, { data: reps }] = await Promise.all([
      supabase
        .from("modules")
        .select("id, name, slug, description, html_content, kind, updated_at")
        .eq("status", "active")
        .eq("tenant_id", tenantId)
        .order("updated_at", { ascending: false })
        .limit(60),
      supabase
        .from("conversations")
        .select("id, title, messages, app_id, updated_at")
        .eq("tenant_id", tenantId)
        .order("updated_at", { ascending: false })
        .limit(50),
      supabase
        .from("reports")
        .select("id, type, title, file_count, created_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(60),
    ]);
    setApps(data ?? []);
    setConversations(
      (convs ?? []).map((c) => ({
        ...c,
        messages: Array.isArray(c.messages) ? (c.messages as unknown as ChatMessage[]) : [],
      }))
    );
    setReports(reps ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchApps(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer cette création ?")) return;
    const supabase = createClient();
    await supabase.from("modules").update({ status: "archived" }).eq("id", id);
    setApps((prev) => prev.filter((a) => a.id !== id));
  };

  const handleDeleteConv = async (id: string) => {
    if (!confirm("Supprimer cette conversation ?")) return;
    const supabase = createClient();
    await supabase.from("conversations").delete().eq("id", id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
  };

  const handleDeleteReport = async (id: string) => {
    if (!confirm("Supprimer ce rapport ?")) return;
    const supabase = createClient();
    await supabase.from("reports").delete().eq("id", id);
    setReports((prev) => prev.filter((r) => r.id !== id));
  };

  const q = query.trim().toLowerCase();
  // Applications vs Documents PDF : même table modules, séparés par kind.
  const gridSource = apps.filter((a) => (filter === "docs" ? a.kind === "document" : a.kind !== "document"));
  const filtered = q ? gridSource.filter((a) => a.name.toLowerCase().includes(q)) : gridSource;

  const filteredConvs = q
    ? conversations.filter((c) => c.title.toLowerCase().includes(q))
    : conversations;

  const reportSource = reports.filter((r) => (filter === "automations" ? r.type === "controle" : r.type === "analyse"));
  const filteredReports = q ? reportSource.filter((r) => r.title.toLowerCase().includes(q)) : reportSource;
  const isReportTab = filter === "reports" || filter === "automations";

  return (
    <div className="min-h-full bg-[#FCFCFD]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* En-tête */}
        <div className="flex items-center gap-3 mb-1.5">
          <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500/15 to-pink-500/10 flex items-center justify-center flex-shrink-0">
            <Library className="w-5 h-5 text-violet-600" />
          </span>
          <h1 className="text-xl sm:text-2xl font-black text-[#0A0A0A] tracking-[-0.03em]">Bibliothèque</h1>
        </div>
        <p className="text-[14px] text-[#6E6E6C] mb-6 ml-0 sm:ml-12">Tout ce que Biltia a créé pour vous.</p>

        {/* Filtres + recherche */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map(({ key, label, icon: Icon, live }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-medium transition-colors ${
                  filter === key
                    ? "bg-[#0A0A0A] text-white"
                    : live
                      ? "bg-black/[0.04] text-[#4A4A56] hover:bg-black/[0.07]"
                      : "bg-black/[0.02] text-[#C9C9C4] cursor-not-allowed"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          {(apps.length > 0 || conversations.length > 0) && (
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9A9AA6]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={filter === "chats" ? "Rechercher une conversation…" : "Rechercher une création…"}
                className="w-full pl-10 pr-4 py-2.5 rounded-full border border-[#E7E7EE] bg-white text-[13px] text-[#0A0A0A] placeholder-[#9A9AA6] focus:outline-none focus:border-violet-400 transition-colors"
              />
            </div>
          )}
        </div>

        {/* Conversations (historique du chat, façon ChatGPT) */}
        {filter === "chats" ? (
          loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-[74px] animate-pulse rounded-2xl border border-[#E7E7E4] bg-white" />
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-[#E7E7EE] bg-[#FAFAFC]">
                <MessageCircle className="h-7 w-7 text-violet-600" strokeWidth={1.5} />
              </div>
              <h3 className="mb-2 text-lg font-bold tracking-[-0.01em] text-[#0A0A0A]">Aucune conversation</h3>
              <p className="mb-6 max-w-xs text-sm leading-relaxed text-[#6E6E6C]">
                Chaque session de chat de l&apos;atelier est enregistrée ici automatiquement, et se rouvre d&apos;un clic.
              </p>
              <Link href="/generate" className="text-[13px] font-semibold text-violet-600 transition-opacity hover:opacity-80">
                Démarrer une conversation
              </Link>
            </div>
          ) : filteredConvs.length === 0 ? (
            <p className="py-12 text-center text-sm text-[#6E6E6C]">Aucune conversation ne correspond à votre recherche.</p>
          ) : (
            <div className="space-y-3">
              {filteredConvs.map((c) => (
                <ConversationRowCard key={c.id} conv={c} onDelete={() => handleDeleteConv(c.id)} />
              ))}
            </div>
          )
        ) : isReportTab ? (
          loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-[74px] animate-pulse rounded-2xl border border-[#E7E7E4] bg-white" />
              ))}
            </div>
          ) : filteredReports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-[#E7E7EE] bg-[#FAFAFC]">
                {filter === "automations"
                  ? <GitBranch className="h-7 w-7 text-violet-600" strokeWidth={1.5} />
                  : <BarChart3 className="h-7 w-7 text-violet-600" strokeWidth={1.5} />}
              </div>
              <h3 className="mb-2 text-lg font-bold tracking-[-0.01em] text-[#0A0A0A]">
                {filter === "automations" ? "Aucun contrôle par lot" : "Aucun rapport d'analyse"}
              </h3>
              <p className="mb-6 max-w-xs text-sm leading-relaxed text-[#6E6E6C]">
                {filter === "automations"
                  ? "Glissez plusieurs bons de livraison ou factures dans l'atelier : le rapport d'écarts arrivera ici."
                  : "Analysez un devis, une facture ou un plan dans l'atelier : le rapport arrivera ici."}
              </p>
              <Link href="/generate" className="text-[13px] font-semibold text-violet-600 transition-opacity hover:opacity-80">
                Lancer dans l&apos;atelier
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredReports.map((r) => (
                <ReportRowCard key={r.id} report={r} onDelete={() => handleDeleteReport(r.id)} />
              ))}
            </div>
          )
        ) : loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
          </div>
        ) : gridSource.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl border border-[#E7E7EE] bg-[#FAFAFC] flex items-center justify-center mb-5">
              {filter === "docs"
                ? <FileText className="w-7 h-7 text-violet-600" strokeWidth={1.5} />
                : <Library className="w-7 h-7 text-violet-600" strokeWidth={1.5} />}
            </div>
            <h3 className="text-lg font-bold text-[#0A0A0A] mb-2 tracking-[-0.01em]">
              {filter === "docs" ? "Aucun document sauvegardé" : "Rien dans la bibliothèque"}
            </h3>
            <p className="text-sm text-[#6E6E6C] max-w-xs leading-relaxed mb-6">
              {filter === "docs"
                ? "Dictez un devis, un PV ou un courrier dans l'atelier, puis sauvegardez-le : il apparaîtra ici, prêt à imprimer."
                : "Vos applications, documents et rapports générés apparaîtront ici."}
            </p>
            <Link href="/dashboard" className="text-[13px] font-semibold text-violet-600 hover:opacity-80 transition-opacity">
              Créer quelque chose
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-[#6E6E6C] py-12 text-center">Aucune création ne correspond à votre recherche.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((app, i) => (
              <AppCard key={app.id} app={app} index={i} onDelete={() => handleDelete(app.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
