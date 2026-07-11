// ─────────────────────────────────────────────────────────────────────────────
// APP PHARE — STOCK & ACHATS MATÉRIAUX (inventaire d'entrepôt, layout distinct)
//
// 10e app phare. Comble le trou « le matériel n'existe que dans les chantiers » :
// ici on gère le STOCK pour lui-même. Layout à part : une GRILLE D'INVENTAIRE —
// cockpit sombre (valeur du stock qui défile), graphique interactif de la valeur
// par catégorie, cartes matériaux avec BARRE DE NIVEAU + STEPPER −/+ (entrée/sortie
// en un geste) et pastilles de rupture, puis un onglet RÉAPPRO qui regroupe par
// fournisseur ce qui passe sous le seuil et envoie la commande par email.
// Identité GOLD/AMBRE #B45309 (≠ indigo/violet/teal/orange/bleu/rose/ardoise/
// émeraude/cyan). 3 vues : Stock · Réappro · Fournisseurs.
//
// Entités workspace :
//  - materials { nom*, reference, categorie, quantite, unite, statut
//    (disponible|affecte|maintenance|hors_service), prix_achat_ht, prix_vente_ht,
//    fournisseur_id (→ suppliers), seuil_alerte (alerte stock bas), notes }
//  - suppliers { nom*, categorie (fournisseur|sous_traitant), specialite, email,
//    tel, ville, code_postal, siret, notes }
// SDK injecté à l'instanciation. Contrainte : PAS de template literals NI de
// backticks dans le JS de l'app.
// ─────────────────────────────────────────────────────────────────────────────

import { CHART_CSS, CHART_ENGINE_JS } from "@/lib/app-charts";

export const APP_STOCK_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Stock & achats</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
img,svg{max-width:100%}
:root{--bg:#FBF8F1;--ink:#2E2617;--mut:#7A6A50;--faint:#B0A184;--line:#ECE3D2;--soft:#F5EEDF;
--gd:#B45309;--grad:#B45309;--glow:180,83,9;--tint:#FEF6E7;--tintline:#F3D19A;
--ok:#059669;--warn:#D97706;--bad:#E11D48;
--shadow:0 1px 2px rgba(46,38,23,.04),0 6px 18px rgba(46,38,23,.06);--shadow-lg:0 14px 44px rgba(46,38,23,.16)}
body{background:var(--bg);font-family:'Inter',system-ui,sans-serif;color:var(--ink);font-size:14px;line-height:1.55;-webkit-font-smoothing:antialiased;overflow-x:hidden;overflow-wrap:break-word}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:none;cursor:pointer;font-family:inherit;font-weight:600;transition:all .18s;border-radius:12px;white-space:nowrap;font-size:13px;padding:10px 18px}
.btn:active{transform:scale(.97)}
.btn svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}
.btn-primary{background:var(--grad);color:#fff;box-shadow:0 4px 12px rgba(var(--glow),.24)}
.btn-primary:hover{box-shadow:0 6px 18px rgba(var(--glow),.34)}
.btn-ghost{background:#fff;color:var(--ink);border:1px solid var(--line)}
.btn-ghost:hover{border-color:var(--tintline);box-shadow:0 4px 14px rgba(var(--glow),.12)}
.btn-danger{background:#FFF1F2;color:#E11D48;border:1px solid #FECDD3;padding:8px 14px;font-size:12px;border-radius:10px}
.btn-sm{padding:8px 14px;font-size:12px;border-radius:10px}
.badge{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:9999px;font-size:11px;font-weight:600;white-space:nowrap}
.badge-green{background:#ECFDF5;color:#059669;border:1px solid #A7F3D0}
.badge-amber{background:#FFFBEB;color:#B45309;border:1px solid #FDE68A}
.badge-red{background:#FFF1F2;color:#E11D48;border:1px solid #FECDD3}
.badge-gray{background:#F3ECDD;color:#7A6A50;border:1px solid #ECE3D2}
input,select,textarea{font-family:inherit;font-size:16px;color:var(--ink);background:#fff;border:1px solid #E0D3BB;border-radius:12px;padding:10px 14px;width:100%;outline:none;transition:border .15s,box-shadow .15s}
input:focus,select:focus,textarea:focus{border-color:var(--gd);box-shadow:0 0 0 3px rgba(var(--glow),.14)}
input::placeholder,textarea::placeholder{color:#B0A184}
input.invalid,select.invalid{border-color:#E11D48;box-shadow:0 0 0 3px rgba(225,29,72,.12)}
textarea{resize:vertical;min-height:70px}
.shell{display:flex;min-height:100vh}
.sidebar{display:none}
.app-main{flex:1;min-width:0;padding:0 0 90px}
.app-header{position:fixed;top:0;left:0;right:0;z-index:100;background:rgba(251,248,241,.85);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-bottom:1px solid var(--line);height:60px;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 14px}
.brand{display:flex;align-items:center;gap:10px;min-width:0}
.brand-logo{width:30px;height:30px;border-radius:9px;background:var(--grad);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:14px;flex-shrink:0}
.app-eyebrow{font-size:10px;font-weight:700;color:var(--gd);text-transform:uppercase;letter-spacing:.12em;display:block;line-height:1.2}
.app-title{font-size:15px;font-weight:800;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px;line-height:1.2}
.mtop{height:60px}
.tab-bar{position:fixed;bottom:0;left:0;right:0;background:rgba(251,248,241,.94);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-top:1px solid var(--line);display:flex;z-index:100}
.tab-item{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:8px 4px 10px;cursor:pointer;border:none;background:none;font-size:10px;font-weight:600;color:#B0A184;font-family:inherit;min-height:56px}
.tab-item.active{color:var(--gd)}
.tab-ic{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.fab{position:fixed;right:16px;bottom:78px;z-index:120;width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;color:#fff;font-size:28px;line-height:1;background:var(--grad);box-shadow:0 8px 22px rgba(var(--glow),.30);display:flex;align-items:center;justify-content:center}
.fab:active{transform:scale(.94)}
.view-pad{padding:16px}
.topbar{display:none}
.section-h{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:20px 2px 12px}
.section-h b{font-size:15px;font-weight:700}
.empty{text-align:center;padding:48px 20px}
.empty-ico{width:54px;height:54px;border-radius:16px;background:var(--tint);color:var(--gd);display:flex;align-items:center;justify-content:center;margin:0 auto 14px;font-size:24px}
.empty-title{font-weight:700;margin-bottom:4px}
.empty-sub{font-size:13px;color:var(--mut);margin-bottom:16px}
.spin{width:26px;height:26px;border:3px solid var(--line);border-top-color:var(--gd);border-radius:50%;animation:sp .7s linear infinite;margin:60px auto}
@keyframes sp{to{transform:rotate(360deg)}}
.mini-av{width:34px;height:34px;border-radius:10px;font-size:12px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;flex-shrink:0}
/* ── Cockpit ── */
.cockpit{position:relative;margin:0 0 16px;padding:22px;border-radius:22px;background:#2A1B06;color:#fff;overflow:hidden;box-shadow:var(--shadow-lg)}
.cockpit::before{content:"";position:absolute;inset:0;background:radial-gradient(120% 90% at 100% 0,rgba(180,83,9,.5),transparent 60%);pointer-events:none}
.c-label{position:relative;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:rgba(255,255,255,.6)}
.c-value{position:relative;font-size:34px;font-weight:800;letter-spacing:-.02em;line-height:1.15;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.c-sub{position:relative;font-size:12.5px;color:rgba(255,255,255,.72)}
.ck-stats{position:relative;display:flex;gap:26px;margin-top:14px}
.ck-stat b{display:block;font-size:17px;font-weight:800;font-variant-numeric:tabular-nums}
.ck-stat span{font-size:10.5px;color:rgba(255,255,255,.6);font-weight:600;text-transform:uppercase;letter-spacing:.05em}
/* ── Chips / recherche ── */
.chips{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
.chip{border:1px solid var(--line);background:#fff;color:var(--mut);font-weight:600;font-size:12.5px;padding:7px 14px;border-radius:9999px;cursor:pointer;font-family:inherit}
.chip.on{background:var(--gd);color:#fff;border-color:transparent}
.searchbar{position:relative;margin-bottom:14px}
.searchbar input{padding-left:38px}
.searchbar svg{position:absolute;left:13px;top:50%;transform:translateY(-50%);width:16px;height:16px;fill:none;stroke:var(--faint);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.grp-h{font-size:11px;font-weight:700;color:var(--faint);text-transform:uppercase;letter-spacing:.08em;margin:18px 2px 10px;display:flex;align-items:center;gap:8px}
.grp-h .dot{width:8px;height:8px;border-radius:50%}
/* ── Carte matériau (inventaire) ── */
.grid-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:12px}
.matc{background:#fff;border:1px solid var(--line);border-radius:16px;padding:14px 15px;box-shadow:var(--shadow);border-top:3px solid var(--line)}
.matc.rupture{border-top-color:var(--bad)}.matc.bas{border-top-color:var(--warn)}.matc.ok{border-top-color:var(--ok)}
.matc-top{cursor:pointer;display:flex;align-items:flex-start;gap:11px;margin-bottom:12px}
.matc-ic{width:38px;height:38px;border-radius:11px;background:var(--tint);color:var(--gd);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
.matc-nm{font-weight:700;line-height:1.25;word-break:break-word}
.matc-mt{font-size:12px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lvl{height:8px;border-radius:6px;background:var(--soft);overflow:hidden;margin:4px 0 12px}
.lvl i{display:block;height:100%;border-radius:6px;transition:width .35s ease}
.matc-bot{display:flex;align-items:center;justify-content:space-between;gap:10px}
.qwrap{display:flex;align-items:baseline;gap:5px;min-width:0}
.qwrap b{font-size:22px;font-weight:800;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.qwrap span{font-size:12px;color:var(--mut);font-weight:600}
.stp{display:inline-flex;align-items:center;border:1px solid var(--line);border-radius:11px;overflow:hidden;flex-shrink:0}
.stp button{width:36px;height:36px;border:none;background:#fff;color:var(--ink);font-size:19px;line-height:1;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center}
.stp button:active{background:var(--soft)}
.stp button:first-child{border-right:1px solid var(--line)}
.stp button:last-child{border-left:1px solid var(--line);color:var(--gd)}
/* ── Réappro (commande par fournisseur) ── */
.ord{background:#fff;border:1px solid var(--line);border-radius:16px;padding:14px 16px;box-shadow:var(--shadow);margin-bottom:12px}
.ord-h{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:4px}
.ord-h .nm{font-weight:700;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ord-item{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 0;border-top:1px solid var(--line);font-size:13px}
.ord-item .l{min-width:0}
.ord-item .l .n{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ord-item .l .s{font-size:11.5px;color:var(--mut)}
.ord-qty{font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--gd)}
/* ── Cartes fournisseurs ── */
.mcard{background:#fff;border:1px solid var(--line);border-radius:16px;padding:16px;box-shadow:var(--shadow);cursor:pointer;text-align:left;width:100%}
.mcard:hover{box-shadow:0 6px 20px rgba(46,38,23,.08);border-color:var(--tintline)}
/* ── Détail ── */
.stban{border-radius:14px;padding:14px 16px;margin-bottom:16px;color:#fff}
.stban b{display:block;font-size:15px;font-weight:800}
.stban span{font-size:12.5px;opacity:.9}
.kv{display:grid;grid-template-columns:1fr 1fr;gap:14px 16px;margin-bottom:6px}
@media(max-width:460px){.kv{grid-template-columns:1fr}}
.kv .k{font-size:10.5px;color:var(--faint);font-weight:700;text-transform:uppercase;letter-spacing:.06em}
.kv .v{font-size:14px;font-weight:600;margin-top:2px;word-break:break-word}
.kv .v a{color:var(--gd);text-decoration:none}
/* Modale */
.overlay{position:fixed;inset:0;background:rgba(46,38,23,.44);backdrop-filter:blur(6px);z-index:200;display:flex;align-items:flex-end;justify-content:center}
.overlay[hidden]{display:none}
@media(min-width:600px){.overlay{align-items:center;padding:20px}}
.modal{background:#fff;border-radius:24px 24px 0 0;width:100%;max-width:540px;max-height:92vh;overflow-y:auto;padding:22px 20px calc(22px + env(safe-area-inset-bottom));box-shadow:var(--shadow-lg)}
@media(min-width:600px){.modal{border-radius:24px}}
.modal-h{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px}
.modal-title{font-size:18px;font-weight:800;letter-spacing:-.01em}
.modal-sub{font-size:12.5px;color:var(--mut);margin-top:2px}
.x{border:none;background:var(--soft);width:34px;height:34px;border-radius:10px;color:var(--mut);font-size:18px;cursor:pointer;flex-shrink:0}
.fg{margin-bottom:14px}
.fl{display:block;font-size:11px;font-weight:700;color:#7A6A50;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media(max-width:480px){.form-row{grid-template-columns:1fr}}
.seg{display:flex;flex-wrap:wrap;gap:6px}
.seg button{border:1px solid var(--line);background:#fff;color:var(--mut);font-weight:600;font-size:12px;padding:8px 12px;border-radius:10px;cursor:pointer;font-family:inherit}
.seg button.on{color:#fff;border-color:transparent}
.sugg{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.sugg button{border:1px dashed var(--tintline);background:var(--tint);color:var(--gd);font-weight:600;font-size:12px;padding:6px 11px;border-radius:9px;cursor:pointer;font-family:inherit}
.modal-actions{display:flex;gap:10px;margin-top:20px;flex-wrap:wrap}
.modal-actions .btn{flex:1}
@media(min-width:860px){
  .app-header,.mtop,.tab-bar,.fab{display:none}
  .sidebar{display:flex;flex-direction:column;width:236px;flex-shrink:0;position:sticky;top:0;height:100vh;border-right:1px solid var(--line);background:#fff;padding:20px 14px}
  .side-brand{display:flex;align-items:center;gap:11px;padding:6px 8px 20px}
  .side-nav{display:flex;flex-direction:column;gap:3px}
  .side-item{display:flex;align-items:center;gap:11px;padding:10px 12px;border-radius:11px;border:none;background:none;cursor:pointer;font-family:inherit;font-size:13.5px;font-weight:600;color:var(--mut);text-align:left;width:100%}
  .side-item:hover{background:var(--soft);color:var(--ink)}
  .side-item.active{background:var(--tint);color:var(--gd)}
  .side-item svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}
  .app-main{padding:0 0 40px}
  .topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:26px 32px 6px}
  .view-pad{padding:16px 32px}
}
@media(max-width:400px){.view-pad{padding:13px}.app-title{max-width:120px}.btn{padding:11px 15px}.c-value{font-size:28px}}
@media(min-width:1600px){.topbar,.view-pad{max-width:1520px;margin-left:auto;margin-right:auto}}
@media print{.sidebar,.app-header,.tab-bar,.fab,.no-print{display:none!important}}
${CHART_CSS}
</style>
</head>
<body>
<div class="shell">
  <aside class="sidebar">
    <div class="side-brand"><span class="brand-logo" id="side-logo">B</span><div style="min-width:0"><span class="app-eyebrow" id="side-eyebrow">BILTIA</span><span class="app-title" id="side-title">Stock</span></div></div>
    <nav class="side-nav" id="side-nav"></nav>
  </aside>
  <div class="app-main">
    <header class="app-header">
      <div class="brand"><span class="brand-logo" id="hd-logo">B</span><div style="min-width:0"><span class="app-eyebrow" id="hd-eyebrow">BILTIA</span><span class="app-title">Stock</span></div></div>
      <button class="btn btn-primary btn-sm" id="hd-add" onclick="primaryAdd()">+ Article</button>
    </header>
    <div class="mtop"></div>
    <div class="topbar">
      <div><span class="app-eyebrow" id="tb-eyebrow">BILTIA</span><div id="tb-title" style="font-size:22px;font-weight:800;letter-spacing:-.02em">Stock</div></div>
      <button class="btn btn-primary" id="tb-add" onclick="primaryAdd()">+ Nouvel article</button>
    </div>
    <main id="view"><div class="spin"></div></main>
  </div>
</div>
<nav class="tab-bar" id="tab-bar"></nav>
<button class="fab" onclick="primaryAdd()" aria-label="Ajouter">+</button>
<div class="overlay" id="ovl" hidden><div class="modal" id="modal"></div></div>

<script>
var S={ view:"stock", materials:[], suppliers:[], entreprise:"__ENTREPRISE__", cat:"tous", q:"", edit:null };
var $=function(id){return document.getElementById(id);};
function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
function initials(s){var w=String(s||"?").trim().split(/\\s+/);return ((w[0]||"?")[0]+(w[1]?w[1][0]:"")).toUpperCase();}
var AV=["#B45309","#C2410C","#92400E","#0D9488","#4F46E5","#B91C1C","#7C3AED","#059669"];
function avc(seed){var s=String(seed||""),h=0;for(var i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;return AV[h%AV.length];}
function numV(v){var n=parseFloat(String(v==null?"":v).replace(/\\s/g,"").replace(",","."));return isFinite(n)?n:0;}
function eur(n){return Math.round(numV(n)).toLocaleString("fr-FR")+" €";}
function eurK(n){n=numV(n);return n>=1000?Math.round(n/100)/10+" k€":Math.round(n)+" €";}
function qtyLabel(n){ n=numV(n); return (n%1===0)?String(n):(""+Math.round(n*100)/100).replace(".",","); }
function findIn(a,id){for(var i=0;i<a.length;i++)if(a[i].id===id)return a[i];return null;}
function supName(id){var s=findIn(S.suppliers,id);return s?s.nom:"";}
var CATIC={ "gros œuvre":"🧱","gros oeuvre":"🧱","maçonnerie":"🧱","électricité":"⚡","electricite":"⚡","plomberie":"🚰","peinture":"🎨","isolation":"🧊","quincaillerie":"🔩","outillage":"🛠️","menuiserie":"🪵","carrelage":"◼️","couverture":"🏠","placo":"⬜" };
function catIcon(c){ var k=String(c||"").toLowerCase().trim(); return CATIC[k]||"📦"; }
var CAT_SUGG=["Gros œuvre","Électricité","Plomberie","Peinture","Isolation","Quincaillerie","Outillage","Menuiserie","Carrelage","Placo"];
var UNITES=["u","sac","m²","m³","ml","kg","L","rlx","boîte"];

function stockLevel(m){ var q=numV(m.quantite), s=numV(m.seuil_alerte);
  if(q<=0)return {key:"rupture",l:"Rupture",c:"#E11D48",badge:"badge-red",sev:2};
  if(s>0&&q<=s)return {key:"bas",l:"Stock bas",c:"#D97706",badge:"badge-amber",sev:1};
  return {key:"ok",l:"En stock",c:"#059669",badge:"badge-green",sev:0};
}
function lvlPct(m){ var q=numV(m.quantite), s=numV(m.seuil_alerte); if(s>0)return Math.max(q>0?6:0,Math.min(100,Math.round(q/(s*2)*100))); return q>0?100:0; }
function reorderQty(m){ var s=numV(m.seuil_alerte), q=numV(m.quantite); var tgt=s>0?s*2:1; return Math.max(1,Math.ceil(tgt-q)); }
function stockValue(){ return S.materials.reduce(function(t,m){return t+numV(m.quantite)*numV(m.prix_achat_ht);},0); }

var NAV=[
  {id:"stock",label:"Stock",icon:'<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>'},
  {id:"reappro",label:"Réappro",icon:'<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>'},
  {id:"fournisseurs",label:"Fournisseurs",icon:'<path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>'}
];

async function boot(){
  try{
    var r=await Promise.all([
      biltia.list("materials",{order:"nom",ascending:true,limit:2000}).catch(function(){return[];}),
      biltia.list("suppliers",{order:"nom",ascending:true,limit:1000}).catch(function(){return[];})
    ]);
    S.materials=r[0]||[]; S.suppliers=r[1]||[];
    renderNav(); render();
  }catch(e){ $("view").innerHTML='<div class="view-pad"><div class="empty"><div class="empty-ico">⚠️</div><div class="empty-title">Connexion au workspace impossible</div><div class="empty-sub">Vérifiez votre connexion puis rouvrez l\\'application.</div></div></div>'; }
}
function renderNav(){
  $("side-nav").innerHTML=NAV.map(function(n){return '<button class="side-item'+(S.view===n.id?" active":"")+'" onclick="go(\\''+n.id+'\\')"><svg viewBox="0 0 24 24">'+n.icon+'</svg><span>'+n.label+'</span></button>';}).join("");
  $("tab-bar").innerHTML=NAV.map(function(n){return '<button class="tab-item'+(S.view===n.id?" active":"")+'" onclick="go(\\''+n.id+'\\')"><svg class="tab-ic" viewBox="0 0 24 24">'+n.icon+'</svg><span>'+n.label+'</span></button>';}).join("");
}
function go(v){ S.view=v; renderNav(); render(); try{window.scrollTo(0,0);}catch(e){} }
function primaryAdd(){ if(S.view==="fournisseurs") openSup(null); else openMat(null); }
function render(){
  var titles={stock:"Stock",reappro:"Réapprovisionnement",fournisseurs:"Fournisseurs"};
  $("tb-title").textContent=titles[S.view]||"";
  if($("hd-add"))$("hd-add").textContent=(S.view==="fournisseurs"?"+ Fournisseur":"+ Article");
  if($("tb-add"))$("tb-add").textContent=(S.view==="fournisseurs"?"+ Nouveau fournisseur":"+ Nouvel article");
  if(S.view==="stock") renderStock();
  else if(S.view==="reappro") renderReappro();
  else renderFournisseurs();
}
function categories(){ var set={},out=[]; S.materials.forEach(function(m){var c=String(m.categorie||"").trim();if(c&&!set[c]){set[c]=1;out.push(c);}}); return out.sort(); }

/* ── Vue : Stock (inventaire) ── */
function renderStock(){
  var val=stockValue(), need=S.materials.filter(function(m){return stockLevel(m).sev>=1;}), rupt=S.materials.filter(function(m){return stockLevel(m).sev===2;});
  var cats=categories();
  var h='<div class="view-pad">';
  h+='<div class="cockpit"><div class="c-label">Valeur du stock</div><div class="c-value" id="ck-val">'+eur(val)+'</div><div class="c-sub">'+S.materials.length+' référence'+(S.materials.length>1?"s":"")+' · '+need.length+' à réapprovisionner</div><div class="ck-stats"><div class="ck-stat"><b>'+rupt.length+'</b><span>en rupture</span></div><div class="ck-stat"><b>'+cats.length+'</b><span>catégories</span></div></div></div>';
  h+='<div class="chart-card" style="margin-bottom:16px"><div class="chart-hd"><b>Valeur du stock par catégorie</b><span class="rd" id="rd-cat">'+eurK(val)+'</span></div><div class="chart-host" id="ch-cat"></div></div>';
  h+='<div class="chips">'+[["tous","Toutes"]].concat(cats.map(function(c){return [c,c];})).map(function(o){return '<button class="chip'+(S.cat===o[0]?" on":"")+'" onclick="setCat(\\''+esc(o[0]).replace(/'/g,"")+'\\')">'+esc(o[1])+'</button>';}).join("")+'</div>';
  h+='<div class="searchbar"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg><input id="st-q" placeholder="Rechercher un article, une référence…" value="'+esc(S.q)+'" oninput="stSearch(this.value)"></div>';
  h+='<div id="st-list"></div>';
  h+='</div>'; $("view").innerHTML=h;
  renderStockList();
  try{
    var agg={}; S.materials.forEach(function(m){ var c=String(m.categorie||"Autres").trim()||"Autres"; agg[c]=(agg[c]||0)+numV(m.quantite)*numV(m.prix_achat_ht); });
    var arr=Object.keys(agg).map(function(k){return {label:k.length>9?k.slice(0,8)+"…":k,tip:k,value:agg[k]};}).sort(function(a,b){return b.value-a.value;}).slice(0,6);
    if(!arr.length)arr=[{label:"—",tip:"Aucun",value:0}];
    chartCountUp($("ck-val"),val,function(v){return eur(v);});
    drawBars($("ch-cat"),arr,{id:"cat",color:"#B45309",color2:"#F59E0B",fmt:function(v){return eur(v);},rd:"rd-cat",rdDef:eurK(val)});
  }catch(e){}
}
function setCat(k){ S.cat=k||"tous"; renderStock(); }
function stSearch(v){ S.q=v; renderStockList(); }
function renderStockList(){
  var q=String(S.q||"").toLowerCase().trim();
  var list=S.materials.filter(function(m){
    if(S.cat!=="tous"&&String(m.categorie||"").trim()!==S.cat)return false;
    if(!q)return true;
    return (String(m.nom||"")+" "+String(m.reference||"")+" "+String(m.categorie||"")+" "+supName(m.fournisseur_id)).toLowerCase().indexOf(q)>=0;
  }).sort(function(a,b){ var sa=stockLevel(a).sev,sb=stockLevel(b).sev; if(sa!==sb)return sb-sa; return String(a.nom||"").localeCompare(String(b.nom||"")); });
  var host=$("st-list"); if(!host)return;
  if(!list.length){ host.innerHTML='<div class="empty"><div class="empty-ico">📦</div><div class="empty-title">Aucun article</div><div class="empty-sub">'+(S.materials.length?"Aucun résultat pour ce filtre.":"Ajoutez vos matériaux et fournitures pour suivre le stock.")+'</div><button class="btn btn-primary" onclick="openMat(null)">+ Nouvel article</button></div>'; return; }
  host.innerHTML='<div class="section-h" style="margin-top:2px"><b>'+list.length+' article'+(list.length>1?"s":"")+'</b></div><div class="grid-cards">'+list.map(matCard).join("")+'</div>';
}
function matCard(m){ var lv=stockLevel(m), sup=supName(m.fournisseur_id), pct=lvlPct(m);
  return '<div class="matc '+lv.key+'">'
    +'<div class="matc-top" onclick="openMat(\\''+m.id+'\\')"><span class="matc-ic">'+catIcon(m.categorie)+'</span><div style="min-width:0;flex:1"><div class="matc-nm">'+esc(m.nom||"Article")+'</div><div class="matc-mt">'+esc([m.categorie,sup,m.reference].filter(Boolean).join(" · ")||"Sans catégorie")+'</div></div><span class="badge '+lv.badge+'">'+lv.l+'</span></div>'
    +'<div class="lvl"><i id="lb-'+m.id+'" style="width:'+pct+'%;background:'+lv.c+'"></i></div>'
    +'<div class="matc-bot"><div class="qwrap"><b id="q-'+m.id+'">'+qtyLabel(m.quantite)+'</b><span>'+esc(m.unite||"u")+(numV(m.seuil_alerte)>0?" · seuil "+qtyLabel(m.seuil_alerte):"")+'</span></div>'
    +'<div class="stp"><button onclick="adjustStock(event,\\''+m.id+'\\',-1)" aria-label="Retirer">−</button><button onclick="adjustStock(event,\\''+m.id+'\\',1)" aria-label="Ajouter">+</button></div></div>'
    +'</div>';
}
var _stkT;
async function adjustStock(ev,id,delta){
  if(ev&&ev.stopPropagation)ev.stopPropagation();
  var m=findIn(S.materials,id); if(!m)return;
  var q=Math.max(0,numV(m.quantite)+delta); m.quantite=q;
  var el=$("q-"+id); if(el)el.textContent=qtyLabel(q);
  var lv=stockLevel(m), bar=$("lb-"+id); if(bar){bar.style.width=lvlPct(m)+"%";bar.style.background=lv.c;}
  if(_stkT)clearTimeout(_stkT); _stkT=setTimeout(function(){ if(S.view==="stock")renderStock(); },600);
  try{ await biltia.update("materials",id,{quantite:q}); }catch(e){ biltia.notify("Mise à jour impossible"); }
}

/* ── Vue : Réappro ── */
function renderReappro(){
  var need=S.materials.filter(function(m){return stockLevel(m).sev>=1;});
  var h='<div class="view-pad">';
  if(!need.length){ h+='<div class="empty"><div class="empty-ico">✅</div><div class="empty-title">Rien à réapprovisionner</div><div class="empty-sub">Tous vos articles sont au-dessus de leur seuil d\\'alerte.</div><button class="btn btn-primary" onclick="go(\\'stock\\')">Voir le stock</button></div></div>'; $("view").innerHTML=h; return; }
  var groups={}, order=[];
  need.forEach(function(m){ var k=m.fournisseur_id||"__none"; if(!groups[k]){groups[k]=[];order.push(k);} groups[k].push(m); });
  h+='<div class="section-h" style="margin-top:2px"><b>'+need.length+' article'+(need.length>1?"s":"")+' à commander</b><span class="badge badge-amber">'+order.length+' fournisseur'+(order.length>1?"s":"")+'</span></div>';
  order.forEach(function(k){ var items=groups[k], sup=k==="__none"?null:findIn(S.suppliers,k);
    h+='<div class="ord"><div class="ord-h"><div style="display:flex;align-items:center;gap:10px;min-width:0"><span class="mini-av" style="background:'+avc(sup?sup.nom:"?")+'">'+(sup?esc(initials(sup.nom)):"?")+'</span><div style="min-width:0"><div class="nm">'+(sup?esc(sup.nom):"Sans fournisseur")+'</div><div style="font-size:11.5px;color:var(--mut)">'+items.length+' article'+(items.length>1?"s":"")+(sup&&sup.email?" · "+esc(sup.email):"")+'</div></div></div>'
      +(sup&&sup.email?'<button class="btn btn-primary btn-sm" onclick="commanderSupplier(\\''+k+'\\')">Commander</button>':'')+'</div>';
    h+=items.map(function(m){ var lv=stockLevel(m);
      return '<div class="ord-item"><div class="l"><div class="n">'+esc(m.nom||"Article")+'</div><div class="s"><span style="color:'+lv.c+';font-weight:600">'+lv.l+'</span> · reste '+qtyLabel(m.quantite)+' '+esc(m.unite||"u")+(numV(m.seuil_alerte)>0?" (seuil "+qtyLabel(m.seuil_alerte)+")":"")+'</div></div><div class="ord-qty">+'+reorderQty(m)+' '+esc(m.unite||"u")+'</div></div>';
    }).join("");
    if(!sup||!sup.email){ h+='<div style="margin-top:10px"><button class="btn btn-ghost btn-sm" style="width:100%" onclick="'+(sup?"commanderSupplier(\\''+k+'\\')":"go(\\'stock\\')")+'">'+(sup?"Ce fournisseur n\\'a pas d\\'email — l\\'ajouter":"Associer un fournisseur à ces articles")+'</button></div>'; }
    h+='</div>';
  });
  h+='</div>'; $("view").innerHTML=h;
}
async function commanderSupplier(id){
  var sup=findIn(S.suppliers,id);
  var items=S.materials.filter(function(m){return stockLevel(m).sev>=1 && m.fournisseur_id===id;});
  if(!items.length){ biltia.notify("Rien à commander"); return; }
  if(!sup){ biltia.notify("Fournisseur introuvable"); return; }
  if(!sup.email){ closeModal(); openSup(id); return; }
  var lines=items.map(function(m){return "- "+reorderQty(m)+" "+(m.unite||"u")+" "+(m.nom||"")+(m.reference?" (réf. "+m.reference+")":"");}).join("\\n");
  var body="Bonjour,\\n\\nMerci de nous préparer la commande de réapprovisionnement suivante :\\n"+lines+"\\n\\nMerci de nous confirmer la disponibilité et le délai de livraison.\\n\\nCordialement,\\n"+(S.entreprise||"");
  try{ await biltia.sendEmail({to:sup.email,subject:"Commande de réapprovisionnement",body:body}); biltia.notify("Commande envoyée à "+sup.nom); }
  catch(e){ biltia.notify("Envoi impossible"); }
}

/* ── Vue : Fournisseurs ── */
function renderFournisseurs(){
  var h='<div class="view-pad">';
  h+='<div class="searchbar"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg><input id="fo-q" placeholder="Rechercher un fournisseur, une ville…" value="'+esc(S.q)+'" oninput="foSearch(this.value)"></div>';
  h+='<div id="fo-results"></div></div>'; $("view").innerHTML=h; renderFournisseursList();
}
function foSearch(v){ S.q=v; renderFournisseursList(); }
function renderFournisseursList(){
  var q=String(S.q||"").toLowerCase().trim();
  var list=fournisseurList().filter(function(s){ if(!q)return true; return (String(s.nom||"")+" "+String(s.specialite||"")+" "+String(s.ville||"")).toLowerCase().indexOf(q)>=0; });
  var host=$("fo-results"); if(!host)return;
  if(!list.length){ host.innerHTML='<div class="empty"><div class="empty-ico">🚚</div><div class="empty-title">Aucun fournisseur</div><div class="empty-sub">'+(S.suppliers.length?"Aucun résultat pour cette recherche.":"Ajoutez vos négoces et fournisseurs de matériaux.")+'</div><button class="btn btn-primary" onclick="openSup(null)">+ Nouveau fournisseur</button></div>'; return; }
  host.innerHTML='<div class="section-h" style="margin-top:2px"><b>'+list.length+' fournisseur'+(list.length>1?"s":"")+'</b></div><div class="grid-cards">'+list.map(function(s){
    var mats=S.materials.filter(function(m){return m.fournisseur_id===s.id;}); var need=mats.filter(function(m){return stockLevel(m).sev>=1;}).length;
    return '<button class="mcard" onclick="openSupD(\\''+s.id+'\\')"><div style="display:flex;align-items:center;gap:12px;margin-bottom:12px"><span class="mini-av" style="width:40px;height:40px;background:'+avc(s.nom)+'">'+esc(initials(s.nom))+'</span><div style="min-width:0;flex:1"><div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(s.nom)+'</div><div style="color:var(--mut);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(s.specialite||s.ville||"Fournisseur")+'</div></div></div><div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><span class="badge badge-gray">'+mats.length+' article'+(mats.length>1?"s":"")+'</span>'+(need?'<span class="badge badge-amber">'+need+' à commander</span>':'')+'</div></button>';
  }).join("")+'</div>';
}

/* ── Sélecteurs relationnels ── */
// Fournisseurs pertinents ici : catégorie « fournisseur » (les sous-traitants
// vivent dans l'app dédiée) OU tout partenaire déjà associé à un article.
function fournisseurList(){ return S.suppliers.filter(function(s){ return s.categorie!=="sous_traitant" || S.materials.some(function(m){return m.fournisseur_id===s.id;}); }); }
function optSuppliers(sel){ var o='<option value="">— Fournisseur (optionnel) —</option>'; var seen={}; fournisseurList().forEach(function(s){seen[s.id]=1;o+='<option value="'+s.id+'"'+(s.id===sel?" selected":"")+'>'+esc(s.nom)+'</option>';}); if(sel&&!seen[sel]){var cur=findIn(S.suppliers,sel);if(cur)o+='<option value="'+cur.id+'" selected>'+esc(cur.nom)+'</option>';} o+='<option value="__new">➕ Nouveau fournisseur…</option>'; return o; }
function newSupplierInline(selId){ var nm=prompt("Nom du fournisseur :",""); if(nm&&nm.trim()){ biltia.create("suppliers",{nom:nm.trim(),categorie:"fournisseur"}).then(function(s){ S.suppliers.push(s); S.suppliers.sort(function(a,b){return String(a.nom).localeCompare(String(b.nom));}); if(S.edit)S.edit.fournisseur_id=s.id; if($(selId))$(selId).innerHTML=optSuppliers(s.id); biltia.notify("Fournisseur créé"); }).catch(function(){ if($(selId))$(selId).value=(S.edit&&S.edit.fournisseur_id)||""; }); } else { if($(selId))$(selId).value=(S.edit&&S.edit.fournisseur_id)||""; } }

/* ── Matériau : détail ── */
function openMat(id){ var m=id?findIn(S.materials,id):null; if(m)openMatDetail(m); else openMatEdit(null); }
function openMatDetail(m){
  if(!m){ openMatEdit(null); return; }
  var lv=stockLevel(m), sup=supName(m.fournisseur_id);
  var h='<div class="modal-h"><div style="display:flex;align-items:center;gap:12px;min-width:0"><span class="matc-ic" style="width:40px;height:40px">'+catIcon(m.categorie)+'</span><div style="min-width:0"><div class="modal-title" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(m.nom||"Article")+'</div><div class="modal-sub">'+esc([m.categorie,m.reference].filter(Boolean).join(" · ")||"Article")+'</div></div></div><button class="x" onclick="closeModal()">✕</button></div>';
  h+='<div class="stban" style="background:'+lv.c+'"><b>'+lv.l+' · '+qtyLabel(m.quantite)+' '+esc(m.unite||"u")+' en stock</b><span>'+(numV(m.seuil_alerte)>0?"Seuil d\\'alerte : "+qtyLabel(m.seuil_alerte)+" "+esc(m.unite||"u"):"Aucun seuil d\\'alerte défini")+'</span></div>';
  h+='<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px"><div style="font-size:12px;color:var(--mut);font-weight:600">Ajuster le stock</div><div class="stp"><button onclick="adjustStock(event,\\''+m.id+'\\',-1)">−</button><button onclick="adjustStock(event,\\''+m.id+'\\',1)">+</button></div></div>';
  h+='<div class="kv">';
  if(sup)h+='<div><div class="k">Fournisseur</div><div class="v">'+esc(sup)+'</div></div>';
  if(numV(m.prix_achat_ht)>0)h+='<div><div class="k">Prix d\\'achat HT</div><div class="v">'+eur(m.prix_achat_ht)+' / '+esc(m.unite||"u")+'</div></div>';
  h+='<div><div class="k">Valeur en stock</div><div class="v">'+eur(numV(m.quantite)*numV(m.prix_achat_ht))+'</div></div>';
  if(m.reference)h+='<div><div class="k">Référence</div><div class="v">'+esc(m.reference)+'</div></div>';
  h+='</div>';
  if(m.notes)h+='<div class="fg"><div class="k" style="font-size:10.5px;color:var(--faint);font-weight:700;text-transform:uppercase;letter-spacing:.06em">Notes</div><div class="v" style="font-size:14px;font-weight:500;margin-top:2px;color:var(--mut)">'+esc(m.notes)+'</div></div>';
  h+='<div class="modal-actions">';
  if(lv.sev>=1&&m.fournisseur_id&&findIn(S.suppliers,m.fournisseur_id)&&findIn(S.suppliers,m.fournisseur_id).email)h+='<button class="btn btn-primary" onclick="commanderSupplier(\\''+m.fournisseur_id+'\\')">Commander</button>';
  h+='<button class="btn btn-ghost" onclick="openMatEdit(\\''+m.id+'\\')">Modifier</button></div>';
  h+='<div style="margin-top:10px"><button class="btn btn-danger" style="width:100%" onclick="matDel(\\''+m.id+'\\')">Supprimer</button></div>';
  openModal(h);
}
async function matDel(id){ if(!confirm("Supprimer cet article ?"))return; try{ await biltia.remove("materials",id); S.materials=S.materials.filter(function(x){return x.id!==id;}); biltia.notify("Article supprimé"); closeModal(); render(); }catch(e){} }

/* ── Matériau : éditeur ── */
function openMatEdit(id){
  var m=id?findIn(S.materials,id):null;
  S.edit = m? { id:m.id, nom:m.nom||"", reference:m.reference||"", categorie:m.categorie||"", quantite:(m.quantite!=null?numV(m.quantite):0), unite:m.unite||"u", seuil_alerte:(m.seuil_alerte!=null?numV(m.seuil_alerte):""), prix_achat_ht:(m.prix_achat_ht!=null?numV(m.prix_achat_ht):""), fournisseur_id:m.fournisseur_id||"", notes:m.notes||"" }
            : { id:null, nom:"", reference:"", categorie:"", quantite:0, unite:"u", seuil_alerte:"", prix_achat_ht:"", fournisseur_id:"", notes:"" };
  var e=S.edit;
  var h='<div class="modal-h"><div><div class="modal-title">'+(id?"Modifier l\\'article":"Nouvel article")+'</div><div class="modal-sub">Matériau / fourniture</div></div><button class="x" onclick="closeModal()">✕</button></div>';
  h+='<div class="fg"><label class="fl">Désignation *</label><input id="m-nom" value="'+esc(e.nom||"")+'" placeholder="Sac de ciment CEM II 35kg…"></div>';
  h+='<div class="fg"><label class="fl">Catégorie</label><input id="m-cat" value="'+esc(e.categorie||"")+'" placeholder="Gros œuvre, Électricité…"><div class="sugg">'+CAT_SUGG.map(function(c){return '<button type="button" onclick="mSetCat(\\''+esc(c).replace(/'/g,"")+'\\')">'+esc(c)+'</button>';}).join("")+'</div></div>';
  h+='<div class="form-row"><div class="fg"><label class="fl">Quantité en stock</label><input id="m-qte" inputmode="decimal" value="'+esc(e.quantite===""?"":qtyLabel(e.quantite))+'" placeholder="0"></div><div class="fg"><label class="fl">Unité</label><div class="seg" id="m-unite">'+UNITES.map(function(u){var on=(e.unite||"u")===u;return '<button type="button" onclick="mSetUnite(\\''+u+'\\')" class="'+(on?"on":"")+'" style="'+(on?"background:var(--gd)":"")+'">'+esc(u)+'</button>';}).join("")+'</div></div></div>';
  h+='<div class="form-row"><div class="fg"><label class="fl">Seuil d\\'alerte</label><input id="m-seuil" inputmode="decimal" value="'+esc(e.seuil_alerte===""?"":qtyLabel(e.seuil_alerte))+'" placeholder="ex : 10"></div><div class="fg"><label class="fl">Prix d\\'achat HT (€)</label><input id="m-prix" inputmode="decimal" value="'+esc(e.prix_achat_ht===""?"":String(e.prix_achat_ht).replace(".",","))+'" placeholder="0"></div></div>';
  h+='<div class="form-row"><div class="fg"><label class="fl">Référence</label><input id="m-ref" value="'+esc(e.reference||"")+'" placeholder="Réf. fournisseur"></div><div class="fg"><label class="fl">Fournisseur</label><select id="m-sup" onchange="mSupChange(this.value)">'+optSuppliers(e.fournisseur_id)+'</select></div></div>';
  h+='<div class="fg"><label class="fl">Notes</label><textarea id="m-notes" placeholder="Emplacement, conditionnement…">'+esc(e.notes||"")+'</textarea></div>';
  h+='<div class="modal-actions"><button class="btn btn-primary" id="m-save" onclick="matSave()">'+(id?"Enregistrer":"Ajouter")+'</button></div>';
  h+=(id?'<div style="margin-top:10px"><button class="btn btn-danger" style="width:100%" onclick="matDel(\\''+id+'\\')">Supprimer</button></div>':'');
  openModal(h);
}
function mSetCat(c){ if($("m-cat"))$("m-cat").value=c; if(S.edit)S.edit.categorie=c; }
function mSetUnite(u){ S.edit.unite=u; var b=document.querySelectorAll("#m-unite button"); for(var i=0;i<UNITES.length;i++)if(b[i]){var on=UNITES[i]===u;b[i].className=on?"on":"";b[i].style.background=on?"var(--gd)":"";} }
function mSupChange(v){ if(v==="__new"){ newSupplierInline("m-sup"); return; } if(S.edit)S.edit.fournisseur_id=v; }
async function matSave(){
  var e=S.edit;
  if($("m-nom"))e.nom=$("m-nom").value; if($("m-cat"))e.categorie=$("m-cat").value; if($("m-qte"))e.quantite=$("m-qte").value; if($("m-seuil"))e.seuil_alerte=$("m-seuil").value; if($("m-prix"))e.prix_achat_ht=$("m-prix").value; if($("m-ref"))e.reference=$("m-ref").value; if($("m-sup")&&$("m-sup").value!=="__new")e.fournisseur_id=$("m-sup").value; if($("m-notes"))e.notes=$("m-notes").value;
  if(!String(e.nom||"").trim()){ var el=$("m-nom"); if(el){el.classList.add("invalid");el.focus();} return; }
  var payload={ nom:String(e.nom).trim(), reference:e.reference||null, categorie:e.categorie||null, quantite:numV(e.quantite), unite:e.unite||"u", seuil_alerte:e.seuil_alerte!==""&&e.seuil_alerte!=null?numV(e.seuil_alerte):null, prix_achat_ht:e.prix_achat_ht!==""&&e.prix_achat_ht!=null?numV(e.prix_achat_ht):null, fournisseur_id:e.fournisseur_id||null, statut:"disponible", notes:e.notes||null };
  var b=$("m-save"); if(b){b.disabled=true;b.textContent="Enregistrement…";}
  try{
    if(e.id){ var up=await biltia.update("materials",e.id,payload); for(var i=0;i<S.materials.length;i++)if(S.materials[i].id===e.id)S.materials[i]=up; biltia.notify("Article enregistré"); }
    else { var row=await biltia.create("materials",payload); S.materials.push(row); biltia.notify("Article ajouté"); }
    S.materials.sort(function(a,b){return String(a.nom||"").localeCompare(String(b.nom||""));});
    closeModal(); render();
  }catch(err){ if(b){b.disabled=false;b.textContent=e.id?"Enregistrer":"Ajouter";} biltia.notify("Enregistrement impossible"); }
}

/* ── Fournisseur : détail ── */
function openSupD(id){
  var s=findIn(S.suppliers,id); if(!s)return;
  var mats=S.materials.filter(function(m){return m.fournisseur_id===s.id;}); var need=mats.filter(function(m){return stockLevel(m).sev>=1;});
  var h='<div class="modal-h"><div style="display:flex;align-items:center;gap:12px;min-width:0"><span class="mini-av" style="width:40px;height:40px;background:'+avc(s.nom)+'">'+esc(initials(s.nom))+'</span><div style="min-width:0"><div class="modal-title" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(s.nom)+'</div><div class="modal-sub">'+esc(s.specialite||"Fournisseur")+(s.ville?" · "+esc(s.ville):"")+'</div></div></div><button class="x" onclick="closeModal()">✕</button></div>';
  h+='<div class="kv">';
  if(s.email)h+='<div><div class="k">Email</div><div class="v"><a href="mailto:'+esc(s.email)+'">'+esc(s.email)+'</a></div></div>';
  if(s.tel)h+='<div><div class="k">Téléphone</div><div class="v">'+esc(s.tel)+'</div></div>';
  if(s.ville||s.code_postal)h+='<div><div class="k">Ville</div><div class="v">'+esc([s.code_postal,s.ville].filter(Boolean).join(" "))+'</div></div>';
  if(s.siret)h+='<div><div class="k">SIRET</div><div class="v">'+esc(s.siret)+'</div></div>';
  h+='<div><div class="k">Articles</div><div class="v">'+mats.length+(need.length?' · '+need.length+' à commander':'')+'</div></div>';
  h+='</div>';
  if(s.notes)h+='<div class="fg"><div class="k" style="font-size:10.5px;color:var(--faint);font-weight:700;text-transform:uppercase;letter-spacing:.06em">Notes</div><div class="v" style="font-size:14px;font-weight:500;margin-top:2px;color:var(--mut)">'+esc(s.notes)+'</div></div>';
  h+='<div class="modal-actions">';
  if(need.length&&s.email)h+='<button class="btn btn-primary" onclick="commanderSupplier(\\''+s.id+'\\')">Commander ('+need.length+')</button>';
  h+='<button class="btn btn-ghost" onclick="openSup(\\''+s.id+'\\')">Modifier</button></div>';
  h+='<div style="margin-top:10px"><button class="btn btn-danger" style="width:100%" onclick="supDel(\\''+s.id+'\\')">Supprimer</button></div>';
  openModal(h);
}
async function supDel(id){ if(!confirm("Supprimer ce fournisseur ? Les articles liés ne seront pas supprimés."))return; try{ await biltia.remove("suppliers",id); S.suppliers=S.suppliers.filter(function(x){return x.id!==id;}); biltia.notify("Fournisseur supprimé"); closeModal(); render(); }catch(e){} }

/* ── Fournisseur : éditeur ── */
function openSup(id){
  var s=id?findIn(S.suppliers,id):null;
  S.edit = s? { id:s.id, nom:s.nom||"", specialite:s.specialite||"", email:s.email||"", tel:s.tel||"", ville:s.ville||"", code_postal:s.code_postal||"", siret:s.siret||"", notes:s.notes||"" }
            : { id:null, nom:"", specialite:"", email:"", tel:"", ville:"", code_postal:"", siret:"", notes:"" };
  var e=S.edit;
  var h='<div class="modal-h"><div><div class="modal-title">'+(id?"Modifier le fournisseur":"Nouveau fournisseur")+'</div><div class="modal-sub">Négoce / fournisseur</div></div><button class="x" onclick="closeModal()">✕</button></div>';
  h+='<div class="fg"><label class="fl">Nom / raison sociale *</label><input id="s-nom" value="'+esc(e.nom||"")+'" placeholder="Point P, Rexel, Cedeo…"></div>';
  h+='<div class="fg"><label class="fl">Spécialité</label><input id="s-spec" value="'+esc(e.specialite||"")+'" placeholder="Matériaux, électricité, plomberie…"></div>';
  h+='<div class="form-row"><div class="fg"><label class="fl">Email</label><input id="s-email" inputmode="email" value="'+esc(e.email||"")+'"></div><div class="fg"><label class="fl">Téléphone</label><input id="s-tel" inputmode="tel" value="'+esc(e.tel||"")+'"></div></div>';
  h+='<div class="form-row"><div class="fg"><label class="fl">Code postal</label><input id="s-cp" inputmode="numeric" value="'+esc(e.code_postal||"")+'"></div><div class="fg"><label class="fl">Ville</label><input id="s-ville" value="'+esc(e.ville||"")+'"></div></div>';
  h+='<div class="fg"><label class="fl">SIRET</label><input id="s-siret" inputmode="numeric" value="'+esc(e.siret||"")+'"></div>';
  h+='<div class="fg"><label class="fl">Notes</label><textarea id="s-notes" placeholder="Conditions, remises, contact…">'+esc(e.notes||"")+'</textarea></div>';
  h+='<div class="modal-actions"><button class="btn btn-primary" id="s-save" onclick="supSave()">'+(id?"Enregistrer":"Ajouter")+'</button></div>';
  h+=(id?'<div style="margin-top:10px"><button class="btn btn-danger" style="width:100%" onclick="supDel(\\''+id+'\\')">Supprimer</button></div>':'');
  openModal(h);
}
async function supSave(){
  var e=S.edit;
  ["nom","spec","email","tel","ville","siret","notes"].forEach(function(f){var id="s-"+f;var el=$(id);if(el){var key=f==="spec"?"specialite":f;e[key]=el.value;}}); if($("s-cp"))e.code_postal=$("s-cp").value;
  if(!String(e.nom||"").trim()){ var el=$("s-nom"); if(el){el.classList.add("invalid");el.focus();} return; }
  var payload={ nom:String(e.nom).trim(), categorie:"fournisseur", specialite:e.specialite||null, email:e.email||null, tel:e.tel||null, ville:e.ville||null, code_postal:e.code_postal||null, siret:e.siret||null, notes:e.notes||null };
  var b=$("s-save"); if(b){b.disabled=true;b.textContent="Enregistrement…";}
  try{
    if(e.id){ var up=await biltia.update("suppliers",e.id,payload); for(var i=0;i<S.suppliers.length;i++)if(S.suppliers[i].id===e.id)S.suppliers[i]=up; biltia.notify("Fournisseur enregistré"); }
    else { var row=await biltia.create("suppliers",payload); S.suppliers.push(row); biltia.notify("Fournisseur ajouté"); }
    S.suppliers.sort(function(a,b){return String(a.nom).localeCompare(String(b.nom));});
    closeModal(); render();
  }catch(err){ if(b){b.disabled=false;b.textContent=e.id?"Enregistrer":"Ajouter";} biltia.notify("Enregistrement impossible"); }
}

/* ── Modale ── */
function openModal(html){ $("modal").innerHTML=html; $("ovl").hidden=false; $("modal").scrollTop=0; }
function closeModal(){ $("ovl").hidden=true; $("modal").innerHTML=""; S.edit=null; }
document.addEventListener("click",function(e){ if(e.target&&e.target.id==="ovl")closeModal(); });

/* ── Init ── */
function initBrand(){ if(!S.entreprise||S.entreprise.indexOf("__")===0)S.entreprise="Mon entreprise"; var eb=S.entreprise.toUpperCase().slice(0,22); ["side-eyebrow","hd-eyebrow","tb-eyebrow"].forEach(function(i){var el=$(i);if(el)el.textContent=eb;}); ["side-logo","hd-logo"].forEach(function(i){var el=$(i);if(el)el.textContent=initials(S.entreprise)||"B";}); }
var _rz;
function start(){ initBrand(); renderNav(); boot(); if(window.addEventListener)window.addEventListener("resize",function(){ if(_rz)clearTimeout(_rz); _rz=setTimeout(function(){ if(S.view==="stock")render(); },200); }); }
if(document.readyState!=="loading"){ start(); } else { document.addEventListener("DOMContentLoaded",start); }
${CHART_ENGINE_JS}
</script>
</body>
</html>`;
