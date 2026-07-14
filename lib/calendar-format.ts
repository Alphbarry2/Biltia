// ─────────────────────────────────────────────────────────────────────────────
// AGENDA — types et mise en forme COMMUNS à Google Agenda et Outlook Calendar.
//
// Module feuille, sans dépendance : c'est ce qui permet à lib/gcal.ts et
// lib/msgraph.ts de l'importer tous les deux sans cycle, et à lib/calendar.ts
// (l'aiguillage) de s'appuyer dessus.
//
// Pourquoi centraliser un simple formatage : « qu'est-ce que j'ai demain ? » doit
// répondre EXACTEMENT la même chose que l'agenda soit chez Google ou chez
// Microsoft. Deux formateurs jumeaux, c'est deux formateurs qui divergent au
// premier correctif appliqué d'un seul côté.
// ─────────────────────────────────────────────────────────────────────────────

/** Un événement, réduit à ce dont l'artisan a besoin. Le dénominateur commun
 *  entre un event Google et un event Graph. */
export type CalEventLite = {
  /** Début, ISO. Heure LOCALE (les deux clients demandent Europe/Paris). */
  startISO: string;
  /** Journée entière → pas d'heure à afficher. */
  allDay?: boolean;
  summary?: string;
  location?: string;
};

export type CalReadResult =
  | { ok: true; summary: string }
  | { ok: false; reason: "not_connected" | "missing_scope" | "no_service" | "read_failed"; detail?: string };

export type CalCreateResult =
  | { ok: true; summary: string; whenLabel: string }
  | { ok: false; reason: "not_connected" | "missing_scope" | "no_service" | "create_failed"; detail?: string };

function fmtDay(d: Date): string {
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

/** Regroupe les événements par jour, dans l'ordre chronologique. Renvoie "" si
 *  la liste est vide — l'appelant décide quoi dire d'un agenda libre. */
export function groupByDay(events: CalEventLite[]): string {
  const byDay = new Map<string, string[]>();
  for (const ev of events) {
    if (!ev.startISO) continue;
    const key = fmtDay(new Date(ev.startISO));
    const time = ev.allDay ? "journée" : fmtTime(ev.startISO);
    const line = `- ${time} · ${ev.summary ?? "(sans titre)"}${ev.location ? ` (${ev.location})` : ""}`;
    const arr = byDay.get(key) ?? [];
    arr.push(line);
    byDay.set(key, arr);
  }
  const blocks = [...byDay.entries()].map(
    ([day, lines]) => `${day.charAt(0).toUpperCase() + day.slice(1)}\n${lines.join("\n")}`
  );
  return blocks.join("\n\n");
}

/** « 2026-07-07T14:00:00 » → « 07/07 à 14h00 » (affichage simple, sans piège de fuseau). */
export function whenLabel(startISO: string): string {
  const m = startISO.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return m ? `${m[3]}/${m[2]} à ${m[4]}h${m[5]}` : startISO;
}
