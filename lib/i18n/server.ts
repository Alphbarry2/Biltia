// ─────────────────────────────────────────────────────────────────────────────
// i18n — helper SERVEUR. Lit la langue choisie dans le cookie pour les
// composants serveur (pages produits, blog, légal…) et le layout racine.
//
//     import { getLocale } from "@/lib/i18n/server";
//     import { pick } from "@/lib/i18n/config";
//     const locale = await getLocale();
//     <h1>{pick(locale, "Bonjour", "Hello")}</h1>
//
// Next 15 : `cookies()` est asynchrone → on `await`.
// ─────────────────────────────────────────────────────────────────────────────

import { cookies } from "next/headers";
import { LOCALE_COOKIE, normalizeLocale, type Locale } from "./config";

export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  return normalizeLocale(store.get(LOCALE_COOKIE)?.value);
}
