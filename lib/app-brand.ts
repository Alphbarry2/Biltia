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
    /* Regroupe les mutations en rafale en UN SEUL passage par image (voir le même
       correctif sur injectInterfaceWordmark — incident drag-and-drop 2026-07-16). */
    var scheduled=false;
    function schedulePlace(){
      if(scheduled) return; scheduled=true;
      (window.requestAnimationFrame||window.setTimeout)(function(){ scheduled=false; place(); });
    }
    try{
      new MutationObserver(schedulePlace)
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

const INTERFACE_MARKER = "__biltia_interface_wordmark_v2__";
// En background-image : `currentColor` n'a pas de contexte → on fige l'encre, et on
// retire la taille inline (`style="height:24px…"`) pour laisser `background-size`
// piloter le rendu à partir du seul viewBox (ratio conservé partout).
const WORDMARK_URI =
  "data:image/svg+xml," +
  encodeURIComponent(BILTIA_WORDMARK_SVG.replace(/currentColor/g, "#0A0A0A").replace(/\sstyle="[^"]*"/, ""));

/** Pose le logo Biltia complet — UNE seule fois — sur une app SERVIE à l'artisan
 *  (son propre outil), et efface toute autre marque : le carré/lettre « B », le nom
 *  de l'app imprimé dans l'interface, et l'eyebrow de la topbar (qui ne garde que le
 *  TITRE DE PAGE). Idempotent.
 *
 *  RÈGLE (user, répétée puis actée le 2026-07-16) :
 *   • le wordmark complet, jamais l'icône, jamais en double ;
 *   • sidebar (desktop) OU en-tête (mobile/tablette) — selon la visibilité réelle ;
 *   • la topbar de contenu = titre de la page uniquement, zéro marque ;
 *   • le NOM du logiciel/de l'app ne s'affiche nulle part (onglet/manifeste seulement).
 *
 *  Pourquoi une v2 : la v1 laissait la marque BRUTE en mode modifié (l'aperçu
 *  d'édition appliquait l'injection ARTISAN, pas celle-ci) et gardait l'eyebrow
 *  « BILTIA » au-dessus du titre de page. Elle supposait aussi que l'app générée
 *  respecte les classes canoniques : le filet couvre désormais les sidebars sans
 *  `.app-eyebrow` (apps déviantes) en en insérant une, côté sidebar ET côté header. */
export function injectInterfaceWordmark(html: string): string {
  if (html.includes(INTERFACE_MARKER)) return html;

  // Zones de MARQUE (peintes en wordmark) : barre latérale OU en-tête mobile.
  // L'eyebrow de la `.topbar` n'en fait PAS partie : elle est masquée (le titre de
  // page reste seul, comme demandé).
  const BRAND_ZONE =
    ".sidebar .app-eyebrow,.side-brand .app-eyebrow,.sidebar-brand .app-eyebrow,.sidebar-brand,.app-header .app-eyebrow,.app-header .brand .app-eyebrow";

  const block = `<style>
/* ${INTERFACE_MARKER} */
/* Le nom de l'app/du logiciel ne s'imprime JAMAIS sur l'interface (onglet/manifeste
   seulement). Les titres de PAGE (« Tableau de bord »…) n'utilisent pas .app-title. */
.app-title{display:none!important}
/* Le carré/initiale (« B », « b ») cède la place au wordmark : jamais d'icône. */
.brand-logo{display:none!important}
/* La topbar de CONTENU garde uniquement le titre de la page : sa marque disparaît. */
.topbar .app-eyebrow{display:none!important}
/* GARDE-FOU LARGEUR : dans le shell des apps (sidebar + contenu en flex), .app-main
   DOIT s'étirer. Le modèle omet parfois flex:1/min-width:0 en recopiant le CSS →
   tout le contenu se tassait dans une colonne à gauche. Posé ici, à l'affichage,
   ça répare TOUTES les apps — y compris celles déjà générées. */
.shell>.app-main{flex:1 1 auto!important;min-width:0!important}
/* La zone de marque (sidebar desktop / en-tête mobile-tablette) devient le wordmark
   Biltia complet. Texte conservé (masqué) pour les lecteurs d'écran ; contain →
   jamais déformé, quelle que soit la place. */
${BRAND_ZONE}{
  display:block!important;font-size:0!important;line-height:0!important;color:transparent!important;
  width:92px;height:30px;
  background:url("${WORDMARK_URI}") left center/contain no-repeat!important;
}
@media(max-width:640px){${BRAND_ZONE}{width:76px;height:25px}}
/* Anti-doublon : si la sidebar est VISIBLE, l'en-tête ne répète pas le logo. La
   classe est posée par le script selon la visibilité réelle (donc robuste quel que
   soit le point de rupture choisi par l'app). */
html.__bw-side .app-header .app-eyebrow,html.__bw-side .app-header .brand{display:none!important}
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
  function ensure(zone){
    /* Pose une .app-eyebrow (que le CSS peint en wordmark) en tête d'une zone qui
       n'en a pas — filet pour les apps qui n'ont pas suivi la structure canonique. */
    try{
      if(!zone) return;
      if(zone.querySelector('.app-eyebrow')) return;
      var d=document.createElement('div'); d.className='app-eyebrow';
      zone.insertBefore(d, zone.firstChild);
    }catch(e){}
  }
  function fit(){
    /* Idempotent — rejoué à CHAQUE mutation : une app qui re-rend sa sidebar ou son
       en-tête via innerHTML balaierait l'eyebrow insérée ; on la repose aussitôt.
       ⚠️ NE JAMAIS appeler sync() ici (getClientRects force un reflow synchrone) :
       une app à glisser-déposer (Kanban) mute le DOM en rafale pendant un drag, et un
       reflow forcé à CHAQUE mutation sature le fil principal → drag saccadé, clics
       perdus par intermittence (incident 2026-07-16, panel commercial en prod).
       sync() ne dépend que du point de rupture (mobile↔desktop) : resize suffit. */
    try{
      /* Sidebar sans eyebrow (ex. app générée avec sa propre marque maison) : on en
         insère une dans son bloc de marque, sinon en tête de la sidebar. */
      var side=document.querySelector('.side-brand,.sidebar-brand');
      if(side){ ensure(side); }
      else{
        var bar=document.querySelector('.sidebar,aside.sidebar,nav.sidebar');
        if(bar && !bar.querySelector('.app-eyebrow')) ensure(bar);
      }
      /* En-tête mobile sans eyebrow : idem. */
      var head=document.querySelector('.app-header')||document.querySelector('header');
      if(head && !head.querySelector('.app-eyebrow')) ensure(head.querySelector('.brand')||head);
    }catch(e){}
  }
  function boot(){
    fit();
    sync();
    /* Regroupe les mutations en rafale (drag, re-render de liste…) en UN SEUL passage
       par image plutôt qu'un par mutation — sans ça, un Kanban qui bouge 30 nœuds
       pendant un drag déclenche 30 exécutions de fit() dans la même frame. */
    var scheduled=false;
    function scheduleFit(){
      if(scheduled) return; scheduled=true;
      (window.requestAnimationFrame||window.setTimeout)(function(){ scheduled=false; fit(); });
    }
    try{ new MutationObserver(scheduleFit).observe(document.body,{childList:true,subtree:true}); }catch(e){}
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
