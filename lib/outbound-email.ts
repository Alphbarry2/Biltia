// ─────────────────────────────────────────────────────────────────────────────
// OUTBOUND EMAIL — un SEUL point d'envoi sortant, qui choisit le BON canal :
//   1. Gmail de l'utilisateur (connecté, scope gmail.send) → l'email part DE SA
//      boîte et les réponses lui reviennent NATURELLEMENT (vrai fil de discussion).
//   2. Sinon repli Resend (transactionnel) avec reply-to = son email : les
//      réponses atterrissent quand même chez lui, mais c'est à sens unique.
//
// Utilisé par l'exécuteur d'agents (livraison + outil send_email) ET les apps
// générées (window.biltia.sendEmail → /api/app-email). Ne throw jamais : renvoie
// un résultat typé + une note lisible pour l'utilisateur.
// ─────────────────────────────────────────────────────────────────────────────

import { sendGmail, gmailStatus } from "./gmail";
import { sendEmail, hasMailerKey, type EmailAttachment } from "./mailer";

export type { EmailAttachment };

export type OutboundEmailResult =
  | { ok: true; via: "gmail" | "resend"; id: string; note: string }
  | { ok: false; reason: string };

/** Y a-t-il AU MOINS un canal d'envoi utilisable ? (means-check précoce, avant
 *  de rédiger — un agent ne rédige pas un email qu'il ne pourra pas envoyer). */
export async function canSendOutbound(
  tenantId: string,
  userId: string | null
): Promise<{ ok: boolean; gmail: boolean; resend: boolean }> {
  const resend = hasMailerKey();
  let gmail = false;
  if (userId) {
    try {
      gmail = (await gmailStatus(tenantId, userId)).canSend;
    } catch {
      gmail = false;
    }
  }
  return { ok: gmail || resend, gmail, resend };
}

/**
 * Envoie un email par le meilleur canal disponible. Gmail d'abord (2 sens),
 * Resend en repli (1 sens, reply-to = expéditeur). Ne throw jamais.
 */
export async function sendOutboundEmail(opts: {
  tenantId: string;
  userId: string | null;
  fromEmail?: string | null;
  to: string[];
  subject: string;
  /** Corps texte. TOUJOURS requis : c'est le repli quand le HTML n'est pas affiché. */
  body: string;
  /** Corps HTML de marque (enveloppe d'un document commercial). Optionnel. */
  html?: string;
  /** Pièces jointes (le devis en PDF). Optionnel. */
  attachments?: EmailAttachment[];
}): Promise<OutboundEmailResult> {
  const to = opts.to.filter((e) => typeof e === "string" && e.includes("@")).slice(0, 50);
  if (to.length === 0) return { ok: false, reason: "aucun destinataire valide" };

  // ── 1. Gmail de l'utilisateur (si connecté + scope gmail.send) ──────────────
  if (opts.userId) {
    let canSend = false;
    try {
      canSend = (await gmailStatus(opts.tenantId, opts.userId)).canSend;
    } catch {
      /* dégrade vers Resend */
    }
    if (canSend) {
      const sent = await sendGmail({
        tenantId: opts.tenantId,
        userId: opts.userId,
        to: to.join(", "),
        subject: opts.subject,
        body: opts.body,
        html: opts.html,
        attachments: opts.attachments,
      });
      if (sent.ok) {
        return {
          ok: true,
          via: "gmail",
          id: sent.id,
          note: "Envoyé depuis votre Gmail — les réponses vous reviendront directement.",
        };
      }
      // Gmail connecté mais l'ENVOI a échoué : on NE retombe PAS sur Resend
      // (risque de doublon si Gmail a partiellement traité). On remonte l'erreur.
      if (sent.reason === "send_failed") {
        return { ok: false, reason: `envoi Gmail échoué${sent.detail ? ` : ${sent.detail}` : ""}` };
      }
      // not_connected / missing_scope / no_service → on tente Resend ci-dessous.
    }
  }

  // ── 2. Repli Resend (reply-to = email de l'utilisateur) ─────────────────────
  if (!hasMailerKey()) {
    return {
      ok: false,
      reason: "aucun canal d'envoi : connectez votre Gmail (Réglages → Connexions) ou configurez l'envoi Biltia.",
    };
  }
  const replyTo = opts.fromEmail && opts.fromEmail.includes("@") ? opts.fromEmail : undefined;
  const sent = await sendEmail({
    to,
    subject: opts.subject,
    text: opts.body,
    html: opts.html,
    attachments: opts.attachments,
    replyTo,
  });
  if (!sent.ok) return { ok: false, reason: sent.reason };
  return {
    ok: true,
    via: "resend",
    id: sent.id,
    note: replyTo
      ? `Envoyé via Biltia. Les réponses arriveront sur votre boîte (${replyTo}). Connectez votre Gmail pour envoyer directement depuis votre adresse.`
      : "Envoyé via Biltia. Connectez votre Gmail pour recevoir les réponses.",
  };
}
