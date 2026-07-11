// ─────────────────────────────────────────────────────────────────────────────
// PLANNING SLOTS — moteur de créneaux : détection de CONFLITS (chevauchements) et
// recherche de CRÉNEAUX LIBRES / proposition de disponibilités.
//
// Brique PURE et réutilisable par deux appelants :
//   • le veilleur `conflit_planning` (lib/agent-watchers.ts) — un agent alerte le
//     patron quand deux interventions d'un même intervenant se chevauchent ;
//   • le copilote (app/api/generate) — « trouve-moi un créneau libre jeudi ».
//
// Les CONFLITS se calculent en temps ABSOLU (epoch ms) : aucun fuseau en jeu, la
// comparaison de chevauchement est exacte. Les CRÉNEAUX LIBRES, eux, dépendent
// des HEURES OUVRÉES (« 8h-18h du lundi au vendredi ») exprimées en heure locale
// Europe/Paris — on convertit donc l'heure murale en epoch avec un décalage
// calculé par jour (DST géré, à la ~1 h près sur le jour de bascule uniquement).
//
// STRICTEMENT CÔTÉ SERVEUR. Aucune fonction ne throw : une lecture qui échoue
// renvoie une liste vide plutôt que de casser un tick d'agent.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";

const TZ = "Europe/Paris";
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** Durée par défaut d'une intervention sans `duree_heures` renseignée (1 h). */
export const DEFAULT_DURATION_MIN = 60;

/** Heures ouvrées : minutes depuis minuit + jours travaillés (lundi=1 … dimanche=7). */
export type WorkingHours = { startMin: number; endMin: number; weekdays: number[] };
export const DEFAULT_WORKING_HOURS: WorkingHours = {
  startMin: 8 * 60,
  endMin: 18 * 60,
  weekdays: [1, 2, 3, 4, 5],
};

/** Un intervalle occupé (epoch ms). */
export type BusyInterval = { start: number; end: number; label?: string };

/** Une intervention planifiée, résolue en intervalle. */
export type PlannedIntervention = {
  id: string;
  employeeId: string | null;
  chantierId: string | null;
  clientId: string | null;
  type: string | null;
  start: number; // epoch ms
  end: number; // epoch ms
};

/** Deux intervalles se chevauchent-ils ? (bornes ouvertes : contigus = pas de conflit) */
export function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

// ── Chargement ────────────────────────────────────────────────────────────────

/**
 * Charge les interventions PLANIFIÉES (ou en cours) dont la date prévue tombe dans
 * la fenêtre [fromMs, toMs], et les résout en intervalles. La durée manque souvent :
 * on retient alors DEFAULT_DURATION_MIN. Tenant TOUJOURS filtré. Ne throw jamais.
 */
export async function loadPlannedInterventions(
  db: SupabaseClient,
  tenantId: string,
  fromMs: number,
  toMs: number
): Promise<PlannedIntervention[]> {
  const { data } = await db
    .from("interventions")
    .select("id, type, statut, date_prevue, duree_heures, employee_id, chantier_id, client_id")
    .eq("tenant_id", tenantId)
    .in("statut", ["planifie", "en_cours"])
    .not("date_prevue", "is", null)
    .gte("date_prevue", new Date(fromMs).toISOString())
    .lte("date_prevue", new Date(toMs).toISOString())
    .limit(500);
  const out: PlannedIntervention[] = [];
  for (const r of (data ?? []) as {
    id: string; type: string | null; date_prevue: string | null; duree_heures: number | null;
    employee_id: string | null; chantier_id: string | null; client_id: string | null;
  }[]) {
    const start = r.date_prevue ? Date.parse(r.date_prevue) : NaN;
    if (Number.isNaN(start)) continue;
    const dur = Number(r.duree_heures);
    const durMs = Number.isFinite(dur) && dur > 0 ? dur * HOUR : DEFAULT_DURATION_MIN * 60_000;
    out.push({
      id: String(r.id),
      employeeId: r.employee_id ?? null,
      chantierId: r.chantier_id ?? null,
      clientId: r.client_id ?? null,
      type: r.type ?? null,
      start,
      end: start + durMs,
    });
  }
  return out;
}

// ── Conflits ────────────────────────────────────────────────────────────────

export type PlanningConflict = { a: PlannedIntervention; b: PlannedIntervention };

/**
 * Détecte les chevauchements entre interventions AFFECTÉES AU MÊME intervenant :
 * une même personne ne peut pas être sur deux chantiers en même temps. Les
 * interventions sans intervenant ne créent pas de conflit de personne (rien à
 * comparer). O(n log n) par intervenant grâce au tri + coupure précoce.
 */
export function findConflicts(items: PlannedIntervention[]): PlanningConflict[] {
  const byEmp = new Map<string, PlannedIntervention[]>();
  for (const it of items) {
    if (!it.employeeId) continue;
    const arr = byEmp.get(it.employeeId) ?? [];
    arr.push(it);
    byEmp.set(it.employeeId, arr);
  }
  const out: PlanningConflict[] = [];
  for (const arr of byEmp.values()) {
    arr.sort((x, y) => x.start - y.start);
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        // Tri par début croissant : dès que j démarre après la fin de i, aucun
        // j suivant ne peut plus chevaucher i → on coupe.
        if (arr[j].start >= arr[i].end) break;
        if (overlaps(arr[i], arr[j])) out.push({ a: arr[i], b: arr[j] });
      }
    }
  }
  return out;
}

// ── Fuseau (heure murale ↔ epoch) ─────────────────────────────────────────────

/** Décalage Europe/Paris (minutes à ajouter à l'UTC) pour un instant donné. */
function tzOffsetMin(ms: number): number {
  const d = new Date(ms);
  const asUTC = new Date(d.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  const asTZ = new Date(d.toLocaleString("en-US", { timeZone: TZ })).getTime();
  return Math.round((asTZ - asUTC) / 60_000);
}

/** Composantes calendaires Europe/Paris + jour de semaine (lundi=1 … dimanche=7). */
function parisParts(ms: number): { y: number; m: number; d: number; weekday: number } {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = f.formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wd: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    y: Number(get("year")),
    m: Number(get("month")),
    d: Number(get("day")),
    weekday: wd[get("weekday")] ?? 1,
  };
}

/** Epoch de l'heure MURALE Paris (y-m-d à `minutes` depuis minuit). */
function wallToEpoch(y: number, m: number, d: number, minutes: number): number {
  const guess = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  const off = tzOffsetMin(guess);
  return guess - off * 60_000;
}

// ── Créneaux libres ────────────────────────────────────────────────────────

/**
 * Renvoie jusqu'à `max` créneaux LIBRES d'au moins `durationMin` minutes, dans la
 * fenêtre [fromMs, toMs], en respectant les heures ouvrées et en soustrayant les
 * intervalles occupés. On ne propose jamais un créneau dans le passé.
 */
export function findFreeSlots(opts: {
  busy: BusyInterval[];
  fromMs: number;
  toMs: number;
  durationMin: number;
  workingHours?: WorkingHours;
  max?: number;
}): { start: number; end: number }[] {
  const wh = opts.workingHours ?? DEFAULT_WORKING_HOURS;
  const durMs = Math.max(15, Math.floor(opts.durationMin) || DEFAULT_DURATION_MIN) * 60_000;
  const max = Math.max(1, opts.max ?? 3);
  const busy = [...opts.busy].sort((a, b) => a.start - b.start);
  const slots: { start: number; end: number }[] = [];

  let cursor = opts.fromMs;
  // Borne dure : on ne balaie jamais plus de ~60 jours pour rester borné.
  for (let guard = 0; guard < 62 && cursor < opts.toMs && slots.length < max; guard++) {
    const p = parisParts(cursor);
    if (wh.weekdays.includes(p.weekday)) {
      const winStart = Math.max(wallToEpoch(p.y, p.m, p.d, wh.startMin), opts.fromMs);
      const winEnd = Math.min(wallToEpoch(p.y, p.m, p.d, wh.endMin), opts.toMs);
      let ptr = winStart;
      for (const b of busy) {
        if (b.end <= ptr) continue;
        if (b.start >= winEnd) break;
        if (b.start - ptr >= durMs) {
          slots.push({ start: ptr, end: ptr + durMs });
          if (slots.length >= max) break;
        }
        if (b.end > ptr) ptr = b.end;
      }
      if (slots.length < max && winEnd - ptr >= durMs) {
        slots.push({ start: ptr, end: ptr + durMs });
      }
    }
    // Jour suivant : +1 j +1 h puis recalage sur minuit Paris (absorbe la bascule DST).
    const next = parisParts(cursor + DAY + HOUR);
    cursor = wallToEpoch(next.y, next.m, next.d, 0);
  }
  return slots.slice(0, max);
}

// ── Formatage ────────────────────────────────────────────────────────────────

/** « jeudi 9 juillet de 08:00 à 10:00 ». */
export function formatSlotFr(startMs: number, endMs: number): string {
  const day = new Intl.DateTimeFormat("fr-FR", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(startMs));
  const t = (ms: number) =>
    new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
  return `${day} de ${t(startMs)} à ${t(endMs)}`;
}

/** « 07/07 à 14:00 » — libellé court d'un instant. */
export function formatWhenFr(startMs: number): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(startMs));
}
