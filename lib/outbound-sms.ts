// ─────────────────────────────────────────────────────────────────────────────
// OUTBOUND SMS — relances et confirmations par SMS (le client BTP ne lit pas
// toujours ses mails ; le SMS convertit). STRICTEMENT CÔTÉ SERVEUR.
//
// Implémentation Twilio via `fetch` (pas de dépendance npm — motif lib/mailer.ts).
// Choisi pour : délivrabilité FR/BE éprouvée + numéro réel = le client peut
// RÉPONDRE (2 sens). Tout le fournisseur est isolé ici : basculer vers un autre
// (sent.dm…) = réécrire ce seul fichier. Dégradation HONNÊTE : clés absentes →
// { ok:false, reason } explicite, jamais d'exception propagée.
//
// Env : TWILIO_ACCOUNT_SID (AC…), TWILIO_AUTH_TOKEN, et un expéditeur —
//   TWILIO_FROM (numéro E.164 : +33…) OU TWILIO_MESSAGING_SERVICE_SID (MG…).
// ─────────────────────────────────────────────────────────────────────────────

export type SmsResult =
  | { ok: true; sent: number; failed: number; ids: string[] }
  | { ok: false; reason: string };

export function hasSmsProvider(): boolean {
  const sid = process.env.TWILIO_ACCOUNT_SID ?? "";
  const token = process.env.TWILIO_AUTH_TOKEN ?? "";
  const from = process.env.TWILIO_FROM ?? process.env.TWILIO_MESSAGING_SERVICE_SID ?? "";
  return sid.startsWith("AC") && token.length > 20 && from.length > 3;
}

export function canSendSms(): boolean {
  return hasSmsProvider();
}

/**
 * Normalise un numéro en E.164. Accepte le format international (+…, 00…) tel
 * quel ; convertit un format national « 0X… » (10 chiffres) selon le pays par
 * défaut (FR par défaut, BE si précisé). Renvoie null si non exploitable — on ne
 * texte JAMAIS un numéro dont on n'est pas sûr (risque de mauvais pays).
 */
export function normalizeSmsNumber(raw: string, defaultCountry: "FR" | "BE" = "FR"): string | null {
  let n = String(raw || "").replace(/[\s.\-()]/g, "");
  if (!n) return null;
  if (n.startsWith("+")) return /^\+\d{6,15}$/.test(n) ? n : null;
  if (n.startsWith("00")) {
    n = "+" + n.slice(2);
    return /^\+\d{6,15}$/.test(n) ? n : null;
  }
  // Format national « 0X… » (FR/BE = 10 chiffres commençant par 0).
  if (/^0\d{9}$/.test(n)) {
    const cc = defaultCountry === "BE" ? "+32" : "+33";
    return cc + n.slice(1);
  }
  return null;
}

/**
 * Envoie un SMS à un ou plusieurs destinataires (un appel Twilio par numéro).
 * Ne throw jamais. `defaultCountry` sert à normaliser les numéros nationaux.
 */
export async function sendSms(opts: {
  to: string[];
  body: string;
  defaultCountry?: "FR" | "BE";
}): Promise<SmsResult> {
  if (!hasSmsProvider()) {
    return { ok: false, reason: "SMS non configuré (clés Twilio manquantes)." };
  }
  const body = String(opts.body || "").slice(0, 1600); // ~10 segments max
  if (!body.trim()) return { ok: false, reason: "message vide" };

  const numbers = [...new Set(opts.to.map((t) => normalizeSmsNumber(t, opts.defaultCountry)).filter(Boolean))] as string[];
  if (numbers.length === 0) {
    return { ok: false, reason: "aucun numéro valide (format attendu : +33612345678)" };
  }

  const sid = process.env.TWILIO_ACCOUNT_SID as string;
  const token = process.env.TWILIO_AUTH_TOKEN as string;
  const from = process.env.TWILIO_FROM ?? "";
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID ?? "";
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;

  const ids: string[] = [];
  let failed = 0;
  for (const to of numbers.slice(0, 50)) {
    const form = new URLSearchParams();
    form.set("To", to);
    if (messagingServiceSid) form.set("MessagingServiceSid", messagingServiceSid);
    else form.set("From", from);
    form.set("Body", body);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
      if (!res.ok) {
        failed++;
        continue;
      }
      const json = (await res.json().catch(() => ({}))) as { sid?: string };
      if (json.sid) ids.push(json.sid);
    } catch {
      failed++;
    }
  }

  if (ids.length === 0) {
    return { ok: false, reason: "l'envoi SMS a échoué (fournisseur injoignable ou numéros refusés)." };
  }
  return { ok: true, sent: ids.length, failed, ids };
}
