// ─────────────────────────────────────────────────────────────────────────────
// APP PHARE — DEVIS À LA VOIX (multi-pages, patron de référence = app-chantiers)
//
// Vraie application métier suivant À LA LETTRE les règles de génération de l'agent :
// navigation réelle multi-vues (Tableau de bord · Devis · Catalogue · Clients),
// SIDEBAR sur ordi / TAB-BAR en bas sur mobile, police Inter, système de design
// Biltia (accent UNI sobre — ici TEAL, fond légèrement plus froid pour distinguer
// du suivi de chantiers), tableau de bord hero + KPI + « à traiter », fiche détail
// au clic, chaque bouton fonctionne, mise à jour instantanée, responsive 365px.
//
// Fonction phare : l'artisan DICTE un ou plusieurs devis d'affilée, biltia.parseDevis()
// les découpe en devis structurés + lignes chiffrées, il relit/corrige chaque carte,
// puis « Tout enregistrer » les crée dans le workspace. Chaque devis peut ensuite
// être envoyé par email au client (biltia.sendEmail).
// Branchée au workspace via window.biltia (devis · lignes · clients · chantiers · catalogue).
// Le SDK est injecté à l'instanciation — NE PAS l'inclure ici.
//
// Contrainte technique : PAS de template literals NI de backticks dans le JS de
// l'app (le fichier est lui-même un template literal TS) → concaténation de chaînes.
// Apostrophes françaises dans les chaînes JS : échappées \\' (émises \' dans le string).
// ─────────────────────────────────────────────────────────────────────────────

import { CHART_CSS, CHART_ENGINE_JS } from "@/lib/app-charts";

export const APP_DEVIS_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Devis</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
img,svg,video,canvas{max-width:100%;height:auto}
:root{--bg:#F4F7F7;--ink:#0F1719;--mut:#5B6A6C;--faint:#93A3A4;--line:#E4EBEB;--soft:#EDF3F2;
--vio:#0D9488;--grad:#0D9488;--glow:13,148,136;--tint:#E1F3F0;--tintline:#B2E3DB;
--shadow:0 1px 2px rgba(15,23,25,.04),0 6px 18px rgba(15,23,25,.05);--shadow-lg:0 14px 44px rgba(15,23,25,.13)}
body{background:var(--bg);font-family:'Inter',system-ui,sans-serif;color:var(--ink);font-size:14px;line-height:1.55;-webkit-font-smoothing:antialiased;overflow-x:hidden;overflow-wrap:break-word}
.card{background:#fff;border:1px solid var(--line);border-radius:20px;padding:20px;overflow:hidden;box-shadow:var(--shadow)}
.hero{position:relative;padding:24px 22px;border-radius:24px;color:var(--ink);background:#fff;border:1px solid var(--line);box-shadow:var(--shadow);overflow:hidden}
.hero::after{content:"";position:absolute;right:-52px;top:-52px;width:180px;height:180px;border-radius:50%;background:var(--tint);opacity:.8}
.hero-label{position:relative;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:var(--vio)}
.hero-value{position:relative;font-size:34px;font-weight:800;letter-spacing:-.02em;line-height:1.15;color:var(--ink);font-variant-numeric:tabular-nums}
.hero-sub{position:relative;font-size:12.5px;color:var(--mut);margin-top:4px}
.hero-actions{position:relative;display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}
.kpi{background:#fff;border:1px solid var(--line);border-radius:18px;padding:16px 18px;display:flex;flex-direction:column;gap:5px;overflow:hidden;box-shadow:var(--shadow)}
.kpi-label{font-size:10px;font-weight:700;color:var(--faint);text-transform:uppercase;letter-spacing:.1em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kpi-value{font-size:25px;font-weight:800;color:var(--ink);line-height:1.1;letter-spacing:-.02em;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kpi-sub{font-size:11px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:none;cursor:pointer;font-family:inherit;font-weight:600;transition:all .18s;border-radius:12px;white-space:nowrap;font-size:13px;padding:10px 18px}
.btn:active{transform:scale(.97)}
.btn svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}
.btn-primary{background:var(--grad);color:#fff;box-shadow:0 4px 12px rgba(var(--glow),.22)}
.btn-primary:hover{box-shadow:0 6px 18px rgba(var(--glow),.32)}
.btn-ink{background:#0A0A0A;color:#fff}.btn-ink:hover{background:#26262E}
.btn-ghost{background:#fff;color:var(--ink);border:1px solid var(--line)}
.btn-ghost:hover{border-color:var(--tintline);box-shadow:0 4px 14px rgba(var(--glow),.12)}
.btn-danger{background:#FFF1F2;color:#E11D48;border:1px solid #FECDD3;padding:8px 14px;font-size:12px;border-radius:10px}
.btn-sm{padding:8px 14px;font-size:12px;border-radius:10px}
.badge{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:9999px;font-size:11px;font-weight:600;white-space:nowrap}
.badge-accent{background:var(--tint);color:var(--vio);border:1px solid var(--tintline)}
.badge-green{background:#ECFDF5;color:#059669;border:1px solid #A7F3D0}
.badge-red{background:#FFF1F2;color:#E11D48;border:1px solid #FECDD3}
.badge-amber{background:#FFFBEB;color:#B45309;border:1px solid #FDE68A}
.badge-gray{background:#F2F5F5;color:#697273;border:1px solid #E6ECEC}
input,select,textarea{font-family:inherit;font-size:16px;color:var(--ink);background:#fff;border:1px solid #DDE6E5;border-radius:12px;padding:10px 14px;width:100%;outline:none;transition:border .15s,box-shadow .15s}
input:focus,select:focus,textarea:focus{border-color:var(--vio);box-shadow:0 0 0 3px rgba(var(--glow),.14)}
input::placeholder,textarea::placeholder{color:#9AAAA9}
input.invalid,select.invalid,textarea.invalid{border-color:#E11D48;box-shadow:0 0 0 3px rgba(225,29,72,.12)}
/* Coquille : sidebar (ordi) + header/tab-bar (mobile) */
.shell{display:flex;min-height:100vh}
.sidebar{display:none}
.app-main{flex:1;min-width:0;padding:0 0 90px}
.app-header{position:fixed;top:0;left:0;right:0;z-index:100;background:rgba(244,247,247,.85);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-bottom:1px solid var(--line);height:60px;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 14px}
.brand{display:flex;align-items:center;gap:10px;min-width:0}
.brand-logo{width:30px;height:30px;border-radius:9px;background:var(--grad);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:14px;flex-shrink:0}
.app-eyebrow{font-size:10px;font-weight:700;color:var(--vio);text-transform:uppercase;letter-spacing:.12em;display:block;line-height:1.2}
.app-title{font-size:15px;font-weight:800;letter-spacing:-.01em;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px;line-height:1.2}
.mtop{height:60px}
.tab-bar{position:fixed;bottom:0;left:0;right:0;background:rgba(244,247,247,.94);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-top:1px solid var(--line);display:flex;z-index:100}
.tab-item{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:8px 4px 10px;cursor:pointer;border:none;background:none;font-size:10px;font-weight:600;color:#93A3A4;font-family:inherit;min-height:56px}
.tab-item.active{color:var(--vio)}
.tab-ic{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.fab{position:fixed;right:16px;bottom:78px;z-index:120;width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;color:#fff;font-size:28px;line-height:1;background:var(--grad);box-shadow:0 8px 22px rgba(var(--glow),.30);display:flex;align-items:center;justify-content:center}
.fab:active{transform:scale(.94)}
.view-pad{padding:16px}
.topbar{display:none}
.section-h{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:22px 2px 12px}
.section-h b{font-size:15px;font-weight:700}
.section-h .link{font-size:12px;font-weight:600;color:var(--vio);cursor:pointer;background:none;border:none}
.kpi-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}
.list{display:flex;flex-direction:column;gap:10px}
.row{display:flex;align-items:center;gap:12px;padding:14px 16px;background:#fff;border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);cursor:pointer;text-align:left;width:100%;transition:box-shadow .15s,border-color .15s}
.row:hover{box-shadow:0 6px 20px rgba(15,23,25,.07);border-color:var(--tintline)}
.avatar{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:#fff;flex-shrink:0}
.row-mid{flex:1;min-width:0}
.row-mid .n{display:block;font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.row-mid .s{display:block;font-size:12px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
.row-end{display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0}
.amt{font-weight:800;font-size:14px;font-variant-numeric:tabular-nums;white-space:nowrap}
.chips{display:flex;gap:8px;flex-wrap:wrap;padding:0 2px 4px}
.chip{border:1px solid var(--line);background:#fff;color:var(--mut);font-weight:600;font-size:12.5px;padding:7px 13px;border-radius:9999px;cursor:pointer;white-space:nowrap}
.chip.on{background:var(--ink);color:#fff;border-color:var(--ink)}
.searchwrap{position:relative;margin-bottom:12px}
.searchwrap svg{position:absolute;left:13px;top:50%;transform:translateY(-50%);width:16px;height:16px;stroke:var(--faint);fill:none;stroke-width:2}
.searchwrap input{padding-left:38px}
.grid-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:12px}
.mcard{background:#fff;border:1px solid var(--line);border-radius:18px;padding:16px;box-shadow:var(--shadow);cursor:pointer;text-align:left;width:100%}
.mcard:hover{box-shadow:0 6px 20px rgba(15,23,25,.07);border-color:var(--tintline)}
/* Carte devis (allure document) */
.dcard-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
.dcard-num{display:block;font-size:11px;font-weight:700;color:var(--vio);letter-spacing:.04em;font-variant-numeric:tabular-nums}
.dcard-client{display:block;font-weight:700;font-size:14.5px;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dcard-bot{display:flex;justify-content:space-between;align-items:flex-end;margin-top:16px;padding-top:13px;border-top:1px solid var(--soft)}
.dcard-ttc{font-weight:800;font-size:19px;letter-spacing:-.01em;font-variant-numeric:tabular-nums}
.dcard-date{font-size:12px;color:var(--faint)}
/* Bandeau voix */
.voice-cta{display:flex;align-items:center;gap:12px;width:100%;background:var(--tint);border:1px solid var(--tintline);color:var(--ink);border-radius:16px;padding:13px 16px;cursor:pointer;text-align:left;margin-bottom:12px;font-family:inherit}
.voice-cta:hover{box-shadow:0 6px 18px rgba(var(--glow),.16)}
.voice-cta .mi{width:38px;height:38px;border-radius:11px;background:var(--vio);color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.voice-cta .mi svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.voice-cta .vt{min-width:0}.voice-cta .vt b{display:block;font-size:13.5px;font-weight:700}.voice-cta .vt span{display:block;font-size:11.5px;color:var(--mut)}
.empty{text-align:center;padding:52px 20px}
.empty-ico{width:54px;height:54px;border-radius:16px;background:var(--tint);color:var(--vio);display:flex;align-items:center;justify-content:center;margin:0 auto 14px;font-size:24px}
.empty-title{font-weight:700;color:var(--ink);margin-bottom:4px}
.empty-sub{font-size:13px;color:var(--mut);margin-bottom:16px}
.spin{width:26px;height:26px;border:3px solid var(--line);border-top-color:var(--vio);border-radius:50%;animation:sp .7s linear infinite;margin:60px auto}
@keyframes sp{to{transform:rotate(360deg)}}
.overlay{position:fixed;inset:0;background:rgba(10,14,14,.42);backdrop-filter:blur(6px);z-index:200;display:flex;align-items:flex-end;justify-content:center}
.overlay[hidden]{display:none}
@media(min-width:600px){.overlay{align-items:center;padding:20px}}
.modal{background:#fff;border-radius:24px 24px 0 0;width:100%;max-width:600px;max-height:92vh;overflow-y:auto;padding:22px 20px calc(22px + env(safe-area-inset-bottom));box-shadow:var(--shadow-lg)}
@media(min-width:600px){.modal{border-radius:24px}}
.modal-h{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px}
.modal-title{font-size:18px;font-weight:800;letter-spacing:-.01em}
.modal-sub{font-size:12.5px;color:var(--mut);margin-top:2px}
.x{border:none;background:var(--soft);width:34px;height:34px;border-radius:10px;color:var(--mut);font-size:18px;cursor:pointer;flex-shrink:0}
.fg{margin-bottom:14px}
.fl{display:block;font-size:11px;font-weight:700;color:#5B6A6C;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media(max-width:480px){.form-row{grid-template-columns:1fr}}
.hint{font-size:11.5px;color:var(--mut);margin-top:6px}
.seg{display:flex;flex-wrap:wrap;gap:6px}
.seg button{border:1px solid var(--line);background:#fff;color:var(--mut);font-weight:600;font-size:12px;padding:8px 12px;border-radius:10px;cursor:pointer;font-family:inherit}
.seg button.on{color:#fff;border-color:transparent}
.modal-actions{display:flex;gap:10px;margin-top:20px}
.modal-actions .btn{flex:1}
/* Lignes de devis (éditeur) */
.dline{background:#fff;border:1px solid var(--line);border-radius:14px;padding:12px;margin-bottom:10px}
.dline .des{margin-bottom:10px}
.dline-grid{display:grid;grid-template-columns:1fr 1fr 1.2fr 1fr;gap:8px}
@media(max-width:520px){.dline-grid{grid-template-columns:1fr 1fr}}
.mini-lbl{display:block;font-size:9.5px;font-weight:700;color:var(--faint);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px}
.dline-foot{display:flex;justify-content:space-between;align-items:center;margin-top:11px;padding-top:11px;border-top:1px solid var(--soft)}
.dline-cap{font-size:11.5px;color:var(--mut)}
.dline-tot{font-weight:800;font-variant-numeric:tabular-nums}
.lx{border:none;background:#FFF1F2;color:#E11D48;width:30px;height:30px;border-radius:9px;font-size:15px;cursor:pointer;flex-shrink:0}
.addline{display:flex;gap:8px;margin-bottom:16px}
.addline select{flex:1}
.totbox{background:var(--soft);border-radius:16px;padding:14px 16px;margin-top:4px}
.totrow{display:flex;justify-content:space-between;align-items:center;padding:5px 0;font-size:13.5px;color:var(--mut)}
.totrow .v{color:var(--ink);font-weight:600;font-variant-numeric:tabular-nums}
.totrow.grand{font-size:18px;font-weight:800;color:var(--ink);border-top:1px solid var(--tintline);margin-top:6px;padding-top:11px}
.totrow.grand .v{font-weight:800}
/* Fiche détail : lignes */
.dl-item{display:flex;justify-content:space-between;gap:14px;padding:10px 0;border-bottom:1px solid var(--soft)}
.dl-item:last-child{border-bottom:none}
.dl-des{font-weight:600;font-size:13.5px}
.dl-meta{font-size:12px;color:var(--mut);margin-top:2px}
.dl-tot{font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.det-sec{margin-top:18px}
.det-sec .fl{margin-bottom:8px}
.det-row{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid var(--soft);font-size:13px}
.det-row:last-child{border-bottom:none}
.det-row .k{color:var(--mut)}
.det-row .v{font-weight:600;text-align:right}
/* Dictée */
.recwrap{text-align:center;padding:8px 0 2px}
.micbig{width:96px;height:96px;border-radius:50%;background:var(--tint);color:var(--vio);display:flex;align-items:center;justify-content:center;margin:8px auto 16px;position:relative}
.micbig svg{width:40px;height:40px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.micbig.live::before{content:"";position:absolute;inset:-8px;border-radius:50%;border:2px solid var(--vio);opacity:.5;animation:pulse 1.4s ease-out infinite}
@keyframes pulse{0%{transform:scale(.92);opacity:.5}100%{transform:scale(1.28);opacity:0}}
.rec-time{font-variant-numeric:tabular-nums;font-weight:800;font-size:24px;letter-spacing:.02em}
.rec-hint{font-size:13px;color:var(--mut);margin-top:6px;max-width:340px;margin-left:auto;margin-right:auto}
/* Cartes de relecture (dictée) */
.rv-card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:16px;box-shadow:var(--shadow);margin-bottom:12px}
.rv-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px}
.rv-lines{margin:10px 0}
/* ── ORDI (≥ 860px) : SIDEBAR + contenu pleine largeur ── */
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
  .topbar-actions{display:flex;gap:10px}
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
  .app-title{max-width:118px}
}
@media(min-width:1600px){ .topbar,.view-pad{max-width:1520px;margin-left:auto;margin-right:auto} }
@media print{.sidebar,.app-header,.tab-bar,.fab,.no-print{display:none!important}}
${CHART_CSS}
</style>
</head>
<body>
<div class="shell">
  <aside class="sidebar">
    <div class="side-brand"><span class="brand-logo" id="side-logo">B</span><div style="min-width:0"><span class="app-eyebrow" id="side-eyebrow">BILTIA</span><span class="app-title" id="side-title">Devis</span></div></div>
    <nav class="side-nav" id="side-nav"></nav>
  </aside>

  <div class="app-main">
    <header class="app-header">
      <div class="brand"><span class="brand-logo" id="hd-logo">B</span><div style="min-width:0"><span class="app-eyebrow" id="hd-eyebrow">BILTIA</span><span class="app-title">Devis</span></div></div>
      <button class="btn btn-primary btn-sm" onclick="dictate()"><svg viewBox="0 0 24 24"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>Dicter</button>
    </header>
    <div class="mtop"></div>
    <div class="topbar">
      <div><span class="app-eyebrow" id="tb-eyebrow">BILTIA</span><div id="tb-title" style="font-size:22px;font-weight:800;letter-spacing:-.02em">Tableau de bord</div></div>
      <div class="topbar-actions">
        <button class="btn btn-ghost" onclick="dictate()"><svg viewBox="0 0 24 24"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>Dicter un devis</button>
        <button class="btn btn-primary" id="tb-add" onclick="primaryAdd()">+ Nouveau devis</button>
      </div>
    </div>
    <main id="view"><div class="spin"></div></main>
  </div>
</div>

<nav class="tab-bar" id="tab-bar"></nav>
<button class="fab" onclick="primaryAdd()" aria-label="Ajouter">+</button>
<div class="overlay" id="ovl" hidden><div class="modal" id="modal"></div></div>

<script>
var S={ view:"dashboard", devis:[], clients:[], chantiers:[], catalogue:[], entreprise:"__ENTREPRISE__",
        filter:"tous", search:"", edit:null, editReturn:null, editDraftIndex:0, parsed:null, reviewActive:false, recording:false };
var $=function(id){return document.getElementById(id);};
function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
function num(v){var n=parseFloat(String(v==null?"":v).replace(",",".").replace(/[^0-9.\\-]/g,""));return isFinite(n)?n:0;}
function round2(n){return Math.round(num(n)*100)/100;}
function pad2(n){return String(n).padStart(2,"0");}
function pad3(n){return String(n).padStart(3,"0");}
function todayISO(){var d=new Date();return d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate());}
function plusDays(iso,n){var d=new Date(String(iso||"").slice(0,10));if(isNaN(d.getTime()))d=new Date(todayISO());d.setDate(d.getDate()+n);return d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate());}
function fmtDate(iso){if(!iso)return "—";var p=String(iso).slice(0,10).split("-");if(p.length<3)return iso;return p[2]+"/"+p[1]+"/"+p[0];}
function daysTo(iso){if(!iso)return null;var d=new Date(String(iso).slice(0,10)),t=new Date(todayISO());return Math.round((d-t)/86400000);}
function money(n){return Math.round(num(n)).toLocaleString("fr-FR")+" €";}
function kEuro(n){n=num(n);if(n>=10000)return (Math.round(n/1000)).toLocaleString("fr-FR")+" k€";return Math.round(n).toLocaleString("fr-FR")+" €";}
function initials(s){var w=String(s||"?").trim().split(/\\s+/);return ((w[0]||"?")[0]+(w[1]?w[1][0]:"")).toUpperCase();}
function fmtSecs(s){return pad2(Math.floor(s/60))+":"+pad2(s%60);}
var AV=["#0D9488","#4F46E5","#DB2777","#0284C7","#D97706","#059669","#7C3AED","#DC2626"];
function avc(seed){var s=String(seed||""),h=0;for(var i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;return AV[h%AV.length];}
function norm(s){return String(s||"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLowerCase().trim();}
function tvaLabel(v){return String(v==null?20:v).replace(".",",");}

var DST={ brouillon:{l:"Brouillon",b:"badge-gray",c:"#93A3A4"}, envoye:{l:"Envoyé",b:"badge-accent",c:"var(--vio)"}, accepte:{l:"Accepté",b:"badge-green",c:"#059669"}, refuse:{l:"Refusé",b:"badge-red",c:"#E11D48"}, expire:{l:"Expiré",b:"badge-amber",c:"#B45309"} };
function isExpired(d){ if(d.statut!=="envoye")return false; var dd=daysTo(d.date_validite); return dd!==null&&dd<0; }
function dStat(d){ if(isExpired(d))return DST.expire; return DST[d.statut]||DST.brouillon; }
function clientName(id){for(var i=0;i<S.clients.length;i++)if(S.clients[i].id===id)return S.clients[i].nom;return "";}
function findClient(id){for(var i=0;i<S.clients.length;i++)if(S.clients[i].id===id)return S.clients[i];return null;}
function chantierName(id){for(var i=0;i<S.chantiers.length;i++)if(S.chantiers[i].id===id)return S.chantiers[i].nom;return "";}
function findDevis(id){for(var i=0;i<S.devis.length;i++)if(S.devis[i].id===id)return S.devis[i];return null;}
function findCat(id){for(var i=0;i<S.catalogue.length;i++)if(S.catalogue[i].id===id)return S.catalogue[i];return null;}
function matchClient(name){var q=norm(name);if(!q)return "";for(var i=0;i<S.clients.length;i++){var n=norm(S.clients[i].nom);if(n===q||n.indexOf(q)>=0||q.indexOf(n)>=0)return S.clients[i].id;}return "";}
function replaceDevis(up){ if(!up||!up.id)return; for(var i=0;i<S.devis.length;i++)if(S.devis[i].id===up.id)S.devis[i]=up; }
function lineTot(l){return num(l.quantite)*num(l.prix_unitaire_ht);}
function totals(lignes){var ht=0,tva=0;(lignes||[]).forEach(function(l){var t=lineTot(l);ht+=t;tva+=t*(num(l.taux_tva)||0)/100;});return {ht:ht,tva:tva,ttc:ht+tva};}
function nextNumero(offset){var y=new Date().getFullYear();var pre="D-"+y+"-";var max=0;S.devis.forEach(function(d){var n=String(d.numero||"");if(n.indexOf(pre)===0){var v=parseInt(n.slice(pre.length),10);if(isFinite(v)&&v>max)max=v;}});return pre+pad3(max+1+(offset||0));}

var NAV=[
  {id:"dashboard",label:"Tableau de bord",icon:'<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'},
  {id:"devis",label:"Devis",icon:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6"/><path d="M9 17h4"/>'},
  {id:"catalogue",label:"Catalogue",icon:'<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1.3"/>'},
  {id:"clients",label:"Clients",icon:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'}
];

/* ── Chargement ── */
async function boot(){
  try{
    var r=await Promise.all([
      biltia.list("devis",{order:"date_devis",ascending:false,limit:600}).catch(function(){return[];}),
      biltia.list("clients",{order:"nom",ascending:true,limit:800}).catch(function(){return[];}),
      biltia.list("chantiers",{order:"created_at",ascending:false,limit:600}).catch(function(){return[];}),
      biltia.list("catalogue",{order:"designation",ascending:true,limit:800}).catch(function(){return[];})
    ]);
    S.devis=r[0]||[]; S.clients=r[1]||[]; S.chantiers=r[2]||[]; S.catalogue=r[3]||[];
    renderNav(); render();
  }catch(e){
    $("view").innerHTML='<div class="view-pad"><div class="empty"><div class="empty-ico">⚠️</div><div class="empty-title">Connexion au workspace impossible</div><div class="empty-sub">Vérifiez votre connexion puis rouvrez l\\'application.</div></div></div>';
  }
}

/* ── Navigation ── */
function renderNav(){
  var sn=$("side-nav");
  sn.innerHTML=NAV.map(function(n){ return '<button class="side-item'+(S.view===n.id&&!S.reviewActive?" active":"")+'" onclick="go(\\''+n.id+'\\')"><svg viewBox="0 0 24 24">'+n.icon+'</svg><span>'+n.label+'</span></button>'; }).join("");
  var tb=$("tab-bar");
  tb.innerHTML=NAV.map(function(n){ return '<button class="tab-item'+(S.view===n.id&&!S.reviewActive?" active":"")+'" onclick="go(\\''+n.id+'\\')"><svg class="tab-ic" viewBox="0 0 24 24">'+n.icon+'</svg><span>'+n.label+'</span></button>'; }).join("");
}
function go(v){ S.reviewActive=false; S.view=v; renderNav(); render(); try{window.scrollTo(0,0);}catch(e){} }
function primaryAdd(){ if(S.reviewActive)return; if(S.view==="catalogue") openCat(null); else if(S.view==="clients") openClient(null); else openEditor(null); }
function render(){
  var titles={dashboard:"Tableau de bord",devis:"Devis",catalogue:"Catalogue de prix",clients:"Clients"};
  if(S.reviewActive){ $("tb-title").textContent="Devis dictés"; if($("tb-add"))$("tb-add").textContent="+ Nouveau devis"; renderReview(); return; }
  $("tb-title").textContent=titles[S.view]||"";
  if($("tb-add"))$("tb-add").textContent=(S.view==="catalogue"?"+ Nouvelle prestation":S.view==="clients"?"+ Nouveau client":"+ Nouveau devis");
  if(S.view==="dashboard") renderDashboard();
  else if(S.view==="devis") renderDevis();
  else if(S.view==="catalogue") renderCatalogue();
  else renderClients();
}
function kpi(label,val,sub,color){ return '<div class="kpi"><div class="kpi-label">'+label+'</div><div class="kpi-value"'+(color?' style="color:'+color+'"':'')+'>'+val+'</div><div class="kpi-sub">'+sub+'</div></div>'; }
function emptyState(ico,title,sub,onclick,btn){ return '<div class="empty"><div class="empty-ico">'+ico+'</div><div class="empty-title">'+title+'</div><div class="empty-sub">'+sub+'</div><button class="btn btn-primary" onclick="'+onclick+'">'+btn+'</button></div>'; }
function voiceCta(){ return '<button class="voice-cta" onclick="dictate()"><span class="mi"><svg viewBox="0 0 24 24"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg></span><span class="vt"><b>Dicter un devis</b><span>Parlez, Biltia le rédige et calcule les totaux.</span></span></button>'; }
function devisCard(d){ var st=dStat(d); return '<button class="mcard" onclick="openDetail(\\''+d.id+'\\')"><div class="dcard-top"><div style="min-width:0"><span class="dcard-num">'+esc(d.numero||"Devis")+'</span><span class="dcard-client">'+esc(clientName(d.client_id)||"Client non renseigné")+'</span></div><span class="badge '+st.b+'">'+st.l+'</span></div><div class="dcard-bot"><span class="dcard-ttc">'+money(d.montant_ttc)+'</span><span class="dcard-date">'+fmtDate(d.date_devis)+'</span></div></button>'; }

/* ── Vue : Tableau de bord ── */
function renderDashboard(){
  var h='<div class="view-pad">';
  if(!S.devis.length){
    h+=voiceCta()+emptyState("🧾","Aucun devis pour l\\'instant","Dictez votre premier devis ou créez-le à la main : il se retrouvera ici.","openEditor(null)","+ Nouveau devis")+'</div>';
    $("view").innerHTML=h; return;
  }
  var envoyes=S.devis.filter(function(d){return d.statut==="envoye";});
  var enAttente=envoyes.reduce(function(s,d){return s+num(d.montant_ttc);},0);
  var acc=S.devis.filter(function(d){return d.statut==="accepte";}).length;
  var ref=S.devis.filter(function(d){return d.statut==="refuse";}).length;
  var taux=(acc+ref)?Math.round(acc/(acc+ref)*100):0;
  var tm=todayISO().slice(0,7);
  var ceMois=S.devis.filter(function(d){return String(d.date_devis||"").slice(0,7)===tm;}).length;
  var aRelancer=envoyes.filter(function(d){var dd=daysTo(d.date_validite);return dd!==null&&dd<=7;}).length;
  var todo=envoyes.slice().sort(function(a,b){var x=daysTo(a.date_validite);var y=daysTo(b.date_validite);return (x==null?9999:x)-(y==null?9999:y);}).slice(0,6);
  var recents=S.devis.slice(0,6);
  h+='<section class="hero"><span class="hero-label">En attente de réponse</span><div class="hero-value">'+money(enAttente)+'</div><div class="hero-sub">'+envoyes.length+' devis envoyé'+(envoyes.length>1?"s":"")+' · '+taux+'% accepté'+(aRelancer?' · '+aRelancer+' à relancer':'')+'</div>'
    +'<div class="hero-actions"><button class="btn btn-primary" onclick="dictate()"><svg viewBox="0 0 24 24"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>Dicter un devis</button><button class="btn btn-ghost" onclick="openEditor(null)">+ Saisir à la main</button></div></section>';
  h+='<div class="kpi-grid">'
    + kpi("Devis ce mois",String(ceMois),"créés récemment")
    + kpi("En attente",kEuro(enAttente),envoyes.length+" envoyé"+(envoyes.length>1?"s":""))
    + kpi("Taux d\\'acceptation",taux+"%",(acc+ref)+" devis tranchés")
    + kpi("À relancer",String(aRelancer),aRelancer?"réponse tardive":"rien d\\'urgent",aRelancer?"#B45309":"")
    +'</div>';
  h+='<div class="chart-card" style="margin-top:14px"><div class="chart-hd"><b>Devis émis par mois</b><span class="rd" id="rd-emis">'+kEuro(0)+'</span></div><div class="chart-host" id="dv-emis"></div></div>';
  h+='<div class="section-h"><b>À relancer en priorité</b>'+(aRelancer?'<span class="badge badge-amber">'+aRelancer+'</span>':'')+'</div>';
  if(!todo.length){ h+='<div class="card" style="display:flex;align-items:center;gap:12px;color:var(--mut)"><span style="font-size:20px">👍</span><span>Aucun devis en attente de réponse. Rien à relancer pour l\\'instant.</span></div>'; }
  else { h+='<div class="list">'+todo.map(function(d){ var exp=isExpired(d); var dd=daysTo(d.date_validite); var sub=exp?("Expiré le "+fmtDate(d.date_validite)+" — relancez le client"):(dd!==null?("Réponse attendue · expire "+(dd<=0?"aujourd\\'hui":"dans "+dd+" j")):"Devis envoyé");
      return '<button class="row" onclick="openDetail(\\''+d.id+'\\')"><span class="avatar" style="background:'+avc(d.numero)+'">'+esc(initials(clientName(d.client_id)||d.numero))+'</span><span class="row-mid"><span class="n">'+esc(clientName(d.client_id)||"Client")+' · '+esc(d.numero||"")+'</span><span class="s" style="color:'+(exp?"#B45309":"var(--mut)")+'">'+esc(sub)+'</span></span><span class="row-end"><span class="amt">'+money(d.montant_ttc)+'</span></span></button>'; }).join("")+'</div>'; }
  h+='<div class="section-h" style="margin-top:24px"><b>Devis récents</b><button class="link" onclick="go(\\'devis\\')">Tout voir</button></div>';
  h+='<div class="grid-cards">'+recents.map(devisCard).join("")+'</div>';
  h+='</div>';
  $("view").innerHTML=h;
  try{
    var _M=["janv.","févr.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc."];
    var _now=new Date(),_ms=[]; for(var _i=5;_i>=0;_i--){ var _d=new Date(_now.getFullYear(),_now.getMonth()-_i,1); _ms.push({key:_d.getFullYear()+"-"+pad2(_d.getMonth()+1),label:_M[_d.getMonth()]}); }
    var _map={}; _ms.forEach(function(m){_map[m.key]=0;});
    S.devis.forEach(function(d){ var k=String(d.date_devis||"").slice(0,7); if(k in _map)_map[k]+=num(d.montant_ttc); });
    var _series=_ms.map(function(m){return {value:_map[m.key],label:m.label,tip:"Devis "+m.label};});
    var _last=_series[_series.length-1].value, _r=$("rd-emis"); if(_r)_r.textContent=kEuro(_last);
    if(_series.reduce(function(s,x){return s+x.value;},0)>0) drawBars($("dv-emis"),_series,{id:"dvemis",color:"#0D9488",color2:"#4FD1C5",fmt:kEuro,rd:"rd-emis",rdDef:kEuro(_last)});
  }catch(e){}
}

/* ── Vue : Devis ── */
var D_FIL=[["tous","Tous"],["envoye","Envoyés"],["accepte","Acceptés"],["brouillon","Brouillons"],["refuse","Refusés"],["expire","Expirés"]];
function devisFiltered(){
  var q=S.search.trim().toLowerCase();
  return S.devis.filter(function(d){
    if(S.filter==="expire"){ if(!isExpired(d))return false; }
    else if(S.filter!=="tous"){ if((d.statut||"brouillon")!==S.filter)return false; }
    if(q){ var hay=((d.numero||"")+" "+(clientName(d.client_id)||"")+" "+(chantierName(d.chantier_id)||"")).toLowerCase(); if(hay.indexOf(q)<0)return false; }
    return true;
  });
}
function devisListHTML(){
  var list=devisFiltered();
  if(!list.length){ return S.devis.length ? '<div class="empty"><div class="empty-title">Aucun devis ne correspond</div><div class="empty-sub">Changez de filtre ou de recherche.</div></div>' : emptyState("🧾","Aucun devis","Dictez ou créez votre premier devis.","openEditor(null)","+ Nouveau devis"); }
  return '<div class="grid-cards">'+list.map(devisCard).join("")+'</div>';
}
function dvSearch(v){ S.search=v; var el=$("dv-list"); if(el) el.innerHTML=devisListHTML(); }
function dvSetFilter(f){ S.filter=f; var chips=$("dv-chips"); if(chips){ Array.prototype.forEach.call(chips.children,function(b,i){ b.className="chip"+(D_FIL[i][0]===f?" on":""); }); } var el=$("dv-list"); if(el) el.innerHTML=devisListHTML(); }
function renderDevis(){
  var h='<div class="view-pad">';
  h+=voiceCta();
  h+='<div class="searchwrap"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg><input placeholder="Rechercher un numéro, un client, un chantier…" value="'+esc(S.search)+'" oninput="dvSearch(this.value)"></div>';
  h+='<div class="chips" id="dv-chips">'+D_FIL.map(function(f){ return '<button class="chip'+(S.filter===f[0]?" on":"")+'" onclick="dvSetFilter(\\''+f[0]+'\\')">'+f[1]+'</button>'; }).join("")+'</div>';
  h+='<div id="dv-list">'+devisListHTML()+'</div>';
  h+='</div>'; $("view").innerHTML=h;
}

/* ── Vue : Catalogue ── */
var CAT_TYPE={ fourniture:"Fourniture", main_oeuvre:"Main d\\'œuvre", ouvrage:"Ouvrage" };
function renderCatalogue(){
  var h='<div class="view-pad">';
  if(!S.catalogue.length){
    h+=emptyState("📚","Catalogue vide","Ajoutez vos prestations et prix : ils seront insérables en un clic dans vos devis.","openCat(null)","+ Ajouter une prestation")+'</div>';
    $("view").innerHTML=h; return;
  }
  h+='<div class="section-h" style="margin-top:2px"><b>'+S.catalogue.length+' prestation'+(S.catalogue.length>1?"s":"")+'</b><button class="btn btn-ghost btn-sm" onclick="openCat(null)">+ Prestation</button></div>';
  h+='<div class="grid-cards">'+S.catalogue.map(function(c){ var tl=CAT_TYPE[c.type]||"Prestation";
    return '<button class="mcard" onclick="openCat(\\''+c.id+'\\')"><div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><div style="min-width:0"><div style="font-weight:700">'+esc(c.designation||"Sans nom")+'</div><div class="s" style="color:var(--mut);font-size:12px;margin-top:2px">'+esc([tl,c.corps_metier].filter(Boolean).join(" · "))+'</div></div><span class="badge badge-gray">TVA '+esc(tvaLabel(c.taux_tva))+' %</span></div>'
      +'<div class="dcard-bot" style="margin-top:13px"><span class="dcard-ttc" style="font-size:17px">'+money(c.prix_vente_ht)+'</span><span class="dcard-date">/ '+esc(c.unite||"u")+' HT</span></div></button>'; }).join("")+'</div>';
  h+='</div>'; $("view").innerHTML=h;
}
function openCat(id){
  var c=id?findCat(id):{ designation:"",type:"ouvrage",unite:"u",prix_vente_ht:"",taux_tva:20,corps_metier:"" };
  S.edit=JSON.parse(JSON.stringify(c));
  var TY=[["fourniture","Fourniture"],["main_oeuvre","Main d\\'œuvre"],["ouvrage","Ouvrage"]];
  var h='<div class="modal-h"><div><div class="modal-title">'+(id?"Modifier la prestation":"Nouvelle prestation")+'</div><div class="modal-sub">Réutilisable dans tous vos devis</div></div><button class="x" onclick="closeModal()">✕</button></div>';
  h+='<div class="fg"><label class="fl">Désignation *</label><input id="c-des" value="'+esc(c.designation||"")+'" placeholder="Pose carrelage sol collé…"></div>';
  h+='<div class="fg"><label class="fl">Type</label><div class="seg" id="c-seg">'+TY.map(function(o){return '<button type="button" onclick="catType(\\''+o[0]+'\\')" class="'+(c.type===o[0]?"on":"")+'" style="'+(c.type===o[0]?"background:var(--vio)":"")+'">'+o[1]+'</button>';}).join("")+'</div></div>';
  h+='<div class="form-row"><div class="fg"><label class="fl">Prix de vente (€ HT)</label><input id="c-pu" inputmode="decimal" value="'+esc(c.prix_vente_ht!=null?c.prix_vente_ht:"")+'"></div><div class="fg"><label class="fl">Unité</label><input id="c-unite" value="'+esc(c.unite||"u")+'" placeholder="u, m², h, forfait…"></div></div>';
  h+='<div class="form-row"><div class="fg"><label class="fl">TVA</label><select id="c-tva">'+tvaOpts(c.taux_tva)+'</select></div><div class="fg"><label class="fl">Corps de métier</label><input id="c-metier" value="'+esc(c.corps_metier||"")+'" placeholder="Carreleur, plombier…"></div></div>';
  h+='<div class="modal-actions"><button class="btn btn-primary" id="c-save" onclick="catSave()">'+(id?"Enregistrer":"Ajouter")+'</button>'+(id?'<button class="btn btn-danger" style="flex:0 0 auto" onclick="catDel(\\''+id+'\\')">Supprimer</button>':'')+'</div>';
  openModal(h);
}
function catType(k){ S.edit.type=k; document.querySelectorAll("#c-seg button").forEach(function(b){b.className="";b.style.background="";}); var ks=["fourniture","main_oeuvre","ouvrage"],i=ks.indexOf(k),btns=document.querySelectorAll("#c-seg button"); if(btns[i]){btns[i].className="on";btns[i].style.background="var(--vio)";} }
async function catSave(){
  var c=S.edit; if($("c-des"))c.designation=$("c-des").value; if($("c-pu"))c.prix_vente_ht=$("c-pu").value; if($("c-unite"))c.unite=$("c-unite").value; if($("c-tva"))c.taux_tva=$("c-tva").value; if($("c-metier"))c.corps_metier=$("c-metier").value;
  if(!String(c.designation||"").trim()){ var el=$("c-des"); if(el){el.classList.add("invalid");el.focus();} return; }
  var payload={ designation:String(c.designation).trim(), type:c.type||"ouvrage", unite:c.unite||"u", prix_vente_ht:num(c.prix_vente_ht)||null, taux_tva:num(c.taux_tva)||20, corps_metier:c.corps_metier||null };
  var b=$("c-save"); if(b){b.disabled=true;b.textContent="Enregistrement…";}
  try{
    if(c.id){ var up=await biltia.update("catalogue",c.id,payload); for(var i=0;i<S.catalogue.length;i++)if(S.catalogue[i].id===c.id)S.catalogue[i]=up; biltia.notify("Prestation enregistrée"); }
    else { var row=await biltia.create("catalogue",payload); S.catalogue.push(row); S.catalogue.sort(function(a,b){return String(a.designation).localeCompare(String(b.designation));}); biltia.notify("Prestation ajoutée"); }
    closeModal(); render();
  }catch(e){ if(b){b.disabled=false;b.textContent=c.id?"Enregistrer":"Ajouter";} biltia.notify("Enregistrement impossible"); }
}
async function catDel(id){ if(!confirm("Supprimer cette prestation du catalogue ?"))return; try{ await biltia.remove("catalogue",id); S.catalogue=S.catalogue.filter(function(x){return x.id!==id;}); biltia.notify("Prestation supprimée"); closeModal(); render(); }catch(e){} }

/* ── Vue : Clients ── */
function renderClients(){
  var h='<div class="view-pad">';
  if(!S.clients.length){
    h+=emptyState("👤","Aucun client","Ajoutez vos clients pour les rattacher à vos devis.","openClient(null)","+ Ajouter un client")+'</div>';
    $("view").innerHTML=h; return;
  }
  h+='<div class="section-h" style="margin-top:2px"><b>'+S.clients.length+' client'+(S.clients.length>1?"s":"")+'</b><button class="btn btn-ghost btn-sm" onclick="openClient(null)">+ Client</button></div>';
  h+='<div class="grid-cards">'+S.clients.map(function(c){
    var nb=S.devis.filter(function(d){return d.client_id===c.id;}).length;
    var ca=S.devis.filter(function(d){return d.client_id===c.id&&d.statut==="accepte";}).reduce(function(s,d){return s+num(d.montant_ttc);},0);
    var sub=[c.ville,c.email||c.tel].filter(Boolean).join(" · ")||"Coordonnées à compléter";
    return '<button class="mcard" onclick="openClient(\\''+c.id+'\\')"><div style="display:flex;align-items:center;gap:12px"><span class="avatar" style="background:'+avc(c.nom)+'">'+esc(initials(c.nom))+'</span><div style="min-width:0;flex:1"><div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(c.nom||"Sans nom")+'</div><div class="s" style="color:var(--mut);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(sub)+'</div></div></div>'
      +'<div style="display:flex;justify-content:space-between;margin-top:12px;padding-top:12px;border-top:1px solid var(--soft);font-size:12.5px;color:var(--mut)"><span>'+(nb?nb+' devis':"Aucun devis")+'</span>'+(ca?'<span style="color:#059669;font-weight:600">'+kEuro(ca)+' signé</span>':'')+'</div></button>'; }).join("")+'</div>';
  h+='</div>'; $("view").innerHTML=h;
}
function openClient(id){
  var c=id?findClient(id):{ nom:"",type:"particulier",email:"",tel:"",adresse:"",ville:"",code_postal:"",notes:"" };
  S.edit=JSON.parse(JSON.stringify(c));
  var TY=[["particulier","Particulier"],["entreprise","Entreprise"],["collectivite","Collectivité"]];
  var h='<div class="modal-h"><div><div class="modal-title">'+(id?esc(c.nom||"Client"):"Nouveau client")+'</div></div><button class="x" onclick="closeModal()">✕</button></div>';
  h+='<div class="fg"><label class="fl">Nom *</label><input id="cl-nom" value="'+esc(c.nom||"")+'" placeholder="M. Dupont / SCI Les Lilas"></div>';
  h+='<div class="fg"><label class="fl">Type</label><div class="seg" id="cl-seg">'+TY.map(function(o){return '<button type="button" onclick="clType(\\''+o[0]+'\\')" class="'+(c.type===o[0]?"on":"")+'" style="'+(c.type===o[0]?"background:var(--vio)":"")+'">'+o[1]+'</button>';}).join("")+'</div></div>';
  h+='<div class="form-row"><div class="fg"><label class="fl">Email</label><input id="cl-email" inputmode="email" value="'+esc(c.email||"")+'" placeholder="client@exemple.fr"></div><div class="fg"><label class="fl">Téléphone</label><input id="cl-tel" inputmode="tel" value="'+esc(c.tel||"")+'"></div></div>';
  h+='<div class="fg"><label class="fl">Adresse</label><input id="cl-adresse" value="'+esc(c.adresse||"")+'"></div>';
  h+='<div class="form-row"><div class="fg"><label class="fl">Ville</label><input id="cl-ville" value="'+esc(c.ville||"")+'"></div><div class="fg"><label class="fl">Code postal</label><input id="cl-cp" value="'+esc(c.code_postal||"")+'"></div></div>';
  h+='<div class="modal-actions"><button class="btn btn-primary" id="cl-save" onclick="clientSave()">'+(id?"Enregistrer":"Ajouter le client")+'</button>'+(id?'<button class="btn btn-danger" style="flex:0 0 auto" onclick="clientDel(\\''+id+'\\')">Supprimer</button>':'')+'</div>';
  openModal(h);
}
function clType(k){ S.edit.type=k; document.querySelectorAll("#cl-seg button").forEach(function(b){b.className="";b.style.background="";}); var ks=["particulier","entreprise","collectivite"],i=ks.indexOf(k),btns=document.querySelectorAll("#cl-seg button"); if(btns[i]){btns[i].className="on";btns[i].style.background="var(--vio)";} }
async function clientSave(){
  var c=S.edit; ["nom","email","tel","adresse","ville"].forEach(function(f){var el=$("cl-"+f);if(el)c[f]=el.value;}); if($("cl-cp"))c.code_postal=$("cl-cp").value;
  if(!String(c.nom||"").trim()){ var el=$("cl-nom"); if(el){el.classList.add("invalid");el.focus();} return; }
  var payload={ nom:String(c.nom).trim(), type:c.type||null, email:c.email||null, tel:c.tel||null, adresse:c.adresse||null, ville:c.ville||null, code_postal:c.code_postal||null };
  var b=$("cl-save"); if(b){b.disabled=true;b.textContent="Enregistrement…";}
  try{
    if(c.id){ var up=await biltia.update("clients",c.id,payload); for(var i=0;i<S.clients.length;i++)if(S.clients[i].id===c.id)S.clients[i]=up; biltia.notify("Client enregistré"); }
    else { var row=await biltia.create("clients",payload); S.clients.push(row); S.clients.sort(function(a,b){return String(a.nom).localeCompare(String(b.nom));}); biltia.notify("Client ajouté"); }
    closeModal(); render();
  }catch(e){ if(b){b.disabled=false;b.textContent=c.id?"Enregistrer":"Ajouter le client";} biltia.notify("Enregistrement impossible"); }
}
async function clientDel(id){ if(!confirm("Supprimer ce client ?"))return; try{ await biltia.remove("clients",id); S.clients=S.clients.filter(function(x){return x.id!==id;}); biltia.notify("Client supprimé"); closeModal(); render(); }catch(e){} }

/* ── Modales ── */
function openModal(html){ $("modal").innerHTML=html; $("ovl").hidden=false; $("modal").scrollTop=0; }
function closeModal(){ $("ovl").hidden=true; $("modal").innerHTML=""; S.edit=null; S.editReturn=null; }
document.addEventListener("click",function(e){ if(e.target && e.target.id==="ovl"){ if(S.recording){ stopRec(false); } else { closeModal(); } } });

/* ── Options de select ── */
function tvaOpts(sel){ return [["20","20 %"],["10","10 %"],["5.5","5,5 %"]].map(function(o){ return '<option value="'+o[0]+'"'+(String(sel==null?"20":sel)===o[0]?" selected":"")+'>'+o[1]+'</option>'; }).join(""); }
function optClients(sel){ var o='<option value="">— Choisir un client —</option>'; S.clients.forEach(function(c){o+='<option value="'+c.id+'"'+(c.id===sel?" selected":"")+'>'+esc(c.nom)+'</option>';}); o+='<option value="__new">➕ Nouveau client…</option>'; return o; }
function optChantiers(sel){ var o='<option value="">— Aucun chantier —</option>'; S.chantiers.forEach(function(c){o+='<option value="'+c.id+'"'+(c.id===sel?" selected":"")+'>'+esc(c.nom)+'</option>';}); o+='<option value="__new">➕ Nouveau chantier…</option>'; return o; }
function optCat(){ var o='<option value="">➕ Depuis le catalogue…</option>'; S.catalogue.forEach(function(c){o+='<option value="'+c.id+'">'+esc(c.designation)+' · '+money(c.prix_vente_ht)+'</option>';}); return o; }

/* ── Éditeur de devis (lignes dynamiques + totaux live) ── */
function blankLine(){ return { designation:"", quantite:1, unite:"u", prix_unitaire_ht:"", taux_tva:20 }; }
function openEditor(id){
  if(!id){ S.edit={ numero:nextNumero(0), client_id:"", chantier_id:"", statut:"brouillon", date_devis:todayISO(), date_validite:plusDays(todayISO(),30), conditions:"Devis valable 30 jours. Acompte de 30% à la commande.", notes:"", lignes:[blankLine()], _loading:false }; S.editReturn=null; renderEditor(); return; }
  var d=findDevis(id); if(!d)return;
  S.edit=JSON.parse(JSON.stringify(d)); S.edit.lignes=[]; S.edit._ligneIds=[]; S.edit._loading=true; S.editReturn=null; renderEditor();
  biltia.list("lignes",{match:{devis_id:id},order:"position",ascending:true}).then(function(rows){ rows=rows||[]; S.edit.lignes=rows.map(function(l){return {designation:l.designation,quantite:l.quantite,unite:l.unite,prix_unitaire_ht:l.prix_unitaire_ht,taux_tva:l.taux_tva};}); S.edit._ligneIds=rows.map(function(l){return l.id;}); if(!S.edit.lignes.length)S.edit.lignes=[blankLine()]; S.edit._loading=false; renderEditor(); }).catch(function(){ S.edit.lignes=[blankLine()]; S.edit._loading=false; renderEditor(); });
}
function openDraftEditor(k){ var d=S.parsed[k]; if(!d)return; if(!d.lignes||!d.lignes.length)d.lignes=[blankLine()]; d._loading=false; S.edit=d; S.editReturn="review"; S.editDraftIndex=k; renderEditor(); }
function lineHTML(l,i){
  return '<div class="dline">'
    +'<input class="des" placeholder="Désignation de la prestation" value="'+esc(l.designation||"")+'" oninput="lineEdit('+i+',\\'designation\\',this.value)">'
    +'<div class="dline-grid">'
      +'<div><span class="mini-lbl">Qté</span><input inputmode="decimal" value="'+esc(l.quantite!=null?l.quantite:"")+'" oninput="lineEdit('+i+',\\'quantite\\',this.value)"></div>'
      +'<div><span class="mini-lbl">Unité</span><input value="'+esc(l.unite||"u")+'" oninput="lineEdit('+i+',\\'unite\\',this.value)"></div>'
      +'<div><span class="mini-lbl">PU HT</span><input inputmode="decimal" value="'+esc(l.prix_unitaire_ht!=null?l.prix_unitaire_ht:"")+'" oninput="lineEdit('+i+',\\'prix_unitaire_ht\\',this.value)"></div>'
      +'<div><span class="mini-lbl">TVA</span><select onchange="lineEdit('+i+',\\'taux_tva\\',this.value)">'+tvaOpts(l.taux_tva)+'</select></div>'
    +'</div>'
    +'<div class="dline-foot"><span class="dline-cap">Total ligne HT</span><span style="display:flex;align-items:center;gap:12px"><span class="dline-tot" id="ltot-'+i+'">'+money(lineTot(l))+'</span><button class="lx" onclick="lineDel('+i+')" aria-label="Supprimer la ligne">✕</button></span></div>'
  +'</div>';
}
function renderLines(){ var el=$("ed-lines"); if(!el)return; el.innerHTML=S.edit.lignes.length?S.edit.lignes.map(lineHTML).join(""):'<div class="hint" style="padding:8px 0">Aucune ligne. Ajoutez une prestation ci-dessus.</div>'; edTotals(); }
function edTotals(){ var t=totals(S.edit&&S.edit.lignes); if($("ed-ht"))$("ed-ht").textContent=money(t.ht); if($("ed-tva"))$("ed-tva").textContent=money(t.tva); if($("ed-ttc"))$("ed-ttc").textContent=money(t.ttc); }
function lineEdit(i,f,v){ var l=S.edit.lignes[i]; if(!l)return; l[f]=v; if(f==="quantite"||f==="prix_unitaire_ht"){ var el=$("ltot-"+i); if(el)el.textContent=money(lineTot(l)); } edTotals(); }
function lineAdd(){ S.edit.lignes.push(blankLine()); renderLines(); }
function lineDel(i){ S.edit.lignes.splice(i,1); renderLines(); }
function lineFromCat(id){ var c=findCat(id); if(c){ S.edit.lignes.push({ designation:c.designation||"", quantite:1, unite:c.unite||"u", prix_unitaire_ht:(c.prix_vente_ht!=null?c.prix_vente_ht:""), taux_tva:(c.taux_tva!=null?c.taux_tva:20) }); renderLines(); } var sel=$("ed-cat"); if(sel)sel.value=""; }
function edClient(v){ if(v==="__new"){ edSync(); var nm=prompt("Nom du nouveau client :",""); if(nm&&nm.trim()){ biltia.create("clients",{nom:nm.trim()}).then(function(c){ S.clients.push(c); S.clients.sort(function(a,b){return String(a.nom).localeCompare(String(b.nom));}); S.edit.client_id=c.id; S.edit._client_nom=""; renderEditor(); biltia.notify("Client ajouté"); }).catch(function(){ renderEditor(); }); } else { renderEditor(); } } else { S.edit.client_id=v; if(v)S.edit._client_nom=""; } }
function edChantier(v){ if(v==="__new"){ edSync(); var nm=prompt("Intitulé du chantier :",""); if(nm&&nm.trim()){ biltia.create("chantiers",{nom:nm.trim(),client_id:S.edit.client_id||null,statut:"en_attente"}).then(function(c){ S.chantiers.unshift(c); S.edit.chantier_id=c.id; renderEditor(); biltia.notify("Chantier créé"); }).catch(function(){ renderEditor(); }); } else { renderEditor(); } } else { S.edit.chantier_id=v; } }
function edStatut(k){ S.edit.statut=k; document.querySelectorAll("#ed-seg button").forEach(function(b){b.className="";b.style.background="";}); var ks=["brouillon","envoye","accepte","refuse","expire"],i=ks.indexOf(k),btns=document.querySelectorAll("#ed-seg button"); if(btns[i]){btns[i].className="on";btns[i].style.background=DST[k].c;} }
function edSync(){ var d=S.edit; if(!d)return; if($("ed-datedevis"))d.date_devis=$("ed-datedevis").value; if($("ed-validite"))d.date_validite=$("ed-validite").value; if($("ed-cond"))d.conditions=$("ed-cond").value; if($("ed-notes"))d.notes=$("ed-notes").value; }
function renderEditor(){
  var d=S.edit,draft=S.editReturn==="review";
  var title=draft?"Vérifier le devis dicté":(d.id?"Modifier le devis":"Nouveau devis");
  var h='<div class="modal-h"><div><div class="modal-title">'+title+'</div><div class="modal-sub">'+esc(d.numero||nextNumero(0))+'</div></div><button class="x" onclick="'+(draft?"backToReview()":"closeModal()")+'">✕</button></div>';
  h+='<div class="form-row"><div class="fg"><label class="fl">Client'+(draft?"":" *")+'</label><select id="ed-client" onchange="edClient(this.value)">'+optClients(d.client_id)+'</select>'+((draft&&!d.client_id&&d._client_nom)?'<div class="hint">Dicté : « '+esc(d._client_nom)+' » — sera créé si vous n\\'en choisissez pas un.</div>':'')+'</div>'
    +'<div class="fg"><label class="fl">Chantier</label><select id="ed-chantier" onchange="edChantier(this.value)">'+optChantiers(d.chantier_id)+'</select></div></div>';
  h+='<div class="form-row"><div class="fg"><label class="fl">Date du devis</label><input type="date" id="ed-datedevis" value="'+esc((d.date_devis||"").slice(0,10))+'"></div><div class="fg"><label class="fl">Valable jusqu\\'au</label><input type="date" id="ed-validite" value="'+esc((d.date_validite||"").slice(0,10))+'"></div></div>';
  h+='<div class="fg"><label class="fl">Ajouter une prestation</label><div class="addline"><select id="ed-cat" onchange="lineFromCat(this.value)">'+optCat()+'</select><button class="btn btn-ghost btn-sm" onclick="lineAdd()">+ Ligne</button></div></div>';
  h+='<div id="ed-lines">'+(d._loading?'<div class="spin"></div>':'')+'</div>';
  h+='<div class="totbox"><div class="totrow">Total HT<span class="v" id="ed-ht">'+money(0)+'</span></div><div class="totrow">TVA<span class="v" id="ed-tva">'+money(0)+'</span></div><div class="totrow grand">Total TTC<span class="v" id="ed-ttc">'+money(0)+'</span></div></div>';
  h+='<div class="fg" style="margin-top:16px"><label class="fl">Statut</label><div class="seg" id="ed-seg">'+["brouillon","envoye","accepte","refuse","expire"].map(function(k){return '<button type="button" onclick="edStatut(\\''+k+'\\')" class="'+(d.statut===k?"on":"")+'" style="'+(d.statut===k?"background:"+DST[k].c:"")+'">'+DST[k].l+'</button>';}).join("")+'</div></div>';
  h+='<div class="fg"><label class="fl">Conditions</label><textarea id="ed-cond" rows="2" placeholder="Conditions de paiement, validité…">'+esc(d.conditions||"")+'</textarea></div>';
  h+='<div class="fg"><label class="fl">Notes internes</label><textarea id="ed-notes" rows="2" placeholder="Remarques (non visibles par le client)">'+esc(d.notes||"")+'</textarea></div>';
  h+='<div class="modal-actions">'+(draft?'<button class="btn btn-ghost" onclick="backToReview()">Retour</button>':'')+'<button class="btn btn-primary" id="ed-save" onclick="edSave()">'+(draft?"Valider ce devis":(d.id?"Enregistrer le devis":"Créer le devis"))+'</button></div>';
  openModal(h);
  if(!d._loading) renderLines(); else edTotals();
}
function backToReview(){ closeModal(); S.reviewActive=true; render(); try{window.scrollTo(0,0);}catch(e){} }
async function edSave(){
  edSync(); var d=S.edit;
  var valid=d.lignes.filter(function(l){return String(l.designation||"").trim();});
  if(!valid.length){ biltia.notify("Ajoutez au moins une prestation"); return; }
  if(S.editReturn==="review"){ d.lignes=valid; S.parsed[S.editDraftIndex]=d; closeModal(); S.reviewActive=true; render(); biltia.notify("Devis vérifié"); try{window.scrollTo(0,0);}catch(e){} return; }
  if(!d.client_id){ biltia.notify("Choisissez un client"); var sel=$("ed-client"); if(sel){sel.classList.add("invalid");sel.focus();} return; }
  var t=totals(valid);
  var payload={ numero:d.numero||nextNumero(0), client_id:d.client_id, chantier_id:d.chantier_id||null, statut:d.statut||"brouillon", date_devis:d.date_devis||todayISO(), date_validite:d.date_validite||null, montant_ht:round2(t.ht), montant_tva:round2(t.tva), montant_ttc:round2(t.ttc), conditions:d.conditions||null, notes:d.notes||null };
  var b=$("ed-save"); if(b){b.disabled=true;b.textContent="Enregistrement…";}
  try{
    var devisId;
    if(d.id){ var up=await biltia.update("devis",d.id,payload); replaceDevis(up); devisId=d.id;
      if(d._ligneIds&&d._ligneIds.length){ for(var i=0;i<d._ligneIds.length;i++){ try{ await biltia.remove("lignes",d._ligneIds[i]); }catch(e){} } }
    } else { var row=await biltia.create("devis",payload); S.devis.unshift(row); devisId=row.id; }
    await biltia.bulkCreate("lignes", valid.map(function(l,idx){ return { devis_id:devisId, designation:String(l.designation).trim(), quantite:num(l.quantite)||null, unite:l.unite||null, prix_unitaire_ht:num(l.prix_unitaire_ht)||null, taux_tva:num(l.taux_tva)||20, total_ht:round2(lineTot(l)), position:idx }; }));
    biltia.notify(d.id?"Devis enregistré":"Devis créé");
    closeModal(); render();
  }catch(e){ if(b){b.disabled=false;b.textContent=d.id?"Enregistrer le devis":"Créer le devis";} biltia.notify("Enregistrement impossible"); }
}

/* ── Fiche détail ── */
function openDetail(id){
  var d=findDevis(id); if(!d)return;
  openModal('<div class="modal-h"><div><div class="modal-title">'+esc(d.numero||"Devis")+'</div><div class="modal-sub">'+esc(clientName(d.client_id)||"Client non renseigné")+'</div></div><button class="x" onclick="closeModal()">✕</button></div><div class="spin"></div>');
  biltia.list("lignes",{match:{devis_id:id},order:"position",ascending:true}).then(function(rows){ renderDetail(d,rows||[]); }).catch(function(){ renderDetail(d,[]); });
}
function renderDetail(d,lignes){
  var st=dStat(d); var cl=findClient(d.client_id); var t=lignes.length?totals(lignes):{ht:num(d.montant_ht),tva:num(d.montant_tva),ttc:num(d.montant_ttc)};
  var h='<div class="modal-h"><div><div class="modal-title">'+esc(d.numero||"Devis")+'</div><div class="modal-sub">'+esc(clientName(d.client_id)||"Client non renseigné")+(d.chantier_id?" · "+esc(chantierName(d.chantier_id)):"")+'</div></div><button class="x" onclick="closeModal()">✕</button></div>';
  h+='<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap"><span class="badge '+st.b+'">'+st.l+'</span><span style="font-weight:800;font-size:20px;font-variant-numeric:tabular-nums">'+money(t.ttc)+' TTC</span></div>';
  h+='<div class="det-sec"><div class="fl">Statut</div><div class="seg" id="d-seg">'+["brouillon","envoye","accepte","refuse","expire"].map(function(k){ return '<button onclick="dQuickStatut(\\''+d.id+'\\',\\''+k+'\\')" class="'+(d.statut===k?"on":"")+'" style="'+(d.statut===k?"background:"+DST[k].c:"")+'">'+DST[k].l+'</button>'; }).join("")+'</div></div>';
  h+='<div class="det-sec"><div class="fl">Détail ('+lignes.length+' ligne'+(lignes.length>1?"s":"")+')</div>';
  if(!lignes.length){ h+='<div class="hint">Aucune ligne détaillée. Modifiez le devis pour en ajouter.</div>'; }
  else { h+=lignes.map(function(l){ return '<div class="dl-item"><div style="min-width:0"><div class="dl-des">'+esc(l.designation||"")+'</div><div class="dl-meta">'+esc((l.quantite!=null?l.quantite:1)+" "+(l.unite||"u"))+' × '+money(l.prix_unitaire_ht)+' · TVA '+esc(tvaLabel(l.taux_tva))+' %</div></div><div class="dl-tot">'+money(lineTot(l))+'</div></div>'; }).join(""); }
  h+='</div>';
  h+='<div class="totbox"><div class="totrow">Total HT<span class="v">'+money(t.ht)+'</span></div><div class="totrow">TVA<span class="v">'+money(t.tva)+'</span></div><div class="totrow grand">Total TTC<span class="v">'+money(t.ttc)+'</span></div></div>';
  h+='<div class="det-sec"><div class="fl">Informations</div>';
  h+='<div class="det-row"><span class="k">Date du devis</span><span class="v">'+fmtDate(d.date_devis)+'</span></div>';
  h+='<div class="det-row"><span class="k">Valable jusqu\\'au</span><span class="v">'+fmtDate(d.date_validite)+'</span></div>';
  h+='<div class="det-row"><span class="k">Client</span><span class="v">'+esc((cl&&cl.nom)||"—")+'</span></div>';
  if(cl&&(cl.email||cl.tel)) h+='<div class="det-row"><span class="k">Contact</span><span class="v">'+esc(cl.email||cl.tel)+'</span></div>';
  if(d.conditions) h+='<div class="det-row" style="flex-direction:column;align-items:stretch"><span class="k" style="margin-bottom:4px">Conditions</span><span class="v" style="text-align:left;font-weight:400;color:var(--ink)">'+esc(d.conditions)+'</span></div>';
  h+='</div>';
  h+='<div class="modal-actions"><button class="btn btn-primary" onclick="sendDevis(\\''+d.id+'\\')"><svg viewBox="0 0 24 24"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7Z"/></svg>Envoyer</button><button class="btn btn-ghost" onclick="openEditor(\\''+d.id+'\\')">Modifier</button><button class="btn btn-danger" style="flex:0 0 auto" onclick="delDevis(\\''+d.id+'\\')">Supprimer</button></div>';
  openModal(h);
}
async function dQuickStatut(id,k){ var d=findDevis(id); if(!d)return; var prev=d.statut; d.statut=k;
  document.querySelectorAll("#d-seg button").forEach(function(b){b.className="";b.style.background="";});
  var idx=["brouillon","envoye","accepte","refuse","expire"].indexOf(k); var btns=document.querySelectorAll("#d-seg button"); if(btns[idx]){btns[idx].className="on";btns[idx].style.background=DST[k].c;}
  try{ var up=await biltia.update("devis",id,{statut:k}); replaceDevis(up); biltia.notify("Statut mis à jour"); }catch(e){ d.statut=prev; }
}
async function delDevis(id){ var d=findDevis(id); if(!d)return; if(!confirm("Supprimer définitivement le devis « "+(d.numero||"")+" » ?"))return;
  try{ var rows=await biltia.list("lignes",{match:{devis_id:id},limit:400}).catch(function(){return[];}); for(var i=0;i<(rows||[]).length;i++){ try{ await biltia.remove("lignes",rows[i].id); }catch(e){} }
    await biltia.remove("devis",id); S.devis=S.devis.filter(function(x){return x.id!==id;}); biltia.notify("Devis supprimé"); closeModal(); render(); }catch(e){ biltia.notify("Suppression impossible"); }
}
function devisEmailBody(d,lignes,cl){
  var t=lignes.length?totals(lignes):{ht:num(d.montant_ht),tva:num(d.montant_tva),ttc:num(d.montant_ttc)};
  var who=(cl&&cl.nom)?cl.nom:"Madame, Monsieur";
  var L="Bonjour "+who+",\\n\\nVeuillez trouver ci-dessous notre devis "+(d.numero||"")+(d.chantier_id?" pour "+chantierName(d.chantier_id):"")+" :\\n\\n";
  lignes.forEach(function(l){ L+="- "+(l.designation||"")+" : "+(l.quantite!=null?l.quantite:1)+" "+(l.unite||"u")+" x "+money(l.prix_unitaire_ht)+" = "+money(lineTot(l))+" HT\\n"; });
  L+="\\nTotal HT : "+money(t.ht)+"\\nTVA : "+money(t.tva)+"\\nTotal TTC : "+money(t.ttc)+"\\n";
  if(d.date_validite) L+="\\nDevis valable jusqu\\'au "+fmtDate(d.date_validite)+".";
  if(d.conditions) L+="\\n"+d.conditions;
  L+="\\n\\nBien cordialement,\\n"+(S.entreprise||"");
  return L;
}
async function sendDevis(id){
  var d=findDevis(id); if(!d)return; var cl=findClient(d.client_id);
  if(!cl||!String(cl.email||"").trim()){ biltia.notify("Ajoutez l\\'email du client pour l\\'envoyer"); if(cl)openClient(cl.id); return; }
  var rows=await biltia.list("lignes",{match:{devis_id:id},order:"position",ascending:true}).catch(function(){return[];});
  biltia.notify("Envoi en cours…");
  try{
    await biltia.sendEmail({ to:cl.email, subject:"Votre devis "+(d.numero||"")+" — "+(S.entreprise||""), body:devisEmailBody(d,rows||[],cl) });
    biltia.notify("Devis envoyé à "+cl.email);
    if(d.statut==="brouillon"){ try{ var up=await biltia.update("devis",id,{statut:"envoye"}); replaceDevis(up); }catch(e){} closeModal(); render(); }
  }catch(e){ biltia.notify("Envoi impossible pour le moment"); }
}

/* ── Relecture des devis dictés ── */
function renderReview(){
  var h='<div class="view-pad">';
  var n=(S.parsed||[]).length;
  h+='<div class="card" style="display:flex;align-items:center;gap:12px;margin-bottom:14px"><span style="font-size:22px">🎙️</span><div><div style="font-weight:700">'+n+' devis reconnu'+(n>1?"s":"")+'</div><div style="font-size:12.5px;color:var(--mut)">Vérifiez le client et les montants, puis enregistrez. Rien n\\'est écrit tant que vous n\\'avez pas validé.</div></div></div>';
  (S.parsed||[]).forEach(function(d,k){
    var t=totals(d.lignes); var cname=clientName(d.client_id)||d._client_nom||"Client à préciser";
    h+='<div class="rv-card"><div class="rv-head"><div style="min-width:0"><div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(cname)+'</div><div style="font-size:12px;color:var(--mut)">'+d.lignes.length+' ligne'+(d.lignes.length>1?"s":"")+(d._chantier_nom?' · '+esc(d._chantier_nom):"")+'</div></div><span class="dcard-ttc">'+money(t.ttc)+'</span></div>';
    h+='<div class="fg" style="margin-bottom:10px"><select onchange="draftClient('+k+',this.value)">'+draftClientOpts(d)+'</select></div>';
    h+='<div class="rv-lines">'+d.lignes.slice(0,4).map(function(l){ return '<div class="dl-item"><div style="min-width:0"><div class="dl-des">'+esc(l.designation||"(prestation)")+'</div><div class="dl-meta">'+esc((l.quantite!=null?l.quantite:1)+" "+(l.unite||"u"))+' × '+money(l.prix_unitaire_ht)+'</div></div><div class="dl-tot">'+money(lineTot(l))+'</div></div>'; }).join("")+(d.lignes.length>4?'<div class="hint" style="padding-top:8px">+ '+(d.lignes.length-4)+' autre'+(d.lignes.length-4>1?"s":"")+'…</div>':'')+'</div>';
    h+='<div style="display:flex;gap:10px"><button class="btn btn-ghost btn-sm" style="flex:1" onclick="openDraftEditor('+k+')">Vérifier les lignes</button><button class="btn btn-danger" onclick="draftDiscard('+k+')">Retirer</button></div></div>';
  });
  h+='<div style="display:flex;gap:10px;margin-top:8px"><button class="btn btn-ghost" style="flex:0 0 auto" onclick="cancelReview()">Annuler</button><button class="btn btn-primary" style="flex:1" id="rv-save" onclick="saveAllDrafts()">Tout enregistrer ('+n+')</button></div>';
  h+='</div>'; $("view").innerHTML=h;
}
function draftClientOpts(d){ var o=""; if(!d.client_id&&d._client_nom){ o+='<option value="" selected>➕ Créer « '+esc(d._client_nom)+' »</option>'; } else { o+='<option value=""'+(!d.client_id?" selected":"")+'>— Choisir un client —</option>'; } S.clients.forEach(function(c){o+='<option value="'+c.id+'"'+(c.id===d.client_id?" selected":"")+'>'+esc(c.nom)+'</option>';}); o+='<option value="__new">➕ Autre nouveau client…</option>'; return o; }
function draftClient(k,v){ var d=S.parsed[k]; if(!d)return; if(v==="__new"){ var nm=prompt("Nom du client :",""); if(nm&&nm.trim()){ biltia.create("clients",{nom:nm.trim()}).then(function(c){ S.clients.push(c); S.clients.sort(function(a,b){return String(a.nom).localeCompare(String(b.nom));}); d.client_id=c.id; d._client_nom=""; renderReview(); biltia.notify("Client ajouté"); }).catch(function(){ renderReview(); }); } else { renderReview(); } } else if(v){ d.client_id=v; d._client_nom=""; } else { d.client_id=""; } }
function draftDiscard(k){ S.parsed.splice(k,1); if(!S.parsed.length){ cancelReview(); } else { renderReview(); } }
function cancelReview(){ S.parsed=null; S.reviewActive=false; S.view="devis"; renderNav(); render(); }
async function saveAllDrafts(){
  var b=$("rv-save"); if(b){b.disabled=true;b.textContent="Enregistrement…";}
  var drafts=S.parsed||[]; var done=0;
  for(var k=0;k<drafts.length;k++){
    var d=drafts[k];
    var valid=(d.lignes||[]).filter(function(l){return String(l.designation||"").trim();});
    if(!valid.length)continue;
    var cid=d.client_id;
    if(!cid){ var nm=String(d._client_nom||"").trim()||"Client"; try{ var c=await biltia.create("clients",{nom:nm}); S.clients.push(c); cid=c.id; }catch(e){} }
    var chid=d.chantier_id||null;
    if(!chid && String(d._chantier_nom||"").trim()){ try{ var ch=await biltia.create("chantiers",{nom:String(d._chantier_nom).trim(),client_id:cid||null,statut:"en_attente"}); S.chantiers.unshift(ch); chid=ch.id; }catch(e){} }
    var t=totals(valid);
    var payload={ numero:nextNumero(0), client_id:cid||null, chantier_id:chid, statut:"brouillon", date_devis:d.date_devis||todayISO(), date_validite:d.date_validite||null, montant_ht:round2(t.ht), montant_tva:round2(t.tva), montant_ttc:round2(t.ttc), conditions:d.conditions||null, notes:d.notes||null };
    try{ var row=await biltia.create("devis",payload); S.devis.unshift(row); await biltia.bulkCreate("lignes", valid.map(function(l,idx){ return { devis_id:row.id, designation:String(l.designation).trim(), quantite:num(l.quantite)||null, unite:l.unite||null, prix_unitaire_ht:num(l.prix_unitaire_ht)||null, taux_tva:num(l.taux_tva)||20, total_ht:round2(lineTot(l)), position:idx }; })); done++; }catch(e){}
  }
  S.parsed=null; S.reviewActive=false; S.view="devis"; renderNav(); render();
  biltia.notify(done?(done+" devis enregistré"+(done>1?"s":"")):"Aucun devis enregistré");
}

/* ── Dictée (MediaRecorder → parseDevis) ── */
var REC={rec:null,chunks:[],stream:null,timer:null,secs:0,cancel:false};
function dictate(){
  if(window.__biltiaDemo){ if(biltia.parseDevis)biltia.parseDevis(); return; }
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){ biltia.notify("Micro non disponible sur cet appareil"); return; }
  navigator.mediaDevices.getUserMedia({audio:true}).then(function(stream){
    REC.stream=stream; REC.chunks=[]; REC.secs=0; REC.cancel=false;
    var mr; try{ mr=new MediaRecorder(stream); }catch(e){ mr=null; }
    if(!mr){ stopTracks(); biltia.notify("Enregistrement non supporté"); return; }
    REC.rec=mr;
    mr.ondataavailable=function(e){ if(e.data&&e.data.size)REC.chunks.push(e.data); };
    mr.onstop=onRecStop;
    mr.start();
    S.recording=true; openRecModal();
    REC.timer=setInterval(function(){ REC.secs++; var el=$("rec-time"); if(el)el.textContent=fmtSecs(REC.secs); },1000);
  }).catch(function(){ biltia.notify("Autorisez le micro pour dicter votre devis"); });
}
function openRecModal(){
  openModal('<div class="recwrap"><div class="micbig live"><svg viewBox="0 0 24 24"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg></div><div class="rec-time" id="rec-time">00:00</div><div class="rec-hint">Dictez un ou plusieurs devis : « Devis pour M. Martin, rénovation salle de bain : dépose carrelage 45 m² à 18 €, pose à 42 €, un WC suspendu à 620 € »</div></div><div class="modal-actions"><button class="btn btn-ghost" onclick="stopRec(false)">Annuler</button><button class="btn btn-primary" onclick="stopRec(true)">Terminer</button></div>');
}
function stopTracks(){ try{ if(REC.stream)REC.stream.getTracks().forEach(function(t){t.stop();}); }catch(e){} REC.stream=null; }
function stopRec(save){
  if(REC.timer){clearInterval(REC.timer);REC.timer=null;}
  S.recording=false; REC.cancel=!save;
  try{ if(REC.rec&&REC.rec.state!=="inactive")REC.rec.stop(); }catch(e){}
  stopTracks();
  if(!save){ closeModal(); }
}
function onRecStop(){
  if(REC.cancel){ REC.cancel=false; return; }
  var blob=new Blob(REC.chunks,{type:(REC.rec&&REC.rec.mimeType)||"audio/webm"});
  if(!blob.size){ closeModal(); biltia.notify("Rien n\\'a été enregistré"); return; }
  openModal('<div class="recwrap"><div class="micbig"><div class="spin" style="margin:0"></div></div><div style="font-weight:700;font-size:16px">Analyse de votre dictée…</div><div class="rec-hint">Biltia rédige vos devis et calcule les totaux.</div></div>');
  var fr=new FileReader();
  fr.onload=function(){ biltia.parseDevis(fr.result).then(function(res){ onParsed(res); }).catch(function(){ closeModal(); biltia.notify("Dictée non comprise, réessayez plus clairement"); }); };
  fr.onerror=function(){ closeModal(); biltia.notify("Lecture de l\\'audio impossible"); };
  fr.readAsDataURL(blob);
}
function onParsed(res){
  closeModal();
  var arr=(res&&res.devis)||[];
  if(!arr.length){ biltia.notify("Aucun devis reconnu dans la dictée"); return; }
  S.parsed=arr.map(function(p){
    var lignes=((p.lignes)||[]).map(function(l){ return { designation:l.designation||"", quantite:(l.quantite!=null?l.quantite:1), unite:l.unite||"u", prix_unitaire_ht:(l.prix_unitaire_ht!=null?l.prix_unitaire_ht:""), taux_tva:(l.taux_tva!=null?l.taux_tva:20) }; });
    if(!lignes.length)lignes=[blankLine()];
    return { client_id:matchClient(p.client_nom), _client_nom:p.client_nom||"", chantier_id:"", _chantier_nom:p.chantier_nom||"", statut:"brouillon", date_devis:(p.date_devis||todayISO()), date_validite:plusDays(p.date_devis||todayISO(),30), conditions:"Devis valable 30 jours.", notes:p.notes||"", lignes:lignes };
  });
  S.reviewActive=true; renderNav(); render();
  try{window.scrollTo(0,0);}catch(e){}
}

/* ── Init ── */
function initBrand(){ if(!S.entreprise||S.entreprise.indexOf("__")===0)S.entreprise="Mon entreprise"; var eb=S.entreprise.toUpperCase().slice(0,22); ["side-eyebrow","hd-eyebrow","tb-eyebrow"].forEach(function(i){var el=$(i);if(el)el.textContent=eb;}); ["side-logo","hd-logo"].forEach(function(i){var el=$(i);if(el)el.textContent=initials(S.entreprise)||"B";}); }
var _rz;
function start(){ initBrand(); renderNav(); boot(); if(window.addEventListener)window.addEventListener("resize",function(){ if(_rz)clearTimeout(_rz); _rz=setTimeout(function(){ if(S.view==="dashboard")render(); },200); }); }
if(document.readyState!=="loading"){ start(); } else { document.addEventListener("DOMContentLoaded",start); }
${CHART_ENGINE_JS}
</script>
</body>
</html>`;
