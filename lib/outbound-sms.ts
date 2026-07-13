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
// Env : TWILIO_ACCOUNT_SID (AC…, sert au chemin d'URL) + un mode d'authentification
//   PRÉFÉRÉ → TWILIO_API_KEY_SID (SK…) + TWILIO_API_KEY_SECRET  (clé révocable, ne
//             compromet pas le compte entier si elle fuite)
//   REPLI   → TWILIO_AUTH_TOKEN  (clé maîtresse du compte)
//   et un expéditeur — TWILIO_FROM (numéro E.164 : +33…) OU TWILIO_MESSAGING_SERVICE_SID (MG…).
// ─────────────────────────────────────────────────────────────────────────────

export type SmsResult =
  | { ok: true; sent: number; failed: number; ids: string[]; note?: string }
  | { ok: false; reason: string };

/**
 * Résout les identifiants Basic Auth pour l'API REST Twilio. Priorité à la clé
 * API dédiée (SK…:secret) — révocable, périmètre limité ; repli sur l'Auth Token
 * (AC…:token) si la clé n'est pas configurée. Renvoie null si aucun mode valide.
 * NB : quel que soit le mode, le CHEMIN d'URL utilise toujours l'Account SID (AC…).
 */
function twilioAuth(): { user: string; pass: string } | null {
  const keySid = process.env.TWILIO_API_KEY_SID ?? "";
  const keySecret = process.env.TWILIO_API_KEY_SECRET ?? "";
  if (keySid.startsWith("SK") && keySecret.length > 20) {
    return { user: keySid, pass: keySecret };
  }
  const accountSid = process.env.TWILIO_ACCOUNT_SID ?? "";
  const token = process.env.TWILIO_AUTH_TOKEN ?? "";
  if (accountSid.startsWith("AC") && token.length > 20) {
    return { user: accountSid, pass: token };
  }
  return null;
}

export function hasSmsProvider(): boolean {
  const accountSid = process.env.TWILIO_ACCOUNT_SID ?? "";
  const from = process.env.TWILIO_FROM ?? process.env.TWILIO_MESSAGING_SERVICE_SID ?? "";
  return accountSid.startsWith("AC") && twilioAuth() !== null && from.length > 3;
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

// ── PLAFOND DE SEGMENTS — le seul risque financier NON BORNÉ du produit ──────
//
// Twilio facture au SEGMENT (~0,073 € en France), pas au message. Or le chemin
// agent (`send_sms` dans lib/agent-tools.ts) n'est ni budgété en crédits ni borné :
// c'est de la trésorerie qui sort, décidée par un LLM, sans compteur en face.
//
// L'ancienne borne (« 1 600 caractères ≈ 10 segments ») était fausse dans le seul
// cas qui nous concerne : dès qu'un texte contient un accent — donc TOUJOURS, en
// français — le SMS bascule en UCS-2, où un segment ne porte plus 153 caractères
// mais 67. Un corps de 1 600 caractères ne faisait donc pas 10 segments mais 24,
// et × 50 destinataires : **87 € en un seul appel d'outil**.
//
// On plafonne donc là où l'argent est compté : en segments. Décision user
// (2026-07-14) : le SMS reste OFFERT (pas de débit de crédits), mais BORNÉ.
// Exposition maximale par appel : 40 × 0,073 € ≈ 2,90 €.

/** Segments par message (le corps est tronqué au-delà). */
export const SMS_MAX_SEGMENTS_PER_MESSAGE = 4;
/** Segments cumulés sur UN appel (bornant du même coup le nombre de destinataires). */
export const SMS_MAX_SEGMENTS_PER_CALL = 40;

/** Vrai si le texte force l'encodage UCS-2 (accents, emoji) : 70 car./segment
 *  au lieu de 160, et 67 au lieu de 153 dès qu'il y a concaténation. */
function isUnicodeSms(text: string): boolean {
  return /[^\x00-\x7F]/.test(text);
}

/** Nombre de segments FACTURÉS par Twilio pour ce corps. */
export function smsSegments(text: string): number {
  if (!text) return 0;
  const unicode = isUnicodeSms(text);
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  return text.length <= single ? 1 : Math.ceil(text.length / multi);
}

/** Tronque un corps pour qu'il tienne dans `maxSegments` segments facturés.
 *
 *  ⚠️ Le marqueur de coupure doit rester dans le MÊME alphabet que le texte.
 *  Ajouter « … » (un caractère non-ASCII) à un message ASCII fait basculer tout
 *  le SMS en UCS-2 : la capacité d'un segment tombe de 153 à 67 caractères, et la
 *  troncature GONFLE le message qu'elle était censée réduire (mesuré : 4 segments
 *  attendus, 10 obtenus). D'où les trois points ASCII quand le texte est ASCII. */
export function truncateToSegments(text: string, maxSegments = SMS_MAX_SEGMENTS_PER_MESSAGE): string {
  if (smsSegments(text) <= maxSegments) return text;
  const unicode = isUnicodeSms(text);
  const suffix = unicode ? "…" : "...";
  const capacity = maxSegments * (unicode ? 67 : 153);
  return text.slice(0, Math.max(0, capacity - suffix.length)).trimEnd() + suffix;
}

/**
 * Envoie un SMS à un ou plusieurs destinataires (un appel Twilio par numéro).
 * Ne throw jamais. `defaultCountry` sert à normaliser les numéros nationaux.
 * Le corps est tronqué à SMS_MAX_SEGMENTS_PER_MESSAGE, et le nombre de
 * destinataires est réduit pour que le total tienne dans SMS_MAX_SEGMENTS_PER_CALL.
 */
export async function sendSms(opts: {
  to: string[];
  body: string;
  defaultCountry?: "FR" | "BE";
}): Promise<SmsResult> {
  if (!hasSmsProvider()) {
    return { ok: false, reason: "SMS non configuré (clés Twilio manquantes)." };
  }
  const body = truncateToSegments(String(opts.body || "").trim());
  if (!body) return { ok: false, reason: "message vide" };

  const numbers = [...new Set(opts.to.map((t) => normalizeSmsNumber(t, opts.defaultCountry)).filter(Boolean))] as string[];
  if (numbers.length === 0) {
    return { ok: false, reason: "aucun numéro valide (format attendu : +33612345678)" };
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID as string;
  const creds = twilioAuth();
  if (!creds) {
    return { ok: false, reason: "SMS non configuré (identifiants Twilio manquants)." };
  }
  const from = process.env.TWILIO_FROM ?? "";
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID ?? "";
  const auth = Buffer.from(`${creds.user}:${creds.pass}`).toString("base64");
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

  // Budget de segments : c'est l'unité que Twilio facture, donc la seule borne qui
  // veuille dire quelque chose. Un message long réduit mécaniquement le nombre de
  // destinataires atteints — et on le DIT (`note`), au lieu de tronquer en silence.
  const segsPerMessage = smsSegments(body);
  const maxRecipients = Math.max(1, Math.floor(SMS_MAX_SEGMENTS_PER_CALL / segsPerMessage));
  const targets = numbers.slice(0, maxRecipients);
  const dropped = numbers.length - targets.length;

  const ids: string[] = [];
  let failed = 0;
  for (const to of targets) {
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
  // Ne JAMAIS tronquer en silence : l'agent doit savoir qu'il n'a pas touché tout
  // le monde, sinon il rendra compte d'un envoi complet qui n'a pas eu lieu.
  const note =
    dropped > 0
      ? `Plafond SMS atteint : ${targets.length} destinataire(s) sur ${numbers.length} (message de ${segsPerMessage} segment(s), budget ${SMS_MAX_SEGMENTS_PER_CALL}). Raccourcissez le message ou envoyez en plusieurs fois.`
      : undefined;
  return { ok: true, sent: ids.length, failed, ids, note };
}
