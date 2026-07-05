import type { NextConfig } from "next";
import path from "node:path";

// Biltia n'utilise pas le temps réel Supabase : on remplace `@supabase/realtime-js`
// par un stub no-op (lib/stubs/realtime-js.ts). Cela retire ~35 Ko de code mort
// des bundles ET supprime l'avertissement Turbopack « TP1001 new Worker(...) is
// not statically analyse-able » émis à chaque compilation. Voir le stub pour les
// détails et la marche à suivre si le temps réel devient nécessaire.
const REALTIME_STUB = path.resolve(process.cwd(), "lib/stubs/realtime-js.ts");

const nextConfig: NextConfig = {
  // Le repo vit sur le Bureau (synchronisé iCloud) : iCloud corrompt le cache
  // de build en déplaçant les fichiers en cours d'écriture. Les dossiers
  // « *.nosync » ne sont jamais synchronisés par iCloud.
  // MAIS sur Vercel (Linux, pas d'iCloud) le builder Next.js attend la sortie
  // dans « .next » : un distDir custom fait échouer le déploiement
  // (« output directory ".next" not found »). On garde donc .next.nosync en
  // local uniquement, et le .next standard sur Vercel (VERCEL=1 au build).
  distDir: process.env.VERCEL ? ".next" : ".next.nosync",
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
