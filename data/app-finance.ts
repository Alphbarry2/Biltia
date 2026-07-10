// ─────────────────────────────────────────────────────────────────────────────
// APP PHARE — FINANCE / RECOUVREMENT (« cockpit du cash »), multi-pages
//
// 3e app phare, REFAITE d'après la maquette validée par le user : cockpit DSO
// (cash bloqué + score + DSO + barre d'ancienneté), cartes d'insight, DEUX
// graphiques INTERACTIFS (survol → repère + point + infobulle, valeurs qui
// bougent, tracé/barres animés au chargement, chiffre-clé qui défile), puis la
// liste « clients qui bloquent votre cash » (relance / escalade).
// Design volontairement à part : banneau sombre à halo violet (PAS de card blanche
// à cercle coupé), identité VIOLETTE, courbe + barres animées.
//
// 4 vues : Tableau de bord (cockpit) · Factures · Budgets · Trésorerie.
// Branchée au workspace via window.biltia (factures · chantiers · clients · devis).
// Le SDK est injecté à l'instanciation — NE PAS l'inclure ici.
//
// Contrainte technique : PAS de template literals NI de backticks dans le JS de
// l'app (concaténation). Apostrophes françaises échappées \\'.
// ─────────────────────────────────────────────────────────────────────────────

export const APP_FINANCE_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Finance & recouvrement</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
img,svg,video,canvas{max-width:100%}
:root{--bg:#F6F6FB;--ink:#14121F;--mut:#5E5B70;--faint:#9A97AD;--line:#E8E7F0;--soft:#F0EFF7;
--vio:#6D5EF6;--grad:#6D5EF6;--glow:109,94,246;--tint:#EEEBFE;--tintline:#D6D0FB;--navy:#141227;
--shadow:0 1px 2px rgba(20,18,31,.04),0 6px 18px rgba(20,18,31,.05);--shadow-lg:0 14px 44px rgba(20,18,31,.14)}
body{background:var(--bg);font-family:'Inter',system-ui,sans-serif;color:var(--ink);font-size:14px;line-height:1.55;-webkit-font-smoothing:antialiased;overflow-x:hidden;overflow-wrap:break-word}
.card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:18px;overflow:hidden;box-shadow:var(--shadow)}
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
.badge-gray{background:#F1F1F7;color:#6A677C;border:1px solid #E8E7F0}
input,select,textarea{font-family:inherit;font-size:16px;color:var(--ink);background:#fff;border:1px solid #DEDCEC;border-radius:12px;padding:10px 14px;width:100%;outline:none;transition:border .15s,box-shadow .15s}
input:focus,select:focus,textarea:focus{border-color:var(--vio);box-shadow:0 0 0 3px rgba(var(--glow),.14)}
input::placeholder,textarea::placeholder{color:#9A97AD}
input.invalid,select.invalid{border-color:#E11D48;box-shadow:0 0 0 3px rgba(225,29,72,.12)}
.shell{display:flex;min-height:100vh}
.sidebar{display:none}
.app-main{flex:1;min-width:0;padding:0 0 90px}
.app-header{position:fixed;top:0;left:0;right:0;z-index:100;background:rgba(246,246,251,.85);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-bottom:1px solid var(--line);height:60px;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 14px}
.brand{display:flex;align-items:center;gap:10px;min-width:0}
.brand-logo{width:30px;height:30px;border-radius:9px;background:var(--grad);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:14px;flex-shrink:0}
.app-eyebrow{font-size:10px;font-weight:700;color:var(--vio);text-transform:uppercase;letter-spacing:.12em;display:block;line-height:1.2}
.app-title{font-size:15px;font-weight:800;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px;line-height:1.2}
.mtop{height:60px}
.tab-bar{position:fixed;bottom:0;left:0;right:0;background:rgba(246,246,251,.94);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-top:1px solid var(--line);display:flex;z-index:100}
.tab-item{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:8px 4px 10px;cursor:pointer;border:none;background:none;font-size:10px;font-weight:600;color:#9A97AD;font-family:inherit;min-height:56px}
.tab-item.active{color:var(--vio)}
.tab-ic{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.fab{position:fixed;right:16px;bottom:78px;z-index:120;width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;color:#fff;font-size:28px;line-height:1;background:var(--grad);box-shadow:0 8px 22px rgba(var(--glow),.30);display:flex;align-items:center;justify-content:center}
.fab:active{transform:scale(.94)}
.view-pad{padding:16px}
.topbar{display:none}
.section-h{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:22px 2px 12px}
.section-h b{font-size:15px;font-weight:700}
.section-h .link{font-size:12px;font-weight:600;color:var(--vio);cursor:pointer;background:none;border:none}
.list{display:flex;flex-direction:column;gap:10px}
.row{display:flex;align-items:center;gap:12px;padding:14px 16px;background:#fff;border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);cursor:pointer;text-align:left;width:100%;transition:box-shadow .15s,border-color .15s}
.row:hover{box-shadow:0 6px 20px rgba(20,18,31,.07);border-color:var(--tintline)}
.avatar{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:#fff;flex-shrink:0}
.row-mid{flex:1;min-width:0}
.row-mid .n{display:block;font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.row-mid .s{display:block;font-size:12px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
.row-end{display:flex;flex-direction:column;align-items:flex-end;gap:5px;flex-shrink:0}
.amt{font-weight:800;font-size:14px;font-variant-numeric:tabular-nums;white-space:nowrap}
.chips{display:flex;gap:8px;flex-wrap:wrap;padding:0 2px 4px}
.chip{border:1px solid var(--line);background:#fff;color:var(--mut);font-weight:600;font-size:12.5px;padding:7px 13px;border-radius:9999px;cursor:pointer;white-space:nowrap}
.chip.on{background:var(--ink);color:#fff;border-color:var(--ink)}
.searchwrap{position:relative;margin-bottom:12px}
.searchwrap svg{position:absolute;left:13px;top:50%;transform:translateY(-50%);width:16px;height:16px;stroke:var(--faint);fill:none;stroke-width:2}
.searchwrap input{padding-left:38px}
.empty{text-align:center;padding:52px 20px}
.empty-ico{width:54px;height:54px;border-radius:16px;background:var(--tint);color:var(--vio);display:flex;align-items:center;justify-content:center;margin:0 auto 14px;font-size:24px}
.empty-title{font-weight:700;margin-bottom:4px}
.empty-sub{font-size:13px;color:var(--mut);margin-bottom:16px}
.spin{width:26px;height:26px;border:3px solid var(--line);border-top-color:var(--vio);border-radius:50%;animation:sp .7s linear infinite;margin:60px auto}
@keyframes sp{to{transform:rotate(360deg)}}
/* ── COCKPIT (sombre, halo violet ; PAS de cercle coupé) ── */
.cockpit{background:radial-gradient(130% 120% at 88% -20%, rgba(124,92,252,.42), rgba(20,18,39,0) 55%),#141227;border-radius:22px;padding:22px 24px 18px;color:#fff;box-shadow:0 14px 38px rgba(20,18,39,.28)}
.cockpit-top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
.ck-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#F0A3B4;display:flex;align-items:center;gap:7px}
.ck-label::before{content:"";width:7px;height:7px;border-radius:50%;background:#F0576F;box-shadow:0 0 8px #F0576F}
.ck-value{font-size:40px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums;margin-top:6px;line-height:1.05}
.ck-sub{font-size:12.5px;color:#A29FC0;margin-top:5px}.ck-sub b{color:#DAD7EE;font-weight:700}
.ck-right{display:flex;align-items:center;gap:12px;flex-shrink:0}
.dso-pill{border:1px solid rgba(255,255,255,.2);color:#E7E4F6;padding:6px 12px;border-radius:10px;font-size:12px;font-weight:700;white-space:nowrap}
.aging{display:flex;height:9px;border-radius:5px;overflow:hidden;margin-top:18px;background:rgba(255,255,255,.08)}
.aging>span{display:block;height:100%;transition:width .8s cubic-bezier(.2,.8,.2,1)}
.aging-leg{display:flex;flex-wrap:wrap;gap:8px 16px;margin-top:11px}
.aging-leg .it{display:flex;align-items:center;gap:6px;font-size:11px;color:#B4B1D0}
.aging-leg .d{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.aging-leg b{color:#fff;font-weight:700}
/* Insights */
.insight{display:flex;align-items:center;gap:12px;background:#fff;border:1px solid var(--line);border-left-width:3px;border-radius:14px;padding:13px 16px;box-shadow:var(--shadow);margin-top:12px}
.insight .ic{width:30px;height:30px;border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:15px;font-weight:800}
.insight.warn{border-left-color:#F59E0B}.insight.warn .ic{background:#FFF7ED;color:#B45309}
.insight.ok{border-left-color:#22C55E}.insight.ok .ic{background:#ECFDF5;color:#059669}
.insight p{font-size:13.5px}.insight b{font-weight:700}
/* Graphiques interactifs */
.charts-2{display:grid;grid-template-columns:1fr;gap:12px;margin-top:14px}
@media(min-width:760px){.charts-2{grid-template-columns:1fr 1fr}}
.chart-card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:16px 16px 12px;box-shadow:var(--shadow)}
.chart-hd{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px}
.chart-hd b{font-size:14px}.chart-hd .rd{font-size:12px;color:var(--faint);font-variant-numeric:tabular-nums}
.chart-host{touch-action:pan-y}
.chart-rel{position:relative}
.chart-rel svg{display:block;width:100%}
.chart-tip{position:absolute;pointer-events:none;background:#141227;color:#fff;border-radius:9px;padding:6px 10px;font-size:11.5px;line-height:1.25;white-space:nowrap;transition:opacity .12s;box-shadow:0 8px 20px rgba(0,0,0,.24);z-index:6}
.chart-tip b{display:block;font-weight:800;font-variant-numeric:tabular-nums;font-size:12.5px}
.chart-tip span{color:#B7B3D6;font-size:10px}
.chart-x{display:flex;justify-content:space-between;padding:0 2px;margin-top:6px}
.chart-x span{font-size:9.5px;color:var(--faint);flex:1;text-align:center}
.bar{cursor:pointer;transition:opacity .15s}
/* Débiteurs */
.deb{display:flex;align-items:center;gap:13px;padding:14px 2px;border-bottom:1px solid var(--soft)}
.deb:last-child{border-bottom:none}
.deb .mid{flex:1;min-width:0}
.deb .nm{font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.deb .mt{font-size:12px;color:var(--mut);margin:2px 0 8px}
.deb .ul{height:3px;border-radius:2px;background:#EEEDF5;overflow:hidden}
.deb .ul>span{display:block;height:100%;border-radius:2px;transition:width .7s cubic-bezier(.2,.8,.2,1)}
.deb .end{display:flex;flex-direction:column;align-items:flex-end;gap:5px;flex-shrink:0}
.deb .amt2{font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap}
.deb .act{font-size:12px;font-weight:600;color:var(--vio);cursor:pointer;background:none;border:none}
.deb-badge{font-size:11px;font-weight:600;padding:3px 9px;border-radius:9999px;white-space:nowrap;display:inline-flex;align-items:center;gap:5px}
.deb-badge .d{width:6px;height:6px;border-radius:50%}
/* Budgets */
.bud-row{background:#fff;border:1px solid var(--line);border-radius:15px;padding:15px 16px;box-shadow:var(--shadow);margin-bottom:10px;cursor:pointer;text-align:left;width:100%}
.bud-row:hover{border-color:var(--tintline);box-shadow:0 6px 18px rgba(20,18,31,.07)}
.bud-top{display:flex;justify-content:space-between;align-items:baseline;gap:10px}
.bud-name{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.bud-marge{font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap}
.bud-track{height:9px;background:#EDECF5;border-radius:5px;overflow:hidden;margin:11px 0 8px}
.bud-fill{height:100%;border-radius:5px;transition:width .6s}
.bud-meta{display:flex;justify-content:space-between;gap:10px;font-size:12px;color:var(--mut)}
.strip{display:flex;background:#fff;border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);margin-top:12px;overflow:hidden}
.strip-cell{flex:1;padding:14px 15px;min-width:0}
.strip-cell+.strip-cell{border-left:1px solid var(--line)}
.strip-k{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--faint)}
.strip-v{font-size:19px;font-weight:800;font-variant-numeric:tabular-nums;margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.strip-s{font-size:11px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
@media(max-width:380px){.strip-v{font-size:16px}.strip-cell{padding:12px 10px}}
.donut-wrap{display:flex;align-items:center;gap:20px;flex-wrap:wrap;justify-content:center}
.legend{display:flex;flex-direction:column;gap:9px;min-width:150px}
.legend-i{display:flex;align-items:center;gap:9px;font-size:12.5px}
.legend-sw{width:11px;height:11px;border-radius:4px;flex-shrink:0}.legend-i .lv{margin-left:auto;font-weight:700;font-variant-numeric:tabular-nums}
/* Modale */
.overlay{position:fixed;inset:0;background:rgba(12,10,22,.46);backdrop-filter:blur(6px);z-index:200;display:flex;align-items:flex-end;justify-content:center}
.overlay[hidden]{display:none}
@media(min-width:600px){.overlay{align-items:center;padding:20px}}
.modal{background:#fff;border-radius:24px 24px 0 0;width:100%;max-width:580px;max-height:92vh;overflow-y:auto;padding:22px 20px calc(22px + env(safe-area-inset-bottom));box-shadow:var(--shadow-lg)}
@media(min-width:600px){.modal{border-radius:24px}}
.modal-h{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px}
.modal-title{font-size:18px;font-weight:800;letter-spacing:-.01em}
.modal-sub{font-size:12.5px;color:var(--mut);margin-top:2px}
.x{border:none;background:var(--soft);width:34px;height:34px;border-radius:10px;color:var(--mut);font-size:18px;cursor:pointer;flex-shrink:0}
.fg{margin-bottom:14px}
.fl{display:block;font-size:11px;font-weight:700;color:#5E5B70;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media(max-width:480px){.form-row{grid-template-columns:1fr}}
.seg{display:flex;flex-wrap:wrap;gap:6px}
.seg button{border:1px solid var(--line);background:#fff;color:var(--mut);font-weight:600;font-size:12px;padding:8px 12px;border-radius:10px;cursor:pointer;font-family:inherit}
.seg button.on{color:#fff;border-color:transparent}
.modal-actions{display:flex;gap:10px;margin-top:20px;flex-wrap:wrap}
.modal-actions .btn{flex:1}
.totbox{background:var(--soft);border-radius:16px;padding:14px 16px;margin-top:4px}
.totrow{display:flex;justify-content:space-between;align-items:center;padding:5px 0;font-size:13.5px;color:var(--mut)}
.totrow .v{color:var(--ink);font-weight:600;font-variant-numeric:tabular-nums}
.totrow.grand{font-size:18px;font-weight:800;color:var(--ink);border-top:1px solid var(--tintline);margin-top:6px;padding-top:11px}
.det-sec{margin-top:18px}.det-sec .fl{margin-bottom:8px}
.det-row{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid var(--soft);font-size:13px}
.det-row:last-child{border-bottom:none}.det-row .k{color:var(--mut)}.det-row .v{font-weight:600;text-align:right}
.pay-bar{height:9px;background:#EDECF5;border-radius:5px;overflow:hidden;margin:8px 0 6px}
.pay-fill{height:100%;background:var(--vio);border-radius:5px}
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
  .topbar-actions{display:flex;gap:10px}
  .view-pad{padding:16px 32px}
  .ck-value{font-size:46px}
}
@media(max-width:400px){.view-pad{padding:13px}.cockpit{padding:18px 16px 14px}.ck-value{font-size:32px}.app-title{max-width:120px}.btn{padding:11px 15px}}
@media(min-width:1600px){.topbar,.view-pad{max-width:1520px;margin-left:auto;margin-right:auto}}
@media print{.sidebar,.app-header,.tab-bar,.fab,.no-print{display:none!important}}
</style>
</head>
<body>
<div class="shell">
  <aside class="sidebar">
    <div class="side-brand"><span class="brand-logo" id="side-logo">B</span><div style="min-width:0"><span class="app-eyebrow" id="side-eyebrow">BILTIA</span><span class="app-title" id="side-title">Finance</span></div></div>
    <nav class="side-nav" id="side-nav"></nav>
  </aside>
  <div class="app-main">
    <header class="app-header">
      <div class="brand"><span class="brand-logo" id="hd-logo">B</span><div style="min-width:0"><span class="app-eyebrow" id="hd-eyebrow">BILTIA</span><span class="app-title">Finance</span></div></div>
      <button class="btn btn-primary btn-sm" id="hd-add" onclick="primaryAdd()">+ Facture</button>
    </header>
    <div class="mtop"></div>
    <div class="topbar">
      <div><span class="app-eyebrow" id="tb-eyebrow">BILTIA</span><div id="tb-title" style="font-size:22px;font-weight:800;letter-spacing:-.02em">Tableau de bord</div></div>
      <div class="topbar-actions"><button class="btn btn-primary" id="tb-add" onclick="primaryAdd()">+ Nouvelle facture</button></div>
    </div>
    <main id="view"><div class="spin"></div></main>
  </div>
</div>
<nav class="tab-bar" id="tab-bar"></nav>
<button class="fab" onclick="primaryAdd()" aria-label="Ajouter">+</button>
<div class="overlay" id="ovl" hidden><div class="modal" id="modal"></div></div>

<script>
var S={ view:"dashboard", factures:[], chantiers:[], clients:[], devis:[], renta:{}, entreprise:"__ENTREPRISE__", filter:"tous", search:"", edit:null };
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
function moneyK(n){n=num(n);var s=n<0?"-":"";n=Math.abs(n);if(n>=1000)return s+(Math.round(n/100)/10).toLocaleString("fr-FR")+" k€";return s+Math.round(n).toLocaleString("fr-FR")+" €";}
function initials(s){var w=String(s||"?").trim().split(/\\s+/);return ((w[0]||"?")[0]+(w[1]?w[1][0]:"")).toUpperCase();}
var AV=["#6D5EF6","#4F46E5","#DB2777","#0284C7","#D97706","#0D9488","#7C3AED","#DC2626"];
function avc(seed){var s=String(seed||""),h=0;for(var i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;return AV[h%AV.length];}
var MONTHS=["janv.","févr.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc."];
function lastMonths(n){var out=[];var d=new Date();for(var i=n-1;i>=0;i--){var dd=new Date(d.getFullYear(),d.getMonth()-i,1);out.push({key:dd.getFullYear()+"-"+pad2(dd.getMonth()+1),label:MONTHS[dd.getMonth()]});}return out;}

var FST={ brouillon:{l:"Brouillon",b:"badge-gray",c:"#9A97AD"}, envoyee:{l:"Envoyée",b:"badge-accent",c:"var(--vio)"}, payee:{l:"Payée",b:"badge-green",c:"#059669"}, partiellement_payee:{l:"Partielle",b:"badge-amber",c:"#B45309"}, en_retard:{l:"En retard",b:"badge-red",c:"#E11D48"}, annulee:{l:"Annulée",b:"badge-gray",c:"#9A97AD"} };
function reste(f){return Math.max(0,num(f.montant_ttc)-num(f.montant_paye));}
function isOverdue(f){ if(f.statut==="payee"||f.statut==="annulee"||f.statut==="brouillon")return false; if(f.statut==="en_retard")return true; var dd=daysTo(f.date_echeance); return dd!==null&&dd<0&&reste(f)>0; }
function fStat(f){ if(isOverdue(f))return FST.en_retard; return FST[f.statut]||FST.brouillon; }
function daysLate(f){ var d=daysTo(f.date_echeance); return d==null?0:Math.max(0,-d); }
function clientName(id){for(var i=0;i<S.clients.length;i++)if(S.clients[i].id===id)return S.clients[i].nom;return "";}
function findClient(id){for(var i=0;i<S.clients.length;i++)if(S.clients[i].id===id)return S.clients[i];return null;}
function chantierName(id){for(var i=0;i<S.chantiers.length;i++)if(S.chantiers[i].id===id)return S.chantiers[i].nom;return "";}
function findChantier(id){for(var i=0;i<S.chantiers.length;i++)if(S.chantiers[i].id===id)return S.chantiers[i];return null;}
function findFacture(id){for(var i=0;i<S.factures.length;i++)if(S.factures[i].id===id)return S.factures[i];return null;}
function replaceFacture(up){if(!up||!up.id)return;for(var i=0;i<S.factures.length;i++)if(S.factures[i].id===up.id)S.factures[i]=up;}
function facturesActives(){return S.factures.filter(function(f){return f.statut!=="annulee";});}
function unpaid(){return facturesActives().filter(function(f){return f.statut!=="brouillon"&&reste(f)>0;});}
function cashBloque(){return unpaid().reduce(function(s,f){return s+reste(f);},0);}
function totalEncaisse(){return S.factures.reduce(function(s,f){return s+num(f.montant_paye);},0);}
function nextNumero(){var y=new Date().getFullYear();var pre="F-"+y+"-";var max=0;S.factures.forEach(function(f){var n=String(f.numero||"");if(n.indexOf(pre)===0){var v=parseInt(n.slice(pre.length),10);if(isFinite(v)&&v>max)max=v;}});return pre+pad3(max+1);}

/* Ancienneté / DSO / score */
function agingBuckets(){ var b=[{k:"0-30",l:"0 à 30 j",c:"#16A34A",v:0},{k:"30-60",l:"30 à 60 j",c:"#F59E0B",v:0},{k:"60-90",l:"60 à 90 j",c:"#F97316",v:0},{k:"90+",l:"90 j et +",c:"#EF4444",v:0}]; unpaid().forEach(function(f){ var dl=daysLate(f),r=reste(f); if(dl<=30)b[0].v+=r; else if(dl<=60)b[1].v+=r; else if(dl<=90)b[2].v+=r; else b[3].v+=r; }); return b; }
function dso(){ var ar=cashBloque(); if(ar<=0)return 0; var since=plusDays(todayISO(),-365); var ca=facturesActives().filter(function(f){return String(f.date_facture||"")>=since;}).reduce(function(s,f){var v=num(f.montant_ttc);return s+(f.type==="avoir"?-v:v);},0); if(ca<=0)return 0; return Math.round(ar/(ca/365)); }
function healthScore(){ var d=dso(); var cb=cashBloque(); var overSum=unpaid().filter(function(f){return daysLate(f)>0;}).reduce(function(s,f){return s+reste(f);},0); var overRatio=cb>0?overSum/cb:0; var s=100-Math.max(0,(d-30))*1.1-overRatio*36; if(cb<=0)s=96; return Math.max(3,Math.min(99,Math.round(s))); }
function debtors(){ var m={},order=[]; unpaid().forEach(function(f){ var id=f.client_id||"?"; if(!m[id]){m[id]={id:id,nom:clientName(id)||"Client",reste:0,nb:0,maxLate:0};order.push(id);} m[id].reste+=reste(f); m[id].nb++; if(daysLate(f)>m[id].maxLate)m[id].maxLate=daysLate(f); }); return order.map(function(k){return m[k];}).sort(function(a,b){return b.reste-a.reste;}); }
function sevOf(late){ if(late>=60)return {c:"#DC2626",bg:"#FEF2F2",badge:"Silence relance",act:"Escalade"}; if(late>=30)return {c:"#EA580C",bg:"#FFF7ED",badge:"Retard",act:"Relancer"}; if(late>0)return {c:"#D97706",bg:"#FFFBEB",badge:"Retard",act:"Relancer"}; return {c:"#2563EB",bg:"#EFF6FF",badge:"Simple",act:"Relancer"}; }
function recouvrementMonthly(){ return lastMonths(6).map(function(m){ var fs=facturesActives().filter(function(f){return String(f.date_facture||"").slice(0,7)===m.key;}); var t=fs.reduce(function(s,f){return s+num(f.montant_ttc);},0); var p=fs.reduce(function(s,f){return s+num(f.montant_paye);},0); return {label:m.label,value:t>0?Math.round(p/t*100):0}; }); }
function encaisseMonthly(n){ return lastMonths(n||6).map(function(m){ var p=facturesActives().filter(function(f){return String(f.date_facture||"").slice(0,7)===m.key;}).reduce(function(s,f){return s+num(f.montant_paye);},0); return {label:m.label,value:p}; }); }
function encCumule(){ var e=encaisseMonthly(8),c=0; return e.map(function(x){c+=x.value;return {label:x.label,value:c};}); }

/* ── Moteur de graphiques (interactif + animé, zéro dépendance) ── */
function anim(fn){ if(window.requestAnimationFrame)window.requestAnimationFrame(fn); else fn(); }
function countUp(el,to,fmt,dur){ if(!el)return; to=num(to); if(!window.requestAnimationFrame){ el.textContent=fmt?fmt(to):Math.round(to); return; } dur=dur||900; var t0=null; function step(ts){ if(t0==null)t0=ts; var p=Math.min(1,(ts-t0)/dur),e=1-Math.pow(1-p,3),v=to*e; el.textContent=fmt?fmt(v):Math.round(v); if(p<1)window.requestAnimationFrame(step); } window.requestAnimationFrame(step); }
function chartGeom(host,series,H,pt,pb){ var W=Math.max(60,host.clientWidth||host.offsetWidth||320); var pl=6,pr=6,n=series.length; var vals=series.map(function(s){return num(s.value);}); var max=Math.max.apply(null,vals.concat([1])); if(max<=0)max=1; var iw=W-pl-pr,ih=H-pt-pb; function X(i){return pl+(n<=1?iw/2:iw*i/(n-1));} function Y(v){return pt+ih-(num(v)/max)*ih;} return {W:W,H:H,pl:pl,pr:pr,pt:pt,pb:pb,n:n,iw:iw,ih:ih,max:max,X:X,Y:Y}; }
function drawArea(host,series,opt){
  if(!host)return; opt=opt||{}; var color=opt.color||"#7C6BF5", fmt=opt.fmt||moneyK, unit=opt.unit||"";
  var g=chartGeom(host,series,opt.h||150,16,22), pts=series.map(function(s,i){return {x:g.X(i),y:g.Y(s.value),v:num(s.value),label:s.label};});
  var line=pts.map(function(p,i){return (i?"L":"M")+p.x.toFixed(1)+" "+p.y.toFixed(1);}).join(" ");
  var base=(g.pt+g.ih).toFixed(1);
  var area="M"+pts[0].x.toFixed(1)+" "+base+" "+pts.map(function(p){return "L"+p.x.toFixed(1)+" "+p.y.toFixed(1);}).join(" ")+" L"+pts[g.n-1].x.toFixed(1)+" "+base+" Z";
  var gid="ag"+(opt.id||"");
  var svg='<svg width="'+g.W+'" height="'+g.H+'" viewBox="0 0 '+g.W+' '+g.H+'">'
    +'<defs><linearGradient id="'+gid+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="'+color+'" stop-opacity="0.24"/><stop offset="1" stop-color="'+color+'" stop-opacity="0"/></linearGradient></defs>'
    +'<line x1="'+g.pl+'" y1="'+g.pt.toFixed(1)+'" x2="'+(g.W-g.pr)+'" y2="'+g.pt.toFixed(1)+'" stroke="#0000000d"/>'
    +'<line x1="'+g.pl+'" y1="'+(g.pt+g.ih/2).toFixed(1)+'" x2="'+(g.W-g.pr)+'" y2="'+(g.pt+g.ih/2).toFixed(1)+'" stroke="#00000008"/>'
    +'<path d="'+area+'" fill="url(#'+gid+')" class="ar-area" style="opacity:0"/>'
    +'<path d="'+line+'" fill="none" stroke="'+color+'" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" class="ar-line"/>'
    +'<line class="ar-g" x1="0" y1="'+g.pt.toFixed(1)+'" x2="0" y2="'+base+'" stroke="'+color+'" stroke-width="1" stroke-dasharray="3 3" style="opacity:0"/>'
    +'<circle class="ar-d" r="5" fill="#fff" stroke="'+color+'" stroke-width="2.5" style="opacity:0"/></svg>';
  host.innerHTML='<div class="chart-rel">'+svg+'<div class="chart-tip" style="opacity:0"></div></div><div class="chart-x">'+series.map(function(s){return '<span>'+esc(s.label)+'</span>';}).join("")+'</div>';
  var svgEl=host.querySelector("svg"),gl=host.querySelector(".ar-g"),dot=host.querySelector(".ar-d"),tip=host.querySelector(".chart-tip"),ln=host.querySelector(".ar-line"),ar=host.querySelector(".ar-area");
  anim(function(){ if(ar)ar.style.transition="opacity .6s ease"; if(ar)ar.style.opacity="1"; try{ var L=ln.getTotalLength(); ln.style.strokeDasharray=L; ln.style.strokeDashoffset=L; ln.getBoundingClientRect&&ln.getBoundingClientRect(); ln.style.transition="stroke-dashoffset .9s ease"; ln.style.strokeDashoffset="0"; }catch(e){} });
  function show(i){ var p=pts[i]; if(!p)return; gl.setAttribute("x1",p.x);gl.setAttribute("x2",p.x);gl.style.opacity="1"; dot.setAttribute("cx",p.x);dot.setAttribute("cy",p.y);dot.style.opacity="1"; if(tip){ tip.innerHTML='<b>'+fmt(p.v)+unit+'</b><span>'+esc(p.label)+'</span>'; tip.style.opacity="1"; var tw=tip.offsetWidth||64; tip.style.left=Math.max(2,Math.min(g.W-tw-2,p.x-tw/2))+"px"; tip.style.top=Math.max(0,p.y-46)+"px"; } if(opt.rd){var r=$(opt.rd);if(r)r.textContent=fmt(p.v)+unit;} }
  function hide(){ gl.style.opacity="0";dot.style.opacity="0";if(tip)tip.style.opacity="0"; if(opt.rd&&opt.rdDef!=null){var r=$(opt.rd);if(r)r.textContent=opt.rdDef;} }
  function at(cx){ if(!svgEl.getBoundingClientRect)return; var rc=svgEl.getBoundingClientRect(); var fx=(cx-rc.left)/(rc.width||g.W); show(Math.max(0,Math.min(g.n-1,Math.round(fx*(g.n-1))))); }
  if(svgEl.addEventListener){ svgEl.addEventListener("pointermove",function(e){at(e.clientX);}); svgEl.addEventListener("pointerdown",function(e){at(e.clientX);}); svgEl.addEventListener("pointerleave",hide); svgEl.addEventListener("touchmove",function(e){if(e.touches&&e.touches[0])at(e.touches[0].clientX);},{passive:true}); }
}
function drawBars(host,series,opt){
  if(!host)return; opt=opt||{}; var c1=opt.color||"#7C5CFC", c2=opt.color2||"#A78BFA", fmt=opt.fmt||moneyK, unit=opt.unit||"";
  var g=chartGeom(host,series,opt.h||150,12,22);
  var slot=g.iw/g.n, bw=Math.min(46,slot*0.56); if(bw<5)bw=Math.max(4,slot*0.6);
  var bars=series.map(function(s,i){ var h=(num(s.value)/g.max)*g.ih; var x=g.pl+i*slot+(slot-bw)/2; return {x:x,y:g.pt+g.ih-h,h:h,bw:bw,v:num(s.value),label:s.label,base:g.pt+g.ih}; });
  var gid="bg"+(opt.id||"");
  var rects=bars.map(function(b,i){return '<rect class="bar" data-i="'+i+'" x="'+b.x.toFixed(1)+'" y="'+b.base.toFixed(1)+'" width="'+b.bw.toFixed(1)+'" height="0" rx="5" fill="url(#'+gid+')"/>';}).join("");
  var svg='<svg width="'+g.W+'" height="'+g.H+'" viewBox="0 0 '+g.W+' '+g.H+'"><defs><linearGradient id="'+gid+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="'+c2+'"/><stop offset="1" stop-color="'+c1+'"/></linearGradient></defs>'+rects+'</svg>';
  host.innerHTML='<div class="chart-rel">'+svg+'<div class="chart-tip" style="opacity:0"></div></div><div class="chart-x">'+series.map(function(s){return '<span>'+esc(s.label)+'</span>';}).join("")+'</div>';
  var svgEl=host.querySelector("svg"),tip=host.querySelector(".chart-tip"),rs=host.querySelectorAll(".bar");
  anim(function(){ for(var i=0;i<rs.length;i++){ (function(el,b){ if(el.style){el.style.transition="y .7s cubic-bezier(.2,.8,.2,1),height .7s cubic-bezier(.2,.8,.2,1)";} el.setAttribute("y",b.y.toFixed(1)); el.setAttribute("height",Math.max(0,b.h).toFixed(1)); })(rs[i],bars[i]); } });
  function show(i){ var b=bars[i]; if(!b)return; for(var k=0;k<rs.length;k++)if(rs[k].style)rs[k].style.opacity=(k===i?"1":"0.45"); if(tip){ tip.innerHTML='<b>'+fmt(b.v)+unit+'</b><span>'+esc(b.label)+'</span>'; tip.style.opacity="1"; var tw=tip.offsetWidth||60; tip.style.left=Math.max(2,Math.min(g.W-tw-2,b.x+b.bw/2-tw/2))+"px"; tip.style.top=Math.max(0,b.y-46)+"px"; } if(opt.rd){var r=$(opt.rd);if(r)r.textContent=fmt(b.v)+unit;} }
  function hide(){ for(var k=0;k<rs.length;k++)if(rs[k].style)rs[k].style.opacity="1"; if(tip)tip.style.opacity="0"; if(opt.rd&&opt.rdDef!=null){var r=$(opt.rd);if(r)r.textContent=opt.rdDef;} }
  function at(cx){ if(!svgEl.getBoundingClientRect)return; var rc=svgEl.getBoundingClientRect(); var fx=(cx-rc.left)/(rc.width||g.W); show(Math.max(0,Math.min(g.n-1,Math.floor(fx*g.n)))); }
  if(svgEl.addEventListener){ svgEl.addEventListener("pointermove",function(e){at(e.clientX);}); svgEl.addEventListener("pointerdown",function(e){at(e.clientX);}); svgEl.addEventListener("pointerleave",hide); svgEl.addEventListener("touchmove",function(e){if(e.touches&&e.touches[0])at(e.touches[0].clientX);},{passive:true}); }
}
function drawGauge(host,score){
  if(!host)return; score=Math.max(0,Math.min(100,Math.round(score))); var size=94,r=(size/2)-8,cx=size/2,cy=size/2,C=2*Math.PI*r;
  var col=score>=66?"#22C55E":score>=40?"#F59E0B":"#F97316";
  host.innerHTML='<svg width="'+size+'" height="'+size+'" viewBox="0 0 '+size+' '+size+'">'
    +'<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="8"/>'
    +'<circle class="ga-a" cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="'+col+'" stroke-width="8" stroke-linecap="round" stroke-dasharray="'+C.toFixed(1)+'" stroke-dashoffset="'+C.toFixed(1)+'" transform="rotate(-90 '+cx+' '+cy+')"/>'
    +'<text class="ga-n" x="'+cx+'" y="'+(cy+1)+'" text-anchor="middle" font-size="21" font-weight="800" fill="#fff">0</text>'
    +'<text x="'+cx+'" y="'+(cy+15)+'" text-anchor="middle" font-size="8" letter-spacing="1.5" fill="rgba(255,255,255,.5)">SCORE</text></svg>';
  var arc=host.querySelector(".ga-a"),numEl=host.querySelector(".ga-n");
  anim(function(){ if(arc&&arc.style){arc.style.transition="stroke-dashoffset 1s ease";arc.style.strokeDashoffset=(C*(1-score/100)).toFixed(1);} });
  countUp(numEl,score,null,1000);
}
function donut(parts){
  var size=140,r=54,cx=size/2,cy=size/2,sw=19,C=2*Math.PI*r,total=parts.reduce(function(s,p){return s+p.value;},0),off=0,seg="";
  if(total<=0){ seg='<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="#EDECF5" stroke-width="'+sw+'"/>'; }
  else parts.forEach(function(p){ if(p.value<=0)return; var len=p.value/total*C; seg+='<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="'+p.color+'" stroke-width="'+sw+'" stroke-dasharray="'+len.toFixed(2)+' '+(C-len).toFixed(2)+'" stroke-dashoffset="'+(-off).toFixed(2)+'" transform="rotate(-90 '+cx+' '+cy+')"/>'; off+=len; });
  return '<svg viewBox="0 0 '+size+' '+size+'" width="140" height="140" style="flex-shrink:0">'+seg+'<text x="'+cx+'" y="'+(cy-2)+'" text-anchor="middle" font-size="16" font-weight="800" fill="#14121F">'+esc(moneyK(total))+'</text><text x="'+cx+'" y="'+(cy+15)+'" text-anchor="middle" font-size="9.5" fill="#9A97AD">encours</text></svg>';
}

var NAV=[
  {id:"dashboard",label:"Tableau de bord",icon:'<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'},
  {id:"factures",label:"Factures",icon:'<path d="M5 3h14v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6"/><path d="M9 12h6"/>'},
  {id:"budgets",label:"Budgets",icon:'<path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="6" rx="1"/><rect x="12" y="7" width="3" height="10" rx="1"/><rect x="17" y="13" width="3" height="4" rx="1"/>'},
  {id:"tresorerie",label:"Trésorerie",icon:'<path d="M3 17l6-6 4 4 8-8"/><path d="M17 7h4v4"/>'}
];

async function boot(){
  try{
    var r=await Promise.all([
      biltia.list("factures",{order:"date_facture",ascending:false,limit:800}).catch(function(){return[];}),
      biltia.list("chantiers",{order:"created_at",ascending:false,limit:600}).catch(function(){return[];}),
      biltia.list("clients",{order:"nom",ascending:true,limit:800}).catch(function(){return[];}),
      biltia.list("devis",{order:"date_devis",ascending:false,limit:600}).catch(function(){return[];}),
      (biltia.chantierRentabilite?biltia.chantierRentabilite():Promise.resolve([])).catch(function(){return[];})
    ]);
    S.factures=r[0]||[]; S.chantiers=r[1]||[]; S.clients=r[2]||[]; S.devis=r[3]||[];
    S.renta={}; (r[4]||[]).forEach(function(x){ if(x&&x.id)S.renta[x.id]=x; });
    renderNav(); render();
  }catch(e){ $("view").innerHTML='<div class="view-pad"><div class="empty"><div class="empty-ico">⚠️</div><div class="empty-title">Connexion au workspace impossible</div><div class="empty-sub">Vérifiez votre connexion puis rouvrez l\\'application.</div></div></div>'; }
}
function renderNav(){
  $("side-nav").innerHTML=NAV.map(function(n){return '<button class="side-item'+(S.view===n.id?" active":"")+'" onclick="go(\\''+n.id+'\\')"><svg viewBox="0 0 24 24">'+n.icon+'</svg><span>'+n.label+'</span></button>';}).join("");
  $("tab-bar").innerHTML=NAV.map(function(n){return '<button class="tab-item'+(S.view===n.id?" active":"")+'" onclick="go(\\''+n.id+'\\')"><svg class="tab-ic" viewBox="0 0 24 24">'+n.icon+'</svg><span>'+n.label+'</span></button>';}).join("");
}
function go(v){ S.view=v; renderNav(); render(); try{window.scrollTo(0,0);}catch(e){} }
function primaryAdd(){ if(S.view==="budgets") openBudget(null); else openFacture(null); }
function render(){
  var titles={dashboard:"Tableau de bord",factures:"Factures",budgets:"Budgets & rentabilité",tresorerie:"Trésorerie"};
  $("tb-title").textContent=titles[S.view]||"";
  if($("hd-add"))$("hd-add").textContent=(S.view==="budgets"?"+ Chantier":"+ Facture");
  if($("tb-add"))$("tb-add").textContent=(S.view==="budgets"?"+ Nouveau chantier":"+ Nouvelle facture");
  if(S.view==="dashboard") renderDashboard();
  else if(S.view==="factures") renderFactures();
  else if(S.view==="budgets") renderBudgets();
  else renderTresorerie();
}
function emptyState(ico,title,sub,onclick,btn){return '<div class="empty"><div class="empty-ico">'+ico+'</div><div class="empty-title">'+title+'</div><div class="empty-sub">'+sub+'</div><button class="btn btn-primary" onclick="'+onclick+'">'+btn+'</button></div>';}

/* ── Vue : Tableau de bord (cockpit) ── */
function renderDashboard(){
  var h='<div class="view-pad">';
  if(!S.factures.length && !budgetRows().length){
    h+=emptyState("💶","Pilotez votre cash","Créez une facture : votre cash bloqué, votre DSO et vos courbes d\\'encaissement s\\'afficheront ici, en direct.","openFacture(null)","+ Nouvelle facture")+'</div>';
    $("view").innerHTML=h; return;
  }
  var cb=cashBloque(), up=unpaid(), over=up.filter(function(f){return daysLate(f)>0;});
  var buckets=agingBuckets(), score=healthScore(), d=dso();
  var ds=debtors();
  // COCKPIT
  h+='<section class="cockpit"><div class="cockpit-top"><div style="min-width:0"><div class="ck-label">Cash bloqué chez vos clients</div><div class="ck-value" id="ck-cash">'+money(0)+'</div><div class="ck-sub">Sur <b>'+up.length+'</b> facture'+(up.length>1?"s":"")+' · <b>'+over.length+'</b> dossier'+(over.length>1?"s":"")+' prioritaire'+(over.length>1?"s":"")+'</div></div>'
    +'<div class="ck-right"><div id="ck-gauge"></div><span class="dso-pill">DSO '+d+' j</span></div></div>';
  var tot=buckets.reduce(function(s,x){return s+x.v;},0)||1;
  h+='<div class="aging">'+buckets.map(function(x){return '<span style="width:'+(x.v/tot*100).toFixed(1)+'%;background:'+x.c+'"></span>';}).join("")+'</div>';
  h+='<div class="aging-leg">'+buckets.map(function(x){return '<span class="it"><span class="d" style="background:'+x.c+'"></span>'+x.l+' · <b>'+moneyK(x.v)+'</b></span>';}).join("")+'</div></section>';
  // INSIGHTS
  var top5=ds.slice(0,5).reduce(function(s,x){return s+x.reste;},0), share=cb>0?Math.round(top5/cb*100):0, nTop=Math.min(5,ds.length);
  var over60=up.filter(function(f){return daysLate(f)>60;}).reduce(function(s,f){return s+reste(f);},0);
  if(nTop>=2) h+='<div class="insight warn"><span class="ic">!</span><p><b>'+nTop+' clients</b> représentent <b>'+share+'%</b> de votre cash bloqué.</p></div>';
  if(over60>0) h+='<div class="insight warn"><span class="ic">!</span><p><b>'+money(over60)+'</b> sont bloqués depuis plus de <b>60 jours</b> — à escalader en priorité.</p></div>';
  else h+='<div class="insight ok"><span class="ic">✓</span><p>Aucune facture au-delà de <b>60 jours</b> de retard. Votre recouvrement est sain.</p></div>';
  // GRAPHIQUES INTERACTIFS
  var rec=recouvrementMonthly(), enc=encaisseMonthly(6);
  var recLast=rec[rec.length-1]?rec[rec.length-1].value:0, encLast=enc[enc.length-1]?enc[enc.length-1].value:0;
  h+='<div class="charts-2">'
    +'<div class="chart-card"><div class="chart-hd"><b>Santé d\\'encaissement</b><span class="rd" id="rd-rec">'+recLast+' %</span></div><div class="chart-host" id="ch-rec"></div></div>'
    +'<div class="chart-card"><div class="chart-hd"><b>Encaissé par mois</b><span class="rd" id="rd-enc">'+moneyK(encLast)+'</span></div><div class="chart-host" id="ch-enc"></div></div>'
    +'</div>';
  // DÉBITEURS
  h+='<div class="card" style="margin-top:14px;padding:16px 18px"><div class="section-h" style="margin:0 0 6px"><b>Clients qui bloquent votre cash</b><button class="link" onclick="go(\\'factures\\')">Tous les clients →</button></div>';
  if(!ds.length){ h+='<div style="color:var(--mut);padding:10px 0">Aucun encours client à recouvrer. 👌</div>'; }
  else { var maxR=ds[0].reste||1; h+=ds.slice(0,5).map(function(x){ var sev=sevOf(x.maxLate); var ulw=Math.max(12,Math.round(x.reste/maxR*100));
    return '<div class="deb"><span class="avatar" style="width:38px;height:38px;background:'+avc(x.nom)+'">'+esc(initials(x.nom))+'</span>'
      +'<div class="mid"><div class="nm">'+esc(x.nom)+'</div><div class="mt">'+x.nb+' facture'+(x.nb>1?"s":"")+' · '+(x.maxLate>0?x.maxLate+' j de retard':"à échéance")+'</div><div class="ul"><span style="width:'+ulw+'%;background:'+sev.c+'"></span></div></div>'
      +'<div class="end"><span class="deb-badge" style="background:'+sev.bg+';color:'+sev.c+'"><span class="d" style="background:'+sev.c+'"></span>'+sev.badge+'</span><div class="amt2">'+money(x.reste)+'</div><button class="act" onclick="debAction(\\''+x.id+'\\')">'+sev.act+' →</button></div></div>'; }).join(""); }
  h+='</div></div>';
  $("view").innerHTML=h;
  // Montage des éléments animés/interactifs
  try{ countUp($("ck-cash"),cb,money,1100); }catch(e){}
  try{ drawGauge($("ck-gauge"),score); }catch(e){}
  try{ drawArea($("ch-rec"),rec,{id:"rec",color:"#7C6BF5",unit:" %",fmt:function(v){return Math.round(v);},rd:"rd-rec",rdDef:recLast+" %"}); }catch(e){}
  try{ drawBars($("ch-enc"),enc,{id:"enc",color:"#7C5CFC",color2:"#A78BFA",fmt:moneyK,rd:"rd-enc",rdDef:moneyK(encLast)}); }catch(e){}
}
function debAction(clientId){ var fs=unpaid().filter(function(f){return f.client_id===clientId;}).sort(function(a,b){return daysLate(b)-daysLate(a);}); if(fs.length){ openFactureDetail(fs[0].id); } else { go("factures"); } }

/* ── Vue : Factures ── */
var F_FIL=[["tous","Toutes"],["impaye","À encaisser"],["en_retard","En retard"],["payee","Payées"],["brouillon","Brouillons"]];
function facturesFiltered(){
  var q=S.search.trim().toLowerCase();
  return S.factures.filter(function(f){
    if(S.filter==="impaye"){ if(!(reste(f)>0&&f.statut!=="brouillon"&&f.statut!=="annulee"))return false; }
    else if(S.filter==="en_retard"){ if(!isOverdue(f))return false; }
    else if(S.filter!=="tous"){ if((f.statut||"brouillon")!==S.filter)return false; }
    if(q){ var hay=((f.numero||"")+" "+(clientName(f.client_id)||"")+" "+(chantierName(f.chantier_id)||"")).toLowerCase(); if(hay.indexOf(q)<0)return false; }
    return true;
  });
}
function factureCard(f){ var st=fStat(f); var r=reste(f);
  return '<button class="row" onclick="openFactureDetail(\\''+f.id+'\\')"><span class="avatar" style="background:'+avc(f.numero)+'">'+esc(initials(clientName(f.client_id)||f.numero))+'</span>'
    +'<span class="row-mid"><span class="n">'+esc(f.numero||"Facture")+' · '+esc(clientName(f.client_id)||"Client")+'</span><span class="s">'+esc(fmtDate(f.date_facture))+(f.chantier_id?" · "+esc(chantierName(f.chantier_id)):"")+'</span></span>'
    +'<span class="row-end"><span class="amt">'+money(f.montant_ttc)+'</span><span class="badge '+st.b+'">'+st.l+(r>0&&st.b!=="badge-red"&&f.statut!=="brouillon"?" · "+moneyK(r):"")+'</span></span></button>';
}
function facturesListHTML(){
  var list=facturesFiltered();
  if(!list.length){ return S.factures.length?'<div class="empty"><div class="empty-title">Aucune facture ne correspond</div><div class="empty-sub">Changez de filtre ou de recherche.</div></div>':emptyState("🧾","Aucune facture","Créez votre première facture pour suivre vos encaissements.","openFacture(null)","+ Nouvelle facture"); }
  return '<div class="list">'+list.map(factureCard).join("")+'</div>';
}
function fSearch(v){ S.search=v; var el=$("f-list"); if(el)el.innerHTML=facturesListHTML(); }
function fSetFilter(x){ S.filter=x; var ch=$("f-chips"); if(ch)Array.prototype.forEach.call(ch.children,function(b,i){b.className="chip"+(F_FIL[i][0]===x?" on":"");}); var el=$("f-list"); if(el)el.innerHTML=facturesListHTML(); }
function renderFactures(){
  var h='<div class="view-pad">';
  h+='<div class="searchwrap"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg><input placeholder="Rechercher un numéro, un client, un chantier…" value="'+esc(S.search)+'" oninput="fSearch(this.value)"></div>';
  h+='<div class="chips" id="f-chips">'+F_FIL.map(function(f){return '<button class="chip'+(S.filter===f[0]?" on":"")+'" onclick="fSetFilter(\\''+f[0]+'\\')">'+f[1]+'</button>';}).join("")+'</div>';
  h+='<div id="f-list">'+facturesListHTML()+'</div></div>';
  $("view").innerHTML=h;
}

/* ── Vue : Budgets ── */
function budgetRows(){ return S.chantiers.filter(function(c){return num(c.budget)>0&&c.statut!=="annule";}).map(function(c){ var prevu=num(c.budget),engage=num(c.budget_engage); var facture=facturesActives().filter(function(f){return f.chantier_id===c.id;}).reduce(function(s,f){var v=num(f.montant_ht);return s+(f.type==="avoir"?-v:v);},0); var marge=prevu-engage,pct=prevu?Math.round(marge/prevu*100):0,use=prevu?Math.round(engage/prevu*100):0; return {c:c,prevu:prevu,engage:engage,facture:facture,marge:marge,pct:pct,use:use}; }).sort(function(a,b){return b.prevu-a.prevu;}); }
function budRowHTML(r){ var col=r.use>100?"#E11D48":r.use>=85?"#D97706":"var(--vio)"; var w=Math.max(2,Math.min(100,r.use));
  return '<button class="bud-row" onclick="openBudget(\\''+r.c.id+'\\')"><div class="bud-top"><span class="bud-name">'+esc(r.c.nom||"Chantier")+'</span><span class="bud-marge" style="color:'+(r.marge<0?"#E11D48":"#059669")+'">'+moneyK(r.marge)+'</span></div><div class="bud-track"><div class="bud-fill" style="width:'+w+'%;background:'+col+'"></div></div><div class="bud-meta"><span>Engagé '+moneyK(r.engage)+' / '+moneyK(r.prevu)+'</span><span>'+(r.use>100?'<span style="color:#E11D48;font-weight:600">dépassé '+r.use+'%</span>':"marge "+r.pct+"%")+'</span></div></button>'; }
/* Rentabilité RÉELLE (agrégat serveur : facturé − heures pointées×taux − achats). */
function rentaRows(){
  var m=S.renta||{}, arr=[];
  S.chantiers.forEach(function(c){ if(c.statut==="annule")return; var r=m[c.id]; if(!r)return; if(!(num(r.facture)>0||num(r.cout_total)>0))return; arr.push(r); });
  return arr.sort(function(a,b){return num(a.marge)-num(b.marge);}); // moins rentable d'abord
}
function rentaRowHTML(r){
  var facture=num(r.facture)||0, cout=num(r.cout_total)||0, neg=num(r.marge)<0;
  var use=facture>0?Math.round(cout/facture*100):(cout>0?120:0), col=use>100?"#E11D48":use>=85?"#D97706":"#059669", w=Math.max(2,Math.min(100,use));
  return '<div class="bud-row"><div class="bud-top"><span class="bud-name">'+esc(r.nom||"Chantier")+'</span><span class="bud-marge" style="color:'+(neg?"#E11D48":"#059669")+'">'+moneyK(r.marge)+'</span></div>'
    +'<div class="bud-track"><div class="bud-fill" style="width:'+w+'%;background:'+col+'"></div></div>'
    +'<div class="bud-meta"><span>Coût réel '+moneyK(cout)+' / facturé '+moneyK(facture)+'</span><span>'+(r.marge_pct!=null?(neg?'<span style="color:#E11D48;font-weight:600">perte '+Math.abs(r.marge_pct)+'%</span>':"marge "+r.marge_pct+"%"):"—")+'</span></div>'
    +'<div class="bud-meta" style="margin-top:4px;opacity:.8"><span>Main d\\'œuvre '+moneyK(r.cout_mo)+' · matériaux '+moneyK(r.cout_materiaux)+'</span>'+(num(r.reste_a_encaisser)>0?'<span>reste à encaisser '+moneyK(r.reste_a_encaisser)+'</span>':'')+'</div></div>';
}
function renderBudgets(){
  var renta=rentaRows(), rows=budgetRows(), h='<div class="view-pad">';
  if(!renta.length && !rows.length){ h+=emptyState("🏗️","Rien à analyser pour l\\'instant","Facturez un chantier et pointez des heures : la rentabilité réelle (facturé − coûts) s\\'affichera ici. Ou ajoutez un budget prévu à un chantier.","openBudget(null)","+ Nouveau chantier")+'</div>'; $("view").innerHTML=h; return; }
  // ── Bloc 1 : rentabilité RÉELLE (le vrai chiffre) ──
  if(renta.length){
    var tFact=renta.reduce(function(s,r){return s+(num(r.facture)||0);},0), tCout=renta.reduce(function(s,r){return s+(num(r.cout_total)||0);},0), tMarge=tFact-tCout;
    h+='<div class="strip"><div class="strip-cell"><div class="strip-k">Facturé</div><div class="strip-v">'+moneyK(tFact)+'</div><div class="strip-s">'+renta.length+' chantier'+(renta.length>1?"s":"")+'</div></div><div class="strip-cell"><div class="strip-k">Coûts réels</div><div class="strip-v">'+moneyK(tCout)+'</div><div class="strip-s">main d\\'œuvre + matériaux</div></div><div class="strip-cell"><div class="strip-k">Marge réelle</div><div class="strip-v" style="color:'+(tMarge<0?"#E11D48":"#059669")+'">'+moneyK(tMarge)+'</div><div class="strip-s">'+(tFact?Math.round(tMarge/tFact*100):0)+'%</div></div></div>';
    h+='<div class="section-h"><b>Rentabilité réelle par chantier</b><span style="font-size:11px;color:var(--mut)">facturé − heures − achats</span></div>'+renta.map(rentaRowHTML).join("");
  }
  // ── Bloc 2 : budget PRÉVISIONNEL (saisi à la main, prévu vs engagé) ──
  if(rows.length){
    var prevu=rows.reduce(function(s,r){return s+r.prevu;},0),engage=rows.reduce(function(s,r){return s+r.engage;},0),marge=prevu-engage;
    h+='<div class="section-h" style="margin-top:20px"><b>Budget prévisionnel</b><button class="btn btn-ghost btn-sm" onclick="openBudget(null)">+ Chantier</button></div>';
    h+='<div class="strip"><div class="strip-cell"><div class="strip-k">Budget prévu</div><div class="strip-v">'+moneyK(prevu)+'</div><div class="strip-s">'+rows.length+' chantier'+(rows.length>1?"s":"")+'</div></div><div class="strip-cell"><div class="strip-k">Engagé</div><div class="strip-v">'+moneyK(engage)+'</div><div class="strip-s">'+(prevu?Math.round(engage/prevu*100):0)+'% du prévu</div></div><div class="strip-cell"><div class="strip-k">Marge prévue</div><div class="strip-v" style="color:'+(marge<0?"#E11D48":"#059669")+'">'+moneyK(marge)+'</div><div class="strip-s">'+(prevu?Math.round(marge/prevu*100):0)+'%</div></div></div>';
    h+=rows.map(budRowHTML).join("");
  } else {
    h+='<div class="section-h" style="margin-top:20px"><b>Budget prévisionnel</b><button class="btn btn-ghost btn-sm" onclick="openBudget(null)">+ Chantier</button></div><div style="color:var(--mut);font-size:13px;padding:4px 2px 2px">Ajoutez un budget prévu à un chantier pour comparer le prévu au réel.</div>';
  }
  h+='</div>';
  $("view").innerHTML=h;
}

/* ── Vue : Trésorerie (courbe interactive + donut) ── */
function renderTresorerie(){
  var h='<div class="view-pad">';
  if(!S.factures.length){ h+=emptyState("📈","Pas encore d\\'encaissement","Vos encaissements alimenteront votre courbe de trésorerie dès votre première facture payée.","openFacture(null)","+ Nouvelle facture")+'</div>'; $("view").innerHTML=h; return; }
  var cum=encCumule(), tot=cum[cum.length-1]?cum[cum.length-1].value:0;
  h+='<div class="chart-card"><div class="chart-hd"><b>Trésorerie encaissée (cumul)</b><span class="rd" id="rd-tre">'+money(tot)+'</span></div><div class="chart-host" id="ch-tre"></div></div>';
  var paye=totalEncaisse(),attente=unpaid().filter(function(f){return !isOverdue(f);}).reduce(function(s,f){return s+reste(f);},0),retard=unpaid().filter(isOverdue).reduce(function(s,f){return s+reste(f);},0);
  h+='<div class="card" style="margin-top:12px"><div class="section-h" style="margin:0 0 14px"><b>Où en est votre argent</b></div><div class="donut-wrap">'+donut([{value:paye,color:"#059669"},{value:attente,color:"#F59E0B"},{value:retard,color:"#E11D48"}])
    +'<div class="legend"><div class="legend-i"><span class="legend-sw" style="background:#059669"></span>Encaissé<span class="lv">'+moneyK(paye)+'</span></div><div class="legend-i"><span class="legend-sw" style="background:#F59E0B"></span>À encaisser<span class="lv">'+moneyK(attente)+'</span></div><div class="legend-i"><span class="legend-sw" style="background:#E11D48"></span>En retard<span class="lv">'+moneyK(retard)+'</span></div></div></div></div>';
  var recents=S.factures.filter(function(f){return num(f.montant_paye)>0;}).slice().sort(function(a,b){return String(b.date_facture||"").localeCompare(String(a.date_facture||""));}).slice(0,6);
  h+='<div class="section-h"><b>Encaissements récents</b></div>';
  if(!recents.length){ h+='<div class="card" style="color:var(--mut)">Aucun encaissement enregistré pour l\\'instant.</div>'; }
  else { h+='<div class="list">'+recents.map(function(f){return '<button class="row" onclick="openFactureDetail(\\''+f.id+'\\')"><span class="avatar" style="background:'+avc(f.numero)+'">'+esc(initials(clientName(f.client_id)||f.numero))+'</span><span class="row-mid"><span class="n">'+esc(clientName(f.client_id)||"Client")+' · '+esc(f.numero||"")+'</span><span class="s">'+esc(fmtDate(f.date_facture))+(reste(f)>0?" · reste "+moneyK(reste(f)):" · soldée")+'</span></span><span class="row-end"><span class="amt" style="color:#059669">+'+money(f.montant_paye)+'</span></span></button>';}).join("")+'</div>'; }
  h+='</div>'; $("view").innerHTML=h;
  try{ drawArea($("ch-tre"),cum,{id:"tre",color:"#6D5EF6",fmt:moneyK,rd:"rd-tre",rdDef:money(tot)}); }catch(e){}
}

/* ── Modale ── */
function openModal(html){ $("modal").innerHTML=html; $("ovl").hidden=false; $("modal").scrollTop=0; }
function closeModal(){ $("ovl").hidden=true; $("modal").innerHTML=""; S.edit=null; }
document.addEventListener("click",function(e){ if(e.target&&e.target.id==="ovl")closeModal(); });
function optClients(sel){ var o='<option value="">— Choisir un client —</option>'; S.clients.forEach(function(c){o+='<option value="'+c.id+'"'+(c.id===sel?" selected":"")+'>'+esc(c.nom)+'</option>';}); o+='<option value="__new">➕ Nouveau client…</option>'; return o; }
function optChantiers(sel){ var o='<option value="">— Aucun chantier —</option>'; S.chantiers.forEach(function(c){o+='<option value="'+c.id+'"'+(c.id===sel?" selected":"")+'>'+esc(c.nom)+'</option>';}); o+='<option value="__new">➕ Nouveau chantier…</option>'; return o; }
function tvaOpts(sel){ return [["20","20 %"],["10","10 %"],["5.5","5,5 %"],["0","0 %"]].map(function(o){return '<option value="'+o[0]+'"'+(String(sel==null?"20":sel)===o[0]?" selected":"")+'>'+o[1]+'</option>';}).join(""); }
function segOn(wrap,keys,k,color){ document.querySelectorAll("#"+wrap+" button").forEach(function(b){b.className="";b.style.background="";}); var i=keys.indexOf(k),btns=document.querySelectorAll("#"+wrap+" button"); if(btns[i]){btns[i].className="on";btns[i].style.background=color;} }

/* Éditeur de facture (par montants) */
function openFacture(id){
  var f=id?findFacture(id):{ numero:nextNumero(), client_id:"", chantier_id:"", devis_id:"", type:"facture", statut:"brouillon", date_facture:todayISO(), date_echeance:plusDays(todayISO(),30), montant_ht:"", _tva:20, montant_paye:0, notes:"" };
  if(id){ f=JSON.parse(JSON.stringify(f)); f._tva=num(f.montant_ht)?Math.round(num(f.montant_tva)/num(f.montant_ht)*100*10)/10:20; }
  S.edit=f;
  var TY=[["facture","Facture"],["acompte","Acompte"],["situation","Situation"],["avoir","Avoir"]];
  var h='<div class="modal-h"><div><div class="modal-title">'+(id?"Modifier la facture":"Nouvelle facture")+'</div><div class="modal-sub">'+esc(f.numero||nextNumero())+'</div></div><button class="x" onclick="closeModal()">✕</button></div>';
  h+='<div class="form-row"><div class="fg"><label class="fl">Client *</label><select id="f-client" onchange="fPick(\\'client_id\\',this.value)">'+optClients(f.client_id)+'</select></div><div class="fg"><label class="fl">Chantier</label><select id="f-chantier" onchange="fPick(\\'chantier_id\\',this.value)">'+optChantiers(f.chantier_id)+'</select></div></div>';
  h+='<div class="fg"><label class="fl">Type</label><div class="seg" id="f-seg">'+TY.map(function(o){return '<button type="button" onclick="fType(\\''+o[0]+'\\')" class="'+(f.type===o[0]?"on":"")+'" style="'+(f.type===o[0]?"background:var(--vio)":"")+'">'+o[1]+'</button>';}).join("")+'</div></div>';
  h+='<div class="form-row"><div class="fg"><label class="fl">Date de facture</label><input type="date" id="f-date" value="'+esc((f.date_facture||"").slice(0,10))+'"></div><div class="fg"><label class="fl">Échéance</label><input type="date" id="f-ech" value="'+esc((f.date_echeance||"").slice(0,10))+'"></div></div>';
  h+='<div class="form-row"><div class="fg"><label class="fl">Montant HT (€)</label><input id="f-ht" inputmode="decimal" value="'+esc(f.montant_ht!=null?f.montant_ht:"")+'" oninput="fRecalc()"></div><div class="fg"><label class="fl">TVA</label><select id="f-tva" onchange="fRecalc()">'+tvaOpts(f._tva)+'</select></div></div>';
  h+='<div class="totbox"><div class="totrow">Montant HT<span class="v" id="f-ht-v">'+money(f.montant_ht)+'</span></div><div class="totrow">TVA<span class="v" id="f-tva-v">'+money(num(f.montant_ht)*num(f._tva)/100)+'</span></div><div class="totrow grand">Total TTC<span class="v" id="f-ttc-v">'+money(num(f.montant_ht)*(1+num(f._tva)/100))+'</span></div></div>';
  h+='<div class="fg" style="margin-top:16px"><label class="fl">Statut</label><div class="seg" id="f-stseg">'+["brouillon","envoyee","payee","partiellement_payee","annulee"].map(function(k){return '<button type="button" onclick="fStatut(\\''+k+'\\')" class="'+(f.statut===k?"on":"")+'" style="'+(f.statut===k?"background:"+FST[k].c:"")+'">'+FST[k].l+'</button>';}).join("")+'</div></div>';
  h+='<div class="modal-actions"><button class="btn btn-primary" id="f-save" onclick="factureSave()">'+(id?"Enregistrer":"Créer la facture")+'</button>'+(id?'<button class="btn btn-danger" style="flex:0 0 auto" onclick="factureDel(\\''+id+'\\')">Supprimer</button>':'')+'</div>';
  openModal(h);
}
function fPick(field,v){ if(v==="__new"){ var lbl=field==="client_id"?"Nom du client :":"Intitulé du chantier :"; var nm=prompt(lbl,""); if(nm&&nm.trim()){ var ent=field==="client_id"?"clients":"chantiers"; var extra=field==="chantier_id"?{client_id:S.edit.client_id||null,statut:"en_attente"}:{}; biltia.create(ent,Object.assign({nom:nm.trim()},extra)).then(function(row){ if(ent==="clients"){S.clients.push(row);S.clients.sort(function(a,b){return String(a.nom).localeCompare(String(b.nom));});} else S.chantiers.unshift(row); S.edit[field]=row.id; openFacture(S.edit.id||null); biltia.notify(ent==="clients"?"Client ajouté":"Chantier créé"); }).catch(function(){}); } else { if($("f-"+(field==="client_id"?"client":"chantier")))$("f-"+(field==="client_id"?"client":"chantier")).value=S.edit[field]||""; } } else { S.edit[field]=v; } }
function fSyncInputs(){ var f=S.edit; if($("f-date"))f.date_facture=$("f-date").value; if($("f-ech"))f.date_echeance=$("f-ech").value; if($("f-ht"))f.montant_ht=$("f-ht").value; if($("f-tva"))f._tva=$("f-tva").value; }
function fType(k){ S.edit.type=k; segOn("f-seg",["facture","acompte","situation","avoir"],k,"var(--vio)"); }
function fStatut(k){ S.edit.statut=k; segOn("f-stseg",["brouillon","envoyee","payee","partiellement_payee","annulee"],k,FST[k].c); }
function fRecalc(){ var ht=num($("f-ht")?$("f-ht").value:0),tv=num($("f-tva")?$("f-tva").value:20); if($("f-ht-v"))$("f-ht-v").textContent=money(ht); if($("f-tva-v"))$("f-tva-v").textContent=money(ht*tv/100); if($("f-ttc-v"))$("f-ttc-v").textContent=money(ht*(1+tv/100)); }
async function factureSave(){
  var f=S.edit; fSyncInputs();
  if(!f.client_id){ biltia.notify("Choisissez un client"); var s=$("f-client"); if(s){s.classList.add("invalid");s.focus();} return; }
  var ht=num(f.montant_ht),tv=num(f._tva),tva=round2(ht*tv/100),ttc=round2(ht+tva);
  if(ht<=0){ biltia.notify("Indiquez un montant HT"); var el=$("f-ht"); if(el){el.classList.add("invalid");el.focus();} return; }
  var paye=Math.min(num(f.montant_paye),ttc),statut=f.statut||"brouillon"; if(statut==="payee")paye=ttc;
  var payload={ numero:f.numero||nextNumero(), client_id:f.client_id, chantier_id:f.chantier_id||null, devis_id:f.devis_id||null, type:f.type||"facture", statut:statut, date_facture:f.date_facture||todayISO(), date_echeance:f.date_echeance||null, montant_ht:ht, montant_tva:tva, montant_ttc:ttc, montant_paye:paye, notes:f.notes||null };
  var b=$("f-save"); if(b){b.disabled=true;b.textContent="Enregistrement…";}
  try{ if(f.id){ var up=await biltia.update("factures",f.id,payload); replaceFacture(up); biltia.notify("Facture enregistrée"); } else { var row=await biltia.create("factures",payload); S.factures.unshift(row); biltia.notify("Facture créée"); } closeModal(); render(); }
  catch(e){ if(b){b.disabled=false;b.textContent=f.id?"Enregistrer":"Créer la facture";} biltia.notify("Enregistrement impossible"); }
}
async function factureDel(id){ if(!confirm("Supprimer définitivement cette facture ?"))return; try{ await biltia.remove("factures",id); S.factures=S.factures.filter(function(x){return x.id!==id;}); biltia.notify("Facture supprimée"); closeModal(); render(); }catch(e){ biltia.notify("Suppression impossible"); } }

/* Fiche détail + encaissement / relance */
function openFactureDetail(id){
  var f=findFacture(id); if(!f)return; var st=fStat(f),cl=findClient(f.client_id),r=reste(f),paid=num(f.montant_paye),pct=num(f.montant_ttc)?Math.round(paid/num(f.montant_ttc)*100):0,over=isOverdue(f);
  var h='<div class="modal-h"><div><div class="modal-title">'+esc(f.numero||"Facture")+'</div><div class="modal-sub">'+esc(clientName(f.client_id)||"Client non renseigné")+(f.chantier_id?" · "+esc(chantierName(f.chantier_id)):"")+'</div></div><button class="x" onclick="closeModal()">✕</button></div>';
  h+='<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap"><span class="badge '+st.b+'">'+st.l+'</span><span style="font-weight:800;font-size:20px;font-variant-numeric:tabular-nums">'+money(f.montant_ttc)+' TTC</span></div>';
  h+='<div class="det-sec"><div class="fl">Encaissement</div><div class="pay-bar"><div class="pay-fill" style="width:'+Math.min(100,pct)+'%"></div></div><div class="bud-meta"><span>Encaissé '+money(paid)+'</span><span>'+(r>0?"Reste "+money(r):"Soldée ✓")+'</span></div>';
  if(r>0) h+='<div class="modal-actions" style="margin-top:12px"><button class="btn btn-primary" onclick="encaisserSolde(\\''+f.id+'\\')">Encaisser le solde</button><button class="btn btn-ghost" onclick="encaisserPartiel(\\''+f.id+'\\')">Paiement partiel</button></div>';
  h+='</div>';
  h+='<div class="det-sec"><div class="fl">Statut</div><div class="seg" id="fd-seg">'+["brouillon","envoyee","payee","partiellement_payee","en_retard","annulee"].map(function(k){return '<button onclick="fdStatut(\\''+f.id+'\\',\\''+k+'\\')" class="'+(f.statut===k?"on":"")+'" style="'+(f.statut===k?"background:"+FST[k].c:"")+'">'+FST[k].l+'</button>';}).join("")+'</div></div>';
  h+='<div class="det-sec"><div class="fl">Détail</div><div class="det-row"><span class="k">Montant HT</span><span class="v">'+money(f.montant_ht)+'</span></div><div class="det-row"><span class="k">TVA</span><span class="v">'+money(f.montant_tva)+'</span></div><div class="det-row"><span class="k">Date</span><span class="v">'+fmtDate(f.date_facture)+'</span></div><div class="det-row"><span class="k">Échéance</span><span class="v" style="'+(over?"color:#E11D48":"")+'">'+fmtDate(f.date_echeance)+(over?" (en retard)":"")+'</span></div>'+(cl&&(cl.email||cl.tel)?'<div class="det-row"><span class="k">Contact</span><span class="v">'+esc(cl.email||cl.tel)+'</span></div>':"")+'</div>';
  h+='<div class="modal-actions">'+((r>0&&f.statut!=="brouillon")?'<button class="btn btn-primary" onclick="relanceEmail(\\''+f.id+'\\')"><svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/><path d="m4 6 8 6 8-6"/></svg>Relancer</button>':"")+'<button class="btn btn-ghost" onclick="openFacture(\\''+f.id+'\\')">Modifier</button><button class="btn btn-danger" style="flex:0 0 auto" onclick="factureDel(\\''+f.id+'\\')">Supprimer</button></div>';
  openModal(h);
}
async function saveFacturePatch(id,patch){ var f=findFacture(id); if(!f)return; try{ var up=await biltia.update("factures",id,patch); replaceFacture(up); }catch(e){ Object.assign(f,patch); } }
async function encaisserSolde(id){ var f=findFacture(id); if(!f)return; f.montant_paye=num(f.montant_ttc); f.statut="payee"; await saveFacturePatch(id,{montant_paye:num(f.montant_ttc),statut:"payee"}); biltia.notify("Facture soldée · "+money(f.montant_ttc)); openFactureDetail(id); render(); }
async function encaisserPartiel(id){ var f=findFacture(id); if(!f)return; var v=prompt("Montant encaissé (€) :",String(Math.round(reste(f)))); if(v==null)return; var add=num(v); if(add<=0)return; var paye=Math.min(num(f.montant_ttc),num(f.montant_paye)+add),statut=paye>=num(f.montant_ttc)?"payee":"partiellement_payee"; f.montant_paye=paye; f.statut=statut; await saveFacturePatch(id,{montant_paye:paye,statut:statut}); biltia.notify("Encaissement enregistré · "+money(add)); openFactureDetail(id); render(); }
async function fdStatut(id,k){ var f=findFacture(id); if(!f)return; var prev=f.statut; f.statut=k; if(k==="payee")f.montant_paye=num(f.montant_ttc); segOn("fd-seg",["brouillon","envoyee","payee","partiellement_payee","en_retard","annulee"],k,FST[k].c); try{ var patch={statut:k}; if(k==="payee")patch.montant_paye=num(f.montant_ttc); var up=await biltia.update("factures",id,patch); replaceFacture(up); biltia.notify("Statut mis à jour"); render(); }catch(e){ f.statut=prev; } }
async function relanceEmail(id){
  var f=findFacture(id); if(!f)return; var cl=findClient(f.client_id);
  if(!cl||!String(cl.email||"").trim()){ biltia.notify("Ajoutez l\\'email du client pour le relancer"); return; }
  var over=isOverdue(f),who=cl.nom||"Madame, Monsieur";
  var body="Bonjour "+who+",\\n\\nSauf erreur de notre part, la facture "+(f.numero||"")+" d\\'un montant de "+money(f.montant_ttc)+" TTC (échéance le "+fmtDate(f.date_echeance)+") reste à régler pour "+money(reste(f))+".\\n\\n"+(over?"Nous vous remercions de bien vouloir procéder au règlement dans les meilleurs délais.":"Nous vous en souhaitons bonne réception.")+"\\n\\nBien cordialement,\\n"+(S.entreprise||"");
  biltia.notify("Envoi de la relance…");
  try{ await biltia.sendEmail({ to:cl.email, subject:"Relance facture "+(f.numero||"")+" — "+(S.entreprise||""), body:body }); biltia.notify("Relance envoyée à "+cl.email); if(f.statut==="brouillon"){ f.statut="envoyee"; await saveFacturePatch(id,{statut:"envoyee"}); openFactureDetail(id); render(); } }catch(e){ biltia.notify("Envoi impossible pour le moment"); }
}

/* Éditeur de budget (chantier) */
function openBudget(id){
  var c=id?findChantier(id):{ nom:"",client_id:"",budget:"",budget_engage:"",statut:"en_cours" };
  S.edit=JSON.parse(JSON.stringify(c));
  var facture=id?facturesActives().filter(function(f){return f.chantier_id===id;}).reduce(function(s,f){var v=num(f.montant_ht);return s+(f.type==="avoir"?-v:v);},0):0;
  var h='<div class="modal-h"><div><div class="modal-title">'+(id?"Budget du chantier":"Nouveau chantier")+'</div><div class="modal-sub">'+(id?esc(c.nom||""):"Suivi de rentabilité")+'</div></div><button class="x" onclick="closeModal()">✕</button></div>';
  h+='<div class="fg"><label class="fl">Nom du chantier *</label><input id="b-nom" value="'+esc(c.nom||"")+'" placeholder="Rénovation Villa Martin"></div>';
  h+='<div class="fg"><label class="fl">Client</label><select id="b-client" onchange="bClient(this.value)">'+optClients(c.client_id)+'</select></div>';
  h+='<div class="form-row"><div class="fg"><label class="fl">Budget prévu (€ HT)</label><input id="b-budget" inputmode="decimal" value="'+esc(c.budget!=null?c.budget:"")+'" oninput="bRecalc()"></div><div class="fg"><label class="fl">Engagé / coûts (€ HT)</label><input id="b-engage" inputmode="decimal" value="'+esc(c.budget_engage!=null?c.budget_engage:"")+'" oninput="bRecalc()"></div></div>';
  h+='<div class="totbox"><div class="totrow">Déjà facturé<span class="v">'+money(facture)+'</span></div><div class="totrow grand">Marge prévue<span class="v" id="b-marge">'+money(num(c.budget)-num(c.budget_engage))+'</span></div></div>';
  h+='<div class="modal-actions"><button class="btn btn-primary" id="b-save" onclick="budgetSave()">'+(id?"Enregistrer":"Créer le chantier")+'</button>'+(id?'<button class="btn btn-ghost" style="flex:0 0 auto" onclick="openFactureForChantier(\\''+id+'\\')">+ Facturer</button>':'')+'</div>';
  openModal(h);
}
function bClient(v){ if(v==="__new"){ var nm=prompt("Nom du client :",""); if(nm&&nm.trim()){ biltia.create("clients",{nom:nm.trim()}).then(function(c){ S.clients.push(c); S.clients.sort(function(a,b){return String(a.nom).localeCompare(String(b.nom));}); S.edit.client_id=c.id; if($("b-client"))$("b-client").innerHTML=optClients(c.id); biltia.notify("Client ajouté"); }).catch(function(){}); } else { if($("b-client"))$("b-client").value=S.edit.client_id||""; } } else { S.edit.client_id=v; } }
function bRecalc(){ var bg=num($("b-budget")?$("b-budget").value:0),en=num($("b-engage")?$("b-engage").value:0),el=$("b-marge"); if(el){el.textContent=money(bg-en);el.style.color=(bg-en)<0?"#E11D48":"var(--ink)";} }
async function budgetSave(){
  var c=S.edit; if($("b-nom"))c.nom=$("b-nom").value; if($("b-budget"))c.budget=$("b-budget").value; if($("b-engage"))c.budget_engage=$("b-engage").value;
  if(!String(c.nom||"").trim()){ var el=$("b-nom"); if(el){el.classList.add("invalid");el.focus();} return; }
  var payload={ nom:String(c.nom).trim(), client_id:c.client_id||null, budget:num(c.budget)||null, budget_engage:num(c.budget_engage)||null };
  var b=$("b-save"); if(b){b.disabled=true;b.textContent="Enregistrement…";}
  try{ if(c.id){ var up=await biltia.update("chantiers",c.id,payload); for(var i=0;i<S.chantiers.length;i++)if(S.chantiers[i].id===c.id)S.chantiers[i]=up; biltia.notify("Budget enregistré"); } else { payload.statut=c.statut||"en_cours"; var row=await biltia.create("chantiers",payload); S.chantiers.unshift(row); biltia.notify("Chantier créé"); } closeModal(); render(); }
  catch(e){ if(b){b.disabled=false;b.textContent=c.id?"Enregistrer":"Créer le chantier";} biltia.notify("Enregistrement impossible"); }
}
function openFactureForChantier(chId){ var c=findChantier(chId); closeModal(); openFacture(null); if(S.edit){ S.edit.chantier_id=chId; if(c)S.edit.client_id=c.client_id||S.edit.client_id; if($("f-client"))$("f-client").value=S.edit.client_id||""; if($("f-chantier"))$("f-chantier").value=chId; } }

/* Init */
function initBrand(){ if(!S.entreprise||S.entreprise.indexOf("__")===0)S.entreprise="Mon entreprise"; var eb=S.entreprise.toUpperCase().slice(0,22); ["side-eyebrow","hd-eyebrow","tb-eyebrow"].forEach(function(i){var el=$(i);if(el)el.textContent=eb;}); ["side-logo","hd-logo"].forEach(function(i){var el=$(i);if(el)el.textContent=initials(S.entreprise)||"B";}); }
var _rz;
function start(){ initBrand(); renderNav(); boot(); if(window.addEventListener)window.addEventListener("resize",function(){ if(_rz)clearTimeout(_rz); _rz=setTimeout(function(){ if(S.view==="dashboard"||S.view==="tresorerie")render(); },200); }); }
if(document.readyState!=="loading"){ start(); } else { document.addEventListener("DOMContentLoaded",start); }
</script>
</body>
</html>`;
