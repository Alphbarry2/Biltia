// ─────────────────────────────────────────────────────────────────────────────
// LE LOGO DE L'ARTISAN EN HAUT DE SES APPS — d'office.
//
// L'en-tête des apps générées affichait le NOM de l'entreprise en petites
// majuscules (`.app-eyebrow`). Dès que l'artisan a posé un logo (Réglages →
// Identité visuelle), c'est SON LOGO qui doit apparaître. Sans réglage, sans
// question, sans régénérer l'app.
//
// D'où une injection au moment de SERVIR le HTML (comme `injectPoweredBy`), et
// pas à la génération : les apps DÉJÀ créées en profitent aussi, immédiatement.
//
// Le cœur est du CSS sur la classe `.app-eyebrow`, pas du JS qui réécrit le DOM :
// beaucoup d'apps re-rendent leur en-tête à chaque changement d'écran (innerHTML),
// ce qui balaierait un élément inséré à la main. Une règle CSS, elle, survit à
// tous les re-rendus. Le JS ne sert que de FILET pour les apps qui n'ont pas suivi
// la structure imposée (pas de `.app-eyebrow`).
//
// À ne pas confondre avec `injectPoweredBy` : ici c'est la marque de L'ARTISAN sur
// SON interface. Le badge Biltia, lui, reste séparé (règle : Biltia sur
// l'interface, jamais sur un document commercial).
// ─────────────────────────────────────────────────────────────────────────────

import type { BrandKit } from "@/lib/brand";

const MARKER = "__biltia_app_brand_v1__";

function escAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escJs(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/</g, "\\u003c");
}

/**
 * Pose le logo de l'entreprise dans l'en-tête d'une app générée. Idempotent.
 * Sans logo → HTML inchangé (l'en-tête garde le nom de l'entreprise en toutes
 * lettres : mieux vaut un nom qu'un trou).
 */
export function injectAppBrand(html: string, brand: BrandKit): string {
  if (!brand.logoUrl || html.includes(MARKER)) return html;

  const url = escAttr(brand.logoUrl);
  const name = escAttr(brand.entreprise || "");

  const block = `<style>
/* ${MARKER} */
/* Le texte de l'eyebrow (le nom de l'entreprise) cède la place au logo. On ne le
   SUPPRIME pas du DOM — il reste lisible par les lecteurs d'écran et il revient
   automatiquement si le logo est retiré. */
.app-eyebrow{
  display:block!important;
  font-size:0!important;
  line-height:0!important;
  color:transparent!important;
  width:100%;
  max-width:170px;
  height:30px;
  margin-bottom:6px;
  background-image:url("${url}");
  background-repeat:no-repeat;
  background-position:left center;
  /* contain : le logo n'est JAMAIS déformé, quelle que soit sa proportion. */
  background-size:contain;
}
@media (max-width:480px){ .app-eyebrow{ height:26px; max-width:140px; } }
.biltia-brand-logo{ display:block; height:30px; width:auto; max-width:170px; object-fit:contain; margin-bottom:6px; }
</style>
<script>
(function(){
  /* FILET DE SÉCURITÉ. Le CSS ci-dessus suffit dès que l'app respecte la structure
     imposée (.app-header > .app-eyebrow). Quand le modèle s'en est écarté, on pose
     le logo à la main en tête du premier en-tête trouvé.
     L'observateur le remet si l'app re-rend son en-tête. */
  var LOGO = '${escJs(brand.logoUrl)}', NAME = '${escJs(brand.entreprise || "")}';
  function place(){
    try{
      if (document.querySelector('.app-eyebrow')) return;      /* le CSS s'en charge */
      if (document.querySelector('.biltia-brand-logo')) return; /* déjà posé */
      var head = document.querySelector('.app-header') || document.querySelector('header');
      if (!head) return;
      var img = document.createElement('img');
      img.className = 'biltia-brand-logo';
      img.src = LOGO;
      img.alt = NAME;
      head.insertBefore(img, head.firstChild);
    }catch(e){}
  }
  function boot(){
    place();
    try{
      new MutationObserver(function(){ place(); })
        .observe(document.body, { childList:true, subtree:true });
    }catch(e){}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
<\/script>`;

  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${block}\n</head>`);
  if (/<body[^>]*>/i.test(html)) return html.replace(/<body[^>]*>/i, (m) => m + "\n" + block);
  return block + html;
}
