// Sentry — runtime Edge (middleware, routes edge).
//
// ⚠️ RELANCER LE WIZARD SENTRY ÉCRASE CE FICHIER sans prévenir et le remet aux
// défauts. Après tout `npx @sentry/wizard`, vérifier que les deux imports
// ci-dessous sont toujours là. C'est déjà arrivé une fois.
//
// Ce runtime exécute middleware.ts, qui lit le cookie de session à chaque
// requête : c'est précisément l'endroit où une collecte trop large capturerait
// des jetons. La politique commune (lib/sentry-policy.ts) coupe déjà cookies et
// en-têtes de requête ; ne pas l'assouplir ici.

import * as Sentry from "@sentry/nextjs";

import { SENTRY_DATA_COLLECTION, TRACES_SAMPLE_RATE } from "./lib/sentry-policy";

Sentry.init({
  dsn: "https://0275ceba6dbd36d150dcfee89cacf62e@o4511730186518528.ingest.de.sentry.io/4511730197135440",

  tracesSampleRate: TRACES_SAMPLE_RATE,
  dataCollection: SENTRY_DATA_COLLECTION,
  enableLogs: false,
});
