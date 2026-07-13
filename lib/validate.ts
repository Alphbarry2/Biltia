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

import { getLocale } from "./i18n/server";
import { pick, type Locale } from "./i18n/config";

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

function checkString(field: string, value: unknown, spec: StringSpec, errors: string[], l: Locale): string | undefined {
  if (typeof value !== "string") {
    errors.push(pick(l, `${field} doit être une chaîne.`, `${field} must be a string.`));
    return undefined;
  }
  let v = spec.trim === false ? value : value.trim();
  v = stripControlChars(v);
  if (spec.min != null && v.length < spec.min)
    errors.push(pick(l, `${field} : ${spec.min} caractères minimum.`, `${field}: ${spec.min} characters minimum.`));
  if (spec.max != null && v.length > spec.max)
    errors.push(pick(l, `${field} : ${spec.max} caractères maximum.`, `${field}: ${spec.max} characters maximum.`));
  if (spec.enum && !spec.enum.includes(v))
    errors.push(pick(l, `${field} : valeur non autorisée.`, `${field}: value not allowed.`));
  return v;
}

function checkNumber(field: string, value: unknown, spec: NumberSpec, errors: string[], l: Locale): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    errors.push(pick(l, `${field} doit être un nombre.`, `${field} must be a number.`));
    return undefined;
  }
  if (spec.int && !Number.isInteger(n))
    errors.push(pick(l, `${field} doit être un entier.`, `${field} must be an integer.`));
  if (spec.min != null && n < spec.min) errors.push(pick(l, `${field} : minimum ${spec.min}.`, `${field}: minimum ${spec.min}.`));
  if (spec.max != null && n > spec.max) errors.push(pick(l, `${field} : maximum ${spec.max}.`, `${field}: maximum ${spec.max}.`));
  return n;
}

/**
 * Valide un objet contre un schéma. Les champs absents et non `required` sont
 * simplement omis du résultat (pas d'erreur).
 * `locale` : langue des messages d'erreur (ils remontent en toast). FR par défaut.
 */
export function validate(input: unknown, schema: Schema, locale: Locale = "fr"): ValidationOk | ValidationErr {
  const errors: string[] = [];
  const data: Record<string, unknown> = {};

  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return {
      ok: false,
      errors: [pick(locale, "Corps de requête invalide (objet JSON attendu).", "Invalid request body (a JSON object was expected).")],
    };
  }
  const obj = input as Record<string, unknown>;

  for (const [field, spec] of Object.entries(schema)) {
    const raw = obj[field];
    const present = raw !== undefined && raw !== null;

    if (!present) {
      if (spec.required) errors.push(pick(locale, `${field} est requis.`, `${field} is required.`));
      continue;
    }

    switch (spec.type) {
      case "string": {
        const v = checkString(field, raw, spec, errors, locale);
        if (v !== undefined) data[field] = v;
        break;
      }
      case "number": {
        const v = checkNumber(field, raw, spec, errors, locale);
        if (v !== undefined) data[field] = v;
        break;
      }
      case "boolean": {
        if (typeof raw !== "boolean") errors.push(pick(locale, `${field} doit être un booléen.`, `${field} must be a boolean.`));
        else data[field] = raw;
        break;
      }
      case "array": {
        if (!Array.isArray(raw)) errors.push(pick(locale, `${field} doit être une liste.`, `${field} must be a list.`));
        else {
          if (spec.maxItems != null && raw.length > spec.maxItems)
            errors.push(pick(locale, `${field} : ${spec.maxItems} éléments maximum.`, `${field}: ${spec.maxItems} items maximum.`));
          data[field] = raw;
        }
        break;
      }
      case "object": {
        if (typeof raw !== "object" || Array.isArray(raw)) errors.push(pick(locale, `${field} doit être un objet.`, `${field} must be an object.`));
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
  const locale = await getLocale();
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json(
      { error: pick(locale, "Corps de requête invalide.", "Invalid request body.") },
      { status: 400 }
    );
  }
  const result = validate(raw, schema, locale);
  if (!result.ok) {
    return Response.json({ error: result.errors.join(" ") }, { status: 400 });
  }
  return result.data;
}
