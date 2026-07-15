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
import { BILTIA_WORDMARK_SVG } from "@/lib/biltia-brand-svg";

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

// ─────────────────────────────────────────────────────────────────────────────
// LE LOGO BILTIA EN HAUT DE L'APP — l'INTERFACE, pas la vitrine.
//
// À DISTINGUER de `injectAppBrand` ci-dessus, qui pose le logo de L'ARTISAN sur
// ce que voit son CLIENT (portail de partage, lien public). Ici on est sur
// l'OUTIL que l'artisan/l'employé utilise (`/a/[id]`, la visionneuse) : l'en-tête
// porte le logo BILTIA COMPLET — la même image vectorielle que la landing et
// l'aperçu des modèles (/t) — jamais l'icône réduite, jamais le nom de l'app
// écrit en toutes lettres. C'est la règle « Biltia sur l'interface, l'artisan sur
// les documents ».
//
// Ce que ça corrige, concrètement :
//   • le TITRE de l'app (« Enquête Satisfaction ») ne s'affiche plus dans
//     l'en-tête : il reste l'identité de l'app (onglet, manifeste PWA), pas un
//     texte imprimé sur elle ;
//   • le petit carré/icône cède la place au WORDMARK complet ;
//   • responsive comme les modèles : le logo est dans la barre latérale (desktop)
//     OU dans l'en-tête (mobile), JAMAIS les deux — l'anti-doublon suit la
//     VISIBILITÉ réelle, donc quel que soit le point de rupture choisi par l'app.
//
// Comme `injectAppBrand`, c'est du CSS sur des CLASSES (`.app-eyebrow`,
// `.sidebar-brand`, `.app-title`…) et non du JS qui réécrit le DOM : une règle CSS
// survit aux re-rendus d'en-tête (innerHTML) que beaucoup d'apps font à chaque
// écran. Le script ne fait que basculer une classe selon la visibilité + un filet
// si l'app n'a aucune zone de marque connue.
// ─────────────────────────────────────────────────────────────────────────────

const INTERFACE_MARKER = "__biltia_interface_wordmark_v1__";
// En background-image : `currentColor` n'a pas de contexte → on fige l'encre, et on
// retire la taille inline (`style="height:24px…"`) pour laisser `background-size`
// piloter le rendu à partir du seul viewBox (ratio conservé partout).
const WORDMARK_URI =
  "data:image/svg+xml," +
  encodeURIComponent(BILTIA_WORDMARK_SVG.replace(/currentColor/g, "#0A0A0A").replace(/\sstyle="[^"]*"/, ""));

/** Pose le logo Biltia complet dans l'en-tête d'une app SERVIE à l'artisan (son
 *  propre outil), et retire le nom de l'app de l'en-tête. Idempotent. */
export function injectInterfaceWordmark(html: string): string {
  if (html.includes(INTERFACE_MARKER)) return html;

  // Le wordmark ne se pose QUE dans la zone de marque : barre latérale (desktop)
  // OU en-tête (tablette/mobile). Surtout PAS sur l'en-tête de CONTENU (.topbar),
  // qui porte une 3e `.app-eyebrow` (le nom de l'entreprise, à côté du titre de
  // page) : la peindre aussi = le logo EN DOUBLE. On énumère donc les conteneurs
  // de marque au lieu de viser `.app-eyebrow` en aveugle.
  const BRAND_ZONE =
    ".sidebar .app-eyebrow,.side-brand .app-eyebrow,.sidebar-brand .app-eyebrow,.sidebar-brand,.app-header .app-eyebrow";

  const block = `<style>
/* ${INTERFACE_MARKER} */
/* Le nom de l'app ne s'imprime plus sur l'app (il reste dans l'onglet/manifeste). */
.app-title{display:none!important}
/* Le carré/initiale (« B ») d'une app phare cède la place au wordmark : jamais d'icône. */
.brand-logo{display:none!important}
/* La zone de marque (barre latérale desktop / en-tête tablette-mobile) devient le
   wordmark Biltia. L'en-tête de CONTENU (.topbar) n'est PAS visé → il garde le nom
   de l'entreprise + le titre de la page, exactement comme l'aperçu du modèle.
   Le texte reste présent (masqué) pour les lecteurs d'écran ; contain → jamais déformé. */
${BRAND_ZONE}{
  display:block!important;font-size:0!important;line-height:0!important;color:transparent!important;
  width:74px;height:26px;
  background:url("${WORDMARK_URI}") left center/contain no-repeat!important;
}
@media(max-width:480px){${BRAND_ZONE}{width:66px;height:23px}}
/* Filet anti-doublon : si une app affichait à la fois barre latérale ET en-tête au
   même point de rupture, l'en-tête ne répète pas le logo. La classe est posée par
   le script selon la VISIBILITÉ réelle (les shells phares séparent déjà les deux). */
html.__bw-side .app-header .app-eyebrow{display:none!important}
</style>
<script>
(function(){
  function sideOn(){
    try{
      var s=document.querySelector('.sidebar-brand,.side-brand,.sidebar .app-eyebrow');
      return !!(s && s.getClientRects().length);
    }catch(e){ return false; }
  }
  function sync(){ try{ document.documentElement.classList.toggle('__bw-side', sideOn()); }catch(e){} }
  function boot(){
    /* Filet : aucune zone de marque connue → on pose une eyebrow vide en tête de
       l'en-tête, que le CSS ci-dessus peint en wordmark. On teste les MÊMES zones
       que le CSS : une eyebrow qui ne vit que dans .topbar ne compte pas. */
    try{
      if(!document.querySelector('.sidebar .app-eyebrow,.side-brand .app-eyebrow,.sidebar-brand,.app-header .app-eyebrow')){
        var head=document.querySelector('.app-header')||document.querySelector('header');
        if(head){ var d=document.createElement('div'); d.className='app-eyebrow'; head.insertBefore(d, head.firstChild); }
      }
    }catch(e){}
    sync();
    try{ new MutationObserver(sync).observe(document.body,{childList:true,subtree:true}); }catch(e){}
    try{ window.addEventListener('resize', sync); }catch(e){}
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
<\/script>`;

  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${block}\n</head>`);
  if (/<body[^>]*>/i.test(html)) return html.replace(/<body[^>]*>/i, (m) => m + "\n" + block);
  return block + html;
}
