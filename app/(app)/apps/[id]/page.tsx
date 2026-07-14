"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { injectAppBrand } from "@/lib/app-brand";
import { brandFromTenant } from "@/lib/brand";
import { ShareMenu } from "@/components/share-menu";
import { type ShareLink } from "@/lib/share";
import { useT } from "@/lib/i18n/context";
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
  const t = useT();
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
  // L'app est rendue dans DEUX iframes distinctes selon le mode (normal / plein
  // écran). Le pont doit reconnaître les deux comme légitimes : sans cette
  // seconde référence, la garde de provenance rejetterait tous les appels faits
  // depuis le plein écran et l'app y serait muette.
  const fsIframeRef = useRef<HTMLIFrameElement>(null);

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
      } else alert(data.error ?? t("Impossible de créer le lien client.", "Couldn't create the client link."));
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
      else alert(data.error ?? t("Impossible de créer le lien.", "Couldn't create the link."));
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
        alert(data.error ?? t("Erreur de déploiement.", "Deployment error."));
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
        setError(t("Authentification requise.", "Authentication required."));
        setLoading(false);
        return;
      }
      // La RLS garantit que seules les apps du tenant de l'user sont accessibles
      supabase
        .from("modules")
        .select("id, name, description, html_content, kind, created_at, tenant_id")
        .eq("id", id)
        .neq("status", "archived")
        .single()
        .then(async ({ data, error }) => {
          if (error || !data) {
            setError(t("Application introuvable ou accès refusé.", "App not found or access denied."));
            setLoading(false);
            return;
          }
          // Le logo de l'entreprise coiffe l'en-tête, même sur une app créée AVANT
          // que l'artisan ne le pose (on injecte à l'affichage, pas à la génération).
          let html = data.html_content as string;
          try {
            if (data.tenant_id) {
              const { data: tenant } = await supabase
                .from("tenants")
                .select("name, logo_url, company_info")
                .eq("id", data.tenant_id)
                .maybeSingle();
              if (tenant) html = injectAppBrand(html, brandFromTenant(tenant));
            }
          } catch {
            /* pas d'identité visuelle → l'en-tête garde le nom de l'entreprise */
          }
          setApp({ ...data, html_content: html });
          setLoading(false);
        });
    });
  }, [id]);

  // Pont app↔serveur : window.biltia (données + IA) doit fonctionner dans une app
  // OUVERTE/DÉPLOYÉE, pas seulement dans le générateur. L'iframe ne fait jamais
  // fetch elle-même → elle envoie BILTIA_API_CALL, on proxifie en same-origin
  // (cookies = auth, RLS = isolation du tenant). Route vers /api/app-ai pour l'IA.
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      // GARDE DE PROVENANCE — ne PAS retirer. Ce pont proxifie /api/* avec les
      // cookies de session : n'accepter que les messages émis par l'une de NOS
      // deux iframes (normale ou plein écran). Sans ce contrôle, tout site tiers
      // capable de nous poster un message pilotait l'API au nom de l'utilisateur.
      const source = event.source as Window | null;
      const frame =
        source && source === iframeRef.current?.contentWindow
          ? iframeRef.current.contentWindow
          : source && source === fsIframeRef.current?.contentWindow
            ? fsIframeRef.current.contentWindow
            : null;
      if (!frame) return;

      if (event.data?.type !== "BILTIA_API_CALL") return;
      const { id: callId, body } = event.data as { id: string; body: unknown };
      // Cible explicite (jamais '*') : on répond à l'iframe vérifiée ci-dessus.
      const reply = (payload: Record<string, unknown>) => {
        frame.postMessage({ type: "BILTIA_API_RESPONSE", id: callId, ...payload }, window.location.origin);
      };
      const ep = (body as { __endpoint?: string } | null)?.__endpoint;
      const apiUrl =
        ep === "app-ai" ? "/api/app-ai"
          : ep === "email" ? "/api/app-email"
          : ep === "document" ? "/api/app-document"
          : ep === "sms" ? "/api/app-sms"
          : ep === "agents" ? "/api/app-agents"
          : ep === "telemetry" ? "/api/app-telemetry"
          : "/api/data";
      // /api/data, /api/app-agents et /api/app-telemetry ont besoin de l'id du
      // module : filtrer la LECTURE (data), rattacher/lister les agents (agents),
      // attribuer les événements d'usage à CETTE app (telemetry).
      const outBody =
        (!ep || ep === "agents" || ep === "telemetry") && body && typeof body === "object"
          ? { ...(body as Record<string, unknown>), moduleId: id }
          : body;
      fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(outBody),
      })
        .then(async (res) => {
          const result = await res.json().catch(() => null);
          if (!res.ok) reply({ error: result?.error ?? t(`Erreur ${res.status}`, `Error ${res.status}`) });
          else reply({ result });
        })
        .catch((err: unknown) => reply({ error: err instanceof Error ? err.message : t("Réseau indisponible", "Network unavailable") }));
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
          {t("← Retour au dashboard", "← Back to dashboard")}
        </Link>
      </div>
    );
  }

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col pb-safe">
        <div
          className="flex items-center justify-between px-4 bg-white border-b border-[#ECECF2] flex-shrink-0"
          style={{ height: "calc(3rem + var(--safe-top))", paddingTop: "var(--safe-top)" }}
        >
          <span className="text-sm font-semibold text-[#0A0A0A] truncate pr-3">{app.name}</span>
          <button
            onClick={() => setFullscreen(false)}
            className="flex-shrink-0 text-[#6E6E6C] hover:text-[#0A0A0A] text-xs font-medium border border-[#ECECF2] px-3 h-9 rounded-lg active:scale-95 transition-transform"
          >
            {t("Quitter le plein écran", "Exit full screen")}
          </button>
        </div>
        <iframe
          ref={fsIframeRef}
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
            aria-label={t("Retour", "Back")}
            className="-ml-2 grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg text-[#6E6E6C] hover:bg-black/[0.05] hover:text-[#0A0A0A] active:scale-90 transition-all"
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
            title={t("Plein écran", "Full screen")}
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            onClick={openShare}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              shareOpen ? "bg-[#6D28D9] text-white" : "bg-[#7C3AED] text-white hover:bg-[#6D28D9]"
            }`}
            title={t("Partager cette application", "Share this app")}
          >
            <Share2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t("Partager", "Share")}</span>
          </button>
          <Link
            href={`/generate?edit=${id}`}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F6F6F9] border border-[#ECECF2] text-[#0A0A0A] text-xs font-medium rounded-lg hover:bg-[#F3EFFC] hover:text-[#7C3AED] transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            {t("Modifier", "Edit")}
          </Link>
        </div>
      </div>

      {/* Panneau Partager — plafonné + scrollable pour ne pas écraser l'iframe
          (aperçu de l'app) à zéro sur petit écran quand tout est déplié. */}
      {shareOpen && (
        <div className="border-b border-[#ECECF2] bg-[#FBFAFF] flex-shrink-0 max-h-[55dvh] overflow-y-auto">
          <div className="px-5 py-4 max-w-[820px]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-[#0A0A0A]">{t("Partager cette application", "Share this app")}</h2>
                <p className="text-xs text-[#6E6E6C] mt-0.5 leading-relaxed">
                  {t("Créez un lien de consultation en lecture seule. Toute personne ayant le lien voit l'application, jamais vos autres données. Le lien est révocable à tout moment.", "Create a read-only view link. Anyone with the link sees the app, never your other data. The link is revocable at any time.")}
                </p>
              </div>
              <button
                onClick={() => setShareOpen(false)}
                className="p-1 text-[#9A9AA5] hover:text-[#0A0A0A] rounded-md hover:bg-[#F0EEF8] flex-shrink-0"
                title={t("Fermer", "Close")}
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
                      <span className="hidden sm:inline">{shareCopiedId === link.id ? t("Copié", "Copied") : t("Copier", "Copy")}</span>
                    </button>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 text-[#6E6E6C] hover:text-[#7C3AED] rounded-md hover:bg-[#F6F6F9] transition-colors flex-shrink-0"
                      title={t("Ouvrir le lien", "Open link")}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <button
                      onClick={() => revokeShare(link.id)}
                      className="p-1.5 text-[#6E6E6C] hover:text-rose-600 rounded-md hover:bg-rose-50 transition-colors flex-shrink-0"
                      title={t("Révoquer le lien", "Revoke link")}
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
              {shareLinks.length > 0 ? t("Nouveau lien", "New link") : t("Créer un lien de consultation", "Create a view link")}
            </button>
            {!shareLoaded && (
              <p className="mt-2 text-xs text-[#9A9AA5] flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" /> {t("Chargement des liens…", "Loading links…")}
              </p>
            )}

            {/* Partager avec un client : lien scopé à UN chantier (lecture seule) */}
            {chantiers.length > 0 && (
              <div className="mt-4 pt-3 border-t border-[#ECECF2]">
                <div className="flex items-center gap-1.5 mb-1">
                  <HardHat className="w-3.5 h-3.5 text-emerald-600" />
                  <h3 className="text-xs font-semibold text-[#0A0A0A]">{t("Partager avec un client", "Share with a client")}</h3>
                </div>
                <p className="text-xs text-[#6E6E6C] leading-relaxed mb-2">
                  {t("Un lien qui montre uniquement le chantier choisi (avec ses interventions, documents et tâches), en lecture seule. Le client ne voit rien d'autre de votre espace.", "A link that shows only the chosen job site (with its jobs, documents and tasks), read-only. The client sees nothing else from your workspace.")}
                </p>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedChantier}
                    onChange={(e) => setSelectedChantier(e.target.value)}
                    className="flex-1 min-w-0 text-xs bg-white border border-[#ECECF2] rounded-lg px-2.5 py-1.5 text-[#0A0A0A]"
                  >
                    <option value="">{t("Choisir un chantier…", "Choose a job site…")}</option>
                    {chantiers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nom || t("Chantier", "Job site")}
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
                    {t("Créer le lien", "Create link")}
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
                {showAdvanced ? "− " : "+ "}{t("Déploiement autonome (avancé)", "Standalone deployment (advanced)")}
              </button>
              {showAdvanced && (
                <div className="mt-2">
                  <p className="text-xs text-[#9A9AA5] leading-relaxed mb-2">
                    {t("Héberge une copie détachée de l'app sur un domaine séparé (non connectée à votre espace). Pour un simple partage, utilisez le lien de consultation ci-dessus.", "Hosts a detached copy of the app on a separate domain (not connected to your workspace). For simple sharing, use the view link above.")}
                  </p>
                  <button
                    onClick={handleDeploy}
                    disabled={isDeploying}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F6F6F9] border border-[#ECECF2] text-[#0A0A0A] text-xs font-medium rounded-lg hover:bg-[#F3EFFC] transition-colors disabled:opacity-60"
                  >
                    {isDeploying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
                    {isDeploying ? t("Déploiement…", "Deploying…") : deploymentUrl ? t("Redéployer", "Redeploy") : t("Déployer sur un domaine autonome", "Deploy to a standalone domain")}
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
                        <span className="hidden sm:inline">{deployCopied ? t("Copié", "Copied") : t("Copier", "Copy")}</span>
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
