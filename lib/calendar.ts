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
import { preferredProviderOrder } from "./send-preference-server";
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
  // Ordre selon le compte par défaut (premier connecté, ou choix explicite). On
  // essaie le préféré d'abord ; s'il n'a PAS d'événement, on interroge quand même
  // l'autre — sinon on annoncerait « semaine libre » à un artisan qui ne se sert
  // que de l'autre agenda. Repli sur Google d'abord si la base ne tranche pas.
  const order = await preferredProviderOrder(opts.tenantId, opts.userId, "calendar");
  const microsoftFirst = order[0] === "microsoft";

  const first = microsoftFirst ? await readOutlookAgenda(opts) : await readGoogleEvents(opts);
  if (first.ok && first.events.length > 0) return first;

  const second = microsoftFirst ? await readGoogleEvents(opts) : await readOutlookAgenda(opts);
  if (second.ok && second.events.length > 0) return second;

  // Aucun des deux n'a d'événement. Si l'un a RÉPONDU, la semaine est vraiment
  // libre : liste vide, pas une erreur.
  if (first.ok || second.ok) return { ok: true, events: [] };

  // Aucun n'a répondu : on remonte le motif du préféré, sauf s'il dit seulement
  // « pas connecté » alors que l'autre a vraiment échoué.
  const meaningful =
    first.reason === "not_connected" && second.reason !== "not_connected" ? second : first;
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

  // Écrit le RDV chez le fournisseur par défaut d'abord (premier connecté, ou choix
  // explicite) ; l'autre en repli. Repli sur Google d'abord si la base ne tranche pas.
  const order = await preferredProviderOrder(opts.tenantId, opts.userId, "calendar");
  const microsoftFirst = order[0] === "microsoft";

  const first = microsoftFirst ? await createOutlookEvent(opts) : await createGoogleEvent(opts);
  if (first.ok) return done;

  const second = microsoftFirst ? await createGoogleEvent(opts) : await createOutlookEvent(opts);
  if (second.ok) return done;

  // Aucun des deux n'a pu écrire : motif du préféré, sauf s'il n'est « pas connecté »
  // alors que l'autre l'est — c'est alors l'échec de l'autre qui décrit la situation.
  const meaningful = first.reason === "not_connected" && second.reason !== "not_connected" ? second : first;
  return { ok: false, reason: meaningful.reason, detail: meaningful.detail };
}
