// ─────────────────────────────────────────────────────────────────────────────
// AGENDA — la porte UNIQUE. Le reste du produit ne connaît pas Google ni
// Microsoft : il demande « lis mon agenda », « pose ce RDV », et c'est ici qu'on
// choisit le fournisseur que l'artisan a réellement connecté.
//
// Règle d'aiguillage : celui qui est connecté gagne. Si les deux le sont, Google
// passe d'abord (c'est le fournisseur historique ; changer cet ordre déplacerait
// silencieusement les RDV d'un agenda à l'autre pour les comptes existants).
//
// Ne throw jamais. Les motifs d'échec sont ceux des clients (not_connected,
// missing_scope…), pour que l'appelant sache proposer la bonne carte.
// ─────────────────────────────────────────────────────────────────────────────

import { googleCalendarConnected, readGoogleEvents, createGoogleEvent } from "./gcal";
import { microsoftStatus, readOutlookAgenda, createOutlookEvent } from "./msgraph";
import {
  groupByDay,
  whenLabel,
  type CalEventLite,
  type CalReadResult,
  type CalCreateResult,
} from "./calendar-format";

export type { CalReadResult, CalCreateResult };

/** Les connecteurs à proposer quand aucun agenda n'est connecté. */
export const CALENDAR_CONNECTORS = ["google-calendar", "outlook-calendar"];

/** Un agenda — n'importe lequel — est-il connecté ? Vérification LÉGÈRE (lecture
 *  des scopes en base, sans appel réseau) : c'est le preflight d'un agent. */
export async function calendarConnected(tenantId: string, userId: string): Promise<boolean> {
  if (await googleCalendarConnected(tenantId, userId)) return true;
  return (await microsoftStatus(tenantId, userId)).canCalendar;
}

/**
 * Événements des `days` prochains jours, chez le fournisseur qui en a.
 *
 * Deux subtilités qui valent leur ligne de code :
 *
 *  · Un échec Google quand Microsoft est connecté ne doit pas condamner la
 *    lecture : on essaie l'autre.
 *  · Google connecté mais VIDE ne prouve pas que la semaine est libre — l'artisan
 *    peut avoir les deux comptes branchés et ne se servir que d'Outlook. Répondre
 *    « ton agenda est libre » serait alors un MENSONGE sur son activité, et il
 *    manquerait un chantier. Donc : agenda vide → on interroge quand même l'autre.
 *    Pas de doublon possible, on ne retombe sur l'autre que faute d'événements.
 */
async function readEvents(opts: {
  tenantId: string;
  userId: string;
  days: number;
}): Promise<
  | { ok: true; events: CalEventLite[] }
  | { ok: false; reason: "not_connected" | "missing_scope" | "no_service" | "read_failed"; detail?: string }
> {
  const google = await readGoogleEvents(opts);
  if (google.ok && google.events.length > 0) return google;

  const outlook = await readOutlookAgenda(opts);
  if (outlook.ok && outlook.events.length > 0) return outlook;

  // Aucun des deux n'a d'événement. Si l'un des deux a RÉPONDU, la semaine est
  // vraiment libre : on renvoie une liste vide, pas une erreur.
  if (google.ok || outlook.ok) return { ok: true, events: [] };

  // Aucun n'a répondu. On remonte le motif de Google, sauf s'il dit seulement
  // « pas connecté » alors que Microsoft, lui, a vraiment échoué.
  const meaningful =
    google.reason === "not_connected" && outlook.reason !== "not_connected" ? outlook : google;
  return { ok: false, reason: meaningful.reason, detail: meaningful.detail };
}

/** Lit les `days` prochains jours, tous fournisseurs confondus. */
export async function readAgenda(opts: {
  tenantId: string;
  userId: string;
  days?: number;
}): Promise<CalReadResult> {
  const days = opts.days ?? 7;
  const res = await readEvents({ ...opts, days });
  if (!res.ok) return { ok: false, reason: res.reason, detail: res.detail };

  const blocks = groupByDay(res.events);
  return {
    ok: true,
    summary: blocks
      ? `Voici ton agenda des ${days} prochains jours :\n\n${blocks}`
      : `Rien de prévu dans les ${days} prochains jours. Ton agenda est libre.`,
  };
}

/**
 * Variante « planning d'équipe » : même lecture, mais texte NEUTRE (pas « ton
 * agenda ») destiné à être transmis aux employés. `{ ok:false }` si non lisible
 * (pas connecté / droit manquant / erreur / agenda vide).
 */
export async function readTeamAgenda(opts: {
  tenantId: string;
  userId: string;
  days?: number;
}): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
  const res = await readEvents({ ...opts, days: opts.days ?? 7 });
  if (!res.ok) return { ok: false, reason: res.reason };

  const text = groupByDay(res.events);
  if (!text) return { ok: false, reason: "empty" };
  return { ok: true, text };
}

/** Crée un rendez-vous chez le fournisseur connecté. */
export async function createEvent(opts: {
  tenantId: string;
  userId: string;
  summary: string;
  startISO: string;
  endISO?: string;
  location?: string;
}): Promise<CalCreateResult> {
  const done = { ok: true as const, summary: opts.summary, whenLabel: whenLabel(opts.startISO) };

  const google = await createGoogleEvent(opts);
  if (google.ok) return done;

  const outlook = await createOutlookEvent(opts);
  if (outlook.ok) return done;

  // Aucun des deux n'a pu écrire. On remonte le motif de Google, sauf s'il est
  // « pas connecté » alors que Microsoft, lui, l'est : dans ce cas c'est l'échec
  // Microsoft qui décrit la vraie situation de l'utilisateur.
  const meaningful = google.reason === "not_connected" && outlook.reason !== "not_connected" ? outlook : google;
  return { ok: false, reason: meaningful.reason, detail: meaningful.detail };
}
