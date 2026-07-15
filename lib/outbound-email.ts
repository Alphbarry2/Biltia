// ─────────────────────────────────────────────────────────────────────────────
// OUTBOUND EMAIL — un SEUL point d'envoi sortant, qui choisit le BON canal :
//   1. Gmail de l'utilisateur (connecté, scope gmail.send) → l'email part DE SA
//      boîte et les réponses lui reviennent NATURELLEMENT (vrai fil de discussion).
//   2. Sinon Outlook / Microsoft 365 (scope Mail.Send) → même promesse. Un artisan
//      sous Microsoft n'a pas de Gmail : sans cette branche, il resterait à vie sur
//      l'adresse d'expédition de Biltia alors qu'il a connecté son compte.
//   3. Sinon repli Resend (transactionnel) avec reply-to = son email : les
//      réponses atterrissent quand même chez lui, mais c'est à sens unique.
//
// Utilisé par l'exécuteur d'agents (livraison + outil send_email) ET les apps
// générées (window.biltia.sendEmail → /api/app-email). Ne throw jamais : renvoie
// un résultat typé + une note lisible pour l'utilisateur.
// ─────────────────────────────────────────────────────────────────────────────

import { sendGmail, gmailStatus } from "./gmail";
import { sendOutlookMail, microsoftStatus } from "./msgraph";
import { sendEmail, hasMailerKey, type EmailAttachment } from "./mailer";
import { preferredProviderOrder } from "./send-preference-server";
import type { OAuthProvider } from "./connectors";

export type { EmailAttachment };

export type OutboundEmailResult =
  | { ok: true; via: "gmail" | "outlook" | "resend"; id: string; note: string }
  | { ok: false; reason: string };

/** Y a-t-il AU MOINS un canal d'envoi utilisable ? (means-check précoce, avant
 *  de rédiger — un agent ne rédige pas un email qu'il ne pourra pas envoyer). */
export async function canSendOutbound(
  tenantId: string,
  userId: string | null
): Promise<{ ok: boolean; gmail: boolean; outlook: boolean; resend: boolean }> {
  const resend = hasMailerKey();
  let gmail = false;
  let outlook = false;
  if (userId) {
    try {
      gmail = (await gmailStatus(tenantId, userId)).canSend;
    } catch {
      gmail = false;
    }
    try {
      outlook = (await microsoftStatus(tenantId, userId)).canSendMail;
    } catch {
      outlook = false;
    }
  }
  return { ok: gmail || outlook || resend, gmail, outlook, resend };
}

/**
 * Envoie un email par le meilleur canal disponible. La boîte de l'utilisateur
 * d'abord (2 sens), Resend en repli (1 sens, reply-to = expéditeur). Ne throw jamais.
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

  // ── Boîte de l'utilisateur, dans l'ORDRE de son compte par défaut ───────────
  // Chaque tentative dit : « envoyé » / « échec dur » (on s'arrête) ou « passe »
  // (on essaie le fournisseur suivant, puis Resend). L'ordre vient de la préférence
  // (premier connecté, ou choix explicite) au lieu d'être Gmail-d'abord codé en dur.
  type Attempt =
    | { outcome: "sent" | "hard-fail"; result: OutboundEmailResult }
    | { outcome: "skip" };

  const tryGmail = async (): Promise<Attempt> => {
    if (!opts.userId) return { outcome: "skip" };
    let canSend = false;
    try {
      canSend = (await gmailStatus(opts.tenantId, opts.userId)).canSend;
    } catch {
      return { outcome: "skip" };
    }
    if (!canSend) return { outcome: "skip" };
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
        outcome: "sent",
        result: { ok: true, via: "gmail", id: sent.id, note: "Envoyé depuis votre Gmail — les réponses vous reviendront directement." },
      };
    }
    // Gmail connecté mais ENVOI échoué : on NE retombe PAS ailleurs (risque de
    // doublon si Gmail a partiellement traité). On remonte l'erreur.
    if (sent.reason === "send_failed") {
      return { outcome: "hard-fail", result: { ok: false, reason: `envoi Gmail échoué${sent.detail ? ` : ${sent.detail}` : ""}` } };
    }
    return { outcome: "skip" }; // not_connected / missing_scope / no_service
  };

  const tryOutlook = async (): Promise<Attempt> => {
    if (!opts.userId) return { outcome: "skip" };
    let canSend = false;
    try {
      canSend = (await microsoftStatus(opts.tenantId, opts.userId)).canSendMail;
    } catch {
      return { outcome: "skip" };
    }
    if (!canSend) return { outcome: "skip" };
    const sent = await sendOutlookMail({
      tenantId: opts.tenantId,
      userId: opts.userId,
      to,
      subject: opts.subject,
      body: opts.body,
      html: opts.html,
      attachments: opts.attachments,
    });
    if (sent.ok) {
      return {
        outcome: "sent",
        result: { ok: true, via: "outlook", id: sent.id, note: "Envoyé depuis votre Outlook — les réponses vous reviendront directement." },
      };
    }
    if (sent.reason === "send_failed") {
      return { outcome: "hard-fail", result: { ok: false, reason: `envoi Outlook échoué${sent.detail ? ` : ${sent.detail}` : ""}` } };
    }
    // attachment_too_big : rien n'est parti → Resend plutôt que d'abandonner le devis.
    return { outcome: "skip" };
  };

  // Repli sur l'ordre historique Gmail → Outlook si la base ne répond pas : mieux
  // vaut envoyer que rien. La préférence, quand elle existe, met le bon compte en tête.
  const order = await preferredProviderOrder(opts.tenantId, opts.userId, "email");
  const sequence: OAuthProvider[] = order.length ? order : ["google", "microsoft"];
  for (const provider of sequence) {
    const attempt = provider === "google" ? await tryGmail() : await tryOutlook();
    if (attempt.outcome !== "skip") return attempt.result;
  }

  // ── Repli Resend (reply-to = email de l'utilisateur) ─────────────────────
  if (!hasMailerKey()) {
    return {
      ok: false,
      reason:
        "aucun canal d'envoi : connectez votre Gmail ou votre Outlook (Réglages → Connexions), ou configurez l'envoi Biltia.",
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
      ? `Envoyé via Biltia. Les réponses arriveront sur votre boîte (${replyTo}). Connectez votre Gmail ou votre Outlook pour envoyer directement depuis votre adresse.`
      : "Envoyé via Biltia. Connectez votre Gmail ou votre Outlook pour recevoir les réponses.",
  };
}
