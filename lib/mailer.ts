// ─────────────────────────────────────────────────────────────────────────────
// MAILER — envoi d'emails transactionnels via Resend. STRICTEMENT CÔTÉ SERVEUR.
//
// Appel HTTP direct via `fetch` — pas de nouvelle dépendance npm (motif
// lib/embeddings.ts). Dégradation HONNÊTE : clé absente → { ok: false,
// reason } explicite, jamais d'exception propagée. L'appelant (exécuteur
// d'agents) transforme ce refus en état « bloqué » lisible, pas en crash.
//
// Env : RESEND_API_KEY (re_…) + RESEND_FROM (« Biltia <notif@votredomaine.fr> »,
// domaine vérifié chez Resend ; défaut onboarding@resend.dev pour les tests).
// ─────────────────────────────────────────────────────────────────────────────

const RESEND_URL = "https://api.resend.com/emails";

export function hasMailerKey(): boolean {
  const key = process.env.RESEND_API_KEY ?? "";
  return key.startsWith("re_") && key.length > 20;
}

export type SendEmailResult = { ok: true; id: string } | { ok: false; reason: string };

/** Pièce jointe. Défini ICI (module le plus bas de la pile, sans dépendance) et
 *  importé par gmail.ts / outbound-email.ts — pas de cycle. */
export type EmailAttachment = {
  /** Nom vu par le destinataire. ASCII conseillé (les accents cassent certains clients). */
  filename: string;
  content: Buffer;
  contentType: string;
};

/** Garde-fou commun aux deux canaux : un mail de 30 Mo est refusé par le serveur
 *  d'en face APRÈS envoi (bounce silencieux). On refuse AVANT, avec un motif lisible.
 *  Gmail plafonne à 25 Mo ; le base64 gonfle de ~33 % → 15 Mo de binaire max. */
export const MAX_ATTACHMENTS_BYTES = 15 * 1024 * 1024;

export function attachmentsTooBig(attachments?: EmailAttachment[]): boolean {
  if (!attachments?.length) return false;
  return attachments.reduce((n, a) => n + a.content.byteLength, 0) > MAX_ATTACHMENTS_BYTES;
}

/**
 * Envoie un email. Ne throw jamais.
 * `text` obligatoire (les emails d'agents restent sobres et lisibles partout) ;
 * `html` et `attachments` optionnels par-dessus.
 */
export async function sendEmail(opts: {
  to: string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: EmailAttachment[];
  replyTo?: string;
}): Promise<SendEmailResult> {
  if (!hasMailerKey()) {
    return { ok: false, reason: "envoi d'email non configuré (RESEND_API_KEY manquante)" };
  }
  const to = opts.to.filter((e) => typeof e === "string" && e.includes("@")).slice(0, 50);
  if (to.length === 0) return { ok: false, reason: "aucun destinataire valide" };
  if (attachmentsTooBig(opts.attachments)) {
    return { ok: false, reason: "pièces jointes trop lourdes (15 Mo maximum)" };
  }

  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || "Biltia <onboarding@resend.dev>",
        to,
        subject: opts.subject.slice(0, 200),
        text: opts.text,
        ...(opts.html ? { html: opts.html } : {}),
        ...(opts.attachments?.length
          ? {
              attachments: opts.attachments.map((a) => ({
                filename: a.filename,
                content: a.content.toString("base64"),
                content_type: a.contentType,
              })),
            }
          : {}),
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, reason: `Resend ${res.status} : ${detail.slice(0, 200)}` };
    }
    const json = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: json.id ?? "" };
  } catch {
    return { ok: false, reason: "réseau indisponible vers Resend" };
  }
}
