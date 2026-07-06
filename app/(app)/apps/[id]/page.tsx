"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { ShareMenu } from "@/components/share-menu";
import { ChevronLeft, Pencil, Loader2, AlertCircle, ExternalLink, Maximize2, Globe, Copy, CheckCircle } from "lucide-react";

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
      const apiUrl = (body as { __endpoint?: string } | null)?.__endpoint === "app-ai" ? "/api/app-ai" : "/api/data";
      fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
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
  }, []);

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
            onClick={handleDeploy}
            disabled={isDeploying}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#7C3AED] text-white text-xs font-semibold rounded-lg hover:bg-[#6D28D9] transition-all disabled:opacity-60"
            title="Déployer sur Vercel"
          >
            {isDeploying ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : deploymentUrl ? (
              <CheckCircle className="w-3.5 h-3.5" />
            ) : (
              <Globe className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">
              {isDeploying ? "Déploiement…" : deploymentUrl ? "Redéployer" : "Publier"}
            </span>
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

      {/* Deployment URL bar */}
      {deploymentUrl && (
        <div className="flex items-center gap-2 px-5 py-2.5 bg-[#F3EFFC] border-b border-[#E2D9F8] flex-shrink-0">
          <Globe className="w-3.5 h-3.5 text-[#7C3AED] flex-shrink-0" />
          <span className="text-xs text-[#7C3AED] font-medium flex-shrink-0 hidden sm:inline">Déployé :</span>
          <code className="text-xs text-[#0A0A0A] bg-white border border-[#E2D9F8] rounded-md px-2 py-1 truncate flex-1 min-w-0">
            {deploymentUrl}
          </code>
          <button
            onClick={() => { navigator.clipboard.writeText(deploymentUrl); setDeployCopied(true); setTimeout(() => setDeployCopied(false), 2000); }}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-[#7C3AED] text-white text-xs font-semibold rounded-md hover:bg-[#6D28D9] transition-all flex-shrink-0"
          >
            {deployCopied ? <CheckCircle className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            <span className="hidden sm:inline">{deployCopied ? "Copié" : "Copier"}</span>
          </button>
          <a
            href={deploymentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 text-[#7C3AED] hover:text-[#0A0A0A] rounded-md hover:bg-white transition-colors flex-shrink-0"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
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
