// ─────────────────────────────────────────────────────────────────────────────
// APP PHARE — PLANNING CHANTIER (grille agenda semaine, layout distinct)
//
// 5e app phare. Layout à part : une GRILLE hebdomadaire (équipiers × jours), on
// affecte un chantier à un équipier pour un jour d'un clic sur la cellule, on
// navigue de semaine en semaine. Identité BLEU CIEL (≠ indigo/teal/violet/orange).
// 3 vues : Planning (grille) · Aujourd'hui (dispatch du jour) · Équipe (charge/dispo).
//
// Le « planning » n'a pas d'entité workspace dédiée → collection libre
// window.biltia('planning') { employee_id, chantier_id, date (AAAA-MM-JJ), note }.
// Aussi : employees, chantiers. Le SDK est injecté à l'instanciation.
// Contrainte : PAS de template literals NI de backticks dans le JS de l'app.
// ─────────────────────────────────────────────────────────────────────────────

import { CHART_CSS, CHART_ENGINE_JS } from "@/lib/app-charts";

export const APP_PLANNING_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Planning chantier</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
img,svg{max-width:100%}
:root{--bg:#F4F8FB;--ink:#0F1B24;--mut:#57697A;--faint:#93A4B4;--line:#E2EAF1;--soft:#EBF2F8;
--vio:#0284C7;--grad:#0284C7;--glow:2,132,199;--tint:#E0F2FE;--tintline:#B6E0F5;
--shadow:0 1px 2px rgba(15,27,36,.04),0 6px 18px rgba(15,27,36,.05);--shadow-lg:0 14px 44px rgba(15,27,36,.14)}
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
.badge-gray{background:#EEF2F6;color:#57697A;border:1px solid #E2EAF1}
input,select,textarea{font-family:inherit;font-size:16px;color:var(--ink);background:#fff;border:1px solid #D8E3EC;border-radius:12px;padding:10px 14px;width:100%;outline:none;transition:border .15s,box-shadow .15s}
input:focus,select:focus,textarea:focus{border-color:var(--vio);box-shadow:0 0 0 3px rgba(var(--glow),.14)}
input::placeholder,textarea::placeholder{color:#93A4B4}
input.invalid,select.invalid{border-color:#E11D48;box-shadow:0 0 0 3px rgba(225,29,72,.12)}
.shell{display:flex;min-height:100vh}
.sidebar{display:none}
.app-main{flex:1;min-width:0;padding:0 0 90px}
.app-header{position:fixed;top:0;left:0;right:0;z-index:100;background:rgba(244,248,251,.85);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-bottom:1px solid var(--line);height:60px;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 14px}
.brand{display:flex;align-items:center;gap:10px;min-width:0}
.brand-logo{width:30px;height:30px;border-radius:9px;background:var(--grad);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:14px;flex-shrink:0}
.app-eyebrow{font-size:10px;font-weight:700;color:var(--vio);text-transform:uppercase;letter-spacing:.12em;display:block;line-height:1.2}
.app-title{font-size:15px;font-weight:800;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px;line-height:1.2}
.mtop{height:60px}
.tab-bar{position:fixed;bottom:0;left:0;right:0;background:rgba(244,248,251,.94);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-top:1px solid var(--line);display:flex;z-index:100}
.tab-item{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:8px 4px 10px;cursor:pointer;border:none;background:none;font-size:10px;font-weight:600;color:#93A4B4;font-family:inherit;min-height:56px}
.tab-item.active{color:var(--vio)}
.tab-ic{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.fab{position:fixed;right:16px;bottom:78px;z-index:120;width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;color:#fff;font-size:28px;line-height:1;background:var(--grad);box-shadow:0 8px 22px rgba(var(--glow),.30);display:flex;align-items:center;justify-content:center}
.fab:active{transform:scale(.94)}
.view-pad{padding:16px}
.topbar{display:none}
.section-h{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:22px 2px 12px}
.section-h b{font-size:15px;font-weight:700}
.empty{text-align:center;padding:52px 20px}
.empty-ico{width:54px;height:54px;border-radius:16px;background:var(--tint);color:var(--vio);display:flex;align-items:center;justify-content:center;margin:0 auto 14px;font-size:24px}
.empty-title{font-weight:700;margin-bottom:4px}
.empty-sub{font-size:13px;color:var(--mut);margin-bottom:16px}
.spin{width:26px;height:26px;border:3px solid var(--line);border-top-color:var(--vio);border-radius:50%;animation:sp .7s linear infinite;margin:60px auto}
@keyframes sp{to{transform:rotate(360deg)}}
.mini-av{width:26px;height:26px;border-radius:8px;font-size:10px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;flex-shrink:0}
/* ── Copilote planning (bandeau IA) ── */
.ai-bar{border:1px solid var(--tintline);background:linear-gradient(180deg,var(--tint),#fff);border-radius:16px;padding:13px 15px;margin-bottom:14px;box-shadow:var(--shadow)}
.ai-bar.warn{border-color:#FDE68A;background:linear-gradient(180deg,#FFFBEB,#fff)}
.ai-bar-hd{display:flex;align-items:center;gap:11px}
.ai-spark{width:30px;height:30px;border-radius:9px;background:var(--grad);color:#fff;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;box-shadow:0 4px 12px rgba(var(--glow),.28)}
.ai-bar.warn .ai-spark{background:#F59E0B;box-shadow:0 4px 12px rgba(245,158,11,.28)}
.ai-eyebrow{display:block;font-size:10px;font-weight:700;color:var(--vio);text-transform:uppercase;letter-spacing:.1em;line-height:1.2}
.ai-bar.warn .ai-eyebrow{color:#B45309}
.ai-line{font-size:13.5px;font-weight:700;line-height:1.35;display:block}
.ai-chips{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}
.ai-chip{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;padding:6px 11px;border-radius:9999px;border:1px solid var(--line);background:#fff;color:var(--mut);font-family:inherit;line-height:1.3;text-align:left}
button.ai-chip{cursor:pointer}
button.ai-chip:active{transform:scale(.97)}
.ai-chip.ai-warn{background:#FFF1F2;color:#E11D48;border-color:#FECDD3}
.ai-chip.ai-ok{background:#ECFDF5;color:#059669;border-color:#A7F3D0}
.ai-chip.ai-mut{background:var(--soft)}
/* ── Barre semaine ── */
.wk-nav{display:flex;align-items:center;gap:10px;margin-bottom:14px}
.wk-btn{width:36px;height:36px;border-radius:10px;border:1px solid var(--line);background:#fff;cursor:pointer;font-size:18px;color:var(--ink);flex-shrink:0}
.wk-btn:hover{border-color:var(--tintline)}
.wk-lbl{line-height:1.15}.wk-lbl b{font-size:15px;display:block}.wk-lbl span{font-size:11px;color:var(--mut)}
.wk-nav .btn{margin-left:auto}
/* ── Grille planning ── */
.pl-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid var(--line);border-radius:16px;background:#fff;box-shadow:var(--shadow)}
.pl-grid{display:grid;min-width:760px}
.pl-cell{border-bottom:1px solid var(--line);border-right:1px solid var(--line)}
.pl-head{padding:9px 6px;font-weight:700;font-size:11px;text-align:center;color:var(--mut);text-transform:uppercase;letter-spacing:.03em;background:var(--soft)}
.pl-head span{display:block;font-size:11px;color:var(--faint);font-weight:600;text-transform:none;margin-top:1px}
.pl-corner{background:var(--soft);position:sticky;left:0;z-index:3}
.pl-name{position:sticky;left:0;z-index:1;background:#fff;display:flex;align-items:center;gap:8px;padding:8px 10px;min-height:66px}
.pl-nm{font-weight:600;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pl-day{display:flex;padding:6px;min-height:66px;cursor:pointer}
.pl-day:hover{background:var(--soft)}
.pl-today{background:var(--tint)}
.pl-chip{flex:1;border-radius:8px;padding:6px 8px;font-size:11px;line-height:1.25;min-width:0}
.pl-chip b{font-weight:700;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pl-chip span{color:var(--mut);font-size:10px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pl-plus{margin:auto;color:var(--faint);font-size:18px;opacity:0;transition:opacity .15s}
.pl-day:hover .pl-plus{opacity:1}
/* ── Aujourd'hui / Équipe ── */
.card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:16px;box-shadow:var(--shadow)}
.disp{background:#fff;border:1px solid var(--line);border-radius:16px;padding:14px 16px;box-shadow:var(--shadow);margin-bottom:12px;border-left:4px solid var(--vio)}
.disp-h{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
.disp-h b{font-weight:700}
.people{display:flex;flex-wrap:wrap;gap:8px}
.chipp{display:inline-flex;align-items:center;gap:7px;background:var(--soft);border:1px solid var(--line);border-radius:9999px;padding:4px 11px 4px 4px;font-size:12.5px;font-weight:600}
.grid-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr));gap:12px}
.mcard{background:#fff;border:1px solid var(--line);border-radius:16px;padding:16px;box-shadow:var(--shadow);cursor:pointer;text-align:left;width:100%}
.mcard:hover{box-shadow:0 6px 20px rgba(15,27,36,.08);border-color:var(--tintline)}
.avatar{width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:#fff;flex-shrink:0}
.wk-dots{display:flex;gap:5px;margin:12px 0 8px}
.wk-dot{flex:1;height:7px;border-radius:3px;background:#E2EAF1}
.wk-dot.on{background:var(--grad)}
/* Modale */
.overlay{position:fixed;inset:0;background:rgba(10,20,28,.44);backdrop-filter:blur(6px);z-index:200;display:flex;align-items:flex-end;justify-content:center}
.overlay[hidden]{display:none}
@media(min-width:600px){.overlay{align-items:center;padding:20px}}
.modal{background:#fff;border-radius:24px 24px 0 0;width:100%;max-width:520px;max-height:92vh;overflow-y:auto;padding:22px 20px calc(22px + env(safe-area-inset-bottom));box-shadow:var(--shadow-lg)}
@media(min-width:600px){.modal{border-radius:24px}}
.modal-h{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px}
.modal-title{font-size:18px;font-weight:800;letter-spacing:-.01em}
.modal-sub{font-size:12.5px;color:var(--mut);margin-top:2px}
.x{border:none;background:var(--soft);width:34px;height:34px;border-radius:10px;color:var(--mut);font-size:18px;cursor:pointer;flex-shrink:0}
.fg{margin-bottom:14px}
.fl{display:block;font-size:11px;font-weight:700;color:#57697A;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}
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
  .side-item.active{background:var(--tint);color:var(--vio)}
  .side-item svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}
  .app-main{padding:0 0 40px}
  .topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:26px 32px 6px}
  .view-pad{padding:16px 32px}
  .pl-grid{min-width:0}
}
@media(max-width:400px){.view-pad{padding:13px}.app-title{max-width:120px}.btn{padding:11px 15px}}
@media(min-width:1600px){.topbar,.view-pad{max-width:1520px;margin-left:auto;margin-right:auto}}
@media print{.sidebar,.app-header,.tab-bar,.fab,.no-print{display:none!important}}
${CHART_CSS}
</style>
</head>
<body>
<div class="shell">
  <aside class="sidebar">
    <div class="side-brand"><span class="brand-logo" id="side-logo">B</span><div style="min-width:0"><span class="app-eyebrow" id="side-eyebrow">BILTIA</span><span class="app-title" id="side-title">Planning</span></div></div>
    <nav class="side-nav" id="side-nav"></nav>
  </aside>
  <div class="app-main">
    <header class="app-header">
      <div class="brand"><span class="brand-logo" id="hd-logo">B</span><div style="min-width:0"><span class="app-eyebrow" id="hd-eyebrow">BILTIA</span><span class="app-title">Planning</span></div></div>
      <button class="btn btn-primary btn-sm" id="hd-add" onclick="primaryAdd()">+ Affecter</button>
    </header>
    <div class="mtop"></div>
    <div class="topbar">
      <div><span class="app-eyebrow" id="tb-eyebrow">BILTIA</span><div id="tb-title" style="font-size:22px;font-weight:800;letter-spacing:-.02em">Planning</div></div>
      <button class="btn btn-primary" id="tb-add" onclick="primaryAdd()">+ Affecter une équipe</button>
    </div>
    <main id="view"><div class="spin"></div></main>
  </div>
</div>
<nav class="tab-bar" id="tab-bar"></nav>
<button class="fab" onclick="primaryAdd()" aria-label="Ajouter">+</button>
<div class="overlay" id="ovl" hidden><div class="modal" id="modal"></div></div>

<script>
var S={ view:"planning", planning:[], employees:[], chantiers:[], entreprise:"__ENTREPRISE__", weekStart:"", edit:null };
var $=function(id){return document.getElementById(id);};
function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
function pad2(n){return String(n).padStart(2,"0");}
function todayISO(){var d=new Date();return d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate());}
function initials(s){var w=String(s||"?").trim().split(/\\s+/);return ((w[0]||"?")[0]+(w[1]?w[1][0]:"")).toUpperCase();}
var AV=["#0284C7","#4F46E5","#DB2777","#EA580C","#0D9488","#7C3AED","#059669","#DC2626"];
function avc(seed){var s=String(seed||""),h=0;for(var i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;return AV[h%AV.length];}
var WD=["dim","lun","mar","mer","jeu","ven","sam"];
var WDL=["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"];
function mondayOf(iso){var d=new Date(String(iso||todayISO()).slice(0,10));d.setDate(d.getDate()-((d.getDay()+6)%7));return d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate());}
function weekDays(startISO){var out=[];var b=new Date(String(startISO).slice(0,10));for(var i=0;i<7;i++){var d=new Date(b);d.setDate(b.getDate()+i);out.push({key:d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate()),wd:WD[d.getDay()],dm:pad2(d.getDate())+"/"+pad2(d.getMonth()+1)});}return out;}
function fmtLong(iso){var d=new Date(String(iso).slice(0,10));return WDL[d.getDay()]+" "+pad2(d.getDate())+"/"+pad2(d.getMonth()+1);}
function findEmp(id){for(var i=0;i<S.employees.length;i++)if(S.employees[i].id===id)return S.employees[i];return null;}
function empName(id){var e=findEmp(id);return e?(((e.prenom||"")+" "+(e.nom||"")).trim()||e.nom||""):"";}
function chantierName(id){for(var i=0;i<S.chantiers.length;i++)if(S.chantiers[i].id===id)return S.chantiers[i].nom;return "";}
function findPlan(empId,date){for(var i=0;i<S.planning.length;i++){var p=S.planning[i];if(p.employee_id===empId&&String(p.date).slice(0,10)===String(date).slice(0,10))return p;}return null;}
function activeEmps(){return S.employees.filter(function(e){return e.statut!=="inactif";});}

var NAV=[
  {id:"planning",label:"Planning",icon:'<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18"/><path d="M8 2v4"/><path d="M16 2v4"/><path d="M8 13h3"/><path d="M8 17h3"/>'},
  {id:"jour",label:"Aujourd\\'hui",icon:'<circle cx="12" cy="12" r="4"/><path d="M12 2v3"/><path d="M12 19v3"/><path d="M2 12h3"/><path d="M19 12h3"/><path d="M5 5l2 2"/><path d="M17 17l2 2"/><path d="M17 7l2-2"/><path d="M5 19l2-2"/>'},
  {id:"equipe",label:"Équipe",icon:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'}
];

async function boot(){
  try{
    var r=await Promise.all([
      biltia.list("planning",{limit:2000}).catch(function(){return[];}),
      biltia.list("employees",{order:"nom",ascending:true,limit:400}).catch(function(){return[];}),
      biltia.list("chantiers",{order:"created_at",ascending:false,limit:600}).catch(function(){return[];})
    ]);
    S.planning=r[0]||[]; S.employees=r[1]||[]; S.chantiers=r[2]||[];
    renderNav(); render();
  }catch(e){ $("view").innerHTML='<div class="view-pad"><div class="empty"><div class="empty-ico">⚠️</div><div class="empty-title">Connexion au workspace impossible</div><div class="empty-sub">Vérifiez votre connexion puis rouvrez l\\'application.</div></div></div>'; }
}
function renderNav(){
  $("side-nav").innerHTML=NAV.map(function(n){return '<button class="side-item'+(S.view===n.id?" active":"")+'" onclick="go(\\''+n.id+'\\')"><svg viewBox="0 0 24 24">'+n.icon+'</svg><span>'+n.label+'</span></button>';}).join("");
  $("tab-bar").innerHTML=NAV.map(function(n){return '<button class="tab-item'+(S.view===n.id?" active":"")+'" onclick="go(\\''+n.id+'\\')"><svg class="tab-ic" viewBox="0 0 24 24">'+n.icon+'</svg><span>'+n.label+'</span></button>';}).join("");
}
function go(v){ S.view=v; renderNav(); render(); try{window.scrollTo(0,0);}catch(e){} }
function primaryAdd(){ if(S.view==="equipe") openEmp(null); else openAssign(null,(S.view==="jour"?todayISO():null)); }
function render(){
  var titles={planning:"Planning",jour:"Aujourd\\'hui",equipe:"Équipe"};
  $("tb-title").textContent=titles[S.view]||"";
  if($("hd-add"))$("hd-add").textContent=(S.view==="equipe"?"+ Équipier":"+ Affecter");
  if($("tb-add"))$("tb-add").textContent=(S.view==="equipe"?"+ Nouvel équipier":"+ Affecter une équipe");
  if(S.view==="planning") renderPlanning();
  else if(S.view==="jour") renderJour();
  else renderEquipe();
}
function emptyState(ico,title,sub,onclick,btn){return '<div class="empty"><div class="empty-ico">'+ico+'</div><div class="empty-title">'+title+'</div><div class="empty-sub">'+sub+'</div><button class="btn btn-primary" onclick="'+onclick+'">'+btn+'</button></div>';}

/* ── Copilote planning : bandeau IA calculé CÔTÉ CLIENT à partir de la grille.
   Il ne prétend jamais qu'un agent « tourne » (l'app ne peut pas le vérifier) : il
   montre l'ÉTAT — semaine prête, non planifiés, et surtout QUI ne recevra pas son
   planning faute d'email. C'est exactement l'entrée dont l'agent d'envoi a besoin. ── */
function validEmail(s){ return String(s||"").indexOf("@")>0; }
function planningInsights(){
  var days=weekDays(S.weekStart), keys={}; days.forEach(function(d){keys[d.key]=1;});
  var emps=activeEmps(), activeSet={}; emps.forEach(function(e){activeSet[e.id]=1;});
  var assigned={}, affect=0;
  S.planning.forEach(function(p){ var dk=String(p.date).slice(0,10); if(keys[dk]&&p.employee_id&&activeSet[p.employee_id]){ assigned[p.employee_id]=1; affect++; } });
  var nonPlanifies=emps.filter(function(e){return !assigned[e.id];});
  var sansEmail=emps.filter(function(e){return assigned[e.id] && !validEmail(e.email);});
  return { total:emps.length, affect:affect, planned:Object.keys(assigned).length, nonPlanifies:nonPlanifies, sansEmail:sansEmail };
}
function insightsBar(){
  var ins=planningInsights();
  if(!ins.total) return "";
  var tone=ins.affect===0?"warn":"ok", head;
  if(ins.affect===0){ head="Semaine à planifier — "+ins.total+" équipier"+(ins.total>1?"s":"")+" en attente d\\'affectation"; }
  else { head="Semaine prête · "+ins.affect+" affectation"+(ins.affect>1?"s":"")+" · "+ins.planned+"/"+ins.total+" équipiers planifiés"; }
  var chips="";
  if(ins.sansEmail.length){
    var names=ins.sansEmail.slice(0,2).map(function(e){return empName(e.id);}).filter(Boolean).join(", ")+(ins.sansEmail.length>2?" +"+(ins.sansEmail.length-2):"");
    chips+='<button class="ai-chip ai-warn" onclick="openEmp(\\''+ins.sansEmail[0].id+'\\')">⚠ '+ins.sansEmail.length+' sans email — n\\'auront pas leur planning'+(names?' ('+esc(names)+')':'')+'</button>';
  }
  if(ins.nonPlanifies.length){
    chips+='<span class="ai-chip ai-mut">'+ins.nonPlanifies.length+' non planifié'+(ins.nonPlanifies.length>1?"s":"")+' cette semaine</span>';
  }
  if(ins.affect>0 && !ins.sansEmail.length && !ins.nonPlanifies.length){
    chips+='<span class="ai-chip ai-ok">✓ Toute l\\'équipe est planifiée et joignable</span>';
  }
  return '<div class="ai-bar '+tone+'"><div class="ai-bar-hd"><span class="ai-spark">✦</span><div style="min-width:0"><span class="ai-eyebrow">Copilote planning</span><b class="ai-line">'+esc(head)+'</b></div></div>'+(chips?'<div class="ai-chips">'+chips+'</div>':'')+'</div>';
}

/* ── Vue : Planning (grille) ── */
function shiftWeek(n){ var d=new Date(S.weekStart);d.setDate(d.getDate()+n*7);S.weekStart=d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate());renderPlanning(); }
function prevWeek(){shiftWeek(-1);} function nextWeek(){shiftWeek(1);} function thisWeek(){S.weekStart=mondayOf(todayISO());renderPlanning();}
function renderPlanning(){
  var days=weekDays(S.weekStart), emps=activeEmps(), today=todayISO();
  var h='<div class="view-pad">';
  h+='<div class="wk-nav"><button class="wk-btn" onclick="prevWeek()" aria-label="Semaine précédente">‹</button><div class="wk-lbl"><b>Semaine du '+days[0].dm+'</b><span>au '+days[6].dm+'</span></div><button class="wk-btn" onclick="nextWeek()" aria-label="Semaine suivante">›</button><button class="btn btn-ghost btn-sm" onclick="thisWeek()">Cette semaine</button></div>';
  h+=insightsBar();
  h+='<div class="chart-card" style="margin-bottom:14px"><div class="chart-hd"><b>Occupation de l\\'équipe</b><span class="rd" id="rd-occ">—</span></div><div class="chart-host" id="ch-occ"></div></div>';
  if(!emps.length){ h+=emptyState("📅","Aucun équipier","Ajoutez des équipiers pour construire votre planning de la semaine.","openEmp(null)","+ Ajouter un équipier")+'</div>'; $("view").innerHTML=h; return; }
  h+='<div class="pl-wrap"><div class="pl-grid" style="grid-template-columns:132px repeat(7,minmax(102px,1fr))">';
  h+='<div class="pl-cell pl-corner pl-head" style="text-align:left;padding-left:12px">Équipe</div>';
  days.forEach(function(d){ h+='<div class="pl-cell pl-head'+(d.key===today?" pl-today":"")+'">'+d.wd+'<span>'+d.dm+'</span></div>'; });
  emps.forEach(function(e){
    var nm=empName(e.id)||"Sans nom";
    h+='<div class="pl-cell pl-name"><span class="mini-av" style="background:'+avc(nm)+'">'+esc(initials(nm))+'</span><span class="pl-nm">'+esc(nm)+'</span></div>';
    days.forEach(function(d){ var p=findPlan(e.id,d.key); var col=p?avc(chantierName(p.chantier_id)||p.chantier_id):"";
      h+='<div class="pl-cell pl-day'+(d.key===today?" pl-today":"")+'" onclick="openAssign(\\''+e.id+'\\',\\''+d.key+'\\')">'+(p?'<div class="pl-chip" style="background:'+col+'1A;border-left:3px solid '+col+'"><b>'+esc(chantierName(p.chantier_id)||"Chantier")+'</b>'+(p.note?'<span>'+esc(p.note)+'</span>':'')+'</div>':'<span class="pl-plus">+</span>')+'</div>';
    });
  });
  h+='</div></div></div>'; $("view").innerHTML=h;
  try{
    var occ=days.map(function(d){ return {value:S.planning.filter(function(p){return String(p.date).slice(0,10)===d.key && emps.some(function(e){return e.id===p.employee_id;});}).length, label:d.wd, tip:d.dm}; });
    var tot=occ.reduce(function(s,x){return s+x.value;},0);
    if($("rd-occ"))$("rd-occ").textContent=tot+" affectation"+(tot>1?"s":"");
    drawBars($("ch-occ"),occ,{id:"occ",color:"#0284C7",color2:"#7DD3FC",fmt:function(v){return Math.round(v)+" pers.";},rd:"rd-occ",rdDef:tot+" affectation"+(tot>1?"s":"")});
  }catch(e){}
}

/* ── Vue : Aujourd'hui ── */
function renderJour(){
  var today=todayISO(), emps=activeEmps();
  var todayPlan=S.planning.filter(function(p){return String(p.date).slice(0,10)===today;});
  var h='<div class="view-pad"><div class="wk-lbl" style="margin-bottom:14px"><b style="font-size:18px">'+fmtLong(today)+'</b><span>'+todayPlan.length+' affectation'+(todayPlan.length>1?"s":"")+' aujourd\\'hui</span></div>';
  var byCh={}, order=[];
  todayPlan.forEach(function(p){ var c=p.chantier_id||"?"; if(!byCh[c]){byCh[c]=[];order.push(c);} byCh[c].push(p); });
  if(!order.length){ h+='<div class="card" style="display:flex;align-items:center;gap:12px;color:var(--mut)"><span style="font-size:20px">🌤️</span><span>Personne n\\'est planifié aujourd\\'hui. Affectez votre équipe depuis le planning.</span></div>'; }
  else { h+=order.map(function(c){ var col=avc(chantierName(c)||c);
      return '<div class="disp" style="border-left-color:'+col+'"><div class="disp-h"><b>'+esc(chantierName(c)||"Sans chantier")+'</b><span class="badge badge-gray">'+byCh[c].length+' pers.</span></div><div class="people">'+byCh[c].map(function(p){var nm=empName(p.employee_id)||"Équipier";return '<span class="chipp"><span class="mini-av" style="width:22px;height:22px;background:'+avc(nm)+'">'+esc(initials(nm))+'</span>'+esc(nm)+(p.note?' · '+esc(p.note):'')+'</span>';}).join("")+'</div></div>'; }).join(""); }
  var planned={}; todayPlan.forEach(function(p){planned[p.employee_id]=1;});
  var libres=emps.filter(function(e){return !planned[e.id];});
  h+='<div class="section-h"><b>Non planifiés</b>'+(libres.length?'<span class="badge badge-amber">'+libres.length+'</span>':'')+'</div>';
  if(!libres.length){ h+='<div class="card" style="color:var(--mut)">Toute l\\'équipe est affectée. 👍</div>'; }
  else { h+='<div class="people">'+libres.map(function(e){var nm=empName(e.id);return '<button class="chipp" style="cursor:pointer" onclick="openAssign(\\''+e.id+'\\',\\''+today+'\\')"><span class="mini-av" style="width:22px;height:22px;background:'+avc(nm)+'">'+esc(initials(nm))+'</span>'+esc(nm)+'</button>';}).join("")+'</div>'; }
  h+='</div>'; $("view").innerHTML=h;
}

/* ── Vue : Équipe ── */
var EMPST={ actif:{l:"Disponible",b:"badge-green"}, arret:{l:"En arrêt",b:"badge-amber"}, inactif:{l:"Inactif",b:"badge-gray"} };
function weekDots(empId){ var days=weekDays(S.weekStart); return days.map(function(d){ return findPlan(empId,d.key)?1:0; }); }
function renderEquipe(){
  var h='<div class="view-pad">';
  if(!S.employees.length){ h+=emptyState("👷","Aucun équipier","Ajoutez les membres de votre équipe pour les planifier.","openEmp(null)","+ Ajouter un équipier")+'</div>'; $("view").innerHTML=h; return; }
  h+='<div class="section-h" style="margin-top:2px"><b>'+S.employees.length+' équipier'+(S.employees.length>1?"s":"")+'</b><button class="btn btn-ghost btn-sm" onclick="openEmp(null)">+ Équipier</button></div>';
  h+='<div class="grid-cards">'+S.employees.map(function(e){
    var nm=empName(e.id)||"Sans nom", role=[e.role,e.corps_metier].filter(function(x){return String(x||"").trim();}).join(" · ")||"Équipier", st=EMPST[e.statut]||EMPST.actif;
    var dots=weekDots(e.id), nbj=dots.reduce(function(s,x){return s+x;},0);
    return '<button class="mcard" onclick="openEmp(\\''+e.id+'\\')"><div style="display:flex;align-items:center;gap:12px"><span class="avatar" style="background:'+avc(nm)+'">'+esc(initials(nm))+'</span><div style="min-width:0;flex:1"><div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(nm)+'</div><div style="color:var(--mut);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(role)+'</div></div><span class="badge '+st.b+'">'+st.l+'</span></div>'
      +'<div class="wk-dots">'+dots.map(function(x){return '<span class="wk-dot'+(x?" on":"")+'"></span>';}).join("")+'</div>'
      +'<div style="font-size:12px;color:var(--mut)">'+nbj+(nbj>1?" jours planifiés":" jour planifié")+' cette semaine</div></button>'; }).join("")+'</div>';
  h+='</div>'; $("view").innerHTML=h;
}

/* ── Affectation ── */
function optEmp(sel){ var o='<option value="">— Choisir un équipier —</option>'; S.employees.forEach(function(e){o+='<option value="'+e.id+'"'+(e.id===sel?" selected":"")+'>'+esc(empName(e.id))+'</option>';}); return o; }
function optChantiers(sel){ var o='<option value="">— Aucun (jour libre) —</option>'; S.chantiers.forEach(function(c){o+='<option value="'+c.id+'"'+(c.id===sel?" selected":"")+'>'+esc(c.nom)+'</option>';}); o+='<option value="__new">➕ Nouveau chantier…</option>'; return o; }
function openAssign(empId,dateKey){
  var existing=(empId&&dateKey)?findPlan(empId,dateKey):null;
  S.edit={ id:existing?existing.id:null, employee_id:empId||(existing?existing.employee_id:""), date:String(dateKey||(existing?existing.date:todayISO())).slice(0,10), chantier_id:existing?existing.chantier_id:"", note:existing?(existing.note||""):"" };
  var e=S.edit;
  var h='<div class="modal-h"><div><div class="modal-title">'+(existing?"Modifier l\\'affectation":"Affecter une équipe")+'</div><div class="modal-sub">'+(e.employee_id?esc(empName(e.employee_id))+" · ":"")+fmtLong(e.date)+'</div></div><button class="x" onclick="closeModal()">✕</button></div>';
  h+='<div class="form-row"><div class="fg"><label class="fl">Équipier *</label><select id="a-emp">'+optEmp(e.employee_id)+'</select></div><div class="fg"><label class="fl">Jour</label><input type="date" id="a-date" value="'+esc(e.date)+'"></div></div>';
  h+='<div class="fg"><label class="fl">Chantier</label><select id="a-ch" onchange="aNewCh(this.value)">'+optChantiers(e.chantier_id)+'</select></div>';
  h+='<div class="fg"><label class="fl">Note (facultatif)</label><input id="a-note" value="'+esc(e.note||"")+'" placeholder="Matin, tâche précise…"></div>';
  h+='<div class="modal-actions"><button class="btn btn-primary" id="a-save" onclick="assignSave()">'+(existing?"Enregistrer":"Affecter")+'</button>'+(existing?'<button class="btn btn-danger" style="flex:0 0 auto" onclick="assignDel(\\''+existing.id+'\\')">Retirer</button>':'')+'</div>';
  openModal(h);
}
function aNewCh(v){ if(v!=="__new"){S.edit.chantier_id=v;return;} var nm=prompt("Nom du chantier :",""); if(nm&&nm.trim()){ biltia.create("chantiers",{nom:nm.trim(),statut:"en_cours"}).then(function(c){ S.chantiers.unshift(c); S.edit.chantier_id=c.id; if($("a-ch"))$("a-ch").innerHTML=optChantiers(c.id); biltia.notify("Chantier créé"); }).catch(function(){ if($("a-ch"))$("a-ch").value=S.edit.chantier_id||""; }); } else { if($("a-ch"))$("a-ch").value=S.edit.chantier_id||""; } }
async function assignSave(){
  var e=S.edit;
  if($("a-emp"))e.employee_id=$("a-emp").value; if($("a-date"))e.date=$("a-date").value; if($("a-ch")&&$("a-ch").value!=="__new")e.chantier_id=$("a-ch").value; if($("a-note"))e.note=$("a-note").value;
  if(!e.employee_id){ var s=$("a-emp"); if(s){s.classList.add("invalid");s.focus();} return; }
  if(!e.date){ biltia.notify("Choisissez un jour"); return; }
  var cur=findPlan(e.employee_id,e.date);
  var b=$("a-save"); if(b){b.disabled=true;b.textContent="Enregistrement…";}
  try{
    if(!e.chantier_id){ if(cur){ await biltia.remove("planning",cur.id); S.planning=S.planning.filter(function(x){return x.id!==cur.id;}); biltia.notify("Jour libéré"); } closeModal(); render(); return; }
    var payload={ employee_id:e.employee_id, chantier_id:e.chantier_id, date:e.date, note:e.note||null };
    if(cur){ var up=await biltia.update("planning",cur.id,payload); for(var i=0;i<S.planning.length;i++)if(S.planning[i].id===cur.id)S.planning[i]=up; }
    else { var row=await biltia.create("planning",payload); S.planning.push(row); }
    biltia.notify("Affectation enregistrée"); closeModal(); render();
  }catch(err){ if(b){b.disabled=false;b.textContent=cur?"Enregistrer":"Affecter";} biltia.notify("Enregistrement impossible"); }
}
async function assignDel(id){ try{ await biltia.remove("planning",id); S.planning=S.planning.filter(function(x){return x.id!==id;}); biltia.notify("Affectation retirée"); closeModal(); render(); }catch(e){} }

/* ── Équipier ── */
function openEmp(id){
  var e=id?findEmp(id):{ prenom:"",nom:"",role:"",corps_metier:"",tel:"",email:"",statut:"actif" };
  S.edit=JSON.parse(JSON.stringify(e));
  var h='<div class="modal-h"><div><div class="modal-title">'+(id?"Modifier l\\'équipier":"Nouvel équipier")+'</div></div><button class="x" onclick="closeModal()">✕</button></div>';
  h+='<div class="form-row"><div class="fg"><label class="fl">Prénom</label><input id="e-prenom" value="'+esc(e.prenom||"")+'"></div><div class="fg"><label class="fl">Nom *</label><input id="e-nom" value="'+esc(e.nom||"")+'"></div></div>';
  h+='<div class="form-row"><div class="fg"><label class="fl">Rôle</label><input id="e-role" value="'+esc(e.role||"")+'" placeholder="Chef d\\'équipe…"></div><div class="fg"><label class="fl">Corps de métier</label><input id="e-metier" value="'+esc(e.corps_metier||"")+'" placeholder="Maçon…"></div></div>';
  h+='<div class="form-row"><div class="fg"><label class="fl">Téléphone</label><input id="e-tel" inputmode="tel" value="'+esc(e.tel||"")+'"></div><div class="fg"><label class="fl">Email</label><input id="e-email" type="email" inputmode="email" value="'+esc(e.email||"")+'" placeholder="Pour recevoir son planning"></div></div>';
  h+='<div class="fg"><label class="fl">Disponibilité</label><div class="seg" id="e-seg">'+[["actif","Disponible"],["arret","En arrêt"],["inactif","Inactif"]].map(function(o){return '<button type="button" onclick="empStatut(\\''+o[0]+'\\')" class="'+(e.statut===o[0]?"on":"")+'" style="'+(e.statut===o[0]?"background:var(--vio)":"")+'">'+o[1]+'</button>';}).join("")+'</div></div>';
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

/* ── Modale ── */
function openModal(html){ $("modal").innerHTML=html; $("ovl").hidden=false; $("modal").scrollTop=0; }
function closeModal(){ $("ovl").hidden=true; $("modal").innerHTML=""; S.edit=null; }
document.addEventListener("click",function(e){ if(e.target&&e.target.id==="ovl")closeModal(); });

/* ── Init ── */
function initBrand(){ if(!S.entreprise||S.entreprise.indexOf("__")===0)S.entreprise="Mon entreprise"; var eb=S.entreprise.toUpperCase().slice(0,22); ["side-eyebrow","hd-eyebrow","tb-eyebrow"].forEach(function(i){var el=$(i);if(el)el.textContent=eb;}); ["side-logo","hd-logo"].forEach(function(i){var el=$(i);if(el)el.textContent=initials(S.entreprise)||"B";}); }
var _rz;
function start(){ S.weekStart=mondayOf(todayISO()); initBrand(); renderNav(); boot(); if(window.addEventListener)window.addEventListener("resize",function(){ if(_rz)clearTimeout(_rz); _rz=setTimeout(function(){ if(S.view==="planning")render(); },200); }); }
if(document.readyState!=="loading"){ start(); } else { document.addEventListener("DOMContentLoaded",start); }
${CHART_ENGINE_JS}
</script>
</body>
</html>`;
