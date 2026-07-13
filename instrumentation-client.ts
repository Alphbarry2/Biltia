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

  integrations: [
    // Un Replay FILME l'écran de l'artisan : les noms de ses clients, les adresses
    // de ses chantiers, les montants de ses devis. Le masquage est actif par défaut
    // dans le SDK, mais on l'écrit explicitement : c'est la seule barrière entre un
    // enregistrement de débogage et une collecte de données personnelles, et elle ne
    // doit pas pouvoir disparaître au détour d'une mise à jour de défauts.
    Sentry.replayIntegration({
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
    }),
  ],

  // ZÉRO enregistrement des sessions normales (le wizard en propose 10 %). Filmer
  // un artisan qui travaille sans qu'aucune erreur ne survienne n'apporte rien au
  // débogage et nous rendrait collecteurs d'un flux vidéo de son activité.
  replaysSessionSampleRate: 0,

  // En revanche, quand ça CASSE, on veut voir les secondes qui ont précédé : là,
  // l'enregistrement (masqué) sert directement à réparer.
  replaysOnErrorSampleRate: 1.0,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
