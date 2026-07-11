// ─────────────────────────────────────────────────────────────────────────────
// APP PHARE — CRM / PIPELINE COMMERCIAL (entonnoir de vente, layout distinct)
//
// 8e app phare. Layout à part : un PIPELINE COMMERCIAL — cockpit sombre (valeur du
// pipe qui défile), ENTONNOIR par étape (barres de valeur), graphique interactif des
// affaires gagnées, et un suivi des relances. Centré CLIENT/RELATION (≠ l'app Devis,
// centrée document). Identité ÉMERAUDE #059669 (≠ indigo/violet/teal/orange/bleu/rose/ardoise).
// 3 vues : Pipeline · Clients · À relancer.
//
// Entité workspace : clients { nom, siret, type, email, tel, adresse, ville, code_postal, notes }.
// Le « pipeline » n'a pas d'entité dédiée → collection LIBRE window.biltia('opportunites')
// { client_id, titre, montant, etape (nouveau|contact|proposition|gagne|perdu), source,
// prochaine_action, date_action (AAAA-MM-JJ), notes }. SDK injecté à l'instanciation.
// Contrainte : PAS de template literals NI de backticks dans le JS de l'app.
// ─────────────────────────────────────────────────────────────────────────────

import { CHART_CSS, CHART_ENGINE_JS } from "@/lib/app-charts";

export const APP_CRM_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>CRM — Pipeline commercial</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
img,svg{max-width:100%}
:root{--bg:#F3FAF6;--ink:#0B2318;--mut:#5A6B62;--faint:#93A79B;--line:#DCEDE4;--soft:#EBF6F0;
--em:#059669;--grad:#059669;--glow:5,150,105;--tint:#ECFDF5;--tintline:#A7F3D0;
--shadow:0 1px 2px rgba(11,35,24,.04),0 6px 18px rgba(11,35,24,.05);--shadow-lg:0 14px 44px rgba(11,35,24,.16)}
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
.badge-gray{background:#EEF4F0;color:#5A6B62;border:1px solid #DCEDE4}
input,select,textarea{font-family:inherit;font-size:16px;color:var(--ink);background:#fff;border:1px solid #CFE4D8;border-radius:12px;padding:10px 14px;width:100%;outline:none;transition:border .15s,box-shadow .15s}
input:focus,select:focus,textarea:focus{border-color:var(--em);box-shadow:0 0 0 3px rgba(var(--glow),.14)}
input::placeholder,textarea::placeholder{color:#93A79B}
input.invalid,select.invalid{border-color:#E11D48;box-shadow:0 0 0 3px rgba(225,29,72,.12)}
textarea{resize:vertical;min-height:70px}
.shell{display:flex;min-height:100vh}
.sidebar{display:none}
.app-main{flex:1;min-width:0;padding:0 0 90px}
.app-header{position:fixed;top:0;left:0;right:0;z-index:100;background:rgba(243,250,246,.85);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-bottom:1px solid var(--line);height:60px;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 14px}
.brand{display:flex;align-items:center;gap:10px;min-width:0}
.brand-logo{width:30px;height:30px;border-radius:9px;background:var(--grad);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:14px;flex-shrink:0}
.app-eyebrow{font-size:10px;font-weight:700;color:var(--em);text-transform:uppercase;letter-spacing:.12em;display:block;line-height:1.2}
.app-title{font-size:15px;font-weight:800;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px;line-height:1.2}
.mtop{height:60px}
.tab-bar{position:fixed;bottom:0;left:0;right:0;background:rgba(243,250,246,.94);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-top:1px solid var(--line);display:flex;z-index:100}
.tab-item{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:8px 4px 10px;cursor:pointer;border:none;background:none;font-size:10px;font-weight:600;color:#93A79B;font-family:inherit;min-height:56px}
.tab-item.active{color:var(--em)}
.tab-ic{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.fab{position:fixed;right:16px;bottom:78px;z-index:120;width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;color:#fff;font-size:28px;line-height:1;background:var(--grad);box-shadow:0 8px 22px rgba(var(--glow),.30);display:flex;align-items:center;justify-content:center}
.fab:active{transform:scale(.94)}
.view-pad{padding:16px}
.topbar{display:none}
.section-h{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:20px 2px 12px}
.section-h b{font-size:15px;font-weight:700}
.empty{text-align:center;padding:48px 20px}
.empty-ico{width:54px;height:54px;border-radius:16px;background:var(--tint);color:var(--em);display:flex;align-items:center;justify-content:center;margin:0 auto 14px;font-size:24px}
.empty-title{font-weight:700;margin-bottom:4px}
.empty-sub{font-size:13px;color:var(--mut);margin-bottom:16px}
.spin{width:26px;height:26px;border:3px solid var(--line);border-top-color:var(--em);border-radius:50%;animation:sp .7s linear infinite;margin:60px auto}
@keyframes sp{to{transform:rotate(360deg)}}
.mini-av{width:34px;height:34px;border-radius:10px;font-size:12px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;flex-shrink:0}
/* ── Cockpit ── */
.cockpit{position:relative;margin:0 0 16px;padding:22px;border-radius:22px;background:#082017;color:#fff;overflow:hidden;box-shadow:var(--shadow-lg)}
.cockpit::before{content:"";position:absolute;inset:0;background:radial-gradient(120% 90% at 100% 0,rgba(5,150,105,.42),transparent 60%);pointer-events:none}
.c-label{position:relative;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:rgba(255,255,255,.6)}
.c-value{position:relative;font-size:34px;font-weight:800;letter-spacing:-.02em;line-height:1.15;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.c-sub{position:relative;font-size:12.5px;color:rgba(255,255,255,.72)}
.ck-stats{position:relative;display:flex;gap:26px;margin-top:14px}
.ck-stat b{display:block;font-size:17px;font-weight:800;font-variant-numeric:tabular-nums}
.ck-stat span{font-size:10.5px;color:rgba(255,255,255,.6);font-weight:600;text-transform:uppercase;letter-spacing:.05em}
/* ── Entonnoir ── */
.funnel{background:#fff;border:1px solid var(--line);border-radius:18px;padding:16px 16px 8px;box-shadow:var(--shadow);margin-bottom:16px}
.fn-row{display:flex;align-items:center;gap:12px;padding:10px 0;cursor:pointer}
.fn-row+.fn-row{border-top:1px solid var(--line)}
.fn-dot{width:10px;height:10px;border-radius:3px;flex-shrink:0}
.fn-lbl{font-weight:600;font-size:13px;width:104px;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fn-bar{flex:1;height:10px;border-radius:6px;background:var(--soft);overflow:hidden;min-width:34px}
.fn-bar i{display:block;height:100%;border-radius:6px}
.fn-val{font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap;font-size:13.5px;text-align:right}
.fn-val span{color:var(--mut);font-weight:600;font-size:11px}
/* ── Opportunité (ligne) ── */
.opp{display:flex;align-items:center;gap:12px;background:#fff;border:1px solid var(--line);border-radius:14px;padding:12px 14px;box-shadow:var(--shadow);margin-bottom:10px;cursor:pointer;border-left:4px solid var(--line);transition:all .15s}
.opp:hover{border-color:var(--tintline);box-shadow:0 6px 18px rgba(11,35,24,.08)}
.op-main{min-width:0;flex:1}
.op-main .t{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.op-main .s{font-size:12px;color:var(--mut);display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:2px}
.op-amt{font-size:15px;font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap;flex-shrink:0;text-align:right}
/* ── Cartes clients ── */
.grid-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,290px),1fr));gap:12px}
.mcard{background:#fff;border:1px solid var(--line);border-radius:16px;padding:16px;box-shadow:var(--shadow);cursor:pointer;text-align:left;width:100%}
.mcard:hover{box-shadow:0 6px 20px rgba(11,35,24,.08);border-color:var(--tintline)}
.searchbar{position:relative;margin-bottom:14px}
.searchbar input{padding-left:38px}
.searchbar svg{position:absolute;left:13px;top:50%;transform:translateY(-50%);width:16px;height:16px;fill:none;stroke:var(--faint);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.grp-h{font-size:11px;font-weight:700;color:var(--faint);text-transform:uppercase;letter-spacing:.08em;margin:18px 2px 10px;display:flex;align-items:center;gap:8px}
.grp-h .dot{width:8px;height:8px;border-radius:50%}
.kv{display:grid;grid-template-columns:1fr 1fr;gap:14px 16px;margin-bottom:6px}
@media(max-width:460px){.kv{grid-template-columns:1fr}}
.kv .k{font-size:10.5px;color:var(--faint);font-weight:700;text-transform:uppercase;letter-spacing:.06em}
.kv .v{font-size:14px;font-weight:600;margin-top:2px;word-break:break-word}
.kv .v a{color:var(--em);text-decoration:none}
/* Modale */
.overlay{position:fixed;inset:0;background:rgba(8,32,23,.44);backdrop-filter:blur(6px);z-index:200;display:flex;align-items:flex-end;justify-content:center}
.overlay[hidden]{display:none}
@media(min-width:600px){.overlay{align-items:center;padding:20px}}
.modal{background:#fff;border-radius:24px 24px 0 0;width:100%;max-width:540px;max-height:92vh;overflow-y:auto;padding:22px 20px calc(22px + env(safe-area-inset-bottom));box-shadow:var(--shadow-lg)}
@media(min-width:600px){.modal{border-radius:24px}}
.modal-h{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px}
.modal-title{font-size:18px;font-weight:800;letter-spacing:-.01em}
.modal-sub{font-size:12.5px;color:var(--mut);margin-top:2px}
.x{border:none;background:var(--soft);width:34px;height:34px;border-radius:10px;color:var(--mut);font-size:18px;cursor:pointer;flex-shrink:0}
.fg{margin-bottom:14px}
.fl{display:block;font-size:11px;font-weight:700;color:#5A6B62;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}
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
  .side-item.active{background:var(--tint);color:var(--em)}
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
    <div class="side-brand"><span class="brand-logo" id="side-logo">B</span><div style="min-width:0"><span class="app-eyebrow" id="side-eyebrow">BILTIA</span><span class="app-title" id="side-title">Pipeline</span></div></div>
    <nav class="side-nav" id="side-nav"></nav>
  </aside>
  <div class="app-main">
    <header class="app-header">
      <div class="brand"><span class="brand-logo" id="hd-logo">B</span><div style="min-width:0"><span class="app-eyebrow" id="hd-eyebrow">BILTIA</span><span class="app-title">Pipeline</span></div></div>
      <button class="btn btn-primary btn-sm" id="hd-add" onclick="primaryAdd()">+ Opportunité</button>
    </header>
    <div class="mtop"></div>
    <div class="topbar">
      <div><span class="app-eyebrow" id="tb-eyebrow">BILTIA</span><div id="tb-title" style="font-size:22px;font-weight:800;letter-spacing:-.02em">Pipeline</div></div>
      <button class="btn btn-primary" id="tb-add" onclick="primaryAdd()">+ Nouvelle opportunité</button>
    </div>
    <main id="view"><div class="spin"></div></main>
  </div>
</div>
<nav class="tab-bar" id="tab-bar"></nav>
<button class="fab" onclick="primaryAdd()" aria-label="Ajouter">+</button>
<div class="overlay" id="ovl" hidden><div class="modal" id="modal"></div></div>

<script>
var S={ view:"pipeline", opps:[], clients:[], entreprise:"__ENTREPRISE__", q:"", edit:null };
var $=function(id){return document.getElementById(id);};
function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
function pad2(n){return String(n).padStart(2,"0");}
function todayISO(){var d=new Date();return d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate());}
function initials(s){var w=String(s||"?").trim().split(/\\s+/);return ((w[0]||"?")[0]+(w[1]?w[1][0]:"")).toUpperCase();}
var AV=["#059669","#0EA5E9","#7C3AED","#DB2777","#EA580C","#0D9488","#4F46E5","#B45309"];
function avc(seed){var s=String(seed||""),h=0;for(var i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;return AV[h%AV.length];}
function numV(v){var n=parseFloat(String(v==null?"":v).replace(/\\s/g,"").replace(",","."));return isFinite(n)?n:0;}
function eur(n){return Math.round(numV(n)).toLocaleString("fr-FR")+" €";}
function eurK(n){n=numV(n);return n>=1000?Math.round(n/100)/10+" k€":Math.round(n)+" €";}
function frDate(iso){ if(!iso)return "—"; var d=new Date(String(iso).slice(0,10)); return pad2(d.getDate())+"/"+pad2(d.getMonth()+1)+"/"+d.getFullYear(); }
function daysTo(iso){ if(!iso)return null; var d=new Date(String(iso).slice(0,10)),t=new Date(todayISO()); return Math.round((d-t)/86400000); }
var ML=["janv.","févr.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc."];
function findOpp(id){for(var i=0;i<S.opps.length;i++)if(S.opps[i].id===id)return S.opps[i];return null;}
function findClient(id){for(var i=0;i<S.clients.length;i++)if(S.clients[i].id===id)return S.clients[i];return null;}
function clientName(id){var c=findClient(id);return c?c.nom:"";}
var ET={ nouveau:{l:"Nouveau",c:"#94A3B8"}, contact:{l:"Contacté",c:"#0EA5E9"}, proposition:{l:"Proposition",c:"#D97706"}, gagne:{l:"Gagné",c:"#059669"}, perdu:{l:"Perdu",c:"#E11D48"} };
var ACTIVE=["nouveau","contact","proposition"];
var ETSEG=[["nouveau","Nouveau"],["contact","Contacté"],["proposition","Proposition"],["gagne","Gagné"],["perdu","Perdu"]];
function isActive(e){return ACTIVE.indexOf(e)>=0;}
function etMeta(e){return ET[e]||ET.nouveau;}
function etChip(e){var m=etMeta(e);return '<span class="badge" style="background:'+m.c+'1A;color:'+m.c+';border:1px solid '+m.c+'55">'+m.l+'</span>';}

var NAV=[
  {id:"pipeline",label:"Pipeline",icon:'<path d="M3 5h18l-7 8v6l-4-2v-4z"/>'},
  {id:"clients",label:"Clients",icon:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'},
  {id:"relances",label:"À relancer",icon:'<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>'}
];

async function boot(){
  try{
    var r=await Promise.all([
      biltia.list("opportunites",{limit:2000}).catch(function(){return[];}),
      biltia.list("clients",{order:"nom",ascending:true,limit:1000}).catch(function(){return[];})
    ]);
    S.opps=r[0]||[]; S.clients=r[1]||[];
    renderNav(); render();
  }catch(e){ $("view").innerHTML='<div class="view-pad"><div class="empty"><div class="empty-ico">⚠️</div><div class="empty-title">Connexion au workspace impossible</div><div class="empty-sub">Vérifiez votre connexion puis rouvrez l\\'application.</div></div></div>'; }
}
function renderNav(){
  $("side-nav").innerHTML=NAV.map(function(n){return '<button class="side-item'+(S.view===n.id?" active":"")+'" onclick="go(\\''+n.id+'\\')"><svg viewBox="0 0 24 24">'+n.icon+'</svg><span>'+n.label+'</span></button>';}).join("");
  $("tab-bar").innerHTML=NAV.map(function(n){return '<button class="tab-item'+(S.view===n.id?" active":"")+'" onclick="go(\\''+n.id+'\\')"><svg class="tab-ic" viewBox="0 0 24 24">'+n.icon+'</svg><span>'+n.label+'</span></button>';}).join("");
}
function go(v){ S.view=v; renderNav(); render(); try{window.scrollTo(0,0);}catch(e){} }
function primaryAdd(){ if(S.view==="clients") openClientEdit(null); else openOpp(null); }
function render(){
  var titles={pipeline:"Pipeline",clients:"Clients",relances:"À relancer"};
  $("tb-title").textContent=titles[S.view]||"";
  if($("hd-add"))$("hd-add").textContent=(S.view==="clients"?"+ Client":"+ Opportunité");
  if($("tb-add"))$("tb-add").textContent=(S.view==="clients"?"+ Nouveau client":"+ Nouvelle opportunité");
  if(S.view==="pipeline") renderPipeline();
  else if(S.view==="clients") renderClients();
  else renderRelances();
}
function oppDue(){ var t=todayISO(); return S.opps.filter(function(o){return isActive(o.etape)&&o.date_action&&String(o.date_action).slice(0,10)<=t;}); }

/* ── Vue : Pipeline ── */
function renderPipeline(){
  var opps=S.opps, active=opps.filter(function(o){return isActive(o.etape);});
  var activeVal=active.reduce(function(s,o){return s+numV(o.montant);},0);
  var gagne=opps.filter(function(o){return o.etape==="gagne";}), perdu=opps.filter(function(o){return o.etape==="perdu";});
  var conv=(gagne.length+perdu.length)?Math.round(gagne.length/(gagne.length+perdu.length)*100):0;
  var t=todayISO(); var d30=new Date(t); d30.setDate(d30.getDate()-30); var from30=d30.getFullYear()+"-"+pad2(d30.getMonth()+1)+"-"+pad2(d30.getDate());
  var gag30=gagne.filter(function(o){return o.date_action&&String(o.date_action).slice(0,10)>=from30;}).reduce(function(s,o){return s+numV(o.montant);},0);
  var due=oppDue().length;
  var h='<div class="view-pad">';
  h+='<div class="cockpit"><div class="c-label">Pipeline actif</div><div class="c-value" id="ck-pipe">'+eur(activeVal)+'</div><div class="c-sub">'+active.length+' opportunité'+(active.length>1?"s":"")+' en cours · taux de conversion '+conv+'%</div><div class="ck-stats"><div class="ck-stat"><b>'+eur(gag30)+'</b><span>gagné · 30 j</span></div><div class="ck-stat"><b>'+due+'</b><span>à relancer</span></div></div></div>';
  // entonnoir
  var maxStage=1; ACTIVE.forEach(function(k){var v=active.filter(function(o){return o.etape===k;}).reduce(function(s,o){return s+numV(o.montant);},0);if(v>maxStage)maxStage=v;});
  h+='<div class="funnel"><div class="section-h" style="margin:2px 0 4px"><b>Entonnoir de vente</b><span class="badge badge-gray">'+eurK(activeVal)+'</span></div>';
  h+=ACTIVE.map(function(k){ var m=etMeta(k); var list=active.filter(function(o){return o.etape===k;}); var v=list.reduce(function(s,o){return s+numV(o.montant);},0); var w=Math.max(v>0?6:0,Math.round(v/maxStage*100));
    return '<div class="fn-row" onclick="go(\\'relances\\')"><span class="fn-dot" style="background:'+m.c+'"></span><span class="fn-lbl">'+m.l+'</span><span class="fn-bar"><i style="width:'+w+'%;background:'+m.c+'"></i></span><span class="fn-val">'+eurK(v)+' <span>· '+list.length+'</span></span></div>';
  }).join("")+'</div>';
  // graphique gagnées par mois
  h+='<div class="chart-card" style="margin-bottom:16px"><div class="chart-hd"><b>Affaires gagnées par mois</b><span class="rd" id="rd-won">—</span></div><div class="chart-host" id="ch-won"></div></div>';
  // à suivre
  var suivi=active.slice().sort(function(a,b){ var da=a.date_action?String(a.date_action).slice(0,10):"9999"; var db=b.date_action?String(b.date_action).slice(0,10):"9999"; if(da!==db)return da<db?-1:1; return numV(b.montant)-numV(a.montant); });
  h+='<div class="section-h"><b>À suivre</b>'+(suivi.length?'<span class="badge badge-gray">'+suivi.length+'</span>':'')+'</div>';
  if(!suivi.length){ h+='<div class="empty"><div class="empty-ico">🎯</div><div class="empty-title">Aucune opportunité en cours</div><div class="empty-sub">Ajoutez vos pistes commerciales pour piloter votre pipeline.</div><button class="btn btn-primary" onclick="openOpp(null)">+ Nouvelle opportunité</button></div>'; }
  else { h+=suivi.map(oppRow).join(""); }
  h+='</div>'; $("view").innerHTML=h;
  try{
    var months=[]; var dd=new Date(t); dd.setDate(1); dd.setMonth(dd.getMonth()-5);
    for(var i=0;i<6;i++){ months.push({key:dd.getFullYear()+"-"+pad2(dd.getMonth()+1),label:ML[dd.getMonth()].replace(".","")}); dd.setMonth(dd.getMonth()+1); }
    var series=months.map(function(m){ var v=gagne.filter(function(o){return String(o.date_action||"").slice(0,7)===m.key;}).reduce(function(s,o){return s+numV(o.montant);},0); return {value:v,label:m.label,tip:m.label}; });
    var tot=series.reduce(function(s,x){return s+x.value;},0);
    if($("rd-won"))$("rd-won").textContent=eur(tot)+" sur 6 mois";
    chartCountUp($("ck-pipe"),activeVal,function(v){return eur(v);});
    drawBars($("ch-won"),series,{id:"won",color:"#059669",color2:"#6EE7B7",fmt:function(v){return eur(v);},rd:"rd-won",rdDef:eur(tot)+" sur 6 mois"});
  }catch(e){}
}
function oppRow(o){ var m=etMeta(o.etape), cn=clientName(o.client_id), dl=isActive(o.etape)?daysTo(o.date_action):null;
  var act=(o.date_action&&isActive(o.etape))?(dl<0?'<span style="color:#E11D48;font-weight:600">Relance en retard ('+(-dl)+' j)</span>':(dl===0?'<span style="color:#B45309;font-weight:600">À relancer aujourd\\'hui</span>':(o.prochaine_action?esc(o.prochaine_action)+' · '+frDate(o.date_action):frDate(o.date_action)))):(o.prochaine_action?esc(o.prochaine_action):"");
  return '<div class="opp" style="border-left-color:'+m.c+'" onclick="openOpp(\\''+o.id+'\\')"><span class="mini-av" style="background:'+avc(cn||o.titre)+'">'+esc(initials(cn||o.titre))+'</span><div class="op-main"><div class="t">'+esc(o.titre||"Opportunité")+'</div><div class="s">'+etChip(o.etape)+(cn?'<span>'+esc(cn)+'</span>':"")+(act?'<span>· '+act+'</span>':"")+'</div></div><div class="op-amt">'+eurK(o.montant)+'</div></div>';
}

/* ── Vue : Clients ── */
function renderClients(){
  var h='<div class="view-pad">';
  h+='<div class="searchbar"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg><input id="cl-q" placeholder="Rechercher un client, une ville…" value="'+esc(S.q)+'" oninput="clSearch(this.value)"></div>';
  h+='<div id="cl-results"></div></div>'; $("view").innerHTML=h; renderClientResults();
}
function clSearch(v){ S.q=v; renderClientResults(); }
function renderClientResults(){
  var q=String(S.q||"").toLowerCase().trim();
  var list=S.clients.filter(function(c){ if(!q)return true; return (String(c.nom||"")+" "+String(c.ville||"")+" "+String(c.email||"")).toLowerCase().indexOf(q)>=0; });
  var host=$("cl-results"); if(!host)return;
  if(!list.length){ host.innerHTML='<div class="empty"><div class="empty-ico">👥</div><div class="empty-title">Aucun client</div><div class="empty-sub">'+(S.clients.length?"Aucun résultat pour cette recherche.":"Ajoutez vos clients et prospects.")+'</div><button class="btn btn-primary" onclick="openClientEdit(null)">+ Nouveau client</button></div>'; return; }
  host.innerHTML='<div class="section-h" style="margin-top:2px"><b>'+list.length+' client'+(list.length>1?"s":"")+'</b></div><div class="grid-cards">'+list.map(function(c){
    var opps=S.opps.filter(function(o){return o.client_id===c.id;}); var act=opps.filter(function(o){return isActive(o.etape);}); var pval=act.reduce(function(s,o){return s+numV(o.montant);},0); var won=opps.filter(function(o){return o.etape==="gagne";}).reduce(function(s,o){return s+numV(o.montant);},0);
    return '<button class="mcard" onclick="openClient(\\''+c.id+'\\')"><div style="display:flex;align-items:center;gap:12px;margin-bottom:12px"><span class="mini-av" style="width:40px;height:40px;background:'+avc(c.nom)+'">'+esc(initials(c.nom))+'</span><div style="min-width:0;flex:1"><div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(c.nom)+'</div><div style="color:var(--mut);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(c.ville||c.email||"Client")+'</div></div></div><div style="display:flex;justify-content:space-between;gap:8px;font-size:12px"><span class="badge badge-gray">'+act.length+' en cours · '+eurK(pval)+'</span>'+(won>0?'<span class="badge badge-green">'+eurK(won)+' gagné</span>':'')+'</div></button>';
  }).join("")+'</div>';
}
function openClient(id){
  var c=findClient(id); if(!c)return;
  var opps=S.opps.filter(function(o){return o.client_id===c.id;}).sort(function(a,b){return numV(b.montant)-numV(a.montant);});
  var won=opps.filter(function(o){return o.etape==="gagne";}).reduce(function(s,o){return s+numV(o.montant);},0);
  var pval=opps.filter(function(o){return isActive(o.etape);}).reduce(function(s,o){return s+numV(o.montant);},0);
  var h='<div class="modal-h"><div style="display:flex;align-items:center;gap:12px;min-width:0"><span class="mini-av" style="width:40px;height:40px;background:'+avc(c.nom)+'">'+esc(initials(c.nom))+'</span><div style="min-width:0"><div class="modal-title" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(c.nom)+'</div><div class="modal-sub">'+esc(c.ville||"Client")+' · '+eurK(pval)+' en cours · '+eurK(won)+' gagné</div></div></div><button class="x" onclick="closeModal()">✕</button></div>';
  h+='<div class="kv">';
  if(c.email)h+='<div><div class="k">Email</div><div class="v"><a href="mailto:'+esc(c.email)+'">'+esc(c.email)+'</a></div></div>';
  if(c.tel)h+='<div><div class="k">Téléphone</div><div class="v">'+esc(c.tel)+'</div></div>';
  if(c.ville||c.code_postal)h+='<div><div class="k">Ville</div><div class="v">'+esc([c.code_postal,c.ville].filter(Boolean).join(" "))+'</div></div>';
  if(c.type)h+='<div><div class="k">Type</div><div class="v">'+esc(c.type)+'</div></div>';
  h+='</div>';
  if(c.notes)h+='<div class="fg"><div class="k" style="font-size:10.5px;color:var(--faint);font-weight:700;text-transform:uppercase;letter-spacing:.06em">Notes</div><div class="v" style="font-size:14px;font-weight:500;margin-top:2px;color:var(--mut)">'+esc(c.notes)+'</div></div>';
  h+='<div class="section-h" style="margin:16px 0 10px"><b>Opportunités</b><span class="badge badge-gray">'+opps.length+'</span></div>';
  if(!opps.length){ h+='<div class="opp" style="cursor:default;border-left-color:var(--line)"><div class="op-main"><div class="s" style="color:var(--mut)">Aucune opportunité pour ce client.</div></div></div>'; }
  else { h+=opps.map(oppRow).join(""); }
  h+='<div class="modal-actions"><button class="btn btn-primary" onclick="openOpp(null,\\''+c.id+'\\')">+ Opportunité</button><button class="btn btn-ghost" onclick="openClientEdit(\\''+c.id+'\\')">Modifier</button></div>';
  h+='<div style="margin-top:10px"><button class="btn btn-danger" style="width:100%" onclick="clientDel(\\''+c.id+'\\')">Supprimer le client</button></div>';
  openModal(h);
}
function openClientEdit(id){
  var c=id?findClient(id):{ nom:"",type:"entreprise",email:"",tel:"",ville:"",code_postal:"",adresse:"",notes:"" };
  S.edit=JSON.parse(JSON.stringify(c));
  var h='<div class="modal-h"><div><div class="modal-title">'+(id?"Modifier le client":"Nouveau client")+'</div></div><button class="x" onclick="closeModal()">✕</button></div>';
  h+='<div class="fg"><label class="fl">Nom / raison sociale *</label><input id="c-nom" value="'+esc(c.nom||"")+'" placeholder="SCI Méditerranée, M. Vasseur…"></div>';
  h+='<div class="form-row"><div class="fg"><label class="fl">Email</label><input id="c-email" inputmode="email" value="'+esc(c.email||"")+'"></div><div class="fg"><label class="fl">Téléphone</label><input id="c-tel" inputmode="tel" value="'+esc(c.tel||"")+'"></div></div>';
  h+='<div class="form-row"><div class="fg"><label class="fl">Code postal</label><input id="c-cp" inputmode="numeric" value="'+esc(c.code_postal||"")+'"></div><div class="fg"><label class="fl">Ville</label><input id="c-ville" value="'+esc(c.ville||"")+'"></div></div>';
  h+='<div class="fg"><label class="fl">Type</label><div class="seg" id="c-seg">'+[["particulier","Particulier"],["entreprise","Entreprise"],["collectivite","Collectivité"]].map(function(o){var on=(c.type||"entreprise")===o[0];return '<button type="button" onclick="clType(\\''+o[0]+'\\')" class="'+(on?"on":"")+'" style="'+(on?"background:var(--em)":"")+'">'+o[1]+'</button>';}).join("")+'</div></div>';
  h+='<div class="fg"><label class="fl">Notes</label><textarea id="c-notes" placeholder="Contexte, préférences…">'+esc(c.notes||"")+'</textarea></div>';
  h+='<div class="modal-actions"><button class="btn btn-primary" id="c-save" onclick="clientSave()">'+(id?"Enregistrer":"Ajouter")+'</button>'+(id?'<button class="btn btn-danger" style="flex:0 0 auto" onclick="clientDel(\\''+id+'\\')">Supprimer</button>':'')+'</div>';
  openModal(h);
}
function clType(k){ S.edit.type=k; var btns=document.querySelectorAll("#c-seg button"),ks=["particulier","entreprise","collectivite"]; for(var i=0;i<ks.length;i++){ if(btns[i]){ var on=ks[i]===k; btns[i].className=on?"on":""; btns[i].style.background=on?"var(--em)":""; } } }
async function clientSave(){
  var c=S.edit; if($("c-nom"))c.nom=$("c-nom").value; ["email","tel","ville","notes"].forEach(function(f){var el=$("c-"+f);if(el)c[f]=el.value;}); if($("c-cp"))c.code_postal=$("c-cp").value;
  if(!String(c.nom||"").trim()){ var el=$("c-nom"); if(el){el.classList.add("invalid");el.focus();} return; }
  var payload={ nom:String(c.nom).trim(), type:c.type||null, email:c.email||null, tel:c.tel||null, ville:c.ville||null, code_postal:c.code_postal||null, notes:c.notes||null };
  var b=$("c-save"); if(b){b.disabled=true;b.textContent="Enregistrement…";}
  try{
    if(c.id){ var up=await biltia.update("clients",c.id,payload); for(var i=0;i<S.clients.length;i++)if(S.clients[i].id===c.id)S.clients[i]=up; biltia.notify("Client enregistré"); }
    else { var row=await biltia.create("clients",payload); S.clients.push(row); biltia.notify("Client ajouté"); }
    S.clients.sort(function(a,b){return String(a.nom).localeCompare(String(b.nom));});
    closeModal(); render();
  }catch(err){ if(b){b.disabled=false;b.textContent=c.id?"Enregistrer":"Ajouter";} biltia.notify("Enregistrement impossible"); }
}
async function clientDel(id){ if(!confirm("Supprimer ce client ? Ses opportunités ne seront pas supprimées."))return; try{ await biltia.remove("clients",id); S.clients=S.clients.filter(function(x){return x.id!==id;}); biltia.notify("Client supprimé"); closeModal(); render(); }catch(e){} }

/* ── Vue : À relancer ── */
function renderRelances(){
  var t=todayISO();
  var withDate=S.opps.filter(function(o){return isActive(o.etape)&&o.date_action;}).map(function(o){return {o:o,dl:daysTo(o.date_action)};}).sort(function(a,b){return a.dl-b.dl;});
  var groups=[
    {t:"En retard",col:"#E11D48",items:withDate.filter(function(x){return x.dl<0;})},
    {t:"Aujourd'hui",col:"#B45309",items:withDate.filter(function(x){return x.dl===0;})},
    {t:"À venir",col:"#059669",items:withDate.filter(function(x){return x.dl>0;})}
  ];
  var h='<div class="view-pad">';
  var any=false;
  groups.forEach(function(g){ if(!g.items.length)return; any=true;
    h+='<div class="grp-h"><span class="dot" style="background:'+g.col+'"></span>'+g.t+' <span style="color:var(--faint)">('+g.items.length+')</span></div>';
    h+=g.items.map(function(x){return oppRow(x.o);}).join("");
  });
  if(!any){ h+='<div class="empty"><div class="empty-ico">✅</div><div class="empty-title">Rien à relancer</div><div class="empty-sub">Planifiez une prochaine action sur vos opportunités pour ne rien oublier.</div><button class="btn btn-primary" onclick="go(\\'pipeline\\')">Voir le pipeline</button></div>'; }
  h+='</div>'; $("view").innerHTML=h;
}

/* ── Opportunité (éditeur) ── */
function optClients(sel){ var o='<option value="">— Choisir un client —</option>'; S.clients.forEach(function(c){o+='<option value="'+c.id+'"'+(c.id===sel?" selected":"")+'>'+esc(c.nom)+'</option>';}); o+='<option value="__new">➕ Nouveau client…</option>'; return o; }
function openOpp(id,preClient){
  var o=id?findOpp(id):null;
  S.edit = o? { id:o.id, client_id:o.client_id||"", titre:o.titre||"", montant:(o.montant!=null?numV(o.montant):0), etape:o.etape||"nouveau", source:o.source||"", prochaine_action:o.prochaine_action||"", date_action:o.date_action?String(o.date_action).slice(0,10):"", notes:o.notes||"" }
            : { id:null, client_id:preClient||"", titre:"", montant:0, etape:"nouveau", source:"", prochaine_action:"", date_action:"", notes:"" };
  var e=S.edit, cn=clientName(e.client_id);
  var h='<div class="modal-h"><div><div class="modal-title">'+(id?"Modifier l\\'opportunité":"Nouvelle opportunité")+'</div><div class="modal-sub">'+(cn?esc(cn):"Suivi commercial")+'</div></div><button class="x" onclick="closeModal()">✕</button></div>';
  h+='<div class="fg"><label class="fl">Intitulé *</label><input id="o-titre" value="'+esc(e.titre||"")+'" placeholder="Extension R+2, villa neuve…"></div>';
  h+='<div class="form-row"><div class="fg"><label class="fl">Client</label><select id="o-client" onchange="oNewClient(this.value)">'+optClients(e.client_id)+'</select></div><div class="fg"><label class="fl">Montant estimé (€)</label><input id="o-montant" inputmode="decimal" value="'+(e.montant?nfMont(e.montant):"")+'" placeholder="0"></div></div>';
  h+='<div class="fg"><label class="fl">Étape</label><div class="seg" id="o-seg">'+ETSEG.map(function(s){var on=e.etape===s[0];var col=etMeta(s[0]).c;return '<button type="button" onclick="oppEtape(\\''+s[0]+'\\')" class="'+(on?"on":"")+'" style="'+(on?"background:"+col+";border-color:"+col:"")+'">'+s[1]+'</button>';}).join("")+'</div></div>';
  h+='<div class="form-row"><div class="fg"><label class="fl">Prochaine action</label><input id="o-action" value="'+esc(e.prochaine_action||"")+'" placeholder="Relancer, envoyer devis…"></div><div class="fg"><label class="fl">Pour le</label><input type="date" id="o-date" value="'+esc(e.date_action||"")+'"></div></div>';
  h+='<div class="fg"><label class="fl">Source</label><input id="o-source" value="'+esc(e.source||"")+'" placeholder="Recommandation, appel d\\'offres, site web…"></div>';
  h+='<div class="fg"><label class="fl">Notes</label><textarea id="o-notes" placeholder="Détails, budget, décideur…">'+esc(e.notes||"")+'</textarea></div>';
  h+='<div class="modal-actions"><button class="btn btn-primary" id="o-save" onclick="oppSave()">'+(id?"Enregistrer":"Créer")+'</button>'+((e.client_id&&clientEmail(e.client_id))?'<button class="btn btn-ghost" style="flex:0 0 auto" onclick="relanceOpp()">Relancer</button>':'')+'</div>';
  h+=(id?'<div style="margin-top:10px"><button class="btn btn-danger" style="width:100%" onclick="oppDel(\\''+id+'\\')">Supprimer</button></div>':'');
  openModal(h);
}
function nfMont(n){n=numV(n);return (n%1===0)?String(n):(""+n).replace(".",",");}
function clientEmail(id){var c=findClient(id);return c&&c.email?c.email:"";}
function oppEtape(k){ S.edit.etape=k; var btns=document.querySelectorAll("#o-seg button"); for(var i=0;i<ETSEG.length;i++){ if(btns[i]){ var on=ETSEG[i][0]===k,col=etMeta(ETSEG[i][0]).c; btns[i].className=on?"on":""; btns[i].style.background=on?col:""; btns[i].style.borderColor=on?col:""; } } }
function oNewClient(v){ if(v!=="__new"){S.edit.client_id=v;return;} var nm=prompt("Nom du client :",""); if(nm&&nm.trim()){ biltia.create("clients",{nom:nm.trim(),type:"entreprise"}).then(function(c){ S.clients.push(c); S.clients.sort(function(a,b){return String(a.nom).localeCompare(String(b.nom));}); S.edit.client_id=c.id; if($("o-client"))$("o-client").innerHTML=optClients(c.id); biltia.notify("Client créé"); }).catch(function(){ if($("o-client"))$("o-client").value=S.edit.client_id||""; }); } else { if($("o-client"))$("o-client").value=S.edit.client_id||""; } }
async function oppSave(){
  var e=S.edit;
  if($("o-titre"))e.titre=$("o-titre").value; if($("o-client")&&$("o-client").value!=="__new")e.client_id=$("o-client").value; if($("o-montant"))e.montant=numV($("o-montant").value); if($("o-action"))e.prochaine_action=$("o-action").value; if($("o-date"))e.date_action=$("o-date").value; if($("o-source"))e.source=$("o-source").value; if($("o-notes"))e.notes=$("o-notes").value;
  if(!String(e.titre||"").trim()){ var el=$("o-titre"); if(el){el.classList.add("invalid");el.focus();} return; }
  var payload={ client_id:e.client_id||null, titre:String(e.titre).trim(), montant:e.montant||0, etape:e.etape||"nouveau", source:e.source||null, prochaine_action:e.prochaine_action||null, date_action:e.date_action||null, notes:e.notes||null };
  var b=$("o-save"); if(b){b.disabled=true;b.textContent="Enregistrement…";}
  try{
    if(e.id){ var up=await biltia.update("opportunites",e.id,payload); for(var i=0;i<S.opps.length;i++)if(S.opps[i].id===e.id)S.opps[i]=up; biltia.notify("Opportunité enregistrée"); }
    else { var row=await biltia.create("opportunites",payload); S.opps.push(row); biltia.notify("Opportunité créée"); }
    closeModal(); render();
  }catch(err){ if(b){b.disabled=false;b.textContent=e.id?"Enregistrer":"Créer";} biltia.notify("Enregistrement impossible"); }
}
async function oppDel(id){ if(!confirm("Supprimer cette opportunité ?"))return; try{ await biltia.remove("opportunites",id); S.opps=S.opps.filter(function(x){return x.id!==id;}); biltia.notify("Opportunité supprimée"); closeModal(); render(); }catch(e){} }
async function relanceOpp(){
  var e=S.edit; var em=clientEmail(e.client_id); if(!em){ biltia.notify("Aucun email pour ce client"); return; }
  var subj=(e.titre||"Votre projet")+" — suivi";
  var body="Bonjour,\\n\\nJe reviens vers vous au sujet de "+(e.titre||"votre projet")+". Restant à votre disposition pour en discuter et avancer ensemble.\\n\\nBien cordialement,\\n"+(S.entreprise||"");
  try{ await biltia.sendEmail({to:em,subject:subj,body:body}); biltia.notify("Relance envoyée à "+clientName(e.client_id)); closeModal(); }
  catch(err){ biltia.notify("Envoi impossible"); }
}

/* ── Modale ── */
function openModal(html){ $("modal").innerHTML=html; $("ovl").hidden=false; $("modal").scrollTop=0; }
function closeModal(){ $("ovl").hidden=true; $("modal").innerHTML=""; S.edit=null; }
document.addEventListener("click",function(e){ if(e.target&&e.target.id==="ovl")closeModal(); });

/* ── Init ── */
function initBrand(){ if(!S.entreprise||S.entreprise.indexOf("__")===0)S.entreprise="Mon entreprise"; var eb=S.entreprise.toUpperCase().slice(0,22); ["side-eyebrow","hd-eyebrow","tb-eyebrow"].forEach(function(i){var el=$(i);if(el)el.textContent=eb;}); ["side-logo","hd-logo"].forEach(function(i){var el=$(i);if(el)el.textContent=initials(S.entreprise)||"B";}); }
var _rz;
function start(){ initBrand(); renderNav(); boot(); if(window.addEventListener)window.addEventListener("resize",function(){ if(_rz)clearTimeout(_rz); _rz=setTimeout(function(){ if(S.view==="pipeline")render(); },200); }); }
if(document.readyState!=="loading"){ start(); } else { document.addEventListener("DOMContentLoaded",start); }
${CHART_ENGINE_JS}
</script>
</body>
</html>`;
