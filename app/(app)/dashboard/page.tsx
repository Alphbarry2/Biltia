"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { InteractiveMesh, useTypewriter, TemplateGallery } from "@/components/site";
import {
  Sparkles,
  ArrowUpRight,
  Trash2,
  MoreHorizontal,
  Send,
  Mic,
  MicOff,
  Clock,
  Pencil,
  Search,
} from "lucide-react";

type App = {
  id: string;
  name: string;
  slug: string | null;
  description: string;
  html_content: string;
  created_at: string | null;
  updated_at: string | null;
};

const QUICK_PROMPTS = [
  "Suivi de chantiers",
  "Devis BTP",
  "Pointage des heures",
  "Sous-traitants",
  "Planning chantiers",
  "Factures & acomptes",
];

const DASH_PLACEHOLDERS = [
  "Sors-moi l'avenant pour le carrelage validé, 45 m²…",
  "Quels chantiers sont en retard cette semaine ?",
  "Vérifie les prix de ces 30 bons de livraison…",
  "Un suivi de mes chantiers avec l'avancement…",
  "Rédige une mise en demeure pour la facture impayée…",
];

function formatRelative(iso: string | null) {
  if (!iso) return "-";
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return "Aujourd'hui";
  if (d === 1) return "Hier";
  if (d < 7) return `Il y a ${d} jours`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function AppPreviewCard({
  app,
  index,
  onDelete,
}: {
  app: App;
  index: number;
  onDelete: () => void;
}) {
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
      {/* Preview thumbnail (div, not Link, to avoid nested anchors) */}
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

      {/* Card footer */}
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

export default function DashboardPage() {
  const router = useRouter();
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [tab, setTab] = useState<"ateliers" | "modeles">("ateliers");
  const [query, setQuery] = useState("");
  const typed = useTypewriter(DASH_PLACEHOLDERS);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  const fetchApps = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const nm = (user.user_metadata?.full_name as string) || user.email?.split("@")[0] || "";
    setFirstName(nm.split(" ")[0]);
    const { data } = await supabase
      .from("modules")
      .select("id, name, slug, description, html_content, created_at, updated_at")
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(20);
    setApps(data ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchApps(); }, []);

  const handleCreate = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    // On lance la generation directement : pas d'ecran intermediaire.
    sessionStorage.setItem("batify_prompt", trimmed);
    sessionStorage.setItem("batify_autostart", "1");
    router.push("/generate");
  };

  // Ouvre un modèle dans l'atelier (aperçu live + chat). Les modifs créent une copie perso.
  const useTemplate = (t: { id: string; name: string }) => {
    router.push(`/generate?template=${encodeURIComponent(t.id)}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleCreate();
    }
  };

  const startVoice = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = "fr-FR";
    rec.continuous = true;
    rec.interimResults = true;
    let final = "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t + " ";
        else interim += t;
      }
      setInput((final + interim).trimStart());
    };
    rec.onend = () => setIsListening(false);
    rec.onerror = () => setIsListening(false);
    rec.start();
    recognitionRef.current = rec;
    setIsListening(true);
  };

  const stopVoice = () => {
    recognitionRef.current?.stop();
    setIsListening(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer cette application ?")) return;
    const supabase = createClient();
    await supabase.from("modules").update({ status: "archived" }).eq("id", id);
    setApps((prev) => prev.filter((a) => a.id !== id));
  };

  const q = query.trim().toLowerCase();
  const filtered = q
    ? apps.filter((a) => `${a.name} ${a.description}`.toLowerCase().includes(q))
    : apps;

  return (
    <div className="relative min-h-full bg-[#FCFCFD]">
      {/* Le fond maillé (quadrillage + halos) couvre toute la page : hero ET panneau */}
      <InteractiveMesh strong />

      {/* Accueil plein écran, tout part d'ici */}
      <section className="relative z-10 min-h-[86vh] flex flex-col items-center justify-center px-6 py-16">
        <div className="relative z-10 w-full max-w-2xl mx-auto text-center">
          <span className="glass inline-flex items-center gap-2 px-3.5 py-1.5 text-[#4A4A56] text-[13px] font-medium rounded-full mb-7">
            <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-br from-indigo-500 to-pink-500" />
            Dictez, Batify exécute.
          </span>

          <h1 className="text-[40px] sm:text-[58px] font-black text-[#0A0A0A] leading-[1.06] tracking-[-0.035em] mb-9 max-w-3xl">
            Quel problème <span className="text-gradient">réglons-nous</span>{firstName ? `, ${firstName}` : " aujourd’hui"}&nbsp;?
          </h1>

          {/* Barre de chat (opaque, pas de grille au travers) */}
          <div className="bg-white rounded-[28px] p-2.5 border border-[#ECECF2] shadow-[0_20px_60px_rgba(60,40,120,0.12)] focus-within:shadow-[0_0_0_4px_rgba(139,92,246,0.14),0_24px_70px_rgba(60,40,120,0.18)] transition-shadow text-left">
            <div className="relative px-4 pt-4 pb-2">
              {!input && (
                <span className="absolute top-4 left-4 right-4 text-[15px] text-[#9A9AA6] pointer-events-none select-none leading-relaxed">
                  {typed}
                  <span aria-hidden className="inline-block w-[2px] h-[0.95em] translate-y-[2px] bg-[#7C3AED]/80 ml-0.5 animate-blink" />
                </span>
              )}
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={2}
                className="relative w-full bg-transparent text-[#0A0A0A] text-[15px] resize-none focus:outline-none leading-relaxed min-h-[52px]"
                onInput={(e) => {
                  const el = e.currentTarget;
                  el.style.height = "auto";
                  el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
                }}
              />
            </div>
            <div className="flex items-center justify-between gap-3 px-2 pb-1">
              <button
                onClick={isListening ? stopVoice : startVoice}
                className={`flex items-center gap-1.5 text-[12.5px] font-medium px-3 py-2 rounded-full transition-colors ${
                  isListening
                    ? "bg-rose-100 text-rose-600"
                    : "bg-black/[0.04] border border-black/[0.06] text-[#4A4A56] hover:bg-black/[0.07]"
                }`}
              >
                {isListening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                {isListening ? "Écoute…" : "Voix"}
              </button>
              <button
                onClick={handleCreate}
                aria-label="Lancer"
                className="w-10 h-10 flex items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 via-violet-500 to-pink-500 text-white shadow-[0_6px_20px_rgba(139,92,246,0.4)] hover:shadow-[0_8px_28px_rgba(139,92,246,0.55)] active:scale-95 transition-all duration-200"
              >
                <Send className="w-[17px] h-[17px]" />
              </button>
            </div>
          </div>

          {/* Quick prompts */}
          <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
            {QUICK_PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => {
                  sessionStorage.setItem("batify_prompt", `Je veux ${p.toLowerCase()}`);
                  sessionStorage.setItem("batify_autostart", "1");
                  router.push("/generate");
                }}
                className="glass text-[12.5px] px-3 py-1.5 text-[#4A4A56] rounded-full hover:bg-white transition-colors"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Panneau arrondi et espacé : mes ateliers + modèles, avec recherche */}
      <section className="relative z-10 px-4 sm:px-6 pt-4 pb-20">
        <div className="max-w-7xl mx-auto rounded-[28px] bg-white border border-[#ECECF2] shadow-[0_14px_46px_rgba(60,40,120,0.06)] p-5 sm:p-7">
          {/* En-tête discret : onglets + recherche */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <div className="inline-flex items-center gap-1 p-1 bg-[#F4F4F7] rounded-full self-start">
              {([["ateliers", "Mes ateliers"], ["modeles", "Modèles"]] as const).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`px-4 py-1.5 rounded-full text-[13px] font-semibold transition-colors ${
                    tab === id ? "bg-white text-[#0A0A0A] shadow-[0_1px_3px_rgba(0,0,0,0.08)]" : "text-[#6E6E7A] hover:text-[#0A0A0A]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 bg-[#F6F6F9] border border-[#ECECF2] rounded-full px-3.5 py-2 w-full sm:w-72">
              <Search className="w-4 h-4 text-[#9A9AA6] flex-shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tab === "ateliers" ? "Rechercher une application…" : "Rechercher un modèle…"}
                className="bg-transparent outline-none text-sm text-[#0A0A0A] w-full placeholder:text-[#9A9AA6]"
              />
            </div>
          </div>

          {tab === "ateliers" ? (
            loading ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 text-center">
                <div className="w-14 h-14 rounded-2xl border border-[#E7E7EE] bg-[#FAFAFC] flex items-center justify-center mb-4">
                  <Sparkles className="w-6 h-6 text-[#7C3AED]" strokeWidth={1.5} />
                </div>
                <h3 className="text-[15px] font-bold text-[#0A0A0A] mb-1.5 tracking-[-0.01em]">
                  {query ? "Aucune application trouvée" : "Aucune création pour l’instant"}
                </h3>
                <p className="text-[13px] text-[#6E6E6C] max-w-xs leading-relaxed">
                  {query ? "Essayez un autre mot-clé, ou lancez une création là-haut." : "Décrivez votre première galère là-haut : Batify s’occupe du reste."}
                </p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filtered.map((app, i) => (
                  <AppPreviewCard key={app.id} app={app} index={i} onDelete={() => handleDelete(app.id)} />
                ))}
              </div>
            )
          ) : (
            <TemplateGallery onUse={useTemplate} query={query} />
          )}
        </div>
      </section>
    </div>
  );
}
