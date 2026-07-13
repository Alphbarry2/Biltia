// ─────────────────────────────────────────────────────────────────────────────
// FORMULES DÉCLARATIVES (Phase 9) — évaluateur DSL borné et SÛR.
//
// Remplace le « JS arbitraire dans l'app » (audit : calculs non partagés, non
// sécurisés) par une expression DÉCLARATIVE évaluable partout de la même façon.
// AUCUN eval, aucun code arbitraire : seulement un arbre d'opérations connues.
//
// Une expression est : { value } (littéral) | { field } (champ du record) |
// { relationSum } (agrégat pré-résolu fourni via ctx.sums) | { operation, args }.
// Opérations : add subtract multiply divide sum count average min max percentage
//              if coalesce date_diff.
//
// Les calculs OFFICIELS (marge, reste à payer, coût MO/matériaux, tréso, TVA,
// numérotation légale) restent SERVEUR (workspace-transforms, chantier_rentabilite) :
// ce moteur sert aux calculs d'AFFICHAGE et aux formules configurables, pas à la
// compta légale.
// ─────────────────────────────────────────────────────────────────────────────

export type FormulaExpr =
  | { value: number | string | boolean | null }
  | { field: string }
  | { relationSum: string }
  | { operation: string; args?: FormulaExpr[] };

export interface FormulaContext {
  /** Agrégats relationnels pré-résolus (ex : { "paiements.amount": 1200 }). */
  sums?: Record<string, number>;
  now?: Date;
  maxDepth?: number;
}

function toNum(v: unknown): number {
  const n = typeof v === "boolean" ? (v ? 1 : 0) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toDate(v: unknown, now: Date): Date | null {
  if (v == null) return null;
  if (typeof v === "string" && v[0] === "@") return now;
  const d = new Date(v as string | number);
  return isNaN(d.getTime()) ? null : d;
}

/** Évalue une expression contre un record. Déterministe, borné, jamais d'exception fatale. */
export function evalFormula(
  expr: FormulaExpr,
  record: Record<string, unknown>,
  ctx: FormulaContext = {},
  depth = 0
): number | string | boolean | null {
  const maxDepth = ctx.maxDepth ?? 20;
  if (depth > maxDepth || expr == null || typeof expr !== "object") return null;

  if ("value" in expr) return expr.value;
  if ("field" in expr) return (record ? record[expr.field] : null) as number | string | boolean | null;
  if ("relationSum" in expr) return (ctx.sums && ctx.sums[expr.relationSum]) || 0;

  if (!("operation" in expr)) return null;
  const args = Array.isArray(expr.args) ? expr.args : [];
  const ev = (e: FormulaExpr) => evalFormula(e, record, ctx, depth + 1);
  const nums = () => args.map((a) => toNum(ev(a)));
  const now = ctx.now ?? new Date();

  switch (expr.operation) {
    case "add": return nums().reduce((a, b) => a + b, 0);
    case "subtract": { const n = nums(); return n.length ? n.slice(1).reduce((a, b) => a - b, n[0]) : 0; }
    case "multiply": return nums().reduce((a, b) => a * b, 1);
    case "divide": { const n = nums(); return n.length >= 2 && n[1] !== 0 ? n[0] / n[1] : 0; }
    case "sum": return nums().reduce((a, b) => a + b, 0);
    case "count": return args.filter((a) => ev(a) != null && ev(a) !== "").length;
    case "average": { const n = nums(); return n.length ? n.reduce((a, b) => a + b, 0) / n.length : 0; }
    case "min": { const n = nums(); return n.length ? Math.min(...n) : 0; }
    case "max": { const n = nums(); return n.length ? Math.max(...n) : 0; }
    case "percentage": { const n = nums(); return n.length >= 2 && n[1] !== 0 ? Math.round((n[0] / n[1]) * 100) : 0; }
    case "coalesce": { for (const a of args) { const v = ev(a); if (v != null && v !== "") return v; } return null; }
    case "if": { const c = ev(args[0]); return c ? ev(args[1]) : ev(args[2] ?? { value: null }); }
    case "date_diff": {
      const a = toDate(ev(args[0]), now), b = toDate(ev(args[1]), now);
      if (!a || !b) return 0;
      return Math.round((a.getTime() - b.getTime()) / 86400000); // jours
    }
    default: return null;
  }
}

/** Valide la FORME d'une expression (opérations connues, profondeur). Pur. */
export function validateFormula(expr: unknown, depth = 0): { ok: boolean; error?: string } {
  if (depth > 20) return { ok: false, error: "profondeur excessive" };
  if (!expr || typeof expr !== "object") return { ok: false, error: "expression invalide" };
  const e = expr as Record<string, unknown>;
  if ("value" in e || "field" in e || "relationSum" in e) return { ok: true };
  if (typeof e.operation !== "string") return { ok: false, error: "opération manquante" };
  const OPS = new Set(["add","subtract","multiply","divide","sum","count","average","min","max","percentage","if","coalesce","date_diff"]);
  if (!OPS.has(e.operation)) return { ok: false, error: `opération inconnue : ${e.operation}` };
  const args = Array.isArray(e.args) ? e.args : [];
  for (const a of args) {
    const r = validateFormula(a, depth + 1);
    if (!r.ok) return r;
  }
  return { ok: true };
}
