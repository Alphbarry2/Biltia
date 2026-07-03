"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
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
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Bibliothèque — « Mes créations ». Tout ce que Batify a produit.
// v1 : les applications (table modules). PDF / rapports / automatisations à venir.
// ─────────────────────────────────────────────────────────────────────────────

type App = {
  id: string;
  name: string;
  slug: string | null;
  description: string;
  html_content: string;
  updated_at: string | null;
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
  { key: "docs", label: "Documents PDF", icon: FileText, live: false },
  { key: "reports", label: "Rapports", icon: BarChart3, live: false },
  { key: "automations", label: "Automatisations", icon: GitBranch, live: false },
] as const;

function AppCard({ app, index, onDelete }: { app: App; index: number; onDelete: () => void }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [hovered, setHovered] = useState(false);

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
              srcDoc={app.html_content}
              sandbox="allow-scripts"
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
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("apps");

  const fetchApps = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("modules")
      .select("id, name, slug, description, html_content, updated_at")
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(60);
    setApps(data ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchApps(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer cette création ?")) return;
    const supabase = createClient();
    await supabase.from("modules").update({ status: "archived" }).eq("id", id);
    setApps((prev) => prev.filter((a) => a.id !== id));
  };

  const filtered = query.trim()
    ? apps.filter((a) => a.name.toLowerCase().includes(query.trim().toLowerCase()))
    : apps;

  return (
    <div className="min-h-full bg-[#FCFCFD]">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* En-tête */}
        <div className="flex items-center gap-3 mb-1.5">
          <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500/15 to-pink-500/10 flex items-center justify-center">
            <Library className="w-5 h-5 text-violet-600" />
          </span>
          <h1 className="text-2xl font-black text-[#0A0A0A] tracking-[-0.03em]">Bibliothèque</h1>
        </div>
        <p className="text-[14px] text-[#6E6E6C] mb-6 ml-12">Tout ce que Batify a créé pour vous.</p>

        {/* Filtres + recherche */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map(({ key, label, icon: Icon, live }) => (
              <button
                key={key}
                onClick={() => live && setFilter(key)}
                disabled={!live}
                title={live ? undefined : "Bientôt"}
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
                {!live && <span className="text-[10px] uppercase tracking-wide ml-0.5">bientôt</span>}
              </button>
            ))}
          </div>

          {apps.length > 0 && (
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9A9AA6]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher une création…"
                className="w-full pl-10 pr-4 py-2.5 rounded-full border border-[#E7E7EE] bg-white text-[13px] text-[#0A0A0A] placeholder-[#9A9AA6] focus:outline-none focus:border-violet-400 transition-colors"
              />
            </div>
          )}
        </div>

        {/* Grille */}
        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
          </div>
        ) : apps.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl border border-[#E7E7EE] bg-[#FAFAFC] flex items-center justify-center mb-5">
              <Library className="w-7 h-7 text-violet-600" strokeWidth={1.5} />
            </div>
            <h3 className="text-lg font-bold text-[#0A0A0A] mb-2 tracking-[-0.01em]">Rien dans la bibliothèque</h3>
            <p className="text-sm text-[#6E6E6C] max-w-xs leading-relaxed mb-6">
              Vos applications, documents et rapports générés apparaîtront ici.
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
