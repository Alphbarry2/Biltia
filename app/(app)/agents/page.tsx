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
  Sparkles,
  ChevronDown,
} from "lucide-react";
import { AgentTemplateGallery } from "@/components/agent-templates";
import { useT, useLocale } from "@/lib/i18n/context";
import type { Locale } from "@/lib/i18n/config";

type AgentSchedule = { time: string; days: number[]; tz: string };
type AgentTrigger = { watcher: string; params?: { days?: number }; scanEveryMinutes?: number };
type AgentMissing = { entity: string; id: string | null; name: string; field: string } | null;

type AgentRule = {
  id: string;
  title: string;
  instruction: string;
  trigger_type?: string | null;
  trigger?: AgentTrigger | null;
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

// Relance PRÉPARÉE en attente de validation (Étape 3 : #67 brouillon / #70 ferme).
type PendingRelance = {
  id: string;
  rule_id: string | null;
  fiche_label: string | null;
  kind: string;
  level: number | null;
  to_email: string | null;
  subject: string;
  body: string;
  status: string;
  created_at: string;
};

const DAY_NAMES = ["", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
const DAY_NAMES_EN = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function describeSchedule(s: AgentSchedule | null | undefined, t: (fr: string, en: string) => string, locale: Locale): string {
  if (!s?.time) return t("planning à définir", "schedule to be set");
  const days = (s.days ?? []).filter((d) => d >= 1 && d <= 7);
  const when =
    days.length === 0
      ? t("tous les jours", "every day")
      : days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))
        ? t("du lundi au vendredi", "Monday to Friday")
        : t(`chaque ${days.map((d) => DAY_NAMES[d]).join(", ")}`, `every ${days.map((d) => DAY_NAMES_EN[d]).join(", ")}`);
  return t(`${when} à ${s.time}`, `${when} at ${s.time}`);
}

// Ce que surveille un agent-événement (miroir court de lib/agent-watchers.ts).
const WATCHER_LABELS: Record<string, string> = {
  chantier_en_retard: "les chantiers en retard",
  chantier_fin_proche: "les chantiers dont la date de fin approche",
  chantier_hors_budget: "les chantiers qui dépassent leur budget",
  chantier_sans_activite: "les chantiers qui n'avancent plus",
  chantier_sans_devis: "les chantiers démarrés sans devis signé",
  chantier_termine: "les chantiers qui viennent d'être terminés",
  demande_urgente: "les demandes clients urgentes sans réponse (jugées par l'IA)",
  devis_non_signe: "les devis non signés",
  devis_accepte: "les devis qui viennent d'être acceptés",
  devis_expire_bientot: "les devis proches de leur date de validité",
  facture_echeance_proche: "les factures dont l'échéance approche",
  facture_impayee: "les factures impayées",
  facture_payee: "les factures qui viennent d'être payées",
  echeance_proche: "les échéances à venir (docs, assurances, contrats, entretiens)",
  visite_terminee: "les visites terminées (compte-rendu auto)",
  rdv_demain: "les rendez-vous clients à venir",
  conflit_planning: "les conflits de planning (interventions qui se chevauchent)",
  intervention_annulee: "les rendez-vous / interventions annulés",
  tache_en_retard: "les tâches en retard (échéance dépassée)",
  tache_terminee: "les tâches qui viennent d'être terminées",
  tache_sans_responsable: "les tâches ouvertes sans intervenant",
  chantier_sans_responsable: "les chantiers actifs sans chef de chantier",
  equipe_surchargee: "les intervenants surchargés (trop de travail ouvert)",
  stock_bas: "les matériaux passés sous leur seuil",
  nouveau_lead: "les nouveaux leads reçus par formulaire",
  nouveau_client: "les nouveaux clients créés",
  nouveau_chantier: "les nouveaux chantiers créés",
  pointage_manquant: "les employés qui n'ont pas pointé récemment",
  heures_a_valider: "les heures/pointages non validés qui traînent",
  heures_incoherentes: "les journées d'heures anormalement élevées",
  chantier_trop_heures: "les chantiers qui consomment trop d'heures",
  document_a_regulariser: "les documents manquants ou déjà expirés",
  assurance_expiree: "les assurances décennales déjà expirées (sous-traitants)",
  clients_doublons: "les fiches clients en double (même email ou téléphone)",
  client_mauvais_payeur: "les clients cumulant des factures échues impayées",
  sous_traitant_a_probleme: "les sous-traitants cumulant des réserves/incidents ouverts",
  sous_traitant_sans_assurance: "les sous-traitants sans assurance décennale renseignée",
  documents_a_classer: "les documents uploadés sans rattachement (à ranger)",
  chantier_sans_photo: "les chantiers terminés sans aucune photo au dossier",
  intervention_sans_responsable: "les interventions/SAV ouverts sans intervenant assigné",
  intervention_sans_date: "les interventions/SAV ouverts sans date prévue",
  intervention_en_retard: "les interventions/SAV dont la date prévue est dépassée",
  commande_en_retard: "les commandes fournisseur en retard de livraison",
  achat_non_affecte: "les achats/dépenses fournisseur non rattachés à un chantier",
  facture_fournisseur_a_payer: "les factures fournisseur à régler (échéance dépassée)",
  chantier_sans_budget: "les chantiers actifs sans budget renseigné",
  client_inactif: "les clients sans activité depuis longtemps",
};

const WATCHER_LABELS_EN: Record<string, string> = {
  chantier_en_retard: "job sites behind schedule",
  chantier_fin_proche: "job sites nearing their end date",
  chantier_hors_budget: "job sites over budget",
  chantier_sans_activite: "job sites that have stalled",
  chantier_sans_devis: "job sites started without a signed quote",
  chantier_termine: "job sites just completed",
  demande_urgente: "urgent client requests left unanswered (judged by AI)",
  devis_non_signe: "unsigned quotes",
  devis_accepte: "quotes just accepted",
  devis_expire_bientot: "quotes nearing their expiry date",
  facture_echeance_proche: "invoices nearing their due date",
  facture_impayee: "unpaid invoices",
  facture_payee: "invoices just paid",
  echeance_proche: "upcoming deadlines (docs, insurance, contracts, maintenance)",
  visite_terminee: "completed visits (auto report)",
  rdv_demain: "upcoming client appointments",
  conflit_planning: "scheduling conflicts (overlapping jobs)",
  intervention_annulee: "cancelled appointments / jobs",
  tache_en_retard: "overdue tasks (past due date)",
  tache_terminee: "tasks just completed",
  tache_sans_responsable: "open tasks with no assignee",
  chantier_sans_responsable: "active job sites with no site manager",
  equipe_surchargee: "overloaded team members (too much open work)",
  stock_bas: "materials below their threshold",
  nouveau_lead: "new leads received via form",
  nouveau_client: "new clients created",
  nouveau_chantier: "new job sites created",
  pointage_manquant: "employees who haven't clocked in recently",
  heures_a_valider: "unvalidated hours/timesheets left pending",
  heures_incoherentes: "days with abnormally high hours",
  chantier_trop_heures: "job sites burning too many hours",
  document_a_regulariser: "missing or already expired documents",
  assurance_expiree: "expired liability insurance (subcontractors)",
  clients_doublons: "duplicate client records (same email or phone)",
  client_mauvais_payeur: "clients piling up overdue unpaid invoices",
  sous_traitant_a_probleme: "subcontractors piling up open snags/incidents",
  sous_traitant_sans_assurance: "subcontractors with no liability insurance on file",
  documents_a_classer: "uploaded documents with no link (to file)",
  chantier_sans_photo: "completed job sites with no photo on file",
  intervention_sans_responsable: "open jobs/after-sales with no assignee",
  intervention_sans_date: "open jobs/after-sales with no planned date",
  intervention_en_retard: "jobs/after-sales past their planned date",
  commande_en_retard: "supplier orders behind on delivery",
  achat_non_affecte: "supplier purchases/expenses not linked to a job site",
  facture_fournisseur_a_payer: "supplier invoices to pay (past due)",
  chantier_sans_budget: "active job sites with no budget set",
  client_inactif: "clients with no activity for a long time",
};

/** Agent-événement → « surveille X » ; agent planifié → son planning. */
function describeTrigger(r: AgentRule, t: (fr: string, en: string) => string, locale: Locale): string {
  if (r.trigger_type === "event" && r.trigger?.watcher) {
    const labels = locale === "en" ? WATCHER_LABELS_EN : WATCHER_LABELS;
    const what = labels[r.trigger.watcher] ?? t("une condition", "a condition");
    return t(`surveille ${what}, en continu`, `watches ${what}, continuously`);
  }
  return describeSchedule(r.schedule, t, locale);
}

function formatDate(iso: string | null, locale: Locale): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", {
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
  team_planning: "Planning équipe",
  compte_rendu: "Compte-rendu auto",
  act: "Action automatique",
};

const ACTION_LABELS_EN: Record<string, string> = {
  send_email: "Automatic email",
  notify: "Reminder",
  report: "Check + summary",
  team_planning: "Team schedule",
  compte_rendu: "Auto report",
  act: "Automatic action",
};

export default function AgentsPage() {
  const t = useT();
  const locale = useLocale();
  const [rules, setRules] = useState<AgentRule[]>([]);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [pending, setPending] = useState<PendingRelance[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null); // rule id en cours d'action
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emailInputs, setEmailInputs] = useState<Record<string, string>>({});
  // Message à fournir pour un agent bloqué faute de contenu (« quel message ? »).
  const [contentInputs, setContentInputs] = useState<Record<string, string>>({});
  // Galerie de modèles d'agents (ouverte d'office quand aucun agent recruté).
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/agents");
      const data = await res.json();
      if (res.ok) {
        setRules(data.rules ?? []);
        setRuns(data.runs ?? []);
        setPending(data.pending ?? []);
        // Aucun agent encore : on met les modèles prêts à l'emploi en avant.
        if ((data.rules ?? []).length === 0) setTemplatesOpen(true);
      } else {
        setError(data.error ?? t("Chargement impossible.", "Loading failed."));
      }
    } catch {
      setError(t("Chargement impossible.", "Loading failed."));
    }
    setLoading(false);
  }, [t]);

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
        setError(data.error ?? t("Action impossible.", "Action failed."));
      } else {
        if (action === "run_now") {
          flash(
            data.outcome?.status === "success"
              ? t(`✓ Exécuté : ${data.outcome.summary}`, `✓ Ran: ${data.outcome.summary}`)
              : t(`Passage terminé (${data.outcome?.status ?? "?"}) : ${data.outcome?.summary ?? ""}`, `Run finished (${data.outcome?.status ?? "?"}): ${data.outcome?.summary ?? ""}`)
          );
        } else if (data.message) {
          flash(data.message);
        } else {
          flash(t("✓ Fait.", "✓ Done."));
        }
        await load();
      }
    } catch {
      setError(t("Action impossible.", "Action failed."));
    }
    setBusy(null);
  }

  // Valider (envoyer) ou ignorer une relance préparée (Étape 3).
  async function decideRelance(id: string, decision: "send" | "discard") {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch("/api/agents/outbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, decision }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? t("Action impossible.", "Action failed."));
      else {
        flash(decision === "send" ? t("✓ Validé.", "✓ Approved.") : t("Ignoré.", "Dismissed."));
        await load();
      }
    } catch {
      setError(t("Action impossible.", "Action failed."));
    }
    setBusy(null);
  }

  const statusBadge = (r: AgentRule) => {
    if (r.status === "active")
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
          <CheckCircle className="w-3 h-3" /> {t("Actif", "Active")}
        </span>
      );
    if (r.status === "blocked")
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
          <AlertTriangle className="w-3 h-3" /> {t("Bloqué", "Blocked")}
        </span>
      );
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#F4F4F2] border border-[#E7E7E4] px-2 py-0.5 text-[11px] font-semibold text-[#6E6E6C]">
        <Pause className="w-3 h-3" /> {t("En pause", "Paused")}
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
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between gap-3 mb-1.5">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500/15 to-pink-500/10 flex items-center justify-center">
              <Bot className="w-5 h-5 text-violet-600" />
            </span>
            <h1 className="text-2xl font-black text-[#0A0A0A] tracking-[-0.03em]">{t("Agents", "Agents")}</h1>
          </div>
          {rules.length > 0 && (
            <Link
              href="/generate?new=agent"
              className="inline-flex items-center gap-1.5 rounded-full bg-[#0A0A0A] px-4 py-2 text-[12.5px] font-semibold text-white hover:opacity-90 transition-opacity flex-shrink-0"
            >
              <Zap className="w-3.5 h-3.5" /> {t("Recruter un agent", "Hire an agent")}
            </Link>
          )}
        </div>
        <p className="text-[14px] text-[#6E6E6C] mb-6 ml-12">
          {t(
            "Vos missions déléguées : Biltia les exécute seul et trace chaque passage. À heure fixe (« chaque soir à 18h, vérifie mes factures impayées ») ou sur événement, dès qu'une fiche le déclenche (« préviens-moi quand un chantier prend du retard », « relance les devis non signés »). Recrutez depuis le chat.",
            "Your delegated missions: Biltia runs them on its own and logs every run. On a fixed schedule (“every evening at 6pm, check my unpaid invoices”) or on an event, as soon as a record triggers it (“alert me when a job site falls behind”, “chase unsigned quotes”). Hire from the chat.",
          )}
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

        {/* ── RELANCES À VALIDER : préparées par un agent, en attente de votre feu vert ── */}
        {pending.length > 0 && (
          <div className="mb-8 rounded-2xl border border-amber-200 bg-amber-50/60 overflow-hidden">
            <div className="px-4 py-3 border-b border-amber-200 flex items-center gap-2">
              <Mail className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span className="text-[13.5px] font-bold text-amber-900">
                {t(`${pending.length} à valider`, `${pending.length} to approve`)}
              </span>
              <span className="text-[12px] text-amber-700">{t("relances & actions préparées", "prepared follow-ups & actions")}</span>
            </div>
            <div className="divide-y divide-amber-100">
              {pending.map((p) => (
                <div key={p.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] font-semibold text-[#0A0A0A] truncate">{p.subject}</span>
                        {p.level != null && p.level >= 3 && (
                          <span className="rounded-full bg-rose-100 border border-rose-200 px-2 py-0.5 text-[10.5px] font-semibold text-rose-700">
                            {t(`ferme (niv. ${p.level})`, `firm (lvl ${p.level})`)}
                          </span>
                        )}
                      </div>
                      <div className="text-[12px] text-[#6E6E6C] mt-0.5 truncate">
                        {p.kind === "workflow_step"
                          ? (p.fiche_label ? t(`Action · ${p.fiche_label}`, `Action · ${p.fiche_label}`) : t("Action de l'agent", "Agent action"))
                          : t(`Pour ${p.to_email ?? "?"}${p.fiche_label ? ` · ${p.fiche_label}` : ""}`, `To ${p.to_email ?? "?"}${p.fiche_label ? ` · ${p.fiche_label}` : ""}`)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        disabled={busy === p.id}
                        onClick={() => decideRelance(p.id, "send")}
                        className="inline-flex items-center gap-1 rounded-full bg-[#0A0A0A] px-3 py-1.5 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
                      >
                        {busy === p.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : p.kind === "workflow_step" ? (
                          <CheckCircle className="w-3.5 h-3.5" />
                        ) : (
                          <Mail className="w-3.5 h-3.5" />
                        )}{" "}
                        {p.kind === "workflow_step" ? t("Valider", "Approve") : t("Envoyer", "Send")}
                      </button>
                      <button
                        disabled={busy === p.id}
                        onClick={() => decideRelance(p.id, "discard")}
                        className="inline-flex items-center rounded-full border border-[#E7E7E4] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#6E6E6C] hover:bg-[#FBFBFD] disabled:opacity-50 transition-colors"
                      >
                        {t("Ignorer", "Dismiss")}
                      </button>
                    </div>
                  </div>
                  <details className="mt-2">
                    <summary className="text-[11.5px] text-violet-700 cursor-pointer select-none">{p.kind === "workflow_step" ? t("Voir le détail", "View details") : t("Voir le message", "View message")}</summary>
                    <pre className="mt-1.5 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-[#3A3A46] bg-white border border-amber-100 rounded-lg p-2.5 font-sans">
{p.body}
                    </pre>
                  </details>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── MODÈLES D'AGENTS : prêts à l'emploi, activables en un clic ────── */}
        <div className="mb-8 rounded-2xl border border-[#EDEDF2] bg-white overflow-hidden">
          <button
            onClick={() => setTemplatesOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-[#FBFBFD] transition-colors"
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500/15 to-pink-500/10 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-4 h-4 text-violet-600" />
              </span>
              <span className="min-w-0">
                <span className="block text-[14px] font-bold text-[#0A0A0A] tracking-[-0.01em]">
                  {t("Agents prêts à l'emploi", "Ready-to-use agents")}
                </span>
                <span className="block text-[12px] text-[#9A9A97]">
                  {t("Activez, ils travaillent tout seuls.", "Turn them on, they work on their own.")}
                </span>
              </span>
            </span>
            <ChevronDown
              className={`w-4 h-4 text-[#9A9A97] flex-shrink-0 transition-transform ${templatesOpen ? "rotate-180" : ""}`}
            />
          </button>
          {templatesOpen && (
            <div className="px-4 pb-5 pt-1 border-t border-[#F4F4F2]">
              <AgentTemplateGallery query="" onActivated={load} />
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-[13px] text-[#9A9A97] py-10 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> {t("Chargement…", "Loading…")}
          </div>
        ) : rules.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#E7E7E4] bg-white p-10 text-center">
            <Bot className="w-8 h-8 text-[#C9BEF0] mx-auto mb-3" />
            <p className="text-[14px] font-semibold text-[#0A0A0A] mb-1">{t("Aucun agent recruté pour l'instant", "No agent hired yet")}</p>
            <p className="text-[13px] text-[#9A9A97] mb-4 max-w-md mx-auto">
              {t("Dictez une mission permanente dans le chat et Biltia s'en occupe désormais — relances, rappels, contrôles quotidiens.", "Dictate a standing mission in the chat and Biltia takes it over from now on — follow-ups, reminders, daily checks.")}
            </p>
            <Link
              href="/generate?new=agent"
              className="inline-flex items-center gap-1.5 rounded-full bg-[#0A0A0A] px-4 py-2 text-[12.5px] font-semibold text-white hover:opacity-90 transition-opacity"
            >
              <Zap className="w-3.5 h-3.5" /> {t("Recruter mon premier agent", "Hire my first agent")}
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
                      {r.trigger_type === "event" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 border border-violet-200 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
                          <Zap className="w-3 h-3" /> {t("Surveillance", "Watching")}
                        </span>
                      )}
                      <span className="text-[11px] text-[#9A9A97]">
                        {(locale === "en" ? ACTION_LABELS_EN : ACTION_LABELS)[r.action?.type ?? ""] ?? t("Mission", "Mission")}
                      </span>
                    </div>
                    <p className="text-[12.5px] text-[#6E6E6C] mt-1">
                      {describeTrigger(r, t, locale)}
                      {r.status === "active" && r.next_run_at && (
                        <span className="text-[#9A9A97]">
                          {" "}· {r.trigger_type === "event" ? t("prochaine vérification", "next check") : t("prochain passage", "next run")} : {formatDate(r.next_run_at, locale)}
                        </span>
                      )}
                      {r.last_run_at && (
                        <span className="text-[#9A9A97]"> · {t("dernier", "last")} : {formatDate(r.last_run_at, locale)}</span>
                      )}
                    </p>
                    {/* Transparence prix : estimation + consommé réel (50 derniers passages). */}
                    <p className="text-[11.5px] text-[#9A9A97] mt-0.5 tabular-nums">
                      {typeof r.action?.estimatedCreditsPerRun === "number" && (
                        <>{t(`≈ ${r.action.estimatedCreditsPerRun} crédits/passage`, `≈ ${r.action.estimatedCreditsPerRun} credits/run`)}</>
                      )}
                      {(() => {
                        const spent = runs
                          .filter((x) => x.rule_id === r.id)
                          .reduce((n, x) => n + (x.credits_used ?? 0), 0);
                        return spent > 0 ? <>{t(` · ${spent} crédits consommés récemment`, ` · ${spent} credits used recently`)}</> : null;
                      })()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {r.status === "active" ? (
                      <button
                        onClick={() => command(r.id, "pause")}
                        disabled={busy === r.id}
                        title={t("Mettre en pause", "Pause")}
                        className="p-2 rounded-lg border border-[#E7E7E4] text-[#6E6E6C] hover:border-[#C9BEF0] transition-colors disabled:opacity-50"
                      >
                        <Pause className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        onClick={() => command(r.id, "resume")}
                        disabled={busy === r.id || (r.status === "blocked" && (r.missing?.field === "email" || r.missing?.field === "content"))}
                        title={t("Relancer", "Resume")}
                        className="p-2 rounded-lg border border-[#E7E7E4] text-[#6E6E6C] hover:border-[#C9BEF0] transition-colors disabled:opacity-50"
                      >
                        <Play className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => command(r.id, "run_now")}
                      disabled={busy === r.id || r.status === "blocked"}
                      title={t("Exécuter maintenant", "Run now")}
                      className="p-2 rounded-lg border border-[#E7E7E4] text-[#6E6E6C] hover:border-[#C9BEF0] transition-colors disabled:opacity-50"
                    >
                      {busy === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(t(`Supprimer l'agent « ${r.title} » ? Son journal sera effacé.`, `Delete the agent “${r.title}”? Its log will be erased.`))) {
                          command(r.id, "delete");
                        }
                      }}
                      disabled={busy === r.id}
                      title={t("Supprimer", "Delete")}
                      className="p-2 rounded-lg border border-[#E7E7E4] text-rose-500 hover:border-rose-300 transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {r.status === "blocked" && r.blocked_reason && (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                    <p className="text-[12.5px] text-amber-800">
                      {t(`⚠️ En attente : ${r.blocked_reason}.`, `⚠️ Waiting: ${r.blocked_reason}.`)}
                    </p>
                    {r.missing?.field === "email" && r.missing.id && (
                      <div className="flex items-center gap-2 mt-2">
                        <div className="relative flex-1 max-w-xs">
                          <Mail className="w-3.5 h-3.5 text-[#9A9A97] absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="email"
                            value={emailInputs[r.id] ?? ""}
                            onChange={(e) => setEmailInputs((p) => ({ ...p, [r.id]: e.target.value }))}
                            placeholder={t(`Email de ${r.missing.name}`, `${r.missing.name}'s email`)}
                            className="w-full rounded-lg border border-[#E7E7E4] bg-white pl-9 pr-3 py-1.5 text-[12.5px] text-[#0A0A0A] placeholder:text-[#B9B9B6] focus:outline-none focus:border-[#C9BEF0]"
                          />
                        </div>
                        <button
                          onClick={() => command(r.id, "provide", { email: emailInputs[r.id] ?? "" })}
                          disabled={busy === r.id || !(emailInputs[r.id] ?? "").includes("@")}
                          className="rounded-full bg-[#0A0A0A] px-3.5 py-1.5 text-[12px] font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-40"
                        >
                          {t("Compléter et démarrer", "Complete and start")}
                        </button>
                      </div>
                    )}
                    {r.missing?.field === "content" && (
                      <div className="mt-2">
                        <textarea
                          value={contentInputs[r.id] ?? ""}
                          onChange={(e) => setContentInputs((p) => ({ ...p, [r.id]: e.target.value }))}
                          rows={2}
                          placeholder={t("Quel message dois-je envoyer ? Ex : « demande-lui une photo du chantier »", "What message should I send? E.g. “ask them for a photo of the job site”")}
                          className="w-full rounded-lg border border-[#E7E7E4] bg-white px-3 py-2 text-[12.5px] text-[#0A0A0A] placeholder:text-[#B9B9B6] focus:outline-none focus:border-[#C9BEF0] resize-none"
                        />
                        <button
                          onClick={() => command(r.id, "provide", { content: contentInputs[r.id] ?? "" })}
                          disabled={busy === r.id || (contentInputs[r.id] ?? "").trim().length < 3}
                          className="mt-2 rounded-full bg-[#0A0A0A] px-3.5 py-1.5 text-[12px] font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-40"
                        >
                          {t("Enregistrer et démarrer", "Save and start")}
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
              <Clock className="w-4 h-4 text-[#6E6E6C]" /> {t("Journal des passages", "Run log")}
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
                        {formatDate(run.created_at, locale)}
                        {(run.credits_used ?? 0) > 0 && <> · {run.credits_used} {t("cr", "cr")}</>}
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
