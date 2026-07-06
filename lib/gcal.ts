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
