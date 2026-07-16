"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { injectInterfaceWordmark } from "@/lib/app-brand";
import { ShareMenu } from "@/components/share-menu";
import { type ShareLink } from "@/lib/share";
import { requiresBiltiaHost } from "@/lib/app-connectivity";
import { createBridgeHandler } from "@/lib/app-bridge";
import { ConnectCard } from "@/components/connect-card";
import { useSession } from "@/components/session-provider";
import { useT } from "@/lib/i18n/context";
import { ChevronLeft, Pencil, Loader2, AlertCircle, ExternalLink, Maximize2, Copy, CheckCircle, Share2, Trash2, X, Eye, HardHat } from "lucide-react";

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
  const [teamCopied, setTeamCopied] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // L'app est rendue dans DEUX iframes distinctes selon le mode (normal / plein
  // écran). Le pont doit reconnaître les deux comme légitimes : sans cette
  // seconde référence, la garde de provenance rejetterait tous les appels faits
  // depuis le plein écran et l'app y serait muette.
  const fsIframeRef = useRef<HTMLIFrameElement>(null);

  // Une action de l'app (« Ajouter au calendrier »…) a échoué faute de connecteur :
  // carte(s) affichée(s) PAR-DESSUS l'app. Pas de retry auto après connexion (le
  // SDK a un timeout de 30 s, trop court pour un aller-retour OAuth) — l'app a déjà
  // affiché son toast d'erreur habituel, le PROCHAIN clic aboutira une fois connecté.
  const [appConnectPrompt, setAppConnectPrompt] = useState<string[] | null>(null);

  // ── Partage : lien de consultation (lecture seule, révocable) ──────────────
  const [shareOpen, setShareOpen] = useState(false);
  const [shareLinks, setShareLinks] = useState<SharedLink[]>([]);
  const [shareLoaded, setShareLoaded] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareCopiedId, setShareCopiedId] = useState<string | null>(null);
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

  // Lien ÉQUIPE : /a/<id>, l'app SANS le châssis Biltia (cf. app/a/[id]). C'est
  // celui qu'on envoie à un employé, et pas /apps/<id> : ouvert sur son téléphone,
  // il l'installe en un tap et l'app devient une icône sur son écran d'accueil.
  // Il reste identifié (ses données, sa RLS), mais il n'a plus l'impression
  // d'entrer dans un logiciel.
  const teamUrl = typeof window !== "undefined" ? `${window.location.origin}/a/${id}` : "";
  const copyTeamLink = () => {
    navigator.clipboard.writeText(teamUrl);
    setTeamCopied(true);
    setTimeout(() => setTeamCopied(false), 2000);
  };

  // Une app reliée au workspace ne peut pas être servie hors de Biltia sans un
  // répondeur : pas de lien de consultation « nu » (il gèlerait), seulement le
  // lien équipe ci-dessus ou le lien client scopé plus bas.
  const connected = requiresBiltiaHost(app?.html_content);

  // Ouvrir une app enchaînait TROIS allers-retours EN SÉRIE : getUser() → modules →
  // tenants. Le dernier ne sert qu'au LOGO, et il était imbriqué DANS le .then() du
  // module : l'application entière attendait une décoration.
  //
  // Maintenant : getUser() vient de la session partagée (zéro réseau), et le module
  // et l'identité visuelle partent EN PARALLÈLE — on connaît déjà le workspace actif.
  // Cas rare (app d'un AUTRE workspace que l'actif) : on rattrape avec une seconde
  // requête, mais on ne fait plus payer ce détour à tout le monde.
  const { user, membership, loading: sessionLoading } = useSession();

  useEffect(() => {
    if (sessionLoading) return;
    if (!user) {
      setError(t("Authentification requise.", "Authentication required."));
      setLoading(false);
      return;
    }
    const supabase = createClient();
    let cancelled = false;

    (async () => {
      // La RLS garantit que seules les apps du tenant de l'user sont accessibles.
      const { data, error } = await supabase
        .from("modules")
        .select("id, name, description, html_content, kind, created_at, tenant_id")
        .eq("id", id)
        .neq("status", "archived")
        .single();
      if (cancelled) return;

      if (error || !data) {
        setError(t("Application introuvable ou accès refusé.", "App not found or access denied."));
        setLoading(false);
        return;
      }

      // L'en-tête de l'app (l'OUTIL de l'artisan) porte le logo BILTIA complet, posé
      // à l'affichage — les apps déjà créées en profitent sans régénération, et le
      // nom de l'app quitte l'en-tête. Le logo de l'ARTISAN, lui, coiffe ses
      // DOCUMENTS et ses portails clients, pas son propre outil.
      const html = injectInterfaceWordmark(data.html_content as string);
      if (cancelled) return;
      setApp({ ...data, html_content: html });
      setLoading(false);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, sessionLoading, user, membership?.tenant_id]);

  // Pont app↔serveur : l'iframe ne fait jamais fetch elle-même (elle poste
  // BILTIA_API_CALL), la page proxifie en same-origin. La logique — dont la garde
  // de provenance — vit dans lib/app-bridge, partagée avec l'app plein écran :
  // deux copies finiraient par diverger, et c'est la garde qui empêche un site
  // tiers de piloter l'API au nom de l'utilisateur.
  useEffect(() => {
    const handler = createBridgeHandler({
      moduleId: id,
      // L'app est rendue dans DEUX iframes selon le mode (normal / plein écran) :
      // les deux sont légitimes. Sans la seconde, l'app serait muette en plein écran.
      resolveFrame: (source) =>
        source && source === iframeRef.current?.contentWindow
          ? source
          : source && source === fsIframeRef.current?.contentWindow
            ? source
            : null,
      labels: {
        httpError: (status) => t(`Erreur ${status}`, `Error ${status}`),
        network: t("Réseau indisponible", "Network unavailable"),
      },
      onNeedsConnect: (connectors) => setAppConnectPrompt(connectors),
    });
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        <div className="relative flex-1">
          <iframe
            ref={fsIframeRef}
            srcDoc={app.html_content}
            sandbox="allow-scripts allow-forms allow-same-origin allow-modals"
            allow="camera; microphone; geolocation; clipboard-write"
            className="w-full h-full border-0"
            title={app.name}
          />
          <ConnectPromptOverlay connectors={appConnectPrompt} onDone={() => setAppConnectPrompt(null)} />
        </div>
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
                  {connected
                    ? t("Envoyez ce lien à votre équipe : il ouvre l'application seule, en plein écran, avec vos données. Sur un téléphone, elle s'installe en un tap et devient une icône sur l'écran d'accueil. Pour un client, utilisez le lien client plus bas : il ne montre qu'un chantier, en lecture seule.", "Send this link to your team: it opens the app on its own, full screen, with your data. On a phone, it installs in one tap and becomes an icon on the home screen. For a client, use the client link below: it shows one job site only, read-only.")
                    : t("Créez un lien de consultation en lecture seule. Toute personne ayant le lien voit l'application, jamais vos autres données. Le lien est révocable à tout moment.", "Create a read-only view link. Anyone with the link sees the app, never your other data. The link is revocable at any time.")}
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

            {/* Lien ÉQUIPE — le seul lien « à envoyer » qui affiche les données.
                Sur une app connectée, il REMPLACE le lien de consultation : ce
                dernier n'a pas de répondeur et livrerait une app qui gèle. */}
            {connected ? (
              <div className="mt-3 flex items-center gap-2 bg-white border border-[#ECECF2] rounded-lg px-2.5 py-2">
                <Eye className="w-3.5 h-3.5 text-[#7C3AED] flex-shrink-0" />
                <code className="text-xs text-[#0A0A0A] truncate flex-1 min-w-0">{teamUrl}</code>
                <button
                  onClick={copyTeamLink}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-[#7C3AED] text-white text-xs font-semibold rounded-md hover:bg-[#6D28D9] transition-all flex-shrink-0"
                >
                  {teamCopied ? <CheckCircle className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  <span className="hidden sm:inline">{teamCopied ? t("Copié", "Copied") : t("Copier", "Copy")}</span>
                </button>
              </div>
            ) : (
              <>
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
              </>
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

          </div>
        </div>
      )}

      {/* App iframe */}
      <div className="relative flex-1 bg-white overflow-hidden">
        <iframe
          ref={iframeRef}
          srcDoc={app.html_content}
          sandbox="allow-scripts allow-forms allow-same-origin allow-modals"
          allow="camera; microphone; geolocation; clipboard-write"
          className="w-full h-full border-0"
          title={app.name}
        />
        <ConnectPromptOverlay connectors={appConnectPrompt} onDone={() => setAppConnectPrompt(null)} />
      </div>
    </div>
  );
}

/** Une action de l'app a échoué faute de connecteur : carte(s) par-dessus l'app,
 *  sur fond flouté. Alternatives (Google OU Outlook) — la première connexion
 *  réussie referme l'overlay ; le prochain clic dans l'app aboutira. */
function ConnectPromptOverlay({ connectors, onDone }: { connectors: string[] | null; onDone: () => void }) {
  if (!connectors) return null;
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/25 backdrop-blur-[2px] p-4">
      <div className="flex flex-col items-center gap-3 max-w-sm w-full">
        {connectors.map((cid) => (
          <ConnectCard key={cid} connectorId={cid} onConnected={onDone} onRefused={onDone} />
        ))}
      </div>
    </div>
  );
}
