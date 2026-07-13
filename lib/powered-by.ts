// ─────────────────────────────────────────────────────────────────────────────
// « Powered by Biltia » — badge injecté CÔTÉ SERVEUR sur toute app servie
// publiquement (lien /app/[slug] OU lien de partage /partage/[token]).
//
// Comme il est ajouté au moment de SERVIR le HTML, il est NON RETIRABLE par
// l'utilisateur : jamais présent dans le HTML qu'il édite. Chip sombre + « B »
// en dégradé indigo→violet→rose de la landing, cliquable vers la landing.
// Styles 100 % inline (CSP-safe, zéro dépendance).
// ─────────────────────────────────────────────────────────────────────────────

import { pick, type Locale } from "./i18n/config";

const BILTIA_LANDING = "https://www.biltia.com/?ref=powered";

export function injectPoweredBy(html: string): string {
  const badge =
    "\n<style>" +
    // ── Safe-area PWA (installée « écran d'accueil », iOS/Android standalone) ──
    // Les apps servies publiquement ont viewport-fit=cover → le contenu passe SOUS
    // l'encoche/barre d'état (haut) et l'indicateur home (bas). Ces règles réservent
    // ces zones. Base-agnostiques (l'offset du contenu passe par body, pas par une
    // hauteur codée en dur) et valent 0 hors PWA → aucun effet en aperçu/navigateur.
    // Ciblent les conventions d'app Biltia (.app-header/.tab-bar/.fab) ET tout body.
    "body{padding-top:env(safe-area-inset-top,0px)!important;padding-bottom:env(safe-area-inset-bottom,0px)!important}" +
    ".app-header{height:calc(60px + env(safe-area-inset-top,0px))!important;padding-top:env(safe-area-inset-top,0px)!important}" +
    ".tab-bar{padding-bottom:env(safe-area-inset-bottom,0px)!important}" +
    ".fab{transform:translateY(calc(-1 * env(safe-area-inset-bottom,0px)))!important}" +
    // ── Badge « Powered by Biltia » ──
    "#__biltia_pb{position:fixed!important;z-index:2147483647!important;right:14px;bottom:14px;display:inline-flex!important;" +
    "align-items:center;gap:7px;padding:7px 13px 7px 8px;background:#0B1020;color:#fff;border-radius:9999px;" +
    "box-shadow:0 6px 22px rgba(0,0,0,.28);font-family:'Inter',system-ui,-apple-system,sans-serif;font-size:12px;" +
    "line-height:1;text-decoration:none;-webkit-font-smoothing:antialiased}" +
    "#__biltia_pb .pb-b{width:20px;height:20px;border-radius:6px;background:linear-gradient(135deg,#6366F1,#A855F7 55%,#EC4899);" +
    "display:inline-flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:12px}" +
    "#__biltia_pb .pb-m{opacity:.7;font-weight:500}#__biltia_pb .pb-n{font-weight:700}" +
    // Mobile : au-dessus d'une éventuelle barre d'onglets (+ zone home indicator), à gauche (libère le FAB à droite).
    "@media(max-width:600px){#__biltia_pb{right:auto;left:12px;bottom:calc(70px + env(safe-area-inset-bottom,0px))}}" +
    "</style>" +
    '<a id="__biltia_pb" href="' + BILTIA_LANDING + '" target="_blank" rel="noopener noreferrer" aria-label="Propulsé par Biltia">' +
    '<span class="pb-b">B</span><span class="pb-m">Powered by</span><span class="pb-n">Biltia</span></a>\n';
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, badge + "</body>");
  return html + badge;
}

/** Page HTML « introuvable » sobre, aux couleurs Biltia (routes publiques). */
export function publicNotFoundPage(
  title = "Application introuvable",
  message = "Ce lien n'existe pas ou n'est plus disponible.",
  locale: Locale = "fr"
): string {
  // SÉCURITÉ : ces valeurs peuvent contenir de l'entrée utilisateur (ex. le slug
  // d'URL décodé passé par app/app/[slug]) → on ÉCHAPPE avant interpolation, sinon
  // XSS réfléchi sur le domaine principal (vol de session). Ne jamais retirer.
  const esc = (s: string): string =>
    String(s).replace(/[&<>"']/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string
    ));
  const t = esc(title);
  const m = esc(message);
  const back = esc(pick(locale, "Retour à Biltia", "Back to Biltia"));
  return `<!DOCTYPE html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${t}</title><script src="https://cdn.tailwindcss.com"></script></head>
<body class="bg-[#F7F5EF] min-h-screen flex items-center justify-center font-sans">
  <div class="text-center px-6">
    <div class="w-14 h-14 rounded-2xl bg-[#0F172A] flex items-center justify-center mx-auto mb-5 shadow-lg">
      <span class="text-white font-black text-xl">B</span>
    </div>
    <h1 class="text-2xl font-black text-[#111827] mb-2">${t}</h1>
    <p class="text-[#6B7280] text-sm">${m}</p>
    <a href="/" class="inline-block mt-6 px-5 py-2.5 bg-[#0F172A] text-white text-sm font-semibold rounded-xl">${back}</a>
  </div>
</body></html>`;
}
