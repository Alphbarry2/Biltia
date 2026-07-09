// ─────────────────────────────────────────────────────────────────────────────
// APP PHARE — POINTAGE DES HEURES (feuille d'heures, layout distinct)
//
// 6e app phare. Layout à part : un REGISTRE d'heures CENTRÉ SUR LE JOUR (pas une
// grille) — on navigue jour par jour, une bande de 7 pastilles sert de sélecteur,
// on ajoute des heures avec un STEPPER (−/+ 0,5 h) et on VALIDE chaque pointage
// d'un clic (coche). Identité ROSE/FRAMBOISE #DB2777 (≠ indigo/violet/teal/orange/bleu).
// 3 vues : Saisie (jour) · Récap (semaine, validation) · Chantiers (heures/main d'œuvre).
//
// Entité workspace : pointages { employee_id, chantier_id, intervention_id,
// date_pointage (AAAA-MM-JJ), heures (nombre), type (normal|heure_sup|trajet|absence),
// valide (booléen), notes }. Aussi : employees, chantiers. SDK injecté à l'instanciation.
// Contrainte : PAS de template literals NI de backticks dans le JS de l'app.
// ─────────────────────────────────────────────────────────────────────────────

import { CHART_CSS, CHART_ENGINE_JS } from "@/lib/app-charts";

export const APP_POINTAGE_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Pointage des heures</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
img,svg{max-width:100%}
:root{--bg:#FBF5F8;--ink:#1B1220;--mut:#6B5D6E;--faint:#A695AC;--line:#EFE1EA;--soft:#F7EDF3;
--rz:#DB2777;--grad:#DB2777;--glow:219,39,119;--tint:#FCE7F3;--tintline:#F5B9D6;
--shadow:0 1px 2px rgba(27,18,32,.04),0 6px 18px rgba(27,18,32,.05);--shadow-lg:0 14px 44px rgba(27,18,32,.16)}
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
.badge-gray{background:#F3EDF1;color:#6B5D6E;border:1px solid #EFE1EA}
.badge-blue{background:#EFF6FF;color:#2563EB;border:1px solid #BFDBFE}
.badge-rose{background:#FFF1F5;color:#BE185D;border:1px solid #FBCFE0}
input,select,textarea{font-family:inherit;font-size:16px;color:var(--ink);background:#fff;border:1px solid #E4D3DE;border-radius:12px;padding:10px 14px;width:100%;outline:none;transition:border .15s,box-shadow .15s}
input:focus,select:focus,textarea:focus{border-color:var(--rz);box-shadow:0 0 0 3px rgba(var(--glow),.14)}
input::placeholder,textarea::placeholder{color:#A695AC}
input.invalid,select.invalid{border-color:#E11D48;box-shadow:0 0 0 3px rgba(225,29,72,.12)}
.shell{display:flex;min-height:100vh}
.sidebar{display:none}
.app-main{flex:1;min-width:0;padding:0 0 90px}
.app-header{position:fixed;top:0;left:0;right:0;z-index:100;background:rgba(251,245,248,.85);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-bottom:1px solid var(--line);height:60px;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 14px}
.brand{display:flex;align-items:center;gap:10px;min-width:0}
.brand-logo{width:30px;height:30px;border-radius:9px;background:var(--grad);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:14px;flex-shrink:0}
.app-eyebrow{font-size:10px;font-weight:700;color:var(--rz);text-transform:uppercase;letter-spacing:.12em;display:block;line-height:1.2}
.app-title{font-size:15px;font-weight:800;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px;line-height:1.2}
.mtop{height:60px}
.tab-bar{position:fixed;bottom:0;left:0;right:0;background:rgba(251,245,248,.94);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-top:1px solid var(--line);display:flex;z-index:100}
.tab-item{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:8px 4px 10px;cursor:pointer;border:none;background:none;font-size:10px;font-weight:600;color:#A695AC;font-family:inherit;min-height:56px}
.tab-item.active{color:var(--rz)}
.tab-ic{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.fab{position:fixed;right:16px;bottom:78px;z-index:120;width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;color:#fff;font-size:28px;line-height:1;background:var(--grad);box-shadow:0 8px 22px rgba(var(--glow),.30);display:flex;align-items:center;justify-content:center}
.fab:active{transform:scale(.94)}
.view-pad{padding:16px}
.topbar{display:none}
.section-h{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:20px 2px 12px}
.section-h b{font-size:15px;font-weight:700}
.empty{text-align:center;padding:48px 20px}
.empty-ico{width:54px;height:54px;border-radius:16px;background:var(--tint);color:var(--rz);display:flex;align-items:center;justify-content:center;margin:0 auto 14px;font-size:24px}
.empty-title{font-weight:700;margin-bottom:4px}
.empty-sub{font-size:13px;color:var(--mut);margin-bottom:16px}
.spin{width:26px;height:26px;border:3px solid var(--line);border-top-color:var(--rz);border-radius:50%;animation:sp .7s linear infinite;margin:60px auto}
@keyframes sp{to{transform:rotate(360deg)}}
.mini-av{width:26px;height:26px;border-radius:8px;font-size:10px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;flex-shrink:0}
/* ── Barre jour / semaine ── */
.wk-nav{display:flex;align-items:center;gap:10px;margin-bottom:14px}
.wk-btn{width:36px;height:36px;border-radius:10px;border:1px solid var(--line);background:#fff;cursor:pointer;font-size:18px;color:var(--ink);flex-shrink:0}
.wk-btn:hover{border-color:var(--tintline)}
.wk-lbl{line-height:1.15;min-width:0}.wk-lbl b{font-size:15px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.wk-lbl span{font-size:11px;color:var(--mut)}
.wk-nav .btn{margin-left:auto}
/* ── Stats compactes ── */
.qstats{display:flex;background:#fff;border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);overflow:hidden;margin-bottom:14px}
.qstat{flex:1;padding:12px 10px;text-align:center;border-right:1px solid var(--line)}
.qstat:last-child{border-right:none}
.qstat b{display:block;font-size:21px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.qstat span{font-size:10.5px;color:var(--mut);font-weight:600}
.qstat.warn b{color:#B45309}
/* ── Bande de jours (sélecteur) ── */
.wk-strip{display:flex;gap:7px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:2px;margin-bottom:16px}
.day-pill{flex:1;min-width:46px;border:1px solid var(--line);background:#fff;border-radius:14px;padding:9px 4px 8px;text-align:center;cursor:pointer;font-family:inherit;transition:all .15s}
.day-pill:hover{border-color:var(--tintline)}
.day-pill.on{background:var(--grad);border-color:transparent;color:#fff;box-shadow:0 6px 16px rgba(var(--glow),.28)}
.day-pill .dw{display:block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;opacity:.72}
.day-pill .dn{display:block;font-size:16px;font-weight:800;line-height:1.15;margin:1px 0}
.day-pill .dh{display:block;font-size:10px;font-weight:600;color:var(--rz)}
.day-pill.on .dh{color:#fff;opacity:.92}
.day-pill.today:not(.on){box-shadow:inset 0 0 0 1.5px var(--tintline)}
/* ── Registre (pointages du jour) ── */
.pentry{display:flex;align-items:center;gap:12px;background:#fff;border:1px solid var(--line);border-radius:16px;padding:12px 14px;box-shadow:var(--shadow);margin-bottom:10px;cursor:pointer;transition:all .15s}
.pentry:hover{border-color:var(--tintline);box-shadow:0 6px 18px rgba(27,18,32,.07)}
.pe-main{min-width:0;flex:1}
.pe-name{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pe-sub{font-size:12px;color:var(--mut);display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:2px}
.pe-h{font-size:22px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1;flex-shrink:0;text-align:right}
.pe-h span{font-size:12px;font-weight:600;color:var(--mut)}
.pe-chk{width:36px;height:36px;border-radius:11px;border:1px solid var(--line);background:#fff;flex-shrink:0;cursor:pointer;color:var(--faint);display:flex;align-items:center;justify-content:center;font-size:17px;transition:all .15s}
.pe-chk:hover{border-color:var(--tintline)}
.pe-chk.on{background:#ECFDF5;border-color:#A7F3D0;color:#059669}
/* ── Récap (cartes équipier) ── */
.card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:16px;box-shadow:var(--shadow)}
.grid-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:12px}
.rcard{background:#fff;border:1px solid var(--line);border-radius:18px;padding:16px;box-shadow:var(--shadow)}
.avatar{width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:#fff;flex-shrink:0}
.rc-tot{font-size:22px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums;line-height:1}
.rc-tot span{font-size:12px;font-weight:600;color:var(--mut)}
.hbars{display:flex;align-items:flex-end;gap:5px;height:44px;margin:14px 0 4px}
.hbar{flex:1;background:var(--soft);border-radius:5px;position:relative;min-height:4px}
.hbar i{position:absolute;left:0;right:0;bottom:0;border-radius:5px;background:var(--grad);transition:height .5s cubic-bezier(.2,.8,.2,1)}
.hbar.abs i{background:#F5B9D6}
.hlabels{display:flex;gap:5px;margin-bottom:12px}
.hlabels span{flex:1;text-align:center;font-size:9.5px;color:var(--faint);font-weight:600;text-transform:uppercase}
.rc-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding-top:12px;border-top:1px solid var(--line)}
.rc-foot small{font-size:12px;color:var(--mut)}
/* ── Chantiers (heures) ── */
.chrow{display:flex;align-items:center;gap:12px;background:#fff;border:1px solid var(--line);border-radius:14px;padding:13px 15px;box-shadow:var(--shadow);margin-bottom:10px}
.chdot{width:11px;height:11px;border-radius:4px;flex-shrink:0}
.chrow .nm{min-width:0;flex:1}
.chrow .nm b{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}
.chrow .nm small{font-size:11.5px;color:var(--mut)}
.chbar{height:8px;border-radius:5px;background:var(--soft);overflow:hidden;margin-top:6px}
.chbar i{display:block;height:100%;border-radius:5px;background:var(--grad)}
.chrow .hh{font-size:17px;font-weight:800;font-variant-numeric:tabular-nums;flex-shrink:0;white-space:nowrap}
.chrow .hh span{font-size:11px;font-weight:600;color:var(--mut)}
/* ── Stepper heures (modale) ── */
.stepper{display:flex;align-items:center;gap:12px}
.stp{width:50px;height:50px;border-radius:14px;border:1px solid var(--line);background:#fff;font-size:26px;font-weight:600;color:var(--rz);cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;line-height:1}
.stp:hover{border-color:var(--tintline);background:var(--soft)}
.stp:active{transform:scale(.94)}
.stp-in{text-align:center;font-size:22px;font-weight:800;padding:12px 8px}
.stp-quick{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.stp-quick button{border:1px solid var(--line);background:#fff;color:var(--mut);font-weight:600;font-size:12px;padding:7px 12px;border-radius:9px;cursor:pointer;font-family:inherit}
.stp-quick button:hover{border-color:var(--tintline);color:var(--rz)}
/* Modale */
.overlay{position:fixed;inset:0;background:rgba(20,10,18,.44);backdrop-filter:blur(6px);z-index:200;display:flex;align-items:flex-end;justify-content:center}
.overlay[hidden]{display:none}
@media(min-width:600px){.overlay{align-items:center;padding:20px}}
.modal{background:#fff;border-radius:24px 24px 0 0;width:100%;max-width:520px;max-height:92vh;overflow-y:auto;padding:22px 20px calc(22px + env(safe-area-inset-bottom));box-shadow:var(--shadow-lg)}
@media(min-width:600px){.modal{border-radius:24px}}
.modal-h{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px}
.modal-title{font-size:18px;font-weight:800;letter-spacing:-.01em}
.modal-sub{font-size:12.5px;color:var(--mut);margin-top:2px}
.x{border:none;background:var(--soft);width:34px;height:34px;border-radius:10px;color:var(--mut);font-size:18px;cursor:pointer;flex-shrink:0}
.fg{margin-bottom:14px}
.fl{display:block;font-size:11px;font-weight:700;color:#6B5D6E;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}
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
  .side-item.active{background:var(--tint);color:var(--rz)}
  .side-item svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}
  .app-main{padding:0 0 40px}
  .topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:26px 32px 6px}
  .view-pad{padding:16px 32px}
  .qstats{max-width:560px}
}
@media(max-width:400px){.view-pad{padding:13px}.app-title{max-width:120px}.btn{padding:11px 15px}.qstat b{font-size:19px}}
@media(min-width:1600px){.topbar,.view-pad{max-width:1520px;margin-left:auto;margin-right:auto}}
@media print{.sidebar,.app-header,.tab-bar,.fab,.no-print{display:none!important}}
${CHART_CSS}
</style>
</head>
<body>
<div class="shell">
  <aside class="sidebar">
    <div class="side-brand"><span class="brand-logo" id="side-logo">B</span><div style="min-width:0"><span class="app-eyebrow" id="side-eyebrow">BILTIA</span><span class="app-title" id="side-title">Heures</span></div></div>
    <nav class="side-nav" id="side-nav"></nav>
  </aside>
  <div class="app-main">
    <header class="app-header">
      <div class="brand"><span class="brand-logo" id="hd-logo">B</span><div style="min-width:0"><span class="app-eyebrow" id="hd-eyebrow">BILTIA</span><span class="app-title">Heures</span></div></div>
      <button class="btn btn-primary btn-sm" id="hd-add" onclick="primaryAdd()">+ Pointer</button>
    </header>
    <div class="mtop"></div>
    <div class="topbar">
      <div><span class="app-eyebrow" id="tb-eyebrow">BILTIA</span><div id="tb-title" style="font-size:22px;font-weight:800;letter-spacing:-.02em">Saisie</div></div>
      <button class="btn btn-primary" id="tb-add" onclick="primaryAdd()">+ Pointer des heures</button>
    </div>
    <main id="view"><div class="spin"></div></main>
  </div>
</div>
<nav class="tab-bar" id="tab-bar"></nav>
<button class="fab" onclick="primaryAdd()" aria-label="Ajouter">+</button>
<div class="overlay" id="ovl" hidden><div class="modal" id="modal"></div></div>

<script>
var S={ view:"saisie", pointages:[], employees:[], chantiers:[], entreprise:"__ENTREPRISE__", day:"", edit:null };
var $=function(id){return document.getElementById(id);};
function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
function pad2(n){return String(n).padStart(2,"0");}
function todayISO(){var d=new Date();return d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate());}
function initials(s){var w=String(s||"?").trim().split(/\\s+/);return ((w[0]||"?")[0]+(w[1]?w[1][0]:"")).toUpperCase();}
var AV=["#DB2777","#7C3AED","#0284C7","#EA580C","#0D9488","#4F46E5","#059669","#DC2626"];
function avc(seed){var s=String(seed||""),h=0;for(var i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;return AV[h%AV.length];}
var WD=["dim","lun","mar","mer","jeu","ven","sam"];
var WDL=["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"];
function mondayOf(iso){var d=new Date(String(iso||todayISO()).slice(0,10));d.setDate(d.getDate()-((d.getDay()+6)%7));return d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate());}
function weekDays(startISO){var out=[];var b=new Date(String(startISO).slice(0,10));for(var i=0;i<7;i++){var d=new Date(b);d.setDate(b.getDate()+i);out.push({key:d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate()),wd:WD[d.getDay()],dm:pad2(d.getDate())+"/"+pad2(d.getMonth()+1)});}return out;}
function fmtLong(iso){var d=new Date(String(iso).slice(0,10));return WDL[d.getDay()]+" "+pad2(d.getDate())+"/"+pad2(d.getMonth()+1);}
function dayShift(iso,n){var d=new Date(String(iso).slice(0,10));d.setDate(d.getDate()+n);return d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate());}
function numH(v){var n=parseFloat(String(v==null?"":v).replace(",","."));return isFinite(n)?n:0;}
function nfH(n){var r=Math.round((+n||0)*100)/100;return (r%1===0)?String(r):(""+r).replace(".",",");}
function findEmp(id){for(var i=0;i<S.employees.length;i++)if(S.employees[i].id===id)return S.employees[i];return null;}
function empName(id){var e=findEmp(id);return e?(((e.prenom||"")+" "+(e.nom||"")).trim()||e.nom||""):"";}
function chantierName(id){for(var i=0;i<S.chantiers.length;i++)if(S.chantiers[i].id===id)return S.chantiers[i].nom;return "";}
function findPt(id){for(var i=0;i<S.pointages.length;i++)if(S.pointages[i].id===id)return S.pointages[i];return null;}
function activeEmps(){return S.employees.filter(function(e){return e.statut!=="inactif";});}
function pday(p){return String(p.date_pointage||"").slice(0,10);}
function pworked(p){return p.type!=="absence";}
function phrs(p){return pworked(p)?numH(p.heures):0;}
function dayEntries(day){return S.pointages.filter(function(p){return pday(p)===day;});}
function dayWorked(day){var s=0;S.pointages.forEach(function(p){if(pday(p)===day)s+=phrs(p);});return s;}
function weekHours(monday){var days=weekDays(monday),set={};days.forEach(function(d){set[d.key]=1;});var s=0;S.pointages.forEach(function(p){if(set[pday(p)])s+=phrs(p);});return s;}
function weekRange(){var days=weekDays(mondayOf(S.day));return {from:days[0].key,to:days[6].key,days:days};}
function weekPending(){var r=weekRange();var n=0;S.pointages.forEach(function(p){var d=pday(p);if(d>=r.from&&d<=r.to&&!p.valide)n++;});return n;}

var PTYPE={ normal:{l:"Normal",b:"badge-gray"}, heure_sup:{l:"Heure sup",b:"badge-amber"}, trajet:{l:"Trajet",b:"badge-blue"}, absence:{l:"Absence",b:"badge-rose"} };
var TYPES=[["normal","Normal"],["heure_sup","Heure sup"],["trajet","Trajet"],["absence","Absence"]];

var NAV=[
  {id:"saisie",label:"Saisie",icon:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'},
  {id:"recap",label:"Récap",icon:'<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3.5 6l1 1 2-2"/><path d="M3.5 12l1 1 2-2"/><path d="M3.5 18l1 1 2-2"/>'},
  {id:"chantiers",label:"Chantiers",icon:'<path d="M3 21h18"/><rect x="5" y="10" width="3.4" height="8" rx="1"/><rect x="10.3" y="6" width="3.4" height="12" rx="1"/><rect x="15.6" y="13" width="3.4" height="5" rx="1"/>'}
];

async function boot(){
  try{
    var r=await Promise.all([
      biltia.list("pointages",{limit:4000}).catch(function(){return[];}),
      biltia.list("employees",{order:"nom",ascending:true,limit:400}).catch(function(){return[];}),
      biltia.list("chantiers",{order:"created_at",ascending:false,limit:600}).catch(function(){return[];})
    ]);
    S.pointages=r[0]||[]; S.employees=r[1]||[]; S.chantiers=r[2]||[];
    renderNav(); render();
  }catch(e){ $("view").innerHTML='<div class="view-pad"><div class="empty"><div class="empty-ico">⚠️</div><div class="empty-title">Connexion au workspace impossible</div><div class="empty-sub">Vérifiez votre connexion puis rouvrez l\\'application.</div></div></div>'; }
}
function renderNav(){
  $("side-nav").innerHTML=NAV.map(function(n){return '<button class="side-item'+(S.view===n.id?" active":"")+'" onclick="go(\\''+n.id+'\\')"><svg viewBox="0 0 24 24">'+n.icon+'</svg><span>'+n.label+'</span></button>';}).join("");
  $("tab-bar").innerHTML=NAV.map(function(n){return '<button class="tab-item'+(S.view===n.id?" active":"")+'" onclick="go(\\''+n.id+'\\')"><svg class="tab-ic" viewBox="0 0 24 24">'+n.icon+'</svg><span>'+n.label+'</span></button>';}).join("");
}
function go(v){ S.view=v; renderNav(); render(); try{window.scrollTo(0,0);}catch(e){} }
function primaryAdd(){ openEntry(null); }
function render(){
  var titles={saisie:"Saisie",recap:"Récap semaine",chantiers:"Heures par chantier"};
  $("tb-title").textContent=titles[S.view]||"";
  if($("hd-add"))$("hd-add").textContent="+ Pointer";
  if($("tb-add"))$("tb-add").textContent="+ Pointer des heures";
  if(S.view==="saisie") renderSaisie();
  else if(S.view==="recap") renderRecap();
  else renderChantiers();
}

/* ── Vue : Saisie (jour) ── */
function prevDay(){ S.day=dayShift(S.day,-1); renderSaisie(); }
function nextDay(){ S.day=dayShift(S.day,1); renderSaisie(); }
function goToday(){ S.day=todayISO(); renderSaisie(); }
function selectDay(k){ S.day=k; renderSaisie(); }
function renderSaisie(){
  var day=S.day, today=todayISO(), recs=dayEntries(day), days=weekDays(mondayOf(day));
  var dh=0; recs.forEach(function(p){dh+=phrs(p);}); var pend=weekPending();
  var h='<div class="view-pad">';
  h+='<div class="wk-nav"><button class="wk-btn" onclick="prevDay()" aria-label="Jour précédent">‹</button><div class="wk-lbl"><b>'+fmtLong(day)+(day===today?" · aujourd\\'hui":"")+'</b><span>'+nfH(dh)+' h pointées · '+recs.length+' saisie'+(recs.length>1?"s":"")+'</span></div><button class="wk-btn" onclick="nextDay()" aria-label="Jour suivant">›</button><button class="btn btn-ghost btn-sm" onclick="goToday()">Aujourd\\'hui</button></div>';
  h+='<div class="qstats"><div class="qstat"><b>'+nfH(dh)+' h</b><span>ce jour</span></div><div class="qstat"><b>'+nfH(weekHours(mondayOf(day)))+' h</b><span>cette semaine</span></div><div class="qstat'+(pend?" warn":"")+'"><b>'+pend+'</b><span>à valider</span></div></div>';
  h+='<div class="wk-strip">'+days.map(function(d){var v=dayWorked(d.key);return '<button class="day-pill'+(d.key===day?" on":"")+(d.key===today?" today":"")+'" onclick="selectDay(\\''+d.key+'\\')"><span class="dw">'+d.wd+'</span><span class="dn">'+d.dm.slice(0,2)+'</span><span class="dh">'+(v?nfH(v)+" h":"—")+'</span></button>';}).join("")+'</div>';
  if(!recs.length){
    h+='<div class="empty"><div class="empty-ico">⏱️</div><div class="empty-title">Aucune heure ce jour</div><div class="empty-sub">Pointez le temps passé par votre équipe.</div><button class="btn btn-primary" onclick="openEntry(null)">+ Pointer des heures</button></div>';
  } else {
    h+='<div class="section-h" style="margin-top:4px"><b>Pointages du jour</b><span class="badge badge-gray">'+recs.length+' · '+nfH(dh)+' h</span></div>';
    recs.slice().sort(function(a,b){return String(empName(a.employee_id)).localeCompare(String(empName(b.employee_id)));}).forEach(function(p){
      var nm=empName(p.employee_id)||"Équipier", ty=PTYPE[p.type]||PTYPE.normal, ch=chantierName(p.chantier_id);
      h+='<div class="pentry" onclick="openEntry(\\''+p.id+'\\')">'
        +'<span class="mini-av" style="width:36px;height:36px;border-radius:11px;background:'+avc(nm)+'">'+esc(initials(nm))+'</span>'
        +'<div class="pe-main"><div class="pe-name">'+esc(nm)+'</div><div class="pe-sub"><span class="badge '+ty.b+'">'+ty.l+'</span>'+(ch?'<span>'+esc(ch)+'</span>':"")+(p.notes?'<span>· '+esc(p.notes)+'</span>':"")+'</div></div>'
        +'<div class="pe-h">'+(p.type==="absence"?'<span>abs.</span>':nfH(p.heures)+'<span> h</span>')+'</div>'
        +'<button class="pe-chk'+(p.valide?" on":"")+'" onclick="event.stopPropagation();toggleValide(\\''+p.id+'\\')" title="'+(p.valide?"Validé":"Valider")+'">'+(p.valide?"✓":"○")+'</button>'
        +'</div>';
    });
  }
  h+='</div>'; $("view").innerHTML=h;
}
async function toggleValide(id){
  var p=findPt(id); if(!p)return; var nv=!p.valide; p.valide=nv;
  render();
  try{ await biltia.update("pointages",id,{valide:nv}); biltia.notify(nv?"Pointage validé":"Validation retirée"); }
  catch(e){ p.valide=!nv; render(); biltia.notify("Action impossible"); }
}

/* ── Vue : Récap (semaine, validation) ── */
function shiftWeek(n){ S.day=dayShift(S.day,n*7); renderRecap(); }
function prevWeek(){shiftWeek(-1);} function nextWeek(){shiftWeek(1);} function thisWeek(){S.day=todayISO();renderRecap();}
function renderRecap(){
  var r=weekRange(), days=r.days, emps=activeEmps();
  var h='<div class="view-pad">';
  h+='<div class="wk-nav"><button class="wk-btn" onclick="prevWeek()" aria-label="Semaine précédente">‹</button><div class="wk-lbl"><b>Semaine du '+days[0].dm+'</b><span>au '+days[6].dm+'</span></div><button class="wk-btn" onclick="nextWeek()" aria-label="Semaine suivante">›</button><button class="btn btn-ghost btn-sm" onclick="thisWeek()">Cette semaine</button></div>';
  h+='<div class="chart-card" style="margin-bottom:16px"><div class="chart-hd"><b>Heures de l\\'équipe</b><span class="rd" id="rd-wk">—</span></div><div class="chart-host" id="ch-wk"></div></div>';
  if(!emps.length){ h+='<div class="empty"><div class="empty-ico">👷</div><div class="empty-title">Aucun équipier</div><div class="empty-sub">Ajoutez votre équipe pour suivre les heures.</div></div></div>'; $("view").innerHTML=h; return; }
  // pré-calc pour l'échelle des mini-barres
  var perEmp={}, maxDay=6;
  emps.forEach(function(e){ var arr=days.map(function(d){var s=0;S.pointages.forEach(function(p){if(p.employee_id===e.id&&pday(p)===d.key)s+=phrs(p);});if(s>maxDay)maxDay=s;return s;}); perEmp[e.id]=arr; });
  var cards=emps.map(function(e){
    var nm=empName(e.id)||"Sans nom", role=[e.role,e.corps_metier].filter(function(x){return String(x||"").trim();}).join(" · ")||"Équipier";
    var arr=perEmp[e.id], tot=0, sup=0, pend=0, cnt=0;
    S.pointages.forEach(function(p){ var d=pday(p); if(p.employee_id!==e.id||d<r.from||d>r.to)return; cnt++; if(!p.valide)pend++; if(pworked(p))tot+=numH(p.heures); if(p.type==="heure_sup")sup+=numH(p.heures); });
    var isAbs=days.map(function(d){var a=false;S.pointages.forEach(function(p){if(p.employee_id===e.id&&pday(p)===d.key&&p.type==="absence")a=true;});return a;});
    return '<div class="rcard"><div style="display:flex;align-items:center;gap:12px"><span class="avatar" style="background:'+avc(nm)+'">'+esc(initials(nm))+'</span>'
      +'<div style="min-width:0;flex:1"><div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(nm)+'</div><div style="color:var(--mut);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(role)+'</div></div>'
      +'<div class="rc-tot" style="text-align:right">'+nfH(tot)+'<span> h</span></div></div>'
      +'<div class="hbars">'+arr.map(function(v,i){var pct=Math.max(v>0?8:0,Math.round(v/maxDay*100));return '<div class="hbar'+(isAbs[i]?" abs":"")+'"><i style="height:'+pct+'%"></i></div>';}).join("")+'</div>'
      +'<div class="hlabels">'+days.map(function(d){return '<span>'+d.wd.slice(0,1)+'</span>';}).join("")+'</div>'
      +'<div class="rc-foot"><small>'+cnt+' pointage'+(cnt>1?"s":"")+(sup>0?' · '+nfH(sup)+' h sup':"")+'</small>'+(pend>0?'<button class="btn btn-primary btn-sm" onclick="validateWeek(\\''+e.id+'\\')">Valider ('+pend+')</button>':'<span class="badge badge-green">À jour ✓</span>')+'</div></div>';
  }).join("");
  h+='<div class="grid-cards">'+cards+'</div></div>'; $("view").innerHTML=h;
  try{
    var series=days.map(function(d){ var s=0;S.pointages.forEach(function(p){if(pday(p)===d.key&&emps.some(function(e){return e.id===p.employee_id;}))s+=phrs(p);}); return {value:s,label:d.wd,tip:d.dm}; });
    var tot=series.reduce(function(s,x){return s+x.value;},0);
    if($("rd-wk"))$("rd-wk").textContent=nfH(tot)+" h cette semaine";
    drawBars($("ch-wk"),series,{id:"wk",color:"#DB2777",color2:"#F9A8D4",fmt:function(v){return nfH(v)+" h";},rd:"rd-wk",rdDef:nfH(tot)+" h cette semaine"});
  }catch(e){}
}
async function validateWeek(empId){
  var r=weekRange();
  var recs=S.pointages.filter(function(p){var d=pday(p);return p.employee_id===empId&&!p.valide&&d>=r.from&&d<=r.to;});
  if(!recs.length)return;
  try{ await Promise.all(recs.map(function(p){return biltia.update("pointages",p.id,{valide:true}).then(function(){p.valide=true;});}));
    biltia.notify(recs.length+" pointage"+(recs.length>1?"s":"")+" validé"+(recs.length>1?"s":"")); renderRecap();
  }catch(e){ biltia.notify("Validation impossible"); }
}

/* ── Vue : Chantiers (heures / main d'œuvre) ── */
function renderChantiers(){
  var r=weekRange(), days=r.days;
  var byCh={}, order=[], people={};
  S.pointages.forEach(function(p){ var d=pday(p); if(d<r.from||d>r.to||!pworked(p))return; var c=p.chantier_id||"__none"; if(byCh[c]==null){byCh[c]=0;order.push(c);people[c]={};} byCh[c]+=numH(p.heures); if(p.employee_id)people[c][p.employee_id]=1; });
  order.sort(function(a,b){return byCh[b]-byCh[a];});
  var total=order.reduce(function(s,c){return s+byCh[c];},0);
  var maxCh=order.length?byCh[order[0]]:1; if(maxCh<=0)maxCh=1;
  var h='<div class="view-pad">';
  h+='<div class="wk-nav"><button class="wk-btn" onclick="prevWeek()" aria-label="Semaine précédente">‹</button><div class="wk-lbl"><b>Semaine du '+days[0].dm+'</b><span>'+nfH(total)+' h de main d\\'œuvre</span></div><button class="wk-btn" onclick="nextWeek()" aria-label="Semaine suivante">›</button><button class="btn btn-ghost btn-sm" onclick="thisWeek2()">Cette semaine</button></div>';
  h+='<div class="chart-card" style="margin-bottom:16px"><div class="chart-hd"><b>Heures par chantier</b><span class="rd" id="rd-ch">—</span></div><div class="chart-host" id="ch-ch"></div></div>';
  if(!order.length){ h+='<div class="empty"><div class="empty-ico">🏗️</div><div class="empty-title">Aucune heure cette semaine</div><div class="empty-sub">Les heures pointées se répartissent ici par chantier.</div><button class="btn btn-primary" onclick="go(\\'saisie\\')">Aller à la saisie</button></div></div>'; $("view").innerHTML=h; return; }
  h+='<div class="section-h"><b>Répartition</b><span class="badge badge-gray">'+order.length+' chantier'+(order.length>1?"s":"")+'</span></div>';
  h+=order.map(function(c){
    var nm=(c==="__none")?"Sans chantier":(chantierName(c)||"Chantier"), col=(c==="__none")?"#A695AC":avc(nm), hrs=byCh[c], nbp=Object.keys(people[c]).length, pct=Math.round(hrs/maxCh*100);
    return '<div class="chrow"><span class="chdot" style="background:'+col+'"></span><div class="nm"><b>'+esc(nm)+'</b><small>'+nbp+' équipier'+(nbp>1?"s":"")+' · '+(total>0?Math.round(hrs/total*100):0)+'% des heures</small><div class="chbar"><i style="width:'+pct+'%;background:'+col+'"></i></div></div><div class="hh">'+nfH(hrs)+'<span> h</span></div></div>';
  }).join("");
  h+='</div>'; $("view").innerHTML=h;
  try{
    var series=order.slice(0,8).map(function(c){var nm=(c==="__none")?"Sans ch.":(chantierName(c)||"Chantier");return {value:byCh[c],label:nm.length>10?nm.slice(0,9)+"…":nm,tip:nm};});
    if($("rd-ch"))$("rd-ch").textContent=nfH(total)+" h au total";
    drawBars($("ch-ch"),series,{id:"chh",color:"#DB2777",color2:"#F9A8D4",fmt:function(v){return nfH(v)+" h";},rd:"rd-ch",rdDef:nfH(total)+" h au total"});
  }catch(e){}
}
function thisWeek2(){ S.day=todayISO(); renderChantiers(); }

/* ── Pointage (modale) ── */
function optEmp(sel){ var o='<option value="">— Choisir un équipier —</option>'; S.employees.forEach(function(e){o+='<option value="'+e.id+'"'+(e.id===sel?" selected":"")+'>'+esc(empName(e.id))+'</option>';}); return o; }
function optChantiers(sel){ var o='<option value="">— Aucun (interne) —</option>'; S.chantiers.forEach(function(c){o+='<option value="'+c.id+'"'+(c.id===sel?" selected":"")+'>'+esc(c.nom)+'</option>';}); o+='<option value="__new">➕ Nouveau chantier…</option>'; return o; }
function openEntry(id){
  var e=id?findPt(id):null;
  S.edit = e? { id:e.id, employee_id:e.employee_id||"", chantier_id:e.chantier_id||"", date_pointage:pday(e)||S.day, heures:(e.heures!=null?numH(e.heures):0), type:e.type||"normal", valide:!!e.valide, notes:e.notes||"" }
            : { id:null, employee_id:"", chantier_id:"", date_pointage:S.day||todayISO(), heures:7, type:"normal", valide:false, notes:"" };
  var d=S.edit;
  var h='<div class="modal-h"><div><div class="modal-title">'+(id?"Modifier le pointage":"Pointer des heures")+'</div><div class="modal-sub">'+(d.employee_id?esc(empName(d.employee_id))+" · ":"")+fmtLong(d.date_pointage)+'</div></div><button class="x" onclick="closeModal()">✕</button></div>';
  h+='<div class="form-row"><div class="fg"><label class="fl">Équipier *</label><select id="p-emp">'+optEmp(d.employee_id)+'</select></div><div class="fg"><label class="fl">Jour</label><input type="date" id="p-date" value="'+esc(d.date_pointage)+'"></div></div>';
  h+='<div class="fg"><label class="fl">Type</label><div class="seg" id="p-seg">'+TYPES.map(function(o){var on=d.type===o[0];return '<button type="button" onclick="pType(\\''+o[0]+'\\')" class="'+(on?"on":"")+'" style="'+(on?"background:var(--rz)":"")+'">'+o[1]+'</button>';}).join("")+'</div></div>';
  h+='<div class="fg"><label class="fl">Heures</label><div class="stepper"><button type="button" class="stp" onclick="stepH(-0.5)" aria-label="Moins">−</button><input id="p-heures" class="stp-in" inputmode="decimal" value="'+nfH(d.heures)+'"><button type="button" class="stp" onclick="stepH(0.5)" aria-label="Plus">+</button></div><div class="stp-quick">'+[3.5,7,7.5,8,10].map(function(v){return '<button type="button" onclick="setH('+v+')">'+nfH(v)+' h</button>';}).join("")+'</div></div>';
  h+='<div class="fg"><label class="fl">Chantier</label><select id="p-ch" onchange="aNewCh(this.value)">'+optChantiers(d.chantier_id)+'</select></div>';
  h+='<div class="fg"><label class="fl">Note (facultatif)</label><input id="p-note" value="'+esc(d.notes||"")+'" placeholder="Tâche, précision…"></div>';
  h+='<div class="modal-actions"><button class="btn btn-primary" id="p-save" onclick="entrySave()">'+(id?"Enregistrer":"Pointer")+'</button>'+(id?'<button class="btn btn-danger" style="flex:0 0 auto" onclick="entryDel(\\''+id+'\\')">Supprimer</button>':'')+'</div>';
  openModal(h);
}
function pType(k){ S.edit.type=k; var btns=document.querySelectorAll("#p-seg button"); for(var i=0;i<TYPES.length;i++){ if(btns[i]){ var on=TYPES[i][0]===k; btns[i].className=on?"on":""; btns[i].style.background=on?"var(--rz)":""; } } }
function readH(){ var el=$("p-heures"); return el?numH(el.value):numH(S.edit.heures); }
function setHval(v){ v=Math.round(v*4)/4; if(v<0)v=0; if(v>24)v=24; S.edit.heures=v; var el=$("p-heures"); if(el)el.value=nfH(v); }
function stepH(delta){ setHval(readH()+delta); }
function setH(v){ setHval(v); }
function aNewCh(v){ if(v!=="__new"){S.edit.chantier_id=v;return;} var nm=prompt("Nom du chantier :",""); if(nm&&nm.trim()){ biltia.create("chantiers",{nom:nm.trim(),statut:"en_cours"}).then(function(c){ S.chantiers.unshift(c); S.edit.chantier_id=c.id; if($("p-ch"))$("p-ch").innerHTML=optChantiers(c.id); biltia.notify("Chantier créé"); }).catch(function(){ if($("p-ch"))$("p-ch").value=S.edit.chantier_id||""; }); } else { if($("p-ch"))$("p-ch").value=S.edit.chantier_id||""; } }
async function entrySave(){
  var d=S.edit;
  if($("p-emp"))d.employee_id=$("p-emp").value; if($("p-date"))d.date_pointage=$("p-date").value; if($("p-ch")&&$("p-ch").value!=="__new")d.chantier_id=$("p-ch").value; if($("p-note"))d.notes=$("p-note").value; d.heures=readH();
  if(!d.employee_id){ var s=$("p-emp"); if(s){s.classList.add("invalid");s.focus();} return; }
  if(!d.date_pointage){ biltia.notify("Choisissez un jour"); return; }
  var payload={ employee_id:d.employee_id, chantier_id:d.chantier_id||null, date_pointage:d.date_pointage, heures:d.heures, type:d.type||"normal", valide:!!d.valide, notes:d.notes||null };
  var b=$("p-save"); if(b){b.disabled=true;b.textContent="Enregistrement…";}
  try{
    if(d.id){ var up=await biltia.update("pointages",d.id,payload); for(var i=0;i<S.pointages.length;i++)if(S.pointages[i].id===d.id)S.pointages[i]=up; biltia.notify("Pointage enregistré"); }
    else { var row=await biltia.create("pointages",payload); S.pointages.push(row); biltia.notify("Heures pointées"); }
    S.day=payload.date_pointage; closeModal(); render();
  }catch(err){ if(b){b.disabled=false;b.textContent=d.id?"Enregistrer":"Pointer";} biltia.notify("Enregistrement impossible"); }
}
async function entryDel(id){ if(!confirm("Supprimer ce pointage ?"))return; try{ await biltia.remove("pointages",id); S.pointages=S.pointages.filter(function(x){return x.id!==id;}); biltia.notify("Pointage supprimé"); closeModal(); render(); }catch(e){} }

/* ── Modale ── */
function openModal(html){ $("modal").innerHTML=html; $("ovl").hidden=false; $("modal").scrollTop=0; }
function closeModal(){ $("ovl").hidden=true; $("modal").innerHTML=""; S.edit=null; }
document.addEventListener("click",function(e){ if(e.target&&e.target.id==="ovl")closeModal(); });

/* ── Init ── */
function initBrand(){ if(!S.entreprise||S.entreprise.indexOf("__")===0)S.entreprise="Mon entreprise"; var eb=S.entreprise.toUpperCase().slice(0,22); ["side-eyebrow","hd-eyebrow","tb-eyebrow"].forEach(function(i){var el=$(i);if(el)el.textContent=eb;}); ["side-logo","hd-logo"].forEach(function(i){var el=$(i);if(el)el.textContent=initials(S.entreprise)||"B";}); }
var _rz;
function start(){ S.day=todayISO(); initBrand(); renderNav(); boot(); if(window.addEventListener)window.addEventListener("resize",function(){ if(_rz)clearTimeout(_rz); _rz=setTimeout(function(){ if(S.view==="recap"||S.view==="chantiers")render(); },200); }); }
if(document.readyState!=="loading"){ start(); } else { document.addEventListener("DOMContentLoaded",start); }
${CHART_ENGINE_JS}
</script>
</body>
</html>`;
