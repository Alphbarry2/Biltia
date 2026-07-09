// ─────────────────────────────────────────────────────────────────────────────
// GOOGLE AGENDA — lecture de l'agenda de l'utilisateur (« qu'est-ce que j'ai
// cette semaine ? »). Réutilise le jeton Google géré par lib/gmail.ts (refresh
// automatique). STRICTEMENT côté serveur. Ne throw jamais : renvoie un résultat
// typé pour que l'agent réagisse (agenda / pas connecté / scope manquant).
// ─────────────────────────────────────────────────────────────────────────────

import { getValidGoogleToken } from "./gmail";

const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar",
];

export type CalReadResult =
  | { ok: true; summary: string }
  | { ok: false; reason: "not_connected" | "missing_scope" | "no_service" | "read_failed"; detail?: string };

type CalEvent = {
  summary?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
};

function fmtDay(d: Date): string {
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

/** Lit les événements des `days` prochains jours de l'agenda principal. */
export async function readAgenda(opts: {
  tenantId: string;
  userId: string;
  days?: number;
}): Promise<CalReadResult> {
  const tok = await getValidGoogleToken(opts.tenantId, opts.userId);
  if (!tok.ok) {
    const reason = tok.reason === "no_service" ? "no_service" : tok.reason === "not_connected" ? "not_connected" : "read_failed";
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
    maxResults: "50",
  });
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`, {
    headers: { Authorization: `Bearer ${tok.accessToken}` },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { ok: false, reason: "read_failed", detail: `${res.status} ${detail.slice(0, 200)}` };
  }
  const json = (await res.json().catch(() => ({}))) as { items?: CalEvent[] };
  const items = json.items ?? [];
  if (items.length === 0) {
    return { ok: true, summary: `Rien de prévu dans les ${days} prochains jours. Ton agenda est libre.` };
  }

  // Grouper par jour, dans l'ordre chronologique.
  const byDay = new Map<string, string[]>();
  for (const ev of items) {
    const startIso = ev.start?.dateTime ?? ev.start?.date;
    if (!startIso) continue;
    const key = fmtDay(new Date(startIso));
    const time = ev.start?.dateTime ? fmtTime(ev.start.dateTime) : "journée";
    const line = `- ${time} · ${ev.summary ?? "(sans titre)"}${ev.location ? ` (${ev.location})` : ""}`;
    const arr = byDay.get(key) ?? [];
    arr.push(line);
    byDay.set(key, arr);
  }
  const blocks = [...byDay.entries()].map(
    ([day, lines]) => `${day.charAt(0).toUpperCase() + day.slice(1)}\n${lines.join("\n")}`
  );
  return { ok: true, summary: `Voici ton agenda des ${days} prochains jours :\n\n${blocks.join("\n\n")}` };
}

/**
 * Variante « planning d'équipe » : même lecture, mais texte NEUTRE (pas « ton
 * agenda ») destiné à être transmis aux employés. Renvoie le planning groupé par
 * jour, ou { ok:false } si non lisible (pas connecté / scope / erreur / vide).
 */
export async function readTeamAgenda(opts: {
  tenantId: string;
  userId: string;
  days?: number;
}): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
  const tok = await getValidGoogleToken(opts.tenantId, opts.userId);
  if (!tok.ok) return { ok: false, reason: tok.reason ?? "not_connected" };
  if (!tok.scopes.some((s) => CALENDAR_SCOPES.includes(s))) return { ok: false, reason: "missing_scope" };

  const days = opts.days ?? 7;
  const now = new Date();
  const end = new Date(now.getTime() + days * 86_400_000);
  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "80",
  });
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`, {
    headers: { Authorization: `Bearer ${tok.accessToken}` },
  });
  if (!res.ok) return { ok: false, reason: "read_failed" };
  const json = (await res.json().catch(() => ({}))) as { items?: CalEvent[] };
  const items = json.items ?? [];
  if (items.length === 0) return { ok: false, reason: "empty" };

  const byDay = new Map<string, string[]>();
  for (const ev of items) {
    const startIso = ev.start?.dateTime ?? ev.start?.date;
    if (!startIso) continue;
    const key = fmtDay(new Date(startIso));
    const time = ev.start?.dateTime ? fmtTime(ev.start.dateTime) : "journée";
    const line = `- ${time} · ${ev.summary ?? "(sans titre)"}${ev.location ? ` (${ev.location})` : ""}`;
    const arr = byDay.get(key) ?? [];
    arr.push(line);
    byDay.set(key, arr);
  }
  const blocks = [...byDay.entries()].map(
    ([day, lines]) => `${day.charAt(0).toUpperCase() + day.slice(1)}\n${lines.join("\n")}`
  );
  return { ok: true, text: blocks.join("\n\n") };
}

// ── CRÉATION D'ÉVÉNEMENT ──────────────────────────────────────────────────────
// L'écriture exige un scope d'écriture (calendar.events ou calendar), pas
// calendar.readonly. Les dates arrivent en heure locale « YYYY-MM-DDTHH:MM:SS »
// (résolues par le classifieur à partir de la date du jour) et sont envoyées avec
// timeZone Europe/Paris — Google interprète l'heure locale correctement.
const CALENDAR_WRITE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar",
];

export type CalCreateResult =
  | { ok: true; summary: string; whenLabel: string }
  | { ok: false; reason: "not_connected" | "missing_scope" | "no_service" | "create_failed"; detail?: string };

function whenLabel(startISO: string): string {
  // « 2026-07-07T14:00:00 » → « 07/07 à 14:00 » (affichage simple, sans piège de fuseau).
  const m = startISO.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return m ? `${m[3]}/${m[2]} à ${m[4]}h${m[5]}` : startISO;
}

/** Crée un événement dans l'agenda principal. Ne throw jamais. */
export async function createEvent(opts: {
  tenantId: string;
  userId: string;
  summary: string;
  startISO: string;
  endISO?: string;
  location?: string;
}): Promise<CalCreateResult> {
  const tok = await getValidGoogleToken(opts.tenantId, opts.userId);
  if (!tok.ok) {
    const reason = tok.reason === "no_service" ? "no_service" : tok.reason === "not_connected" ? "not_connected" : "create_failed";
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
  return { ok: true, summary: opts.summary, whenLabel: whenLabel(opts.startISO) };
}
