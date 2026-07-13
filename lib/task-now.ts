// ─────────────────────────────────────────────────────────────────────────────
// TASK NOW — le moteur « fais-le maintenant » pour un ENVOI GROUPÉ.
//
// Vision (2026-07-09) : tant que la donnée est dans le workspace et que l'outil
// d'envoi est branché, Biltia doit pouvoir EXÉCUTER la demande, pas la refuser.
// Ce fichier couvre le cas le plus courant qui tombait jusqu'ici « entre les
// couloirs » du chat : « envoie un message à tous mes clients / mon équipe / mes
// fournisseurs ». Le couloir "email" ne visait qu'UN destinataire nommé ; ici on
// résout un GROUPE contre le workspace.
//
// Deux temps, pour la sûreté (jamais un envoi surprise) :
//   1. resolveAudience() — lit le groupe, sépare ceux qui ont un email de ceux
//      qui n'en ont pas. AUCUN effet. Sert à l'APERÇU montré à l'utilisateur.
//   2. sendTaskEmails() — après validation : un email INDIVIDUEL par destinataire
//      (jamais tous en copie visible), borné, avec rapport de ce qui a été sauté.
//
// Périmètre volontairement étroit (le 80% sûr) : envoi de message à un groupe.
// Le 20% risqué (suppressions en masse, commandes, chaînes d'écritures) n'est PAS
// exécuté automatiquement — d'autres chemins s'en chargeront, avec garde-fous.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Locale } from "@/lib/i18n/config";
import { sendOutboundEmail } from "./outbound-email";

export type TaskAudience = "all_clients" | "team" | "all_suppliers";

export function isTaskAudience(v: unknown): v is TaskAudience {
  return v === "all_clients" || v === "team" || v === "all_suppliers";
}

/** Libellé humain de l'audience (singulier/pluriel gérés au cas par cas). */
export const AUDIENCE_LABELS: Record<TaskAudience, { plural: string; singular: string }> = {
  all_clients: { plural: "clients", singular: "client" },
  team: { plural: "employés", singular: "employé" },
  all_suppliers: { plural: "fournisseurs", singular: "fournisseur" },
};
const AUDIENCE_LABELS_EN: Record<TaskAudience, { plural: string; singular: string }> = {
  all_clients: { plural: "clients", singular: "client" },
  team: { plural: "team members", singular: "team member" },
  all_suppliers: { plural: "suppliers", singular: "supplier" },
};
/** Libellé d'audience traduit si l'interface est en anglais (pour l'aperçu utilisateur). */
export function audienceLabels(audience: TaskAudience, locale: Locale): { plural: string; singular: string } {
  return locale === "en" ? AUDIENCE_LABELS_EN[audience] : AUDIENCE_LABELS[audience];
}

export type TaskRecipient = { name: string; email: string };

export type ResolvedAudience = {
  /** Destinataires avec un email valide (prêts à recevoir). */
  recipients: TaskRecipient[];
  /** Fiches du groupe SANS email (sautées, à compléter dans le workspace). */
  skipped: { name: string }[];
  /** Total de fiches dans le groupe (avec ou sans email). */
  total: number;
};

// Borne de résolution (on ne scanne pas des dizaines de milliers de lignes) et
// borne d'envoi par exécution (anti-spam / coût maîtrisé ; le surplus est signalé).
const RESOLVE_LIMIT = 500;
export const SEND_CAP = 50;

/**
 * Résout un groupe du workspace en une liste de destinataires. Lecture seule,
 * tenant-scopée (le client Supabase passé est déjà borné au tenant par la RLS).
 * Ne throw jamais : en cas d'erreur, renvoie un groupe vide.
 */
export async function resolveAudience(
  db: SupabaseClient,
  tenantId: string,
  audience: TaskAudience
): Promise<ResolvedAudience> {
  const recipients: TaskRecipient[] = [];
  const skipped: { name: string }[] = [];

  try {
    if (audience === "team") {
      const { data } = await db
        .from("employees")
        .select("id, nom, prenom, email")
        .eq("tenant_id", tenantId)
        .limit(RESOLVE_LIMIT);
      const rows = (data ?? []) as { nom: string | null; prenom: string | null; email: string | null }[];
      for (const r of rows) {
        const name = [r.prenom, r.nom].filter(Boolean).join(" ").trim() || "employé";
        if (r.email && r.email.includes("@")) recipients.push({ name, email: r.email });
        else skipped.push({ name });
      }
      return { recipients, skipped, total: rows.length };
    }

    // all_clients | all_suppliers — même forme (nom + email).
    const table = audience === "all_clients" ? "clients" : "suppliers";
    const { data } = await db
      .from(table)
      .select("id, nom, email")
      .eq("tenant_id", tenantId)
      .limit(RESOLVE_LIMIT);
    const rows = (data ?? []) as { nom: string | null; email: string | null }[];
    for (const r of rows) {
      const name = (r.nom ?? "").trim() || AUDIENCE_LABELS[audience].singular;
      if (r.email && r.email.includes("@")) recipients.push({ name, email: r.email });
      else skipped.push({ name });
    }
    return { recipients, skipped, total: rows.length };
  } catch {
    return { recipients: [], skipped: [], total: 0 };
  }
}

export type TaskSendResult = {
  sent: number;
  failed: number;
  skippedNoEmail: number;
  deferred: number;
  via: "gmail" | "resend" | null;
};

/**
 * Envoie le message à chaque destinataire, INDIVIDUELLEMENT (un email par
 * personne : personne ne voit les adresses des autres). Borné à SEND_CAP par
 * exécution. Ne throw jamais — renvoie un décompte.
 */
export async function sendTaskEmails(opts: {
  tenantId: string;
  userId: string | null;
  fromEmail: string | null;
  subject: string;
  body: string;
  resolved: ResolvedAudience;
}): Promise<TaskSendResult> {
  const batch = opts.resolved.recipients.slice(0, SEND_CAP);
  const deferred = Math.max(0, opts.resolved.recipients.length - batch.length);

  let sent = 0;
  let failed = 0;
  let via: "gmail" | "resend" | null = null;

  for (const r of batch) {
    const res = await sendOutboundEmail({
      tenantId: opts.tenantId,
      userId: opts.userId,
      fromEmail: opts.fromEmail,
      to: [r.email],
      subject: opts.subject,
      body: opts.body,
    });
    if (res.ok) {
      sent++;
      via = res.via;
    } else {
      failed++;
    }
  }

  return { sent, failed, skippedNoEmail: opts.resolved.skipped.length, deferred, via };
}
