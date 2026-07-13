// ─────────────────────────────────────────────────────────────────────────────
// i18n — directive de LANGUE pour les prompts LLM (côté serveur).
//
// Tous nos system prompts sont rédigés en français (avec exemples FR, consigne
// « vouvoiement »…). Quand l'utilisateur a basculé l'interface en anglais
// (cookie `biltia_locale=en`), le modèle doit répondre en ANGLAIS : questions du
// questionnaire, réponses du copilote, textes DANS les apps/documents générés.
//
// Plutôt que de dupliquer chaque prompt en EN, on AJOUTE une consigne finale
// forte qui écrase la langue de sortie. Le corps du prompt (règles métier,
// structure, exemples) reste inchangé — seule la langue de RÉDACTION change.
//
//     import { getLocale } from "@/lib/i18n/server";
//     import { withLocale } from "@/lib/i18n/llm";
//     const locale = await getLocale();
//     system: withLocale(buildSystem(), locale)
//
// FR = langue par défaut → la directive est vide (aucun impact, aucun risque de
// régression sur l'immense majorité des utilisateurs francophones).
// ─────────────────────────────────────────────────────────────────────────────

import type { Locale } from "./config";

const EN_DIRECTIVE = `

════════════════════════════════════════════════════════════════
OUTPUT LANGUAGE — CRITICAL, OVERRIDES EVERYTHING ABOVE
The user's interface language is ENGLISH. Write EVERY piece of user-facing text you produce in natural, professional US English: chat replies, questions, option labels and hints, headings, button labels, empty states, toasts, and ALL visible text inside any app, document, email or report you generate.
Any French wording, French examples, or instructions such as « en français » / « vouvoiement » in the prompt above are STYLE guidance only — they do NOT set the output language. The output language is English.
Do NOT translate the user's own data, proper nouns, company names, or product names — reproduce them verbatim. Address the user as a professional, friendly "you".
Currency, number and date formatting: keep them clear and locale-appropriate for an English reader; do not invent conversions.
════════════════════════════════════════════════════════════════`;

/** Directive de langue à concaténer à un system prompt. Vide en FR. */
export function localeInstruction(locale: Locale): string {
  return locale === "en" ? EN_DIRECTIVE : "";
}

/**
 * Ajoute la directive de langue à un system prompt (string).
 * FR → renvoie le prompt inchangé.
 */
export function withLocale(system: string, locale: Locale): string {
  return locale === "en" ? system + EN_DIRECTIVE : system;
}

/**
 * Variante pour les system prompts structurés en blocs (Anthropic
 * `TextBlockParam[]`). Ajoute la directive comme dernier bloc (sans cache
 * control : c'est du texte court et variable). FR → renvoie les blocs inchangés.
 */
export function withLocaleBlocks<T extends { type: "text"; text: string }>(
  blocks: T[],
  locale: Locale,
): (T | { type: "text"; text: string })[] {
  if (locale !== "en") return blocks;
  return [...blocks, { type: "text", text: EN_DIRECTIVE }];
}
