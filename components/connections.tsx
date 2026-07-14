"use client";

// ─────────────────────────────────────────────────────────────────────────────
// CONNECTEURS — UI partagée entre la page /connectors, le widget modal et le
// badge d'accueil « Connectez vos outils ».
//
// Trois états par connecteur (cf. lib/connectors.ts) :
//   · Intégré      → marche sans connexion (WhatsApp, exports, téléphone)
//   · Connecté     → compte OAuth relié, Biltia peut agir dans les automatisations
//   · À connecter  → bouton « Connecter » (flux OAuth Google / Microsoft)
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plug,
  Puzzle,
  Smartphone,
  FileSpreadsheet,
  Loader2,
  CheckCircle,
  X,
  ArrowRight,
} from "lucide-react";
import {
  CONNECTORS,
  connectorStatus,
  connectorName,
  connectorDesc,
  connectorWorks,
  connectorCannot,
  connectorHrefLabel,
  type ConnectionInfo,
  type Connector,
} from "@/lib/connectors";
import { useT, useLocale } from "@/lib/i18n/context";

const EASE = [0.16, 1, 0.3, 1] as const;

// ── État des connexions (hook partagé) ──────────────────────────────────────

function useConnections() {
  const [connections, setConnections] = useState<ConnectionInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/connections");
      const json = await res.json();
      setConnections(Array.isArray(json.connections) ? json.connections : []);
    } catch {
      setConnections([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { connections, loading, refresh };
}

// ── Icône de secours quand un connecteur n'a pas de logo ────────────────────

function FallbackIcon({ id }: { id: string }) {
  if (id === "phone") return <Smartphone className="w-4 h-4 text-[#7C3AED]" />;
  if (id.startsWith("export")) return <FileSpreadsheet className="w-4 h-4 text-[#7C3AED]" />;
  return <Puzzle className="w-4 h-4 text-[#7C3AED]" />;
}

// ── Carte d'un connecteur ────────────────────────────────────────────────────

function ConnectorCard({
  connector,
  connections,
  onChanged,
  className,
}: {
  connector: Connector;
  connections: ConnectionInfo[];
  onChanged: () => void;
  /** Placement dans la grille de l'appelant (ex : occuper la ligne entière). */
  className?: string;
}) {
  const t = useT();
  const locale = useLocale();
  const status = connectorStatus(connector, connections);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", connectorId: connector.id }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error ?? t("Connexion impossible.", "Connection failed."));
      window.location.href = json.url; // → consentement Google / Microsoft
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Connexion impossible.", "Connection failed."));
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (busy) return;
    const family = connector.provider === "google" ? "Google" : "Microsoft";
    if (
      !window.confirm(
        t(
          `Déconnecter votre compte ${family} ? Tous les outils ${family} connectés (email, agenda, stockage) seront déconnectés.`,
          `Disconnect your ${family} account? All connected ${family} tools (email, calendar, storage) will be disconnected.`,
        )
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disconnect", provider: connector.provider }),
      });
      if (!res.ok) throw new Error(t("Déconnexion impossible.", "Disconnection failed."));
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Déconnexion impossible.", "Disconnection failed."));
    } finally {
      setBusy(false);
    }
  };

  // « soon » = déclaré mais aucun code ne lit le jeton. Pas de bouton, pas de
  // faux « Connecté ✅ » : la carte s'estompe et annonce l'attente.
  const soon = status === "soon";

  return (
    <div className={`flex flex-col gap-2.5 rounded-xl border border-[#EDEDF2] bg-white p-4 ${soon ? "opacity-70" : ""} ${className ?? ""}`}>
      <div className="flex items-center gap-2.5 min-w-0">
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${connector.logo ? "bg-white border border-[#EDEDF2]" : "bg-[#F3EFFC]"} ${soon ? "grayscale" : ""}`}>
          {connector.logo ? (
            <Image src={connector.logo} alt={t(`Logo ${connector.name}`, `${connector.name} logo`)} width={20} height={20} className="w-5 h-5 object-contain" />
          ) : (
            <FallbackIcon id={connector.id} />
          )}
        </span>
        <span className="text-[13.5px] font-semibold text-[#0A0A0A] truncate">{connectorName(connector, locale)}</span>
        {soon && (
          <span className="ml-auto flex-shrink-0 rounded-full border border-[#E4E4EA] bg-[#F5F5F7] px-2 py-0.5 text-[10.5px] font-bold text-[#8B8B96]">
            {t("Bientôt", "Soon")}
          </span>
        )}
        {status === "builtin" && (
          <span className="ml-auto flex-shrink-0 rounded-full border border-[#E2D9F8] bg-[#F3EFFC] px-2 py-0.5 text-[10.5px] font-bold text-[#7C3AED]">
            {t("Intégré", "Built-in")}
          </span>
        )}
        {status === "connected" && (
          <span className="ml-auto flex-shrink-0 inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10.5px] font-bold text-emerald-600">
            <CheckCircle className="w-3 h-3" /> {t("Connecté", "Connected")}
          </span>
        )}
      </div>

      <p className="text-[12px] text-[#9A9A97] leading-snug">{connectorDesc(connector, locale)}</p>
      {status === "disconnected" && connector.works && (
        <p className="text-[11px] text-[#B4ADC4] leading-snug">{connectorWorks(connector, locale)}</p>
      )}
      {/* Pour un « soon », cannot[0] dit ce qui couvre le besoin en attendant. */}
      {soon && connectorCannot(connector, locale)[0] && (
        <p className="text-[11px] text-[#B4ADC4] leading-snug">{connectorCannot(connector, locale)[0]}</p>
      )}
      {error && <p className="text-[11px] text-rose-600 leading-snug">{error}</p>}

      <div className="mt-auto flex items-center gap-3 pt-1">
        {status === "disconnected" && (
          <button
            type="button"
            onClick={connect}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0A0A0A] px-3 py-1.5 text-[12px] font-semibold text-white shadow-[0_4px_14px_rgba(60,40,120,0.08)] hover:shadow-[0_8px_24px_rgba(60,40,120,0.12)] transition-all disabled:opacity-60"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plug className="w-3.5 h-3.5" />}
            {t("Connecter", "Connect")}
          </button>
        )}
        {status === "connected" && (
          <button
            type="button"
            onClick={disconnect}
            disabled={busy}
            className="text-[12px] font-semibold text-[#9A9A97] hover:text-rose-600 transition-colors disabled:opacity-60"
          >
            {busy ? "…" : t("Déconnecter", "Disconnect")}
          </button>
        )}
        {connector.href && (
          <a
            href={connector.href}
            target={connector.href.startsWith("/") ? undefined : "_blank"}
            rel="noopener noreferrer"
            className="text-[12px] font-semibold text-violet-600 hover:opacity-80 transition-opacity"
          >
            {connectorHrefLabel(connector, locale) ?? t("Ouvrir", "Open")} ↗
          </a>
        )}
      </div>
    </div>
  );
}

// ── Panneau complet (page + widget) ──────────────────────────────────────────

export function ConnectionsPanel() {
  const t = useT();
  const { connections, loading, refresh } = useConnections();
  const [banner, setBanner] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  // Retour du flux OAuth : ?connected= / ?error= / ?canceled= dans l'URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const error = params.get("error");
    if (connected) {
      const fam = connected === "google" ? "Google" : "Microsoft";
      setBanner({ tone: "ok", text: t(`Compte ${fam} connecté.`, `${fam} account connected.`) });
    } else if (error) {
      setBanner({ tone: "error", text: error });
    }
    if (connected || error || params.get("canceled")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  return (
    <div>
      {banner && (
        <div
          className={`mb-4 rounded-xl border px-3.5 py-2.5 text-[13px] font-medium ${
            banner.tone === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-rose-200 bg-rose-50 text-rose-600"
          }`}
        >
          {banner.text}
        </div>
      )}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-5 h-5 text-[#7C3AED] animate-spin" />
        </div>
      ) : (
        // Deux blocs distincts : ce qui demande une ACTION de l'artisan (brancher son
        // compte), puis ce qui marche déjà tout seul. Mélangés dans une seule grille,
        // une carte « Intégré » se retrouvait à côté d'un bouton « Connecter » sur la
        // même ligne — l'œil ne savait plus ce qu'il restait à faire.
        <div className="space-y-6">
          <div>
            <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[#9A9A97]">
              {t("À connecter", "To connect")}
            </p>
            {/* Google à gauche, Microsoft à droite : l'artisan descend SA colonne. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {CONNECTORS.filter((c) => c.kind === "oauth").map((c) => (
                <ConnectorCard key={c.id} connector={c} connections={connections} onChanged={refresh} />
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[#9A9A97]">
              {t("Intégré — rien à connecter", "Built-in — nothing to connect")}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {CONNECTORS.filter((c) => c.kind === "builtin").map((c) => (
                <ConnectorCard
                  key={c.id}
                  connector={c}
                  connections={connections}
                  onChanged={refresh}
                  // WhatsApp est le seul « intégré » sur lequel l'artisan CLIQUE
                  // vraiment (ouvrir une conversation). Il occupe la ligne entière,
                  // ce qui laisse les exports côte à côte, puis SMS et Téléphone
                  // côte à côte tout en bas — ceux-là ne s'ouvrent même pas.
                  className={c.id === "whatsapp" ? "sm:col-span-2" : undefined}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Widget modal (ouvert depuis le badge d'accueil) ──────────────────────────

export function ConnectionsWidget({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/30 backdrop-blur-[2px]"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.22, ease: EASE }}
            className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-[#ECE7F6] bg-white p-6 shadow-[0_30px_80px_rgba(60,40,120,0.28)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-1">
              <h2 className="text-lg font-bold text-[#0A0A0A] tracking-[-0.01em]">{t("Connectez vos outils", "Connect your tools")}</h2>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg hover:bg-black/[0.05] flex items-center justify-center text-[#9A9A97] hover:text-[#0A0A0A] transition-colors flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[13px] text-[#6E6E6C] mb-5">
              {t("Connectés, vos outils laissent Biltia agir pour vous : envoyer un devis, créer un rendez-vous, sauvegarder un PDF. Les outils « Intégré » marchent déjà sans connexion.", "Once connected, your tools let Biltia act for you: send a quote, create an appointment, save a PDF. “Built-in” tools already work without any connection.")}
            </p>
            <ConnectionsPanel />
            <div className="mt-5 text-right">
              <Link
                href="/connectors"
                onClick={onClose}
                className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-violet-600 hover:opacity-80 transition-opacity"
              >
                {t("Voir la page Connecteurs", "See the Connectors page")} <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

// ── Badge d'accueil : logos + « Connectez vos outils » → widget ──────────────

const BADGE_LOGOS = [
  { src: "/logos/google-calendar.webp", alt: "Google Calendar" },
  { src: "/logos/whatsapp.png", alt: "WhatsApp" },
  { src: "/logos/gmail.webp", alt: "Gmail" },
];

export function ConnectToolsBadge() {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="glass inline-flex items-center gap-2.5 px-3.5 py-1.5 text-[#4A4A56] text-[13px] font-medium rounded-full mb-7 hover:text-[#0A0A0A] transition-colors"
      >
        <span className="flex -space-x-1.5">
          {BADGE_LOGOS.map((l) => (
            <span
              key={l.src}
              className="w-[18px] h-[18px] rounded-full bg-white border border-[#ECECF2] flex items-center justify-center overflow-hidden"
            >
              <Image src={l.src} alt={l.alt} width={12} height={12} className="w-3 h-3 object-contain" />
            </span>
          ))}
        </span>
        {t("Connectez vos outils", "Connect your tools")}
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
      <ConnectionsWidget open={open} onClose={() => setOpen(false)} />
    </>
  );
}
