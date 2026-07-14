// ─────────────────────────────────────────────────────────────────────────────
// GOOGLE AGENDA — le CLIENT Google, et rien d'autre : lire les événements à
// venir, créer un rendez-vous. Réutilise le jeton Google géré par lib/gmail.ts
// (refresh automatique). STRICTEMENT côté serveur. Ne throw jamais.
//
// Il n'y a PAS de texte destiné à l'utilisateur ici : la mise en forme (« voici
// ta semaine ») vit dans lib/calendar-format.ts, et le choix du fournisseur dans
// lib/calendar.ts. Ce fichier a un pendant strictement symétrique côté Microsoft
// (lib/msgraph.ts) — toute divergence entre les deux se paie en bugs qui ne
// touchent qu'une moitié des clients.
// ─────────────────────────────────────────────────────────────────────────────

import { getValidGoogleToken } from "./gmail";
import { createAdminClient } from "./supabase-admin";
import type { CalEventLite } from "./calendar-format";

const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar",
];

// L'écriture exige un scope d'écriture (calendar.events ou calendar), pas
// calendar.readonly.
const CALENDAR_WRITE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar",
];

/**
 * L'agenda Google est-il connecté avec un scope calendrier ? Vérification LÉGÈRE
 * (lecture des scopes en base, sans appel réseau) — pour le preflight d'un agent
 * qui transmet le planning. Motif gmailStatus (lib/gmail.ts). Ne throw jamais.
 */
export async function googleCalendarConnected(tenantId: string, userId: string): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin) return false;
  const { data } = await admin
    .from("user_connections")
    .select("scopes")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("provider", "google")
    .maybeSingle();
  const scopes = (data as { scopes?: string[] } | null)?.scopes ?? [];
  return scopes.some((s) => CALENDAR_SCOPES.includes(s));
}

export type GoogleEventsResult =
  | { ok: true; events: CalEventLite[] }
  | { ok: false; reason: "not_connected" | "missing_scope" | "no_service" | "read_failed"; detail?: string };

type GoogleEvent = {
  summary?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
};

/** Événements des `days` prochains jours de l'agenda principal. */
export async function readGoogleEvents(opts: {
  tenantId: string;
  userId: string;
  days?: number;
  max?: number;
}): Promise<GoogleEventsResult> {
  const tok = await getValidGoogleToken(opts.tenantId, opts.userId);
  if (!tok.ok) {
    const reason =
      tok.reason === "no_service" ? "no_service" : tok.reason === "not_connected" ? "not_connected" : "read_failed";
    return { ok: false, reason, detail: tok.detail };
  }
  if (!tok.scopes.some((s) => CALENDAR_SCOPES.includes(s))) {
    return { ok: false, reason: "missing_scope" };
  }

  const days = opts.days ?? 7;
  const now = new Date();
  const end = new Date(now.getTime() + days * 86_400_000);
  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: String(opts.max ?? 80),
  });
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
    { headers: { Authorization: `Bearer ${tok.accessToken}` } }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { ok: false, reason: "read_failed", detail: `${res.status} ${detail.slice(0, 200)}` };
  }

  const json = (await res.json().catch(() => ({}))) as { items?: GoogleEvent[] };
  const events: CalEventLite[] = [];
  for (const ev of json.items ?? []) {
    const startISO = ev.start?.dateTime ?? ev.start?.date;
    if (!startISO) continue;
    events.push({
      startISO,
      allDay: !ev.start?.dateTime,
      summary: ev.summary,
      location: ev.location,
    });
  }
  return { ok: true, events };
}

export type GoogleCreateResult =
  | { ok: true }
  | { ok: false; reason: "not_connected" | "missing_scope" | "no_service" | "create_failed"; detail?: string };

/**
 * Crée un événement dans l'agenda principal. Ne throw jamais.
 *
 * Les dates arrivent en heure locale « YYYY-MM-DDTHH:MM:SS » (résolues par le
 * classifieur à partir de la date du jour) et partent avec timeZone Europe/Paris :
 * Google interprète alors l'heure locale correctement.
 */
export async function createGoogleEvent(opts: {
  tenantId: string;
  userId: string;
  summary: string;
  startISO: string;
  endISO?: string;
  location?: string;
}): Promise<GoogleCreateResult> {
  const tok = await getValidGoogleToken(opts.tenantId, opts.userId);
  if (!tok.ok) {
    const reason =
      tok.reason === "no_service" ? "no_service" : tok.reason === "not_connected" ? "not_connected" : "create_failed";
    return { ok: false, reason, detail: tok.detail };
  }
  if (!tok.scopes.some((s) => CALENDAR_WRITE_SCOPES.includes(s))) {
    return { ok: false, reason: "missing_scope" };
  }

  const end = opts.endISO && opts.endISO.trim() ? opts.endISO.trim() : opts.startISO;
  const body: Record<string, unknown> = {
    summary: opts.summary,
    start: { dateTime: opts.startISO, timeZone: "Europe/Paris" },
    end: { dateTime: end, timeZone: "Europe/Paris" },
  };
  if (opts.location) body.location = opts.location;

  const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    headers: { Authorization: `Bearer ${tok.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { ok: false, reason: "create_failed", detail: `${res.status} ${detail.slice(0, 200)}` };
  }
  return { ok: true };
}
