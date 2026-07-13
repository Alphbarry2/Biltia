// ─────────────────────────────────────────────────────────────────────────────
// EN-TÊTES DE SÉCURITÉ — source unique, consommée par next.config.ts.
//
// ⚠️ VÉRIFIÉ EXPÉRIMENTALEMENT : un en-tête `headers()` de next.config ÉCRASE
// celui qu'un route handler pose sur sa Response. Un `Content-Security-Policy`
// écrit dans une route est donc SILENCIEUSEMENT PERDU si une règle du config
// couvre la même URL. C'est pour cela que tout est défini ici, et nulle part
// ailleurs. Ne pas dupliquer ces valeurs dans une route : elles n'y serviraient
// à rien et donneraient une fausse impression de protection.
//
// Ce fichier ne doit garder AUCUN import : il est évalué au chargement de la
// config Next, hors du bundle applicatif.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Anti-framing des pages de l'atelier (/generate, /apps/[id]).
 *
 * Ces pages hébergent un pont postMessage qui proxifie /api/* AVEC les cookies de
 * session. Sans anti-framing, n'importe quel site tiers pouvait les charger en
 * iframe et parler au pont : lecture du workspace, envoi d'e-mails, consommation
 * des crédits de la victime.
 *
 * 'self' et non 'none' : la landing encadre ses propres aperçus de modèles
 * (/t/[id], cf. components/site.tsx).
 */
export const FRAME_ANCESTORS = "frame-ancestors 'self'";

/**
 * CSP du HTML de TENANT servi en page de premier niveau (/partage/*, /app/*).
 *
 * Ce HTML est du JavaScript écrit par un modèle à partir du prompt d'un artisan.
 * Servi sur l'origine biltia.com, il s'exécutait AVEC les cookies du visiteur :
 * un artisan pouvait envoyer un lien piégé à un autre utilisateur connecté et
 * lire tout son workspace, écrire en son nom ou brûler ses crédits (le contrôle
 * anti-CSRF `sameOrigin()` de /api/* était alors satisfait).
 *
 * La directive `sandbox` SANS `allow-same-origin` place le document dans une
 * ORIGINE OPAQUE : aucun cookie envoyé, aucun accès same-origin à /api/*, pas de
 * document.cookie. Le portail client continue de fonctionner car
 * /api/share/data et /api/share/submit sont authentifiés par le JETON (jamais par
 * les cookies) et autorisent explicitement l'origine opaque via CORS.
 *
 * NE JAMAIS ajouter `allow-same-origin` ici : ce serait rouvrir la faille.
 */
export const TENANT_HTML_CSP = [
  FRAME_ANCESTORS,
  "sandbox allow-scripts allow-forms allow-popups allow-modals allow-downloads",
].join("; ");

/** Durcissements sans effet fonctionnel, appliqués partout. */
export const BASELINE_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];
