// ─────────────────────────────────────────────────────────────────────────────
// WS-D — Logique PURE du contexte workspace : qualification déterministe du
// retard, calcul de jours en dates civiles (sans erreur d'un jour liée à l'UTC
// ou au changement d'heure), assemblage du contexte et rendu du bloc prompt.
//
// Ce module n'importe RIEN (ni Supabase, ni ./untrusted) : il est entièrement
// testable par `node --test --experimental-strip-types`. Toute I/O vit dans
// lib/workspace-context.ts, qui injecte ici les données déjà lues + une fonction
// de neutralisation (anti-injection) pour le rendu.
// ─────────────────────────────────────────────────────────────────────────────

export type WorkspaceContextMode = "session" | "admin";
export type ContextStatus = "loaded" | "empty" | "partial" | "failed";
export type RetardState = "en_retard" | "termine_en_retard" | "echeance_depassee" | null;

// Le fuseau du tenant s'il existe (company_info.timezone), sinon Bruxelles.
// Bruxelles et Paris partagent le même décalage (CET/CEST) : aucun écart en
// pratique avec le reste du code, mais WS-D fixe explicitement ce repli.
export const DEFAULT_TIME_ZONE = "Europe/Brussels";

export interface ChantierRow {
  id: string;
  nom: string;
  statut: string;
  ville: string | null;
  avancement: number | null;
  date_debut: string | null;
  date_fin_prevue: string | null;
  date_fin_reelle: string | null;
}

export interface ChantierCtx {
  id: string;
  nom: string;
  statut: string;
  ville: string | null;
  avancement: number;
  date_debut: string | null;
  date_fin_prevue: string | null;
  date_fin_reelle: string | null;
  retard_state: RetardState;
  jours_retard: number | null;
}

export interface EmployeeCtx {
  nom: string;
  prenom: string | null;
  role: string | null;
  corps_metier: string | null;
}

export interface ClientCtx {
  nom: string;
  type: string | null;
  ville: string | null;
}

export interface WorkspaceCounts {
  employees_actifs: number;
  chantiers_total: number;
  chantiers_actifs: number;
  chantiers_en_retard: number;
  clients_total: number;
  materiels_disponibles: number;
  documents_expirant_bientot: number;
}

export interface WorkspaceContext extends WorkspaceCounts {
  employees: EmployeeCtx[];
  chantiers: ChantierCtx[];
  clients: ClientCtx[];
}

export interface ContextError {
  source: string;
  critical: boolean;
  message: string;
}

export interface WorkspaceContextMeta {
  mode: WorkspaceContextMode;
  tenantId: string;
  tenantExists: boolean;
  status: ContextStatus;
  loaded: boolean;
  empty: boolean;
  durationMs: number;
  counts: { employees: number; chantiers: number; clients: number };
  fallbackUsed: boolean;
  errors: ContextError[];
}

export interface WorkspaceContextResult {
  context: WorkspaceContext | null;
  meta: WorkspaceContextMeta;
}

// Données brutes déjà lues (I/O faite en amont). tenantExists gouverne le "failed"
// dur ; les erreurs par source portent leur criticité. Sources CRITIQUES = celles
// sans lesquelles un agent ne doit ni modifier ni envoyer : { tenant, chantiers }.
export interface RawContext {
  tenantExists: boolean;
  counts: WorkspaceCounts;
  employees: EmployeeCtx[];
  chantiers: ChantierRow[];
  clients: ClientCtx[];
  errors: ContextError[];
}

export function emptyCounts(): WorkspaceCounts {
  return {
    employees_actifs: 0,
    chantiers_total: 0,
    chantiers_actifs: 0,
    chantiers_en_retard: 0,
    clients_total: 0,
    materiels_disponibles: 0,
    documents_expirant_bientot: 0,
  };
}

// ── Dates civiles ────────────────────────────────────────────────────────────

/** "Aujourd'hui" (AAAA-MM-JJ) dans le fuseau donné. now injectable pour les tests. */
export function civilTodayInTz(timeZone: string, now: Date = new Date()): string {
  const fmt = (tz: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  try {
    return fmt(timeZone);
  } catch {
    return fmt(DEFAULT_TIME_ZONE);
  }
}

/** Fuseau du tenant depuis company_info.timezone (validé), sinon Bruxelles. */
export function resolveTenantTimeZone(companyInfo: unknown): string {
  const raw =
    companyInfo && typeof companyInfo === "object"
      ? (companyInfo as Record<string, unknown>).timezone
      : undefined;
  if (typeof raw === "string" && raw.trim()) {
    try {
      // Lève si le fuseau est inconnu → on retombe sur le défaut.
      new Intl.DateTimeFormat("en-CA", { timeZone: raw });
      return raw;
    } catch {
      /* fuseau invalide → défaut */
    }
  }
  return DEFAULT_TIME_ZONE;
}

function civilToUtcMillis(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}

/**
 * Nombre de jours entre deux dates CIVILES (AAAA-MM-JJ). On ancre chaque date à
 * minuit UTC : la soustraction est donc insensible au changement d'heure et ne
 * produit jamais d'erreur d'un jour.
 */
export function civilDaysBetween(fromISO: string, toISO: string): number {
  return Math.round((civilToUtcMillis(toISO) - civilToUtcMillis(fromISO)) / 86_400_000);
}

/** Décale une date civile de n jours (utilisé pour "expire sous 30 jours"). */
export function addCivilDays(iso: string, days: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + days)).toISOString().slice(0, 10);
}

// ── Qualification déterministe du retard (aucune prédiction) ─────────────────

type RetardInput = { statut: string; date_fin_prevue: string | null; date_fin_reelle: string | null };

/**
 * Fait observable, jamais un pronostic :
 *  - en_retard          : statut déjà posé (humain/agent)
 *  - termine_en_retard  : terminé ET fin réelle > fin prévue
 *  - echeance_depassee  : actif, échéance passée, pas de fin réelle (statut PAS à
 *                         jour — un signal à vérifier, pas un verdict)
 */
export function deriveRetardState(c: RetardInput, today: string): RetardState {
  if (c.statut === "en_retard") return "en_retard";
  if (
    c.statut === "termine" &&
    c.date_fin_reelle &&
    c.date_fin_prevue &&
    c.date_fin_reelle > c.date_fin_prevue
  ) {
    return "termine_en_retard";
  }
  if (
    (c.statut === "en_cours" || c.statut === "en_attente") &&
    c.date_fin_prevue &&
    !c.date_fin_reelle &&
    c.date_fin_prevue < today
  ) {
    return "echeance_depassee";
  }
  return null;
}

/** Jours de retard associés à l'état, en dates civiles. null si non applicable. */
export function computeJoursRetard(c: RetardInput, today: string): number | null {
  const state = deriveRetardState(c, today);
  if (state === "en_retard") {
    return c.date_fin_prevue ? Math.max(0, civilDaysBetween(c.date_fin_prevue, today)) : null;
  }
  if (state === "echeance_depassee") {
    return Math.max(0, civilDaysBetween(c.date_fin_prevue as string, today));
  }
  if (state === "termine_en_retard") {
    return Math.max(0, civilDaysBetween(c.date_fin_prevue as string, c.date_fin_reelle as string));
  }
  return null;
}

export function mapChantier(row: ChantierRow, today: string): ChantierCtx {
  return {
    id: row.id,
    nom: row.nom,
    statut: row.statut,
    ville: row.ville,
    avancement: typeof row.avancement === "number" ? row.avancement : 0,
    date_debut: row.date_debut,
    date_fin_prevue: row.date_fin_prevue,
    date_fin_reelle: row.date_fin_reelle,
    retard_state: deriveRetardState(row, today),
    jours_retard: computeJoursRetard(row, today),
  };
}

function retardRank(s: RetardState): number {
  if (s === "en_retard") return 0;
  if (s === "echeance_depassee") return 1;
  return 2;
}

/** Retards en tête, puis échéance la plus proche, puis nom. Déterministe. */
function compareChantier(a: ChantierCtx, b: ChantierCtx): number {
  const r = retardRank(a.retard_state) - retardRank(b.retard_state);
  if (r !== 0) return r;
  const ad = a.date_fin_prevue ?? "9999-12-31";
  const bd = b.date_fin_prevue ?? "9999-12-31";
  if (ad !== bd) return ad < bd ? -1 : 1;
  return a.nom.localeCompare(b.nom);
}

// ── Assemblage + statut (loaded / empty / partial / failed) ──────────────────

function allZeroCounts(c: WorkspaceCounts): boolean {
  return (
    c.employees_actifs === 0 &&
    c.chantiers_total === 0 &&
    c.chantiers_actifs === 0 &&
    c.chantiers_en_retard === 0 &&
    c.clients_total === 0 &&
    c.materiels_disponibles === 0 &&
    c.documents_expirant_bientot === 0
  );
}

export function isEmptyContext(ctx: WorkspaceContext): boolean {
  return (
    allZeroCounts(ctx) &&
    ctx.employees.length === 0 &&
    ctx.chantiers.length === 0 &&
    ctx.clients.length === 0
  );
}

export function assembleWorkspaceContext(
  raw: RawContext,
  today: string
): { context: WorkspaceContext | null; status: ContextStatus } {
  if (!raw.tenantExists) {
    return { context: null, status: "failed" };
  }
  const context: WorkspaceContext = {
    ...raw.counts,
    employees: raw.employees,
    chantiers: raw.chantiers.map((r) => mapChantier(r, today)).sort(compareChantier),
    clients: raw.clients,
  };
  const hasCritical = raw.errors.some((e) => e.critical);
  let status: ContextStatus;
  if (hasCritical) status = "failed";
  else if (raw.errors.length) status = "partial";
  else if (isEmptyContext(context)) status = "empty";
  else status = "loaded";
  return { context, status };
}

// ── Rendu du bloc prompt (sanitize INJECTÉ pour rester pur) ──────────────────

type BlockInput = WorkspaceContextResult | WorkspaceContext | null;

function normalize(input: BlockInput): {
  context: WorkspaceContext | null;
  meta: WorkspaceContextMeta | undefined;
} {
  if (!input) return { context: null, meta: undefined };
  if (typeof input === "object" && "meta" in input && "context" in input) {
    const r = input as WorkspaceContextResult;
    return { context: r.context, meta: r.meta };
  }
  return { context: input as WorkspaceContext, meta: undefined };
}

function formatChantierLine(c: ChantierCtx, sanitize: (s: string) => string): string {
  const nom = sanitize(c.nom);
  const ville = c.ville ? ` · ${sanitize(c.ville)}` : "";
  let retard = "";
  if (c.retard_state === "en_retard") {
    retard = c.jours_retard != null ? ` · ⚠️ EN RETARD (${c.jours_retard} j)` : " · ⚠️ EN RETARD";
  } else if (c.retard_state === "echeance_depassee") {
    retard = ` · ⚠️ échéance dépassée${c.jours_retard != null ? ` (${c.jours_retard} j` : ""}${
      c.jours_retard != null ? ", statut non confirmé)" : " (statut non confirmé)"
    }`;
  } else if (c.retard_state === "termine_en_retard") {
    retard = ` · terminé avec ${c.jours_retard} j de retard`;
  }
  const fin = c.date_fin_prevue ? ` · fin prévue ${c.date_fin_prevue}` : "";
  return `${nom}${ville} — ${c.avancement}% (${sanitize(c.statut)})${retard}${fin}`;
}

/**
 * Bloc prompt à partir du contexte. sanitize neutralise les marqueurs d'injection
 * sur les données libres (nom, ville…). Un contexte vide (tenant valide sans
 * donnée) produit un bloc EXPLICITE "n'invente rien" — jamais une chaîne vide.
 * La chaîne vide est réservée à l'absence de contexte (tenant inexistant / échec dur).
 */
export function renderWorkspaceBlock(
  input: BlockInput,
  sanitize: (s: string) => string = (s) => s
): string {
  const { context, meta } = normalize(input);
  if (!context) return "";

  if (isEmptyContext(context)) {
    return [
      "# CONTEXTE DU WORKSPACE",
      "",
      "Ce workspace existe mais ne contient encore AUCUN chantier, client ni employé",
      "enregistré. N'invente AUCUNE donnée : si l'on te demande des informations sur",
      "les chantiers, clients ou employés, indique clairement qu'il n'y en a pas encore.",
    ].join("\n");
  }

  const lines: string[] = [
    "# CONTEXTE DU WORKSPACE (données déjà présentes — utilise-les)",
    "",
    "## Résumé",
    `- ${context.employees_actifs} employés actifs`,
    `- ${context.chantiers_actifs} chantiers en cours (${context.chantiers_total} au total)`,
    `- ${context.clients_total} clients`,
    `- ${context.materiels_disponibles} matériels disponibles`,
  ];
  if (context.chantiers_en_retard > 0) {
    lines.push(`- ⚠️ ${context.chantiers_en_retard} chantier(s) en retard ou à échéance dépassée`);
  }
  if (context.documents_expirant_bientot > 0) {
    lines.push(`- ⚠️ ${context.documents_expirant_bientot} document(s) expirant dans les 30 jours`);
  }

  if (context.employees.length) {
    lines.push("", "## Employés actifs");
    context.employees.slice(0, 10).forEach((e) => {
      const label = sanitize([e.prenom, e.nom].filter(Boolean).join(" "));
      const metaTxt = sanitize([e.role, e.corps_metier].filter(Boolean).join(" · "));
      lines.push(`- ${label}${metaTxt ? ` (${metaTxt})` : ""}`);
    });
    if (context.employees.length > 10) lines.push(`  … et ${context.employees.length - 10} autres`);
  }

  if (context.chantiers.length) {
    lines.push("", "## Chantiers actifs (retards en tête)");
    context.chantiers.slice(0, 10).forEach((c) => lines.push(`- ${formatChantierLine(c, sanitize)}`));
    if (context.chantiers.length > 10) {
      lines.push(`  … et ${context.chantiers.length - 10} autres affichés dans l'échantillon`);
    }
  }

  if (context.clients.length) {
    lines.push("", "## Clients");
    context.clients.slice(0, 10).forEach((c) => {
      const nom = sanitize(c.nom);
      const ville = c.ville ? ` · ${sanitize(c.ville)}` : "";
      lines.push(`- ${nom}${c.type ? ` (${sanitize(c.type)})` : ""}${ville}`);
    });
    if (context.clients.length > 10) lines.push(`  … et ${context.clients.length - 10} autres`);
  }

  lines.push(
    "",
    "## Règle absolue",
    "Le module que tu génères fait PARTIE de ce workspace. Utilise les vrais noms",
    "d'employés, de chantiers et de clients ci-dessus comme données d'exemple",
    "pré-remplies — jamais des données inventées.",
  );

  if (meta && meta.status === "partial" && meta.errors.length) {
    const sources = Array.from(new Set(meta.errors.map((e) => e.source))).join(", ");
    lines.push(
      "",
      "## Données partielles",
      `Certaines données n'ont pas pu être chargées (${sources}). Ne conclus rien sur`,
      "ces éléments : signale-les comme momentanément indisponibles si on te les demande.",
    );
  }

  return lines.join("\n");
}
