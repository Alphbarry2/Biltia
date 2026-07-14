"use client";

// ─────────────────────────────────────────────────────────────────────────────
// GALERIE D'AGENTS PRÊTS À L'EMPLOI — « un clic = activé ».
//
// Cartes SIMPLES (choix user 2026-07-09 : « moins de texte, plus lisible ») :
// icône · titre · UNE phrase · prix · bouton. « Activer » POST /api/agents/activate
// → une vraie règle exécutable est écrite. Marque les modèles déjà activés
// (lecture de meta.template_id via /api/agents). Réutilisée dans la page Modèles
// (dashboard) ET dans la page Agents (sidebar).
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import {
  FileText,
  Banknote,
  AlertTriangle,
  ShieldCheck,
  ClipboardCheck,
  Wallet,
  CalendarDays,
  Sunrise,
  BarChart3,
  PackageOpen,
  Bot,
  Check,
  Loader2,
  Info,
  X,
  ArrowRight,
  Plug,
  CheckCircle,
} from "lucide-react";
import { AGENT_TEMPLATES, localizeAgentTemplate, type AgentTemplate } from "@/lib/agent-templates";
import { connectorsForCapability } from "@/lib/connectors";
import { connectViaPopup } from "@/lib/connect-popup";
import { useT, useLocale } from "@/lib/i18n/context";

// Manque de capacité renvoyé par le preflight (/api/agents/activate → gaps).
// Type local : la définition serveur (lib/agent-readiness) n'est pas importable ici.
type Gap = {
  code: string;
  severity: "block" | "warn";
  title: string;
  detail: string;
  fix?: { label: string; href: string };
};
type Gate = { template: AgentTemplate; blocked: boolean; gaps: Gap[] };

const ICONS: Record<string, typeof Bot> = {
  FileText,
  Banknote,
  AlertTriangle,
  ShieldCheck,
  ClipboardCheck,
  Wallet,
  CalendarDays,
  Sunrise,
  BarChart3,
  PackageOpen,
  Bot,
};

type Flash = { id: string; msg: string; kind: "ok" | "err" };

export function AgentTemplateGallery({
  query = "",
  className = "",
  onActivated,
}: {
  query?: string;
  className?: string;
  /** Appelé après une activation réussie (ex : recharger la liste des agents). */
  onActivated?: () => void;
}) {
  const tr = useT();
  const locale = useLocale();
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  // Pop-up « il manque X » : ouverte quand le preflight remonte des manques
  // (bloquants → activation refusée ; recommandations → activé mais à finir).
  const [gate, setGate] = useState<Gate | null>(null);

  // Modèles déjà activés dans cet espace (meta.template_id) → badge « Activé ».
  const loadActive = useCallback(async () => {
    try {
      const res = await fetch("/api/agents");
      const data = await res.json();
      if (res.ok) {
        const ids = new Set<string>();
        for (const r of (data.rules ?? []) as { meta?: { template_id?: string } }[]) {
          const tid = r?.meta?.template_id;
          if (typeof tid === "string" && tid) ids.add(tid);
        }
        setActiveIds(ids);
      }
    } catch {
      // silencieux : la galerie reste utilisable même si la liste ne charge pas
    }
  }, []);

  useEffect(() => {
    loadActive();
  }, [loadActive]);

  async function activate(t: AgentTemplate) {
    setBusy(t.id);
    setFlash(null);
    try {
      const res = await fetch("/api/agents/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: t.id }),
      });
      const data = await res.json();
      const gaps: Gap[] = Array.isArray(data.gaps) ? data.gaps : [];
      if (res.ok && data.ok) {
        // Activé : on marque la carte. S'il reste des recommandations
        // (notifications non activées, agenda…), on ouvre la pop-up pour les finir.
        setActiveIds((prev) => new Set(prev).add(t.id));
        onActivated?.();
        if (gaps.length) {
          setGate({ template: t, blocked: false, gaps });
        } else {
          // Plus aucun manque : on referme la pop-up (cas d'une relance après
          // connexion inline) et on confirme sur la carte.
          setGate(null);
          setFlash({
            id: t.id,
            msg: data.alreadyActive ? tr("Déjà dans vos agents.", "Already in your agents.") : tr("Activé — il travaille pour vous.", "Activated — it's working for you."),
            kind: "ok",
          });
        }
      } else if (gaps.length) {
        // Refusé faute de capacité : pop-up « cette action ne peut pas être faite ».
        setGate({ template: t, blocked: true, gaps });
      } else {
        setFlash({ id: t.id, msg: data.error || data.message || tr("Activation impossible.", "Activation failed."), kind: "err" });
      }
    } catch {
      setFlash({ id: t.id, msg: tr("Activation impossible. Réessayez.", "Activation failed. Try again."), kind: "err" });
    }
    setBusy(null);
  }

  // Nom / accroche / prix de l'agent dans la langue de l'interface (la recherche
  // porte donc sur le texte réellement affiché).
  const templates = AGENT_TEMPLATES.map((tpl) => localizeAgentTemplate(tpl, locale));

  const q = query.trim().toLowerCase();
  const list = q
    ? templates.filter((t) => `${t.name} ${t.tagline}`.toLowerCase().includes(q))
    : templates;

  if (list.length === 0) {
    return (
      <p className="text-[13px] text-[#9A9A97] py-8 text-center">{tr("Aucun agent ne correspond.", "No agent matches.")}</p>
    );
  }

  return (
    <>
    <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 ${className}`}>
      {list.map((t) => {
        const Icon = ICONS[t.icon] ?? Bot;
        const isActive = activeIds.has(t.id);
        const isBusy = busy === t.id;
        const showFlash = flash?.id === t.id;
        return (
          <div
            key={t.id}
            className="flex flex-col rounded-2xl border border-[#EAEAEF] bg-white p-4 transition-colors hover:border-[#D8D0F0]"
          >
            {/* Icône + titre + la phrase */}
            <div className="flex items-start gap-3">
              <span
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: `${t.accent}12` }}
              >
                <Icon className="w-[20px] h-[20px]" style={{ color: t.accent }} strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-[14px] font-semibold text-[#1A1A1A] leading-tight">{t.name}</h3>
                <p className="text-[12.5px] text-[#7A7A85] leading-snug mt-1">{t.tagline}</p>
              </div>
            </div>

            {/* Prix + action */}
            <div className="flex items-center justify-between gap-2 mt-4">
              {t.free ? (
                <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-emerald-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {tr("Gratuit", "Free")}
                </span>
              ) : (
                <span className="text-[11.5px] font-medium text-[#9A9A97] tabular-nums">{t.pricing}</span>
              )}

              {isActive ? (
                <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-emerald-600">
                  <Check className="w-3.5 h-3.5" /> {tr("Activé", "Active")}
                </span>
              ) : (
                <button
                  onClick={() => activate(t)}
                  disabled={isBusy}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#0A0A0A] px-4 py-1.5 text-[12.5px] font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : tr("Activer", "Activate")}
                </button>
              )}
            </div>

            {showFlash && (
              <p className={`text-[11.5px] mt-2 ${flash?.kind === "ok" ? "text-emerald-600" : "text-rose-500"}`}>
                {flash?.msg}
              </p>
            )}
          </div>
        );
      })}
    </div>

    {gate && (
      <GateDialog
        gate={gate}
        busy={busy === gate.template.id}
        onRetry={() => activate(gate.template)}
        onClose={() => setGate(null)}
      />
    )}
    </>
  );
}

// ── Bouton « Connecter » inline dans la pop-up ───────────────────────────────
// Pour un manque qui se règle par une CONNEXION (Gmail, agenda…) : au lieu d'un
// lien qui envoie sur la page Connexions, on ouvre le flux OAuth en pop-up et,
// au retour, on relance l'activation (onConnected) → le preflight repasse et
// l'agent démarre. Une intégration à la fois, dans la pop-up.
function GapConnectButton({
  connectorId,
  accent,
  onConnected,
}: {
  connectorId: string;
  accent: string;
  onConnected: () => void;
}) {
  const tr = useT();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const go = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    const r = await connectViaPopup(connectorId);
    setBusy(false);
    if (r.ok) {
      setDone(true);
      onConnected();
    } else if (!r.canceled) {
      setErr(r.error ?? tr("Connexion impossible.", "Connection failed."));
    }
  };

  if (done) {
    return (
      <span className="inline-flex items-center gap-1 mt-2 text-[12px] font-semibold text-emerald-600">
        <CheckCircle className="w-3.5 h-3.5" /> {tr("Connecté", "Connected")}
      </span>
    );
  }
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={go}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        style={{ background: accent }}
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plug className="w-3.5 h-3.5" />}
        {tr("Connecter", "Connect")}
      </button>
      {err && <p className="text-[11px] text-rose-600 leading-snug mt-1">{err}</p>}
    </div>
  );
}

// ── Pop-up « il manque X » ────────────────────────────────────────────────────
// Rendue quand le preflight remonte des manques. Deux tons : BLOQUÉ (rose,
// activation impossible → bouton « Réessayer » une fois corrigé) et ACTIVÉ MAIS À
// FINIR (ambre, recommandations → bouton « Compris »). Chaque manque a son bouton
// pour aller le corriger (Connexions, Notifications, Workspace).
function GateDialog({
  gate,
  busy,
  onRetry,
  onClose,
}: {
  gate: Gate;
  busy: boolean;
  onRetry: () => void;
  onClose: () => void;
}) {
  const tr = useT();
  const blocked = gate.blocked;
  const accent = blocked ? "#E11D48" : "#D97706"; // rose vs ambre
  return (
    <div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-[2px] p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md max-h-[92dvh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl border border-[#EAEAEF] shadow-xl pb-safe sm:pb-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête */}
        <div className="flex items-start gap-3 p-5 pb-3">
          <span
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: `${accent}14` }}
          >
            {blocked ? (
              <AlertTriangle className="w-[18px] h-[18px]" style={{ color: accent }} strokeWidth={2.2} />
            ) : (
              <Info className="w-[18px] h-[18px]" style={{ color: accent }} strokeWidth={2.2} />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-semibold text-[#1A1A1A] leading-tight">
              {blocked ? tr("Activation impossible", "Can't activate") : tr("Agent activé — à finir", "Agent activated — finish setup")}
            </h3>
            <p className="text-[12.5px] text-[#7A7A85] leading-snug mt-1">
              {blocked
                ? tr(`« ${gate.template.name} » a besoin de ceci avant de pouvoir travailler.`, `“${gate.template.name}” needs this before it can work.`)
                : tr(`« ${gate.template.name} » est en place. Pour qu'il soit pleinement efficace :`, `“${gate.template.name}” is set up. To make it fully effective:`)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-[#9A9A97] hover:bg-[#F2F2F0] transition-colors"
            aria-label={tr("Fermer", "Close")}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Liste des manques */}
        <div className="px-5 pb-2 space-y-2.5">
          {gate.gaps.map((g) => {
            const c = g.severity === "block" ? "#E11D48" : "#D97706";
            return (
              <div key={g.code} className="flex items-start gap-2.5 rounded-xl border border-[#EEEEF2] bg-[#FAFAFB] p-3">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: c }} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-[#1A1A1A] leading-tight">{g.title}</p>
                  <p className="text-[12px] text-[#7A7A85] leading-snug mt-0.5">{g.detail}</p>
                  {connectorsForCapability(g.code).length > 0 ? (
                    // Manque réglable par connexion → boutons inline (popup), puis
                    // relance de l'activation à la connexion. Plusieurs boutons quand
                    // plusieurs fournisseurs conviennent (Gmail OU Outlook) : l'artisan
                    // branche la messagerie qu'il a déjà, pas celle qu'on préfère.
                    <div className="flex flex-wrap items-center gap-2">
                      {connectorsForCapability(g.code).map((connectorId) => (
                        <GapConnectButton
                          key={connectorId}
                          connectorId={connectorId}
                          accent={c}
                          onConnected={onRetry}
                        />
                      ))}
                    </div>
                  ) : (
                    g.fix && (
                      <a
                        href={g.fix.href}
                        className="inline-flex items-center gap-1 mt-2 text-[12px] font-semibold hover:opacity-80 transition-opacity"
                        style={{ color: c }}
                      >
                        {g.fix.label}
                        <ArrowRight className="w-3.5 h-3.5" />
                      </a>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 p-4 pt-3">
          {blocked ? (
            <>
              <button
                onClick={onClose}
                className="rounded-full border border-[#E7E7E4] px-4 py-1.5 text-[12.5px] font-semibold text-[#0A0A0A] hover:border-[#C9BEF0] transition-colors"
              >
                {tr("Fermer", "Close")}
              </button>
              <button
                onClick={onRetry}
                disabled={busy}
                className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#0A0A0A] px-4 py-1.5 text-[12.5px] font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : tr("Réessayer", "Retry")}
              </button>
            </>
          ) : (
            <button
              onClick={onClose}
              className="rounded-full bg-[#0A0A0A] px-4 py-1.5 text-[12.5px] font-semibold text-white hover:opacity-90 transition-opacity"
            >
              {tr("Compris", "Got it")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
