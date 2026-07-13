// ─────────────────────────────────────────────────────────────────────────────
// AGENT OPERATIONS — dispatcher d'opérations du runner V2 (Phase 6, minimal).
//
// Exécute UNE opération d'une étape de workflow. Politique de sûreté stricte
// (cf lib/agent-workflow : OPERATION_REGISTRY) :
//   • `forbidden` (suppression, paiement…)        → skipped (jamais en auto).
//   • `approval`  (email, facture, devis, chantier) → deferred : préparé mais PAS
//     exécuté ici — il faut l'outbox généralisé + la validation humaine (Phase 6b).
//   • `auto`      (tâche/rappel/note internes, notif) → EXÉCUTÉ pour de vrai
//     (écriture DB tenant-scopée, ou message de notification renvoyé au runner).
//
// Écritures DIRECTES et bornées : create_task/create_reminder/create_note. Aucune
// suppression. Tenant TOUJOURS filtré. Ne throw jamais (échec → status:"failed").
// Les transformations métier complexes (convert_quote_to_chantier,
// create_deposit_invoice…) restent `approval`/deferred : leur exécution serveur
// réutilisable (refactor de /api/data) = Phase 6b.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyOperation } from "./agent-workflow";
import type { RecordContext } from "./agent-recipients";

export type OpResult = {
  status: "done" | "queued" | "deferred" | "skipped" | "failed";
  detail: string;
  /** Sortie réutilisable par une étape suivante ({{outputKey.field}}). */
  output?: Record<string, unknown>;
  /** Écriture destructive (compte pour le plafond execution.maxDestructiveWrites). */
  destructive?: boolean;
  /** Message à agréger dans la notification finale (send_notification). */
  notify?: string;
};

/** Contexte d'exécution d'une étape : fiche déclenchante + de quoi préparer un email. */
export type OpContext = {
  ruleId?: string;
  createdBy?: string | null;
  ruleTitle?: string;
  /** Destinataire résolu (Phase 3) pour les opérations email. */
  recipientEmail?: string | null;
  recipientName?: string | null;
  ficheId?: string | null;
  ficheLabel?: string | null;
  record?: RecordContext;
  /**
   * Rédacteur d'email par IA (fourni par le runner V2). Compose un corps + objet
   * professionnels depuis l'instruction + la fiche. Le comptage de crédits est géré
   * par l'appelant (closure côté runner). null → l'op retombe sur la mise en forme
   * minimale (salutation + politesse). L'agent-operations ne parle JAMAIS au LLM
   * lui-même : il DÉLÈGUE, restant pur et sans dépendance SDK.
   */
  composeEmail?: (args: {
    instruction: string;
    recipientName?: string | null;
    ficheLabel?: string | null;
    record?: RecordContext;
  }) => Promise<{ subject: string; body: string } | null>;
};

/**
 * Opérations `approval` qui correspondent à une TRANSFORMATION réutilisable
 * (lib/workspace-transforms). Préparées en outbox 'workflow_step' puis APPLIQUÉES
 * à la validation humaine via runWorkspaceTransform. `invoice_from_devis` (facture,
 * numérotation légale) N'EST PAS ici → reste `deferred` (6b.2 ultérieur).
 */
const OPERATION_TO_TRANSFORM: Record<string, string> = {
  convert_quote_to_chantier: "chantier_from_devis",
  create_chantier: "chantier_from_devis",
  convert_note_to_task: "task_from_note",
  convert_note_to_reserve: "reserve_from_note",
  convert_demande_to_devis: "devis_from_demande",
};

/** Opérations FACTURE (approval) → invoiceFromDevis à la validation. Mode par défaut. */
const INVOICE_OPS: Record<string, "acompte" | "solde"> = {
  create_deposit_invoice: "acompte",
  convert_quote_to_deposit_invoice: "acompte",
  create_invoice: "solde",
  convert_quote_to_final_invoice: "solde",
};

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}
function recField(record: RecordContext | undefined, key: string): string | null {
  const v = record?.fields?.[key];
  return v == null || v === "" ? null : String(v);
}

/**
 * Exécute l'opération `operation` avec ses `params` (déjà interpolés), pour la
 * fiche `record`. Tenant-scopé. Ne throw jamais.
 */
export async function executeOperation(
  admin: SupabaseClient,
  tenant: string,
  operation: string,
  params: Record<string, unknown>,
  ctx: OpContext = {}
): Promise<OpResult> {
  const cls = classifyOperation(operation);
  const record = ctx.record;
  if (cls.sensitivity === "forbidden") return { status: "skipped", detail: `${cls.label} — interdit en automatique` };

  // ── Opérations EMAIL (approval) : PRÉPARÉES dans l'outbox existant → validation
  //    humaine (/api/agents/outbox) puis envoi réel. JAMAIS d'envoi automatique.
  if (operation === "send_email" || operation === "create_email_draft") {
    const to = ctx.recipientEmail;
    if (!to || !to.includes("@")) return { status: "deferred", detail: "Email non préparé — aucun destinataire avec adresse" };
    const message = str(params.instruction) || str(params.body);
    if (!message) return { status: "deferred", detail: "Email non préparé — contenu vide" };
    let subject = ((str(params.subject) || message.slice(0, 80)) || "Message").slice(0, 200);
    // Corps de l'email, par ordre de préférence :
    //   1. params.body explicite (fourni par une étape amont) ;
    //   2. rédaction IA (ctx.composeEmail, runner V2 — objet + corps contextualisés,
    //      crédités par l'appelant) ;
    //   3. mise en forme minimale (salutation nominative + politesse) : repli sûr si
    //      pas de clé IA / échec. L'artisan valide TOUJOURS avant envoi (outbox).
    let bodyText = str(params.body);
    if (!bodyText && ctx.composeEmail) {
      const composed = await ctx
        .composeEmail({ instruction: message, recipientName: ctx.recipientName, ficheLabel: ctx.ficheLabel, record })
        .catch(() => null);
      if (composed?.body) {
        bodyText = composed.body;
        if (!str(params.subject) && composed.subject) subject = composed.subject.slice(0, 200);
      }
    }
    if (!bodyText) {
      const greeting = ctx.recipientName ? `Bonjour ${ctx.recipientName},` : "Bonjour,";
      bodyText = `${greeting}\n\n${message}\n\nBien cordialement.`;
    }
    const { error } = await admin.from("agent_outbox").insert({
      tenant_id: tenant,
      rule_id: ctx.ruleId ?? null,
      created_by: ctx.createdBy ?? null,
      fiche_id: ctx.ficheId ?? null,
      fiche_label: ctx.ficheLabel ?? null,
      kind: "relance",
      level: 1,
      to_email: to,
      subject,
      body: bodyText.slice(0, 4000),
      status: "pending",
    });
    if (error) return { status: "deferred", detail: "Email non mis en attente (outbox indisponible)" };
    return { status: "queued", detail: `Email préparé pour ${ctx.recipientName ?? to} — à valider`, output: { to } };
  }

  // ── Opérations FACTURE (approval) : PRÉPARÉES en outbox 'workflow_step',
  //    APPLIQUÉES à la validation via invoiceFromDevis (numérotation légale).
  const invoiceMode = INVOICE_OPS[operation];
  if (invoiceMode) {
    const sourceId = ctx.ficheId ?? record?.id ?? null;
    if (!sourceId) return { status: "deferred", detail: `${cls.label} — devis source inconnu` };
    const pct = invoiceMode === "acompte" ? Number(params.percentage ?? params.pct) || 30 : null;
    const { error } = await admin.from("agent_outbox").insert({
      tenant_id: tenant,
      rule_id: ctx.ruleId ?? null,
      created_by: ctx.createdBy ?? null,
      fiche_id: ctx.ficheId ?? null,
      fiche_label: ctx.ficheLabel ?? null,
      kind: "workflow_step",
      operation: "invoice_from_devis",
      params: { mode: invoiceMode, pct },
      record_ref: { entity: record?.entity ?? null, id: sourceId },
      subject: cls.label,
      body: `Facture préparée par l'agent : ${cls.label}${ctx.ficheLabel ? ` — ${ctx.ficheLabel}` : ""}. À valider pour l'émettre.`,
      status: "pending",
    });
    if (error) return { status: "deferred", detail: `${cls.label} — mise en attente impossible (outbox non généralisé ?)` };
    return { status: "queued", detail: `${cls.label} — préparé, à valider`, output: { sourceId } };
  }

  // ── Opérations = TRANSFORMATION (approval) : PRÉPARÉES en outbox 'workflow_step',
  //    APPLIQUÉES à la validation via runWorkspaceTransform (aucune écriture ici).
  const transform = OPERATION_TO_TRANSFORM[operation];
  if (transform) {
    const sourceId = ctx.ficheId ?? record?.id ?? null;
    if (!sourceId) return { status: "deferred", detail: `${cls.label} — fiche source inconnue` };
    const { error } = await admin.from("agent_outbox").insert({
      tenant_id: tenant,
      rule_id: ctx.ruleId ?? null,
      created_by: ctx.createdBy ?? null,
      fiche_id: ctx.ficheId ?? null,
      fiche_label: ctx.ficheLabel ?? null,
      kind: "workflow_step",
      operation: transform,
      params,
      record_ref: { entity: record?.entity ?? null, id: sourceId },
      // subject/body : libellé lisible pour l'UI (l'outbox est email-shaped à l'origine).
      subject: cls.label,
      body: `Action préparée par l'agent : ${cls.label}${ctx.ficheLabel ? ` — ${ctx.ficheLabel}` : ""}. À valider pour l'exécuter.`,
      status: "pending",
    });
    if (error) return { status: "deferred", detail: `${cls.label} — mise en attente impossible (outbox non généralisé ?)` };
    return { status: "queued", detail: `${cls.label} — préparé, à valider`, output: { sourceId } };
  }

  if (cls.sensitivity === "approval") return { status: "deferred", detail: `${cls.label} — validation requise (Phase 6b)` };

  // ── Opérations AUTO exécutées pour de vrai ──
  switch (operation) {
    case "send_notification": {
      const msg = str(params.instruction) || str(params.body) || str(params.message);
      return { status: "done", detail: "Notification préparée", notify: msg || undefined };
    }
    case "create_task": {
      const title = str(params.instruction) || str(params.title) || "Tâche (agent)";
      const row: Record<string, unknown> = {
        tenant_id: tenant,
        title: title.slice(0, 300),
        status: "todo",
        chantier_id: recField(record, "chantier_id"),
        due_date: str(params.due_date) || null,
      };
      const { data, error } = await admin.from("tasks").insert(row).select("id").single();
      if (error || !data) return { status: "failed", detail: `Création de tâche impossible${error ? ` (${error.message})` : ""}` };
      return { status: "done", detail: `Tâche « ${title} » créée`, output: { id: (data as { id: string }).id, entity: "tasks" }, destructive: true };
    }
    case "create_reminder": {
      const titre = str(params.instruction) || str(params.title) || "Rappel (agent)";
      const row: Record<string, unknown> = {
        tenant_id: tenant,
        titre: titre.slice(0, 300),
        statut: "a_faire",
        due_date: str(params.due_date) || null,
        chantier_id: recField(record, "chantier_id"),
        client_id: recField(record, "client_id"),
      };
      const { data, error } = await admin.from("rappels").insert(row).select("id").single();
      if (error || !data) return { status: "deferred", detail: "Rappel non créé (module Rappels indisponible)" };
      return { status: "done", detail: `Rappel « ${titre} » créé`, output: { id: (data as { id: string }).id, entity: "rappels" }, destructive: true };
    }
    case "create_note": {
      const contenu = str(params.instruction) || str(params.contenu) || "";
      if (!contenu) return { status: "skipped", detail: "Note vide — ignorée" };
      const row: Record<string, unknown> = {
        tenant_id: tenant,
        titre: str(params.title) || "Note (agent)",
        contenu: contenu.slice(0, 2000),
        source: "ia",
        chantier_id: recField(record, "chantier_id"),
        client_id: recField(record, "client_id"),
      };
      const { data, error } = await admin.from("notes").insert(row).select("id").single();
      if (error || !data) return { status: "deferred", detail: "Note non créée (module indisponible)" };
      return { status: "done", detail: "Note créée", output: { id: (data as { id: string }).id, entity: "notes" }, destructive: true };
    }
    default:
      // Opération classée auto mais pas encore câblée.
      return { status: "deferred", detail: `${operation} — pas encore implémentée` };
  }
}
