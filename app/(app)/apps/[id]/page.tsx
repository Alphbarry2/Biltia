"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { ShareMenu } from "@/components/share-menu";
import { type ShareLink } from "@/lib/share";
import { ChevronLeft, Pencil, Loader2, AlertCircle, ExternalLink, Maximize2, Globe, Copy, CheckCircle, Share2, Trash2, X, Eye, HardHat } from "lucide-react";

type SharedLink = ShareLink & { url: string };

type App = {
  id: string;
  name: string;
  description: string;
  html_content: string;
  kind: string | null;
  created_at: string | null;
};

export default function AppViewerPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [app, setApp] = useState<App | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deploymentUrl, setDeploymentUrl] = useState<string | null>(null);
  const [deployCopied, setDeployCopied] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // ── Partage : lien de consultation (lecture seule, révocable) ──────────────
  const [shareOpen, setShareOpen] = useState(false);
  const [shareLinks, setShareLinks] = useState<SharedLink[]>([]);
  const [shareLoaded, setShareLoaded] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareCopiedId, setShareCopiedId] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [chantiers, setChantiers] = useState<{ id: string; nom?: string; ville?: string }[]>([]);
  const [selectedChantier, setSelectedChantier] = useState("");
  const [clientBusy, setClientBusy] = useState(false);

  const loadShares = async () => {
    try {
      const res = await fetch(`/api/share?appId=${id}`);
      const data = await res.json();
      if (Array.isArray(data.links)) setShareLinks(data.links);
    } finally {
      setShareLoaded(true);
    }
  };

  // Chantiers du workspace → cible d'un lien « client » (portail scopé).
  const loadChantiers = async () => {
    try {
      const res = await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity: "chantiers", action: "list" }),
      });
      const data = await res.json();
      if (Array.isArray(data.data)) setChantiers(data.data);
    } catch {
      /* pas de chantiers → la section client ne s'affiche pas */
    }
  };

  const openShare = () => {
    const next = !shareOpen;
    setShareOpen(next);
    if (next && !shareLoaded) {
      loadShares();
      loadChantiers();
    }
  };

  const createClientShare = async () => {
    if (clientBusy || !selectedChantier) return;
    setClientBusy(true);
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appId: id,
          kind: "client",
          scope: { entity: "chantiers", record_id: selectedChantier },
        }),
      });
      const data = await res.json();
      if (data.link) {
        setShareLinks((prev) => [data.link, ...prev]);
        setSelectedChantier("");
      } else alert(data.error ?? "Impossible de créer le lien client.");
    } finally {
      setClientBusy(false);
    }
  };

  const createShare = async () => {
    if (shareBusy) return;
    setShareBusy(true);
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId: id }),
      });
      const data = await res.json();
      if (data.link) setShareLinks((prev) => [data.link, ...prev]);
      else alert(data.error ?? "Impossible de créer le lien.");
    } finally {
      setShareBusy(false);
    }
  };

  const revokeShare = async (linkId: string) => {
    setShareLinks((prev) => prev.filter((l) => l.id !== linkId));
    await fetch("/api/share", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linkId }),
    }).catch(() => {});
  };

  const copyShare = (link: SharedLink) => {
    navigator.clipboard.writeText(link.url);
    setShareCopiedId(link.id);
    setTimeout(() => setShareCopiedId((cur) => (cur === link.id ? null : cur)), 2000);
  };

  const handleDeploy = async () => {
    if (isDeploying) return;
    setIsDeploying(true);
    try {
      const res = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId: id }),
      });
      const data = await res.json();
      if (data.url) {
        setDeploymentUrl(data.url);
      } else {
        alert(data.error ?? "Erreur de déploiement.");
      }
    } finally {
      setIsDeploying(false);
    }
  };

  useEffect(() => {
    const supabase = createClient();
    // Vérifier d'abord que l'user est authentifié
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        setError("Authentification requise.");
        setLoading(false);
        return;
      }
      // La RLS garantit que seules les apps du tenant de l'user sont accessibles
      supabase
        .from("modules")
        .select("id, name, description, html_content, kind, created_at")
        .eq("id", id)
        .neq("status", "archived")
        .single()
        .then(({ data, error }) => {
          if (error || !data) {
            setError("Application introuvable ou accès refusé.");
          } else {
            setApp(data);
          }
          setLoading(false);
        });
    });
  }, [id]);

  // Pont app↔serveur : window.biltia (données + IA) doit fonctionner dans une app
  // OUVERTE/DÉPLOYÉE, pas seulement dans le générateur. L'iframe (origin:null) ne
  // peut pas fetch → elle envoie BILTIA_API_CALL, on proxifie en same-origin
  // (cookies = auth, RLS = isolation du tenant). Route vers /api/app-ai pour l'IA.
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type !== "BILTIA_API_CALL") return;
      const { id: callId, body } = event.data as { id: string; body: unknown };
      const reply = (payload: Record<string, unknown>) => {
        const target = (event.source as Window | null) ?? iframeRef.current?.contentWindow ?? null;
        target?.postMessage({ type: "BILTIA_API_RESPONSE", id: callId, ...payload }, "*");
      };
      const ep = (body as { __endpoint?: string } | null)?.__endpoint;
      const apiUrl =
        ep === "app-ai" ? "/api/app-ai" : ep === "email" ? "/api/app-email" : ep === "sms" ? "/api/app-sms" : "/api/data";
      // Sur /api/data on joint l'id du module : le serveur lit sa portée de données
      // (modules.data_scope) et filtre la LECTURE en conséquence (vierge/import/
      // sélection). Les écritures ignorent la portée → tout va au workspace.
      const outBody =
        !ep && body && typeof body === "object" ? { ...(body as Record<string, unknown>), moduleId: id } : body;
      fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(outBody),
      })
        .then(async (res) => {
          const result = await res.json().catch(() => null);
          if (!res.ok) reply({ error: result?.error ?? `Erreur ${res.status}` });
          else reply({ result });
        })
        .catch((err: unknown) => reply({ error: err instanceof Error ? err.message : "Réseau indisponible" }));
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 text-[#7C3AED] animate-spin" />
      </div>
    );
  }

  if (error || !app) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="w-12 h-12 rounded-xl bg-rose-50 border border-[#ECECF2] flex items-center justify-center">
          <AlertCircle className="w-6 h-6 text-rose-600" />
        </div>
        <p className="text-[#6E6E6C] text-sm">{error}</p>
        <Link href="/dashboard" className="text-[#7C3AED] text-sm hover:text-[#0A0A0A]">
          ← Retour au dashboard
        </Link>
      </div>
    );
  }

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col">
        <div className="flex items-center justify-between px-4 h-12 bg-white border-b border-[#ECECF2] flex-shrink-0">
          <span className="text-sm font-semibold text-[#0A0A0A]">{app.name}</span>
          <button
            onClick={() => setFullscreen(false)}
            className="text-[#6E6E6C] hover:text-[#0A0A0A] text-xs border border-[#ECECF2] px-3 py-1 rounded-lg"
          >
            Quitter le plein écran
          </button>
        </div>
        <iframe
          srcDoc={app.html_content}
          sandbox="allow-scripts allow-forms allow-same-origin allow-modals"
          allow="camera; microphone; geolocation; clipboard-write"
          className="flex-1 w-full border-0"
          title={app.name}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 h-14 border-b border-[#ECECF2] bg-white flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => router.push("/dashboard")}
            className="text-[#6E6E6C] hover:text-[#0A0A0A] transition-colors flex-shrink-0"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="font-bold text-[#0A0A0A] text-sm truncate">{app.name}</h1>
            <p className="text-xs text-[#6E6E6C] truncate hidden sm:block">{app.description}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Document officiel : envoi direct au client (WhatsApp, email, PDF). */}
          {app.kind === "document" && (
            <ShareMenu
              getDocument={() => iframeRef.current?.contentDocument ?? null}
              title={app.name}
            />
          )}
          <button
            onClick={() => setFullscreen(true)}
            className="p-1.5 text-[#6E6E6C] hover:text-[#0A0A0A] rounded-lg hover:bg-[#F6F6F9] transition-colors"
            title="Plein écran"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            onClick={openShare}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              shareOpen ? "bg-[#6D28D9] text-white" : "bg-[#7C3AED] text-white hover:bg-[#6D28D9]"
            }`}
            title="Partager cette application"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Partager</span>
          </button>
          <Link
            href={`/generate?edit=${id}`}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F6F6F9] border border-[#ECECF2] text-[#0A0A0A] text-xs font-medium rounded-lg hover:bg-[#F3EFFC] hover:text-[#7C3AED] transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            Modifier
          </Link>
        </div>
      </div>

      {/* Panneau Partager */}
      {shareOpen && (
        <div className="border-b border-[#ECECF2] bg-[#FBFAFF] flex-shrink-0">
          <div className="px-5 py-4 max-w-[820px]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-[#0A0A0A]">Partager cette application</h2>
                <p className="text-xs text-[#6E6E6C] mt-0.5 leading-relaxed">
                  Créez un lien de consultation en <strong>lecture seule</strong>. Toute personne ayant le lien voit
                  l&apos;application, jamais vos autres données. Le lien est révocable à tout moment.
                </p>
              </div>
              <button
                onClick={() => setShareOpen(false)}
                className="p-1 text-[#9A9AA5] hover:text-[#0A0A0A] rounded-md hover:bg-[#F0EEF8] flex-shrink-0"
                title="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Liste des liens existants */}
            {shareLoaded && shareLinks.length > 0 && (
              <div className="mt-3 space-y-2">
                {shareLinks.map((link) => (
                  <div
                    key={link.id}
                    className="flex items-center gap-2 bg-white border border-[#ECECF2] rounded-lg px-2.5 py-2"
                  >
                    {link.kind === "client" ? (
                      <HardHat className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                    ) : (
                      <Eye className="w-3.5 h-3.5 text-[#7C3AED] flex-shrink-0" />
                    )}
                    <code className="text-xs text-[#0A0A0A] truncate flex-1 min-w-0">{link.url}</code>
                    <button
                      onClick={() => copyShare(link)}
                      className="flex items-center gap-1.5 px-2.5 py-1 bg-[#7C3AED] text-white text-xs font-semibold rounded-md hover:bg-[#6D28D9] transition-all flex-shrink-0"
                    >
                      {shareCopiedId === link.id ? <CheckCircle className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      <span className="hidden sm:inline">{shareCopiedId === link.id ? "Copié" : "Copier"}</span>
                    </button>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 text-[#6E6E6C] hover:text-[#7C3AED] rounded-md hover:bg-[#F6F6F9] transition-colors flex-shrink-0"
                      title="Ouvrir le lien"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <button
                      onClick={() => revokeShare(link.id)}
                      className="p-1.5 text-[#6E6E6C] hover:text-rose-600 rounded-md hover:bg-rose-50 transition-colors flex-shrink-0"
                      title="Révoquer le lien"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Créer un lien */}
            <button
              onClick={createShare}
              disabled={shareBusy}
              className="mt-3 flex items-center gap-1.5 px-3 py-1.5 bg-[#7C3AED] text-white text-xs font-semibold rounded-lg hover:bg-[#6D28D9] transition-all disabled:opacity-60"
            >
              {shareBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5" />}
              {shareLinks.length > 0 ? "Nouveau lien" : "Créer un lien de consultation"}
            </button>
            {!shareLoaded && (
              <p className="mt-2 text-xs text-[#9A9AA5] flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" /> Chargement des liens…
              </p>
            )}

            {/* Partager avec un client : lien scopé à UN chantier (lecture seule) */}
            {chantiers.length > 0 && (
              <div className="mt-4 pt-3 border-t border-[#ECECF2]">
                <div className="flex items-center gap-1.5 mb-1">
                  <HardHat className="w-3.5 h-3.5 text-emerald-600" />
                  <h3 className="text-xs font-semibold text-[#0A0A0A]">Partager avec un client</h3>
                </div>
                <p className="text-xs text-[#6E6E6C] leading-relaxed mb-2">
                  Un lien qui montre <strong>uniquement le chantier choisi</strong> (avec ses interventions,
                  documents et tâches), en lecture seule. Le client ne voit rien d&apos;autre de votre espace.
                </p>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedChantier}
                    onChange={(e) => setSelectedChantier(e.target.value)}
                    className="flex-1 min-w-0 text-xs bg-white border border-[#ECECF2] rounded-lg px-2.5 py-1.5 text-[#0A0A0A]"
                  >
                    <option value="">Choisir un chantier…</option>
                    {chantiers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nom || "Chantier"}
                        {c.ville ? ` — ${c.ville}` : ""}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={createClientShare}
                    disabled={clientBusy || !selectedChantier}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 transition-all disabled:opacity-50 flex-shrink-0"
                  >
                    {clientBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <HardHat className="w-3.5 h-3.5" />}
                    Créer le lien
                  </button>
                </div>
              </div>
            )}

            {/* Avancé : déploiement autonome (Vercel) — replié, non prioritaire */}
            <div className="mt-4 pt-3 border-t border-[#ECECF2]">
              <button
                onClick={() => setShowAdvanced((v) => !v)}
                className="text-xs text-[#9A9AA5] hover:text-[#6E6E6C]"
              >
                {showAdvanced ? "− " : "+ "}Déploiement autonome (avancé)
              </button>
              {showAdvanced && (
                <div className="mt-2">
                  <p className="text-xs text-[#9A9AA5] leading-relaxed mb-2">
                    Héberge une copie détachée de l&apos;app sur un domaine séparé (non connectée à votre espace).
                    Pour un simple partage, utilisez le lien de consultation ci-dessus.
                  </p>
                  <button
                    onClick={handleDeploy}
                    disabled={isDeploying}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F6F6F9] border border-[#ECECF2] text-[#0A0A0A] text-xs font-medium rounded-lg hover:bg-[#F3EFFC] transition-colors disabled:opacity-60"
                  >
                    {isDeploying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
                    {isDeploying ? "Déploiement…" : deploymentUrl ? "Redéployer" : "Déployer sur un domaine autonome"}
                  </button>
                  {deploymentUrl && (
                    <div className="mt-2 flex items-center gap-2 bg-white border border-[#ECECF2] rounded-lg px-2.5 py-2">
                      <Globe className="w-3.5 h-3.5 text-[#7C3AED] flex-shrink-0" />
                      <code className="text-xs text-[#0A0A0A] truncate flex-1 min-w-0">{deploymentUrl}</code>
                      <button
                        onClick={() => { navigator.clipboard.writeText(deploymentUrl); setDeployCopied(true); setTimeout(() => setDeployCopied(false), 2000); }}
                        className="flex items-center gap-1.5 px-2.5 py-1 bg-[#7C3AED] text-white text-xs font-semibold rounded-md hover:bg-[#6D28D9] transition-all flex-shrink-0"
                      >
                        {deployCopied ? <CheckCircle className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        <span className="hidden sm:inline">{deployCopied ? "Copié" : "Copier"}</span>
                      </button>
                      <a href={deploymentUrl} target="_blank" rel="noopener noreferrer" className="p-1.5 text-[#6E6E6C] hover:text-[#7C3AED] rounded-md hover:bg-[#F6F6F9] transition-colors flex-shrink-0">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* App iframe */}
      <div className="flex-1 bg-white overflow-hidden">
        <iframe
          ref={iframeRef}
          srcDoc={app.html_content}
          sandbox="allow-scripts allow-forms allow-same-origin allow-modals"
          allow="camera; microphone; geolocation; clipboard-write"
          className="w-full h-full border-0"
          title={app.name}
        />
      </div>
    </div>
  );
}
