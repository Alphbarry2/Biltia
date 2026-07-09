// ─────────────────────────────────────────────────────────────────────────────
// APP PHARE — SUIVI DE CHANTIERS (PATRON DE RÉFÉRENCE, multi-pages)
//
// Vraie application métier suivant À LA LETTRE les règles de génération de l'agent
// (app/api/generate/route.ts) : navigation réelle multi-vues, SIDEBAR sur ordi /
// TAB-BAR en bas sur mobile, police Inter, système de design Biltia (accent UNI
// sobre), tableau de bord hero + KPI + « à traiter », fiche détail au clic, chaque
// bouton fonctionne, mise à jour instantanée, responsive plancher 365px.
// Branchée au workspace via window.biltia (chantiers · clients · employees · materials).
// Le SDK est injecté à l'instanciation — NE PAS l'inclure ici.
//
// App JS : template literals en backticks (échappés \` et \${ dans ce fichier TS) →
// les apostrophes françaises ne cassent rien.
// ─────────────────────────────────────────────────────────────────────────────

import { CHART_CSS, CHART_ENGINE_JS } from "@/lib/app-charts";

export const APP_CHANTIERS_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Suivi de chantiers</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
img,svg,video,canvas{max-width:100%;height:auto}
:root{--bg:#FBFBFC;--ink:#111114;--mut:#63636B;--faint:#9A9AA6;--line:#ECECF0;--soft:#F6F6F8;
--vio:#4F46E5;--grad:#4F46E5;--glow:79,70,229;--tint:#EEF0FE;--tintline:#D8DCFA;
--shadow:0 1px 2px rgba(17,17,26,.04),0 6px 18px rgba(17,17,26,.05);--shadow-lg:0 14px 44px rgba(17,17,26,.12)}
body{background:var(--bg);font-family:'Inter',system-ui,sans-serif;color:var(--ink);font-size:14px;line-height:1.55;-webkit-font-smoothing:antialiased;overflow-x:hidden;overflow-wrap:break-word}
.card{background:#fff;border:1px solid var(--line);border-radius:20px;padding:20px;overflow:hidden;box-shadow:var(--shadow)}
.hero{position:relative;padding:24px 22px;border-radius:24px;color:var(--ink);background:#fff;border:1px solid var(--line);box-shadow:var(--shadow);overflow:hidden}
.hero::after{content:"";position:absolute;right:-52px;top:-52px;width:180px;height:180px;border-radius:50%;background:var(--tint);opacity:.75}
.hero-label{position:relative;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:var(--vio)}
.hero-value{position:relative;font-size:34px;font-weight:800;letter-spacing:-.02em;line-height:1.15;color:var(--ink);font-variant-numeric:tabular-nums}
.hero-sub{position:relative;font-size:12.5px;color:var(--mut);margin-top:4px}
.kpi{background:#fff;border:1px solid var(--line);border-radius:18px;padding:16px 18px;display:flex;flex-direction:column;gap:5px;overflow:hidden;box-shadow:var(--shadow)}
.kpi-label{font-size:10px;font-weight:700;color:var(--faint);text-transform:uppercase;letter-spacing:.1em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kpi-value{font-size:25px;font-weight:800;color:var(--ink);line-height:1.1;letter-spacing:-.02em;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kpi-sub{font-size:11px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:none;cursor:pointer;font-family:inherit;font-weight:600;transition:all .18s;border-radius:12px;white-space:nowrap;font-size:13px;padding:10px 18px}
.btn:active{transform:scale(.97)}
.btn-primary{background:var(--grad);color:#fff;box-shadow:0 4px 12px rgba(var(--glow),.20)}
.btn-primary:hover{box-shadow:0 6px 18px rgba(var(--glow),.30)}
.btn-ink{background:#0A0A0A;color:#fff}.btn-ink:hover{background:#26262E}
.btn-ghost{background:#fff;color:var(--ink);border:1px solid var(--line)}
.btn-ghost:hover{border-color:var(--tintline);box-shadow:0 4px 14px rgba(var(--glow),.12)}
.btn-danger{background:#FFF1F2;color:#E11D48;border:1px solid #FECDD3;padding:8px 14px;font-size:12px;border-radius:10px}
.btn-sm{padding:7px 14px;font-size:12px;border-radius:10px}
.badge{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:9999px;font-size:11px;font-weight:600;white-space:nowrap}
.badge-accent{background:var(--tint);color:var(--vio);border:1px solid var(--tintline)}
.badge-green{background:#ECFDF5;color:#059669;border:1px solid #A7F3D0}
.badge-red{background:#FFF1F2;color:#E11D48;border:1px solid #FECDD3}
.badge-amber{background:#FFFBEB;color:#B45309;border:1px solid #FDE68A}
.badge-gray{background:#F6F6F9;color:#6E6E6C;border:1px solid #ECECF2}
input,select,textarea{font-family:inherit;font-size:16px;color:var(--ink);background:#fff;border:1px solid #E7E7E4;border-radius:12px;padding:10px 14px;width:100%;outline:none;transition:border .15s,box-shadow .15s}
input:focus,select:focus,textarea:focus{border-color:var(--vio);box-shadow:0 0 0 3px rgba(var(--glow),.14)}
input::placeholder,textarea::placeholder{color:#9A9AA6}
input.invalid,select.invalid,textarea.invalid{border-color:#E11D48;box-shadow:0 0 0 3px rgba(225,29,72,.12)}
.field-error{display:block;font-size:11.5px;font-weight:600;color:#E11D48;margin-top:5px}
/* Coquille : sidebar (ordi) + header/tab-bar (mobile) */
.shell{display:flex;min-height:100vh}
.sidebar{display:none}
.app-main{flex:1;min-width:0;padding:0 0 90px}
.app-header{position:fixed;top:0;left:0;right:0;z-index:100;background:rgba(255,255,255,.85);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-bottom:1px solid var(--line);height:60px;display:flex;align-items:center;justify-content:space-between;padding:0 16px}
.brand{display:flex;align-items:center;gap:10px;min-width:0}
.brand-logo{width:30px;height:30px;border-radius:9px;background:var(--grad);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:14px;flex-shrink:0}
.app-eyebrow{font-size:10px;font-weight:700;color:var(--vio);text-transform:uppercase;letter-spacing:.12em;display:block;line-height:1.2}
.app-title{font-size:15px;font-weight:800;letter-spacing:-.01em;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:190px;line-height:1.2}
.mtop{height:60px}
.tab-bar{position:fixed;bottom:0;left:0;right:0;background:rgba(255,255,255,.94);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-top:1px solid var(--line);display:flex;z-index:100}
.tab-item{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:8px 4px 10px;cursor:pointer;border:none;background:none;font-size:10px;font-weight:600;color:#9A9AA6;font-family:inherit;min-height:56px}
.tab-item.active{color:var(--vio)}
.tab-ic{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.fab{position:fixed;right:16px;bottom:78px;z-index:120;width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;color:#fff;font-size:28px;line-height:1;background:var(--grad);box-shadow:0 8px 22px rgba(var(--glow),.28);display:flex;align-items:center;justify-content:center}
.fab:active{transform:scale(.94)}
.view-pad{padding:16px}
.topbar{display:none}
.section-h{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:22px 2px 12px}
.section-h b{font-size:15px;font-weight:700}
.section-h .link{font-size:12px;font-weight:600;color:var(--vio);cursor:pointer;background:none;border:none}
.kpi-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}
.list{display:flex;flex-direction:column;gap:10px}
.row{display:flex;align-items:center;gap:12px;padding:14px 16px;background:#fff;border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);cursor:pointer;text-align:left;width:100%;transition:box-shadow .15s,border-color .15s}
.row:hover{box-shadow:0 6px 20px rgba(17,17,26,.07);border-color:var(--tintline)}
.avatar{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:#fff;flex-shrink:0}
.row-mid{flex:1;min-width:0}
.row-mid .n{display:block;font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.row-mid .s{display:block;font-size:12px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
.row-end{display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0}
.amt{font-weight:800;font-size:14px;font-variant-numeric:tabular-nums;white-space:nowrap}
.prog-track{height:6px;background:#F1F1F5;border-radius:3px;overflow:hidden}
.prog-fill{height:100%;border-radius:3px;background:var(--grad);transition:width .4s}
.chips{display:flex;gap:8px;flex-wrap:wrap;padding:0 2px 4px}
.chip{border:1px solid var(--line);background:#fff;color:var(--mut);font-weight:600;font-size:12.5px;padding:7px 13px;border-radius:9999px;cursor:pointer;white-space:nowrap}
.chip.on{background:var(--ink);color:#fff;border-color:var(--ink)}
.searchwrap{position:relative;margin-bottom:12px}
.searchwrap svg{position:absolute;left:13px;top:50%;transform:translateY(-50%);width:16px;height:16px;stroke:var(--faint);fill:none;stroke-width:2}
.searchwrap input{padding-left:38px}
.grid-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:12px}
.mcard{background:#fff;border:1px solid var(--line);border-radius:18px;padding:16px;box-shadow:var(--shadow);cursor:pointer}
.mcard:hover{box-shadow:0 6px 20px rgba(17,17,26,.07)}
.empty{text-align:center;padding:52px 20px}
.empty-ico{width:54px;height:54px;border-radius:16px;background:var(--tint);color:var(--vio);display:flex;align-items:center;justify-content:center;margin:0 auto 14px}
.empty-title{font-weight:700;color:var(--ink);margin-bottom:4px}
.empty-sub{font-size:13px;color:var(--mut);margin-bottom:16px}
.spin{width:26px;height:26px;border:3px solid var(--line);border-top-color:var(--vio);border-radius:50%;animation:sp .7s linear infinite;margin:60px auto}
@keyframes sp{to{transform:rotate(360deg)}}
.overlay{position:fixed;inset:0;background:rgba(10,10,10,.4);backdrop-filter:blur(6px);z-index:200;display:flex;align-items:flex-end;justify-content:center}
.overlay[hidden]{display:none}
@media(min-width:600px){.overlay{align-items:center;padding:20px}}
.modal{background:#fff;border-radius:24px 24px 0 0;width:100%;max-width:560px;max-height:90vh;overflow-y:auto;padding:22px 20px calc(22px + env(safe-area-inset-bottom));box-shadow:var(--shadow-lg)}
@media(min-width:600px){.modal{border-radius:24px}}
.modal-h{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px}
.modal-title{font-size:18px;font-weight:800;letter-spacing:-.01em}
.modal-sub{font-size:12.5px;color:var(--mut);margin-top:2px}
.x{border:none;background:var(--soft);width:34px;height:34px;border-radius:10px;color:var(--mut);font-size:18px;cursor:pointer;flex-shrink:0}
.fg{margin-bottom:14px}
.fl{display:block;font-size:11px;font-weight:700;color:#6E6E6C;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media(max-width:480px){.form-row{grid-template-columns:1fr}}
.seg{display:flex;flex-wrap:wrap;gap:6px}
.seg button{border:1px solid var(--line);background:#fff;color:var(--mut);font-weight:600;font-size:12px;padding:8px 12px;border-radius:10px;cursor:pointer;font-family:inherit}
.seg button.on{color:#fff;border-color:transparent}
.range-row{display:flex;align-items:center;gap:14px}
.range-row input[type=range]{flex:1;accent-color:var(--vio);padding:0}
.range-val{font-weight:800;font-size:18px;min-width:52px;text-align:right;font-variant-numeric:tabular-nums}
.steps{display:flex;gap:6px;margin:6px 0 18px}
.step-dot{height:4px;flex:1;border-radius:2px;background:#ECECF2;transition:background .3s}
.step-dot.done{background:var(--grad)}
.modal-actions{display:flex;gap:10px;margin-top:20px}
.modal-actions .btn{flex:1}
.det-sec{margin-top:16px}
.det-sec .fl{margin-bottom:8px}
.det-row{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid #F4F4F7;font-size:13px}
.det-row:last-child{border-bottom:none}
.det-row .k{color:var(--mut)}
.det-row .v{font-weight:600;text-align:right}
.toast-ok{color:#059669}
/* ── ORDI (≥ 860px) : SIDEBAR + contenu pleine largeur, pas de tab-bar ── */
@media(min-width:860px){
  .app-header{display:none}
  .mtop{display:none}
  .tab-bar{display:none}
  .fab{display:none}
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
  .kpi-grid{grid-template-columns:repeat(4,minmax(0,1fr))}
}
/* ── plancher 365px ── */
@media(max-width:400px){
  .view-pad{padding:13px}
  .hero{padding:18px 16px}
  .hero-value{font-size:27px}
  .kpi-value{font-size:20px}
  .btn{padding:11px 15px}
  .app-title{max-width:150px}
}
/* Très grand écran : on borne la largeur du contenu (lisibilité) — sidebar reste collée à gauche */
@media(min-width:1600px){ .topbar,.view-pad{max-width:1520px;margin-left:auto;margin-right:auto} }
@media print{.sidebar,.app-header,.tab-bar,.fab,.no-print{display:none!important}}
${CHART_CSS}
</style>
</head>
<body>
<div class="shell">
  <aside class="sidebar">
    <div class="side-brand"><span class="brand-logo" id="side-logo">B</span><div style="min-width:0"><span class="app-eyebrow" id="side-eyebrow">BILTIA</span><span class="app-title" id="side-title">Chantiers</span></div></div>
    <nav class="side-nav" id="side-nav"></nav>
  </aside>

  <div class="app-main">
    <header class="app-header">
      <div class="brand"><span class="brand-logo" id="hd-logo">B</span><div style="min-width:0"><span class="app-eyebrow" id="hd-eyebrow">BILTIA</span><span class="app-title">Chantiers</span></div></div>
      <button class="btn btn-primary btn-sm" id="hd-add" onclick="primaryAdd()">+ Chantier</button>
    </header>
    <div class="mtop"></div>
    <div class="topbar">
      <div><span class="app-eyebrow" id="tb-eyebrow">BILTIA</span><div id="tb-title" style="font-size:22px;font-weight:800;letter-spacing:-.02em">Tableau de bord</div></div>
      <button class="btn btn-primary" id="tb-add" onclick="primaryAdd()">+ Nouveau chantier</button>
    </div>
    <main id="view"><div class="spin"></div></main>
  </div>
</div>

<nav class="tab-bar" id="tab-bar"></nav>
<button class="fab" onclick="primaryAdd()" aria-label="Ajouter">+</button>
<div class="overlay" id="ovl" hidden><div class="modal" id="modal"></div></div>

<script>
var S={ view:"dashboard", chantiers:[], clients:[], employees:[], materials:[], entreprise:"__ENTREPRISE__", filter:"tous", search:"", edit:null, step:0 };
var $=function(id){return document.getElementById(id);};
function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
function num(v){var n=parseFloat(String(v==null?"":v).replace(",",".").replace(/[^0-9.\\-]/g,""));return isFinite(n)?n:0;}
function todayISO(){var d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
function fmtDate(iso){if(!iso)return "—";var p=String(iso).slice(0,10).split("-");if(p.length<3)return iso;return p[2]+"/"+p[1]+"/"+p[0];}
function daysTo(iso){if(!iso)return null;var d=new Date(String(iso).slice(0,10)),t=new Date(todayISO());return Math.round((d-t)/86400000);}
function money(n){return Math.round(num(n)).toLocaleString("fr-FR")+" €";}
function kEuro(n){n=num(n);if(n>=10000)return (Math.round(n/1000)).toLocaleString("fr-FR")+" k€";return Math.round(n).toLocaleString("fr-FR")+" €";}
function initials(s){var w=String(s||"?").trim().split(/\\s+/);return ((w[0]||"?")[0]+(w[1]?w[1][0]:"")).toUpperCase();}
var AV=["#4F46E5","#DB2777","#0284C7","#D97706","#059669","#7C3AED","#DC2626","#0D9488"];
function avc(seed){var s=String(seed||""),h=0;for(var i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;return AV[h%AV.length];}
var ST={ en_attente:{l:"À venir",b:"badge-amber",c:"#D97706"}, en_cours:{l:"En cours",b:"badge-accent",c:"var(--vio)"}, en_retard:{l:"En retard",b:"badge-red",c:"#E11D48"}, termine:{l:"Terminé",b:"badge-green",c:"#059669"}, annule:{l:"Annulé",b:"badge-gray",c:"#9A9AA6"} };
function stOf(k){return ST[k]||ST.en_attente;}
function clientName(id){for(var i=0;i<S.clients.length;i++)if(S.clients[i].id===id)return S.clients[i].nom;return "";}
function empName(id){for(var i=0;i<S.employees.length;i++){var e=S.employees[i];if(e.id===id)return ((e.prenom||"")+" "+(e.nom||"")).trim()||e.nom;}return "";}
function isLate(c){ if(c.statut==="termine"||c.statut==="annule")return false; if(c.statut==="en_retard")return true; var d=daysTo(c.date_fin_prevue); return d!==null&&d<0; }

var NAV=[
  {id:"dashboard",label:"Tableau de bord",icon:'<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'},
  {id:"chantiers",label:"Chantiers",icon:'<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6"/>'},
  {id:"equipe",label:"Équipe",icon:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'},
  {id:"materiel",label:"Matériel",icon:'<path d="M21 8 12 3 3 8l9 5 9-5Z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>'}
];

/* ── Chargement ── */
async function boot(){
  try{
    var r=await Promise.all([
      biltia.list("chantiers",{order:"created_at",ascending:false,limit:500}).catch(function(){return[];}),
      biltia.list("clients",{order:"nom",ascending:true,limit:600}).catch(function(){return[];}),
      biltia.list("employees",{order:"nom",ascending:true,limit:400}).catch(function(){return[];}),
      biltia.list("materials",{order:"created_at",ascending:false,limit:600}).catch(function(){return[];})
    ]);
    S.chantiers=r[0]||[]; S.clients=r[1]||[]; S.employees=r[2]||[]; S.materials=r[3]||[];
    renderNav(); render();
  }catch(e){
    $("view").innerHTML='<div class="view-pad"><div class="empty"><div class="empty-ico">⚠️</div><div class="empty-title">Connexion au workspace impossible</div><div class="empty-sub">Vérifiez votre connexion puis rouvrez l\\'application.</div></div></div>';
  }
}

/* ── Navigation ── */
function renderNav(){
  var sn=$("side-nav");
  sn.innerHTML=NAV.map(function(n){ return '<button class="side-item'+(S.view===n.id?" active":"")+'" onclick="go(\\''+n.id+'\\')"><svg viewBox="0 0 24 24">'+n.icon+'</svg><span>'+n.label+'</span></button>'; }).join("");
  var tb=$("tab-bar");
  tb.innerHTML=NAV.map(function(n){ return '<button class="tab-item'+(S.view===n.id?" active":"")+'" onclick="go(\\''+n.id+'\\')"><svg class="tab-ic" viewBox="0 0 24 24">'+n.icon+'</svg><span>'+n.label+'</span></button>'; }).join("");
}
function go(v){ S.view=v; renderNav(); render(); try{document.querySelector(".app-main").scrollIntoView({block:"start"});window.scrollTo(0,0);}catch(e){} }
var ADDLBL={dashboard:"+ Chantier",chantiers:"+ Chantier",equipe:"+ Équipier",materiel:"+ Matériel"};
function primaryAdd(){ if(S.view==="equipe") openEmp(null); else if(S.view==="materiel") openMateriel(null); else openWizard(null); }
function render(){
  var titles={dashboard:"Tableau de bord",chantiers:"Chantiers",equipe:"Équipe",materiel:"Matériel"};
  $("tb-title").textContent=titles[S.view]||"";
  if($("hd-add"))$("hd-add").textContent=ADDLBL[S.view]||"+ Nouveau"; if($("tb-add"))$("tb-add").textContent=(S.view==="equipe"?"+ Nouvel équipier":S.view==="materiel"?"+ Matériel":"+ Nouveau chantier");
  if(S.view==="dashboard") renderDashboard();
  else if(S.view==="chantiers") renderChantiers();
  else if(S.view==="equipe") renderEquipe();
  else renderMateriel();
}

/* ── Vue : Tableau de bord ── */
function renderDashboard(){
  var actifs=S.chantiers.filter(function(c){return c.statut==="en_cours"||c.statut==="en_retard";});
  var retard=S.chantiers.filter(isLate);
  var budgetTotal=S.chantiers.reduce(function(s,c){return s+num(c.budget);},0);
  var engage=S.chantiers.reduce(function(s,c){return s+num(c.budget_engage);},0);
  var avg=actifs.length?Math.round(actifs.reduce(function(s,c){return s+num(c.avancement);},0)/actifs.length):0;
  var termines=S.chantiers.filter(function(c){return c.statut==="termine";}).length;
  // "à traiter" = retards + échéances proches (≤ 14 j), triés par urgence
  var todo=S.chantiers.filter(function(c){ if(c.statut==="termine"||c.statut==="annule")return false; var d=daysTo(c.date_fin_prevue); return isLate(c)||(d!==null&&d<=14); })
    .sort(function(a,b){ return (daysTo(a.date_fin_prevue)==null?9999:daysTo(a.date_fin_prevue)) - (daysTo(b.date_fin_prevue)==null?9999:daysTo(b.date_fin_prevue)); }).slice(0,6);
  var enCours=actifs.slice(0,6);
  var h='<div class="view-pad">';
  if(!S.chantiers.length){
    h+=emptyState("🏗️","Aucun chantier pour l\\'instant","Créez votre premier chantier pour voir votre tableau de bord prendre vie.","openWizard(null)","+ Nouveau chantier")+'</div>';
    $("view").innerHTML=h; return;
  }
  h+='<section class="hero"><span class="hero-label">Chantiers actifs</span><div class="hero-value">'+actifs.length+' en cours</div><div class="hero-sub">Avancement moyen '+avg+'% · '+retard.length+' en retard · '+kEuro(engage)+' engagés</div></section>';
  h+='<div class="kpi-grid">'
    + kpi("Avancement moyen",avg+"%","chantiers actifs")
    + kpi("En retard",String(retard.length),retard.length?"à traiter":"tout est à jour",retard.length?"#E11D48":"")
    + kpi("Budget engagé",kEuro(engage),"sur "+kEuro(budgetTotal))
    + kpi("Terminés",String(termines),"réceptionnés")
    +'</div>';
  if(actifs.length>=2) h+='<div class="chart-card" style="margin-top:14px"><div class="chart-hd"><b>Budget engagé par chantier</b><span class="rd" id="rd-chbud">'+kEuro(engage)+'</span></div><div class="chart-host" id="ch-bud"></div></div>';
  // À TRAITER EN PRIORITÉ (pleine largeur)
  h+='<div class="section-h"><b>À traiter en priorité</b>'+(todo.length?'<span class="badge badge-red">'+todo.length+'</span>':'')+'</div>';
  if(!todo.length){ h+='<div class="card" style="display:flex;align-items:center;gap:12px;color:var(--mut)"><span style="font-size:20px">👍</span><span>Rien d\\'urgent : aucun retard ni échéance proche. Tout est sous contrôle.</span></div>'; }
  else { h+='<div class="list">'+todo.map(function(c){ var late=isLate(c); var d=daysTo(c.date_fin_prevue); var sub=late?("En retard — échéance "+fmtDate(c.date_fin_prevue)):("Échéance dans "+d+" j — "+fmtDate(c.date_fin_prevue));
      return '<button class="row" onclick="openDetail(\\''+c.id+'\\')"><span class="avatar" style="background:'+avc(c.nom)+'">'+esc(initials(c.nom))+'</span><span class="row-mid"><span class="n">'+esc(c.nom||"Sans nom")+'</span><span class="s" style="color:'+(late?"#E11D48":"var(--mut)")+'">'+esc(sub)+'</span></span><span class="row-end"><span class="badge '+stOf(c.statut).b+'">'+stOf(c.statut).l+'</span></span></button>'; }).join("")+'</div>'; }
  // CHANTIERS EN COURS (grille — remplit la largeur sur ordi)
  h+='<div class="section-h" style="margin-top:24px"><b>Chantiers en cours</b><button class="link" onclick="go(\\'chantiers\\')">Tout voir</button></div>';
  if(!enCours.length){ h+='<div class="card" style="color:var(--mut);text-align:center">Aucun chantier en cours pour le moment.</div>'; }
  else { h+='<div class="grid-cards">'+enCours.map(function(c){ var av=Math.max(0,Math.min(100,Math.round(num(c.avancement)))); var chef=c.chef_chantier_id?empName(c.chef_chantier_id):"";
      return '<button class="mcard" style="text-align:left" onclick="openDetail(\\''+c.id+'\\')">'
        +'<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px"><div style="min-width:0"><div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(c.nom||"Sans nom")+'</div><div class="s" style="color:var(--mut);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(clientName(c.client_id)||"Client non renseigné")+(c.ville?" · "+esc(c.ville):"")+'</div></div><span style="font-weight:800;font-size:15px;font-variant-numeric:tabular-nums">'+av+'%</span></div>'
        +'<div class="prog-track" style="margin:12px 0 10px"><div class="prog-fill" style="width:'+av+'%"></div></div>'
        +'<div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--mut)"><span>'+kEuro(c.budget_engage)+' / '+kEuro(c.budget)+'</span>'+(chef?'<span style="display:inline-flex;align-items:center;gap:6px"><span class="avatar" style="width:22px;height:22px;border-radius:7px;font-size:9px;background:'+avc(chef)+'">'+esc(initials(chef))+'</span>'+esc(chef)+'</span>':'')+'</div>'
      +'</button>'; }).join("")+'</div>'; }
  h+='</div>';
  $("view").innerHTML=h;
  try{ if(actifs.length>=2){ var _bs=actifs.slice().sort(function(a,b){return num(b.budget_engage)-num(a.budget_engage);}).slice(0,8).map(function(c){ return {value:num(c.budget_engage),label:(String(c.nom||"").split(" ")[0]||"—").slice(0,10),tip:(c.nom||"")+" · "+Math.max(0,Math.min(100,Math.round(num(c.avancement))))+"%"}; }); drawBars($("ch-bud"),_bs,{id:"chbud",color:"#4F46E5",color2:"#8B84F2",fmt:kEuro,rd:"rd-chbud",rdDef:kEuro(engage)}); } }catch(e){}
}
function kpi(label,val,sub,color){ return '<div class="kpi"><div class="kpi-label">'+label+'</div><div class="kpi-value"'+(color?' style="color:'+color+'"':'')+'>'+val+'</div><div class="kpi-sub">'+sub+'</div></div>'; }
function emptyState(ico,title,sub,onclick,btn){ return '<div class="empty"><div class="empty-ico" style="font-size:24px">'+ico+'</div><div class="empty-title">'+title+'</div><div class="empty-sub">'+sub+'</div><button class="btn btn-primary" onclick="'+onclick+'">'+btn+'</button></div>'; }

/* ── Vue : Chantiers ── */
var CH_FIL=[["tous","Tous"],["en_cours","En cours"],["en_retard","Retard"],["en_attente","En attente"],["termine","Terminés"]];
function chFiltered(){
  var q=S.search.trim().toLowerCase();
  return S.chantiers.filter(function(c){
    if(S.filter==="en_retard"){ if(!isLate(c))return false; } else if(S.filter!=="tous"){ if((c.statut||"en_attente")!==S.filter)return false; }
    if(q){ var hay=((c.nom||"")+" "+(clientName(c.client_id)||"")+" "+(c.ville||"")).toLowerCase(); if(hay.indexOf(q)<0)return false; }
    return true;
  });
}
function chListHTML(){
  var list=chFiltered();
  if(!list.length){
    return S.chantiers.length ? '<div class="empty"><div class="empty-title">Aucun chantier ne correspond</div><div class="empty-sub">Changez de filtre ou de recherche.</div></div>'
      : emptyState("🏗️","Aucun chantier","Créez votre premier chantier.","openWizard(null)","+ Nouveau chantier");
  }
  return '<div class="grid-cards">'+list.map(function(c){ var av=Math.max(0,Math.min(100,Math.round(num(c.avancement)))); var st=isLate(c)?ST.en_retard:stOf(c.statut);
    return '<button class="mcard" style="text-align:left" onclick="openDetail(\\''+c.id+'\\')">'
      +'<div style="display:flex;align-items:center;gap:12px"><span class="avatar" style="background:'+avc(c.nom)+'">'+esc(initials(c.nom))+'</span><span class="row-mid"><span class="n">'+esc(c.nom||"Sans nom")+'</span><span class="s">'+esc(clientName(c.client_id)||"Client non renseigné")+(c.ville?" · "+esc(c.ville):"")+'</span></span><span class="badge '+st.b+'">'+st.l+'</span></div>'
      +'<div class="prog-track" style="margin:13px 0 9px"><div class="prog-fill" style="width:'+av+'%"></div></div>'
      +'<div style="display:flex;justify-content:space-between;font-size:12.5px;color:var(--mut)"><span>'+kEuro(c.budget_engage)+' / '+kEuro(c.budget)+'</span><span>'+av+'% · fin '+fmtDate(c.date_fin_prevue)+'</span></div>'
    +'</button>'; }).join("")+'</div>';
}
function chSearch(v){ S.search=v; var el=$("ch-list"); if(el) el.innerHTML=chListHTML(); }
function chSetFilter(f){ S.filter=f; var chips=$("ch-chips"); if(chips){ Array.prototype.forEach.call(chips.children,function(b,i){ b.className="chip"+(CH_FIL[i][0]===f?" on":""); }); } var el=$("ch-list"); if(el) el.innerHTML=chListHTML(); }
function renderChantiers(){
  var h='<div class="view-pad">';
  h+='<div class="searchwrap"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg><input placeholder="Rechercher un chantier, un client, une ville…" value="'+esc(S.search)+'" oninput="chSearch(this.value)"></div>';
  h+='<div class="chips" id="ch-chips">'+CH_FIL.map(function(f){ return '<button class="chip'+(S.filter===f[0]?" on":"")+'" onclick="chSetFilter(\\''+f[0]+'\\')">'+f[1]+'</button>'; }).join("")+'</div>';
  h+='<div id="ch-list">'+chListHTML()+'</div>';
  h+='</div>'; $("view").innerHTML=h;
}

/* ── Vue : Matériel ── */
function renderMateriel(){
  var MST={ disponible:{l:"Disponible",b:"badge-green"}, affecte:{l:"Affecté",b:"badge-accent"}, maintenance:{l:"Maintenance",b:"badge-amber"}, hors_service:{l:"Hors service",b:"badge-red"} };
  var h='<div class="view-pad">';
  if(!S.materials.length){
    h+=emptyState("📦","Aucun matériel","Ajoutez votre matériel et affectez-le à vos chantiers.","openMateriel(null)","+ Ajouter du matériel")+'</div>';
    $("view").innerHTML=h; return;
  }
  h+='<div class="section-h" style="margin-top:2px"><b>'+S.materials.length+' références</b><button class="btn btn-ghost btn-sm" onclick="openMateriel(null)">+ Matériel</button></div>';
  h+='<div class="grid-cards">'+S.materials.map(function(m){ var st=MST[m.statut]||MST.disponible; var ch=m.chantier_id?clientChantierName(m.chantier_id):"";
    return '<button class="mcard" style="text-align:left" onclick="openMateriel(\\''+m.id+'\\')"><div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><div style="min-width:0"><div style="font-weight:700">'+esc(m.nom||"Sans nom")+'</div><div class="s" style="color:var(--mut);font-size:12px">'+esc([m.reference,m.categorie].filter(Boolean).join(" · ")||"—")+'</div></div><span class="badge '+st.b+'">'+st.l+'</span></div>'
      +'<div style="display:flex;justify-content:space-between;margin-top:12px;font-size:12.5px;color:var(--mut)"><span>'+esc((m.quantite!=null&&m.quantite!==""?m.quantite:"1")+" "+(m.unite||"u"))+'</span>'+(ch?'<span>→ '+esc(ch)+'</span>':'')+'</div></button>'; }).join("")+'</div>';
  h+='</div>'; $("view").innerHTML=h;
}
function clientChantierName(id){for(var i=0;i<S.chantiers.length;i++)if(S.chantiers[i].id===id)return S.chantiers[i].nom;return "";}

/* ── Vue : Équipe ── */
var EMPST={ actif:{l:"Actif",b:"badge-green"}, arret:{l:"En arrêt",b:"badge-amber"}, inactif:{l:"Inactif",b:"badge-gray"} };
function renderEquipe(){
  var h='<div class="view-pad">';
  if(!S.employees.length){
    h+=emptyState("👷","Aucun équipier","Ajoutez les membres de votre équipe pour les affecter à vos chantiers.","openEmp(null)","+ Ajouter un équipier")+'</div>';
    $("view").innerHTML=h; return;
  }
  h+='<div class="section-h" style="margin-top:2px"><b>'+S.employees.length+' équipier'+(S.employees.length>1?"s":"")+'</b><button class="btn btn-ghost btn-sm" onclick="openEmp(null)">+ Équipier</button></div>';
  h+='<div class="grid-cards">'+S.employees.map(function(e){
    var nm=((e.prenom||"")+" "+(e.nom||"")).trim()||e.nom||"Sans nom";
    var role=[e.role,e.corps_metier].filter(function(x){return String(x||"").trim();}).join(" · ")||"Équipier";
    var st=EMPST[e.statut]||EMPST.actif;
    var nb=S.chantiers.filter(function(c){return c.chef_chantier_id===e.id&&c.statut!=="termine"&&c.statut!=="annule";}).length;
    return '<button class="mcard" style="text-align:left" onclick="openEmp(\\''+e.id+'\\')">'
      +'<div style="display:flex;align-items:center;gap:12px"><span class="avatar" style="background:'+avc(nm)+'">'+esc(initials(nm))+'</span><div style="min-width:0;flex:1"><div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(nm)+'</div><div class="s" style="color:var(--mut);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(role)+'</div></div><span class="badge '+st.b+'">'+st.l+'</span></div>'
      +'<div style="display:flex;justify-content:space-between;margin-top:12px;padding-top:12px;border-top:1px solid #F4F4F7;font-size:12.5px;color:var(--mut)"><span>'+(nb?nb+' chantier'+(nb>1?"s":"")+' dirigé'+(nb>1?"s":""):"Aucun chantier dirigé")+'</span>'+(e.tel?'<span>'+esc(e.tel)+'</span>':'')+'</div></button>'; }).join("")+'</div>';
  h+='</div>'; $("view").innerHTML=h;
}
function findEmp(id){for(var i=0;i<S.employees.length;i++)if(S.employees[i].id===id)return S.employees[i];return null;}
function openEmp(id){
  var e=id?findEmp(id):{ prenom:"",nom:"",role:"",corps_metier:"",tel:"",email:"",statut:"actif" };
  S.edit=JSON.parse(JSON.stringify(e));
  var nm=((e.prenom||"")+" "+(e.nom||"")).trim();
  var h='<div class="modal-h"><div><div class="modal-title">'+(id?esc(nm||"Équipier"):"Nouvel équipier")+'</div></div><button class="x" onclick="closeModal()">✕</button></div>'
    +'<div class="form-row"><div class="fg"><label class="fl">Prénom</label><input id="ep-prenom" value="'+esc(e.prenom||"")+'"></div><div class="fg"><label class="fl">Nom *</label><input id="ep-nom" value="'+esc(e.nom||"")+'"></div></div>'
    +'<div class="form-row"><div class="fg"><label class="fl">Rôle</label><input id="ep-role" value="'+esc(e.role||"")+'" placeholder="Chef d\\'équipe, compagnon…"></div><div class="fg"><label class="fl">Corps de métier</label><input id="ep-metier" value="'+esc(e.corps_metier||"")+'" placeholder="Maçon, électricien…"></div></div>'
    +'<div class="form-row"><div class="fg"><label class="fl">Téléphone</label><input id="ep-tel" inputmode="tel" value="'+esc(e.tel||"")+'"></div><div class="fg"><label class="fl">Email</label><input id="ep-email" inputmode="email" value="'+esc(e.email||"")+'"></div></div>'
    +'<div class="fg"><label class="fl">Statut</label><div class="seg" id="ep-seg">'+[["actif","Actif"],["arret","En arrêt"],["inactif","Inactif"]].map(function(o){return '<button type="button" onclick="empStatut(\\''+o[0]+'\\')" class="'+(e.statut===o[0]?"on":"")+'" style="'+(e.statut===o[0]?"background:var(--vio)":"")+'">'+o[1]+'</button>';}).join("")+'</div></div>'
    +'<div class="modal-actions"><button class="btn btn-primary" id="ep-save" onclick="empSave()">'+(id?"Enregistrer":"Ajouter l\\'équipier")+'</button>'+(id?'<button class="btn btn-danger" style="flex:0 0 auto" onclick="empDel(\\''+id+'\\')">Retirer</button>':'')+'</div>';
  openModal(h);
}
function empStatut(k){ S.edit.statut=k; document.querySelectorAll("#ep-seg button").forEach(function(b){b.className="";b.style.background="";}); var ks=["actif","arret","inactif"],i=ks.indexOf(k),btns=document.querySelectorAll("#ep-seg button"); if(btns[i]){btns[i].className="on";btns[i].style.background="var(--vio)";} }
async function empSave(){
  var e=S.edit;
  ["prenom","nom","role","tel","email"].forEach(function(f){var el=$("ep-"+f);if(el)e[f]=el.value;}); var em=$("ep-metier"); if(em)e.corps_metier=em.value;
  if(!String(e.nom||"").trim()){ var el=$("ep-nom"); if(el){el.classList.add("invalid");el.focus();} return; }
  var payload={ prenom:e.prenom||null, nom:String(e.nom).trim(), role:e.role||null, corps_metier:e.corps_metier||null, tel:e.tel||null, email:e.email||null, statut:e.statut||"actif" };
  var b=$("ep-save"); if(b){b.disabled=true;b.textContent="Enregistrement…";}
  try{
    if(e.id){ var up=await biltia.update("employees",e.id,payload); for(var i=0;i<S.employees.length;i++)if(S.employees[i].id===e.id)S.employees[i]=up; biltia.notify("Équipier enregistré"); }
    else { var row=await biltia.create("employees",payload); S.employees.push(row); S.employees.sort(function(a,b){return String(a.nom).localeCompare(String(b.nom));}); biltia.notify("Équipier ajouté"); }
    closeModal(); render();
  }catch(err){ if(b){b.disabled=false;b.textContent=e.id?"Enregistrer":"Ajouter l\\'équipier";} }
}
async function empDel(id){ if(!confirm("Retirer cet équipier de la liste ?"))return; try{ await biltia.remove("employees",id); S.employees=S.employees.filter(function(x){return x.id!==id;}); biltia.notify("Équipier retiré"); closeModal(); render(); }catch(e){} }

/* ── Modales ── */
function openModal(html){ $("modal").innerHTML=html; $("ovl").hidden=false; $("modal").scrollTop=0; }
function closeModal(){ $("ovl").hidden=true; $("modal").innerHTML=""; S.edit=null; }
document.addEventListener("click",function(e){ if(e.target && e.target.id==="ovl") closeModal(); });

/* Fiche détail chantier */
function findCh(id){for(var i=0;i<S.chantiers.length;i++)if(S.chantiers[i].id===id)return S.chantiers[i];return null;}
function openDetail(id){
  var c=findCh(id); if(!c)return;
  var av=Math.max(0,Math.min(100,Math.round(num(c.avancement)))); var st=isLate(c)?ST.en_retard:stOf(c.statut);
  var chef=c.chef_chantier_id?empName(c.chef_chantier_id):"";
  var h='<div class="modal-h"><div><div class="modal-title">'+esc(c.nom||"Chantier")+'</div><div class="modal-sub">'+esc(clientName(c.client_id)||"Client non renseigné")+'</div></div><button class="x" onclick="closeModal()">✕</button></div>';
  h+='<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span class="badge '+st.b+'">'+st.l+'</span><span style="font-weight:800;font-size:15px">'+av+'%</span></div>';
  h+='<div class="prog-track" style="margin-top:10px"><div class="prog-fill" style="width:'+av+'%"></div></div>';
  h+='<div class="det-sec"><div class="fl">Avancement</div><div class="range-row"><input type="range" min="0" max="100" step="5" value="'+av+'" oninput="quickAv(\\''+c.id+'\\',this.value)"><span class="range-val" id="qav">'+av+'%</span></div></div>';
  h+='<div class="det-sec"><div class="fl">Statut</div><div class="seg" id="qseg">'+["en_attente","en_cours","en_retard","termine","annule"].map(function(k){ return '<button onclick="quickStatut(\\''+c.id+'\\',\\''+k+'\\')" class="'+(c.statut===k?"on":"")+'" style="'+(c.statut===k?"background:"+stOf(k).c:"")+'">'+stOf(k).l+'</button>'; }).join("")+'</div></div>';
  h+='<div class="det-sec"><div class="fl">Informations</div>';
  h+='<div class="det-row"><span class="k">Budget engagé</span><span class="v">'+money(c.budget_engage)+' / '+money(c.budget)+'</span></div>';
  h+='<div class="det-row"><span class="k">Adresse</span><span class="v">'+esc([c.adresse,c.ville].filter(Boolean).join(", ")||"—")+'</span></div>';
  h+='<div class="det-row"><span class="k">Chef de chantier</span><span class="v">'+esc(chef||"Non affecté")+'</span></div>';
  h+='<div class="det-row"><span class="k">Début</span><span class="v">'+fmtDate(c.date_debut)+'</span></div>';
  h+='<div class="det-row"><span class="k">Fin prévue</span><span class="v">'+fmtDate(c.date_fin_prevue)+'</span></div>';
  if(c.description) h+='<div class="det-row" style="flex-direction:column;align-items:stretch"><span class="k" style="margin-bottom:4px">Description</span><span class="v" style="text-align:left;font-weight:400;color:var(--ink)">'+esc(c.description)+'</span></div>';
  h+='</div>';
  h+='<div class="modal-actions"><button class="btn btn-primary" onclick="openWizard(\\''+c.id+'\\')">Modifier</button><button class="btn btn-danger" style="flex:0 0 auto" onclick="delChantier(\\''+c.id+'\\')">Supprimer</button></div>';
  openModal(h);
}
async function quickAv(id,v){ var el=$("qav"); if(el)el.textContent=Math.round(num(v))+"%"; var c=findCh(id); if(!c)return; c.avancement=Math.round(num(v));
  clearTimeout(quickAv._t); quickAv._t=setTimeout(function(){ biltia.update("chantiers",id,{avancement:c.avancement}).catch(function(){}); render(); },500); }
async function quickStatut(id,k){ var c=findCh(id); if(!c)return; var prev=c.statut; c.statut=k;
  document.querySelectorAll("#qseg button").forEach(function(b){b.className="";b.style.background="";});
  var idx=["en_attente","en_cours","en_retard","termine","annule"].indexOf(k); var btns=document.querySelectorAll("#qseg button"); if(btns[idx]){btns[idx].className="on";btns[idx].style.background=stOf(k).c;}
  render();
  try{ var up=await biltia.update("chantiers",id,{statut:k}); replaceCh(up); biltia.notify("Statut mis à jour"); }catch(e){ c.statut=prev; render(); }
}
function replaceCh(up){ if(!up||!up.id)return; for(var i=0;i<S.chantiers.length;i++)if(S.chantiers[i].id===up.id)S.chantiers[i]=up; }
async function delChantier(id){ var c=findCh(id); if(!c)return; if(!confirm("Supprimer définitivement le chantier « "+(c.nom||"")+" » ?"))return;
  try{ await biltia.remove("chantiers",id); S.chantiers=S.chantiers.filter(function(x){return x.id!==id;}); biltia.notify("Chantier supprimé"); closeModal(); render(); }catch(e){} }

/* Assistant création / édition (3 étapes) */
function optClients(sel){ var o='<option value="">— Aucun client —</option>'; S.clients.forEach(function(c){o+='<option value="'+c.id+'"'+(c.id===sel?" selected":"")+'>'+esc(c.nom)+'</option>';}); o+='<option value="__new">➕ Nouveau client…</option>'; return o; }
function optEmp(sel){ var o='<option value="">— Non affecté —</option>'; S.employees.forEach(function(e){var nm=((e.prenom||"")+" "+(e.nom||"")).trim()||e.nom;o+='<option value="'+e.id+'"'+(e.id===sel?" selected":"")+'>'+esc(nm)+'</option>';}); o+='<option value="__new">➕ Nouveau…</option>'; return o; }
function openWizard(id){
  var c=id?findCh(id):{ nom:"",client_id:"",ville:"",adresse:"",code_postal:"",statut:"en_attente",avancement:0,budget:"",budget_engage:"",chef_chantier_id:"",date_debut:todayISO(),date_fin_prevue:"",description:"" };
  S.edit=JSON.parse(JSON.stringify(c)); S.step=0; renderWizard();
}
function renderWizard(){
  var c=S.edit,isNew=!c.id,step=S.step;
  var h='<div class="modal-h"><div><div class="modal-title">'+(isNew?"Nouveau chantier":"Modifier le chantier")+'</div><div class="modal-sub">Étape '+(step+1)+' sur 3</div></div><button class="x" onclick="closeModal()">✕</button></div>';
  h+='<div class="steps">'+[0,1,2].map(function(i){return '<div class="step-dot'+(i<=step?" done":"")+'"></div>';}).join("")+'</div>';
  if(step===0){
    h+='<div class="fg"><label class="fl">Nom du chantier *</label><input id="w-nom" value="'+esc(c.nom||"")+'" placeholder="Rénovation Villa Martin"></div>';
    h+='<div class="fg"><label class="fl">Client</label><select id="w-client" onchange="wNewClient(this.value)">'+optClients(c.client_id)+'</select></div>';
    h+='<div class="form-row"><div class="fg"><label class="fl">Ville</label><input id="w-ville" value="'+esc(c.ville||"")+'"></div><div class="fg"><label class="fl">Code postal</label><input id="w-cp" value="'+esc(c.code_postal||"")+'"></div></div>';
    h+='<div class="fg"><label class="fl">Adresse</label><input id="w-adresse" value="'+esc(c.adresse||"")+'"></div>';
  } else if(step===1){
    h+='<div class="fg"><label class="fl">Statut</label><div class="seg" id="w-seg">'+["en_attente","en_cours","en_retard","termine","annule"].map(function(k){return '<button type="button" onclick="wStatut(\\''+k+'\\')" class="'+(c.statut===k?"on":"")+'" style="'+(c.statut===k?"background:"+stOf(k).c:"")+'">'+stOf(k).l+'</button>';}).join("")+'</div></div>';
    h+='<div class="fg"><label class="fl">Avancement</label><div class="range-row"><input type="range" min="0" max="100" step="5" value="'+num(c.avancement)+'" oninput="wAv(this.value)"><span class="range-val" id="w-avval">'+Math.round(num(c.avancement))+'%</span></div></div>';
    h+='<div class="form-row"><div class="fg"><label class="fl">Budget (€ HT)</label><input id="w-budget" inputmode="decimal" value="'+esc(c.budget||"")+'"></div><div class="fg"><label class="fl">Engagé (€ HT)</label><input id="w-engage" inputmode="decimal" value="'+esc(c.budget_engage||"")+'"></div></div>';
    h+='<div class="fg"><label class="fl">Chef de chantier</label><select id="w-chef" onchange="wNewChef(this.value)">'+optEmp(c.chef_chantier_id)+'</select></div>';
  } else {
    h+='<div class="form-row"><div class="fg"><label class="fl">Début</label><input type="date" id="w-debut" value="'+esc((c.date_debut||"").slice(0,10))+'"></div><div class="fg"><label class="fl">Fin prévue</label><input type="date" id="w-fin" value="'+esc((c.date_fin_prevue||"").slice(0,10))+'"></div></div>';
    h+='<div class="fg"><label class="fl">Description</label><textarea id="w-desc" rows="3" placeholder="Nature des travaux, remarques…">'+esc(c.description||"")+'</textarea></div>';
    h+='<div class="card" style="background:var(--soft);box-shadow:none"><div class="fl" style="margin-bottom:8px">Récapitulatif</div><div class="det-row"><span class="k">Chantier</span><span class="v">'+esc(c.nom||"—")+'</span></div><div class="det-row"><span class="k">Client</span><span class="v">'+esc(clientName(c.client_id)||"—")+'</span></div><div class="det-row"><span class="k">Statut</span><span class="v">'+stOf(c.statut).l+' · '+Math.round(num(c.avancement))+'%</span></div><div class="det-row"><span class="k">Budget</span><span class="v">'+money(c.budget)+'</span></div></div>';
  }
  h+='<div class="modal-actions">';
  if(step>0) h+='<button class="btn btn-ghost" onclick="wBack()">Retour</button>';
  if(step<2) h+='<button class="btn btn-primary" onclick="wNext()">Continuer</button>';
  else h+='<button class="btn btn-primary" id="w-save" onclick="wSave()">'+(isNew?"Créer le chantier":"Enregistrer")+'</button>';
  h+='</div>';
  openModal(h);
}
function wSync(){ var c=S.edit,step=S.step; if(!c)return;
  if(step===0){ if($("w-nom"))c.nom=$("w-nom").value; if($("w-ville"))c.ville=$("w-ville").value; if($("w-cp"))c.code_postal=$("w-cp").value; if($("w-adresse"))c.adresse=$("w-adresse").value; if($("w-client")&&$("w-client").value!=="__new")c.client_id=$("w-client").value; }
  else if(step===1){ if($("w-budget"))c.budget=$("w-budget").value; if($("w-engage"))c.budget_engage=$("w-engage").value; if($("w-chef")&&$("w-chef").value!=="__new")c.chef_chantier_id=$("w-chef").value; }
  else { if($("w-debut"))c.date_debut=$("w-debut").value; if($("w-fin"))c.date_fin_prevue=$("w-fin").value; if($("w-desc"))c.description=$("w-desc").value; }
}
function wStatut(k){ wSync(); S.edit.statut=k; renderWizard(); }
function wAv(v){ S.edit.avancement=num(v); var el=$("w-avval"); if(el)el.textContent=Math.round(num(v))+"%"; }
function wBack(){ wSync(); S.step--; renderWizard(); }
function wNext(){ wSync(); if(S.step===0 && !String(S.edit.nom||"").trim()){ var el=$("w-nom"); if(el){el.classList.add("invalid");el.focus();} return; } S.step++; renderWizard(); }
function wNewClient(v){ if(v!=="__new"){S.edit.client_id=v;return;} var nm=prompt("Nom du nouveau client :",""); if(nm&&nm.trim()){ biltia.create("clients",{nom:nm.trim()}).then(function(cl){ S.clients.push(cl); S.clients.sort(function(a,b){return String(a.nom).localeCompare(String(b.nom));}); S.edit.client_id=cl.id; wSync(); renderWizard(); biltia.notify("Client ajouté"); }).catch(function(){}); } else { wSync(); renderWizard(); } }
function wNewChef(v){ if(v!=="__new"){S.edit.chef_chantier_id=v;return;} var nm=prompt("Nom du chef de chantier :",""); if(nm&&nm.trim()){ biltia.create("employees",{nom:nm.trim(),role:"Chef de chantier"}).then(function(e){ S.employees.push(e); S.edit.chef_chantier_id=e.id; wSync(); renderWizard(); biltia.notify("Ajouté à l\\'équipe"); }).catch(function(){}); } else { wSync(); renderWizard(); } }
async function wSave(){
  wSync(); var c=S.edit;
  if(!String(c.nom||"").trim()){ S.step=0; renderWizard(); return; }
  var payload={ nom:String(c.nom).trim(), client_id:c.client_id||null, ville:c.ville||null, code_postal:c.code_postal||null, adresse:c.adresse||null, statut:c.statut||"en_attente", avancement:Math.round(num(c.avancement)), budget:num(c.budget)||null, budget_engage:num(c.budget_engage)||null, chef_chantier_id:c.chef_chantier_id||null, date_debut:c.date_debut||null, date_fin_prevue:c.date_fin_prevue||null, description:c.description||null };
  var b=$("w-save"); if(b){b.disabled=true;b.textContent="Enregistrement…";}
  try{
    if(c.id){ var up=await biltia.update("chantiers",c.id,payload); replaceCh(up); biltia.notify("Chantier enregistré"); }
    else { var row=await biltia.create("chantiers",payload); S.chantiers.unshift(row); biltia.notify("Chantier créé"); }
    closeModal(); render();
  }catch(e){ if(b){b.disabled=false;b.textContent=c.id?"Enregistrer":"Créer le chantier";} }
}

/* Matériel */
function findMat(id){for(var i=0;i<S.materials.length;i++)if(S.materials[i].id===id)return S.materials[i];return null;}
function openMateriel(id){
  var m=id?findMat(id):{ nom:"",reference:"",categorie:"",quantite:"1",unite:"u",statut:"disponible",chantier_id:"",notes:"" };
  S.edit=JSON.parse(JSON.stringify(m));
  var MST=[["disponible","Disponible"],["affecte","Affecté"],["maintenance","Maintenance"],["hors_service","Hors service"]];
  var optCh='<option value="">— Aucun —</option>'+S.chantiers.map(function(c){return '<option value="'+c.id+'"'+(c.id===m.chantier_id?" selected":"")+'>'+esc(c.nom)+'</option>';}).join("");
  var h='<div class="modal-h"><div><div class="modal-title">'+(id?"Modifier le matériel":"Nouveau matériel")+'</div></div><button class="x" onclick="closeModal()">✕</button></div>';
  h+='<div class="fg"><label class="fl">Nom *</label><input id="m-nom" value="'+esc(m.nom||"")+'" placeholder="Nacelle 12m, bétonnière…"></div>';
  h+='<div class="form-row"><div class="fg"><label class="fl">Référence</label><input id="m-ref" value="'+esc(m.reference||"")+'"></div><div class="fg"><label class="fl">Catégorie</label><input id="m-cat" value="'+esc(m.categorie||"")+'" placeholder="Engin, outil…"></div></div>';
  h+='<div class="form-row"><div class="fg"><label class="fl">Quantité</label><input id="m-qte" inputmode="decimal" value="'+esc(m.quantite!=null?m.quantite:"1")+'"></div><div class="fg"><label class="fl">Unité</label><input id="m-unite" value="'+esc(m.unite||"u")+'"></div></div>';
  h+='<div class="fg"><label class="fl">Statut</label><div class="seg" id="m-seg">'+MST.map(function(o){return '<button type="button" onclick="matStatut(\\''+o[0]+'\\')" class="'+(m.statut===o[0]?"on":"")+'" style="'+(m.statut===o[0]?"background:var(--vio)":"")+'">'+o[1]+'</button>';}).join("")+'</div></div>';
  h+='<div class="fg"><label class="fl">Chantier affecté</label><select id="m-ch">'+optCh+'</select></div>';
  h+='<div class="modal-actions"><button class="btn btn-primary" id="m-save" onclick="matSave()">'+(id?"Enregistrer":"Ajouter")+'</button>'+(id?'<button class="btn btn-danger" style="flex:0 0 auto" onclick="matDel(\\''+id+'\\')">Supprimer</button>':'')+'</div>';
  openModal(h);
}
function matStatut(k){ S.edit.statut=k; document.querySelectorAll("#m-seg button").forEach(function(b){b.className="";b.style.background="";}); var ks=["disponible","affecte","maintenance","hors_service"]; var i=ks.indexOf(k); var btns=document.querySelectorAll("#m-seg button"); if(btns[i]){btns[i].className="on";btns[i].style.background="var(--vio)";} }
async function matSave(){
  var m=S.edit; if($("m-nom"))m.nom=$("m-nom").value; if($("m-ref"))m.reference=$("m-ref").value; if($("m-cat"))m.categorie=$("m-cat").value; if($("m-qte"))m.quantite=$("m-qte").value; if($("m-unite"))m.unite=$("m-unite").value; if($("m-ch"))m.chantier_id=$("m-ch").value;
  if(!String(m.nom||"").trim()){ var el=$("m-nom"); if(el){el.classList.add("invalid");el.focus();} return; }
  var payload={ nom:String(m.nom).trim(), reference:m.reference||null, categorie:m.categorie||null, quantite:num(m.quantite)||null, unite:m.unite||null, statut:m.statut||"disponible", chantier_id:m.chantier_id||null, notes:m.notes||null };
  var b=$("m-save"); if(b){b.disabled=true;b.textContent="Enregistrement…";}
  try{
    if(m.id){ var up=await biltia.update("materials",m.id,payload); for(var i=0;i<S.materials.length;i++)if(S.materials[i].id===m.id)S.materials[i]=up; biltia.notify("Matériel enregistré"); }
    else { var row=await biltia.create("materials",payload); S.materials.unshift(row); biltia.notify("Matériel ajouté"); }
    closeModal(); render();
  }catch(e){ if(b){b.disabled=false;b.textContent=m.id?"Enregistrer":"Ajouter";} }
}
async function matDel(id){ if(!confirm("Supprimer ce matériel ?"))return; try{ await biltia.remove("materials",id); S.materials=S.materials.filter(function(x){return x.id!==id;}); biltia.notify("Matériel supprimé"); closeModal(); render(); }catch(e){} }

/* Init */
function initBrand(){ if(!S.entreprise||S.entreprise.indexOf("__")===0)S.entreprise="Mon entreprise"; var eb=S.entreprise.toUpperCase().slice(0,22); ["side-eyebrow","hd-eyebrow","tb-eyebrow"].forEach(function(i){var el=$(i);if(el)el.textContent=eb;}); ["side-logo","hd-logo"].forEach(function(i){var el=$(i);if(el)el.textContent=initials(S.entreprise)||"B";}); }
var _rz;
function start(){ initBrand(); renderNav(); boot(); if(window.addEventListener)window.addEventListener("resize",function(){ if(_rz)clearTimeout(_rz); _rz=setTimeout(function(){ if(S.view==="dashboard")render(); },200); }); }
if(document.readyState!=="loading"){ start(); } else { document.addEventListener("DOMContentLoaded",start); }
${CHART_ENGINE_JS}
</script>
</body>
</html>`;
