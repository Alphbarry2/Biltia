import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import path from "node:path";
import { BASELINE_HEADERS, FRAME_ANCESTORS, TENANT_HTML_CSP } from "./lib/security-headers";

// Biltia n'utilise pas le temps réel Supabase : on remplace `@supabase/realtime-js`
// par un stub no-op (lib/stubs/realtime-js.ts). Cela retire ~35 Ko de code mort
// des bundles ET supprime l'avertissement Turbopack « TP1001 new Worker(...) is
// not statically analyse-able » émis à chaque compilation. Voir le stub pour les
// détails et la marche à suivre si le temps réel devient nécessaire.
const REALTIME_STUB = path.resolve(process.cwd(), "lib/stubs/realtime-js.ts");

const nextConfig: NextConfig = {
  // Le repo vit désormais HORS iCloud (~/biltia) : plus besoin du contournement
  // « .next.nosync ». On utilise le distDir standard « .next » partout, identique
  // au build Vercel (VERCEL=1). Ne PAS remettre le projet sur le Bureau/iCloud.
  // ESLint reste actif en dev et en CI, mais ne bloque pas `next build` en prod :
  // les erreurs de style (no-unused-vars, no-unescaped-entities, no-explicit-any,
  // no-html-link-for-pages) n'ont aucun impact runtime et faisaient échouer le
  // déploiement Vercel. La vérification TypeScript, elle, reste bloquante.
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    optimizePackageImports: ["framer-motion", "lucide-react"],
  },
  // Le moteur PDF (devis/factures rendus côté serveur) embarque fontkit et des
  // binaires de polices : le laisser passer par le bundler casse la résolution de
  // ses assets. On le charge comme un module Node externe, à l'exécution.
  serverExternalPackages: ["@react-pdf/renderer"],
  // Dev : `next dev --turbopack`.
  turbopack: {
    resolveAlias: {
      "@supabase/realtime-js": "./lib/stubs/realtime-js.ts",
    },
  },
  // Prod : `next build` (webpack). Même alias pour garder dev et prod identiques.
  webpack(config) {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@supabase/realtime-js": REALTIME_STUB,
    };
    return config;
  },
  // En-têtes de sécurité. Les valeurs vivent dans lib/security-headers.ts (avec
  // le POURQUOI de chacune). Deux régimes :
  //
  //   1. Tout le site        → anti-framing (protège le pont postMessage).
  //   2. /partage/*, /app/*  → EN PLUS, origine opaque (`sandbox`) : ces URLs
  //                            servent du HTML écrit par un modèle, il ne doit
  //                            jamais s'exécuter avec les cookies du visiteur.
  //
  // ⚠️ L'ORDRE COMPTE : une règle plus tardive écrase la précédente, et une règle
  // du config écrase l'en-tête posé par un route handler (vérifié). Les règles
  // spécifiques doivent donc rester APRÈS la règle générale.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          ...BASELINE_HEADERS,
          { key: "Content-Security-Policy", value: FRAME_ANCESTORS },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
      {
        source: "/partage/:token*",
        headers: [...BASELINE_HEADERS, { key: "Content-Security-Policy", value: TENANT_HTML_CSP }],
      },
      {
        source: "/app/:slug*",
        headers: [...BASELINE_HEADERS, { key: "Content-Security-Policy", value: TENANT_HTML_CSP }],
      },
    ];
  },
};

// Sentry. Ce qui SORT du produit (prompts, corps HTTP, cookies, variables
// locales) est décidé dans lib/sentry-policy.ts, pas ici : ce bloc ne règle que
// le BUILD (téléversement des sources, tunnel réseau).
// Sentry.
//
// ⚠️ RELANCER LE WIZARD SENTRY RÉÉCRIT CE BLOC aux défauts (il l'annonce lui-même :
// « you probably want to clean this up a bit! »). Après tout `npx @sentry/wizard`,
// re-vérifier les trois points commentés ci-dessous. C'est déjà arrivé une fois.
//
// Ce qui SORT du produit (prompts, corps HTTP, cookies, variables locales) est
// décidé dans lib/sentry-policy.ts, pas ici : ce bloc ne règle que le BUILD
// (téléversement des sources, tunnel réseau).
export default withSentryConfig(nextConfig, {
  org: "biltia",
  project: "javascript-nextjs",

  // ── POIDS DU SDK ───────────────────────────────────────────────────────────
  // Sentry pesait 172 kB des 229 kB de JavaScript payés par CHAQUE page du site —
  // y compris une page légale statique de 400 octets. C'était, et de loin, le
  // premier poste de poids du produit.
  // Ces drapeaux retirent du bundle du code dont on ne se sert pas :
  //   • les messages de débogage du SDK (inutiles en prod) ;
  //   • trois greffons de Replay qu'on n'active jamais (Shadow DOM, iframes,
  //     worker de compression). Le Replay lui-même n'est plus bundlé du tout : il
  //     est chargé à la demande (voir instrumentation-client.ts).
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
    excludeReplayShadowDom: true,
    excludeReplayIframe: true,
    excludeReplayWorker: true,
  },

  // Silencieux en local, verbeux en CI : c'est en CI qu'on veut savoir pourquoi
  // un téléversement de sources a échoué.
  silent: !process.env.CI,

  // Sans les sources, une pile de production est illisible (code minifié). Le
  // téléversement exige SENTRY_AUTH_TOKEN : il est dans .env.sentry-build-plugin
  // en local (ignoré par git) et DOIT être présent côté Vercel, sinon le build
  // passe mais toutes les erreurs de prod arrivent illisibles.
  widenClientFileUpload: true,

  // Les bloqueurs de pub (uBlock, Brave) coupent les requêtes vers sentry.io :
  // sans tunnel, les erreurs NAVIGATEUR de nos utilisateurs ne remontent jamais.
  // On les fait transiter par notre propre domaine.
  //
  // ⚠️ /monitoring ne doit JAMAIS entrer dans le matcher de middleware.ts : le
  // middleware redirigerait la requête vers /login et le rapport serait perdu en
  // silence. Vérifié : le matcher actuel ne le couvre pas.
  tunnelRoute: "/monitoring",

  webpack: {
    // `automaticVercelMonitors` resterait lettre morte : le tick des agents ne
    // passe PAS par les crons Vercel mais par pg_cron + pg_net côté Supabase
    // (cf. migration 022). Rien à instrumenter.
    automaticVercelMonitors: false,

    treeshake: {
      removeDebugLogging: true,
    },
  },
});
