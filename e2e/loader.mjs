// ESM resolve hook : permet à `node --experimental-strip-types` de charger le VRAI
// code applicatif (orchestration) hors du bundler Next — en résolvant l'alias `@/`
// ET les imports relatifs sans extension vers les fichiers .ts.
// Uniquement pour le HARNESS E2E local. Aucun impact sur l'app.
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";


const NEXT_STUBS = { "next/headers": "./stubs/next-headers.mjs", "server-only": "./stubs/empty.mjs", "client-only": "./stubs/empty.mjs" };
// Redirection d'un fichier RÉSOLU (par suffixe de chemin) vers un stub de test :
// transport email/SMS SIMULÉ (aucun envoi réel), quel que soit l'import (relatif ou @/).
const PATH_REDIRECTS = [
  { suffix: "/lib/outbound-email.ts", stub: "./stubs/outbound-email.mjs" },
  { suffix: "/lib/outbound-sms.ts", stub: "./stubs/outbound-sms.mjs" },
];
function redirectResolved(url) {
  const path = fileURLToPath(url);
  for (const r of PATH_REDIRECTS) if (path.endsWith(r.suffix)) return new URL(r.stub, import.meta.url).href;
  return url;
}
const root = process.env.E2E_ROOT || process.cwd();
const EXTS = [".ts", ".tsx", ".mts", ".js", ".mjs", "/index.ts", "/index.tsx", "/index.js"];

function firstExisting(baseNoExt, makeUrl) {
  for (const ext of EXTS) {
    const url = makeUrl(baseNoExt + ext);
    if (existsSync(fileURLToPath(url))) return url;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (NEXT_STUBS[specifier]) return { url: new URL(NEXT_STUBS[specifier], import.meta.url).href, shortCircuit: true };
  // Alias @/x → <root>/x(.ts…)
  if (specifier.startsWith("@/")) {
    const rel = specifier.slice(2);
    const base = pathToFileURL(root + "/" + rel);
    // déjà avec extension ?
    if (/\.(m?[jt]sx?|json)$/.test(rel) && existsSync(fileURLToPath(base))) {
      return { url: redirectResolved(base.href), shortCircuit: true };
    }
    const found = firstExisting(root + "/" + rel, (p) => pathToFileURL(p));
    if (found) return { url: redirectResolved(found.href), shortCircuit: true };
  }
  // Import relatif SANS extension → .ts/.tsx/index
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL && !/\.(m?[jt]sx?|json|node)$/.test(specifier)) {
    const found = firstExisting(specifier, (s) => new URL(s, context.parentURL));
    if (found) return { url: redirectResolved(found.href), shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
