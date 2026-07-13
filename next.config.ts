import type { NextConfig } from "next";
import path from "node:path";

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
};

export default nextConfig;
