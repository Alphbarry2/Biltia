"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import {
  Activity as ActivityIcon,
  Sparkles,
  Pencil,
  Trash2,
  Download,
  Send,
  FileText,
  Loader2,
  Plus,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Activité — « Ce que Batify a fait pour vous ».
// Flux lu depuis activity_logs (RLS scope le tenant). Peut être vide au début.
// ─────────────────────────────────────────────────────────────────────────────

type Log = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  description: string | null;
  created_at: string;
};

const ACTION_STYLE: Record<string, { icon: LucideIcon; cls: string }> = {
  create: { icon: Plus, cls: "text-emerald-600 bg-emerald-50" },
  generate: { icon: Sparkles, cls: "text-violet-600 bg-violet-50" },
  update: { icon: Pencil, cls: "text-sky-600 bg-sky-50" },
  delete: { icon: Trash2, cls: "text-rose-600 bg-rose-50" },
  export: { icon: Download, cls: "text-indigo-600 bg-indigo-50" },
  send: { icon: Send, cls: "text-amber-600 bg-amber-50" },
  document: { icon: FileText, cls: "text-indigo-600 bg-indigo-50" },
};

const styleFor = (action: string) =>
  ACTION_STYLE[action] ?? { icon: ActivityIcon, cls: "text-[#6E6E6C] bg-black/[0.04]" };

function humanize(log: Log) {
  if (log.description) return log.description;
  const verbs: Record<string, string> = {
    create: "Création", generate: "Génération", update: "Mise à jour",
    delete: "Suppression", export: "Export", send: "Envoi",
  };
  const verb = verbs[log.action] ?? log.action;
  return `${verb} · ${log.entity_type}`;
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const midnight = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((midnight(today) - midnight(d)) / 86400000);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return "Hier";
  if (diff < 7) return d.toLocaleDateString("fr-FR", { weekday: "long" });
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

export default function ActivityPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("activity_logs")
          .select("id, action, entity_type, entity_id, description, created_at")
          .order("created_at", { ascending: false })
          .limit(100);
        setLogs((data as Log[]) ?? []);
      } catch {
        setLogs([]);
      }
      setLoading(false);
    })();
  }, []);

  // Regroupement par jour, en préservant l'ordre décroissant
  const groups: { label: string; items: Log[] }[] = [];
  for (const log of logs) {
    const label = dayLabel(log.created_at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(log);
    else groups.push({ label, items: [log] });
  }

  return (
    <div className="min-h-full bg-[#FCFCFD]">
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* En-tête */}
        <div className="flex items-center gap-3 mb-1.5">
          <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500/15 to-pink-500/10 flex items-center justify-center">
            <ActivityIcon className="w-5 h-5 text-violet-600" />
          </span>
          <h1 className="text-2xl font-black text-[#0A0A0A] tracking-[-0.03em]">Activité</h1>
        </div>
        <p className="text-[14px] text-[#6E6E6C] mb-8 ml-12">Tout ce que Batify a réalisé pour vous.</p>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-[#9A9A97]">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl border border-[#E7E7EE] bg-[#FAFAFC] flex items-center justify-center mb-5">
              <ActivityIcon className="w-7 h-7 text-violet-600" strokeWidth={1.5} />
            </div>
            <h3 className="text-lg font-bold text-[#0A0A0A] mb-2 tracking-[-0.01em]">Aucune activité pour l&apos;instant</h3>
            <p className="text-sm text-[#6E6E6C] max-w-sm leading-relaxed mb-6">
              Dès que Batify créera un document, enverra un devis ou générera une application,
              vous le verrez apparaître ici, jour après jour.
            </p>
            <Link href="/dashboard" className="text-[13px] font-semibold text-violet-600 hover:opacity-80 transition-opacity">
              Résoudre un premier problème
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            {groups.map((group) => (
              <div key={group.label}>
                <h2 className="text-[12px] font-semibold uppercase tracking-wide text-[#9A9A97] mb-3 first-letter:uppercase">
                  {group.label}
                </h2>
                <div className="relative pl-2">
                  {/* Ligne de temps */}
                  <div className="absolute left-[19px] top-2 bottom-2 w-px bg-[#EDEDE9]" />
                  <div className="space-y-1">
                    {group.items.map((log) => {
                      const { icon: Icon, cls } = styleFor(log.action);
                      return (
                        <div key={log.id} className="relative flex items-center gap-3.5 py-2">
                          <span className={`relative z-10 w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ring-4 ring-[#FCFCFD] ${cls}`}>
                            <Icon className="w-[18px] h-[18px]" />
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[14px] text-[#0A0A0A] leading-snug">{humanize(log)}</p>
                          </div>
                          <span className="text-[12px] text-[#9A9A97] tabular-nums flex-shrink-0">
                            {fmtTime(log.created_at)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
