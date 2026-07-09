// ─────────────────────────────────────────────────────────────────────────────
// APP PHARE — SOUS-TRAITANCE & CONFORMITÉ (registre de conformité, layout distinct)
//
// 7e app phare. Layout à part : un COCKPIT DE CONFORMITÉ — la couleur de marque est
// NEUTRE (ardoise/slate) pour que les SIGNAUX (vert conforme / ambre à renouveler /
// rouge expiré) ressortent. Alertes J-30 sur l'assurance décennale, relance email,
// registre partenaires, échéances. Identité ARDOISE #334155 (≠ indigo/violet/teal/
// orange/bleu/rose). 3 vues : Conformité · Partenaires · Échéances.
//
// Entité workspace : suppliers { nom, categorie (fournisseur|sous_traitant), siret,
// type, specialite, email, tel, adresse, ville, code_postal, assurance_decennale,
// assurance_expire (AAAA-MM-JJ, alerte J-30), notes }. SDK injecté à l'instanciation.
// Contrainte : PAS de template literals NI de backticks dans le JS de l'app.
// ─────────────────────────────────────────────────────────────────────────────

import { CHART_CSS, CHART_ENGINE_JS } from "@/lib/app-charts";

export const APP_SOUSTRAITANCE_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Sous-traitance & conformité</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
img,svg{max-width:100%}
:root{--bg:#F3F5F8;--ink:#0F172A;--mut:#64748B;--faint:#94A3B8;--line:#E2E8F0;--soft:#EEF1F5;
--sl:#334155;--grad:#334155;--glow:51,65,85;--tint:#EEF2F6;--tintline:#CBD5E1;
--ok:#059669;--warn:#D97706;--bad:#E11D48;
--shadow:0 1px 2px rgba(15,23,42,.04),0 6px 18px rgba(15,23,42,.06);--shadow-lg:0 14px 44px rgba(15,23,42,.16)}
body{background:var(--bg);font-family:'Inter',system-ui,sans-serif;color:var(--ink);font-size:14px;line-height:1.55;-webkit-font-smoothing:antialiased;overflow-x:hidden;overflow-wrap:break-word}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:none;cursor:pointer;font-family:inherit;font-weight:600;transition:all .18s;border-radius:12px;white-space:nowrap;font-size:13px;padding:10px 18px}
.btn:active{transform:scale(.97)}
.btn svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}
.btn-primary{background:var(--grad);color:#fff;box-shadow:0 4px 12px rgba(var(--glow),.22)}
.btn-primary:hover{box-shadow:0 6px 18px rgba(var(--glow),.30)}
.btn-ghost{background:#fff;color:var(--ink);border:1px solid var(--line)}
.btn-ghost:hover{border-color:var(--tintline);box-shadow:0 4px 14px rgba(var(--glow),.10)}
.btn-warn{background:#FFFBEB;color:#B45309;border:1px solid #FDE68A}
.btn-warn:hover{background:#FEF3C7}
.btn-danger{background:#FFF1F2;color:#E11D48;border:1px solid #FECDD3;padding:8px 14px;font-size:12px;border-radius:10px}
.btn-sm{padding:8px 14px;font-size:12px;border-radius:10px}
.badge{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:9999px;font-size:11px;font-weight:600;white-space:nowrap}
.badge-green{background:#ECFDF5;color:#059669;border:1px solid #A7F3D0}
.badge-amber{background:#FFFBEB;color:#B45309;border:1px solid #FDE68A}
.badge-red{background:#FFF1F2;color:#E11D48;border:1px solid #FECDD3}
.badge-gray{background:#F1F5F9;color:#64748B;border:1px solid #E2E8F0}
input,select,textarea{font-family:inherit;font-size:16px;color:var(--ink);background:#fff;border:1px solid #D6DEE8;border-radius:12px;padding:10px 14px;width:100%;outline:none;transition:border .15s,box-shadow .15s}
input:focus,select:focus,textarea:focus{border-color:var(--sl);box-shadow:0 0 0 3px rgba(var(--glow),.14)}
input::placeholder,textarea::placeholder{color:#94A3B8}
input.invalid,select.invalid{border-color:#E11D48;box-shadow:0 0 0 3px rgba(225,29,72,.12)}
textarea{resize:vertical;min-height:70px}
.shell{display:flex;min-height:100vh}
.sidebar{display:none}
.app-main{flex:1;min-width:0;padding:0 0 90px}
.app-header{position:fixed;top:0;left:0;right:0;z-index:100;background:rgba(243,245,248,.85);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-bottom:1px solid var(--line);height:60px;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 14px}
.brand{display:flex;align-items:center;gap:10px;min-width:0}
.brand-logo{width:30px;height:30px;border-radius:9px;background:var(--grad);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:14px;flex-shrink:0}
.app-eyebrow{font-size:10px;font-weight:700;color:var(--sl);text-transform:uppercase;letter-spacing:.12em;display:block;line-height:1.2}
.app-title{font-size:15px;font-weight:800;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px;line-height:1.2}
.mtop{height:60px}
.tab-bar{position:fixed;bottom:0;left:0;right:0;background:rgba(243,245,248,.94);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-top:1px solid var(--line);display:flex;z-index:100}
.tab-item{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:8px 4px 10px;cursor:pointer;border:none;background:none;font-size:10px;font-weight:600;color:#94A3B8;font-family:inherit;min-height:56px}
.tab-item.active{color:var(--sl)}
.tab-ic{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.fab{position:fixed;right:16px;bottom:78px;z-index:120;width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;color:#fff;font-size:28px;line-height:1;background:var(--grad);box-shadow:0 8px 22px rgba(var(--glow),.28);display:flex;align-items:center;justify-content:center}
.fab:active{transform:scale(.94)}
.view-pad{padding:16px}
.topbar{display:none}
.section-h{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:20px 2px 12px}
.section-h b{font-size:15px;font-weight:700}
.empty{text-align:center;padding:48px 20px}
.empty-ico{width:54px;height:54px;border-radius:16px;background:var(--tint);color:var(--sl);display:flex;align-items:center;justify-content:center;margin:0 auto 14px;font-size:24px}
.empty-title{font-weight:700;margin-bottom:4px}
.empty-sub{font-size:13px;color:var(--mut);margin-bottom:16px}
.spin{width:26px;height:26px;border:3px solid var(--line);border-top-color:var(--sl);border-radius:50%;animation:sp .7s linear infinite;margin:60px auto}
@keyframes sp{to{transform:rotate(360deg)}}
.mini-av{width:34px;height:34px;border-radius:10px;font-size:12px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;flex-shrink:0}
/* ── Ruban de conformité ── */
.ribbon{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:18px}
@media(max-width:560px){.ribbon{grid-template-columns:1fr}}
.rib{background:#fff;border:1px solid var(--line);border-radius:16px;padding:14px 16px;box-shadow:var(--shadow);border-left:4px solid var(--line);display:flex;align-items:center;gap:12px}
.rib .rib-n{font-size:26px;font-weight:800;letter-spacing:-.02em;line-height:1;font-variant-numeric:tabular-nums}
.rib .rib-l{font-size:12px;color:var(--mut);font-weight:600}
.rib.ok{border-left-color:var(--ok)}.rib.ok .rib-n{color:var(--ok)}
.rib.warn{border-left-color:var(--warn)}.rib.warn .rib-n{color:var(--warn)}
.rib.bad{border-left-color:var(--bad)}.rib.bad .rib-n{color:var(--bad)}
.rib-ic{width:38px;height:38px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
/* ── Alerte ── */
.alert{display:flex;align-items:center;gap:12px;background:#fff;border:1px solid var(--line);border-radius:14px;padding:12px 14px;box-shadow:var(--shadow);margin-bottom:10px;cursor:pointer;border-left:4px solid var(--line);transition:all .15s}
.alert:hover{box-shadow:0 6px 18px rgba(15,23,42,.08);border-color:var(--tintline)}
.al-main{min-width:0;flex:1}
.al-main .n{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.al-main .s{font-size:12px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.al-days{font-size:12px;font-weight:700;white-space:nowrap;text-align:right;flex-shrink:0}
/* ── Cartes / listes ── */
.grid-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,290px),1fr));gap:12px}
.mcard{background:#fff;border:1px solid var(--line);border-radius:16px;padding:16px;box-shadow:var(--shadow);cursor:pointer;text-align:left;width:100%}
.mcard:hover{box-shadow:0 6px 20px rgba(15,23,42,.08);border-color:var(--tintline)}
.chips{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
.chip{border:1px solid var(--line);background:#fff;color:var(--mut);font-weight:600;font-size:12.5px;padding:7px 14px;border-radius:9999px;cursor:pointer;font-family:inherit}
.chip.on{background:var(--sl);color:#fff;border-color:transparent}
.searchbar{position:relative;margin-bottom:14px}
.searchbar input{padding-left:38px}
.searchbar svg{position:absolute;left:13px;top:50%;transform:translateY(-50%);width:16px;height:16px;fill:none;stroke:var(--faint);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.grp-h{font-size:11px;font-weight:700;color:var(--faint);text-transform:uppercase;letter-spacing:.08em;margin:18px 2px 10px;display:flex;align-items:center;gap:8px}
.grp-h .dot{width:8px;height:8px;border-radius:50%}
/* ── Détail ── */
.stban{border-radius:14px;padding:14px 16px;margin-bottom:16px;color:#fff}
.stban b{display:block;font-size:15px;font-weight:800}
.stban span{font-size:12.5px;opacity:.9}
.kv{display:grid;grid-template-columns:1fr 1fr;gap:14px 16px;margin-bottom:6px}
@media(max-width:460px){.kv{grid-template-columns:1fr}}
.kv .k{font-size:10.5px;color:var(--faint);font-weight:700;text-transform:uppercase;letter-spacing:.06em}
.kv .v{font-size:14px;font-weight:600;margin-top:2px;word-break:break-word}
.kv .v a{color:var(--sl);text-decoration:none}
/* Modale + wizard */
.overlay{position:fixed;inset:0;background:rgba(15,23,42,.44);backdrop-filter:blur(6px);z-index:200;display:flex;align-items:flex-end;justify-content:center}
.overlay[hidden]{display:none}
@media(min-width:600px){.overlay{align-items:center;padding:20px}}
.modal{background:#fff;border-radius:24px 24px 0 0;width:100%;max-width:540px;max-height:92vh;overflow-y:auto;padding:22px 20px calc(22px + env(safe-area-inset-bottom));box-shadow:var(--shadow-lg)}
@media(min-width:600px){.modal{border-radius:24px}}
.modal-h{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px}
.modal-title{font-size:18px;font-weight:800;letter-spacing:-.01em}
.modal-sub{font-size:12.5px;color:var(--mut);margin-top:2px}
.x{border:none;background:var(--soft);width:34px;height:34px;border-radius:10px;color:var(--mut);font-size:18px;cursor:pointer;flex-shrink:0}
.steps{display:flex;gap:6px;margin-bottom:16px}
.steps i{flex:1;height:4px;border-radius:2px;background:var(--line)}
.steps i.on{background:var(--sl)}
.fg{margin-bottom:14px}
.fl{display:block;font-size:11px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media(max-width:480px){.form-row{grid-template-columns:1fr}}
.seg{display:flex;flex-wrap:wrap;gap:6px}
.seg button{border:1px solid var(--line);background:#fff;color:var(--mut);font-weight:600;font-size:12px;padding:8px 12px;border-radius:10px;cursor:pointer;font-family:inherit}
.seg button.on{color:#fff;border-color:transparent}
.modal-actions{display:flex;gap:10px;margin-top:20px;flex-wrap:wrap}
.modal-actions .btn{flex:1}
@media(min-width:860px){
  .app-header,.mtop,.tab-bar,.fab{display:none}
  .sidebar{display:flex;flex-direction:column;width:236px;flex-shrink:0;position:sticky;top:0;height:100vh;border-right:1px solid var(--line);background:#fff;padding:20px 14px}
  .side-brand{display:flex;align-items:center;gap:11px;padding:6px 8px 20px}
  .side-nav{display:flex;flex-direction:column;gap:3px}
  .side-item{display:flex;align-items:center;gap:11px;padding:10px 12px;border-radius:11px;border:none;background:none;cursor:pointer;font-family:inherit;font-size:13.5px;font-weight:600;color:var(--mut);text-align:left;width:100%}
  .side-item:hover{background:var(--soft);color:var(--ink)}
  .side-item.active{background:var(--tint);color:var(--sl)}
  .side-item svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}
  .app-main{padding:0 0 40px}
  .topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:26px 32px 6px}
  .view-pad{padding:16px 32px}
}
@media(max-width:400px){.view-pad{padding:13px}.app-title{max-width:130px}.btn{padding:11px 15px}}
@media(min-width:1600px){.topbar,.view-pad{max-width:1520px;margin-left:auto;margin-right:auto}}
@media print{.sidebar,.app-header,.tab-bar,.fab,.no-print{display:none!important}}
${CHART_CSS}
</style>
</head>
<body>
<div class="shell">
  <aside class="sidebar">
    <div class="side-brand"><span class="brand-logo" id="side-logo">B</span><div style="min-width:0"><span class="app-eyebrow" id="side-eyebrow">BILTIA</span><span class="app-title" id="side-title">Conformité</span></div></div>
    <nav class="side-nav" id="side-nav"></nav>
  </aside>
  <div class="app-main">
    <header class="app-header">
      <div class="brand"><span class="brand-logo" id="hd-logo">B</span><div style="min-width:0"><span class="app-eyebrow" id="hd-eyebrow">BILTIA</span><span class="app-title">Conformité</span></div></div>
      <button class="btn btn-primary btn-sm" id="hd-add" onclick="primaryAdd()">+ Ajouter</button>
    </header>
    <div class="mtop"></div>
    <div class="topbar">
      <div><span class="app-eyebrow" id="tb-eyebrow">BILTIA</span><div id="tb-title" style="font-size:22px;font-weight:800;letter-spacing:-.02em">Conformité</div></div>
      <button class="btn btn-primary" id="tb-add" onclick="primaryAdd()">+ Ajouter un partenaire</button>
    </div>
    <main id="view"><div class="spin"></div></main>
  </div>
</div>
<nav class="tab-bar" id="tab-bar"></nav>
<button class="fab" onclick="primaryAdd()" aria-label="Ajouter">+</button>
<div class="overlay" id="ovl" hidden><div class="modal" id="modal"></div></div>

<script>
var S={ view:"conformite", suppliers:[], entreprise:"__ENTREPRISE__", filter:"tous", q:"", edit:null, wizStep:1 };
var $=function(id){return document.getElementById(id);};
function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
function pad2(n){return String(n).padStart(2,"0");}
function todayISO(){var d=new Date();return d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate());}
function initials(s){var w=String(s||"?").trim().split(/\\s+/);return ((w[0]||"?")[0]+(w[1]?w[1][0]:"")).toUpperCase();}
var AV=["#334155","#0F766E","#7C3AED","#B45309","#0284C7","#BE185D","#1D4ED8","#047857"];
function avc(seed){var s=String(seed||""),h=0;for(var i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;return AV[h%AV.length];}
var ML=["janv.","févr.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc."];
function frDate(iso){ if(!iso)return "—"; var d=new Date(String(iso).slice(0,10)); return pad2(d.getDate())+"/"+pad2(d.getMonth()+1)+"/"+d.getFullYear(); }
function daysLeft(iso){ if(!iso)return null; var d=new Date(String(iso).slice(0,10)),t=new Date(todayISO()); return Math.round((d-t)/86400000); }
function findSup(id){for(var i=0;i<S.suppliers.length;i++)if(S.suppliers[i].id===id)return S.suppliers[i];return null;}
var CATL={ sous_traitant:"Sous-traitant", fournisseur:"Fournisseur" };
function confStatus(s){
  if(s.categorie!=="sous_traitant"){ return {key:"fournisseur",label:"Fournisseur",badge:"badge-gray",col:"#94A3B8",cls:"",sev:-1}; }
  if(!s.assurance_decennale||!s.assurance_expire){ return {key:"manquant",label:"Décennale manquante",badge:"badge-red",col:"#E11D48",cls:"bad",sev:2}; }
  var dl=daysLeft(s.assurance_expire);
  if(dl<0)return {key:"expire",label:"Assurance expirée",badge:"badge-red",col:"#E11D48",cls:"bad",sev:2,dl:dl};
  if(dl<=30)return {key:"renouveler",label:"À renouveler",badge:"badge-amber",col:"#D97706",cls:"warn",sev:1,dl:dl};
  return {key:"conforme",label:"Conforme",badge:"badge-green",col:"#059669",cls:"ok",sev:0,dl:dl};
}
function daysLabel(dl){ if(dl==null)return ""; if(dl<0)return "expiré depuis "+(-dl)+" j"; if(dl===0)return "expire aujourd\\'hui"; return "expire dans "+dl+" j"; }

var NAV=[
  {id:"conformite",label:"Conformité",icon:'<path d="M12 3l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/>'},
  {id:"partenaires",label:"Partenaires",icon:'<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9.5 10h.01"/><path d="M14.5 10h.01"/><path d="M9.5 14h.01"/><path d="M14.5 14h.01"/>'},
  {id:"echeances",label:"Échéances",icon:'<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18"/><path d="M8 2v4"/><path d="M16 2v4"/><path d="M12 13v3l2 1"/>'}
];

async function boot(){
  try{
    S.suppliers=(await biltia.list("suppliers",{order:"nom",ascending:true,limit:1000}).catch(function(){return[];}))||[];
    renderNav(); render();
  }catch(e){ $("view").innerHTML='<div class="view-pad"><div class="empty"><div class="empty-ico">⚠️</div><div class="empty-title">Connexion au workspace impossible</div><div class="empty-sub">Vérifiez votre connexion puis rouvrez l\\'application.</div></div></div>'; }
}
function renderNav(){
  $("side-nav").innerHTML=NAV.map(function(n){return '<button class="side-item'+(S.view===n.id?" active":"")+'" onclick="go(\\''+n.id+'\\')"><svg viewBox="0 0 24 24">'+n.icon+'</svg><span>'+n.label+'</span></button>';}).join("");
  $("tab-bar").innerHTML=NAV.map(function(n){return '<button class="tab-item'+(S.view===n.id?" active":"")+'" onclick="go(\\''+n.id+'\\')"><svg class="tab-ic" viewBox="0 0 24 24">'+n.icon+'</svg><span>'+n.label+'</span></button>';}).join("");
}
function go(v){ S.view=v; renderNav(); render(); try{window.scrollTo(0,0);}catch(e){} }
function primaryAdd(){ openWizard(null); }
function render(){
  var titles={conformite:"Conformité",partenaires:"Partenaires",echeances:"Échéances"};
  $("tb-title").textContent=titles[S.view]||"";
  if(S.view==="conformite") renderConformite();
  else if(S.view==="partenaires") renderPartenaires();
  else renderEcheances();
}
function subs(){ return S.suppliers.filter(function(s){return s.categorie==="sous_traitant";}); }

/* ── Vue : Conformité ── */
function monthsAhead(n){ var out=[],d=new Date(todayISO()); d.setDate(1); for(var i=0;i<n;i++){ out.push({key:d.getFullYear()+"-"+pad2(d.getMonth()+1),label:ML[d.getMonth()].replace(".","")}); d.setMonth(d.getMonth()+1); } return out; }
function renderConformite(){
  var st=subs(), nOk=0,nWarn=0,nBad=0;
  st.forEach(function(s){var c=confStatus(s);if(c.sev===0)nOk++;else if(c.sev===1)nWarn++;else if(c.sev===2)nBad++;});
  var alerts=st.map(function(s){return {s:s,c:confStatus(s)};}).filter(function(x){return x.c.sev>=1;})
    .sort(function(a,b){ if(b.c.sev!==a.c.sev)return b.c.sev-a.c.sev; var da=a.c.dl==null?9999:a.c.dl,db=b.c.dl==null?9999:b.c.dl; return da-db; });
  var h='<div class="view-pad">';
  h+='<div class="ribbon">'
    +'<div class="rib ok"><span class="rib-ic" style="background:#ECFDF5;color:#059669">✓</span><div><div class="rib-n">'+nOk+'</div><div class="rib-l">Conformes</div></div></div>'
    +'<div class="rib warn"><span class="rib-ic" style="background:#FFFBEB;color:#B45309">⏳</span><div><div class="rib-n">'+nWarn+'</div><div class="rib-l">À renouveler (30 j)</div></div></div>'
    +'<div class="rib bad"><span class="rib-ic" style="background:#FFF1F2;color:#E11D48">!</span><div><div class="rib-n">'+nBad+'</div><div class="rib-l">Non conformes</div></div></div>'
    +'</div>';
  h+='<div class="chart-card" style="margin-bottom:18px"><div class="chart-hd"><b>Assurances qui expirent</b><span class="rd" id="rd-ech">6 mois à venir</span></div><div class="chart-host" id="ch-ech"></div></div>';
  h+='<div class="section-h"><b>À traiter en priorité</b>'+(alerts.length?'<span class="badge badge-red">'+alerts.length+'</span>':'')+'</div>';
  if(!alerts.length){
    h+='<div class="alert" style="border-left-color:var(--ok);cursor:default"><span class="mini-av" style="background:#ECFDF5;color:#059669">✓</span><div class="al-main"><div class="n">Tout est à jour</div><div class="s">Aucune assurance décennale à renouveler dans les 30 jours.</div></div></div>';
  } else {
    h+=alerts.map(function(x){ var s=x.s,c=x.c;
      return '<div class="alert" style="border-left-color:'+c.col+'" onclick="openSupplier(\\''+s.id+'\\')"><span class="mini-av" style="background:'+avc(s.nom)+'">'+esc(initials(s.nom))+'</span>'
        +'<div class="al-main"><div class="n">'+esc(s.nom)+'</div><div class="s">'+esc(s.specialite||"Sous-traitant")+' · '+c.label+'</div></div>'
        +'<div class="al-days" style="color:'+c.col+'">'+(c.key==="manquant"?"à fournir":(c.dl!=null?(c.dl<0?"−"+(-c.dl)+" j":c.dl+" j"):""))+'</div></div>';
    }).join("");
  }
  h+='</div>'; $("view").innerHTML=h;
  try{
    var months=monthsAhead(6);
    var series=months.map(function(m){ var n=st.filter(function(s){return String(s.assurance_expire||"").slice(0,7)===m.key;}).length; return {value:n,label:m.label,tip:m.label}; });
    drawBars($("ch-ech"),series,{id:"ech",color:"#D97706",color2:"#FCD34D",fmt:function(v){return Math.round(v)+(Math.round(v)>1?" assurances":" assurance");},rd:"rd-ech",rdDef:"6 mois à venir"});
  }catch(e){}
}

/* ── Vue : Partenaires ── */
function renderPartenaires(){
  var h='<div class="view-pad">';
  h+='<div class="chips">'+[["tous","Tous"],["sous_traitant","Sous-traitants"],["fournisseur","Fournisseurs"]].map(function(o){return '<button class="chip'+(S.filter===o[0]?" on":"")+'" onclick="setFilter(\\''+o[0]+'\\')">'+o[1]+'</button>';}).join("")+'</div>';
  h+='<div class="searchbar"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg><input id="pt-q" placeholder="Rechercher un partenaire, un métier, une ville…" value="'+esc(S.q)+'" oninput="partSearch(this.value)"></div>';
  h+='<div id="pt-results"></div></div>'; $("view").innerHTML=h; renderPartResults();
}
function setFilter(k){ S.filter=k; renderPartenaires(); }
function partSearch(v){ S.q=v; renderPartResults(); }
function renderPartResults(){
  var q=String(S.q||"").toLowerCase().trim();
  var list=S.suppliers.filter(function(s){
    if(S.filter!=="tous"&&s.categorie!==S.filter)return false;
    if(!q)return true;
    return (String(s.nom||"")+" "+String(s.specialite||"")+" "+String(s.ville||"")+" "+String(s.siret||"")).toLowerCase().indexOf(q)>=0;
  });
  var host=$("pt-results"); if(!host)return;
  if(!list.length){ host.innerHTML='<div class="empty"><div class="empty-ico">🔍</div><div class="empty-title">Aucun partenaire</div><div class="empty-sub">'+(S.suppliers.length?"Aucun résultat pour cette recherche.":"Ajoutez vos sous-traitants et fournisseurs.")+'</div><button class="btn btn-primary" onclick="openWizard(null)">+ Ajouter un partenaire</button></div>'; return; }
  host.innerHTML='<div class="section-h" style="margin-top:2px"><b>'+list.length+' partenaire'+(list.length>1?"s":"")+'</b></div><div class="grid-cards">'+list.map(function(s){ var c=confStatus(s);
    return '<button class="mcard" onclick="openSupplier(\\''+s.id+'\\')"><div style="display:flex;align-items:center;gap:12px;margin-bottom:10px"><span class="mini-av" style="background:'+avc(s.nom)+'">'+esc(initials(s.nom))+'</span><div style="min-width:0;flex:1"><div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(s.nom)+'</div><div style="color:var(--mut);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(s.specialite||CATL[s.categorie]||"Partenaire")+'</div></div></div>'
      +'<div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><span class="badge badge-gray">'+esc(CATL[s.categorie]||"Partenaire")+(s.ville?' · '+esc(s.ville):"")+'</span><span class="badge '+c.badge+'">'+c.label+'</span></div></button>';
  }).join("")+'</div>';
}

/* ── Vue : Échéances ── */
function renderEcheances(){
  var st=subs();
  var withDate=st.filter(function(s){return s.assurance_expire;}).map(function(s){return {s:s,dl:daysLeft(s.assurance_expire)};}).sort(function(a,b){return a.dl-b.dl;});
  var missing=st.filter(function(s){return !s.assurance_decennale||!s.assurance_expire;});
  var groups=[
    {t:"Expirées",col:"#E11D48",items:withDate.filter(function(x){return x.dl<0;})},
    {t:"Sous 30 jours",col:"#D97706",items:withDate.filter(function(x){return x.dl>=0&&x.dl<=30;})},
    {t:"Plus tard",col:"#059669",items:withDate.filter(function(x){return x.dl>30;})}
  ];
  var h='<div class="view-pad">';
  if(missing.length){
    h+='<div class="grp-h"><span class="dot" style="background:#E11D48"></span>Décennale manquante</div>';
    h+=missing.map(function(s){ return '<div class="alert" style="border-left-color:#E11D48" onclick="openSupplier(\\''+s.id+'\\')"><span class="mini-av" style="background:'+avc(s.nom)+'">'+esc(initials(s.nom))+'</span><div class="al-main"><div class="n">'+esc(s.nom)+'</div><div class="s">'+esc(s.specialite||"Sous-traitant")+'</div></div><div class="al-days" style="color:#E11D48">à fournir</div></div>'; }).join("");
  }
  var any=missing.length>0;
  groups.forEach(function(g){ if(!g.items.length)return; any=true;
    h+='<div class="grp-h"><span class="dot" style="background:'+g.col+'"></span>'+g.t+' <span style="color:var(--faint)">('+g.items.length+')</span></div>';
    h+=g.items.map(function(x){ var s=x.s;
      return '<div class="alert" style="border-left-color:'+g.col+'" onclick="openSupplier(\\''+s.id+'\\')"><span class="mini-av" style="background:'+avc(s.nom)+'">'+esc(initials(s.nom))+'</span><div class="al-main"><div class="n">'+esc(s.nom)+'</div><div class="s">'+esc(s.specialite||"Sous-traitant")+' · échéance '+frDate(s.assurance_expire)+'</div></div><div class="al-days" style="color:'+g.col+'">'+(x.dl<0?"−"+(-x.dl)+" j":x.dl+" j")+'</div></div>';
    }).join("");
  });
  if(!any){ h+='<div class="empty"><div class="empty-ico">📅</div><div class="empty-title">Aucune échéance</div><div class="empty-sub">Renseignez l\\'assurance décennale de vos sous-traitants pour suivre les échéances.</div><button class="btn btn-primary" onclick="go(\\'partenaires\\')">Voir les partenaires</button></div>'; }
  h+='</div>'; $("view").innerHTML=h;
}

/* ── Détail ── */
function openSupplier(id){
  var s=findSup(id); if(!s)return; var c=confStatus(s);
  var h='<div class="modal-h"><div style="display:flex;align-items:center;gap:12px;min-width:0"><span class="mini-av" style="width:40px;height:40px;background:'+avc(s.nom)+'">'+esc(initials(s.nom))+'</span><div style="min-width:0"><div class="modal-title" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(s.nom)+'</div><div class="modal-sub">'+esc(CATL[s.categorie]||"Partenaire")+(s.specialite?" · "+esc(s.specialite):"")+'</div></div></div><button class="x" onclick="closeModal()">✕</button></div>';
  if(s.categorie==="sous_traitant"){
    h+='<div class="stban" style="background:'+c.col+'"><b>'+c.label+'</b><span>'+(c.key==="manquant"?"Aucune attestation d\\'assurance décennale enregistrée.":("Assurance décennale · échéance "+frDate(s.assurance_expire)+" · "+daysLabel(c.dl)))+'</span></div>';
  }
  h+='<div class="kv">';
  if(s.siret)h+='<div><div class="k">SIRET</div><div class="v">'+esc(s.siret)+'</div></div>';
  if(s.specialite)h+='<div><div class="k">Spécialité</div><div class="v">'+esc(s.specialite)+'</div></div>';
  if(s.email)h+='<div><div class="k">Email</div><div class="v"><a href="mailto:'+esc(s.email)+'">'+esc(s.email)+'</a></div></div>';
  if(s.tel)h+='<div><div class="k">Téléphone</div><div class="v">'+esc(s.tel)+'</div></div>';
  if(s.ville||s.code_postal)h+='<div><div class="k">Ville</div><div class="v">'+esc([s.code_postal,s.ville].filter(Boolean).join(" "))+'</div></div>';
  if(s.categorie==="sous_traitant"&&s.assurance_decennale)h+='<div><div class="k">Décennale</div><div class="v">'+esc(s.assurance_decennale)+'</div></div>';
  h+='</div>';
  if(s.adresse)h+='<div class="fg" style="margin-top:6px"><div class="k" style="font-size:10.5px;color:var(--faint);font-weight:700;text-transform:uppercase;letter-spacing:.06em">Adresse</div><div class="v" style="font-size:14px;font-weight:600;margin-top:2px">'+esc(s.adresse)+'</div></div>';
  if(s.notes)h+='<div class="fg"><div class="k" style="font-size:10.5px;color:var(--faint);font-weight:700;text-transform:uppercase;letter-spacing:.06em">Notes</div><div class="v" style="font-size:14px;font-weight:500;margin-top:2px;color:var(--mut)">'+esc(s.notes)+'</div></div>';
  h+='<div class="modal-actions">';
  if(s.categorie==="sous_traitant"&&s.email&&c.sev>=1)h+='<button class="btn btn-warn" onclick="relance(\\''+s.id+'\\')">Relancer l\\'attestation</button>';
  h+='<button class="btn btn-ghost" onclick="openWizard(\\''+s.id+'\\')">Modifier</button></div>';
  h+='<div style="margin-top:10px"><button class="btn btn-danger" style="width:100%" onclick="supDel(\\''+s.id+'\\')">Supprimer</button></div>';
  openModal(h);
}
async function relance(id){
  var s=findSup(id); if(!s)return; if(!s.email){ biltia.notify("Aucun email pour ce partenaire"); return; }
  var subj="Attestation d\\'assurance décennale à jour";
  var body="Bonjour,\\n\\nDans le cadre de nos obligations, merci de bien vouloir nous transmettre votre attestation d\\'assurance décennale à jour"+(s.assurance_expire?" (la précédente arrive à échéance le "+frDate(s.assurance_expire)+")":"")+".\\n\\nMerci d\\'avance,\\n"+(S.entreprise||"");
  try{ await biltia.sendEmail({to:s.email,subject:subj,body:body}); biltia.notify("Relance envoyée à "+s.nom); closeModal(); }
  catch(e){ biltia.notify("Envoi impossible"); }
}
async function supDel(id){ if(!confirm("Supprimer ce partenaire ?"))return; try{ await biltia.remove("suppliers",id); S.suppliers=S.suppliers.filter(function(x){return x.id!==id;}); biltia.notify("Partenaire supprimé"); closeModal(); render(); }catch(e){} }

/* ── Wizard (2 étapes) ── */
function openWizard(id){
  var s=id?findSup(id):{ nom:"",categorie:"sous_traitant",specialite:"",siret:"",type:"",email:"",tel:"",ville:"",code_postal:"",adresse:"",assurance_decennale:"",assurance_expire:"",notes:"" };
  S.edit=JSON.parse(JSON.stringify(s)); S.wizStep=1; renderWizard();
}
function catSet(k){ S.edit.categorie=k; var btns=document.querySelectorAll("#w-cat button"); var ks=["sous_traitant","fournisseur"]; for(var i=0;i<ks.length;i++){ if(btns[i]){ var on=ks[i]===k; btns[i].className=on?"on":""; btns[i].style.background=on?"var(--sl)":""; } } }
function wizReadStep(){
  var e=S.edit;
  if(S.wizStep===1){ if($("w-nom"))e.nom=$("w-nom").value; if($("w-spec"))e.specialite=$("w-spec").value; if($("w-siret"))e.siret=$("w-siret").value; }
  else { ["email","tel","ville","code_postal","adresse","assurance_decennale","notes"].forEach(function(f){var id="w-"+f.replace("code_postal","cp").replace("assurance_decennale","dec");var el=$(id);if(el)e[f]=el.value;}); if($("w-exp"))e.assurance_expire=$("w-exp").value; }
}
function renderWizard(){
  var e=S.edit, id=e.id, step=S.wizStep, isSub=e.categorie==="sous_traitant";
  var h='<div class="modal-h"><div><div class="modal-title">'+(id?"Modifier le partenaire":"Nouveau partenaire")+'</div><div class="modal-sub">Étape '+step+' sur 2 · '+(step===1?"identité":"contact & assurance")+'</div></div><button class="x" onclick="closeModal()">✕</button></div>';
  h+='<div class="steps"><i class="on"></i><i'+(step===2?" class=\\"on\\"":"")+'></i></div>';
  if(step===1){
    h+='<div class="fg"><label class="fl">Type de partenaire</label><div class="seg" id="w-cat">'+[["sous_traitant","Sous-traitant"],["fournisseur","Fournisseur"]].map(function(o){var on=e.categorie===o[0];return '<button type="button" onclick="catSet(\\''+o[0]+'\\')" class="'+(on?"on":"")+'" style="'+(on?"background:var(--sl)":"")+'">'+o[1]+'</button>';}).join("")+'</div></div>';
    h+='<div class="fg"><label class="fl">Nom / raison sociale *</label><input id="w-nom" value="'+esc(e.nom||"")+'" placeholder="Toiture Pro, Point P…"></div>';
    h+='<div class="fg"><label class="fl">Spécialité / corps de métier</label><input id="w-spec" value="'+esc(e.specialite||"")+'" placeholder="'+(isSub?"Couverture, électricité…":"Matériaux, matériel…")+'"></div>';
    h+='<div class="fg"><label class="fl">SIRET</label><input id="w-siret" inputmode="numeric" value="'+esc(e.siret||"")+'" placeholder="812 456 789 00021"></div>';
    h+='<div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Annuler</button><button class="btn btn-primary" onclick="wizNext()">Suivant</button></div>';
  } else {
    h+='<div class="form-row"><div class="fg"><label class="fl">Email</label><input id="w-email" inputmode="email" value="'+esc(e.email||"")+'"></div><div class="fg"><label class="fl">Téléphone</label><input id="w-tel" inputmode="tel" value="'+esc(e.tel||"")+'"></div></div>';
    h+='<div class="form-row"><div class="fg"><label class="fl">Code postal</label><input id="w-cp" inputmode="numeric" value="'+esc(e.code_postal||"")+'"></div><div class="fg"><label class="fl">Ville</label><input id="w-ville" value="'+esc(e.ville||"")+'"></div></div>';
    h+='<div class="fg"><label class="fl">Adresse</label><input id="w-adresse" value="'+esc(e.adresse||"")+'"></div>';
    if(isSub){
      h+='<div class="form-row"><div class="fg"><label class="fl">Assurance décennale (n° / assureur)</label><input id="w-dec" value="'+esc(e.assurance_decennale||"")+'" placeholder="AXA n°DC-88213"></div><div class="fg"><label class="fl">Expire le</label><input type="date" id="w-exp" value="'+esc(e.assurance_expire||"")+'"></div></div>';
    }
    h+='<div class="fg"><label class="fl">Notes</label><textarea id="w-notes" placeholder="Remarques, conditions…">'+esc(e.notes||"")+'</textarea></div>';
    h+='<div class="modal-actions"><button class="btn btn-ghost" onclick="wizBack()">Retour</button><button class="btn btn-primary" id="w-save" onclick="wizSave()">'+(id?"Enregistrer":"Ajouter")+'</button></div>';
  }
  openModal(h);
}
function wizNext(){ wizReadStep(); if(!String(S.edit.nom||"").trim()){ var el=$("w-nom"); if(el){el.classList.add("invalid");el.focus();} return; } S.wizStep=2; renderWizard(); }
function wizBack(){ wizReadStep(); S.wizStep=1; renderWizard(); }
async function wizSave(){
  wizReadStep(); var e=S.edit;
  if(!String(e.nom||"").trim()){ S.wizStep=1; renderWizard(); return; }
  var payload={ nom:String(e.nom).trim(), categorie:e.categorie||"sous_traitant", specialite:e.specialite||null, siret:e.siret||null, email:e.email||null, tel:e.tel||null, ville:e.ville||null, code_postal:e.code_postal||null, adresse:e.adresse||null, notes:e.notes||null };
  if(e.categorie==="sous_traitant"){ payload.assurance_decennale=e.assurance_decennale||null; payload.assurance_expire=e.assurance_expire||null; }
  var b=$("w-save"); if(b){b.disabled=true;b.textContent="Enregistrement…";}
  try{
    if(e.id){ var up=await biltia.update("suppliers",e.id,payload); for(var i=0;i<S.suppliers.length;i++)if(S.suppliers[i].id===e.id)S.suppliers[i]=up; biltia.notify("Partenaire enregistré"); }
    else { var row=await biltia.create("suppliers",payload); S.suppliers.push(row); biltia.notify("Partenaire ajouté"); }
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
function start(){ initBrand(); renderNav(); boot(); if(window.addEventListener)window.addEventListener("resize",function(){ if(_rz)clearTimeout(_rz); _rz=setTimeout(function(){ if(S.view==="conformite")render(); },200); }); }
if(document.readyState!=="loading"){ start(); } else { document.addEventListener("DOMContentLoaded",start); }
${CHART_ENGINE_JS}
</script>
</body>
</html>`;
