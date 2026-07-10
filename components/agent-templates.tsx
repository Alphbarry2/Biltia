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
} from "lucide-react";
import { AGENT_TEMPLATES, type AgentTemplate } from "@/lib/agent-templates";

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
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);

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
      if (res.ok && data.ok) {
        setActiveIds((prev) => new Set(prev).add(t.id));
        setFlash({
          id: t.id,
          msg: data.alreadyActive ? "Déjà dans vos agents." : "Activé — il travaille pour vous.",
          kind: "ok",
        });
        onActivated?.();
      } else {
        setFlash({ id: t.id, msg: data.error || "Activation impossible.", kind: "err" });
      }
    } catch {
      setFlash({ id: t.id, msg: "Activation impossible. Réessayez.", kind: "err" });
    }
    setBusy(null);
  }

  const q = query.trim().toLowerCase();
  const list = q
    ? AGENT_TEMPLATES.filter((t) => `${t.name} ${t.tagline}`.toLowerCase().includes(q))
    : AGENT_TEMPLATES;

  if (list.length === 0) {
    return (
      <p className="text-[13px] text-[#9A9A97] py-8 text-center">Aucun agent ne correspond.</p>
    );
  }

  return (
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
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Gratuit
                </span>
              ) : (
                <span className="text-[11.5px] font-medium text-[#9A9A97] tabular-nums">{t.pricing}</span>
              )}

              {isActive ? (
                <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-emerald-600">
                  <Check className="w-3.5 h-3.5" /> Activé
                </span>
              ) : (
                <button
                  onClick={() => activate(t)}
                  disabled={isBusy}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#0A0A0A] px-4 py-1.5 text-[12.5px] font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Activer"}
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
  );
}
