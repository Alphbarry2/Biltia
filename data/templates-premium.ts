import type { TemplateApp } from "./templates-html";

// Templates premium : chaque modele a son PROPRE archetype (kanban, facture,
// calendrier, feuille de temps, annuaire, cockpit) et sa propre couleur.
// Ces entrees ecrasent les versions de base dans TEMPLATE_APPS.

const BASE = `@font-face{font-family:'Clash Display';src:url('/fonts/ClashDisplay-Variable.woff2') format('woff2');font-weight:300 700;font-display:swap}
@font-face{font-family:'Satoshi';src:url('/fonts/Satoshi-Variable.woff2') format('woff2');font-weight:300 900;font-display:swap}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--ink:#101014;--ink2:#3A3F4C;--mut:#71717A;--mut2:#A1A1AA;--line:#EAEAEF;--line2:#F2F2F6;--bg:#FBFBFC;--a1:#6366F1;--a2:#8B5CF6}
body{font-family:'Satoshi',system-ui,-apple-system,sans-serif;color:var(--ink);background:var(--bg);font-size:14px;line-height:1.5;-webkit-font-smoothing:antialiased;min-height:100vh}
.f{font-family:'Clash Display','Satoshi',sans-serif;letter-spacing:-.02em;font-weight:600}
.wrap{max-width:1160px;margin:0 auto;padding:26px 28px 64px}
.bar{position:sticky;top:0;z-index:30;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 28px;background:rgba(251,251,252,.86);backdrop-filter:blur(14px) saturate(180%);-webkit-backdrop-filter:blur(14px) saturate(180%);border-bottom:1px solid var(--line)}
.bar-l{display:flex;align-items:center;gap:11px}
.logo{width:26px;height:26px;border-radius:8px;background:linear-gradient(135deg,var(--a1),var(--a2));display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:13px;flex-shrink:0}
.bar-t{font-weight:600;font-size:15px}
.btn{display:inline-flex;align-items:center;gap:7px;font-weight:600;font-size:13px;padding:9px 15px;border-radius:10px;border:none;cursor:pointer;background:var(--a1);color:#fff;font-family:inherit;white-space:nowrap}
.btn-ghost{background:#fff;border:1px solid var(--line);color:var(--ink)}
.muted{color:var(--mut);font-size:12px}
.eyebrow{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--mut2)}
.sec{font-size:16px;font-weight:600;letter-spacing:-.02em;margin:24px 2px 14px}
.pill{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;padding:3px 10px;border-radius:9999px;white-space:nowrap}
.pill::before{content:'';width:6px;height:6px;border-radius:50%;background:currentColor}
.p-green{background:#ECFDF5;color:#059669}.p-amber{background:#FFF7ED;color:#C2410C}.p-red{background:#FEF2F2;color:#E11D48}.p-blue{background:#EFF6FF;color:#2563EB}.p-indigo{background:#EEF2FF;color:#4F46E5}.p-gray{background:#F4F4F5;color:#71717A}
.avatar{width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;color:#fff;flex-shrink:0}
.statline{display:flex;flex-wrap:wrap;gap:30px;padding:6px 2px}
.stat .k{font-family:'Clash Display',sans-serif;font-weight:600;font-size:25px;letter-spacing:-.02em}
.stat .l{font-size:11px;color:var(--mut);font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-top:3px}
.track{height:6px;background:#ECECF1;border-radius:4px;overflow:hidden}
.fill{height:100%;border-radius:4px;background:var(--a1)}
@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}}
.anim{animation:fadeUp .55s cubic-bezier(.16,1,.3,1) both;animation-delay:var(--d,0s)}
@keyframes growX{from{transform:scaleX(0)}}
.bx{transform-origin:left;animation:growX 1s cubic-bezier(.16,1,.3,1) both;animation-delay:var(--d,.15s)}
@media(max-width:560px){.wrap{padding:18px 14px 44px}.bar{padding:11px 14px;gap:8px}.bar-t{font-size:14px}.logo{width:24px;height:24px}.btn{padding:8px 12px;font-size:12px}.statline{gap:14px 22px}.stat .k{font-size:20px}.sec{font-size:14px;margin:18px 2px 10px}.avatar{width:32px;height:32px}}
@media(prefers-reduced-motion:reduce){.anim,.bx{animation:none!important}}`;

const SCRIPT = `<script>(function(){var E=function(t){return 1-Math.pow(1-t,3)};
document.querySelectorAll('[data-to]').forEach(function(el){
var to=parseFloat(el.getAttribute('data-to'))||0,dur=950,dec=+(el.getAttribute('data-dec')||0),
suf=el.getAttribute('data-suf')||'',grp=el.hasAttribute('data-group'),s0=null;
function step(ts){if(!s0)s0=ts;var p=Math.min((ts-s0)/dur,1),v=to*E(p),t;
if(grp){t=v.toLocaleString('fr-FR',{minimumFractionDigits:dec,maximumFractionDigits:dec});}
else{t=dec>0?v.toFixed(dec):String(Math.round(v));}
el.textContent=t+suf;if(p<1)requestAnimationFrame(step);}requestAnimationFrame(step);});})();</script>`;

const shell = (title: string, extra: string, body: string) =>
  `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${BASE}\n${extra}</style></head><body>${body}${SCRIPT}</body></html>`;

const acc = (a1: string, a2: string) => `:root{--a1:${a1};--a2:${a2}}`;

/* ===================== 1. SUIVI DE CHANTIERS · KANBAN ===================== */
const suivi = shell(
  "Suivi de chantiers",
  `${acc("#6366F1", "#8B5CF6")}
.board{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;align-items:start;margin-top:20px}
.col{background:#F5F5F8;border:1px solid var(--line);border-radius:18px;padding:12px 12px 4px}
.col-h{display:flex;align-items:center;justify-content:space-between;padding:6px 6px 12px}
.col-h b{font-size:13px;font-weight:600}
.count{font-size:11px;font-weight:700;color:var(--mut);background:#fff;border:1px solid var(--line);border-radius:9999px;padding:2px 9px}
.kc{background:#fff;border:1px solid var(--line);border-radius:14px;padding:13px 14px;box-shadow:0 1px 2px rgba(16,24,40,.05);margin-bottom:10px}
.kc-t{font-weight:600;font-size:14px}
.stack{display:flex}.stack .avatar{width:26px;height:26px;font-size:10px;border:2px solid #fff}.stack .avatar+.avatar{margin-left:-9px}
@media(max-width:820px){.board{grid-template-columns:1fr}}`,
  `<div class="bar"><div class="bar-l"><span class="logo">B</span><span class="bar-t">Chantiers</span></div><button class="btn">+ Nouveau chantier</button></div>
<div class="wrap">
  <div class="statline anim">
    <div class="stat"><div class="k">3</div><div class="l">Chantiers</div></div>
    <div class="stat"><div class="k f"><span data-to="417" data-group>0</span> k€</div><div class="l">Budget engagé</div></div>
    <div class="stat"><div class="k"><span data-to="50">0</span>%</div><div class="l">Avancement moyen</div></div>
    <div class="stat"><div class="k">18,4%</div><div class="l">Marge prévisionnelle</div></div>
  </div>
  <div class="board">
    <div class="col anim" style="--d:.05s">
      <div class="col-h"><b>En attente</b><span class="count">1</span></div>
      <div class="kc" style="border-top:3px solid #F59E0B">
        <div class="kc-t">École de Montbel</div><div class="muted" style="margin-top:2px">Mairie de Montbel</div>
        <div style="margin:12px 0 8px"><div class="track"><div class="fill" style="width:3%;background:#F59E0B"></div></div></div>
        <div style="display:flex;align-items:center;justify-content:space-between"><span class="muted">0 / 42 k€</span><span class="pill p-amber">Permis en attente</span></div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:12px;padding-top:12px;border-top:1px solid var(--line2)"><div class="stack"><span class="avatar" style="background:#A1A1AA">?</span></div><span class="muted">Début 1 juin</span></div>
      </div>
    </div>
    <div class="col anim" style="--d:.12s">
      <div class="col-h"><b>En cours</b><span class="count">2</span></div>
      <div class="kc" style="border-top:3px solid #6366F1">
        <div class="kc-t">Résidence Les Pins</div><div class="muted" style="margin-top:2px">Promo BTP Sud</div>
        <div style="margin:12px 0 8px"><div class="track"><div class="fill bx" style="width:51%"></div></div></div>
        <div style="display:flex;align-items:center;justify-content:space-between"><span class="muted">142 / 280 k€</span><span class="pill p-indigo">51%</span></div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:12px;padding-top:12px;border-top:1px solid var(--line2)"><div class="stack"><span class="avatar" style="background:#6366F1">MA</span><span class="avatar" style="background:#EC4899">SM</span><span class="avatar" style="background:#0EA5E9">LB</span></div><span class="muted">30 sept.</span></div>
      </div>
      <div class="kc" style="border-top:3px solid #6366F1">
        <div class="kc-t">Villa Amrani</div><div class="muted" style="margin-top:2px">M. et Mme Amrani</div>
        <div style="margin:12px 0 8px"><div class="track"><div class="fill bx" style="width:28%;--d:.25s"></div></div></div>
        <div style="display:flex;align-items:center;justify-content:space-between"><span class="muted">36 / 128 k€</span><span class="pill p-indigo">28%</span></div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:12px;padding-top:12px;border-top:1px solid var(--line2)"><div class="stack"><span class="avatar" style="background:#F59E0B">MA</span><span class="avatar" style="background:#10B981">AB</span></div><span class="muted">15 déc.</span></div>
      </div>
    </div>
    <div class="col anim" style="--d:.19s">
      <div class="col-h"><b>Livré</b><span class="count">1</span></div>
      <div class="kc" style="border-top:3px solid #10B981">
        <div class="kc-t">Extension Duval</div><div class="muted" style="margin-top:2px">Duval Logistique</div>
        <div style="margin:12px 0 8px"><div class="track"><div class="fill" style="width:100%;background:#10B981"></div></div></div>
        <div style="display:flex;align-items:center;justify-content:space-between"><span class="muted">95 / 95 k€</span><span class="pill p-green">Réceptionné</span></div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:12px;padding-top:12px;border-top:1px solid var(--line2)"><div class="stack"><span class="avatar" style="background:#10B981">LB</span><span class="avatar" style="background:#6366F1">SM</span></div><span class="muted">28 mars</span></div>
      </div>
    </div>
  </div>
</div>`
);

/* ===================== 2. DEVIS & FACTURES · DOCUMENT ===================== */
const devis = shell(
  "Devis & Factures",
  `${acc("#0F9D6E", "#14B8A6")}
.inv{display:grid;grid-template-columns:280px 1fr;gap:22px;align-items:start;margin-top:22px}
.list{display:flex;flex-direction:column;gap:9px}
.li{display:flex;align-items:center;gap:12px;padding:12px 14px;background:#fff;border:1px solid var(--line);border-radius:13px;cursor:pointer;transition:border .15s}
.li.sel{border-color:var(--a1);box-shadow:0 0 0 3px color-mix(in srgb,var(--a1) 15%,transparent)}
.li .n{font-weight:600;font-size:13px}
.paper{background:#fff;border:1px solid var(--line);border-radius:12px;box-shadow:0 26px 64px rgba(20,20,50,.11);padding:38px 42px}
.itbl{width:100%;border-collapse:collapse;margin-top:6px}
.itbl th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--mut2);font-weight:700;padding:11px 0;border-bottom:1px solid var(--line)}
.itbl th.r,.itbl td.r{text-align:right}
.itbl td{padding:13px 0;border-bottom:1px solid var(--line2);font-size:13px}
.tot{display:flex;justify-content:flex-end;margin-top:22px}
.tot-b{width:260px}
.tot-r{display:flex;justify-content:space-between;padding:7px 0;font-size:13px;color:var(--mut)}
.tot-r.big{border-top:2px solid var(--ink);margin-top:6px;padding-top:12px;color:var(--ink)}
.tot-r.big b{font-family:'Clash Display',sans-serif;font-size:22px;font-weight:600}
.stamp{display:inline-block;transform:rotate(-8deg);border:2px solid #059669;color:#059669;font-weight:800;letter-spacing:.1em;font-size:13px;padding:4px 12px;border-radius:8px}
@media(max-width:820px){.inv{grid-template-columns:1fr}.paper{padding:26px 22px}}
@media(max-width:560px){.paper{padding:20px 16px}.itbl th:nth-child(2),.itbl td:nth-child(2),.itbl th:nth-child(3),.itbl td:nth-child(3){display:none}.tot-b{width:100%}}`,
  `<div class="bar"><div class="bar-l"><span class="logo">B</span><span class="bar-t">Devis &amp; Factures</span></div><button class="btn">+ Nouveau devis</button></div>
<div class="wrap">
  <div class="statline anim">
    <div class="stat"><div class="k f"><span data-to="286" data-group>0</span> k€</div><div class="l">Encaissé 2026</div></div>
    <div class="stat"><div class="k">74%</div><div class="l">Taux d'acceptation</div></div>
    <div class="stat"><div class="k">5</div><div class="l">Devis en cours</div></div>
    <div class="stat"><div class="k" style="color:#E11D48"><span data-to="24">0</span> k€</div><div class="l">En retard</div></div>
  </div>
  <div class="inv">
    <div class="list anim" style="--d:.06s">
      <div class="li sel"><span class="avatar" style="background:#0F9D6E">RP</span><div style="flex:1;min-width:0"><div class="n">FAC-2026-018</div><div class="muted">Résidence Les Pins</div></div><span class="pill p-green">Payé</span></div>
      <div class="li"><span class="avatar" style="background:#6366F1">MM</span><div style="flex:1;min-width:0"><div class="n">DEV-2026-015</div><div class="muted">Mairie de Montbel</div></div><span class="pill p-blue">Envoyé</span></div>
      <div class="li"><span class="avatar" style="background:#F59E0B">DL</span><div style="flex:1;min-width:0"><div class="n">DEV-2026-014</div><div class="muted">Duval Logistique</div></div><span class="pill p-gray">Accepté</span></div>
      <div class="li"><span class="avatar" style="background:#E11D48">BT</span><div style="flex:1;min-width:0"><div class="n">FAC-2026-012</div><div class="muted">BTP Sud</div></div><span class="pill p-red">Retard</span></div>
    </div>
    <div class="paper anim" style="--d:.12s">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div><div style="display:flex;align-items:center;gap:10px"><span class="logo" style="width:34px;height:34px;border-radius:10px">B</span><b style="font-size:16px">Bâtisseurs du Sud</b></div><div class="muted" style="margin-top:8px;line-height:1.7">12 rue des Artisans<br>34000 Montpellier<br>SIRET 812 345 678 00021</div></div>
        <div style="text-align:right"><div class="f" style="font-size:26px">Facture</div><div class="muted" style="margin-top:4px">N° FAC-2026-018</div><div class="muted">Émise le 12 avril 2026</div><div style="margin-top:10px"><span class="stamp">PAYÉ</span></div></div>
      </div>
      <div style="margin-top:26px;padding:14px 16px;background:#FAFAFA;border-radius:10px"><div class="eyebrow">Facturé à</div><div style="font-weight:600;margin-top:5px">Promo BTP Sud</div><div class="muted">Résidence Les Pins · Allée des Pins, 34100 Montpellier</div></div>
      <table class="itbl">
        <thead><tr><th>Désignation</th><th class="r">Qté</th><th class="r">PU HT</th><th class="r">Total HT</th></tr></thead>
        <tbody>
          <tr><td>Maçonnerie fondations</td><td class="r">1</td><td class="r">28 000 €</td><td class="r">28 000 €</td></tr>
          <tr><td>Dalle béton armé · 180 m²</td><td class="r">180</td><td class="r">85 €</td><td class="r">15 300 €</td></tr>
          <tr><td>Élévation murs porteurs</td><td class="r">1</td><td class="r">4 700 €</td><td class="r">4 700 €</td></tr>
        </tbody>
      </table>
      <div class="tot"><div class="tot-b">
        <div class="tot-r"><span>Total HT</span><span>48 000 €</span></div>
        <div class="tot-r"><span>TVA 20%</span><span>9 600 €</span></div>
        <div class="tot-r big"><span>Total TTC</span><b>57 600 €</b></div>
      </div></div>
    </div>
  </div>
</div>`
);

/* ===================== 3. PLANNING · CALENDRIER SEMAINE ===================== */
const planning = shell(
  "Planning chantier",
  `${acc("#EA8C0C", "#F97316")}
.wknav{display:flex;align-items:center;gap:10px}
.wknav button{width:32px;height:32px;border-radius:9px;border:1px solid var(--line);background:#fff;cursor:pointer;font-size:15px;color:var(--mut)}
.cal{border:1px solid var(--line);border-radius:16px;overflow:hidden;background:#fff;margin-top:20px;box-shadow:0 1px 2px rgba(16,24,40,.04)}
.cal-h{display:grid;grid-template-columns:170px repeat(6,1fr);background:#FAFAFB;border-bottom:1px solid var(--line)}
.cal-h>div{padding:11px 10px;text-align:center;border-left:1px solid var(--line2)}
.cal-h>div:first-child{border-left:none;text-align:left;display:flex;align-items:center}
.dow{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--mut2);font-weight:700}
.dom{font-family:'Clash Display',sans-serif;font-weight:600;font-size:16px;margin-top:2px}
.today .dom{color:var(--a1)}
.cal-row{display:grid;grid-template-columns:170px 1fr;border-bottom:1px solid var(--line2)}
.cal-row:last-child{border-bottom:none}
.cal-lbl{padding:0 16px;display:flex;align-items:center;font-weight:600;font-size:13px;border-right:1px solid var(--line2)}
.cal-days{position:relative;display:grid;grid-template-columns:repeat(6,1fr);min-height:62px;background-image:linear-gradient(90deg,var(--line2) 1px,transparent 1px);background-size:calc(100%/6) 100%}
.task{align-self:center;height:36px;margin:0 5px;border-radius:9px;display:flex;align-items:center;gap:7px;padding:0 12px;font-size:12px;font-weight:600;color:#fff;box-shadow:0 6px 15px rgba(0,0,0,.13);transform-origin:left;overflow:hidden;white-space:nowrap}
.leg{display:flex;flex-wrap:wrap;gap:18px;margin-top:16px}
.leg span{display:inline-flex;align-items:center;gap:7px;font-size:12px;color:var(--mut)}
.leg i{width:10px;height:10px;border-radius:3px;display:inline-block}
@media(max-width:640px){.cal-h{display:none}.cal-row{grid-template-columns:1fr}.cal-lbl{border-right:none;padding:12px 14px 2px;font-size:13px}.cal-days{grid-template-columns:1fr;gap:7px;background:none;min-height:0;padding:2px 12px 14px}.task{grid-column:1 / -1 !important;margin:0;height:34px}.wknav span{display:none}}`,
  `<div class="bar"><div class="bar-l"><span class="logo">B</span><span class="bar-t">Planning chantier</span></div><div class="wknav"><button>‹</button><span style="font-weight:600;font-size:13px">Semaine 15 · avril 2026</span><button>›</button></div></div>
<div class="wrap">
  <div class="statline anim"><div class="stat"><div class="k">6</div><div class="l">Chantiers actifs</div></div><div class="stat"><div class="k">12</div><div class="l">Équipiers affectés</div></div><div class="stat"><div class="k">4</div><div class="l">Corps de métier</div></div></div>
  <div class="cal anim" style="--d:.08s">
    <div class="cal-h">
      <div><span class="eyebrow">Chantier</span></div>
      <div><div class="dow">Lun</div><div class="dom">7</div></div>
      <div><div class="dow">Mar</div><div class="dom">8</div></div>
      <div class="today"><div class="dow">Mer</div><div class="dom">9</div></div>
      <div><div class="dow">Jeu</div><div class="dom">10</div></div>
      <div><div class="dow">Ven</div><div class="dom">11</div></div>
      <div><div class="dow">Sam</div><div class="dom">12</div></div>
    </div>
    <div class="cal-row"><div class="cal-lbl">Résidence Les Pins</div><div class="cal-days"><div class="task bx" style="grid-column:1/4;background:linear-gradient(90deg,#EA8C0C,#F97316)">Cloisons · 4 pers.</div></div></div>
    <div class="cal-row"><div class="cal-lbl">Extension Duval</div><div class="cal-days"><div class="task bx" style="grid-column:2/5;background:#0EA5E9;--d:.2s">Plomberie · 2 pers.</div></div></div>
    <div class="cal-row"><div class="cal-lbl">École de Montbel</div><div class="cal-days"><div class="task bx" style="grid-column:4/7;background:#8B5CF6;--d:.3s">Peinture · 3 pers.</div></div></div>
    <div class="cal-row"><div class="cal-lbl">Villa Amrani</div><div class="cal-days"><div class="task bx" style="grid-column:1/3;background:#EA8C0C;--d:.4s">Terrassement</div><div class="task bx" style="grid-column:3/6;background:#10B981;--d:.5s">Dalle · 3 pers.</div></div></div>
    <div class="cal-row"><div class="cal-lbl">Local Rexel</div><div class="cal-days"><div class="task bx" style="grid-column:3/7;background:#0EA5E9;--d:.6s">Électricité · 2 pers.</div></div></div>
  </div>
  <div class="leg"><span><i style="background:#F97316"></i>Gros œuvre</span><span><i style="background:#0EA5E9"></i>Plomberie / CVC</span><span><i style="background:#8B5CF6"></i>Finitions</span><span><i style="background:#10B981"></i>Second œuvre</span></div>
</div>`
);

/* ===================== 4. POINTAGE · FEUILLE DE TEMPS ===================== */
const pointage = shell(
  "Pointage des heures",
  `${acc("#0C86D4", "#3B82F6")}
.sheet{width:100%;border-collapse:separate;border-spacing:0;background:#fff;border:1px solid var(--line);border-radius:16px;overflow:hidden;margin-top:20px;box-shadow:0 1px 2px rgba(16,24,40,.04)}
.sheet th{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--mut2);font-weight:700;padding:14px 8px;background:#FAFAFB;border-bottom:1px solid var(--line);text-align:center}
.sheet th:first-child{text-align:left;padding-left:18px}
.sheet th:last-child,.sheet td:last-child{border-left:1px solid var(--line2)}
.sheet td{padding:14px 8px;text-align:center;border-bottom:1px solid var(--line2);font-variant-numeric:tabular-nums;font-weight:600;color:var(--ink2)}
.sheet td:first-child{text-align:left;padding-left:18px}
.sheet tr:last-child td{border-bottom:none}
.emp{display:flex;align-items:center;gap:11px}
.emp .avatar{width:30px;height:30px;font-size:11px}
.tot{font-family:'Clash Display',sans-serif;font-weight:600;color:var(--a1);font-size:15px}
.ot{color:#C2410C;background:#FFF7ED;border-radius:7px;padding:3px 8px;display:inline-block}
.foot td{background:#FAFAFB;font-weight:700;border-top:1px solid var(--line)}
@media(max-width:760px){.sheet{font-size:12px}}
@media(max-width:640px){.sheet th:not(:first-child):not(:last-child),.sheet td:not(:first-child):not(:last-child){display:none}.sheet th,.sheet td{padding:13px 14px}.tot{font-size:16px}}`,
  `<div class="bar"><div class="bar-l"><span class="logo">B</span><span class="bar-t">Pointage des heures</span></div><span class="pill p-blue">Semaine 15 · 312 h</span></div>
<div class="wrap">
  <div class="statline anim"><div class="stat"><div class="k f"><span data-to="312">0</span> h</div><div class="l">Total semaine</div></div><div class="stat"><div class="k" style="color:#C2410C"><span data-to="14">0</span> h</div><div class="l">Heures supp.</div></div><div class="stat"><div class="k f"><span data-to="6840" data-group>0</span> €</div><div class="l">Coût main d'œuvre</div></div></div>
  <table class="sheet anim" style="--d:.08s">
    <thead><tr><th>Équipier</th><th>Lun</th><th>Mar</th><th>Mer</th><th>Jeu</th><th>Ven</th><th>Sam</th><th>Total</th></tr></thead>
    <tbody>
      <tr><td><div class="emp"><span class="avatar" style="background:#0C86D4">MA</span>Mohammed Amrani</div></td><td>8</td><td>8</td><td>8</td><td>8</td><td>8</td><td>·</td><td class="tot">40</td></tr>
      <tr><td><div class="emp"><span class="avatar" style="background:#F59E0B">LB</span>Lucas Bertrand</div></td><td>8</td><td>8</td><td>8</td><td>8</td><td><span class="ot">11</span></td><td>·</td><td class="tot">43</td></tr>
      <tr><td><div class="emp"><span class="avatar" style="background:#8B5CF6">SM</span>Sofia Moreau</div></td><td>7,5</td><td>8</td><td>7,5</td><td>8</td><td>6</td><td>·</td><td class="tot">37</td></tr>
      <tr><td><div class="emp"><span class="avatar" style="background:#10B981">AB</span>Ahmed Bouazza</div></td><td>8</td><td>7</td><td>8</td><td>4</td><td>8</td><td>·</td><td class="tot">35</td></tr>
      <tr><td><div class="emp"><span class="avatar" style="background:#EC4899">KB</span>Karim Benali</div></td><td>·</td><td>8</td><td>8</td><td>8</td><td>8</td><td>4</td><td class="tot">36</td></tr>
    </tbody>
    <tfoot><tr class="foot"><td>Total équipe</td><td>31,5</td><td>39</td><td>39,5</td><td>36</td><td>41</td><td>4</td><td class="tot">191</td></tr></tfoot>
  </table>
</div>`
);

/* ===================== 5. SOUS-TRAITANTS · ANNUAIRE ===================== */
const st = shell(
  "Sous-traitants",
  `${acc("#E11D5B", "#EC4899")}
.search{display:flex;align-items:center;gap:10px;background:#fff;border:1px solid var(--line);border-radius:12px;padding:11px 14px;max-width:380px;margin-top:20px;color:var(--mut2)}
.search input{border:none;outline:none;font-family:inherit;font-size:14px;width:100%;background:transparent;color:var(--ink)}
.dir{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;margin-top:16px}
.fiche{background:#fff;border:1px solid var(--line);border-radius:16px;padding:18px;box-shadow:0 1px 2px rgba(16,24,40,.05)}
.stars{color:#F59E0B;font-size:13px;letter-spacing:1.5px}
.comp{display:flex;flex-direction:column;gap:9px;margin-top:15px;padding-top:15px;border-top:1px solid var(--line2)}
.comp-r{display:flex;align-items:center;justify-content:space-between;font-size:12.5px}
.comp-r span:first-child{color:var(--mut)}
.link{font-size:12px;font-weight:600;color:var(--a1);margin-top:15px;display:inline-block}`,
  `<div class="bar"><div class="bar-l"><span class="logo">B</span><span class="bar-t">Sous-traitants</span></div><button class="btn">+ Ajouter</button></div>
<div class="wrap">
  <div class="statline anim"><div class="stat"><div class="k">3</div><div class="l">Actifs</div></div><div class="stat"><div class="k" style="color:#059669">2</div><div class="l">Conformes</div></div><div class="stat"><div class="k" style="color:#C2410C">1</div><div class="l">À renouveler</div></div><div class="stat"><div class="k f"><span data-to="155" data-group>0</span> k€</div><div class="l">CA sous-traité</div></div></div>
  <div class="search"><span>⌕</span><input placeholder="Rechercher un sous-traitant, un métier…" readonly></div>
  <div class="dir">
    <div class="fiche anim" style="--d:.05s">
      <div style="display:flex;align-items:center;gap:12px"><span class="avatar" style="background:#F59E0B;width:42px;height:42px;border-radius:13px">EP</span><div><div style="font-weight:600">Élec Pro Services</div><div class="muted">Électricité</div></div></div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:13px"><span class="stars">★★★★<span style="color:#E4E4E7">★</span></span><span class="muted">Jean-Luc Favre</span></div>
      <div class="comp"><div class="comp-r"><span>QUALIBAT</span><span class="pill p-green">Valide</span></div><div class="comp-r"><span>URSSAF</span><span class="pill p-green">Valide</span></div><div class="comp-r"><span>Décennale</span><span class="pill p-green">2027</span></div></div>
      <a class="link">Voir la fiche →</a>
    </div>
    <div class="fiche anim" style="--d:.12s">
      <div style="display:flex;align-items:center;gap:12px"><span class="avatar" style="background:#0EA5E9;width:42px;height:42px;border-radius:13px">PE</span><div><div style="font-weight:600">Plomba Expert</div><div class="muted">Plomberie</div></div></div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:13px"><span class="stars">★★★<span style="color:#E4E4E7">★★</span></span><span class="muted">Karim Benali</span></div>
      <div class="comp"><div class="comp-r"><span>QUALIBAT</span><span class="pill p-green">Valide</span></div><div class="comp-r"><span>URSSAF</span><span class="pill p-amber">Expire 12 j</span></div><div class="comp-r"><span>Décennale</span><span class="pill p-green">2026</span></div></div>
      <a class="link">Voir la fiche →</a>
    </div>
    <div class="fiche anim" style="--d:.19s">
      <div style="display:flex;align-items:center;gap:12px"><span class="avatar" style="background:#8B5CF6;width:42px;height:42px;border-radius:13px">PC</span><div><div style="font-weight:600">Peinture Couleurs Sud</div><div class="muted">Peinture</div></div></div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:13px"><span class="stars">★★★★★</span><span class="muted">Marie Vidal</span></div>
      <div class="comp"><div class="comp-r"><span>QUALIBAT</span><span class="pill p-green">Valide</span></div><div class="comp-r"><span>URSSAF</span><span class="pill p-green">Valide</span></div><div class="comp-r"><span>Décennale</span><span class="pill p-green">2028</span></div></div>
      <a class="link">Voir la fiche →</a>
    </div>
  </div>
</div>`
);

/* ===================== 6. TABLEAU DE BORD · COCKPIT ===================== */
const tb = shell(
  "Tableau de bord",
  `${acc("#6366F1", "#8B5CF6")}
.hero{position:relative;overflow:hidden;border-radius:22px;padding:30px 32px;color:#fff;background:linear-gradient(140deg,#0C0C15,#16161F 55%,#0C0C15);box-shadow:0 24px 60px rgba(10,10,22,.30);margin-top:20px}
.hero::before{content:'';position:absolute;inset:0;background:radial-gradient(60% 130% at 100% 0%,rgba(139,92,246,.55),transparent 58%),radial-gradient(50% 120% at 0% 100%,rgba(99,102,241,.4),transparent 55%)}
.hero>*{position:relative}
.hnum{font-family:'Clash Display',sans-serif;font-weight:600;font-size:58px;line-height:1;letter-spacing:-.035em}
.hlab{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}
.seg{display:flex;height:11px;border-radius:7px;overflow:hidden;background:rgba(255,255,255,.1);margin-top:24px}
.seg>span{height:100%;transform-origin:left}
.leg{display:flex;flex-wrap:wrap;gap:16px;margin-top:12px}
.leg span{display:inline-flex;align-items:center;gap:7px;font-size:12px;color:rgba(255,255,255,.72)}
.leg i{width:8px;height:8px;border-radius:3px}
.chip{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;padding:7px 12px;border-radius:9999px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.16)}
.ring{position:relative;width:96px;height:96px}
.ring .t{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.ins{display:flex;gap:12px;align-items:center;padding:14px 16px;background:#fff;border:1px solid var(--line);border-left:3px solid var(--a1);border-radius:0 12px 12px 0}
.ins-i{width:26px;height:26px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex-shrink:0}
.panel{background:#fff;border:1px solid var(--line);border-radius:18px;padding:20px 22px;box-shadow:0 1px 2px rgba(16,24,40,.05)}
.cols{display:grid;grid-template-columns:1.5fr 1fr;gap:16px;margin-top:14px}
.bars{display:flex;align-items:flex-end;gap:14px;height:140px;padding-top:8px}
.bcol{flex:1;display:flex;flex-direction:column;align-items:center;gap:8px;height:100%;justify-content:flex-end}
.bar{width:58%;border-radius:6px 6px 0 0;transform-origin:bottom;animation:gy 1s cubic-bezier(.16,1,.3,1) both}
@keyframes gy{from{transform:scaleY(0)}}
.crow{display:flex;align-items:center;gap:14px;padding:14px 2px;border-bottom:1px solid var(--line2)}
.crow:last-child{border-bottom:none}
.uline{height:3px;border-radius:2px;margin-top:8px}
.amt{font-family:'Clash Display',sans-serif;font-weight:600;font-size:16px}
@media(max-width:820px){.cols{grid-template-columns:1fr}}
@media(max-width:560px){.hero{padding:22px 18px}.hnum{font-size:38px}.ring{width:78px;height:78px}.crow{flex-wrap:wrap;gap:6px 10px}.crow>div:last-child{margin-left:auto}.bars{height:120px}}`,
  `<div class="bar"><div class="bar-l"><span class="logo">B</span><span class="bar-t">Tableau de bord</span></div><span class="pill p-indigo">Juillet 2026</span></div>
<div class="wrap">
  <div class="hero anim">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:24px;flex-wrap:wrap">
      <div>
        <div class="hlab" style="color:#FB7185;display:flex;align-items:center;gap:8px"><i style="width:8px;height:8px;border-radius:50%;background:#FB7185;display:inline-block"></i>Cash bloqué chez vos clients</div>
        <div class="hnum" style="margin:14px 0 8px"><span data-to="228900" data-group data-suf=" €">0</span></div>
        <div style="color:rgba(255,255,255,.62);font-size:13px">Sur <b style="color:#fff">13 factures</b> · <b style="color:#fff">21 dossiers</b> prioritaires</div>
      </div>
      <div style="display:flex;align-items:center;gap:14px">
        <div class="ring"><svg width="96" height="96" viewBox="0 0 96 96"><circle cx="48" cy="48" r="40" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="9"/><circle cx="48" cy="48" r="40" fill="none" stroke="#F59E0B" stroke-width="9" stroke-linecap="round" stroke-dasharray="251.3" stroke-dashoffset="158" transform="rotate(-90 48 48)"/></svg><div class="t"><b class="f" style="color:#fff;font-size:22px">37</b><small style="color:rgba(255,255,255,.55);font-size:9px;text-transform:uppercase;letter-spacing:.06em">score</small></div></div>
        <span class="chip" style="background:rgba(251,113,133,.16);border-color:rgba(251,113,133,.3)">DSO 58 j</span>
      </div>
    </div>
    <div class="seg"><span class="bx" style="width:38%;background:#10B981"></span><span class="bx" style="width:30%;background:#F59E0B;--d:.1s"></span><span class="bx" style="width:20%;background:#F97316;--d:.2s"></span><span class="bx" style="width:12%;background:#EF4444;--d:.3s"></span></div>
    <div class="leg"><span><i style="background:#10B981"></i>0 à 30 j · 87 k€</span><span><i style="background:#F59E0B"></i>30 à 60 j · 69 k€</span><span><i style="background:#F97316"></i>60 à 90 j · 46 k€</span><span><i style="background:#EF4444"></i>90 j et + · 27 k€</span></div>
  </div>

  <div style="display:grid;gap:10px;margin-top:14px">
    <div class="ins anim" style="--d:.05s;border-left-color:#F59E0B"><div class="ins-i" style="background:#FFF7ED;color:#C2410C">!</div><div><b>5 clients représentent 69%</b> de votre cash bloqué.</div></div>
    <div class="ins anim" style="--d:.1s;border-left-color:#10B981"><div class="ins-i" style="background:#ECFDF5;color:#059669">✓</div><div>Votre <b>DSO s'améliore de 8 jours</b> sur 3 mois.</div></div>
  </div>

  <div class="cols">
    <div class="panel anim" style="--d:.12s">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><b style="font-size:14px">Santé d'encaissement</b><span class="muted">6 mois</span></div>
      <svg viewBox="0 0 440 160" width="100%" height="160"><g stroke="#F1F1F6" stroke-width="1"><line x1="0" y1="30" x2="440" y2="30"/><line x1="0" y1="75" x2="440" y2="75"/><line x1="0" y1="120" x2="440" y2="120"/></g><defs><linearGradient id="la" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8B5CF6" stop-opacity=".25"/><stop offset="1" stop-color="#8B5CF6" stop-opacity="0"/></linearGradient></defs><path d="M0,40 L88,40 L176,46 L264,110 L352,138 L440,110 L440,160 L0,160 Z" fill="url(#la)"/><path d="M0,40 L88,40 L176,46 L264,110 L352,138 L440,110" fill="none" stroke="#8B5CF6" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="352" cy="138" r="4" fill="#EF4444"/><circle cx="440" cy="110" r="4.5" fill="#fff" stroke="#8B5CF6" stroke-width="2.5"/></svg>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--mut2);margin-top:6px"><span>Fév</span><span>Mars</span><span>Avr</span><span>Mai</span><span>Juin</span><span>Juil</span></div>
    </div>
    <div class="panel anim" style="--d:.18s">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><b style="font-size:14px">Encaissé par mois</b><span class="muted">k€</span></div>
      <div class="bars">
        <div class="bcol"><div class="bar" style="height:44%;background:#C4B5FD"></div><span class="muted" style="font-size:11px">Fév</span></div>
        <div class="bcol"><div class="bar" style="height:58%;background:#C4B5FD;animation-delay:.08s"></div><span class="muted" style="font-size:11px">Mars</span></div>
        <div class="bcol"><div class="bar" style="height:52%;background:#C4B5FD;animation-delay:.16s"></div><span class="muted" style="font-size:11px">Avr</span></div>
        <div class="bcol"><div class="bar" style="height:74%;background:#A78BFA;animation-delay:.24s"></div><span class="muted" style="font-size:11px">Mai</span></div>
        <div class="bcol"><div class="bar" style="height:88%;background:#8B5CF6;animation-delay:.32s"></div><span class="muted" style="font-size:11px">Juin</span></div>
        <div class="bcol"><div class="bar" style="height:100%;background:#8B5CF6;animation-delay:.4s"></div><span class="muted" style="font-size:11px">Juil</span></div>
      </div>
    </div>
  </div>

  <div class="panel anim" style="--d:.2s;margin-top:14px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><b style="font-size:14px">Clients qui bloquent votre cash</b><span class="link" style="color:var(--a1);font-size:12px;font-weight:600">Tous les clients →</span></div>
    <div class="crow"><span class="avatar" style="background:#E11D5B">IG</span><div style="flex:1;min-width:0"><div style="font-weight:600">Industria Group</div><div class="muted">3 factures · 48 j de retard</div><div class="uline" style="width:70%;background:#EF4444"></div></div><span class="pill p-amber">Silence relance</span><div style="text-align:right;width:150px"><div class="amt">77 700 €</div><div class="muted" style="color:var(--a1)">Escalade →</div></div></div>
    <div class="crow"><span class="avatar" style="background:#6366F1">VP</span><div style="flex:1;min-width:0"><div style="font-weight:600">Vertex Pharma</div><div class="muted">1 facture · 58 j de retard</div><div class="uline" style="width:52%;background:#F97316"></div></div><span class="pill p-amber">Retard</span><div style="text-align:right;width:150px"><div class="amt">57 400 €</div><div class="muted" style="color:var(--a1)">Relancer →</div></div></div>
    <div class="crow"><span class="avatar" style="background:#0EA5E9">OC</span><div style="flex:1;min-width:0"><div style="font-weight:600">Optima Conseil</div><div class="muted">1 facture · 45 j de retard</div><div class="uline" style="width:34%;background:#F59E0B"></div></div><span class="pill p-amber">Retard</span><div style="text-align:right;width:150px"><div class="amt">27 200 €</div><div class="muted" style="color:var(--a1)">Relancer →</div></div></div>
    <div class="crow"><span class="avatar" style="background:#10B981">SE</span><div style="flex:1;min-width:0"><div style="font-weight:600">Solis Énergie</div><div class="muted">2 factures · 17 j de retard</div><div class="uline" style="width:22%;background:#10B981"></div></div><span class="pill p-blue">Simple</span><div style="text-align:right;width:150px"><div class="amt">22 600 €</div><div class="muted" style="color:var(--a1)">Relancer →</div></div></div>
  </div>
</div>`
);

export const PREMIUM_APPS: TemplateApp[] = [
  { id: "suivi_chantiers", name: "Suivi de chantiers", emoji: "🏗️", category: "Gestion", categoryColor: "bg-indigo-50 text-indigo-600", description: "Vos chantiers en tableau kanban : avancement, budget, équipes.", html: suivi },
  { id: "devis_factures", name: "Devis & Factures", emoji: "🧾", category: "Commercial", categoryColor: "bg-emerald-50 text-emerald-600", description: "Devis et factures BTP prêts à imprimer, TVA et totaux automatiques.", html: devis },
  { id: "planning_chantier", name: "Planning chantier", emoji: "📅", category: "Planning", categoryColor: "bg-amber-50 text-amber-600", description: "Calendrier de la semaine : équipes affectées par chantier.", html: planning },
  { id: "pointage_equipes", name: "Pointage des heures", emoji: "⏱️", category: "RH", categoryColor: "bg-sky-50 text-sky-600", description: "Feuille de temps hebdo : heures et heures supp par équipier.", html: pointage },
  { id: "sous_traitants", name: "Sous-traitants", emoji: "🤝", category: "Conformité", categoryColor: "bg-rose-50 text-rose-600", description: "Annuaire de fiches : QUALIBAT, URSSAF, décennale et alertes.", html: st },
  { id: "tableau_bord", name: "Tableau de bord", emoji: "📊", category: "Pilotage", categoryColor: "bg-violet-50 text-violet-600", description: "Cockpit de direction : cash, encaissement et priorités.", html: tb },
];
