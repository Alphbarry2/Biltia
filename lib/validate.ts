// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION DES INPUTS — sans dépendance (pas de zod dans le bundle).
//
// Point 2 de l'audit sécurité : ne JAMAIS faire confiance à la forme du JSON
// reçu. Ce helper borne, type et normalise chaque champ AVANT tout traitement.
//
// Rappel du modèle de menace réel de Biltia :
//   • SQL : requêtes paramétrées via Supabase + RLS ⇒ pas d'injection SQL.
//   • XSS : le rendu passe par React (échappement auto) ⇒ pas d'injection HTML.
//   • Ce helper couvre le reste : rejet des types inattendus, bornage de taille
//     (anti-payload géant), retrait des octets de contrôle, valeurs hors enum.
// ─────────────────────────────────────────────────────────────────────────────

type StringSpec = {
  type: "string";
  required?: boolean;
  min?: number;
  max?: number;
  enum?: readonly string[];
  trim?: boolean; // défaut true
};
type NumberSpec = { type: "number"; required?: boolean; min?: number; max?: number; int?: boolean };
type BooleanSpec = { type: "boolean"; required?: boolean };
type ArraySpec = { type: "array"; required?: boolean; maxItems?: number };
type ObjectSpec = { type: "object"; required?: boolean };

export type FieldSpec = StringSpec | NumberSpec | BooleanSpec | ArraySpec | ObjectSpec;
export type Schema = Record<string, FieldSpec>;

export type ValidationOk = { ok: true; data: Record<string, unknown> };
export type ValidationErr = { ok: false; errors: string[] };

/** Retire les octets de contrôle (hors \t, \n, \r) qui n'ont rien à faire dans un input texte. */
function stripControlChars(s: string): string {
  return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

function checkString(field: string, value: unknown, spec: StringSpec, errors: string[]): string | undefined {
  if (typeof value !== "string") {
    errors.push(`${field} doit être une chaîne.`);
    return undefined;
  }
  let v = spec.trim === false ? value : value.trim();
  v = stripControlChars(v);
  if (spec.min != null && v.length < spec.min) errors.push(`${field} : ${spec.min} caractères minimum.`);
  if (spec.max != null && v.length > spec.max) errors.push(`${field} : ${spec.max} caractères maximum.`);
  if (spec.enum && !spec.enum.includes(v)) errors.push(`${field} : valeur non autorisée.`);
  return v;
}

function checkNumber(field: string, value: unknown, spec: NumberSpec, errors: string[]): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    errors.push(`${field} doit être un nombre.`);
    return undefined;
  }
  if (spec.int && !Number.isInteger(n)) errors.push(`${field} doit être un entier.`);
  if (spec.min != null && n < spec.min) errors.push(`${field} : minimum ${spec.min}.`);
  if (spec.max != null && n > spec.max) errors.push(`${field} : maximum ${spec.max}.`);
  return n;
}

/**
 * Valide un objet contre un schéma. Les champs absents et non `required` sont
 * simplement omis du résultat (pas d'erreur).
 */
export function validate(input: unknown, schema: Schema): ValidationOk | ValidationErr {
  const errors: string[] = [];
  const data: Record<string, unknown> = {};

  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, errors: ["Corps de requête invalide (objet JSON attendu)."] };
  }
  const obj = input as Record<string, unknown>;

  for (const [field, spec] of Object.entries(schema)) {
    const raw = obj[field];
    const present = raw !== undefined && raw !== null;

    if (!present) {
      if (spec.required) errors.push(`${field} est requis.`);
      continue;
    }

    switch (spec.type) {
      case "string": {
        const v = checkString(field, raw, spec, errors);
        if (v !== undefined) data[field] = v;
        break;
      }
      case "number": {
        const v = checkNumber(field, raw, spec, errors);
        if (v !== undefined) data[field] = v;
        break;
      }
      case "boolean": {
        if (typeof raw !== "boolean") errors.push(`${field} doit être un booléen.`);
        else data[field] = raw;
        break;
      }
      case "array": {
        if (!Array.isArray(raw)) errors.push(`${field} doit être une liste.`);
        else {
          if (spec.maxItems != null && raw.length > spec.maxItems)
            errors.push(`${field} : ${spec.maxItems} éléments maximum.`);
          data[field] = raw;
        }
        break;
      }
      case "object": {
        if (typeof raw !== "object" || Array.isArray(raw)) errors.push(`${field} doit être un objet.`);
        else data[field] = raw;
        break;
      }
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true, data };
}

/**
 * Lit le JSON de la requête et le valide en une passe.
 * Retourne soit les données validées, soit une Response 400 prête à retourner :
 *
 *   const parsed = await parseBody(req, { question: { type: "string", required: true, max: 2000 } });
 *   if (parsed instanceof Response) return parsed;
 *   const { question } = parsed as { question: string };
 */
export async function parseBody(
  req: Request,
  schema: Schema
): Promise<Record<string, unknown> | Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "Corps de requête invalide." }, { status: 400 });
  }
  const result = validate(raw, schema);
  if (!result.ok) {
    return Response.json({ error: result.errors.join(" ") }, { status: 400 });
  }
  return result.data;
}
