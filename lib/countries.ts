// ─────────────────────────────────────────────────────────────────────────────
// PAYS — liste UNIQUE partagée (onboarding + paramètres). Avant, l'onboarding
// proposait 6 pays et les paramètres seulement FR/BE : un utilisateur qui
// choisissait « Luxembourg » à l'inscription le voyait retomber sur « France »
// dans ses paramètres. Cette source unique règle l'incohérence.
//
// FR/BE : TVA + numéro d'entreprise pleinement pris en charge (labels dédiés).
// Les autres pays sont stockés et affichés fidèlement (utile aussi côté admin
// pour la demande marché) ; les libellés TVA/immatriculation restent génériques.
// ─────────────────────────────────────────────────────────────────────────────

export type Country = {
  value: string;
  label: string;
  /** Emoji drapeau (rendu tel quel dans le Dropdown maison). */
  icon: string;
  /** Indice court affiché dans le sélecteur (TVA…), optionnel. */
  hint?: string;
};

export const COUNTRIES: Country[] = [
  { value: "FR", label: "France", icon: "🇫🇷", hint: "TVA 20/10/5,5" },
  { value: "BE", label: "Belgique", icon: "🇧🇪", hint: "TVA 21/6" },
  { value: "LU", label: "Luxembourg", icon: "🇱🇺" },
  { value: "CH", label: "Suisse", icon: "🇨🇭" },
  { value: "CA", label: "Canada", icon: "🇨🇦" },
  { value: "MA", label: "Maroc", icon: "🇲🇦" },
  { value: "AUTRE", label: "Autre pays", icon: "🌍" },
];

const BY_VALUE = new Map(COUNTRIES.map((c) => [c.value, c]));

/** Normalise une valeur pays stockée : garde la valeur si connue, sinon FR. */
export function normalizeCountry(value: unknown): string {
  return typeof value === "string" && BY_VALUE.has(value) ? value : "FR";
}

export function countryLabel(value: string): string {
  return BY_VALUE.get(value)?.label ?? value;
}
