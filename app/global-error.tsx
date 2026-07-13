"use client";

// Dernier filet du produit : cet écran ne s'affiche que si le layout RACINE a
// lui-même planté. Deux conséquences qui dictent tout le fichier :
//
//  1. Aucune dépendance. Ni providers, ni hooks i18n, ni composants maison : ils
//     vivent au-dessus du point de rupture et pourraient être la cause du plantage.
//     La langue est donc relue à la main dans le cookie, et les styles sont EN
//     LIGNE (le CSS global peut ne pas avoir été chargé).
//  2. Aucun détail technique à l'écran. L'artisan n'a rien à faire d'une pile
//     d'appels ; elle part chez Sentry, lui reçoit une phrase et un bouton.

import * as Sentry from "@sentry/nextjs";
import { useEffect, useState } from "react";

const COPY = {
  fr: {
    title: "Quelque chose s'est mal passé",
    body: "L'incident vient de nous être signalé automatiquement. Vos données sont intactes : rien de ce que vous aviez enregistré n'est perdu.",
    retry: "Recharger la page",
    home: "Retour au tableau de bord",
  },
  en: {
    title: "Something went wrong",
    body: "The incident has just been reported to us automatically. Your data is safe: nothing you had saved is lost.",
    retry: "Reload the page",
    home: "Back to dashboard",
  },
} as const;

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Le rendu serveur ne connaît pas le cookie ici : on part du français (langue
  // par défaut du produit) et on corrige après montage. Évite un écart
  // d'hydratation, qui sur CETTE page provoquerait une seconde erreur.
  const [lang, setLang] = useState<"fr" | "en">("fr");

  useEffect(() => {
    Sentry.captureException(error);
    const locale = document.cookie.match(/(?:^|;\s*)biltia_locale=([^;]+)/)?.[1];
    if (locale?.startsWith("en")) setLang("en");
  }, [error]);

  const t = COPY[lang];

  return (
    <html lang={lang}>
      <body style={{ margin: 0 }}>
        <main
          style={{
            minHeight: "100dvh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 20,
            padding: 24,
            textAlign: "center",
            background: "#fafafa",
            color: "#0a0a0a",
            fontFamily:
              "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          }}
        >
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, letterSpacing: "-0.01em" }}>
            {t.title}
          </h1>
          <p
            style={{
              margin: 0,
              maxWidth: 460,
              fontSize: 15,
              lineHeight: 1.6,
              color: "#525252",
            }}
          >
            {t.body}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
            <button
              type="button"
              onClick={reset}
              style={{
                cursor: "pointer",
                borderRadius: 10,
                border: "none",
                background: "#0a0a0a",
                color: "#fff",
                padding: "10px 18px",
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              {t.retry}
            </button>
            <a
              href="/dashboard"
              style={{
                borderRadius: 10,
                border: "1px solid #e5e5e5",
                background: "#fff",
                color: "#0a0a0a",
                padding: "10px 18px",
                fontSize: 14,
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              {t.home}
            </a>
          </div>

          {/* Le digest est le SEUL élément technique affiché : c'est la clé qui
              permet au support de retrouver l'incident exact dans Sentry. */}
          {error.digest ? (
            <code style={{ fontSize: 11, color: "#a3a3a3" }}>{error.digest}</code>
          ) : null}
        </main>
      </body>
    </html>
  );
}
