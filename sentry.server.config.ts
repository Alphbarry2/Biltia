// Sentry — runtime Node (route handlers, rendu serveur).
//
// ⚠️ RELANCER LE WIZARD SENTRY ÉCRASE CE FICHIER sans prévenir et le remet aux
// défauts (tracesSampleRate: 1, enableLogs: true, dataCollection vide = TOUT
// collecté). Après tout `npx @sentry/wizard`, vérifier que les deux imports
// ci-dessous sont toujours là. C'est déjà arrivé une fois.
//
// La politique de collecte vit dans lib/sentry-policy.ts, avec le POURQUOI de
// chaque restriction. Ne rien durcir ici : ce serait invisible pour les deux
// autres runtimes (client, edge) et la divergence passerait inaperçue.

import * as Sentry from "@sentry/nextjs";

import { SENTRY_DATA_COLLECTION, TRACES_SAMPLE_RATE } from "./lib/sentry-policy";

Sentry.init({
  dsn: "https://0275ceba6dbd36d150dcfee89cacf62e@o4511730186518528.ingest.de.sentry.io/4511730197135440",

  tracesSampleRate: TRACES_SAMPLE_RATE,
  dataCollection: SENTRY_DATA_COLLECTION,

  // Nos journaux serveur contiennent des extraits de prompts, des ID tenant et
  // des réponses de fournisseurs. Les expédier à Sentry rouvrirait par la bande
  // la fuite que lib/sentry-policy.ts vient de fermer, et viderait le quota de
  // journalisation en quelques jours.
  enableLogs: false,
});
