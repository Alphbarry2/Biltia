// ─────────────────────────────────────────────────────────────────────────────
// RÉSERVATION DE DÉMO — règles métier PURES (utilisables client ET serveur).
//
// Toute la logique de créneaux et de délais est ici, sans dépendance : le
// composant l'utilise pour l'AFFICHAGE, la route API la rejoue pour la
// VALIDATION (on ne fait jamais confiance au client).
//
// Règles (heure de Belgique) :
//   • Créneaux : 10 h → 20 h, chaque heure. Le VENDREDI, on retire 12 h/13 h/14 h.
//   • Tous les jours réservables (week-end inclus).
//   • Délai minimum 48 h + coupure à 18 h : après 18 h, on décale d'un jour de
//     plus (⇒ réservation au plus tôt à J+2, ou J+3 si on réserve après 18 h).
//   • Modification possible tant qu'on n'est pas à moins de 24 h du rendez-vous.
// ─────────────────────────────────────────────────────────────────────────────

import type { Locale } from "@/lib/i18n/config";

export const BOOKING_TZ = "Europe/Brussels";
export const TZ_LABEL = "heure de Belgique";
export const OPEN_HOUR = 10; // premier créneau
export const CLOSE_HOUR = 20; // dernier créneau (inclus)
export const FRIDAY_EXCLUDED = [12, 13, 14]; // vendredi : pas de midi
export const CUTOFF_HOUR = 18; // après cette heure, on décale d'un jour
export const LEAD_DAYS = 2; // délai minimum (jours pleins)
export const RESCHEDULE_MIN_HOURS = 24; // modif interdite en deçà

// ── Fuseau : lire l'heure murale belge d'un instant ───────────────────────────
type Wall = { year: number; month: number; day: number; hour: number; minute: number };

function belgiumWall(d: Date): Wall {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: BOOKING_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

// ── Dates-calendrier abstraites (indépendantes du fuseau, immunes au DST) ──────
// On représente un jour civil "YYYY-MM-DD" et on fait l'arithmétique en UTC pur.
export function isoOf(y: number, m: number, d: number): string {
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
}
export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** 0 = dimanche … 5 = vendredi … 6 = samedi. */
export function weekdayOf(iso: string): number {
  return new Date(iso + "T00:00:00Z").getUTCDay();
}
export function isValidIsoDate(iso: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(Date.parse(iso + "T00:00:00Z"));
}

// ── Aujourd'hui (heure belge) + première date réservable ──────────────────────
export function todayBelgiumIso(now: Date = new Date()): string {
  const w = belgiumWall(now);
  return isoOf(w.year, w.month, w.day);
}

/** Première date réservable selon la règle 48 h + coupure 18 h. */
export function earliestBookableIso(now: Date = new Date()): string {
  const w = belgiumWall(now);
  let ref = isoOf(w.year, w.month, w.day);
  if (w.hour >= CUTOFF_HOUR) ref = addDays(ref, 1); // après 18 h : un jour de plus
  return addDays(ref, LEAD_DAYS);
}

// ── Créneaux horaires d'une date ──────────────────────────────────────────────
export function slotsForDate(iso: string): string[] {
  const wd = weekdayOf(iso);
  const out: string[] = [];
  for (let h = OPEN_HOUR; h <= CLOSE_HOUR; h++) {
    if (wd === 5 && FRIDAY_EXCLUDED.includes(h)) continue; // vendredi sans midi
    out.push(`${String(h).padStart(2, "0")}:00`);
  }
  return out;
}

export function isDateBookable(iso: string, now: Date = new Date()): boolean {
  if (!isValidIsoDate(iso)) return false;
  return iso >= earliestBookableIso(now); // comparaison lexicale = chronologique
}

export function isSlotBookable(iso: string, time: string, now: Date = new Date()): boolean {
  return isDateBookable(iso, now) && slotsForDate(iso).includes(time);
}

// ── Modification (reschedule) : interdite à moins de 24 h ──────────────────────
function belgiumPseudoInstant(iso: string, hour: number): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d, hour, 0, 0);
}
export function hoursUntil(iso: string, time: string, now: Date = new Date()): number {
  const w = belgiumWall(now);
  const nowInstant = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, 0);
  const apptInstant = belgiumPseudoInstant(iso, Number(time.slice(0, 2)));
  return (apptInstant - nowInstant) / 3_600_000;
}
export function canReschedule(iso: string, time: string, now: Date = new Date()): boolean {
  return hoursUntil(iso, time, now) >= RESCHEDULE_MIN_HOURS;
}

// ── Formatage lisible (français) ──────────────────────────────────────────────
const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MONTHS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];
const WEEKDAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
export function formatDateFr(iso: string): string {
  if (!isValidIsoDate(iso)) return iso;
  const d = new Date(iso + "T00:00:00Z");
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
export function formatSlotFr(iso: string, time: string): string {
  return `${formatDateFr(iso)} à ${time} (${TZ_LABEL})`;
}

// ── Formatage locale-aware (interface FR/EN) ──────────────────────────────────
export const tzLabel = (locale: Locale) => (locale === "en" ? "Belgium time" : TZ_LABEL);
export function formatDate(iso: string, locale: Locale): string {
  if (locale !== "en") return formatDateFr(iso);
  if (!isValidIsoDate(iso)) return iso;
  const d = new Date(iso + "T00:00:00Z");
  return `${WEEKDAYS_EN[d.getUTCDay()]}, ${MONTHS_EN[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
export function formatSlot(iso: string, time: string, locale: Locale): string {
  if (locale !== "en") return formatSlotFr(iso, time);
  return `${formatDate(iso, locale)} at ${time} (${tzLabel(locale)})`;
}

// ── Options du formulaire (partagées : modale, validation, emails) ────────────
export type Option = { value: string; label: string };

export const HEADCOUNT_OPTIONS: Option[] = [
  { value: "solo", label: "Indépendant (juste moi)" },
  { value: "2-5", label: "2 à 5 personnes" },
  { value: "6-10", label: "6 à 10 personnes" },
  { value: "11-50", label: "11 à 50 personnes" },
  { value: "51-200", label: "51 à 200 personnes" },
  { value: "200+", label: "Plus de 200 personnes" },
];
const HEADCOUNT_OPTIONS_EN: Option[] = [
  { value: "solo", label: "Self-employed (just me)" },
  { value: "2-5", label: "2 to 5 people" },
  { value: "6-10", label: "6 to 10 people" },
  { value: "11-50", label: "11 to 50 people" },
  { value: "51-200", label: "51 to 200 people" },
  { value: "200+", label: "More than 200 people" },
];

export const LOOKING_FOR_OPTIONS: Option[] = [
  { value: "devis-factures", label: "Digitaliser mes devis & factures" },
  { value: "agents", label: "Automatiser des tâches (agents IA)" },
  { value: "chantiers", label: "Piloter chantiers & interventions" },
  { value: "remplacer-outils", label: "Remplacer plusieurs logiciels" },
  { value: "equipe", label: "Équiper toute mon équipe" },
  { value: "decouvrir", label: "Découvrir Biltia / autre" },
];
const LOOKING_FOR_OPTIONS_EN: Option[] = [
  { value: "devis-factures", label: "Digitize my quotes & invoices" },
  { value: "agents", label: "Automate tasks (AI agents)" },
  { value: "chantiers", label: "Manage job sites & jobs" },
  { value: "remplacer-outils", label: "Replace several tools" },
  { value: "equipe", label: "Equip my whole team" },
  { value: "decouvrir", label: "Discover Biltia / other" },
];

/** Options d'effectif traduites si l'interface est en anglais. */
export const headcountOptions = (locale: Locale) => (locale === "en" ? HEADCOUNT_OPTIONS_EN : HEADCOUNT_OPTIONS);
/** Options « ce que je cherche » traduites si l'interface est en anglais. */
export const lookingForOptions = (locale: Locale) => (locale === "en" ? LOOKING_FOR_OPTIONS_EN : LOOKING_FOR_OPTIONS);

export function labelOf(options: Option[], value: string | null | undefined): string {
  if (!value) return "—";
  return options.find((o) => o.value === value)?.label ?? value;
}

export const HEADCOUNT_VALUES = HEADCOUNT_OPTIONS.map((o) => o.value);
export const LOOKING_FOR_VALUES = LOOKING_FOR_OPTIONS.map((o) => o.value);
