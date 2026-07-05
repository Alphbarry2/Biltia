"use client";

// ─────────────────────────────────────────────────────────────────────────────
// /agents — les agents RECRUTÉS (missions permanentes) et leur journal.
//
// Vision « créer + recruter » : on recrute depuis la barre de chat (« relance
// ce client tous les jours à midi ») ; cette page PILOTE — état de chaque
// agent (actif / en pause / bloqué + info manquante à fournir), prochain
// passage, exécution immédiate, et le journal de ce qui a été fait, quand.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Bot,
  Play,
  Pause,
  Trash2,
  Zap,
  Loader2,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Clock,
  Mail,
} from "lucide-react";

type AgentSchedule = { time: string; days: number[]; tz: string };
type AgentMissing = { entity: string; id: string | null; name: string; field: string } | null;

type AgentRule = {
  id: string;
  title: string;
  instruction: string;
  schedule: AgentSchedule;
  action: {
    type: string;
    recipients?: { name: string }[];
    complexity?: string;
    estimatedCreditsPerRun?: number;
  };
  status: string;
  blocked_reason: string | null;
  missing: AgentMissing;
  next_run_at: string | null;
  last_run_at: string | null;
  created_at: string;
};

type AgentRun = {
  id: string;
  rule_id: string;
  run_key: string;
  status: string;
  summary: string;
  error: string | null;
  credits_used: number;
  created_at: string;
};

const DAY_NAMES = ["", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

function describeSchedule(s: AgentSchedule | null | undefined): string {
  if (!s?.time) return "planning à définir";
  const days = (s.days ?? []).filter((d) => d >= 1 && d <= 7);
  const when =
    days.length === 0
      ? "tous les jours"
      : days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))
        ? "du lundi au vendredi"
        : `chaque ${days.map((d) => DAY_NAMES[d]).join(", ")}`;
  return `${when} à ${s.time}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris",
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

const ACTION_LABELS: Record<string, string> = {
  send_email: "Email automatique",
  notify: "Rappel",
  report: "Contrôle + synthèse",
};

export default function AgentsPage() {
  const [rules, setRules] = useState<AgentRule[]>([]);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null); // rule id en cours d'action
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emailInputs, setEmailInputs] = useState<Record<string, string>>({});
  // Message à fournir pour un agent bloqué faute de contenu (« quel message ? »).
  const [contentInputs, setContentInputs] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/agents");
      const data = await res.json();
      if (res.ok) {
        setRules(data.rules ?? []);
        setRuns(data.runs ?? []);
      } else {
        setError(data.error ?? "Chargement impossible.");
      }
    } catch {
      setError("Chargement impossible.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const flash = (msg: string) => {
    setNotice(msg);
    setError(null);
    setTimeout(() => setNotice(null), 4000);
  };

  async function command(id: string, action: string, extra: Record<string, unknown> = {}) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch("/api/agents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Action impossible.");
      } else {
        if (action === "run_now") {
          flash(
            data.outcome?.status === "success"
              ? `✓ Exécuté : ${data.outcome.summary}`
              : `Passage terminé (${data.outcome?.status ?? "?"}) : ${data.outcome?.summary ?? ""}`
          );
        } else if (data.message) {
          flash(data.message);
        } else {
          flash("✓ Fait.");
        }
        await load();
      }
    } catch {
      setError("Action impossible.");
    }
    setBusy(null);
  }

  const statusBadge = (r: AgentRule) => {
    if (r.status === "active")
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
          <CheckCircle className="w-3 h-3" /> Actif
        </span>
      );
    if (r.status === "blocked")
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
          <AlertTriangle className="w-3 h-3" /> Bloqué
        </span>
      );
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#F4F4F2] border border-[#E7E7E4] px-2 py-0.5 text-[11px] font-semibold text-[#6E6E6C]">
        <Pause className="w-3 h-3" /> En pause
      </span>
    );
  };

  const runIcon = (status: string) => {
    if (status === "success") return <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />;
    if (status === "blocked") return <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />;
    if (status === "running") return <Loader2 className="w-3.5 h-3.5 text-violet-500 animate-spin flex-shrink-0" />;
    return <XCircle className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />;
  };

  return (
    <div className="min-h-full bg-[#FCFCFD]">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center gap-3 mb-1.5">
          <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500/15 to-pink-500/10 flex items-center justify-center">
            <Bot className="w-5 h-5 text-violet-600" />
          </span>
          <h1 className="text-2xl font-black text-[#0A0A0A] tracking-[-0.03em]">Agents</h1>
        </div>
        <p className="text-[14px] text-[#6E6E6C] mb-6 ml-12">
          Vos missions déléguées : Biltia les exécute seul, en temps et en heure, et trace chaque
          passage. Recrutez depuis le chat — par exemple : «&nbsp;relance le client Martin tous les
          jours à midi&nbsp;» ou «&nbsp;chaque soir à 18h, vérifie mes factures impayées&nbsp;».
        </p>

        {notice && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-[13px] text-emerald-800">
            {notice}
          </div>
        )}
        {error && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-[13px] text-[#9A9A97] py-10 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
          </div>
        ) : rules.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#E7E7E4] bg-white p-10 text-center">
            <Bot className="w-8 h-8 text-[#C9BEF0] mx-auto mb-3" />
            <p className="text-[14px] font-semibold text-[#0A0A0A] mb-1">Aucun agent recruté pour l&apos;instant</p>
            <p className="text-[13px] text-[#9A9A97] mb-4 max-w-md mx-auto">
              Dictez une mission permanente dans le chat et Biltia s&apos;en occupe désormais —
              relances, rappels, contrôles quotidiens.
            </p>
            <Link
              href="/generate"
              className="inline-flex items-center gap-1.5 rounded-full bg-[#0A0A0A] px-4 py-2 text-[12.5px] font-semibold text-white hover:opacity-90 transition-opacity"
            >
              <Zap className="w-3.5 h-3.5" /> Recruter mon premier agent
            </Link>
          </div>
        ) : (
          <div className="space-y-3 mb-8">
            {rules.map((r) => (
              <div key={r.id} className="rounded-2xl border border-[#EDEDF2] bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[14px] font-semibold text-[#0A0A0A]">{r.title}</p>
                      {statusBadge(r)}
                      <span className="text-[11px] text-[#9A9A97]">
                        {ACTION_LABELS[r.action?.type ?? ""] ?? "Mission"}
                      </span>
                    </div>
                    <p className="text-[12.5px] text-[#6E6E6C] mt-1">
                      {describeSchedule(r.schedule)}
                      {r.status === "active" && r.next_run_at && (
                        <span className="text-[#9A9A97]"> · prochain passage : {formatDate(r.next_run_at)}</span>
                      )}
                      {r.last_run_at && (
                        <span className="text-[#9A9A97]"> · dernier : {formatDate(r.last_run_at)}</span>
                      )}
                    </p>
                    {/* Transparence prix : estimation + consommé réel (50 derniers passages). */}
                    <p className="text-[11.5px] text-[#9A9A97] mt-0.5 tabular-nums">
                      {typeof r.action?.estimatedCreditsPerRun === "number" && (
                        <>≈ {r.action.estimatedCreditsPerRun} crédits/passage</>
                      )}
                      {(() => {
                        const spent = runs
                          .filter((x) => x.rule_id === r.id)
                          .reduce((n, x) => n + (x.credits_used ?? 0), 0);
                        return spent > 0 ? <> · {spent} crédits consommés récemment</> : null;
                      })()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {r.status === "active" ? (
                      <button
                        onClick={() => command(r.id, "pause")}
                        disabled={busy === r.id}
                        title="Mettre en pause"
                        className="p-2 rounded-lg border border-[#E7E7E4] text-[#6E6E6C] hover:border-[#C9BEF0] transition-colors disabled:opacity-50"
                      >
                        <Pause className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        onClick={() => command(r.id, "resume")}
                        disabled={busy === r.id || (r.status === "blocked" && (r.missing?.field === "email" || r.missing?.field === "content"))}
                        title="Relancer"
                        className="p-2 rounded-lg border border-[#E7E7E4] text-[#6E6E6C] hover:border-[#C9BEF0] transition-colors disabled:opacity-50"
                      >
                        <Play className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => command(r.id, "run_now")}
                      disabled={busy === r.id || r.status === "blocked"}
                      title="Exécuter maintenant"
                      className="p-2 rounded-lg border border-[#E7E7E4] text-[#6E6E6C] hover:border-[#C9BEF0] transition-colors disabled:opacity-50"
                    >
                      {busy === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Supprimer l'agent « ${r.title} » ? Son journal sera effacé.`)) {
                          command(r.id, "delete");
                        }
                      }}
                      disabled={busy === r.id}
                      title="Supprimer"
                      className="p-2 rounded-lg border border-[#E7E7E4] text-rose-500 hover:border-rose-300 transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {r.status === "blocked" && r.blocked_reason && (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                    <p className="text-[12.5px] text-amber-800">
                      ⚠️ En attente : {r.blocked_reason}.
                    </p>
                    {r.missing?.field === "email" && r.missing.id && (
                      <div className="flex items-center gap-2 mt-2">
                        <div className="relative flex-1 max-w-xs">
                          <Mail className="w-3.5 h-3.5 text-[#9A9A97] absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="email"
                            value={emailInputs[r.id] ?? ""}
                            onChange={(e) => setEmailInputs((p) => ({ ...p, [r.id]: e.target.value }))}
                            placeholder={`Email de ${r.missing.name}`}
                            className="w-full rounded-lg border border-[#E7E7E4] bg-white pl-9 pr-3 py-1.5 text-[12.5px] text-[#0A0A0A] placeholder:text-[#B9B9B6] focus:outline-none focus:border-[#C9BEF0]"
                          />
                        </div>
                        <button
                          onClick={() => command(r.id, "provide", { email: emailInputs[r.id] ?? "" })}
                          disabled={busy === r.id || !(emailInputs[r.id] ?? "").includes("@")}
                          className="rounded-full bg-[#0A0A0A] px-3.5 py-1.5 text-[12px] font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-40"
                        >
                          Compléter et démarrer
                        </button>
                      </div>
                    )}
                    {r.missing?.field === "content" && (
                      <div className="mt-2">
                        <textarea
                          value={contentInputs[r.id] ?? ""}
                          onChange={(e) => setContentInputs((p) => ({ ...p, [r.id]: e.target.value }))}
                          rows={2}
                          placeholder="Quel message dois-je envoyer ? Ex : « demande-lui une photo du chantier »"
                          className="w-full rounded-lg border border-[#E7E7E4] bg-white px-3 py-2 text-[12.5px] text-[#0A0A0A] placeholder:text-[#B9B9B6] focus:outline-none focus:border-[#C9BEF0] resize-none"
                        />
                        <button
                          onClick={() => command(r.id, "provide", { content: contentInputs[r.id] ?? "" })}
                          disabled={busy === r.id || (contentInputs[r.id] ?? "").trim().length < 3}
                          className="mt-2 rounded-full bg-[#0A0A0A] px-3.5 py-1.5 text-[12px] font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-40"
                        >
                          Enregistrer et démarrer
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {runs.length > 0 && (
          <div>
            <h2 className="text-[15px] font-bold text-[#0A0A0A] tracking-[-0.02em] mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#6E6E6C]" /> Journal des passages
            </h2>
            <div className="rounded-2xl border border-[#EDEDF2] bg-white divide-y divide-[#F4F4F2]">
              {runs.map((run) => {
                const rule = rules.find((r) => r.id === run.rule_id);
                return (
                  <div key={run.id} className="flex items-start gap-2.5 px-4 py-2.5">
                    <span className="mt-0.5">{runIcon(run.status)}</span>
                    <div className="min-w-0">
                      <p className="text-[12.5px] text-[#0A0A0A]">
                        {rule && <span className="font-semibold">{rule.title} — </span>}
                        {run.summary || run.error || run.status}
                      </p>
                      <p className="text-[11px] text-[#9A9A97] tabular-nums">
                        {formatDate(run.created_at)}
                        {(run.credits_used ?? 0) > 0 && <> · {run.credits_used} cr</>}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
