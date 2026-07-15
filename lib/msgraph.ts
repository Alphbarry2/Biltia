// ─────────────────────────────────────────────────────────────────────────────
// MICROSOFT GRAPH — « les mains » de l'agent côté Microsoft 365 : envoyer un mail
// depuis Outlook, poser un RDV dans l'agenda Outlook, classer un PDF dans
// Le pendant exact de lib/gmail.ts + lib/gcal.ts.
//
// STRICTEMENT côté serveur (lit access_token/refresh_token via service_role).
// Ne throw JAMAIS : renvoie un résultat typé, pour que l'agent puisse réagir
// (envoyé / pas connecté / droit manquant / échec) au lieu de planter.
//
// ⚠️ CE QUI DIFFÈRE DE GOOGLE, ET QUI COÛTE CHER SI ON L'OUBLIE :
//
//  1. Un jeton Azure n'est PAS cumulatif. Il ne porte que les scopes demandés au
//     moment où il est frappé. Google, lui, empile (include_granted_scopes). Donc
//     on re-frappe TOUJOURS le jeton sur l'union des scopes consentis (stockés en
//     base), sinon connecter l'Agenda rendrait Outlook aveugle à Mail.Send.
//
//  2. Azure renvoie les scopes en forme COURTE (« Mail.Send ») alors qu'on les
//     demande en forme longue (« https://graph.microsoft.com/Mail.Send »). Toute
//     comparaison passe donc par normalizeScope() — cf. lib/connectors.ts.
//
//  3. sendMail plafonne la requête à ~4 Mo. Une pièce jointe lourde ne passe pas :
//     on le dit (attachment_too_big) et l'appelant retombe sur l'envoi Biltia,
//     plutôt que de laisser le devis mourir en silence.
// ─────────────────────────────────────────────────────────────────────────────

import { createAdminClient } from "./supabase-admin";
import { refreshAccessToken } from "./oauth";
import { scopesCover, isProviderLive } from "./connectors";
import type { EmailAttachment } from "./mailer";
import type { CalEventLite } from "./calendar-format";

const GRAPH = "https://graph.microsoft.com/v1.0";

export const MAIL_SEND_SCOPE = "Mail.Send";
export const CALENDAR_SCOPE = "Calendars.ReadWrite";
/** sendMail encaisse ~4 Mo de requête. On garde de la marge pour l'enveloppe
 *  JSON + le base64 (qui gonfle de ~33 %) : au-delà, on rend la main. */
const MAX_ATTACHMENTS_BYTES = 3 * 1024 * 1024;

type Conn = {
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  scopes: string[] | null;
};

export type MsTokenResult =
  | { ok: true; accessToken: string; scopes: string[] }
  | { ok: false; reason: "not_connected" | "no_service" | "send_failed"; detail?: string };

/**
 * Jeton d'accès Microsoft valide (rafraîchi et re-persisté si nécessaire).
 * Le refresh redemande TOUS les scopes consentis (cf. note 1 en tête de fichier).
 */
export async function getValidMicrosoftToken(tenantId: string, userId: string): Promise<MsTokenResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, reason: "no_service" };

  const { data } = await admin
    .from("user_connections")
    .select("access_token, refresh_token, token_expires_at, scopes")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("provider", "microsoft")
    .maybeSingle();

  const conn = data as Conn | null;
  if (!conn) return { ok: false, reason: "not_connected" };

  const scopes = conn.scopes ?? [];
  const expiresAt = conn.token_expires_at ? Date.parse(conn.token_expires_at) : 0;

  // Jeton encore valide (marge de 60 s) → tel quel.
  if (conn.access_token && expiresAt > Date.now() + 60_000) {
    return { ok: true, accessToken: conn.access_token, scopes };
  }

  if (!conn.refresh_token) return { ok: false, reason: "not_connected" };
  try {
    const t = await refreshAccessToken({
      provider: "microsoft",
      refreshToken: conn.refresh_token,
      scopes,
    });
    const newExpiry = t.expires_in ? new Date(Date.now() + t.expires_in * 1000).toISOString() : null;
    await admin
      .from("user_connections")
      .update({
        access_token: t.access_token,
        // Azure fait tourner le refresh_token à chaque échange : garder l'ancien
        // reviendrait à déconnecter l'utilisateur au bout de quelques semaines.
        ...(t.refresh_token ? { refresh_token: t.refresh_token } : {}),
        token_expires_at: newExpiry,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .eq("provider", "microsoft");
    return { ok: true, accessToken: t.access_token, scopes };
  } catch (e) {
    return { ok: false, reason: "send_failed", detail: e instanceof Error ? e.message : "refresh" };
  }
}

/** Statut Microsoft (lecture des scopes en base, SANS appel réseau) — pour les
 *  preflights d'agent, qui ne doivent pas payer un aller-retour Azure. */
export async function microsoftStatus(
  tenantId: string,
  userId: string
): Promise<{ connected: boolean; canSendMail: boolean; canCalendar: boolean }> {
  const admin = createAdminClient();
  const off = { connected: false, canSendMail: false, canCalendar: false };
  if (!admin) return off;
  // Microsoft éteint (connecteurs "soon") → aucun chemin d'action ne passe par Graph,
  // MÊME si un jeton traîne en base d'une connexion antérieure. Sans ce garde-fou,
  // « désactivé » ne vaudrait qu'à l'écran et un agent continuerait d'envoyer par
  // Outlook un mail que la page Connecteurs annonce comme indisponible.
  if (!isProviderLive("microsoft")) return off;
  const { data } = await admin
    .from("user_connections")
    .select("scopes")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("provider", "microsoft")
    .maybeSingle();
  if (!data) return off;
  const scopes = (data as { scopes?: string[] }).scopes ?? [];
  return {
    connected: true,
    canSendMail: scopesCover(scopes, [MAIL_SEND_SCOPE]),
    canCalendar: scopesCover(scopes, [CALENDAR_SCOPE]),
  };
}

async function graphFetch(
  accessToken: string,
  path: string,
  init: RequestInit = {}
): Promise<{ ok: true; json: Record<string, unknown> } | { ok: false; detail: string }> {
  try {
    const res = await fetch(path.startsWith("http") ? path : `${GRAPH}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${accessToken}`, ...(init.headers ?? {}) },
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, detail: `${res.status} ${text.slice(0, 300)}` };
    return { ok: true, json: text ? (JSON.parse(text) as Record<string, unknown>) : {} };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "network" };
  }
}

// ── OUTLOOK : ENVOI D'EMAIL ──────────────────────────────────────────────────

export type OutlookSendResult =
  | { ok: true; id: string }
  | {
      ok: false;
      reason: "not_connected" | "missing_scope" | "no_service" | "send_failed" | "attachment_too_big";
      detail?: string;
    };

/** Envoie un email via Outlook au nom de l'utilisateur. Ne throw jamais. */
export async function sendOutlookMail(opts: {
  tenantId: string;
  userId: string;
  /** Destinataires (déjà validés par l'appelant). */
  to: string[];
  subject: string;
  body: string;
  html?: string;
  attachments?: EmailAttachment[];
}): Promise<OutlookSendResult> {
  const tok = await getValidMicrosoftToken(opts.tenantId, opts.userId);
  if (!tok.ok) return { ok: false, reason: tok.reason, detail: tok.detail };
  if (!scopesCover(tok.scopes, [MAIL_SEND_SCOPE])) return { ok: false, reason: "missing_scope" };

  const attachments = opts.attachments ?? [];
  const totalBytes = attachments.reduce((n, a) => n + a.content.length, 0);
  if (totalBytes > MAX_ATTACHMENTS_BYTES) {
    // Pas un échec produit : l'appelant a un autre canal. On le nomme précisément
    // pour qu'il puisse retomber dessus plutôt que d'abandonner l'envoi.
    return {
      ok: false,
      reason: "attachment_too_big",
      detail: `${Math.round(totalBytes / 1024)} Ko de pièces jointes, au-delà de la limite Outlook (3 Mo)`,
    };
  }

  const message: Record<string, unknown> = {
    subject: opts.subject,
    body: opts.html
      ? { contentType: "HTML", content: opts.html }
      : { contentType: "Text", content: opts.body },
    toRecipients: opts.to.map((address) => ({ emailAddress: { address } })),
  };
  if (attachments.length > 0) {
    message.attachments = attachments.map((a) => ({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: a.filename,
      contentType: a.contentType,
      contentBytes: Buffer.from(a.content).toString("base64"),
    }));
  }

  const res = await graphFetch(tok.accessToken, "/me/sendMail", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, saveToSentItems: true }),
  });
  if (!res.ok) return { ok: false, reason: "send_failed", detail: res.detail };
  // sendMail répond 202 Accepted, sans corps ni identifiant de message : il n'y a
  // rien à renvoyer, et prétendre le contraire serait inventer un id.
  return { ok: true, id: "" };
}

// ── OUTLOOK : AGENDA ─────────────────────────────────────────────────────────

type GraphEvent = {
  subject?: string;
  location?: { displayName?: string };
  start?: { dateTime?: string };
  isAllDay?: boolean;
};

/** Événements des `days` prochains jours, normalisés pour le formateur commun. */
async function readOutlookEvents(
  tenantId: string,
  userId: string,
  days: number,
  max: number
): Promise<
  | { ok: true; events: CalEventLite[] }
  | { ok: false; reason: "not_connected" | "missing_scope" | "no_service" | "read_failed"; detail?: string }
> {
  const tok = await getValidMicrosoftToken(tenantId, userId);
  if (!tok.ok) {
    const reason = tok.reason === "no_service" ? "no_service" : tok.reason === "not_connected" ? "not_connected" : "read_failed";
    return { ok: false, reason, detail: tok.detail };
  }
  if (!scopesCover(tok.scopes, [CALENDAR_SCOPE])) return { ok: false, reason: "missing_scope" };

  const now = new Date();
  const end = new Date(now.getTime() + days * 86_400_000);
  const params = new URLSearchParams({
    startDateTime: now.toISOString(),
    endDateTime: end.toISOString(),
    $orderby: "start/dateTime",
    $top: String(max),
    $select: "subject,start,location,isAllDay",
  });
  const res = await graphFetch(tok.accessToken, `/me/calendarView?${params.toString()}`, {
    // Sans ce Prefer, Graph renvoie tout en UTC et un RDV de 9 h s'affiche à 7 h.
    headers: { Prefer: 'outlook.timezone="Europe/Paris"' },
  });
  if (!res.ok) return { ok: false, reason: "read_failed", detail: res.detail };

  const items = (res.json.value as GraphEvent[] | undefined) ?? [];
  const events: CalEventLite[] = [];
  for (const ev of items) {
    const start = ev.start?.dateTime;
    if (!start) continue;
    events.push({
      startISO: start,
      allDay: ev.isAllDay === true,
      summary: ev.subject,
      location: ev.location?.displayName,
    });
  }
  return { ok: true, events };
}

export async function readOutlookAgenda(opts: {
  tenantId: string;
  userId: string;
  days?: number;
}): Promise<
  | { ok: true; events: CalEventLite[] }
  | { ok: false; reason: "not_connected" | "missing_scope" | "no_service" | "read_failed"; detail?: string }
> {
  return readOutlookEvents(opts.tenantId, opts.userId, opts.days ?? 7, 80);
}

export type OutlookCreateResult =
  | { ok: true }
  | { ok: false; reason: "not_connected" | "missing_scope" | "no_service" | "create_failed"; detail?: string };

/** Crée un événement dans l'agenda Outlook. Ne throw jamais. */
export async function createOutlookEvent(opts: {
  tenantId: string;
  userId: string;
  summary: string;
  startISO: string;
  endISO?: string;
  location?: string;
}): Promise<OutlookCreateResult> {
  const tok = await getValidMicrosoftToken(opts.tenantId, opts.userId);
  if (!tok.ok) {
    const reason = tok.reason === "no_service" ? "no_service" : tok.reason === "not_connected" ? "not_connected" : "create_failed";
    return { ok: false, reason, detail: tok.detail };
  }
  if (!scopesCover(tok.scopes, [CALENDAR_SCOPE])) return { ok: false, reason: "missing_scope" };

  const end = opts.endISO && opts.endISO.trim() ? opts.endISO.trim() : opts.startISO;
  const body: Record<string, unknown> = {
    subject: opts.summary,
    start: { dateTime: opts.startISO, timeZone: "Europe/Paris" },
    end: { dateTime: end, timeZone: "Europe/Paris" },
  };
  if (opts.location) body.location = { displayName: opts.location };

  const res = await graphFetch(tok.accessToken, "/me/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { ok: false, reason: "create_failed", detail: res.detail };
  return { ok: true };
}
