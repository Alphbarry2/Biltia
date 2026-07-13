"use client";

// ─────────────────────────────────────────────────────────────────────────────
// i18n — contexte CLIENT + bascule instantanée.
//
// `LocaleProvider` est monté une seule fois dans le layout racine (avec la locale
// initiale lue côté serveur dans le cookie → pas de flash au chargement). Tout
// composant client lit la langue via `useT()` :
//
//     const t = useT();
//     <button>{t("Se connecter", "Sign in")}</button>
//
// Changer de langue (`setLocale`) fait trois choses :
//   1. met à jour l'état → TOUS les composants clients basculent instantanément ;
//   2. écrit le cookie `biltia_locale` → le choix est mémorisé au rechargement ;
//   3. `router.refresh()` → les composants SERVEUR (pages produits, blog, légal…)
//      se re-rendent avec la nouvelle locale, sans rechargement de page.
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  pick,
  type Locale,
} from "./config";

type I18nValue = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  /** Renvoie la chaîne dans la langue courante. `t(fr, en)`. */
  t: (fr: string, en: string) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

export function LocaleProvider({
  initial,
  children,
}: {
  initial: Locale;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initial);
  const router = useRouter();

  const setLocale = useCallback(
    (next: Locale) => {
      setLocaleState(next);
      try {
        document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
        document.documentElement.lang = next;
      } catch {
        /* cookies indisponibles (SSR/privé) : la bascule d'état suffit */
      }
      // Re-rend les composants serveur (pages produits/blog/légal) avec la
      // nouvelle langue, sans recharger la page ni perdre l'état client.
      router.refresh();
    },
    [router],
  );

  const t = useCallback(
    (fr: string, en: string) => pick(locale, fr, en),
    [locale],
  );

  const value = useMemo<I18nValue>(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Accès complet au contexte. Repli sûr (français) si aucun provider — utile
 *  pour les rares composants clients rendus hors de l'arbre (tests, aperçus). */
export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (ctx) return ctx;
  return {
    locale: DEFAULT_LOCALE,
    setLocale: () => {},
    t: (fr: string) => fr,
  };
}

/** Le hook le plus utilisé : `const t = useT(); t("bonjour", "hello")`. */
export function useT(): I18nValue["t"] {
  return useI18n().t;
}

/** Langue courante seule (ex. formatage nombres/dates, `toLocaleString`). */
export function useLocale(): Locale {
  return useI18n().locale;
}
