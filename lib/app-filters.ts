// ─────────────────────────────────────────────────────────────────────────────
// FILTRES SERVEUR (Phase 9) — groupes de conditions traduits en filtres Postgres.
//
// Corrige la limite de l'audit (« filtres côté client, plafond 500 lignes »).
// Un AppFilterGroup { type:'all'|'any'|'not', conditions } est VALIDÉ (colonnes
// whitelistées, opérateurs connus) puis appliqué au query builder via ses
// méthodes PARAMÉTRÉES (.eq/.gt/.ilike/.in/.is…) — jamais de chaîne SQL/`.or()`
// arbitraire → aucune injection. Les valeurs de date relatives (@today, @today-7d)
// sont résolues côté serveur.
//
// Contraintes de sûreté :
//   • `all`  → chaînage AND (tous opérateurs) ;
//   • `any`  → uniquement multi-égalité sur UNE colonne → `.in(col, [vals])` ;
//   • `not`  → négation d'UNE condition.
// Un `any` hétérogène est refusé proprement (pas de `.or()` brut).
// ─────────────────────────────────────────────────────────────────────────────

export type FilterOp =
  | "eq" | "neq" | "gt" | "gte" | "lt" | "lte"
  | "contains" | "before" | "after"
  | "is_empty" | "is_not_empty" | "in" | "mine";

export interface AppFilterCondition {
  field: string;
  op: FilterOp;
  value?: unknown;
}
export interface AppFilterGroup {
  type: "all" | "any" | "not";
  conditions: AppFilterCondition[];
}

const OPS = new Set<string>(["eq","neq","gt","gte","lt","lte","contains","before","after","is_empty","is_not_empty","in","mine"]);

export interface FilterContext {
  allowedColumns: Set<string>;
  employeeId?: string | null;
  now?: Date;
}

/** Résout une valeur de date relative : @today, @today-7d, @today+30d, @now. */
export function resolveRelativeDate(value: unknown, now: Date): unknown {
  if (typeof value !== "string" || value[0] !== "@") return value;
  const base = new Date(now.getTime());
  const m = value.match(/^@(today|now)(?:([+-]\d+)([dwmy]))?$/);
  if (!m) return value;
  let d = new Date(base);
  if (m[2]) {
    const n = parseInt(m[2], 10);
    const unit = m[3];
    if (unit === "d") d.setDate(d.getDate() + n);
    else if (unit === "w") d.setDate(d.getDate() + n * 7);
    else if (unit === "m") d.setMonth(d.getMonth() + n);
    else if (unit === "y") d.setFullYear(d.getFullYear() + n);
  }
  // @today → date seule (YYYY-MM-DD) ; @now → horodatage ISO.
  return m[1] === "today" ? d.toISOString().slice(0, 10) : d.toISOString();
}

/** Échappe une valeur pour un `ilike` (les % et _ sont des jokers). */
function escLike(v: unknown): string {
  return String(v).replace(/[\\%_]/g, (c) => "\\" + c);
}

export interface FilterValidation {
  ok: boolean;
  errors: string[];
}

/** Valide un groupe (colonnes whitelistées, opérateurs connus, formes). Pur. */
export function validateFilterGroup(group: unknown, allowed: Set<string>): FilterValidation {
  const errors: string[] = [];
  if (!group || typeof group !== "object") return { ok: false, errors: ["filtre absent"] };
  const g = group as AppFilterGroup;
  if (!["all", "any", "not"].includes(g.type)) errors.push("type de groupe invalide");
  if (!Array.isArray(g.conditions) || !g.conditions.length) errors.push("aucune condition");
  else {
    for (const c of g.conditions) {
      if (!c || typeof c.field !== "string" || !allowed.has(c.field)) errors.push(`colonne non autorisée : ${c?.field}`);
      if (!OPS.has(c?.op)) errors.push(`opérateur inconnu : ${c?.op}`);
      if ((c?.op === "in") && !Array.isArray(c.value)) errors.push(`'in' attend un tableau (${c.field})`);
    }
  }
  if (g.type === "not" && Array.isArray(g.conditions) && g.conditions.length !== 1) errors.push("'not' porte sur UNE seule condition");
  return { ok: errors.length === 0, errors };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Query = any;

/** Applique UNE condition (chemin AND). Retourne la query modifiée. */
function applyCondition(q: Query, c: AppFilterCondition, ctx: FilterContext): Query {
  const now = ctx.now ?? new Date();
  const col = c.field;
  switch (c.op) {
    case "eq": return q.eq(col, c.value);
    case "neq": return q.neq(col, c.value);
    case "gt": return q.gt(col, c.value);
    case "gte": return q.gte(col, c.value);
    case "lt": return q.lt(col, c.value);
    case "lte": return q.lte(col, c.value);
    case "contains": return q.ilike(col, `%${escLike(c.value)}%`);
    case "before": return q.lt(col, resolveRelativeDate(c.value, now));
    case "after": return q.gt(col, resolveRelativeDate(c.value, now));
    case "is_empty": return q.is(col, null);
    case "is_not_empty": return q.not(col, "is", null);
    case "in": return q.in(col, Array.isArray(c.value) ? c.value : []);
    case "mine": return q.eq(col, ctx.employeeId ?? "00000000-0000-0000-0000-000000000000");
    default: return q;
  }
}

/**
 * Applique un groupe de filtres à une query. VALIDE d'abord ; en cas d'erreur,
 * lève (l'appelant renvoie 400). Aucune chaîne brute : tout est paramétré.
 */
export function applyFilterGroup(q: Query, group: AppFilterGroup, ctx: FilterContext): Query {
  const v = validateFilterGroup(group, ctx.allowedColumns);
  if (!v.ok) throw new Error("Filtre invalide : " + v.errors.join(" ; "));

  if (group.type === "all") {
    for (const c of group.conditions) q = applyCondition(q, c, ctx);
    return q;
  }
  if (group.type === "not") {
    const c = group.conditions[0];
    const val = c.op === "before" || c.op === "after" ? resolveRelativeDate(c.value, ctx.now ?? new Date()) : c.value;
    // Négation via .not(col, op, val) pour les opérateurs simples.
    const pgOp: Record<string, string> = { eq: "eq", neq: "neq", gt: "gt", gte: "gte", lt: "lt", lte: "lte", before: "lt", after: "gt" };
    if (pgOp[c.op]) return q.not(c.field, pgOp[c.op], val);
    if (c.op === "is_empty") return q.not(c.field, "is", null);
    if (c.op === "is_not_empty") return q.is(c.field, null);
    throw new Error("'not' ne supporte pas cet opérateur : " + c.op);
  }
  // any : uniquement multi-égalité sur UNE même colonne → .in (sûr, pas de .or brut).
  const cols = new Set(group.conditions.map((c) => c.field));
  const allEq = group.conditions.every((c) => c.op === "eq");
  if (cols.size === 1 && allEq) {
    const field = group.conditions[0].field;
    return q.in(field, group.conditions.map((c) => c.value));
  }
  throw new Error("Filtre 'any' complexe non supporté (utilise plusieurs égalités sur une même colonne).");
}

/** Recherche plein-texte serveur sur des colonnes whitelistées (ilike, q assaini). */
export function applySearch(q: Query, search: string, fields: string[], allowed: Set<string>): Query {
  const cleanFields = fields.filter((f) => allowed.has(f));
  const term = String(search || "").trim().replace(/[,()%\\*]/g, "").slice(0, 80);
  if (!term || !cleanFields.length) return q;
  // .or() STRICTEMENT contrôlé : uniquement `col.ilike.*term*` sur colonnes connues,
  // term expurgé de tout caractère spécial PostgREST.
  const orExpr = cleanFields.map((f) => `${f}.ilike.*${term}*`).join(",");
  return q.or(orExpr);
}
