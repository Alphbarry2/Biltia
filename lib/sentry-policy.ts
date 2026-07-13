// ─────────────────────────────────────────────────────────────────────────────
// POLITIQUE DE COLLECTE SENTRY — source unique, consommée par les trois `init`
// (client, serveur, edge). Ne pas dupliquer ces valeurs dans un fichier de
// config : elles divergeraient, et une divergence ici est une fuite de données.
//
// ⚠️ LE CONTEXTE QUI JUSTIFIE CHAQUE LIGNE : Biltia manipule les données métier
// d'un artisan ET les données personnelles de SES clients (noms, adresses de
// chantier, montants). Nous sommes sous-traitant RGPD pour ces données. Sentry
// est un tiers. Tout ce qui part d'ici sort du périmètre que nous avons promis
// à l'artisan. La règle est donc : on envoie de quoi DÉBOGUER (type d'erreur,
// pile, route, version), jamais de quoi RECONSTITUER le contenu.
//
// Les défauts du SDK v10 sont l'inverse exact de cette règle : tout est activé.
// Chaque `false` ci-dessous désactive un défaut, il n'est donc jamais redondant.
// ─────────────────────────────────────────────────────────────────────────────

// Le type `DataCollection` n'est PAS exporté publiquement par le SDK : on le
// dérive de la signature de `init`. Import de TYPE uniquement — ce fichier est
// chargé dans les trois runtimes (client, serveur, edge) et ne doit embarquer
// aucun code Sentry.
import type { init } from "@sentry/nextjs";

type DataCollection = NonNullable<NonNullable<Parameters<typeof init>[0]>["dataCollection"]>;

/** Vrai en production (Vercel), faux en local. Pilote l'échantillonnage. */
const IS_PROD = process.env.NODE_ENV === "production";

/**
 * Taux d'échantillonnage des traces.
 *
 * Le wizard écrit `1` (100 % du trafic tracé). Le plan gratuit plafonne à
 * quelques millions de spans par mois : à 100 %, le quota saute en quelques
 * jours et Sentry cesse d'ingérer — y compris les erreurs qui, elles, comptent.
 * 10 % en prod suffit à voir les tendances de latence ; 100 % en local pour
 * déboguer confortablement (le trafic local est nul, ça ne coûte rien).
 *
 * Les ERREURS ne sont pas concernées par ce taux : elles remontent toujours.
 */
export const TRACES_SAMPLE_RATE = IS_PROD ? 0.1 : 1;

/**
 * Ce que le SDK a le droit de collecter. Toutes ces clés valent `true` par
 * défaut dans @sentry/nextjs v10 — ce bloc est donc du durcissement pur.
 */
export const SENTRY_DATA_COLLECTION: DataCollection = {
  // ── LE POINT LE PLUS IMPORTANT ─────────────────────────────────────────────
  // Sentry v10 instrumente AUTOMATIQUEMENT @anthropic-ai/sdk (présent dans nos
  // dépendances). Avec les défauts (`inputs: true, outputs: true`), chaque appel
  // au modèle part chez Sentry AVEC son prompt complet et sa réponse complète.
  // Or nos prompts embarquent le workspace de l'artisan (clients, chantiers,
  // devis, contexte RAG) : ce serait une exfiltration continue du cœur métier.
  // Nous gardons la trace de l'APPEL (durée, modèle, coût, erreur), jamais son
  // CONTENU. Ne jamais repasser ceci à `true`.
  genAI: { inputs: false, outputs: false },

  // Corps HTTP entrants et sortants. Un POST /api/generate contient la demande
  // de l'artisan ; un POST /api/data contient une fiche client. Aucun corps ne
  // doit sortir. `[]` = collecte désactivée (et non « défauts »).
  httpBodies: [],

  // Cookies. Sentry filtre les clés qu'il juge sensibles, mais sa liste ignore
  // nos noms (`sb-*` Supabase, `batify_active_tenant`). Un cookie de session
  // capturé dans un rapport d'erreur, c'est un vol de session en différé.
  cookies: false,

  // Variables locales des frames de pile. Côté serveur, les locales d'une route
  // contiennent la clé service Supabase, les jetons OAuth déchiffrés et le
  // contenu des documents. Une seule erreur au mauvais endroit suffit.
  stackFrameVariables: false,

  // Paramètres d'URL : nos jetons de partage (/partage, portail client) sont des
  // porteurs d'authentification. On n'en collecte aucun.
  queryParams: false,

  // En-têtes : on garde ceux de la réponse (utiles au débogage, non sensibles)
  // et on refuse ceux de la requête (Authorization, Cookie, en-têtes internes).
  httpHeaders: { request: false, response: true },

  // `userInfo` vaut déjà `false` par défaut, mais on l'écrit pour que ce fichier
  // se lise comme la politique COMPLÈTE et non comme une liste d'exceptions.
  // L'identification d'un utilisateur dans un rapport se fait explicitement, via
  // Sentry.setUser({ id }) avec l'ID tenant seul — jamais e-mail ni IP.
  userInfo: false,
};
