// Sentry — navigateur. Chargé sur chaque page de l'interface.
//
// La politique de collecte commune vit dans lib/sentry-policy.ts. Ce fichier n'y
// ajoute que ce qui n'existe QUE côté client : la relecture de session (Replay).

import * as Sentry from "@sentry/nextjs";

import { SENTRY_DATA_COLLECTION, TRACES_SAMPLE_RATE } from "./lib/sentry-policy";

Sentry.init({
  dsn: "https://0275ceba6dbd36d150dcfee89cacf62e@o4511730186518528.ingest.de.sentry.io/4511730197135440",

  tracesSampleRate: TRACES_SAMPLE_RATE,
  dataCollection: SENTRY_DATA_COLLECTION,
  enableLogs: false,

  // ⚠️ AUCUNE intégration Replay ICI. Voir plus bas : elle est chargée À LA DEMANDE.

  // ZÉRO enregistrement des sessions normales (le wizard en propose 10 %). Filmer
  // un artisan qui travaille sans qu'aucune erreur ne survienne n'apporte rien au
  // débogage et nous rendrait collecteurs d'un flux vidéo de son activité.
  replaysSessionSampleRate: 0,

  // En revanche, quand ça CASSE, on veut voir les secondes qui ont précédé : là,
  // l'enregistrement (masqué) sert directement à réparer.
  replaysOnErrorSampleRate: 1.0,
});

// ── LE REPLAY EST CHARGÉ À LA DEMANDE, PAS DANS LE BUNDLE ────────────────────
//
// `Sentry.replayIntegration()` écrit en dur dans `integrations` embarquait rrweb —
// **38 kB de JavaScript, dans le socle payé par TOUTES les pages du site**, y
// compris les pages légales statiques. Téléchargé et analysé par 100 % des
// visiteurs… pour enregistrer 0 % des sessions (replaysSessionSampleRate: 0).
//
// `lazyLoadIntegration` va le chercher sur le CDN de Sentry seulement quand on en a
// besoin. On l'installe une fois la page devenue INACTIVE (requestIdleCallback) :
// le chemin critique est libéré, et le tampon d'enregistrement est en place bien
// avant qu'un artisan n'ait le temps de déclencher quoi que ce soit.
//
// Ce qu'on perd : une erreur survenant dans les toutes premières millisecondes,
// avant l'inactivité, n'aura pas son film. L'ERREUR elle-même remonte quand même —
// seul le replay manque. C'est un échange que je prends volontiers contre 38 kB sur
// chaque page.
function loadReplay() {
  void Sentry.lazyLoadIntegration("replayIntegration")
    .then((replayIntegration) => {
      Sentry.addIntegration(
        replayIntegration({
          // Un Replay FILME l'écran de l'artisan : les noms de ses clients, les
          // adresses de ses chantiers, les montants de ses devis. Le masquage est
          // actif par défaut dans le SDK, mais on l'écrit explicitement : c'est la
          // seule barrière entre un enregistrement de débogage et une collecte de
          // données personnelles, et elle ne doit pas pouvoir disparaître au détour
          // d'une mise à jour de défauts.
          maskAllText: true,
          maskAllInputs: true,
          blockAllMedia: true,
        })
      );
    })
    .catch(() => {
      /* CDN injoignable (bloqueur, réseau) : on s'en passe, sans casser la page. */
    });
}

if (typeof window !== "undefined") {
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void })
    .requestIdleCallback;
  // Safari n'a requestIdleCallback que depuis peu → repli sur un simple délai.
  if (idle) idle(loadReplay, { timeout: 4000 });
  else setTimeout(loadReplay, 2000);
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
