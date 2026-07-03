"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { ChevronLeft, Pencil, Loader2, AlertCircle, ExternalLink, Maximize2, Globe, Copy, CheckCircle } from "lucide-react";

type App = {
  id: string;
  name: string;
  description: string;
  html_content: string;
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
        .select("id, name, description, html_content, created_at")
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 text-accent animate-spin" />
      </div>
    );
  }

  if (error || !app) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="w-12 h-12 rounded-xl bg-[#fdf2f0] border border-border flex items-center justify-center">
          <AlertCircle className="w-6 h-6 text-danger" />
        </div>
        <p className="text-muted-foreground text-sm">{error}</p>
        <Link href="/dashboard" className="text-accent-deep text-sm hover:text-foreground">
          ← Retour au dashboard
        </Link>
      </div>
    );
  }

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-card flex flex-col">
        <div className="flex items-center justify-between px-4 h-12 bg-card border-b border-border flex-shrink-0">
          <span className="text-sm font-semibold text-foreground">{app.name}</span>
          <button
            onClick={() => setFullscreen(false)}
            className="text-muted-foreground hover:text-foreground text-xs border border-border px-3 py-1 rounded-lg"
          >
            Quitter le plein écran
          </button>
        </div>
        <iframe
          srcDoc={app.html_content}
          sandbox="allow-scripts allow-forms allow-same-origin"
          className="flex-1 w-full border-0"
          title={app.name}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 h-14 border-b border-border bg-card flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => router.push("/dashboard")}
            className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="font-display font-bold text-foreground text-sm truncate">{app.name}</h1>
            <p className="text-xs text-muted-foreground truncate hidden sm:block">{app.description}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setFullscreen(true)}
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
            title="Plein écran"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleDeploy}
            disabled={isDeploying}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0D9488] text-white text-xs font-semibold rounded-lg hover:bg-[#0f766e] transition-all disabled:opacity-60"
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
            className="flex items-center gap-1.5 px-3 py-1.5 bg-muted border border-border text-foreground text-xs font-medium rounded-lg hover:bg-accent-soft hover:text-accent-deep transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            Modifier
          </Link>
        </div>
      </div>

      {/* Deployment URL bar */}
      {deploymentUrl && (
        <div className="flex items-center gap-2 px-5 py-2.5 bg-[#f0fdfa] border-b border-[#99f6e4] flex-shrink-0">
          <Globe className="w-3.5 h-3.5 text-[#0D9488] flex-shrink-0" />
          <span className="text-xs text-[#0D9488] font-medium flex-shrink-0 hidden sm:inline">Déployé :</span>
          <code className="text-xs text-foreground bg-white border border-[#99f6e4] rounded-md px-2 py-1 truncate flex-1 min-w-0">
            {deploymentUrl}
          </code>
          <button
            onClick={() => { navigator.clipboard.writeText(deploymentUrl); setDeployCopied(true); setTimeout(() => setDeployCopied(false), 2000); }}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-[#0D9488] text-white text-xs font-semibold rounded-md hover:bg-[#0f766e] transition-all flex-shrink-0"
          >
            {deployCopied ? <CheckCircle className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            <span className="hidden sm:inline">{deployCopied ? "Copié" : "Copier"}</span>
          </button>
          <a
            href={deploymentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 text-[#0D9488] hover:text-foreground rounded-md hover:bg-white transition-colors flex-shrink-0"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

      {/* App iframe */}
      <div className="flex-1 bg-white overflow-hidden">
        <iframe
          srcDoc={app.html_content}
          sandbox="allow-scripts allow-forms allow-same-origin"
          className="w-full h-full border-0"
          title={app.name}
        />
      </div>
    </div>
  );
}
