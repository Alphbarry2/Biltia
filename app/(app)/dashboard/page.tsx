"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { getActiveMembership } from "@/lib/tenant";
import { toPreviewHtml } from "@/lib/app-preview";
import { InteractiveMesh, useTypewriter, TemplateGallery } from "@/components/site";
import { AgentTemplateGallery } from "@/components/agent-templates";
import { VoiceRecorder } from "@/components/voice-recorder";
import { ConnectToolsBadge } from "@/components/connections";
import { useT, useLocale } from "@/lib/i18n/context";
import type { Locale } from "@/lib/i18n/config";
import {
  Sparkles,
  ArrowUpRight,
  Trash2,
  MoreHorizontal,
  ArrowUp,
  Mic,
  Plus,
  Upload,
  Image as ImageIcon,
  Camera,
  MonitorUp,
  Cloud,
  Clock,
  Pencil,
  Link2,
  Check,
  ExternalLink,
  Star,
  ArrowLeftRight,
  Search,
  X,
  FileText,
  Loader2,
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

const DASH_PLACEHOLDERS_FR = [
  "Sors-moi l'avenant pour le carrelage validé, 45 m²…",
  "Quels chantiers sont en retard cette semaine ?",
  "Vérifie les prix de ces 30 bons de livraison…",
  "Un suivi de mes chantiers avec l'avancement…",
  "Rédige une mise en demeure pour la facture impayée…",
];
const DASH_PLACEHOLDERS_EN = [
  "Draft the change order for the approved tiling, 45 m²…",
  "Which job sites are behind schedule this week?",
  "Check the prices on these 30 delivery notes…",
  "A tracker for my job sites with progress…",
  "Draft a formal notice for the unpaid invoice…",
];

function formatRelative(iso: string | null, t: (fr: string, en: string) => string, locale: Locale) {
  if (!iso) return "-";
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return t("Aujourd'hui", "Today");
  if (d === 1) return t("Hier", "Yesterday");
  if (d < 7) return t(`Il y a ${d} jours`, `${d} days ago`);
  return new Date(iso).toLocaleDateString(locale === "en" ? "en-US" : "fr-FR", { day: "numeric", month: "short" });
}

function AppPreviewCard({
  app,
  index,
  onDelete,
  isFavorite,
  onToggleFavorite,
  onRename,
  onTransfer,
}: {
  app: App;
  index: number;
  onDelete: () => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onRename: () => void;
  onTransfer: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  // Aperçu figé : stub des données → pas de « Chargement du workspace… ».
  const preview = useMemo(() => toPreviewHtml(app.html_content), [app.html_content]);

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
        onClick={() => router.push(`/generate?edit=${app.id}`)}
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

        {/* Étoile favori — les favoris sont prioritaires dans l'affichage. */}
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleFavorite(); }}
          title={isFavorite ? t("Retirer des favoris", "Remove from favorites") : t("Mettre en favori", "Add to favorites")}
          className={`absolute top-2.5 right-2.5 z-10 grid h-9 w-9 place-items-center rounded-full bg-white/90 backdrop-blur-sm shadow-[0_2px_10px_rgba(0,0,0,0.14)] active:scale-90 transition-all ${isFavorite ? "" : "opacity-0 group-hover:opacity-100 show-touch"}`}
        >
          <Star className={`w-4 h-4 ${isFavorite ? "fill-amber-400 text-amber-400" : "text-[#9A9A97]"}`} />
        </button>
      </div>

      {/* Card footer */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-[#0A0A0A] truncate">{app.name}</h3>
          <div className="flex items-center gap-1 mt-0.5">
            <Clock className="w-3 h-3 text-[#9A9A97] flex-shrink-0" />
            <p className="text-[11px] text-[#9A9A97]">{formatRelative(app.updated_at, t, locale)}</p>
          </div>
        </div>

        {/* Copier le lien (animé) */}
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            navigator.clipboard
              ?.writeText(`${window.location.origin}/apps/${app.id}`)
              .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); })
              .catch(() => {});
          }}
          title={t("Copier le lien", "Copy link")}
          className={`flex-shrink-0 p-1.5 rounded-lg transition-colors ${copied ? "text-emerald-600 bg-emerald-50" : "text-[#9A9A97] hover:text-[#7C3AED] hover:bg-black/[0.04]"}`}
        >
          {copied ? <Check className="w-4 h-4 animate-scale-in" /> : <Link2 className="w-4 h-4" />}
        </button>

        {/* Menu … : renommer, transférer, ouvrir, supprimer */}
        <div className="relative flex-shrink-0">
          <button
            onClick={(e) => { e.preventDefault(); setMenuOpen(!menuOpen); }}
            className="p-1.5 text-[#9A9A97] hover:text-[#0A0A0A] rounded-lg hover:bg-black/[0.04] transition-colors"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute bottom-full right-0 mb-1 z-20 w-56 origin-bottom-right animate-scale-in bg-white border border-[#E7E7E4] rounded-xl shadow-[0_8px_28px_rgba(0,0,0,0.1)] py-1">
                <button onClick={() => { setMenuOpen(false); onRename(); }} className="flex items-center gap-2.5 w-full px-3 py-2 text-[13px] text-[#2A2A32] hover:bg-[#F4F4F7] transition-colors">
                  <Pencil className="w-3.5 h-3.5 text-[#6E6E6C]" /> {t("Renommer", "Rename")}
                </button>
                <button onClick={() => { setMenuOpen(false); onTransfer(); }} className="flex items-center gap-2.5 w-full px-3 py-2 text-[13px] text-[#2A2A32] hover:bg-[#F4F4F7] transition-colors">
                  <ArrowLeftRight className="w-3.5 h-3.5 text-[#6E6E6C]" /> {t("Transférer vers un espace", "Move to a workspace")}
                </button>
                <a href={`/apps/${app.id}`} target="_blank" rel="noopener" onClick={() => setMenuOpen(false)} className="flex items-center gap-2.5 w-full px-3 py-2 text-[13px] text-[#2A2A32] hover:bg-[#F4F4F7] transition-colors">
                  <ExternalLink className="w-3.5 h-3.5 text-[#6E6E6C]" /> {t("Ouvrir en plein écran", "Open full screen")}
                </a>
                <div className="my-1 border-t border-[#EFEFF3]" />
                <button onClick={() => { onDelete(); setMenuOpen(false); }} className="flex items-center gap-2.5 w-full px-3 py-2 text-[13px] text-[#D95C4A] hover:bg-[#fdf2f0] transition-colors">
                  <Trash2 className="w-3.5 h-3.5" /> {t("Supprimer", "Delete")}
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
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [apps, setApps] = useState<App[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [tab, setTab] = useState<"ateliers" | "modeles">("ateliers");
  // Sous-filtre de l'onglet Modèles : applications à générer vs agents à activer.
  const [modelKind, setModelKind] = useState<"apps" | "agents">("apps");
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [plusOpen, setPlusOpen] = useState(false);
  const [launching, setLaunching] = useState(false);
  const launchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Navigation réussie = page démontée → on annule l'alerte d'échec.
  useEffect(() => {
    return () => {
      if (launchTimerRef.current) clearTimeout(launchTimerRef.current);
    };
  }, []);
  const typed = useTypewriter(locale === "en" ? DASH_PLACEHOLDERS_EN : DASH_PLACEHOLDERS_FR);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onFilesPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length) setFiles((prev) => [...prev, ...picked].slice(0, 6));
    e.target.value = "";
  };
  const removeFile = (i: number) => setFiles((prev) => prev.filter((_, k) => k !== i));

  // Ouvre le sélecteur natif en adaptant le type de fichier / la caméra.
  const openPicker = (opts: { accept: string; capture?: boolean }) => {
    const el = fileInputRef.current;
    if (!el) return;
    el.accept = opts.accept;
    el.multiple = !opts.capture; // la caméra ne prend qu'une photo à la fois
    if (opts.capture) el.setAttribute("capture", "environment");
    else el.removeAttribute("capture");
    el.click();
    setPlusOpen(false);
  };

  // Partage d'écran : capture une image de l'écran choisi et la joint.
  const shareScreen = async () => {
    setPlusOpen(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const md = navigator.mediaDevices as any;
    if (!md?.getDisplayMedia) {
      alert(t("Le partage d'écran n'est pas supporté par ce navigateur.", "Screen sharing isn't supported by this browser."));
      return;
    }
    let stream: MediaStream | null = null;
    try {
      stream = await md.getDisplayMedia({ video: true });
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      await new Promise((r) => setTimeout(r, 250)); // laisser arriver une image
      const w = video.videoWidth || 1280;
      const h = video.videoHeight || 720;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")?.drawImage(video, 0, 0, w, h);
      const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/png"));
      if (blob) {
        const file = new File([blob], `capture-ecran-${Date.now()}.png`, { type: "image/png" });
        setFiles((prev) => [...prev, file].slice(0, 6));
      }
    } catch {
      // annulé par l'utilisateur
    } finally {
      stream?.getTracks().forEach((t) => t.stop());
    }
  };

  const openDrive = () => {
    setPlusOpen(false);
    window.open("https://drive.google.com", "_blank", "noopener,noreferrer");
  };

  const fetchApps = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    // Prénom = premier mot du nom saisi à l'inscription (user_metadata.full_name).
    // Jamais le début de l'email : « Quel problème réglons-nous, mwiatou.barry224 ? »
    // n'a aucun sens. Sans nom → greeting neutre (« … aujourd'hui ? »).
    const nm = ((user.user_metadata?.full_name as string) || "").trim();
    setFirstName(nm.split(" ")[0] ?? "");
    // Une app appartient à un workspace : on ne montre que celles du workspace actif.
    const membership = await getActiveMembership(supabase, user.id);
    if (!membership?.tenant_id) { setApps([]); setLoading(false); return; }
    const { data } = await supabase
      .from("modules")
      .select("id, name, slug, description, html_content, created_at, updated_at")
      .eq("status", "active")
      .eq("tenant_id", membership.tenant_id)
      .order("updated_at", { ascending: false })
      .limit(20);
    setApps(data ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchApps(); }, []);
  useEffect(() => {
    try { setFavorites(new Set(JSON.parse(localStorage.getItem("biltia_favorites") || "[]"))); } catch {}
  }, []);

  // Préchauffe le générateur : l'appui sur Entrée doit ouvrir /generate
  // INSTANTANÉMENT. En dev, ces requêtes compilent la page et la route des
  // questions à l'avance ; en prod, elles priment le cache. Fire-and-forget.
  useEffect(() => {
    router.prefetch("/generate");
    fetch("/generate").catch(() => {});
    fetch("/api/clarify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}", // sans prompt → aucune dépense LLM, juste la compilation
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = () => {
    const trimmed = input.trim();
    if ((!trimmed && files.length === 0) || launching) return;
    // Retour visuel IMMÉDIAT : la compilation de /generate peut prendre 2-3 s
    // en dev — sans spinner, l'envoi paraît mort.
    setLaunching(true);
    // On lance la generation directement : pas d'ecran intermediaire.
    const note = files.length ? `\n\n[${t("Fichiers joints", "Attached files")} : ${files.map((f) => f.name).join(", ")}]` : "";
    sessionStorage.setItem("biltia_prompt", (trimmed || t("Adapte-moi un outil à partir des fichiers joints.", "Build me a tool from the attached files.")) + note);
    sessionStorage.setItem("biltia_autostart", "1");
    router.push("/generate");
    // Toujours là après 10 s = navigation en échec (serveur arrêté, réseau) →
    // on réarme le bouton et on prévient au lieu de rester muet.
    launchTimerRef.current = setTimeout(() => {
      setLaunching(false);
      alert(t("Impossible d'ouvrir le générateur. Vérifiez que le serveur Biltia est bien démarré, puis réessayez.", "Couldn't open the generator. Check that the Biltia server is running, then try again."));
    }, 10000);
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

  const handleDelete = async (id: string) => {
    if (!confirm(t("Supprimer cette application ?", "Delete this app?"))) return;
    const supabase = createClient();
    await supabase.from("modules").update({ status: "archived" }).eq("id", id);
    setApps((prev) => prev.filter((a) => a.id !== id));
  };

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try { localStorage.setItem("biltia_favorites", JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  const renameApp = async (id: string, current: string) => {
    const name = window.prompt(t("Nouveau nom de l'application :", "New app name:"), current)?.trim();
    if (!name || name === current) return;
    await createClient().from("modules").update({ name }).eq("id", id);
    setApps((prev) => prev.map((a) => (a.id === id ? { ...a, name } : a)));
  };

  const transferApp = async (id: string) => {
    try {
      const res = await fetch("/api/workspaces");
      const data = await res.json();
      const spaces: { id: string; name: string; active?: boolean }[] = data?.workspaces ?? [];
      const targets = spaces.filter((s) => !s.active);
      if (!targets.length) {
        alert(t("Vous n'avez qu'un seul espace de travail. Créez-en un autre pour pouvoir transférer.", "You only have one workspace. Create another one to be able to transfer."));
        return;
      }
      const list = targets.map((s, i) => `${i + 1}. ${s.name}`).join("\n");
      const pick = window.prompt(t(`Transférer vers quel espace de travail ?\n\n${list}\n\nEntrez le numéro :`, `Transfer to which workspace?\n\n${list}\n\nEnter the number:`));
      const idx = Number(pick) - 1;
      if (!Number.isInteger(idx) || idx < 0 || idx >= targets.length) return;
      await createClient().from("modules").update({ tenant_id: targets[idx].id }).eq("id", id);
      setApps((prev) => prev.filter((a) => a.id !== id)); // l'app quitte l'espace courant
    } catch {
      alert(t("Transfert impossible. Réessayez.", "Transfer failed. Try again."));
    }
  };

  const hasContent = input.trim().length > 0 || files.length > 0;

  const q = query.trim().toLowerCase();
  const searched = q
    ? apps.filter((a) => `${a.name} ${a.description}`.toLowerCase().includes(q))
    : apps;
  // Favoris TOUJOURS en tête (étoiles prioritaires), puis l'ordre existant.
  const filtered = [...searched].sort(
    (a, b) => (favorites.has(b.id) ? 1 : 0) - (favorites.has(a.id) ? 1 : 0)
  );

  return (
    <div className="relative min-h-full overflow-x-clip bg-[#FCFCFD]">
      {/* Le fond maillé (quadrillage + halos) couvre toute la page : hero ET panneau */}
      <InteractiveMesh strong />

      {/* Accueil plein écran, tout part d'ici (positionné un peu plus bas) */}
      {/* z-20 (et non z-10) : la section « Mes applications » plus bas est AUSSI en
          z-10 et vient APRÈS dans le DOM — à égalité de plan, c'est elle qui gagne.
          Le menu « + » de la barre de chat, tout en étant en z-30, restait donc
          ENFERMÉ dans ce plan-ci et se faisait recouvrir : on voyait « Google Drive »
          coupé en deux. Un z-index n'agit jamais qu'à l'intérieur de son plan. */}
      <section className="relative z-20 min-h-[86dvh] flex flex-col items-center justify-center px-6 pt-[17dvh] pb-14">
        <div className="relative z-10 w-full max-w-[62rem] mx-auto text-center">
          <ConnectToolsBadge />

          <h1 className="text-[40px] sm:text-[58px] font-black text-[#0A0A0A] leading-[1.06] tracking-[-0.035em] mb-9 max-w-3xl mx-auto">
            {t("Quel problème ", "What problem ")}<span className="text-gradient">{t("réglons-nous", "are we solving")}</span>{firstName ? `, ${firstName}` : t(" aujourd’hui", " today")}&nbsp;?
          </h1>

          {/* Barre de chat, style Gemini/Lovable : + à gauche, micro à droite, envoi à la saisie.
              Encadrée par une bordure multicolore animée permanente (.chatframe). */}
          <div className="chatframe">
          <div className="chatcard bg-white rounded-[28px] p-2.5 shadow-[0_18px_50px_rgba(60,40,120,0.10)] text-left">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.csv,.xls,.xlsx,.doc,.docx,.txt"
              onChange={onFilesPicked}
              className="hidden"
            />

            {isListening ? (
              <VoiceRecorder
                initialText={input}
                onCancel={() => setIsListening(false)}
                onCommit={(text) => {
                  setInput(text);
                  setIsListening(false);
                  requestAnimationFrame(() => textareaRef.current?.focus());
                }}
              />
            ) : (
              <>
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

                {files.length > 0 && (
                  <div className="flex flex-wrap gap-2 px-3 pb-2">
                    {files.map((f, i) => {
                      const isImg = f.type.startsWith("image/");
                      return (
                        <div key={i} className="flex items-center gap-2 bg-[#F6F6F9] border border-[#ECECF2] rounded-xl pl-1.5 pr-2 py-1.5 max-w-[190px]">
                          {isImg ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={URL.createObjectURL(f)} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
                          ) : (
                            <span className="w-8 h-8 rounded-lg bg-white border border-[#ECECF2] flex items-center justify-center flex-shrink-0">
                              <FileText className="w-4 h-4 text-[#7C3AED]" />
                            </span>
                          )}
                          <span className="text-[12px] text-[#4A4A56] truncate">{f.name}</span>
                          <button onClick={() => removeFile(i)} aria-label={t("Retirer le fichier", "Remove file")} className="text-[#9A9AA6] hover:text-[#0A0A0A] flex-shrink-0">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 px-2 pb-1">
                  {/* Tout à gauche : le + -> menu (fichiers, photos, caméra, écran, Drive) */}
                  <div className="relative">
                    <button
                      onClick={() => setPlusOpen((v) => !v)}
                      aria-label={t("Ajouter", "Add")}
                      aria-expanded={plusOpen}
                      className={`relative w-10 h-10 flex items-center justify-center rounded-full active:scale-95 transition-all ${
                        plusOpen ? "bg-black/[0.06] text-[#0A0A0A]" : "text-[#4A4A56] hover:bg-black/[0.05]"
                      }`}
                    >
                      <Plus className={`w-5 h-5 transition-transform duration-200 ${plusOpen ? "rotate-45" : ""}`} />
                      {files.length > 0 && !plusOpen && (
                        <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-[#7C3AED] text-white text-[10px] font-bold leading-none">
                          {files.length}
                        </span>
                      )}
                    </button>

                    {plusOpen && (
                      <>
                        <div className="fixed inset-0 z-20" onClick={() => setPlusOpen(false)} />
                        <div className="absolute top-full left-0 mt-2 z-30 w-60 origin-top-left animate-scale-in bg-white border border-[#ECECF2] rounded-2xl shadow-[0_16px_50px_rgba(60,40,120,0.16)] p-1.5">
                          {([
                            { icon: Upload, label: t("Importer des fichiers", "Import files"), onClick: () => openPicker({ accept: "image/*,.pdf,.csv,.xls,.xlsx,.doc,.docx,.txt" }) },
                            { icon: ImageIcon, label: t("Importer des photos", "Import photos"), onClick: () => openPicker({ accept: "image/*" }) },
                            { icon: Camera, label: t("Prendre une photo", "Take a photo"), onClick: () => openPicker({ accept: "image/*", capture: true }) },
                            { icon: MonitorUp, label: t("Partager l'écran", "Share screen"), onClick: shareScreen },
                          ] as const).map(({ icon: Icon, label, onClick }) => (
                            <button
                              key={label}
                              onClick={onClick}
                              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-[13.5px] text-[#2A2A32] hover:bg-[#F4F4F7] transition-colors text-left"
                            >
                              <Icon className="w-[18px] h-[18px] text-[#7C3AED] flex-shrink-0" strokeWidth={1.9} />
                              {label}
                            </button>
                          ))}
                          <div className="my-1 border-t border-[#EFEFF3]" />
                          <button
                            onClick={openDrive}
                            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-[13.5px] text-[#2A2A32] hover:bg-[#F4F4F7] transition-colors text-left"
                          >
                            <Cloud className="w-[18px] h-[18px] text-[#7C3AED] flex-shrink-0" strokeWidth={1.9} />
                            Google Drive
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  {/* À droite : le micro, puis l'envoi qui apparaît dès qu'on écrit */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setIsListening(true)}
                      title={t("Dictée vocale", "Voice dictation")}
                      aria-label={t("Dictée vocale", "Voice dictation")}
                      className="w-10 h-10 flex items-center justify-center rounded-full text-[#4A4A56] hover:bg-black/[0.05] active:scale-95 transition-all"
                    >
                      <Mic className="w-[19px] h-[19px]" />
                    </button>
                    {hasContent && (
                      <button
                        onClick={handleCreate}
                        disabled={launching}
                        aria-label={t("Envoyer", "Send")}
                        className="w-10 h-10 flex items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 via-violet-500 to-pink-500 text-white shadow-[0_6px_20px_rgba(139,92,246,0.4)] hover:shadow-[0_8px_28px_rgba(139,92,246,0.55)] active:scale-95 transition-all duration-200 animate-scale-in disabled:opacity-70"
                      >
                        {launching ? (
                          <Loader2 className="w-[19px] h-[19px] animate-spin" />
                        ) : (
                          <ArrowUp className="w-[19px] h-[19px]" strokeWidth={2.5} />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
          </div>
        </div>
      </section>

      {/* Panneau arrondi et espacé : mes ateliers + modèles, avec recherche (plus large, descendu) */}
      <section className="relative z-10 px-4 sm:px-6 pt-12 sm:pt-16 pb-20">
        <div className="max-w-[1680px] mx-auto rounded-[28px] bg-white border border-[#ECECF2] shadow-[0_14px_46px_rgba(60,40,120,0.06)] p-5 sm:p-8">
          {/* En-tête discret : onglets + recherche */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <div className="inline-flex items-center gap-1 p-1 bg-[#F4F4F7] rounded-full self-start">
              {([["ateliers", t("Mes ateliers", "My workspaces")], ["modeles", t("Modèles", "Templates")]] as const).map(([id, label]) => (
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
                placeholder={
                  tab === "ateliers"
                    ? t("Rechercher une application…", "Search an app…")
                    : modelKind === "agents"
                      ? t("Rechercher un agent…", "Search an agent…")
                      : t("Rechercher un modèle…", "Search a template…")
                }
                className="bg-transparent outline-none text-sm text-[#0A0A0A] w-full placeholder:text-[#9A9AA6]"
              />
            </div>
          </div>

          {tab === "ateliers" ? (
            loading ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                {[1, 2, 3, 4, 5].map((i) => <SkeletonCard key={i} />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 text-center">
                <div className="w-14 h-14 rounded-2xl border border-[#E7E7EE] bg-[#FAFAFC] flex items-center justify-center mb-4">
                  <Sparkles className="w-6 h-6 text-[#7C3AED]" strokeWidth={1.5} />
                </div>
                <h3 className="text-[15px] font-bold text-[#0A0A0A] mb-1.5 tracking-[-0.01em]">
                  {query ? t("Aucune application trouvée", "No app found") : t("Aucune création pour l’instant", "Nothing created yet")}
                </h3>
                <p className="text-[13px] text-[#6E6E6C] max-w-xs leading-relaxed">
                  {query ? t("Essayez un autre mot-clé, ou lancez une création là-haut.", "Try another keyword, or start a creation above.") : t("Décrivez votre première galère là-haut : Biltia s’occupe du reste.", "Describe your first headache above: Biltia handles the rest.")}
                </p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                {filtered.map((app, i) => (
                  <AppPreviewCard
                    key={app.id}
                    app={app}
                    index={i}
                    onDelete={() => handleDelete(app.id)}
                    isFavorite={favorites.has(app.id)}
                    onToggleFavorite={() => toggleFavorite(app.id)}
                    onRename={() => renameApp(app.id, app.name)}
                    onTransfer={() => transferApp(app.id)}
                  />
                ))}
              </div>
            )
          ) : (
            <>
              {/* Sous-filtre : Applications (à générer) vs Agents IA (à activer). */}
              <div className="inline-flex items-center gap-1 p-1 bg-[#F4F4F7] rounded-full mb-6">
                {(
                  [
                    ["apps", t("Applications", "Apps")],
                    ["agents", t("Agents IA", "AI agents")],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setModelKind(id)}
                    className={`px-4 py-1.5 rounded-full text-[12.5px] font-semibold transition-colors ${
                      modelKind === id
                        ? "bg-white text-[#0A0A0A] shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
                        : "text-[#6E6E7A] hover:text-[#0A0A0A]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {modelKind === "apps" ? (
                <TemplateGallery onUse={useTemplate} query={query} />
              ) : (
                <>
                  <p className="text-[13px] text-[#6E6E6C] mb-5">
                    {t("Activez, l'agent travaille tout seul. Les alertes sont gratuites.", "Turn it on, the agent works on its own. Alerts are free.")}
                  </p>
                  <AgentTemplateGallery query={query} />
                </>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
