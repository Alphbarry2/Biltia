// ─────────────────────────────────────────────────────────────────────────────
// i18n — socle partagé (aucune dépendance React, utilisable client ET serveur).
//
// Modèle retenu : bascule INSTANTANÉE par cookie, sans changement d'URL.
//   • Le français reste la langue par défaut (source de vérité du produit).
//   • Le choix est mémorisé dans le cookie `biltia_locale` (1 an).
//   • Les chaînes sont traduites EN LIGNE via `t(fr, en)` (voir context.tsx) ou
//     `pick(locale, fr, en)` côté serveur — une seule édition par texte, la VF
//     reste lisible à l'endroit où elle sert.
//
// Évolution SEO (URLs /en indexables) : possible plus tard SANS refonte — il
// suffira de faire poser ce même cookie par le middleware selon un préfixe /en
// et de rendre les <Link> sensibles à la locale. Rien ici ne l'empêche.
// ─────────────────────────────────────────────────────────────────────────────

export type Locale = "fr" | "en";

export const LOCALES: readonly Locale[] = ["fr", "en"] as const;
export const DEFAULT_LOCALE: Locale = "fr";

/** Nom du cookie qui mémorise la langue choisie. Lu côté serveur (layout racine,
 *  pages serveur) et écrit côté client (composant de bascule). */
export const LOCALE_COOKIE = "biltia_locale";

/** Ramène n'importe quelle valeur douteuse à une locale valide (défaut = fr). */
export function normalizeLocale(value: string | undefined | null): Locale {
  return value === "en" ? "en" : DEFAULT_LOCALE;
}

/** Choisit la bonne chaîne selon la locale. Base de toute la traduction en ligne. */
export function pick(locale: Locale, fr: string, en: string): string {
  return locale === "en" ? en : fr;
}

/** Métadonnées d'affichage du sélecteur de langue. */
export const LOCALE_META: Record<Locale, { label: string; short: string; flag: string }> = {
  fr: { label: "Français", short: "FR", flag: "🇫🇷" },
  en: { label: "English", short: "EN", flag: "🇬🇧" },
};
