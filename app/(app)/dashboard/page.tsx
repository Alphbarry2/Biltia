"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import {
  Plus,
  Sparkles,
  ArrowUpRight,
  Trash2,
  MoreHorizontal,
  Send,
  Mic,
  MicOff,
  Clock,
  Pencil,
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

function formatRelative(iso: string | null) {
  if (!iso) return "—";
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
      className="group relative flex flex-col bg-card border border-[#E7E2D7] rounded-2xl overflow-hidden shadow-[0_0_0_1px_rgba(0,0,0,0.04),0_1px_3px_rgba(115,100,70,0.06),0_4px_16px_rgba(115,100,70,0.04)] hover:shadow-[0_0_0_1px_rgba(0,0,0,0.04),0_4px_12px_rgba(115,100,70,0.08),0_16px_40px_rgba(115,100,70,0.08)] transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* Preview thumbnail — div, not Link, to avoid nested <a> */}
      <div
        className="relative overflow-hidden bg-[#F1EEE6] cursor-pointer"
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
            {/* Overlay gradient */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#F1EEE6]/60 via-transparent to-transparent pointer-events-none" />
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <Sparkles className="w-8 h-8 text-[#E7E2D7]" />
          </div>
        )}

        {/* Hover overlay — links are fine here since outer is not <a> */}
        <div className={`absolute inset-0 bg-[#0F172A]/60 flex items-center justify-center gap-3 transition-opacity duration-300 ${hovered ? "opacity-100" : "opacity-0"}`}>
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
      <div className="flex items-center gap-3 px-4 py-3 bg-card">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground truncate">{app.name}</h3>
          <div className="flex items-center gap-1 mt-0.5">
            <Clock className="w-3 h-3 text-muted-foreground flex-shrink-0" />
            <p className="text-[11px] text-muted-foreground">{formatRelative(app.updated_at)}</p>
          </div>
        </div>

        <div className="relative flex-shrink-0">
          <button
            onClick={(e) => { e.preventDefault(); setMenuOpen(!menuOpen); }}
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors opacity-0 group-hover:opacity-100"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute bottom-full right-0 mb-1 z-20 bg-card border border-border rounded-xl shadow-[0_8px_28px_rgba(115,100,70,0.12)] py-1 w-36">
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
    <div className="bg-card border border-[#E7E2D7] rounded-2xl overflow-hidden animate-pulse">
      <div className="bg-[#F1EEE6]" style={{ height: "192px" }} />
      <div className="px-4 py-3 flex items-center gap-3">
        <div className="flex-1 space-y-2">
          <div className="h-3.5 bg-[#E7E2D7] rounded-full w-2/3" />
          <div className="h-2.5 bg-[#E7E2D7] rounded-full w-1/3" />
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  const fetchApps = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("apps")
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
    if (trimmed) {
      sessionStorage.setItem("batify_prompt", trimmed);
    }
    router.push("/generate");
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
    await supabase.from("apps").update({ status: "archived" }).eq("id", id);
    setApps((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <div className="min-h-full bg-[#F7F5EF]">
      {/* Hero section */}
      <div className="relative overflow-hidden">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#F7F5EF] via-[#EEF9F7] to-[#F0F9F7]" />
        <div className="absolute top-0 right-0 w-[600px] h-[400px] bg-[#14B8A6]/8 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[300px] bg-[#14B8A6]/5 rounded-full blur-[80px] pointer-events-none" />

        <div className="relative px-6 pt-16 pb-12 max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#14B8A6]/10 border border-[#14B8A6]/20 rounded-full mb-6">
            <Sparkles className="w-3.5 h-3.5 text-[#0D9488]" />
            <span className="text-xs font-semibold text-[#0D9488] tracking-wide">BatifyAI — Powered by Claude</span>
          </div>

          <h1 className="font-display text-4xl sm:text-5xl text-[#0F172A] leading-[1.1] tracking-tight mb-3">
            Que voulez-vous créer ?
          </h1>
          <p className="text-base text-[#6B7280] mb-8">
            Décrivez votre outil BTP en français — Batify le construit en 90 secondes.
          </p>

          {/* Big input */}
          <div className="relative bg-white border border-[#E7E2D7] rounded-2xl shadow-[0_0_0_1px_rgba(0,0,0,0.04),0_4px_24px_rgba(115,100,70,0.08)] focus-within:border-[#14B8A6] focus-within:shadow-[0_0_0_3px_rgba(20,184,166,0.12),0_4px_24px_rgba(115,100,70,0.08)] transition-all duration-300">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Je veux un outil pour suivre mes chantiers avec…"
              rows={3}
              className="w-full bg-transparent text-[#111827] placeholder-[#9CA3AF] text-sm resize-none focus:outline-none px-5 pt-4 pb-2 leading-relaxed"
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
              }}
            />
            <div className="flex items-center justify-between px-4 pb-3 pt-1">
              <button
                onClick={isListening ? stopVoice : startVoice}
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                  isListening
                    ? "bg-[#fdf2f0] text-[#D95C4A] animate-pulse"
                    : "text-[#9CA3AF] hover:text-[#6B7280] hover:bg-[#F1EEE6]"
                }`}
              >
                {isListening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                {isListening ? "Arrêter" : "Parler"}
              </button>
              <button
                onClick={handleCreate}
                className="flex items-center gap-2 pl-4 pr-1.5 py-1.5 bg-[#0F172A] text-white text-sm font-medium rounded-xl shadow-[0_1px_3px_rgba(15,23,42,0.3)] hover:bg-[#1E293B] active:scale-[0.98] transition-all duration-200"
              >
                Créer
                <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-white/10">
                  <Send className="w-3.5 h-3.5" />
                </span>
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
                  router.push("/generate");
                }}
                className="text-xs px-3 py-1.5 bg-white border border-[#E7E2D7] text-[#6B7280] rounded-full hover:border-[#14B8A6] hover:text-[#0D9488] hover:bg-[#EEF9F7] transition-all duration-200"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Apps grid */}
      <div className="px-6 pb-16 max-w-7xl mx-auto">
        {apps.length > 0 && (
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xs font-bold text-[#9CA3AF] uppercase tracking-[0.15em]">
              Mes projets récents
            </h2>
            <Link
              href="/generate"
              className="flex items-center gap-1.5 text-xs font-medium text-[#0D9488] hover:text-[#0F172A] transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Nouveau projet
            </Link>
          </div>
        )}

        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
          </div>
        ) : apps.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white border border-[#E7E2D7] shadow-[0_4px_16px_rgba(115,100,70,0.06)] flex items-center justify-center mb-5">
              <Sparkles className="w-7 h-7 text-[#14B8A6]" strokeWidth={1.5} />
            </div>
            <h3 className="text-lg font-semibold text-[#111827] mb-2">Votre atelier est vide</h3>
            <p className="text-sm text-[#6B7280] max-w-xs mb-6 leading-relaxed">
              Décrivez votre premier outil ci-dessus et Batify le construira pour vous en quelques secondes.
            </p>
            <button
              onClick={() => router.push("/generate")}
              className="flex items-center gap-2 pl-5 pr-2 py-2.5 bg-[#0F172A] text-white text-sm font-medium rounded-full shadow-[0_1px_3px_rgba(15,23,42,0.3)] hover:bg-[#1E293B] transition-all"
            >
              Créer ma première app
              <span className="flex items-center justify-center w-7 h-7 rounded-full bg-white/10">
                <ArrowUpRight className="w-4 h-4" />
              </span>
            </button>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {apps.map((app, i) => (
              <AppPreviewCard
                key={app.id}
                app={app}
                index={i}
                onDelete={() => handleDelete(app.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
