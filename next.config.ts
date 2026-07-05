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
  distDir: ".next.nosync",
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
