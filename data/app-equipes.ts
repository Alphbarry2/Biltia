// ─────────────────────────────────────────────────────────────────────────────
// APP PHARE — ÉQUIPES & TÂCHES (layout KANBAN, volontairement distinct)
//
// 4e app phare. Rupture de layout demandée : PAS de tableau de bord hero — l'écran
// principal est un KANBAN plein écran (À faire / En cours / Terminé) avec
// GLISSER-DÉPOSER sur ordinateur (HTML5 DnD) et déplacement tactile via la fiche.
// Identité ORANGE (≠ indigo chantiers, teal devis, violet finance). Police Inter,
// sidebar ordi / tab-bar mobile, 365px, màj instantanée.
//
// 3 vues : Tâches (kanban) · Équipe (charge par équipier) · Pilotage (KPI + charts
// interactifs partagés lib/app-charts). Branchée au workspace via window.biltia
// (tasks · employees · chantiers). Le SDK est injecté à l'instanciation.
//
// Contrainte : PAS de template literals NI de backticks dans le JS de l'app.
// ─────────────────────────────────────────────────────────────────────────────

import { CHART_CSS, CHART_ENGINE_JS } from "@/lib/app-charts";

export const APP_EQUIPES_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Équipes & tâches</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
img,svg{max-width:100%}
:root{--bg:#FBF8F5;--ink:#1A1512;--mut:#6B625A;--faint:#A79D94;--line:#EDE7E1;--soft:#F6F0EA;
--vio:#EA580C;--grad:#EA580C;--glow:234,88,12;--tint:#FEEEE2;--tintline:#FBD3B4;
--shadow:0 1px 2px rgba(26,21,18,.04),0 6px 18px rgba(26,21,18,.05);--shadow-lg:0 14px 44px rgba(26,21,18,.14)}
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
.badge-accent{background:var(--tint);color:var(--vio);border:1px solid var(--tintline)}
.badge-green{background:#ECFDF5;color:#059669;border:1px solid #A7F3D0}
.badge-red{background:#FFF1F2;color:#E11D48;border:1px solid #FECDD3}
.badge-amber{background:#FFFBEB;color:#B45309;border:1px solid #FDE68A}
.badge-gray{background:#F2F1EE;color:#6B625A;border:1px solid #EDE7E1}
input,select,textarea{font-family:inherit;font-size:16px;color:var(--ink);background:#fff;border:1px solid #E3DCD4;border-radius:12px;padding:10px 14px;width:100%;outline:none;transition:border .15s,box-shadow .15s}
input:focus,select:focus,textarea:focus{border-color:var(--vio);box-shadow:0 0 0 3px rgba(var(--glow),.14)}
input::placeholder,textarea::placeholder{color:#A79D94}
input.invalid{border-color:#E11D48;box-shadow:0 0 0 3px rgba(225,29,72,.12)}
.shell{display:flex;min-height:100vh}
.sidebar{display:none}
.app-main{flex:1;min-width:0;padding:0 0 90px}
.app-header{position:fixed;top:0;left:0;right:0;z-index:100;background:rgba(251,248,245,.85);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-bottom:1px solid var(--line);height:60px;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 14px}
.brand{display:flex;align-items:center;gap:10px;min-width:0}
.brand-logo{width:30px;height:30px;border-radius:9px;background:var(--grad);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:14px;flex-shrink:0}
.app-eyebrow{font-size:10px;font-weight:700;color:var(--vio);text-transform:uppercase;letter-spacing:.12em;display:block;line-height:1.2}
.app-title{font-size:15px;font-weight:800;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px;line-height:1.2}
.mtop{height:60px}
.tab-bar{position:fixed;bottom:0;left:0;right:0;background:rgba(251,248,245,.94);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-top:1px solid var(--line);display:flex;z-index:100}
.tab-item{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:8px 4px 10px;cursor:pointer;border:none;background:none;font-size:10px;font-weight:600;color:#A79D94;font-family:inherit;min-height:56px}
.tab-item.active{color:var(--vio)}
.tab-ic{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.fab{position:fixed;right:16px;bottom:78px;z-index:120;width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;color:#fff;font-size:28px;line-height:1;background:var(--grad);box-shadow:0 8px 22px rgba(var(--glow),.30);display:flex;align-items:center;justify-content:center}
.fab:active{transform:scale(.94)}
.view-pad{padding:16px}
.topbar{display:none}
.section-h{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:22px 2px 12px}
.section-h b{font-size:15px;font-weight:700}
.section-h .link{font-size:12px;font-weight:600;color:var(--vio);cursor:pointer;background:none;border:none}
.searchwrap{position:relative}
.searchwrap svg{position:absolute;left:13px;top:50%;transform:translateY(-50%);width:16px;height:16px;stroke:var(--faint);fill:none;stroke-width:2}
.searchwrap input{padding-left:38px}
.empty{text-align:center;padding:52px 20px}
.empty-ico{width:54px;height:54px;border-radius:16px;background:var(--tint);color:var(--vio);display:flex;align-items:center;justify-content:center;margin:0 auto 14px;font-size:24px}
.empty-title{font-weight:700;margin-bottom:4px}
.empty-sub{font-size:13px;color:var(--mut);margin-bottom:16px}
.spin{width:26px;height:26px;border:3px solid var(--line);border-top-color:var(--vio);border-radius:50%;animation:sp .7s linear infinite;margin:60px auto}
@keyframes sp{to{transform:rotate(360deg)}}
/* ── KANBAN ── */
.board-ctrl{display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap}
.board-ctrl .searchwrap{flex:1;min-width:190px}
.board-ctrl select{max-width:220px;flex:0 1 220px}
.board{display:grid;grid-auto-flow:column;grid-auto-columns:82vw;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:8px;-webkit-overflow-scrolling:touch;align-items:start}
.col{scroll-snap-align:start;background:var(--soft);border:1px solid var(--line);border-radius:16px;padding:12px;display:flex;flex-direction:column;min-height:180px}
.col.drop{outline:2px dashed var(--vio);outline-offset:-4px;background:var(--tint)}
.col-h{display:flex;align-items:center;gap:8px;margin-bottom:11px;padding:2px 2px 0}
.col-h .dot{width:9px;height:9px;border-radius:3px;flex-shrink:0}
.col-h b{font-size:13px;font-weight:700}
.col-h .ct{margin-left:auto;font-size:11px;font-weight:700;color:var(--faint);background:#fff;border:1px solid var(--line);border-radius:9999px;padding:2px 9px;min-width:24px;text-align:center}
.col-body{display:flex;flex-direction:column;gap:9px;flex:1;min-height:44px}
.col-empty{font-size:12px;color:var(--faint);text-align:center;padding:18px 0;border:1px dashed var(--line);border-radius:10px}
.tcard{background:#fff;border:1px solid var(--line);border-left:3px solid transparent;border-radius:13px;padding:12px;box-shadow:var(--shadow);cursor:grab}
.tcard:hover{box-shadow:0 6px 16px rgba(26,21,18,.09)}
.tcard.drag{opacity:.5}
.tcard.p-high{border-left-color:#E11D48}
.tcard.p-low{border-left-color:#CBD5E1}
.tcard.p-normal{border-left-color:var(--vio)}
.tcard-t{font-weight:600;font-size:13.5px;line-height:1.35}
.tcard-meta{display:flex;align-items:center;gap:8px;margin-top:11px;flex-wrap:wrap}
.tcard-tag{font-size:11px;color:var(--mut);background:var(--soft);border:1px solid var(--line);border-radius:7px;padding:2px 7px;white-space:nowrap;max-width:60%;overflow:hidden;text-overflow:ellipsis}
.tcard-due{font-size:11px;font-weight:600}
.mini-av{width:22px;height:22px;border-radius:7px;font-size:9px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;margin-left:auto;flex-shrink:0}
.mini-av.none{background:#EDE7E1;color:#A79D94;border:1px dashed #CDBFB2}
/* Équipe */
.grid-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,290px),1fr));gap:12px}
.mcard{background:#fff;border:1px solid var(--line);border-radius:16px;padding:16px;box-shadow:var(--shadow);cursor:pointer;text-align:left;width:100%}
.mcard:hover{box-shadow:0 6px 20px rgba(26,21,18,.08);border-color:var(--tintline)}
.avatar{width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:#fff;flex-shrink:0}
.load-bar{height:7px;background:#EDE7E1;border-radius:4px;overflow:hidden;margin:12px 0 8px}
.load-fill{height:100%;border-radius:4px;background:var(--grad);transition:width .5s}
/* Pilotage */
.strip{display:flex;background:#fff;border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);overflow:hidden}
.strip-cell{flex:1;padding:14px 15px;min-width:0}
.strip-cell+.strip-cell{border-left:1px solid var(--line)}
.strip-k{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--faint)}
.strip-v{font-size:22px;font-weight:800;font-variant-numeric:tabular-nums;margin-top:4px;line-height:1}
.strip-s{font-size:11px;color:var(--mut);margin-top:3px}
.list{display:flex;flex-direction:column;gap:10px}
.row{display:flex;align-items:center;gap:12px;padding:13px 15px;background:#fff;border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);cursor:pointer;text-align:left;width:100%}
.row:hover{border-color:var(--tintline)}
.row-mid{flex:1;min-width:0}
.row-mid .n{display:block;font-weight:700;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.row-mid .s{display:block;font-size:12px;color:var(--mut);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.charts-2{display:grid;grid-template-columns:1fr;gap:12px;margin-top:4px}
@media(min-width:760px){.charts-2{grid-template-columns:1fr 1fr}}
/* Modale */
.overlay{position:fixed;inset:0;background:rgba(20,14,10,.44);backdrop-filter:blur(6px);z-index:200;display:flex;align-items:flex-end;justify-content:center}
.overlay[hidden]{display:none}
@media(min-width:600px){.overlay{align-items:center;padding:20px}}
.modal{background:#fff;border-radius:24px 24px 0 0;width:100%;max-width:560px;max-height:92vh;overflow-y:auto;padding:22px 20px calc(22px + env(safe-area-inset-bottom));box-shadow:var(--shadow-lg)}
@media(min-width:600px){.modal{border-radius:24px}}
.modal-h{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px}
.modal-title{font-size:18px;font-weight:800;letter-spacing:-.01em}
.modal-sub{font-size:12.5px;color:var(--mut);margin-top:2px}
.x{border:none;background:var(--soft);width:34px;height:34px;border-radius:10px;color:var(--mut);font-size:18px;cursor:pointer;flex-shrink:0}
.fg{margin-bottom:14px}
.fl{display:block;font-size:11px;font-weight:700;color:#6B625A;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media(max-width:480px){.form-row{grid-template-columns:1fr}}
.seg{display:flex;flex-wrap:wrap;gap:6px}
.seg button{border:1px solid var(--line);background:#fff;color:var(--mut);font-weight:600;font-size:12px;padding:8px 12px;border-radius:10px;cursor:pointer;font-family:inherit}
.seg button.on{color:#fff;border-color:transparent}
.modal-actions{display:flex;gap:10px;margin-top:20px;flex-wrap:wrap}
.modal-actions .btn{flex:1}
.det-row{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid var(--soft);font-size:13px}
.det-row:last-child{border-bottom:none}.det-row .k{color:var(--mut)}.det-row .v{font-weight:600;text-align:right}
@media(min-width:860px){
  .app-header,.mtop,.tab-bar,.fab{display:none}
  .sidebar{display:flex;flex-direction:column;width:236px;flex-shrink:0;position:sticky;top:0;height:100vh;border-right:1px solid var(--line);background:#fff;padding:20px 14px}
  .side-brand{display:flex;align-items:center;gap:11px;padding:6px 8px 20px}
  .side-nav{display:flex;flex-direction:column;gap:3px}
  .side-item{display:flex;align-items:center;gap:11px;padding:10px 12px;border-radius:11px;border:none;background:none;cursor:pointer;font-family:inherit;font-size:13.5px;font-weight:600;color:var(--mut);text-align:left;width:100%}
  .side-item:hover{background:var(--soft);color:var(--ink)}
  .side-item.active{background:var(--tint);color:var(--vio)}
  .side-item svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}
  .app-main{padding:0 0 40px}
  .topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:26px 32px 6px}
  .view-pad{padding:16px 32px}
  .board{grid-auto-columns:1fr;overflow:visible}
  .col{min-height:340px}
}
@media(max-width:400px){.view-pad{padding:13px}.board{grid-auto-columns:86vw}.app-title{max-width:120px}.btn{padding:11px 15px}}
@media(min-width:1600px){.topbar,.view-pad{max-width:1520px;margin-left:auto;margin-right:auto}}
@media print{.sidebar,.app-header,.tab-bar,.fab,.no-print{display:none!important}}
${CHART_CSS}
</style>
</head>
<body>
<div class="shell">
  <aside class="sidebar">
    <div class="side-brand"><span class="brand-logo" id="side-logo">B</span><div style="min-width:0"><span class="app-eyebrow" id="side-eyebrow">BILTIA</span><span class="app-title" id="side-title">Équipe</span></div></div>
    <nav class="side-nav" id="side-nav"></nav>
  </aside>
  <div class="app-main">
    <header class="app-header">
      <div class="brand"><span class="brand-logo" id="hd-logo">B</span><div style="min-width:0"><span class="app-eyebrow" id="hd-eyebrow">BILTIA</span><span class="app-title">Tâches</span></div></div>
      <button class="btn btn-primary btn-sm" id="hd-add" onclick="primaryAdd()">+ Tâche</button>
    </header>
    <div class="mtop"></div>
    <div class="topbar">
      <div><span class="app-eyebrow" id="tb-eyebrow">BILTIA</span><div id="tb-title" style="font-size:22px;font-weight:800;letter-spacing:-.02em">Tâches</div></div>
      <button class="btn btn-primary" id="tb-add" onclick="primaryAdd()">+ Nouvelle tâche</button>
    </div>
    <main id="view"><div class="spin"></div></main>
  </div>
</div>
<nav class="tab-bar" id="tab-bar"></nav>
<button class="fab" onclick="primaryAdd()" aria-label="Ajouter">+</button>
<div class="overlay" id="ovl" hidden><div class="modal" id="modal"></div></div>

<script>
var S={ view:"board", tasks:[], employees:[], chantiers:[], entreprise:"__ENTREPRISE__", search:"", filterAssignee:"", edit:null, dragId:null };
var $=function(id){return document.getElementById(id);};
function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
function num(v){var n=parseFloat(String(v==null?"":v).replace(",",".").replace(/[^0-9.\\-]/g,""));return isFinite(n)?n:0;}
function pad2(n){return String(n).padStart(2,"0");}
function todayISO(){var d=new Date();return d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate());}
function fmtDate(iso){if(!iso)return "—";var p=String(iso).slice(0,10).split("-");if(p.length<3)return iso;return p[2]+"/"+p[1];}
function daysTo(iso){if(!iso)return null;var d=new Date(String(iso).slice(0,10)),t=new Date(todayISO());return Math.round((d-t)/86400000);}
function initials(s){var w=String(s||"?").trim().split(/\\s+/);return ((w[0]||"?")[0]+(w[1]?w[1][0]:"")).toUpperCase();}
var AV=["#EA580C","#4F46E5","#DB2777","#0284C7","#0D9488","#7C3AED","#059669","#DC2626"];
function avc(seed){var s=String(seed||""),h=0;for(var i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;return AV[h%AV.length];}
var WD=["dim","lun","mar","mer","jeu","ven","sam"];
function lastDays(n){var out=[],now=new Date();for(var i=n-1;i>=0;i--){var d=new Date(now.getFullYear(),now.getMonth(),now.getDate()-i);out.push({key:d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate()),label:WD[d.getDay()]});}return out;}

var COLS=[{k:"todo",l:"À faire",c:"#94A3B8"},{k:"doing",l:"En cours",c:"#EA580C"},{k:"done",l:"Terminé",c:"#16A34A"}];
var PRIO={high:{l:"Haute",c:"#E11D48"},normal:{l:"Normale",c:"#EA580C"},low:{l:"Basse",c:"#94A3B8"}};
var EMPST={ actif:{l:"Actif",b:"badge-green"}, arret:{l:"En arrêt",b:"badge-amber"}, inactif:{l:"Inactif",b:"badge-gray"} };
function findTask(id){for(var i=0;i<S.tasks.length;i++)if(S.tasks[i].id===id)return S.tasks[i];return null;}
function findEmp(id){for(var i=0;i<S.employees.length;i++)if(S.employees[i].id===id)return S.employees[i];return null;}
function empName(id){var e=findEmp(id);return e?(((e.prenom||"")+" "+(e.nom||"")).trim()||e.nom||""):"";}
function chantierName(id){for(var i=0;i<S.chantiers.length;i++)if(S.chantiers[i].id===id)return S.chantiers[i].nom;return "";}
function isOverdue(t){ return t.status!=="done" && t.due_date && daysTo(t.due_date)!==null && daysTo(t.due_date)<0; }
function activeCount(empId){ return S.tasks.filter(function(t){return t.assignee_id===empId && (t.status==="todo"||t.status==="doing");}).length; }

var NAV=[
  {id:"board",label:"Tâches",icon:'<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="5" height="7" rx="1.5"/>'},
  {id:"equipe",label:"Équipe",icon:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'},
  {id:"pilotage",label:"Pilotage",icon:'<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>'}
];

async function boot(){
  try{
    var r=await Promise.all([
      biltia.list("tasks",{order:"due_date",ascending:true,limit:800}).catch(function(){return[];}),
      biltia.list("employees",{order:"nom",ascending:true,limit:400}).catch(function(){return[];}),
      biltia.list("chantiers",{order:"created_at",ascending:false,limit:600}).catch(function(){return[];})
    ]);
    S.tasks=r[0]||[]; S.employees=r[1]||[]; S.chantiers=r[2]||[];
    renderNav(); render();
  }catch(e){ $("view").innerHTML='<div class="view-pad"><div class="empty"><div class="empty-ico">⚠️</div><div class="empty-title">Connexion au workspace impossible</div><div class="empty-sub">Vérifiez votre connexion puis rouvrez l\\'application.</div></div></div>'; }
}
function renderNav(){
  $("side-nav").innerHTML=NAV.map(function(n){return '<button class="side-item'+(S.view===n.id?" active":"")+'" onclick="go(\\''+n.id+'\\')"><svg viewBox="0 0 24 24">'+n.icon+'</svg><span>'+n.label+'</span></button>';}).join("");
  $("tab-bar").innerHTML=NAV.map(function(n){return '<button class="tab-item'+(S.view===n.id?" active":"")+'" onclick="go(\\''+n.id+'\\')"><svg class="tab-ic" viewBox="0 0 24 24">'+n.icon+'</svg><span>'+n.label+'</span></button>';}).join("");
}
function go(v){ S.view=v; renderNav(); render(); try{window.scrollTo(0,0);}catch(e){} }
function primaryAdd(){ if(S.view==="equipe") openEmp(null); else openTask(null); }
function render(){
  var titles={board:"Tâches",equipe:"Équipe",pilotage:"Pilotage"};
  $("tb-title").textContent=titles[S.view]||"";
  if($("hd-add"))$("hd-add").textContent=(S.view==="equipe"?"+ Équipier":"+ Tâche");
  if($("tb-add"))$("tb-add").textContent=(S.view==="equipe"?"+ Nouvel équipier":"+ Nouvelle tâche");
  if(S.view==="board") renderBoard();
  else if(S.view==="equipe") renderEquipe();
  else renderPilotage();
}
function emptyState(ico,title,sub,onclick,btn){return '<div class="empty"><div class="empty-ico">'+ico+'</div><div class="empty-title">'+title+'</div><div class="empty-sub">'+sub+'</div><button class="btn btn-primary" onclick="'+onclick+'">'+btn+'</button></div>';}

/* ── Vue : Kanban ── */
function taskPass(t){
  if(S.filterAssignee && t.assignee_id!==S.filterAssignee)return false;
  var q=S.search.trim().toLowerCase();
  if(q){ var hay=((t.title||"")+" "+(chantierName(t.chantier_id)||"")+" "+(empName(t.assignee_id)||"")).toLowerCase(); if(hay.indexOf(q)<0)return false; }
  return true;
}
function taskCard(t){
  var av=t.assignee_id?empName(t.assignee_id):"";
  var over=isOverdue(t);
  var pcls=" p-"+(t.priority||"normal");
  var due=t.due_date?(t.status==="done"?"":(over?"En retard "+fmtDate(t.due_date):"Éch. "+fmtDate(t.due_date))):"";
  return '<div class="tcard'+pcls+'" draggable="true" ondragstart="dragStart(event,\\''+t.id+'\\')" ondragend="dragEnd(event)" onclick="openTask(\\''+t.id+'\\')">'
    +'<div class="tcard-t">'+esc(t.title||"Tâche")+'</div>'
    +'<div class="tcard-meta">'
      +(t.chantier_id?'<span class="tcard-tag">'+esc(chantierName(t.chantier_id))+'</span>':'')
      +(due?'<span class="tcard-due" style="color:'+(over?"#E11D48":"var(--mut)")+'">'+esc(due)+'</span>':'')
      +(av?'<span class="mini-av" style="background:'+avc(av)+'" title="'+esc(av)+'">'+esc(initials(av))+'</span>':'<span class="mini-av none" title="Non assignée">?</span>')
    +'</div></div>';
}
function renderBoard(){
  if(!S.tasks.length && !S.employees.length){
    $("view").innerHTML='<div class="view-pad">'+emptyState("🗂️","Aucune tâche","Créez votre première tâche et glissez-la d\\'une colonne à l\\'autre au fil de l\\'avancement.","openTask(null)","+ Nouvelle tâche")+'</div>';
    return;
  }
  var h='<div class="view-pad">';
  h+='<div class="board-ctrl"><div class="searchwrap"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg><input placeholder="Rechercher une tâche, un chantier…" value="'+esc(S.search)+'" oninput="boardSearch(this.value)"></div>';
  h+='<select onchange="boardAssignee(this.value)"><option value="">Toute l\\'équipe</option>'+S.employees.map(function(e){var nm=empName(e.id);return '<option value="'+e.id+'"'+(e.id===S.filterAssignee?" selected":"")+'>'+esc(nm)+'</option>';}).join("")+'</select></div>';
  h+='<div class="board">'+COLS.map(function(c){
    var items=S.tasks.filter(function(t){return (t.status||"todo")===c.k && taskPass(t);});
    return '<div class="col" ondragover="dragOver(event,this)" ondragleave="this.classList.remove(\\'drop\\')" ondrop="dropTo(event,\\''+c.k+'\\',this)"><div class="col-h"><span class="dot" style="background:'+c.c+'"></span><b>'+c.l+'</b><span class="ct">'+items.length+'</span></div><div class="col-body">'+(items.length?items.map(taskCard).join(""):'<div class="col-empty">Glissez une tâche ici</div>')+'</div></div>';
  }).join("")+'</div></div>';
  $("view").innerHTML=h;
}
function boardSearch(v){ S.search=v; renderBoard(); }
function boardAssignee(v){ S.filterAssignee=v; renderBoard(); }
/* Glisser-déposer (ordinateur) */
function dragStart(ev,id){ S.dragId=id; try{ev.dataTransfer.setData("text/plain",id); ev.dataTransfer.effectAllowed="move";}catch(e){} if(ev.target&&ev.target.classList)ev.target.classList.add("drag"); }
function dragEnd(ev){ if(ev.target&&ev.target.classList)ev.target.classList.remove("drag"); document.querySelectorAll(".col.drop").forEach(function(c){c.classList.remove("drop");}); }
function dragOver(ev,el){ ev.preventDefault(); try{ev.dataTransfer.dropEffect="move";}catch(e){} if(el&&el.classList)el.classList.add("drop"); }
function dropTo(ev,status,el){ ev.preventDefault(); if(el&&el.classList)el.classList.remove("drop"); var id=S.dragId; if(!id){try{id=ev.dataTransfer.getData("text/plain");}catch(e){}} S.dragId=null; if(id)moveTask(id,status); }
async function moveTask(id,status){
  var t=findTask(id); if(!t||t.status===status)return; var prev=t.status,prevDone=t.done_at;
  t.status=status; t.done_at=(status==="done"?todayISO():null);
  renderBoard();
  try{ var up=await biltia.update("tasks",id,{status:status,done_at:t.done_at}); for(var i=0;i<S.tasks.length;i++)if(S.tasks[i].id===id)S.tasks[i]=up; biltia.notify(status==="done"?"Tâche terminée ✓":"Tâche déplacée"); }
  catch(e){ t.status=prev; t.done_at=prevDone; renderBoard(); }
}

/* ── Vue : Équipe ── */
function renderEquipe(){
  var h='<div class="view-pad">';
  if(!S.employees.length){ h+=emptyState("👷","Aucun équipier","Ajoutez les membres de votre équipe pour leur attribuer des tâches.","openEmp(null)","+ Ajouter un équipier")+'</div>'; $("view").innerHTML=h; return; }
  var maxLoad=Math.max.apply(null,S.employees.map(function(e){return activeCount(e.id);}).concat([1]))||1;
  h+='<div class="section-h" style="margin-top:2px"><b>'+S.employees.length+' équipier'+(S.employees.length>1?"s":"")+'</b><button class="btn btn-ghost btn-sm" onclick="openEmp(null)">+ Équipier</button></div>';
  h+='<div class="grid-cards">'+S.employees.map(function(e){
    var nm=empName(e.id)||"Sans nom", role=[e.role,e.corps_metier].filter(function(x){return String(x||"").trim();}).join(" · ")||"Équipier", st=EMPST[e.statut]||EMPST.actif;
    var load=activeCount(e.id), done=S.tasks.filter(function(t){return t.assignee_id===e.id&&t.status==="done";}).length;
    return '<button class="mcard" onclick="openMember(\\''+e.id+'\\')"><div style="display:flex;align-items:center;gap:12px"><span class="avatar" style="background:'+avc(nm)+'">'+esc(initials(nm))+'</span><div style="min-width:0;flex:1"><div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(nm)+'</div><div class="s" style="color:var(--mut);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(role)+'</div></div><span class="badge '+st.b+'">'+st.l+'</span></div>'
      +'<div class="load-bar"><div class="load-fill" style="width:'+Math.round(load/maxLoad*100)+'%"></div></div>'
      +'<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--mut)"><span>'+load+' tâche'+(load>1?"s":"")+' en cours</span><span>'+done+' terminée'+(done>1?"s":"")+'</span></div></button>'; }).join("")+'</div>';
  h+='</div>'; $("view").innerHTML=h;
}
function openMember(id){
  var e=findEmp(id); if(!e)return; var nm=empName(id)||"Équipier";
  var mine=S.tasks.filter(function(t){return t.assignee_id===id && t.status!=="done";}).sort(function(a,b){return String(a.due_date||"9").localeCompare(String(b.due_date||"9"));});
  var h='<div class="modal-h"><div><div class="modal-title">'+esc(nm)+'</div><div class="modal-sub">'+esc([e.role,e.corps_metier].filter(Boolean).join(" · ")||"Équipier")+'</div></div><button class="x" onclick="closeModal()">✕</button></div>';
  h+='<div class="det-row"><span class="k">Charge actuelle</span><span class="v">'+mine.length+' tâche'+(mine.length>1?"s":"")+' active'+(mine.length>1?"s":"")+'</span></div>';
  if(e.tel) h+='<div class="det-row"><span class="k">Téléphone</span><span class="v">'+esc(e.tel)+'</span></div>';
  if(e.email) h+='<div class="det-row"><span class="k">Email</span><span class="v">'+esc(e.email)+'</span></div>';
  h+='<div style="margin-top:16px"><div class="fl" style="margin-bottom:8px">Tâches en cours</div>';
  if(!mine.length){ h+='<div style="color:var(--mut);font-size:13px;padding:6px 0">Aucune tâche active. 👌</div>'; }
  else { h+='<div class="list">'+mine.map(function(t){ var over=isOverdue(t); return '<button class="row" onclick="openTask(\\''+t.id+'\\')"><span class="row-mid"><span class="n">'+esc(t.title||"Tâche")+'</span><span class="s" style="color:'+(over?"#E11D48":"var(--mut)")+'">'+(t.status==="doing"?"En cours":"À faire")+(t.due_date?" · "+(over?"en retard ":"éch. ")+fmtDate(t.due_date):"")+'</span></span></button>'; }).join("")+'</div>'; }
  h+='</div>';
  h+='<div class="modal-actions"><button class="btn btn-primary" onclick="openTaskFor(\\''+id+'\\')">+ Tâche</button><button class="btn btn-ghost" onclick="openEmp(\\''+id+'\\')">Modifier</button></div>';
  openModal(h);
}
function openTaskFor(empId){ closeModal(); openTask(null); if(S.edit){ S.edit.assignee_id=empId; if($("t-assignee"))$("t-assignee").value=empId; } }
function openEmp(id){
  var e=id?findEmp(id):{ prenom:"",nom:"",role:"",corps_metier:"",tel:"",email:"",statut:"actif" };
  S.edit=JSON.parse(JSON.stringify(e));
  var h='<div class="modal-h"><div><div class="modal-title">'+(id?"Modifier l\\'équipier":"Nouvel équipier")+'</div></div><button class="x" onclick="closeModal()">✕</button></div>';
  h+='<div class="form-row"><div class="fg"><label class="fl">Prénom</label><input id="e-prenom" value="'+esc(e.prenom||"")+'"></div><div class="fg"><label class="fl">Nom *</label><input id="e-nom" value="'+esc(e.nom||"")+'"></div></div>';
  h+='<div class="form-row"><div class="fg"><label class="fl">Rôle</label><input id="e-role" value="'+esc(e.role||"")+'" placeholder="Chef d\\'équipe, compagnon…"></div><div class="fg"><label class="fl">Corps de métier</label><input id="e-metier" value="'+esc(e.corps_metier||"")+'" placeholder="Maçon, électricien…"></div></div>';
  h+='<div class="form-row"><div class="fg"><label class="fl">Téléphone</label><input id="e-tel" inputmode="tel" value="'+esc(e.tel||"")+'"></div><div class="fg"><label class="fl">Email</label><input id="e-email" inputmode="email" value="'+esc(e.email||"")+'"></div></div>';
  h+='<div class="fg"><label class="fl">Statut</label><div class="seg" id="e-seg">'+[["actif","Actif"],["arret","En arrêt"],["inactif","Inactif"]].map(function(o){return '<button type="button" onclick="empStatut(\\''+o[0]+'\\')" class="'+(e.statut===o[0]?"on":"")+'" style="'+(e.statut===o[0]?"background:var(--vio)":"")+'">'+o[1]+'</button>';}).join("")+'</div></div>';
  h+='<div class="modal-actions"><button class="btn btn-primary" id="e-save" onclick="empSave()">'+(id?"Enregistrer":"Ajouter")+'</button>'+(id?'<button class="btn btn-danger" style="flex:0 0 auto" onclick="empDel(\\''+id+'\\')">Retirer</button>':'')+'</div>';
  openModal(h);
}
function empStatut(k){ S.edit.statut=k; document.querySelectorAll("#e-seg button").forEach(function(b){b.className="";b.style.background="";}); var ks=["actif","arret","inactif"],i=ks.indexOf(k),btns=document.querySelectorAll("#e-seg button"); if(btns[i]){btns[i].className="on";btns[i].style.background="var(--vio)";} }
async function empSave(){
  var e=S.edit; ["prenom","nom","role","tel","email"].forEach(function(f){var el=$("e-"+f);if(el)e[f]=el.value;}); var em=$("e-metier"); if(em)e.corps_metier=em.value;
  if(!String(e.nom||"").trim()){ var el=$("e-nom"); if(el){el.classList.add("invalid");el.focus();} return; }
  var payload={ prenom:e.prenom||null, nom:String(e.nom).trim(), role:e.role||null, corps_metier:e.corps_metier||null, tel:e.tel||null, email:e.email||null, statut:e.statut||"actif" };
  var b=$("e-save"); if(b){b.disabled=true;b.textContent="Enregistrement…";}
  try{
    if(e.id){ var up=await biltia.update("employees",e.id,payload); for(var i=0;i<S.employees.length;i++)if(S.employees[i].id===e.id)S.employees[i]=up; biltia.notify("Équipier enregistré"); }
    else { var row=await biltia.create("employees",payload); S.employees.push(row); S.employees.sort(function(a,b){return String(a.nom).localeCompare(String(b.nom));}); biltia.notify("Équipier ajouté"); }
    closeModal(); render();
  }catch(err){ if(b){b.disabled=false;b.textContent=e.id?"Enregistrer":"Ajouter";} biltia.notify("Enregistrement impossible"); }
}
async function empDel(id){ if(!confirm("Retirer cet équipier ?"))return; try{ await biltia.remove("employees",id); S.employees=S.employees.filter(function(x){return x.id!==id;}); biltia.notify("Équipier retiré"); closeModal(); render(); }catch(e){} }

/* ── Tâche : créer / éditer ── */
function optEmp(sel){ var o='<option value="">— Non assignée —</option>'; S.employees.forEach(function(e){o+='<option value="'+e.id+'"'+(e.id===sel?" selected":"")+'>'+esc(empName(e.id))+'</option>';}); o+='<option value="__new">➕ Nouvel équipier…</option>'; return o; }
function optChantiers(sel){ var o='<option value="">— Aucun chantier —</option>'; S.chantiers.forEach(function(c){o+='<option value="'+c.id+'"'+(c.id===sel?" selected":"")+'>'+esc(c.nom)+'</option>';}); return o; }
function openTask(id){
  var t=id?findTask(id):{ title:"",description:"",status:"todo",priority:"normal",chantier_id:"",assignee_id:S.filterAssignee||"",due_date:"" };
  S.edit=JSON.parse(JSON.stringify(t));
  var h='<div class="modal-h"><div><div class="modal-title">'+(id?"Modifier la tâche":"Nouvelle tâche")+'</div></div><button class="x" onclick="closeModal()">✕</button></div>';
  h+='<div class="fg"><label class="fl">Intitulé *</label><input id="t-title" value="'+esc(t.title||"")+'" placeholder="Couler la dalle du R+2"></div>';
  h+='<div class="form-row"><div class="fg"><label class="fl">Assignée à</label><select id="t-assignee" onchange="tNewEmp(this.value)">'+optEmp(t.assignee_id)+'</select></div><div class="fg"><label class="fl">Chantier</label><select id="t-chantier">'+optChantiers(t.chantier_id)+'</select></div></div>';
  h+='<div class="form-row"><div class="fg"><label class="fl">Priorité</label><div class="seg" id="t-prio">'+["low","normal","high"].map(function(k){return '<button type="button" onclick="tPrio(\\''+k+'\\')" class="'+(t.priority===k?"on":"")+'" style="'+(t.priority===k?"background:"+PRIO[k].c:"")+'">'+PRIO[k].l+'</button>';}).join("")+'</div></div><div class="fg"><label class="fl">Échéance</label><input type="date" id="t-due" value="'+esc((t.due_date||"").slice(0,10))+'"></div></div>';
  h+='<div class="fg"><label class="fl">Statut</label><div class="seg" id="t-status">'+COLS.map(function(c){return '<button type="button" onclick="tStatus(\\''+c.k+'\\')" class="'+(t.status===c.k?"on":"")+'" style="'+(t.status===c.k?"background:"+c.c:"")+'">'+c.l+'</button>';}).join("")+'</div></div>';
  h+='<div class="fg"><label class="fl">Description</label><textarea id="t-desc" rows="2" placeholder="Précisions, consignes…">'+esc(t.description||"")+'</textarea></div>';
  h+='<div class="modal-actions"><button class="btn btn-primary" id="t-save" onclick="taskSave()">'+(id?"Enregistrer":"Créer la tâche")+'</button>'+(id?'<button class="btn btn-danger" style="flex:0 0 auto" onclick="taskDel(\\''+id+'\\')">Supprimer</button>':'')+'</div>';
  openModal(h);
}
function tPrio(k){ S.edit.priority=k; segOn("t-prio",["low","normal","high"],k,PRIO[k].c); }
function tStatus(k){ S.edit.status=k; segOn("t-status",["todo","doing","done"],k,(COLS.filter(function(c){return c.k===k;})[0]||{}).c||"var(--vio)"); }
function segOn(wrap,keys,k,color){ document.querySelectorAll("#"+wrap+" button").forEach(function(b){b.className="";b.style.background="";}); var i=keys.indexOf(k),btns=document.querySelectorAll("#"+wrap+" button"); if(btns[i]){btns[i].className="on";btns[i].style.background=color;} }
function tSync(){ var t=S.edit; if(!t)return; if($("t-title"))t.title=$("t-title").value; if($("t-chantier"))t.chantier_id=$("t-chantier").value; if($("t-due"))t.due_date=$("t-due").value; if($("t-desc"))t.description=$("t-desc").value; if($("t-assignee")&&$("t-assignee").value!=="__new")t.assignee_id=$("t-assignee").value; }
function tNewEmp(v){ if(!S.edit)return; if(v!=="__new"){S.edit.assignee_id=v;return;} tSync(); var nm=prompt("Nom de l\\'équipier :",""); if(nm&&nm.trim()){ biltia.create("employees",{nom:nm.trim()}).then(function(e){ S.employees.push(e); S.employees.sort(function(a,b){return String(a.nom).localeCompare(String(b.nom));}); S.edit.assignee_id=e.id; if($("t-assignee"))$("t-assignee").innerHTML=optEmp(e.id); biltia.notify("Équipier ajouté"); }).catch(function(){ if($("t-assignee"))$("t-assignee").value=S.edit.assignee_id||""; }); } else { if($("t-assignee"))$("t-assignee").value=S.edit.assignee_id||""; } }
async function taskSave(){
  tSync(); var t=S.edit;
  if(!String(t.title||"").trim()){ var el=$("t-title"); if(el){el.classList.add("invalid");el.focus();} return; }
  var payload={ title:String(t.title).trim(), description:t.description||null, status:t.status||"todo", priority:t.priority||"normal", chantier_id:t.chantier_id||null, assignee_id:t.assignee_id||null, due_date:t.due_date||null, done_at:(t.status==="done"?(t.done_at||todayISO()):null) };
  var b=$("t-save"); if(b){b.disabled=true;b.textContent="Enregistrement…";}
  try{
    if(t.id){ var up=await biltia.update("tasks",t.id,payload); for(var i=0;i<S.tasks.length;i++)if(S.tasks[i].id===t.id)S.tasks[i]=up; biltia.notify("Tâche enregistrée"); }
    else { var row=await biltia.create("tasks",payload); S.tasks.push(row); biltia.notify("Tâche créée"); }
    closeModal(); render();
  }catch(e){ if(b){b.disabled=false;b.textContent=t.id?"Enregistrer":"Créer la tâche";} biltia.notify("Enregistrement impossible"); }
}
async function taskDel(id){ if(!confirm("Supprimer cette tâche ?"))return; try{ await biltia.remove("tasks",id); S.tasks=S.tasks.filter(function(x){return x.id!==id;}); biltia.notify("Tâche supprimée"); closeModal(); render(); }catch(e){} }

/* ── Vue : Pilotage ── */
function renderPilotage(){
  var h='<div class="view-pad">';
  if(!S.tasks.length){ h+=emptyState("📊","Rien à piloter","Créez des tâches pour suivre la charge de l\\'équipe et l\\'avancement.","openTask(null)","+ Nouvelle tâche")+'</div>'; $("view").innerHTML=h; return; }
  var doing=S.tasks.filter(function(t){return t.status==="doing";}).length;
  var todo=S.tasks.filter(function(t){return (t.status||"todo")==="todo";}).length;
  var late=S.tasks.filter(isOverdue).length;
  var days7=lastDays(7), keys7={}; days7.forEach(function(d){keys7[d.key]=1;});
  var done7=S.tasks.filter(function(t){return t.status==="done" && t.done_at && keys7[String(t.done_at).slice(0,10)];}).length;
  h+='<div class="strip"><div class="strip-cell"><div class="strip-k">En cours</div><div class="strip-v">'+doing+'</div><div class="strip-s">tâches actives</div></div>'
    +'<div class="strip-cell"><div class="strip-k">À faire</div><div class="strip-v">'+todo+'</div><div class="strip-s">en attente</div></div>'
    +'<div class="strip-cell"><div class="strip-k">En retard</div><div class="strip-v" style="'+(late?"color:#E11D48":"")+'">'+late+'</div><div class="strip-s">'+(late?"à relancer":"aucune")+'</div></div>'
    +'<div class="strip-cell"><div class="strip-k">Terminées 7j</div><div class="strip-v" style="color:#059669">'+done7+'</div><div class="strip-s">cette semaine</div></div></div>';
  h+='<div class="charts-2" style="margin-top:14px"><div class="chart-card"><div class="chart-hd"><b>Charge par équipier</b><span class="rd" id="rd-load">—</span></div><div class="chart-host" id="ch-load"></div></div>'
    +'<div class="chart-card"><div class="chart-hd"><b>Terminées (7 jours)</b><span class="rd" id="rd-done">'+done7+'</span></div><div class="chart-host" id="ch-done"></div></div></div>';
  var lateList=S.tasks.filter(isOverdue).sort(function(a,b){return (daysTo(a.due_date)||0)-(daysTo(b.due_date)||0);}).slice(0,6);
  h+='<div class="section-h"><b>En retard</b>'+(late?'<span class="badge badge-red">'+late+'</span>':'')+'</div>';
  if(!lateList.length){ h+='<div class="row" style="cursor:default;color:var(--mut)"><span style="font-size:18px;margin-right:6px">👍</span>Aucune tâche en retard. L\\'équipe est à jour.</div>'; }
  else { h+='<div class="list">'+lateList.map(function(t){ var dd=Math.abs(daysTo(t.due_date)||0); return '<button class="row" onclick="openTask(\\''+t.id+'\\')"><span class="mini-av" style="margin:0;background:'+(t.assignee_id?avc(empName(t.assignee_id)):"#EDE7E1")+'">'+esc(t.assignee_id?initials(empName(t.assignee_id)):"?")+'</span><span class="row-mid"><span class="n">'+esc(t.title||"Tâche")+'</span><span class="s" style="color:#E11D48">En retard de '+dd+' j · '+esc(empName(t.assignee_id)||"non assignée")+'</span></span><span class="badge badge-red">'+fmtDate(t.due_date)+'</span></button>'; }).join("")+'</div>'; }
  h+='</div>'; $("view").innerHTML=h;
  try{
    var mem=S.employees.filter(function(e){return e.statut!=="inactif";});
    var loadSeries=mem.map(function(e){return {value:activeCount(e.id),label:(String(e.prenom||e.nom||"").split(" ")[0]||"—").slice(0,8),tip:empName(e.id)};});
    if(loadSeries.length){ var _mx=loadSeries.reduce(function(s,x){return Math.max(s,x.value);},0); if($("rd-load"))$("rd-load").textContent=_mx+" max"; drawBars($("ch-load"),loadSeries,{id:"load",color:"#EA580C",color2:"#FDBA74",fmt:function(v){return Math.round(v)+" tâche"+(v>1?"s":"");},rd:"rd-load",rdDef:_mx+" max"}); }
    var doneSeries=days7.map(function(d){ return {value:S.tasks.filter(function(t){return t.status==="done"&&t.done_at&&String(t.done_at).slice(0,10)===d.key;}).length, label:d.label, tip:"Terminées"}; });
    drawBars($("ch-done"),doneSeries,{id:"done7",color:"#16A34A",color2:"#6EE7B7",fmt:function(v){return Math.round(v);},rd:"rd-done",rdDef:String(done7)});
  }catch(e){}
}

/* ── Modale ── */
function openModal(html){ $("modal").innerHTML=html; $("ovl").hidden=false; $("modal").scrollTop=0; }
function closeModal(){ $("ovl").hidden=true; $("modal").innerHTML=""; S.edit=null; }
document.addEventListener("click",function(e){ if(e.target&&e.target.id==="ovl")closeModal(); });

/* ── Init ── */
function initBrand(){ if(!S.entreprise||S.entreprise.indexOf("__")===0)S.entreprise="Mon entreprise"; var eb=S.entreprise.toUpperCase().slice(0,22); ["side-eyebrow","hd-eyebrow","tb-eyebrow"].forEach(function(i){var el=$(i);if(el)el.textContent=eb;}); ["side-logo","hd-logo"].forEach(function(i){var el=$(i);if(el)el.textContent=initials(S.entreprise)||"B";}); }
var _rz;
function start(){ initBrand(); renderNav(); boot(); if(window.addEventListener)window.addEventListener("resize",function(){ if(_rz)clearTimeout(_rz); _rz=setTimeout(function(){ if(S.view==="pilotage")render(); },200); }); }
if(document.readyState!=="loading"){ start(); } else { document.addEventListener("DOMContentLoaded",start); }
${CHART_ENGINE_JS}
</script>
</body>
</html>`;
