// ─────────────────────────────────────────────────────────────────────────────
// APP PHARE — SAV & MAINTENANCE (file d'interventions, layout distinct)
//
// 9e app phare. Cœur de métier des plombiers / électriciens / chauffagistes / CVC :
// dépannages + contrats d'entretien récurrents + parc installé chez le client.
// Layout à part : une FILE DE TICKETS — cockpit sombre (interventions à traiter qui
// défile), courbe interactive des interventions clôturées par semaine, tickets
// groupés par urgence (en retard / aujourd'hui / à venir). Identité CYAN #0891B2
// (≠ indigo/violet/teal/orange/bleu/rose/ardoise/émeraude). 3 vues :
// Interventions · Contrats · Parc installé.
//
// Entités workspace :
//  - interventions { type*, description, statut (planifie|en_cours|termine|annule),
//    client_id, chantier_id, employee_id, equipment_id, date_prevue, date_reelle,
//    duree_heures, rapport }
//  - contrats { client_id, parc_id, reference, type (entretien|maintenance|garantie),
//    montant, periodicite (mensuel|trimestriel|semestriel|annuel), date_debut,
//    date_fin, prochaine_echeance, statut (actif|suspendu|expire|resilie), notes }
//  - parc_installe { client_id, chantier_id, type, marque, modele, numero_serie,
//    localisation, date_pose, date_garantie, dernier_entretien, prochain_entretien, notes }
// SDK injecté à l'instanciation. Contrainte : PAS de template literals NI de
// backticks dans le JS de l'app.
// ─────────────────────────────────────────────────────────────────────────────

import { CHART_CSS, CHART_ENGINE_JS } from "@/lib/app-charts";

export const APP_SAV_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>SAV & maintenance</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
img,svg{max-width:100%}
:root{--bg:#EFFBFC;--ink:#08313A;--mut:#5C7078;--faint:#93AEB5;--line:#D5EBEF;--soft:#E4F5F8;
--cy:#0891B2;--grad:#0891B2;--glow:8,145,178;--tint:#ECFEFF;--tintline:#9BE0EC;
--ok:#059669;--warn:#D97706;--bad:#E11D48;
--shadow:0 1px 2px rgba(8,49,58,.04),0 6px 18px rgba(8,49,58,.06);--shadow-lg:0 14px 44px rgba(8,49,58,.16)}
body{background:var(--bg);font-family:'Inter',system-ui,sans-serif;color:var(--ink);font-size:14px;line-height:1.55;-webkit-font-smoothing:antialiased;overflow-x:hidden;overflow-wrap:break-word}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:none;cursor:pointer;font-family:inherit;font-weight:600;transition:all .18s;border-radius:12px;white-space:nowrap;font-size:13px;padding:10px 18px}
.btn:active{transform:scale(.97)}
.btn svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}
.btn-primary{background:var(--grad);color:#fff;box-shadow:0 4px 12px rgba(var(--glow),.24)}
.btn-primary:hover{box-shadow:0 6px 18px rgba(var(--glow),.34)}
.btn-ghost{background:#fff;color:var(--ink);border:1px solid var(--line)}
.btn-ghost:hover{border-color:var(--tintline);box-shadow:0 4px 14px rgba(var(--glow),.12)}
.btn-ok{background:#ECFDF5;color:#047857;border:1px solid #A7F3D0}
.btn-ok:hover{background:#D1FAE5}
.btn-warn{background:#FFFBEB;color:#B45309;border:1px solid #FDE68A}
.btn-warn:hover{background:#FEF3C7}
.btn-danger{background:#FFF1F2;color:#E11D48;border:1px solid #FECDD3;padding:8px 14px;font-size:12px;border-radius:10px}
.btn-sm{padding:8px 14px;font-size:12px;border-radius:10px}
.badge{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:9999px;font-size:11px;font-weight:600;white-space:nowrap}
.badge-green{background:#ECFDF5;color:#059669;border:1px solid #A7F3D0}
.badge-amber{background:#FFFBEB;color:#B45309;border:1px solid #FDE68A}
.badge-red{background:#FFF1F2;color:#E11D48;border:1px solid #FECDD3}
.badge-gray{background:#EAF4F7;color:#5C7078;border:1px solid #D5EBEF}
input,select,textarea{font-family:inherit;font-size:16px;color:var(--ink);background:#fff;border:1px solid #C8E2E8;border-radius:12px;padding:10px 14px;width:100%;outline:none;transition:border .15s,box-shadow .15s}
input:focus,select:focus,textarea:focus{border-color:var(--cy);box-shadow:0 0 0 3px rgba(var(--glow),.14)}
input::placeholder,textarea::placeholder{color:#93AEB5}
input.invalid,select.invalid{border-color:#E11D48;box-shadow:0 0 0 3px rgba(225,29,72,.12)}
textarea{resize:vertical;min-height:70px}
.shell{display:flex;min-height:100vh}
.sidebar{display:none}
.app-main{flex:1;min-width:0;padding:0 0 90px}
.app-header{position:fixed;top:0;left:0;right:0;z-index:100;background:rgba(239,251,252,.85);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-bottom:1px solid var(--line);height:60px;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 14px}
.brand{display:flex;align-items:center;gap:10px;min-width:0}
.brand-logo{width:30px;height:30px;border-radius:9px;background:var(--grad);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:14px;flex-shrink:0}
.app-eyebrow{font-size:10px;font-weight:700;color:var(--cy);text-transform:uppercase;letter-spacing:.12em;display:block;line-height:1.2}
.app-title{font-size:15px;font-weight:800;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px;line-height:1.2}
.mtop{height:60px}
.tab-bar{position:fixed;bottom:0;left:0;right:0;background:rgba(239,251,252,.94);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-top:1px solid var(--line);display:flex;z-index:100}
.tab-item{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:8px 4px 10px;cursor:pointer;border:none;background:none;font-size:10px;font-weight:600;color:#93AEB5;font-family:inherit;min-height:56px}
.tab-item.active{color:var(--cy)}
.tab-ic{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.fab{position:fixed;right:16px;bottom:78px;z-index:120;width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;color:#fff;font-size:28px;line-height:1;background:var(--grad);box-shadow:0 8px 22px rgba(var(--glow),.30);display:flex;align-items:center;justify-content:center}
.fab:active{transform:scale(.94)}
.view-pad{padding:16px}
.topbar{display:none}
.section-h{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:20px 2px 12px}
.section-h b{font-size:15px;font-weight:700}
.empty{text-align:center;padding:48px 20px}
.empty-ico{width:54px;height:54px;border-radius:16px;background:var(--tint);color:var(--cy);display:flex;align-items:center;justify-content:center;margin:0 auto 14px;font-size:24px}
.empty-title{font-weight:700;margin-bottom:4px}
.empty-sub{font-size:13px;color:var(--mut);margin-bottom:16px}
.spin{width:26px;height:26px;border:3px solid var(--line);border-top-color:var(--cy);border-radius:50%;animation:sp .7s linear infinite;margin:60px auto}
@keyframes sp{to{transform:rotate(360deg)}}
.mini-av{width:34px;height:34px;border-radius:10px;font-size:12px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;flex-shrink:0}
/* ── Cockpit ── */
.cockpit{position:relative;margin:0 0 16px;padding:22px;border-radius:22px;background:#052730;color:#fff;overflow:hidden;box-shadow:var(--shadow-lg)}
.cockpit::before{content:"";position:absolute;inset:0;background:radial-gradient(120% 90% at 100% 0,rgba(8,145,178,.44),transparent 60%);pointer-events:none}
.c-label{position:relative;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:rgba(255,255,255,.6)}
.c-value{position:relative;font-size:34px;font-weight:800;letter-spacing:-.02em;line-height:1.15;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.c-sub{position:relative;font-size:12.5px;color:rgba(255,255,255,.72)}
.ck-stats{position:relative;display:flex;gap:26px;margin-top:14px}
.ck-stat b{display:block;font-size:17px;font-weight:800;font-variant-numeric:tabular-nums}
.ck-stat span{font-size:10.5px;color:rgba(255,255,255,.6);font-weight:600;text-transform:uppercase;letter-spacing:.05em}
/* ── Ruban (parc) ── */
.ribbon{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:18px}
@media(max-width:560px){.ribbon{grid-template-columns:1fr}}
.rib{background:#fff;border:1px solid var(--line);border-radius:16px;padding:14px 16px;box-shadow:var(--shadow);border-left:4px solid var(--line);display:flex;align-items:center;gap:12px}
.rib .rib-n{font-size:26px;font-weight:800;letter-spacing:-.02em;line-height:1;font-variant-numeric:tabular-nums}
.rib .rib-l{font-size:12px;color:var(--mut);font-weight:600}
.rib.ok{border-left-color:var(--ok)}.rib.ok .rib-n{color:var(--ok)}
.rib.warn{border-left-color:var(--warn)}.rib.warn .rib-n{color:var(--warn)}
.rib.cy{border-left-color:var(--cy)}.rib.cy .rib-n{color:var(--cy)}
.rib-ic{width:38px;height:38px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
/* ── Ticket / ligne ── */
.tick{display:flex;align-items:center;gap:12px;background:#fff;border:1px solid var(--line);border-radius:14px;padding:12px 14px;box-shadow:var(--shadow);margin-bottom:10px;cursor:pointer;border-left:4px solid var(--line);transition:all .15s}
.tick:hover{border-color:var(--tintline);box-shadow:0 6px 18px rgba(8,49,58,.08)}
.tk-main{min-width:0;flex:1}
.tk-main .t{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tk-main .s{font-size:12px;color:var(--mut);display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:2px}
.tk-days{font-size:12px;font-weight:700;white-space:nowrap;text-align:right;flex-shrink:0}
/* ── Cartes ── */
.grid-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,290px),1fr));gap:12px}
.mcard{background:#fff;border:1px solid var(--line);border-radius:16px;padding:16px;box-shadow:var(--shadow);cursor:pointer;text-align:left;width:100%}
.mcard:hover{box-shadow:0 6px 20px rgba(8,49,58,.08);border-color:var(--tintline)}
.chips{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
.chip{border:1px solid var(--line);background:#fff;color:var(--mut);font-weight:600;font-size:12.5px;padding:7px 14px;border-radius:9999px;cursor:pointer;font-family:inherit}
.chip.on{background:var(--cy);color:#fff;border-color:transparent}
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
.kv .v a{color:var(--cy);text-decoration:none}
/* Modale */
.overlay{position:fixed;inset:0;background:rgba(8,49,58,.44);backdrop-filter:blur(6px);z-index:200;display:flex;align-items:flex-end;justify-content:center}
.overlay[hidden]{display:none}
@media(min-width:600px){.overlay{align-items:center;padding:20px}}
.modal{background:#fff;border-radius:24px 24px 0 0;width:100%;max-width:540px;max-height:92vh;overflow-y:auto;padding:22px 20px calc(22px + env(safe-area-inset-bottom));box-shadow:var(--shadow-lg)}
@media(min-width:600px){.modal{border-radius:24px}}
.modal-h{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px}
.modal-title{font-size:18px;font-weight:800;letter-spacing:-.01em}
.modal-sub{font-size:12.5px;color:var(--mut);margin-top:2px}
.x{border:none;background:var(--soft);width:34px;height:34px;border-radius:10px;color:var(--mut);font-size:18px;cursor:pointer;flex-shrink:0}
.fg{margin-bottom:14px}
.fl{display:block;font-size:11px;font-weight:700;color:#5C7078;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media(max-width:480px){.form-row{grid-template-columns:1fr}}
.seg{display:flex;flex-wrap:wrap;gap:6px}
.seg button{border:1px solid var(--line);background:#fff;color:var(--mut);font-weight:600;font-size:12px;padding:8px 12px;border-radius:10px;cursor:pointer;font-family:inherit}
.seg button.on{color:#fff;border-color:transparent}
.sugg{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.sugg button{border:1px dashed var(--tintline);background:var(--tint);color:var(--cy);font-weight:600;font-size:12px;padding:6px 11px;border-radius:9px;cursor:pointer;font-family:inherit}
.modal-actions{display:flex;gap:10px;margin-top:20px;flex-wrap:wrap}
.modal-actions .btn{flex:1}
@media(min-width:860px){
  .app-header,.mtop,.tab-bar,.fab{display:none}
  .sidebar{display:flex;flex-direction:column;width:236px;flex-shrink:0;position:sticky;top:0;height:100vh;border-right:1px solid var(--line);background:#fff;padding:20px 14px}
  .side-brand{display:flex;align-items:center;gap:11px;padding:6px 8px 20px}
  .side-nav{display:flex;flex-direction:column;gap:3px}
  .side-item{display:flex;align-items:center;gap:11px;padding:10px 12px;border-radius:11px;border:none;background:none;cursor:pointer;font-family:inherit;font-size:13.5px;font-weight:600;color:var(--mut);text-align:left;width:100%}
  .side-item:hover{background:var(--soft);color:var(--ink)}
  .side-item.active{background:var(--tint);color:var(--cy)}
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
    <div class="side-brand"><span class="brand-logo" id="side-logo">B</span><div style="min-width:0"><span class="app-eyebrow" id="side-eyebrow">BILTIA</span><span class="app-title" id="side-title">SAV</span></div></div>
    <nav class="side-nav" id="side-nav"></nav>
  </aside>
  <div class="app-main">
    <header class="app-header">
      <div class="brand"><span class="brand-logo" id="hd-logo">B</span><div style="min-width:0"><span class="app-eyebrow" id="hd-eyebrow">BILTIA</span><span class="app-title">SAV</span></div></div>
      <button class="btn btn-primary btn-sm" id="hd-add" onclick="primaryAdd()">+ Intervention</button>
    </header>
    <div class="mtop"></div>
    <div class="topbar">
      <div><span class="app-eyebrow" id="tb-eyebrow">BILTIA</span><div id="tb-title" style="font-size:22px;font-weight:800;letter-spacing:-.02em">Interventions</div></div>
      <button class="btn btn-primary" id="tb-add" onclick="primaryAdd()">+ Nouvelle intervention</button>
    </div>
    <main id="view"><div class="spin"></div></main>
  </div>
</div>
<nav class="tab-bar" id="tab-bar"></nav>
<button class="fab" onclick="primaryAdd()" aria-label="Ajouter">+</button>
<div class="overlay" id="ovl" hidden><div class="modal" id="modal"></div></div>

<script>
var S={ view:"interventions", inter:[], contrats:[], parc:[], clients:[], employees:[], entreprise:"__ENTREPRISE__", filter:"a_traiter", q:"", edit:null };
var $=function(id){return document.getElementById(id);};
function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
function pad2(n){return String(n).padStart(2,"0");}
function todayISO(){var d=new Date();return d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate());}
function initials(s){var w=String(s||"?").trim().split(/\\s+/);return ((w[0]||"?")[0]+(w[1]?w[1][0]:"")).toUpperCase();}
var AV=["#0891B2","#0E7490","#0284C7","#7C3AED","#0D9488","#DB2777","#B45309","#4F46E5"];
function avc(seed){var s=String(seed||""),h=0;for(var i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;return AV[h%AV.length];}
function numV(v){var n=parseFloat(String(v==null?"":v).replace(/\\s/g,"").replace(",","."));return isFinite(n)?n:0;}
function eur(n){return Math.round(numV(n)).toLocaleString("fr-FR")+" €";}
function eurK(n){n=numV(n);return n>=1000?Math.round(n/100)/10+" k€":Math.round(n)+" €";}
var ML=["janv.","févr.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc."];
function frDate(iso){ if(!iso)return "—"; var d=new Date(String(iso).slice(0,10)); return pad2(d.getDate())+"/"+pad2(d.getMonth()+1)+"/"+d.getFullYear(); }
function frShort(iso){ if(!iso)return ""; var d=new Date(String(iso).slice(0,10)); return pad2(d.getDate())+"/"+pad2(d.getMonth()+1); }
function daysTo(iso){ if(!iso)return null; var d=new Date(String(iso).slice(0,10)),t=new Date(todayISO()); return Math.round((d-t)/86400000); }
function findIn(a,id){for(var i=0;i<a.length;i++)if(a[i].id===id)return a[i];return null;}
function findClient(id){return findIn(S.clients,id);}
function clientName(id){var c=findClient(id);return c?c.nom:"";}
function clientEmail(id){var c=findClient(id);return c&&c.email?c.email:"";}
function empName(id){var e=findIn(S.employees,id);return e?[e.prenom,e.nom].filter(Boolean).join(" "):"";}

var IST={ planifie:{l:"Planifiée",c:"#0891B2"}, en_cours:{l:"En cours",c:"#D97706"}, termine:{l:"Terminée",c:"#059669"}, annule:{l:"Annulée",c:"#94A3B8"} };
var ISEG=[["planifie","Planifiée"],["en_cours","En cours"],["termine","Terminée"],["annule","Annulée"]];
function isOpen(s){return s==="planifie"||s==="en_cours";}
function iMeta(s){return IST[s]||IST.planifie;}
function iChip(s){var m=iMeta(s);return '<span class="badge" style="background:'+m.c+'1A;color:'+m.c+';border:1px solid '+m.c+'55">'+m.l+'</span>';}
function iRefDate(o){return (o.date_reelle||o.date_prevue)?String(o.date_reelle||o.date_prevue).slice(0,10):"";}
var ITYPES=["Dépannage","Entretien annuel","Mise en service","Visite de contrôle","SAV sous garantie","Devis / diagnostic"];

var CST={ actif:{l:"Actif",c:"#059669"}, suspendu:{l:"Suspendu",c:"#D97706"}, expire:{l:"Expiré",c:"#E11D48"}, resilie:{l:"Résilié",c:"#94A3B8"} };
var CSEG=[["actif","Actif"],["suspendu","Suspendu"],["expire","Expiré"],["resilie","Résilié"]];
var CTYPE={ entretien:"Entretien", maintenance:"Maintenance", garantie:"Garantie" };
var PERI={ mensuel:{l:"Mensuel",m:12}, trimestriel:{l:"Trimestriel",m:4}, semestriel:{l:"Semestriel",m:2}, annuel:{l:"Annuel",m:1} };
function periMult(p){return (PERI[p]||PERI.annuel).m;}

var PT={ chaudiere:"Chaudière", climatisation:"Climatisation", pompe_chaleur:"Pompe à chaleur", chauffe_eau:"Chauffe-eau", tableau_electrique:"Tableau électrique", vmc:"VMC", autre:"Autre" };
var PTIC={ chaudiere:"🔥", climatisation:"❄️", pompe_chaleur:"♨️", chauffe_eau:"🚿", tableau_electrique:"⚡", vmc:"🌀", autre:"🔧" };
var PSEG=[["chaudiere","Chaudière"],["climatisation","Clim"],["pompe_chaleur","PAC"],["chauffe_eau","Chauffe-eau"],["tableau_electrique","Tableau élec."],["vmc","VMC"],["autre","Autre"]];

var NAV=[
  {id:"interventions",label:"Interventions",icon:'<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>'},
  {id:"contrats",label:"Contrats",icon:'<path d="M3 2v6h6"/><path d="M21 12A9 9 0 0 0 6 5.3L3 8"/><path d="M21 22v-6h-6"/><path d="M3 12a9 9 0 0 0 15 6.7l3-2.7"/>'},
  {id:"parc",label:"Parc installé",icon:'<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.3 7L12 12l8.7-5"/><path d="M12 22V12"/>'}
];

async function boot(){
  try{
    var r=await Promise.all([
      biltia.list("interventions",{limit:2000}).catch(function(){return[];}),
      biltia.list("contrats",{limit:2000}).catch(function(){return[];}),
      biltia.list("parc_installe",{limit:2000}).catch(function(){return[];}),
      biltia.list("clients",{order:"nom",ascending:true,limit:1000}).catch(function(){return[];}),
      biltia.list("employees",{order:"nom",ascending:true,limit:1000}).catch(function(){return[];})
    ]);
    S.inter=r[0]||[]; S.contrats=r[1]||[]; S.parc=r[2]||[]; S.clients=r[3]||[]; S.employees=r[4]||[];
    renderNav(); render();
  }catch(e){ $("view").innerHTML='<div class="view-pad"><div class="empty"><div class="empty-ico">⚠️</div><div class="empty-title">Connexion au workspace impossible</div><div class="empty-sub">Vérifiez votre connexion puis rouvrez l\\'application.</div></div></div>'; }
}
function renderNav(){
  $("side-nav").innerHTML=NAV.map(function(n){return '<button class="side-item'+(S.view===n.id?" active":"")+'" onclick="go(\\''+n.id+'\\')"><svg viewBox="0 0 24 24">'+n.icon+'</svg><span>'+n.label+'</span></button>';}).join("");
  $("tab-bar").innerHTML=NAV.map(function(n){return '<button class="tab-item'+(S.view===n.id?" active":"")+'" onclick="go(\\''+n.id+'\\')"><svg class="tab-ic" viewBox="0 0 24 24">'+n.icon+'</svg><span>'+n.label+'</span></button>';}).join("");
}
function go(v){ S.view=v; renderNav(); render(); try{window.scrollTo(0,0);}catch(e){} }
function primaryAdd(){ if(S.view==="contrats") openContrat(null); else if(S.view==="parc") openParc(null); else openInter(null); }
function render(){
  var titles={interventions:"Interventions",contrats:"Contrats",parc:"Parc installé"};
  $("tb-title").textContent=titles[S.view]||"";
  if($("hd-add"))$("hd-add").textContent=(S.view==="contrats"?"+ Contrat":S.view==="parc"?"+ Équipement":"+ Intervention");
  if($("tb-add"))$("tb-add").textContent=(S.view==="contrats"?"+ Nouveau contrat":S.view==="parc"?"+ Nouvel équipement":"+ Nouvelle intervention");
  if(S.view==="interventions") renderInterventions();
  else if(S.view==="contrats") renderContrats();
  else renderParc();
}

/* ── Vue : Interventions (file de tickets) ── */
function weekStart(d){ var x=new Date(d); var dow=(x.getDay()+6)%7; x.setDate(x.getDate()-dow); x.setHours(0,0,0,0); return x; }
function renderInterventions(){
  var open=S.inter.filter(function(o){return isOpen(o.statut);});
  var late=open.filter(function(o){var dl=daysTo(o.date_prevue);return o.date_prevue&&dl<0;});
  var today=open.filter(function(o){return o.date_prevue&&daysTo(o.date_prevue)===0;});
  var enCours=S.inter.filter(function(o){return o.statut==="en_cours";});
  var contActifs=S.contrats.filter(function(c){return c.statut==="actif";}).length;
  var h='<div class="view-pad">';
  h+='<div class="cockpit"><div class="c-label">Interventions à traiter</div><div class="c-value" id="ck-open">'+open.length+'</div><div class="c-sub">'+late.length+' en retard · '+today.length+' aujourd\\'hui · '+enCours.length+' en cours</div><div class="ck-stats"><div class="ck-stat"><b>'+contActifs+'</b><span>contrats actifs</span></div><div class="ck-stat"><b>'+S.parc.length+'</b><span>équipements suivis</span></div></div></div>';
  h+='<div class="chart-card" style="margin-bottom:16px"><div class="chart-hd"><b>Interventions clôturées</b><span class="rd" id="rd-wk">8 dernières semaines</span></div><div class="chart-host" id="ch-wk"></div></div>';
  h+='<div class="chips">'+[["a_traiter","À traiter"],["termine","Terminées"],["tous","Toutes"]].map(function(o){return '<button class="chip'+(S.filter===o[0]?" on":"")+'" onclick="setIFilter(\\''+o[0]+'\\')">'+o[1]+'</button>';}).join("")+'</div>';
  h+='<div id="ic-list"></div>';
  h+='</div>'; $("view").innerHTML=h;
  renderInterList();
  try{
    var ws=weekStart(new Date()); var weeks=[];
    for(var i=7;i>=0;i--){ var s=new Date(ws); s.setDate(ws.getDate()-i*7); var e=new Date(s); e.setDate(s.getDate()+7); weeks.push({s:s,e:e,label:frShort(s.getFullYear()+"-"+pad2(s.getMonth()+1)+"-"+pad2(s.getDate()))}); }
    var done=S.inter.filter(function(o){return o.statut==="termine"&&iRefDate(o);});
    var series=weeks.map(function(w){ var n=done.filter(function(o){ var d=new Date(iRefDate(o)); return d>=w.s&&d<w.e; }).length; return {value:n,label:w.label,tip:"semaine du "+w.label}; });
    var tot=series.reduce(function(a,b){return a+b.value;},0);
    if($("rd-wk"))$("rd-wk").textContent=tot+" sur 8 semaines";
    chartCountUp($("ck-open"),open.length,function(v){return Math.round(v);});
    drawArea($("ch-wk"),series,{id:"wk",color:"#0891B2",fmt:function(v){return Math.round(v)+(Math.round(v)>1?" interventions":" intervention");},rd:"rd-wk",rdDef:tot+" sur 8 semaines"});
  }catch(e){}
}
function setIFilter(k){ S.filter=k; var cs=document.querySelectorAll(".chips .chip"); renderInterventions(); }
function interRow(o){ var m=iMeta(o.statut), cn=clientName(o.client_id); var dl=isOpen(o.statut)?daysTo(o.date_prevue):null;
  var right=isOpen(o.statut)&&o.date_prevue?(dl<0?'<span style="color:#E11D48">−'+(-dl)+' j</span>':(dl===0?'<span style="color:#B45309">auj.</span>':dl+' j')):(o.statut==="termine"?'<span style="color:#059669">'+frShort(iRefDate(o))+'</span>':"");
  var sub=iChip(o.statut)+(cn?'<span>'+esc(cn)+'</span>':"")+(o.date_prevue&&isOpen(o.statut)?'<span>· '+frShort(o.date_prevue)+'</span>':"");
  return '<div class="tick" style="border-left-color:'+m.c+'" onclick="openInterD(\\''+o.id+'\\')"><span class="mini-av" style="background:'+avc(cn||o.type)+'">'+esc(initials(cn||o.type||"?"))+'</span><div class="tk-main"><div class="t">'+esc(o.type||"Intervention")+'</div><div class="s">'+sub+'</div></div><div class="tk-days">'+right+'</div></div>';
}
function renderInterList(){
  var host=$("ic-list"); if(!host)return;
  if(S.filter==="termine"){
    var done=S.inter.filter(function(o){return o.statut==="termine";}).sort(function(a,b){return iRefDate(b)<iRefDate(a)?-1:1;});
    if(!done.length){ host.innerHTML=emptyInter("Aucune intervention terminée","Les interventions clôturées apparaîtront ici."); return; }
    host.innerHTML='<div class="section-h"><b>'+done.length+' terminée'+(done.length>1?"s":"")+'</b></div>'+done.map(interRow).join(""); return;
  }
  if(S.filter==="tous"){
    var all=S.inter.slice().sort(function(a,b){ var da=a.date_prevue?String(a.date_prevue).slice(0,10):iRefDate(a); var db=b.date_prevue?String(b.date_prevue).slice(0,10):iRefDate(b); return db<da?-1:1; });
    if(!all.length){ host.innerHTML=emptyInter("Aucune intervention","Ajoutez votre premier dépannage ou entretien."); return; }
    host.innerHTML='<div class="section-h"><b>'+all.length+' intervention'+(all.length>1?"s":"")+'</b></div>'+all.map(interRow).join(""); return;
  }
  // à traiter (open) groupé par urgence
  var open=S.inter.filter(function(o){return isOpen(o.statut);});
  var withDate=open.filter(function(o){return o.date_prevue;}).map(function(o){return {o:o,dl:daysTo(o.date_prevue)};}).sort(function(a,b){return a.dl-b.dl;});
  var noDate=open.filter(function(o){return !o.date_prevue;});
  var groups=[
    {t:"En retard",col:"#E11D48",items:withDate.filter(function(x){return x.dl<0;})},
    {t:"Aujourd'hui",col:"#B45309",items:withDate.filter(function(x){return x.dl===0;})},
    {t:"Cette semaine",col:"#0891B2",items:withDate.filter(function(x){return x.dl>0&&x.dl<=7;})},
    {t:"Plus tard",col:"#059669",items:withDate.filter(function(x){return x.dl>7;})}
  ];
  var h="",any=false;
  groups.forEach(function(g){ if(!g.items.length)return; any=true;
    h+='<div class="grp-h"><span class="dot" style="background:'+g.col+'"></span>'+g.t+' <span style="color:var(--faint)">('+g.items.length+')</span></div>';
    h+=g.items.map(function(x){return interRow(x.o);}).join("");
  });
  if(noDate.length){ any=true; h+='<div class="grp-h"><span class="dot" style="background:#94A3B8"></span>À planifier <span style="color:var(--faint)">('+noDate.length+')</span></div>'+noDate.map(interRow).join(""); }
  if(!any){ h=emptyInter("Rien à traiter","Toutes vos interventions sont à jour. Planifiez la prochaine visite."); }
  host.innerHTML=h;
}
function emptyInter(t,s){ return '<div class="empty"><div class="empty-ico">🔧</div><div class="empty-title">'+t+'</div><div class="empty-sub">'+s+'</div><button class="btn btn-primary" onclick="openInter(null)">+ Nouvelle intervention</button></div>'; }

/* ── Vue : Contrats (récurrent) ── */
function renderContrats(){
  var actifs=S.contrats.filter(function(c){return c.statut==="actif";});
  var annu=actifs.reduce(function(s,c){return s+numV(c.montant)*periMult(c.periodicite);},0);
  var due=actifs.filter(function(c){return c.prochaine_echeance&&daysTo(c.prochaine_echeance)<=30;}).length;
  var exp=S.contrats.filter(function(c){return c.statut==="expire";}).length;
  var h='<div class="view-pad">';
  h+='<div class="cockpit"><div class="c-label">Revenu récurrent (annualisé)</div><div class="c-value" id="ck-mrr">'+eur(annu)+'</div><div class="c-sub">'+actifs.length+' contrat'+(actifs.length>1?"s":"")+' actif'+(actifs.length>1?"s":"")+' · '+due+' visite'+(due>1?"s":"")+' sous 30 j</div><div class="ck-stats"><div class="ck-stat"><b>'+eurK(annu/12)+'</b><span>par mois</span></div><div class="ck-stat"><b>'+exp+'</b><span>expirés</span></div></div></div>';
  // échéancier
  var withDate=actifs.filter(function(c){return c.prochaine_echeance;}).map(function(c){return {c:c,dl:daysTo(c.prochaine_echeance)};}).sort(function(a,b){return a.dl-b.dl;});
  var groups=[
    {t:"En retard",col:"#E11D48",items:withDate.filter(function(x){return x.dl<0;})},
    {t:"Sous 30 jours",col:"#D97706",items:withDate.filter(function(x){return x.dl>=0&&x.dl<=30;})},
    {t:"À venir",col:"#059669",items:withDate.filter(function(x){return x.dl>30;})}
  ];
  var any=false, body="";
  groups.forEach(function(g){ if(!g.items.length)return; any=true;
    body+='<div class="grp-h"><span class="dot" style="background:'+g.col+'"></span>Prochaine visite · '+g.t+' <span style="color:var(--faint)">('+g.items.length+')</span></div>';
    body+=g.items.map(function(x){return contratRow(x.c,g.col);}).join("");
  });
  var others=S.contrats.filter(function(c){return c.statut!=="actif"||!c.prochaine_echeance;});
  if(others.length){ any=true; body+='<div class="grp-h"><span class="dot" style="background:#94A3B8"></span>Autres contrats <span style="color:var(--faint)">('+others.length+')</span></div>'+others.map(function(c){return contratRow(c,(CST[c.statut]||CST.actif).c);}).join(""); }
  if(!any){ body='<div class="empty"><div class="empty-ico">📄</div><div class="empty-title">Aucun contrat</div><div class="empty-sub">Ajoutez vos contrats d\\'entretien pour suivre le récurrent et les prochaines visites.</div><button class="btn btn-primary" onclick="openContrat(null)">+ Nouveau contrat</button></div>'; }
  h+=body+'</div>'; $("view").innerHTML=h;
  try{ chartCountUp($("ck-mrr"),annu,function(v){return eur(v);}); }catch(e){}
}
function contratRow(c,col){ var m=CST[c.statut]||CST.actif, cn=clientName(c.client_id); var dl=c.prochaine_echeance?daysTo(c.prochaine_echeance):null;
  var right=c.statut==="actif"&&c.prochaine_echeance?(dl<0?'<span style="color:#E11D48">−'+(-dl)+' j</span>':(dl===0?'<span style="color:#B45309">auj.</span>':dl+' j')):'<span style="color:'+m.c+'">'+m.l+'</span>';
  var sub=(CTYPE[c.type]||"Contrat")+(cn?' · '+esc(cn):"")+' · '+eur(numV(c.montant))+'/'+((PERI[c.periodicite]||PERI.annuel).l.toLowerCase());
  return '<div class="tick" style="border-left-color:'+(col||m.c)+'" onclick="openContratD(\\''+c.id+'\\')"><span class="mini-av" style="background:'+avc(cn||c.reference||c.type)+'">'+esc(initials(cn||"C"))+'</span><div class="tk-main"><div class="t">'+esc(c.reference||(CTYPE[c.type]||"Contrat")+(cn?" — "+cn:""))+'</div><div class="s">'+esc(sub)+'</div></div><div class="tk-days">'+right+'</div></div>';
}

/* ── Vue : Parc installé ── */
function renderParc(){
  var t=todayISO();
  var sousGar=S.parc.filter(function(p){return p.date_garantie&&String(p.date_garantie).slice(0,10)>=t;}).length;
  var due=S.parc.filter(function(p){return p.prochain_entretien&&daysTo(p.prochain_entretien)<=30;});
  var h='<div class="view-pad">';
  h+='<div class="ribbon">'
    +'<div class="rib cy"><span class="rib-ic" style="background:var(--tint);color:var(--cy)">📦</span><div><div class="rib-n">'+S.parc.length+'</div><div class="rib-l">Équipements</div></div></div>'
    +'<div class="rib ok"><span class="rib-ic" style="background:#ECFDF5;color:#059669">🛡️</span><div><div class="rib-n">'+sousGar+'</div><div class="rib-l">Sous garantie</div></div></div>'
    +'<div class="rib warn"><span class="rib-ic" style="background:#FFFBEB;color:#B45309">🔧</span><div><div class="rib-n">'+due.length+'</div><div class="rib-l">Entretien à prévoir</div></div></div>'
    +'</div>';
  if(due.length){
    h+='<div class="section-h"><b>Entretien à prévoir</b><span class="badge badge-amber">'+due.length+'</span></div>';
    h+=due.sort(function(a,b){return daysTo(a.prochain_entretien)-daysTo(b.prochain_entretien);}).map(function(p){ var dl=daysTo(p.prochain_entretien), col=dl<0?"#E11D48":"#D97706", cn=clientName(p.client_id);
      return '<div class="tick" style="border-left-color:'+col+'" onclick="openParcD(\\''+p.id+'\\')"><span class="mini-av" style="background:'+avc(cn||p.type)+'">'+(PTIC[p.type]||"🔧")+'</span><div class="tk-main"><div class="t">'+esc((PT[p.type]||"Équipement")+(p.marque?" "+p.marque:""))+'</div><div class="s">'+(cn?'<span>'+esc(cn)+'</span>':"")+'<span>· entretien '+frDate(p.prochain_entretien)+'</span></div></div><div class="tk-days" style="color:'+col+'">'+(dl<0?"−"+(-dl)+" j":dl+" j")+'</div></div>';
    }).join("");
  }
  h+='<div class="searchbar" style="margin-top:16px"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg><input id="pk-q" placeholder="Rechercher un équipement, un client, une marque…" value="'+esc(S.q)+'" oninput="pkSearch(this.value)"></div>';
  h+='<div id="pk-results"></div></div>'; $("view").innerHTML=h; renderParcResults();
}
function pkSearch(v){ S.q=v; renderParcResults(); }
function renderParcResults(){
  var q=String(S.q||"").toLowerCase().trim();
  var list=S.parc.filter(function(p){ if(!q)return true; return ((PT[p.type]||"")+" "+String(p.marque||"")+" "+String(p.modele||"")+" "+clientName(p.client_id)+" "+String(p.localisation||"")+" "+String(p.numero_serie||"")).toLowerCase().indexOf(q)>=0; });
  var host=$("pk-results"); if(!host)return;
  if(!list.length){ host.innerHTML='<div class="empty"><div class="empty-ico">📦</div><div class="empty-title">Aucun équipement</div><div class="empty-sub">'+(S.parc.length?"Aucun résultat pour cette recherche.":"Recensez les chaudières, PAC, VMC… installées chez vos clients.")+'</div><button class="btn btn-primary" onclick="openParc(null)">+ Nouvel équipement</button></div>'; return; }
  host.innerHTML='<div class="section-h" style="margin-top:2px"><b>'+list.length+' équipement'+(list.length>1?"s":"")+'</b></div><div class="grid-cards">'+list.map(function(p){ var cn=clientName(p.client_id), dl=p.prochain_entretien?daysTo(p.prochain_entretien):null; var gar=p.date_garantie&&String(p.date_garantie).slice(0,10)>=todayISO();
    return '<button class="mcard" onclick="openParcD(\\''+p.id+'\\')"><div style="display:flex;align-items:center;gap:12px;margin-bottom:10px"><span class="mini-av" style="width:40px;height:40px;background:'+avc(cn||p.type)+';font-size:19px">'+(PTIC[p.type]||"🔧")+'</span><div style="min-width:0;flex:1"><div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc((PT[p.type]||"Équipement")+(p.marque?" "+p.marque:""))+'</div><div style="color:var(--mut);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(cn||p.localisation||"—")+'</div></div></div><div style="display:flex;align-items:center;justify-content:space-between;gap:8px">'+(gar?'<span class="badge badge-green">Sous garantie</span>':'<span class="badge badge-gray">'+esc(p.modele||"Installé")+'</span>')+(p.prochain_entretien?'<span class="badge '+(dl<0?"badge-red":dl<=30?"badge-amber":"badge-gray")+'">Entretien '+frShort(p.prochain_entretien)+'</span>':"")+'</div></button>';
  }).join("")+'</div>';
}

/* ── Sélecteurs relationnels ── */
function optClients(sel){ var o='<option value="">— Choisir un client —</option>'; S.clients.forEach(function(c){o+='<option value="'+c.id+'"'+(c.id===sel?" selected":"")+'>'+esc(c.nom)+'</option>';}); o+='<option value="__new">➕ Nouveau client…</option>'; return o; }
function optEmployees(sel){ var o='<option value="">— Intervenant (optionnel) —</option>'; S.employees.forEach(function(e){o+='<option value="'+e.id+'"'+(e.id===sel?" selected":"")+'>'+esc([e.prenom,e.nom].filter(Boolean).join(" "))+'</option>';}); return o; }
function optParc(sel,clientId){ var o='<option value="">— Équipement (optionnel) —</option>'; S.parc.filter(function(p){return !clientId||p.client_id===clientId;}).forEach(function(p){o+='<option value="'+p.id+'"'+(p.id===sel?" selected":"")+'>'+esc((PT[p.type]||"Équipement")+(p.marque?" "+p.marque:"")+(p.modele?" "+p.modele:""))+'</option>';}); return o; }
function newClientInline(selId,after){ var nm=prompt("Nom du client :",""); if(nm&&nm.trim()){ biltia.create("clients",{nom:nm.trim(),type:"entreprise"}).then(function(c){ S.clients.push(c); S.clients.sort(function(a,b){return String(a.nom).localeCompare(String(b.nom));}); if(S.edit)S.edit.client_id=c.id; if($(selId))$(selId).innerHTML=optClients(c.id); if(after)after(c); biltia.notify("Client créé"); }).catch(function(){ if($(selId))$(selId).value=(S.edit&&S.edit.client_id)||""; }); } else { if($(selId))$(selId).value=(S.edit&&S.edit.client_id)||""; } }

/* ── Intervention : détail ── */
function openInterD(id){
  var o=findIn(S.inter,id); if(!o)return; var m=iMeta(o.statut), cn=clientName(o.client_id), inv=empName(o.employee_id);
  var h='<div class="modal-h"><div style="display:flex;align-items:center;gap:12px;min-width:0"><span class="mini-av" style="width:40px;height:40px;background:'+avc(cn||o.type)+'">'+esc(initials(cn||o.type||"?"))+'</span><div style="min-width:0"><div class="modal-title" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(o.type||"Intervention")+'</div><div class="modal-sub">'+(cn?esc(cn):"Intervention")+'</div></div></div><button class="x" onclick="closeModal()">✕</button></div>';
  h+='<div class="stban" style="background:'+m.c+'"><b>'+m.l+'</b><span>'+(o.date_prevue?"Prévue le "+frDate(o.date_prevue):"Non planifiée")+(o.statut==="termine"&&o.date_reelle?" · réalisée le "+frDate(o.date_reelle):"")+'</span></div>';
  h+='<div class="kv">';
  if(cn)h+='<div><div class="k">Client</div><div class="v">'+esc(cn)+'</div></div>';
  if(inv)h+='<div><div class="k">Intervenant</div><div class="v">'+esc(inv)+'</div></div>';
  if(o.date_prevue)h+='<div><div class="k">Date prévue</div><div class="v">'+frDate(o.date_prevue)+'</div></div>';
  if(o.duree_heures)h+='<div><div class="k">Durée</div><div class="v">'+esc(String(o.duree_heures))+' h</div></div>';
  h+='</div>';
  if(o.description)h+='<div class="fg" style="margin-top:6px"><div class="k" style="font-size:10.5px;color:var(--faint);font-weight:700;text-transform:uppercase;letter-spacing:.06em">Description</div><div class="v" style="font-size:14px;font-weight:500;margin-top:2px;color:var(--mut)">'+esc(o.description)+'</div></div>';
  if(o.rapport)h+='<div class="fg"><div class="k" style="font-size:10.5px;color:var(--faint);font-weight:700;text-transform:uppercase;letter-spacing:.06em">Rapport</div><div class="v" style="font-size:14px;font-weight:500;margin-top:2px;color:var(--mut)">'+esc(o.rapport)+'</div></div>';
  h+='<div class="modal-actions">';
  if(o.statut==="planifie")h+='<button class="btn btn-warn" onclick="interStatut(\\''+o.id+'\\',\\'en_cours\\')">Démarrer</button>';
  if(isOpen(o.statut))h+='<button class="btn btn-ok" onclick="interStatut(\\''+o.id+'\\',\\'termine\\')">Terminer</button>';
  h+='<button class="btn btn-ghost" onclick="openInter(\\''+o.id+'\\')">Modifier</button></div>';
  h+='<div style="margin-top:10px"><button class="btn btn-danger" style="width:100%" onclick="interDel(\\''+o.id+'\\')">Supprimer</button></div>';
  openModal(h);
}
async function interStatut(id,st){
  var o=findIn(S.inter,id); if(!o)return;
  var payload={statut:st}; if(st==="termine")payload.date_reelle=todayISO();
  try{ var up=await biltia.update("interventions",id,payload); for(var i=0;i<S.inter.length;i++)if(S.inter[i].id===id)S.inter[i]=up; biltia.notify(st==="termine"?"Intervention terminée":"Intervention démarrée"); closeModal(); render(); }
  catch(e){ biltia.notify("Enregistrement impossible"); }
}
async function interDel(id){ if(!confirm("Supprimer cette intervention ?"))return; try{ await biltia.remove("interventions",id); S.inter=S.inter.filter(function(x){return x.id!==id;}); biltia.notify("Intervention supprimée"); closeModal(); render(); }catch(e){} }

/* ── Intervention : éditeur ── */
function openInter(id,preClient){
  var o=id?findIn(S.inter,id):null;
  S.edit = o? { id:o.id, type:o.type||"", client_id:o.client_id||"", employee_id:o.employee_id||"", statut:o.statut||"planifie", date_prevue:o.date_prevue?String(o.date_prevue).slice(0,10):"", duree_heures:(o.duree_heures!=null?o.duree_heures:""), description:o.description||"", rapport:o.rapport||"" }
            : { id:null, type:"", client_id:preClient||"", employee_id:"", statut:"planifie", date_prevue:todayISO(), duree_heures:"", description:"", rapport:"" };
  var e=S.edit;
  var h='<div class="modal-h"><div><div class="modal-title">'+(id?"Modifier l\\'intervention":"Nouvelle intervention")+'</div><div class="modal-sub">Dépannage, entretien, SAV…</div></div><button class="x" onclick="closeModal()">✕</button></div>';
  h+='<div class="fg"><label class="fl">Type d\\'intervention *</label><input id="i-type" value="'+esc(e.type||"")+'" placeholder="Dépannage chaudière…"><div class="sugg">'+ITYPES.map(function(t){return '<button type="button" onclick="iSetType(\\''+esc(t)+'\\')">'+esc(t)+'</button>';}).join("")+'</div></div>';
  h+='<div class="form-row"><div class="fg"><label class="fl">Client</label><select id="i-client" onchange="iClientChange(this.value)">'+optClients(e.client_id)+'</select></div><div class="fg"><label class="fl">Intervenant</label><select id="i-emp">'+optEmployees(e.employee_id)+'</select></div></div>';
  h+='<div class="form-row"><div class="fg"><label class="fl">Date prévue</label><input type="date" id="i-date" value="'+esc(e.date_prevue||"")+'"></div><div class="fg"><label class="fl">Durée (h)</label><input id="i-duree" inputmode="decimal" value="'+esc(e.duree_heures===""?"":String(e.duree_heures))+'" placeholder="2"></div></div>';
  h+='<div class="fg"><label class="fl">Statut</label><div class="seg" id="i-seg">'+ISEG.map(function(s){var on=e.statut===s[0];var col=iMeta(s[0]).c;return '<button type="button" onclick="iSetStatut(\\''+s[0]+'\\')" class="'+(on?"on":"")+'" style="'+(on?"background:"+col+";border-color:"+col:"")+'">'+s[1]+'</button>';}).join("")+'</div></div>';
  h+='<div class="fg"><label class="fl">Description</label><textarea id="i-desc" placeholder="Symptôme, matériel concerné, contexte…">'+esc(e.description||"")+'</textarea></div>';
  h+='<div class="fg" id="i-rap-wrap"'+(e.statut==="termine"?"":' style="display:none"')+'><label class="fl">Rapport d\\'intervention</label><textarea id="i-rapport" placeholder="Travaux réalisés, pièces changées, recommandations…">'+esc(e.rapport||"")+'</textarea></div>';
  h+='<div class="modal-actions"><button class="btn btn-primary" id="i-save" onclick="interSave()">'+(id?"Enregistrer":"Créer")+'</button></div>';
  h+=(id?'<div style="margin-top:10px"><button class="btn btn-danger" style="width:100%" onclick="interDel(\\''+id+'\\')">Supprimer</button></div>':'');
  openModal(h);
}
function iSetType(t){ if($("i-type"))$("i-type").value=t; if(S.edit)S.edit.type=t; }
function iClientChange(v){ if(v==="__new"){ newClientInline("i-client"); return; } if(S.edit)S.edit.client_id=v; }
function iSetStatut(k){ S.edit.statut=k; var btns=document.querySelectorAll("#i-seg button"); for(var i=0;i<ISEG.length;i++){ if(btns[i]){ var on=ISEG[i][0]===k,col=iMeta(ISEG[i][0]).c; btns[i].className=on?"on":""; btns[i].style.background=on?col:""; btns[i].style.borderColor=on?col:""; } } var w=$("i-rap-wrap"); if(w)w.style.display=(k==="termine")?"":"none"; }
async function interSave(){
  var e=S.edit;
  if($("i-type"))e.type=$("i-type").value; if($("i-client")&&$("i-client").value!=="__new")e.client_id=$("i-client").value; if($("i-emp"))e.employee_id=$("i-emp").value; if($("i-date"))e.date_prevue=$("i-date").value; if($("i-duree"))e.duree_heures=$("i-duree").value; if($("i-desc"))e.description=$("i-desc").value; if($("i-rapport"))e.rapport=$("i-rapport").value;
  if(!String(e.type||"").trim()){ var el=$("i-type"); if(el){el.classList.add("invalid");el.focus();} return; }
  var payload={ type:String(e.type).trim(), client_id:e.client_id||null, employee_id:e.employee_id||null, statut:e.statut||"planifie", date_prevue:e.date_prevue||null, duree_heures:e.duree_heures!==""&&e.duree_heures!=null?numV(e.duree_heures):null, description:e.description||null, rapport:e.rapport||null };
  if(e.statut==="termine"&&!e.date_reelle)payload.date_reelle=todayISO();
  var b=$("i-save"); if(b){b.disabled=true;b.textContent="Enregistrement…";}
  try{
    if(e.id){ var up=await biltia.update("interventions",e.id,payload); for(var i=0;i<S.inter.length;i++)if(S.inter[i].id===e.id)S.inter[i]=up; biltia.notify("Intervention enregistrée"); }
    else { var row=await biltia.create("interventions",payload); S.inter.push(row); biltia.notify("Intervention créée"); }
    closeModal(); render();
  }catch(err){ if(b){b.disabled=false;b.textContent=e.id?"Enregistrer":"Créer";} biltia.notify("Enregistrement impossible"); }
}

/* ── Contrat : détail ── */
function openContratD(id){
  var c=findIn(S.contrats,id); if(!c)return; var m=CST[c.statut]||CST.actif, cn=clientName(c.client_id);
  var h='<div class="modal-h"><div style="display:flex;align-items:center;gap:12px;min-width:0"><span class="mini-av" style="width:40px;height:40px;background:'+avc(cn||c.reference||c.type)+'">'+esc(initials(cn||"C"))+'</span><div style="min-width:0"><div class="modal-title" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(c.reference||(CTYPE[c.type]||"Contrat"))+'</div><div class="modal-sub">'+(cn?esc(cn):"Contrat d\\'entretien")+'</div></div></div><button class="x" onclick="closeModal()">✕</button></div>';
  h+='<div class="stban" style="background:'+m.c+'"><b>'+m.l+' · '+eur(numV(c.montant))+' / '+((PERI[c.periodicite]||PERI.annuel).l.toLowerCase())+'</b><span>'+(c.prochaine_echeance?"Prochaine visite le "+frDate(c.prochaine_echeance):"Aucune échéance planifiée")+'</span></div>';
  h+='<div class="kv">';
  if(cn)h+='<div><div class="k">Client</div><div class="v">'+esc(cn)+'</div></div>';
  h+='<div><div class="k">Type</div><div class="v">'+esc(CTYPE[c.type]||"Entretien")+'</div></div>';
  h+='<div><div class="k">Montant</div><div class="v">'+eur(numV(c.montant))+' / '+esc((PERI[c.periodicite]||PERI.annuel).l.toLowerCase())+'</div></div>';
  if(c.date_debut)h+='<div><div class="k">Début</div><div class="v">'+frDate(c.date_debut)+'</div></div>';
  if(c.date_fin)h+='<div><div class="k">Fin</div><div class="v">'+frDate(c.date_fin)+'</div></div>';
  if(c.prochaine_echeance)h+='<div><div class="k">Prochaine visite</div><div class="v">'+frDate(c.prochaine_echeance)+'</div></div>';
  h+='</div>';
  if(c.notes)h+='<div class="fg"><div class="k" style="font-size:10.5px;color:var(--faint);font-weight:700;text-transform:uppercase;letter-spacing:.06em">Notes</div><div class="v" style="font-size:14px;font-weight:500;margin-top:2px;color:var(--mut)">'+esc(c.notes)+'</div></div>';
  h+='<div class="modal-actions"><button class="btn btn-primary" onclick="planFromContrat(\\''+c.id+'\\')">Planifier une intervention</button><button class="btn btn-ghost" onclick="openContrat(\\''+c.id+'\\')">Modifier</button></div>';
  h+='<div style="margin-top:10px"><button class="btn btn-danger" style="width:100%" onclick="contratDel(\\''+c.id+'\\')">Supprimer</button></div>';
  openModal(h);
}
function planFromContrat(id){ var c=findIn(S.contrats,id); if(!c)return; closeModal(); openInter(null,c.client_id||""); if($("i-type")){$("i-type").value=CTYPE[c.type]==="Garantie"?"SAV sous garantie":"Entretien annuel"; if(S.edit)S.edit.type=$("i-type").value;} }
async function contratDel(id){ if(!confirm("Supprimer ce contrat ?"))return; try{ await biltia.remove("contrats",id); S.contrats=S.contrats.filter(function(x){return x.id!==id;}); biltia.notify("Contrat supprimé"); closeModal(); render(); }catch(e){} }

/* ── Contrat : éditeur ── */
function openContrat(id){
  var c=id?findIn(S.contrats,id):null;
  S.edit = c? { id:c.id, client_id:c.client_id||"", parc_id:c.parc_id||"", reference:c.reference||"", type:c.type||"entretien", montant:(c.montant!=null?numV(c.montant):""), periodicite:c.periodicite||"annuel", date_debut:c.date_debut?String(c.date_debut).slice(0,10):"", prochaine_echeance:c.prochaine_echeance?String(c.prochaine_echeance).slice(0,10):"", statut:c.statut||"actif", notes:c.notes||"" }
            : { id:null, client_id:"", parc_id:"", reference:"", type:"entretien", montant:"", periodicite:"annuel", date_debut:todayISO(), prochaine_echeance:"", statut:"actif", notes:"" };
  var e=S.edit;
  var h='<div class="modal-h"><div><div class="modal-title">'+(id?"Modifier le contrat":"Nouveau contrat")+'</div><div class="modal-sub">Entretien récurrent</div></div><button class="x" onclick="closeModal()">✕</button></div>';
  h+='<div class="form-row"><div class="fg"><label class="fl">Client *</label><select id="k-client" onchange="kClientChange(this.value)">'+optClients(e.client_id)+'</select></div><div class="fg"><label class="fl">Référence</label><input id="k-ref" value="'+esc(e.reference||"")+'" placeholder="CTR-2026-014"></div></div>';
  h+='<div class="fg"><label class="fl">Type</label><div class="seg" id="k-type">'+[["entretien","Entretien"],["maintenance","Maintenance"],["garantie","Garantie"]].map(function(o){var on=e.type===o[0];return '<button type="button" onclick="kSetType(\\''+o[0]+'\\')" class="'+(on?"on":"")+'" style="'+(on?"background:var(--cy)":"")+'">'+o[1]+'</button>';}).join("")+'</div></div>';
  h+='<div class="fg"><label class="fl">Équipement couvert</label><select id="k-parc">'+optParc(e.parc_id,e.client_id)+'</select></div>';
  h+='<div class="form-row"><div class="fg"><label class="fl">Montant (€)</label><input id="k-montant" inputmode="decimal" value="'+esc(e.montant===""?"":String(e.montant))+'" placeholder="180"></div><div class="fg"><label class="fl">Périodicité</label><div class="seg" id="k-peri">'+[["mensuel","Mens."],["trimestriel","Trim."],["semestriel","Sem."],["annuel","Ann."]].map(function(o){var on=e.periodicite===o[0];return '<button type="button" onclick="kSetPeri(\\''+o[0]+'\\')" class="'+(on?"on":"")+'" style="'+(on?"background:var(--cy)":"")+'">'+o[1]+'</button>';}).join("")+'</div></div></div>';
  h+='<div class="form-row"><div class="fg"><label class="fl">Début</label><input type="date" id="k-debut" value="'+esc(e.date_debut||"")+'"></div><div class="fg"><label class="fl">Prochaine visite</label><input type="date" id="k-ech" value="'+esc(e.prochaine_echeance||"")+'"></div></div>';
  h+='<div class="fg"><label class="fl">Statut</label><div class="seg" id="k-seg">'+CSEG.map(function(s){var on=e.statut===s[0];var col=(CST[s[0]]||CST.actif).c;return '<button type="button" onclick="kSetStatut(\\''+s[0]+'\\')" class="'+(on?"on":"")+'" style="'+(on?"background:"+col+";border-color:"+col:"")+'">'+s[1]+'</button>';}).join("")+'</div></div>';
  h+='<div class="fg"><label class="fl">Notes</label><textarea id="k-notes" placeholder="Conditions, matériel couvert…">'+esc(e.notes||"")+'</textarea></div>';
  h+='<div class="modal-actions"><button class="btn btn-primary" id="k-save" onclick="contratSave()">'+(id?"Enregistrer":"Créer")+'</button></div>';
  h+=(id?'<div style="margin-top:10px"><button class="btn btn-danger" style="width:100%" onclick="contratDel(\\''+id+'\\')">Supprimer</button></div>':'');
  openModal(h);
}
function kClientChange(v){ if(v==="__new"){ newClientInline("k-client",function(){ if($("k-parc"))$("k-parc").innerHTML=optParc("",S.edit.client_id); }); return; } if(S.edit)S.edit.client_id=v; if($("k-parc"))$("k-parc").innerHTML=optParc(S.edit.parc_id,v); }
function kSetType(k){ S.edit.type=k; var b=document.querySelectorAll("#k-type button"),ks=["entretien","maintenance","garantie"]; for(var i=0;i<ks.length;i++)if(b[i]){var on=ks[i]===k;b[i].className=on?"on":"";b[i].style.background=on?"var(--cy)":"";} }
function kSetPeri(k){ S.edit.periodicite=k; var b=document.querySelectorAll("#k-peri button"),ks=["mensuel","trimestriel","semestriel","annuel"]; for(var i=0;i<ks.length;i++)if(b[i]){var on=ks[i]===k;b[i].className=on?"on":"";b[i].style.background=on?"var(--cy)":"";} }
function kSetStatut(k){ S.edit.statut=k; var b=document.querySelectorAll("#k-seg button"); for(var i=0;i<CSEG.length;i++)if(b[i]){var on=CSEG[i][0]===k,col=(CST[CSEG[i][0]]||CST.actif).c;b[i].className=on?"on":"";b[i].style.background=on?col:"";b[i].style.borderColor=on?col:"";} }
async function contratSave(){
  var e=S.edit;
  if($("k-client")&&$("k-client").value!=="__new")e.client_id=$("k-client").value; if($("k-ref"))e.reference=$("k-ref").value; if($("k-parc"))e.parc_id=$("k-parc").value; if($("k-montant"))e.montant=$("k-montant").value; if($("k-debut"))e.date_debut=$("k-debut").value; if($("k-ech"))e.prochaine_echeance=$("k-ech").value; if($("k-notes"))e.notes=$("k-notes").value;
  if(!String(e.client_id||"").trim()){ var el=$("k-client"); if(el){el.classList.add("invalid");el.focus();} biltia.notify("Choisissez un client"); return; }
  var payload={ client_id:e.client_id, parc_id:e.parc_id||null, reference:e.reference||null, type:e.type||"entretien", montant:e.montant!==""&&e.montant!=null?numV(e.montant):null, periodicite:e.periodicite||"annuel", date_debut:e.date_debut||null, prochaine_echeance:e.prochaine_echeance||null, statut:e.statut||"actif", notes:e.notes||null };
  var b=$("k-save"); if(b){b.disabled=true;b.textContent="Enregistrement…";}
  try{
    if(e.id){ var up=await biltia.update("contrats",e.id,payload); for(var i=0;i<S.contrats.length;i++)if(S.contrats[i].id===e.id)S.contrats[i]=up; biltia.notify("Contrat enregistré"); }
    else { var row=await biltia.create("contrats",payload); S.contrats.push(row); biltia.notify("Contrat créé"); }
    closeModal(); render();
  }catch(err){ if(b){b.disabled=false;b.textContent=e.id?"Enregistrer":"Créer";} biltia.notify("Enregistrement impossible"); }
}

/* ── Parc : détail ── */
function openParcD(id){
  var p=findIn(S.parc,id); if(!p)return; var cn=clientName(p.client_id); var gar=p.date_garantie&&String(p.date_garantie).slice(0,10)>=todayISO();
  var h='<div class="modal-h"><div style="display:flex;align-items:center;gap:12px;min-width:0"><span class="mini-av" style="width:40px;height:40px;background:'+avc(cn||p.type)+';font-size:20px">'+(PTIC[p.type]||"🔧")+'</span><div style="min-width:0"><div class="modal-title" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc((PT[p.type]||"Équipement")+(p.marque?" "+p.marque:""))+'</div><div class="modal-sub">'+(cn?esc(cn):"Parc installé")+(p.modele?" · "+esc(p.modele):"")+'</div></div></div><button class="x" onclick="closeModal()">✕</button></div>';
  var dl=p.prochain_entretien?daysTo(p.prochain_entretien):null;
  var banCol=gar?"#059669":(dl!=null&&dl<0?"#E11D48":(dl!=null&&dl<=30?"#D97706":"#0891B2"));
  h+='<div class="stban" style="background:'+banCol+'"><b>'+(gar?"Sous garantie":(p.prochain_entretien?(dl<0?"Entretien en retard":"Prochain entretien "+frDate(p.prochain_entretien)):"Installé"))+'</b><span>'+(p.date_pose?"Posé le "+frDate(p.date_pose):"")+(p.date_garantie?(p.date_pose?" · ":"")+"garantie jusqu\\'au "+frDate(p.date_garantie):"")+'</span></div>';
  h+='<div class="kv">';
  if(cn)h+='<div><div class="k">Client</div><div class="v">'+esc(cn)+'</div></div>';
  h+='<div><div class="k">Type</div><div class="v">'+esc(PT[p.type]||"Équipement")+'</div></div>';
  if(p.marque)h+='<div><div class="k">Marque</div><div class="v">'+esc(p.marque)+'</div></div>';
  if(p.modele)h+='<div><div class="k">Modèle</div><div class="v">'+esc(p.modele)+'</div></div>';
  if(p.numero_serie)h+='<div><div class="k">N° de série</div><div class="v">'+esc(p.numero_serie)+'</div></div>';
  if(p.localisation)h+='<div><div class="k">Localisation</div><div class="v">'+esc(p.localisation)+'</div></div>';
  if(p.dernier_entretien)h+='<div><div class="k">Dernier entretien</div><div class="v">'+frDate(p.dernier_entretien)+'</div></div>';
  if(p.prochain_entretien)h+='<div><div class="k">Prochain entretien</div><div class="v">'+frDate(p.prochain_entretien)+'</div></div>';
  h+='</div>';
  if(p.notes)h+='<div class="fg"><div class="k" style="font-size:10.5px;color:var(--faint);font-weight:700;text-transform:uppercase;letter-spacing:.06em">Notes</div><div class="v" style="font-size:14px;font-weight:500;margin-top:2px;color:var(--mut)">'+esc(p.notes)+'</div></div>';
  h+='<div class="modal-actions"><button class="btn btn-primary" onclick="planFromParc(\\''+p.id+'\\')">Planifier un entretien</button><button class="btn btn-ghost" onclick="openParc(\\''+p.id+'\\')">Modifier</button></div>';
  h+='<div style="margin-top:10px"><button class="btn btn-danger" style="width:100%" onclick="parcDel(\\''+p.id+'\\')">Supprimer</button></div>';
  openModal(h);
}
function planFromParc(id){ var p=findIn(S.parc,id); if(!p)return; closeModal(); openInter(null,p.client_id||""); if($("i-type")){$("i-type").value="Entretien annuel"; if(S.edit)S.edit.type="Entretien annuel";} if($("i-desc")){var lbl=(PT[p.type]||"Équipement")+(p.marque?" "+p.marque:"")+(p.modele?" "+p.modele:""); $("i-desc").value=lbl; if(S.edit)S.edit.description=lbl;} }
async function parcDel(id){ if(!confirm("Supprimer cet équipement ?"))return; try{ await biltia.remove("parc_installe",id); S.parc=S.parc.filter(function(x){return x.id!==id;}); biltia.notify("Équipement supprimé"); closeModal(); render(); }catch(e){} }

/* ── Parc : éditeur ── */
function openParc(id,preClient){
  var p=id?findIn(S.parc,id):null;
  S.edit = p? { id:p.id, client_id:p.client_id||"", type:p.type||"chaudiere", marque:p.marque||"", modele:p.modele||"", numero_serie:p.numero_serie||"", localisation:p.localisation||"", date_pose:p.date_pose?String(p.date_pose).slice(0,10):"", date_garantie:p.date_garantie?String(p.date_garantie).slice(0,10):"", prochain_entretien:p.prochain_entretien?String(p.prochain_entretien).slice(0,10):"", notes:p.notes||"" }
            : { id:null, client_id:preClient||"", type:"chaudiere", marque:"", modele:"", numero_serie:"", localisation:"", date_pose:"", date_garantie:"", prochain_entretien:"", notes:"" };
  var e=S.edit;
  var h='<div class="modal-h"><div><div class="modal-title">'+(id?"Modifier l\\'équipement":"Nouvel équipement")+'</div><div class="modal-sub">Parc installé chez le client</div></div><button class="x" onclick="closeModal()">✕</button></div>';
  h+='<div class="fg"><label class="fl">Client *</label><select id="p-client" onchange="pClientChange(this.value)">'+optClients(e.client_id)+'</select></div>';
  h+='<div class="fg"><label class="fl">Type d\\'équipement</label><div class="seg" id="p-type">'+PSEG.map(function(o){var on=e.type===o[0];return '<button type="button" onclick="pSetType(\\''+o[0]+'\\')" class="'+(on?"on":"")+'" style="'+(on?"background:var(--cy)":"")+'">'+o[1]+'</button>';}).join("")+'</div></div>';
  h+='<div class="form-row"><div class="fg"><label class="fl">Marque</label><input id="p-marque" value="'+esc(e.marque||"")+'" placeholder="Saunier Duval…"></div><div class="fg"><label class="fl">Modèle</label><input id="p-modele" value="'+esc(e.modele||"")+'" placeholder="ThemaPlus…"></div></div>';
  h+='<div class="form-row"><div class="fg"><label class="fl">N° de série</label><input id="p-serie" value="'+esc(e.numero_serie||"")+'"></div><div class="fg"><label class="fl">Localisation</label><input id="p-loc" value="'+esc(e.localisation||"")+'" placeholder="Chaufferie, garage…"></div></div>';
  h+='<div class="form-row"><div class="fg"><label class="fl">Date de pose</label><input type="date" id="p-pose" value="'+esc(e.date_pose||"")+'"></div><div class="fg"><label class="fl">Fin de garantie</label><input type="date" id="p-gar" value="'+esc(e.date_garantie||"")+'"></div></div>';
  h+='<div class="fg"><label class="fl">Prochain entretien</label><input type="date" id="p-ent" value="'+esc(e.prochain_entretien||"")+'"></div>';
  h+='<div class="fg"><label class="fl">Notes</label><textarea id="p-notes" placeholder="Historique, spécificités…">'+esc(e.notes||"")+'</textarea></div>';
  h+='<div class="modal-actions"><button class="btn btn-primary" id="p-save" onclick="parcSave()">'+(id?"Enregistrer":"Créer")+'</button></div>';
  h+=(id?'<div style="margin-top:10px"><button class="btn btn-danger" style="width:100%" onclick="parcDel(\\''+id+'\\')">Supprimer</button></div>':'');
  openModal(h);
}
function pClientChange(v){ if(v==="__new"){ newClientInline("p-client"); return; } if(S.edit)S.edit.client_id=v; }
function pSetType(k){ S.edit.type=k; var b=document.querySelectorAll("#p-type button"); for(var i=0;i<PSEG.length;i++)if(b[i]){var on=PSEG[i][0]===k;b[i].className=on?"on":"";b[i].style.background=on?"var(--cy)":"";} }
async function parcSave(){
  var e=S.edit;
  if($("p-client")&&$("p-client").value!=="__new")e.client_id=$("p-client").value; if($("p-marque"))e.marque=$("p-marque").value; if($("p-modele"))e.modele=$("p-modele").value; if($("p-serie"))e.numero_serie=$("p-serie").value; if($("p-loc"))e.localisation=$("p-loc").value; if($("p-pose"))e.date_pose=$("p-pose").value; if($("p-gar"))e.date_garantie=$("p-gar").value; if($("p-ent"))e.prochain_entretien=$("p-ent").value; if($("p-notes"))e.notes=$("p-notes").value;
  if(!String(e.client_id||"").trim()){ var el=$("p-client"); if(el){el.classList.add("invalid");el.focus();} biltia.notify("Choisissez un client"); return; }
  var payload={ client_id:e.client_id, type:e.type||"autre", marque:e.marque||null, modele:e.modele||null, numero_serie:e.numero_serie||null, localisation:e.localisation||null, date_pose:e.date_pose||null, date_garantie:e.date_garantie||null, prochain_entretien:e.prochain_entretien||null, notes:e.notes||null };
  var b=$("p-save"); if(b){b.disabled=true;b.textContent="Enregistrement…";}
  try{
    if(e.id){ var up=await biltia.update("parc_installe",e.id,payload); for(var i=0;i<S.parc.length;i++)if(S.parc[i].id===e.id)S.parc[i]=up; biltia.notify("Équipement enregistré"); }
    else { var row=await biltia.create("parc_installe",payload); S.parc.push(row); biltia.notify("Équipement ajouté"); }
    closeModal(); render();
  }catch(err){ if(b){b.disabled=false;b.textContent=e.id?"Enregistrer":"Créer";} biltia.notify("Enregistrement impossible"); }
}

/* ── Modale ── */
function openModal(html){ $("modal").innerHTML=html; $("ovl").hidden=false; $("modal").scrollTop=0; }
function closeModal(){ $("ovl").hidden=true; $("modal").innerHTML=""; S.edit=null; }
document.addEventListener("click",function(e){ if(e.target&&e.target.id==="ovl")closeModal(); });

/* ── Init ── */
function initBrand(){ if(!S.entreprise||S.entreprise.indexOf("__")===0)S.entreprise="Mon entreprise"; var eb=S.entreprise.toUpperCase().slice(0,22); ["side-eyebrow","hd-eyebrow","tb-eyebrow"].forEach(function(i){var el=$(i);if(el)el.textContent=eb;}); ["side-logo","hd-logo"].forEach(function(i){var el=$(i);if(el)el.textContent=initials(S.entreprise)||"B";}); }
var _rz;
function start(){ initBrand(); renderNav(); boot(); if(window.addEventListener)window.addEventListener("resize",function(){ if(_rz)clearTimeout(_rz); _rz=setTimeout(function(){ if(S.view==="interventions")render(); },200); }); }
if(document.readyState!=="loading"){ start(); } else { document.addEventListener("DOMContentLoaded",start); }
${CHART_ENGINE_JS}
</script>
</body>
</html>`;
