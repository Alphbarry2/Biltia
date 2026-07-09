import { PREMIUM_APPS } from "./templates-premium";

export type TemplateApp = {
  id: string;
  name: string;
  emoji: string;
  category: string;
  categoryColor: string;
  description: string;
  html: string;
};

const CSS = `@font-face{font-family:'Clash Display';src:url('/fonts/ClashDisplay-Variable.woff2') format('woff2');font-weight:300 700;font-display:swap}
@font-face{font-family:'Satoshi';src:url('/fonts/Satoshi-Variable.woff2') format('woff2');font-weight:300 900;font-display:swap}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--ink:#0A0A0A;--ink2:#232A3B;--mut:#6B7280;--mut2:#9AA0AE;--line:#ECECF2;--line2:#F4F4F8;
--grad:linear-gradient(120deg,#6366F1,#8B5CF6 38%,#EC4899 72%,#F97316);
--shadow:0 1px 2px rgba(16,24,40,.04),0 10px 30px rgba(99,102,241,.06);
--shadow-lg:0 2px 6px rgba(16,24,40,.05),0 24px 60px rgba(99,102,241,.13)}
body{background:#FCFCFD;background-image:radial-gradient(58% 52% at 6% -6%,rgba(99,102,241,.11),transparent 60%),radial-gradient(50% 48% at 100% 0%,rgba(236,72,153,.09),transparent 62%),radial-gradient(46% 60% at 92% 106%,rgba(249,115,22,.07),transparent 60%),radial-gradient(48% 52% at -6% 104%,rgba(20,184,166,.06),transparent 60%);background-attachment:fixed;font-family:'Satoshi',system-ui,-apple-system,sans-serif;color:var(--ink);font-size:14px;line-height:1.5;-webkit-font-smoothing:antialiased}
h1,h2,h3,.app-title,.kpi-value,.modal-title,.card-title{font-family:'Clash Display','Satoshi',system-ui,sans-serif;letter-spacing:-.025em}
.card{background:#fff;border:1px solid var(--line);border-radius:20px;padding:22px;overflow:hidden;box-shadow:var(--shadow)}
.card-title{font-size:16px;font-weight:600;color:var(--ink);margin-bottom:14px}
.kpi{position:relative;background:#fff;border:1px solid var(--line);border-radius:18px;padding:18px 20px;overflow:hidden;display:flex;flex-direction:column;gap:5px;box-shadow:var(--shadow)}
.kpi::before{content:'';position:absolute;top:0;left:0;bottom:0;width:3px;background:linear-gradient(180deg,#6366F1,#8B5CF6)}
.kpi::after{content:'';position:absolute;top:-38px;right:-38px;width:116px;height:116px;border-radius:50%;background:radial-gradient(circle,rgba(139,92,246,.11),transparent 70%);pointer-events:none}
.kpi:nth-child(4n+2)::before{background:linear-gradient(180deg,#EC4899,#F97316)}
.kpi:nth-child(4n+2)::after{background:radial-gradient(circle,rgba(236,72,153,.11),transparent 70%)}
.kpi:nth-child(4n+3)::before{background:linear-gradient(180deg,#F97316,#F59E0B)}
.kpi:nth-child(4n+3)::after{background:radial-gradient(circle,rgba(249,115,22,.12),transparent 70%)}
.kpi:nth-child(4n)::before{background:linear-gradient(180deg,#14B8A6,#6366F1)}
.kpi:nth-child(4n)::after{background:radial-gradient(circle,rgba(20,184,166,.12),transparent 70%)}
.kpi-label{font-size:10px;font-weight:700;color:var(--mut2);text-transform:uppercase;letter-spacing:.1em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kpi-value{font-size:27px;font-weight:600;color:var(--ink);line-height:1.05;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kpi-sub{font-size:11px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.btn{display:inline-flex;align-items:center;gap:6px;border:none;cursor:pointer;font-family:inherit;font-weight:600;transition:transform .12s,box-shadow .2s,background .2s;border-radius:12px;white-space:nowrap;font-size:13px;padding:10px 18px}
.btn:active{transform:scale(.97)}
.btn-ink{background:var(--grad);color:#fff;box-shadow:0 6px 18px rgba(124,58,190,.26)}
.btn-ink:hover{box-shadow:0 9px 24px rgba(124,58,190,.36);transform:translateY(-1px)}
.btn-ghost{background:#fff;color:var(--ink);border:1px solid var(--line)}.btn-ghost:hover{background:#F7F7FB;border-color:#E2E2EA}
.btn-danger{background:#FFF1F2;color:#E11D48;border:1px solid #FECDD3;padding:6px 12px;font-size:12px;border-radius:9px}.btn-danger:hover{background:#FEE2E2}
.btn-sm{padding:7px 14px;font-size:12px;border-radius:10px}
.badge{display:inline-flex;align-items:center;gap:5px;padding:4px 11px;border-radius:9999px;font-size:11px;font-weight:600;white-space:nowrap}
.badge::before{content:'';width:6px;height:6px;border-radius:50%;background:currentColor}
.badge-green{background:#ECFDF5;color:#059669}
.badge-red{background:#FFF1F2;color:#E11D48}
.badge-amber{background:#FFFBEB;color:#D97706}
.badge-gray{background:#F3F4F6;color:#6B7280}
input,select,textarea{font-family:inherit;font-size:14px;color:var(--ink);background:#fff;border:1px solid var(--line);border-radius:12px;padding:11px 14px;width:100%;outline:none;transition:border .15s,box-shadow .15s}
input:focus,select:focus,textarea:focus{border-color:#8B5CF6;box-shadow:0 0 0 3px rgba(139,92,246,.14)}
input::placeholder,textarea::placeholder{color:#B4B8C2}
.app-header{position:fixed;top:0;left:0;right:0;z-index:100;background:rgba(255,255,255,.78);backdrop-filter:blur(14px) saturate(180%);-webkit-backdrop-filter:blur(14px) saturate(180%);border-bottom:1px solid var(--line);height:62px;display:flex;align-items:center;justify-content:space-between;padding:0 18px}
.app-title{font-size:17px;font-weight:600;color:var(--ink);display:flex;align-items:center;gap:9px}
.tab-bar{position:fixed;bottom:0;left:0;right:0;background:rgba(255,255,255,.82);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-top:1px solid var(--line);display:flex;z-index:100}
.tab-item{position:relative;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:9px 4px 11px;cursor:pointer;border:none;background:none;font-size:10px;font-weight:600;color:var(--mut2);transition:color .15s;font-family:inherit}
.tab-item.active{color:#7C3AED}
.tab-item.active::before{content:'';position:absolute;top:0;left:50%;transform:translateX(-50%);width:34px;height:3px;border-radius:0 0 3px 3px;background:var(--grad)}
.app-main{padding-top:70px;padding-bottom:78px;min-height:100vh}
.kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;padding:18px}
.search-bar{padding:0 18px 14px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.section-pad{padding:0 18px 18px}
.table-wrap{background:#fff;border:1px solid var(--line);border-radius:20px;overflow:hidden;box-shadow:var(--shadow)}
table{width:100%;border-collapse:collapse}
th{font-size:10px;font-weight:700;color:var(--mut2);text-transform:uppercase;letter-spacing:.09em;padding:13px 18px;background:#FAFAFC;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap}
td{padding:15px 18px;border-bottom:1px solid var(--line2);color:var(--ink2);vertical-align:middle;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
td:first-child{font-weight:600;color:var(--ink)}
tr:last-child td{border-bottom:none}
tbody tr{transition:background .12s}
tbody tr:hover td{background:rgba(99,102,241,.035)}
.overlay{position:fixed;inset:0;background:rgba(15,17,33,.42);backdrop-filter:blur(6px);z-index:200;display:flex;align-items:flex-end;justify-content:center}
@media(min-width:600px){.overlay{align-items:center;padding:20px}}
.modal{background:#fff;border-radius:24px 24px 0 0;width:100%;max-width:560px;max-height:88vh;overflow-y:auto;padding:26px 22px;box-shadow:var(--shadow-lg)}
@media(min-width:600px){.modal{border-radius:24px}}
.modal-title{font-size:19px;font-weight:600;color:var(--ink);margin-bottom:22px}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media(max-width:480px){.form-row{grid-template-columns:1fr}}
.fg{margin-bottom:15px}
.fl{display:block;font-size:11px;font-weight:700;color:var(--mut);text-transform:uppercase;letter-spacing:.08em;margin-bottom:7px}
.modal-actions{display:flex;gap:10px;margin-top:22px}
.modal-actions .btn{flex:1;justify-content:center}
.empty{text-align:center;padding:64px 20px;color:var(--mut2);font-size:13px}
.prog-track{height:7px;background:#EEF0F6;border-radius:4px;overflow:hidden}
.prog-fill{height:100%;border-radius:4px;background:var(--grad);transition:width .5s cubic-bezier(.16,1,.3,1)}`;

const FONT_LINK = ``;

const BASE_APPS: TemplateApp[] = [
  {
    id: "suivi_chantiers",
    name: "Suivi de chantiers",
    emoji: "🏗️",
    category: "Gestion",
    categoryColor: "bg-blue-50 text-blue-600",
    description: "Gérez vos chantiers, suivez leur avancement et budget en temps réel.",
    html: `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Suivi de chantiers</title>
${FONT_LINK}
<style>${CSS}</style>
</head>
<body>
<div class="app-header">
  <span class="app-title">🏗️ Suivi de chantiers</span>
  <button class="btn btn-ink btn-sm" onclick="openModal()">+ Nouveau</button>
</div>
<div class="app-main">
  <div id="view-list">
    <div class="kpi-grid" id="kpi-grid"></div>
    <div class="search-bar">
      <input type="text" id="search" placeholder="Rechercher un chantier…" oninput="render()" style="max-width:260px">
      <select id="filter-status" onchange="render()" style="max-width:160px">
        <option value="">Tous les statuts</option>
        <option value="En cours">En cours</option>
        <option value="Terminé">Terminé</option>
        <option value="En attente">En attente</option>
      </select>
    </div>
    <div class="section-pad">
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Chantier</th><th>Client</th><th>Avancement</th><th>Budget</th><th>Statut</th><th></th>
          </tr></thead>
          <tbody id="tbody"></tbody>
        </table>
        <div id="empty" class="empty" style="display:none">Aucun chantier trouvé</div>
      </div>
    </div>
  </div>
  <div id="view-detail" style="display:none;padding:16px"></div>
</div>
<div class="tab-bar">
  <button class="tab-item active" id="tab-list" onclick="showTab('list')">📋<span>Chantiers</span></button>
  <button class="tab-item" id="tab-stats" onclick="showTab('stats')">📊<span>Stats</span></button>
</div>

<div class="overlay" id="overlay" style="display:none" onclick="closeModal()">
  <div class="modal" onclick="event.stopPropagation()">
    <div class="modal-title" id="modal-title">Nouveau chantier</div>
    <div class="fg"><label class="fl">Nom du chantier</label><input id="f-name" placeholder="Ex: Rénovation façade"></div>
    <div class="fg"><label class="fl">Client</label><input id="f-client" placeholder="Nom du client"></div>
    <div class="form-row">
      <div class="fg"><label class="fl">Budget (€)</label><input id="f-budget" type="number" placeholder="50000"></div>
      <div class="fg"><label class="fl">Dépensé (€)</label><input id="f-spent" type="number" placeholder="0"></div>
    </div>
    <div class="form-row">
      <div class="fg"><label class="fl">Date début</label><input id="f-start" type="date"></div>
      <div class="fg"><label class="fl">Date fin prévue</label><input id="f-end" type="date"></div>
    </div>
    <div class="fg"><label class="fl">Avancement (%)</label><input id="f-progress" type="number" min="0" max="100" placeholder="0"></div>
    <div class="fg"><label class="fl">Statut</label>
      <select id="f-status">
        <option>En attente</option><option>En cours</option><option>Terminé</option>
      </select>
    </div>
    <div class="fg"><label class="fl">Notes</label><textarea id="f-notes" rows="2" placeholder="Remarques…"></textarea></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
      <button class="btn btn-ink" onclick="saveItem()">Enregistrer</button>
    </div>
  </div>
</div>

<script>
const KEY = 'biltia_suivi_chantiers';
let items = [], editId = null, activeTab = 'list';

const DEFAULTS = [
  {id:1,name:'Résidence Les Pins',client:'Promo BTP Sud',budget:280000,spent:142000,progress:51,start:'2024-01-15',end:'2024-09-30',status:'En cours',notes:'Gros œuvre terminé, second œuvre en cours'},
  {id:2,name:'Extension entrepôt Duval',client:'Duval Logistique',budget:95000,spent:95000,progress:100,start:'2023-10-01',end:'2024-03-31',status:'Terminé',notes:'Réception effectuée le 28/03'},
  {id:3,name:'Réfection toiture école',client:'Mairie de Montbel',budget:42000,spent:0,progress:0,start:'2024-06-01',end:'2024-08-31',status:'En attente',notes:'Attente permis de construire'}
];

function load(){
  try{ items = JSON.parse(localStorage.getItem(KEY)||'null') || null; }catch(e){ items=null; }
  if(!items){ items=DEFAULTS; save(); }
}
function save(){ localStorage.setItem(KEY, JSON.stringify(items)); }
function nextId(){ return items.length ? Math.max(...items.map(i=>i.id))+1 : 1; }

function statusBadge(s){
  if(s==='Terminé') return '<span class="badge badge-green">Terminé</span>';
  if(s==='En cours') return '<span class="badge badge-amber">En cours</span>';
  return '<span class="badge badge-gray">En attente</span>';
}

function renderKpi(){
  const total = items.length;
  const enCours = items.filter(i=>i.status==='En cours').length;
  const termines = items.filter(i=>i.status==='Terminé').length;
  const budgetTotal = items.reduce((s,i)=>s+(+i.budget||0),0);
  document.getElementById('kpi-grid').innerHTML = \`
    <div class="kpi"><div class="kpi-label">Total chantiers</div><div class="kpi-value">\${total}</div></div>
    <div class="kpi"><div class="kpi-label">En cours</div><div class="kpi-value">\${enCours}</div></div>
    <div class="kpi"><div class="kpi-label">Terminés</div><div class="kpi-value">\${termines}</div></div>
    <div class="kpi"><div class="kpi-label">Budget total</div><div class="kpi-value">\${(budgetTotal/1000).toFixed(0)}k€</div></div>
  \`;
}

function render(){
  if(activeTab==='stats'){ renderStats(); return; }
  renderKpi();
  const q = (document.getElementById('search').value||'').toLowerCase();
  const fs = document.getElementById('filter-status').value;
  let list = items.filter(i=>{
    const match = !q || i.name.toLowerCase().includes(q) || i.client.toLowerCase().includes(q);
    const st = !fs || i.status===fs;
    return match && st;
  });
  const tbody = document.getElementById('tbody');
  const empty = document.getElementById('empty');
  if(!list.length){ tbody.innerHTML=''; empty.style.display=''; return; }
  empty.style.display='none';
  tbody.innerHTML = list.map(i=>\`
    <tr>
      <td style="font-weight:600;color:#0F172A">\${i.name}</td>
      <td>\${i.client}</td>
      <td style="min-width:120px">
        <div style="display:flex;align-items:center;gap:8px">
          <div class="prog-track" style="flex:1"><div class="prog-fill" style="width:\${i.progress||0}%"></div></div>
          <span style="font-size:11px;color:#6B7280;min-width:30px">\${i.progress||0}%</span>
        </div>
      </td>
      <td>\${(+i.budget||0).toLocaleString('fr-FR')} €</td>
      <td>\${statusBadge(i.status)}</td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn btn-ghost btn-sm" onclick="openModal(\${i.id})">✏️</button>
          <button class="btn btn-danger" onclick="deleteItem(\${i.id})">🗑</button>
        </div>
      </td>
    </tr>
  \`).join('');
}

function renderStats(){
  const budgetTotal = items.reduce((s,i)=>s+(+i.budget||0),0);
  const spentTotal = items.reduce((s,i)=>s+(+i.spent||0),0);
  const pct = budgetTotal ? Math.round(spentTotal/budgetTotal*100) : 0;
  document.getElementById('view-list').innerHTML = \`
    <div style="padding:16px;display:flex;flex-direction:column;gap:12px">
      <div class="kpi"><div class="kpi-label">Budget global</div><div class="kpi-value">\${budgetTotal.toLocaleString('fr-FR')} €</div></div>
      <div class="kpi"><div class="kpi-label">Dépenses réelles</div><div class="kpi-value">\${spentTotal.toLocaleString('fr-FR')} €</div><div class="kpi-sub">\${pct}% du budget consommé</div></div>
      <div class="card">
        <div style="font-weight:700;margin-bottom:12px">Répartition par statut</div>
        \${['En attente','En cours','Terminé'].map(s=>{
          const n = items.filter(i=>i.status===s).length;
          const p = items.length ? Math.round(n/items.length*100) : 0;
          return \`<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;margin-bottom:4px"><span>\${s}</span><span>\${n} (\${p}%)</span></div><div class="prog-track"><div class="prog-fill" style="width:\${p}%"></div></div></div>\`;
        }).join('')}
      </div>
    </div>
  \`;
}

function showTab(t){
  activeTab = t;
  document.getElementById('tab-list').className='tab-item'+(t==='list'?' active':'');
  document.getElementById('tab-stats').className='tab-item'+(t==='stats'?' active':'');
  if(t==='list'){
    document.getElementById('view-list').innerHTML = \`
      <div class="kpi-grid" id="kpi-grid"></div>
      <div class="search-bar">
        <input type="text" id="search" placeholder="Rechercher un chantier…" oninput="render()" style="max-width:260px">
        <select id="filter-status" onchange="render()" style="max-width:160px">
          <option value="">Tous les statuts</option>
          <option value="En cours">En cours</option>
          <option value="Terminé">Terminé</option>
          <option value="En attente">En attente</option>
        </select>
      </div>
      <div class="section-pad">
        <div class="table-wrap">
          <table><thead><tr><th>Chantier</th><th>Client</th><th>Avancement</th><th>Budget</th><th>Statut</th><th></th></tr></thead>
          <tbody id="tbody"></tbody></table>
          <div id="empty" class="empty" style="display:none">Aucun chantier trouvé</div>
        </div>
      </div>\`;
  }
  render();
}

function openModal(id){
  editId = id||null;
  document.getElementById('modal-title').textContent = id ? 'Modifier le chantier' : 'Nouveau chantier';
  const i = id ? items.find(x=>x.id===id) : {};
  document.getElementById('f-name').value = i.name||'';
  document.getElementById('f-client').value = i.client||'';
  document.getElementById('f-budget').value = i.budget||'';
  document.getElementById('f-spent').value = i.spent||'';
  document.getElementById('f-start').value = i.start||'';
  document.getElementById('f-end').value = i.end||'';
  document.getElementById('f-progress').value = i.progress||0;
  document.getElementById('f-status').value = i.status||'En attente';
  document.getElementById('f-notes').value = i.notes||'';
  document.getElementById('overlay').style.display='flex';
}

function closeModal(){ document.getElementById('overlay').style.display='none'; }

function saveItem(){
  const name = document.getElementById('f-name').value.trim();
  if(!name){ alert('Le nom est obligatoire'); return; }
  const obj = {
    id: editId||nextId(), name,
    client: document.getElementById('f-client').value.trim(),
    budget: +document.getElementById('f-budget').value||0,
    spent: +document.getElementById('f-spent').value||0,
    progress: Math.min(100,Math.max(0,+document.getElementById('f-progress').value||0)),
    start: document.getElementById('f-start').value,
    end: document.getElementById('f-end').value,
    status: document.getElementById('f-status').value,
    notes: document.getElementById('f-notes').value.trim()
  };
  if(editId){ items = items.map(i=>i.id===editId?obj:i); }
  else { items.push(obj); }
  save(); closeModal(); render();
}

function deleteItem(id){
  if(!confirm('Supprimer ce chantier ?')) return;
  items = items.filter(i=>i.id!==id);
  save(); render();
}

load(); render();
</script>
</body>
</html>`,
  },
  {
    id: "devis_factures",
    name: "Devis & Factures",
    emoji: "📋",
    category: "Commercial",
    categoryColor: "bg-green-50 text-green-600",
    description: "Créez et suivez vos devis et factures BTP avec calcul automatique.",
    html: `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Devis & Factures</title>
${FONT_LINK}
<style>${CSS}</style>
</head>
<body>
<div class="app-header">
  <span class="app-title">📋 Devis & Factures</span>
  <button class="btn btn-ink btn-sm" onclick="openModal()">+ Nouveau</button>
</div>
<div class="app-main">
  <div class="kpi-grid" id="kpi-grid"></div>
  <div class="search-bar">
    <input type="text" id="search" placeholder="Rechercher…" oninput="render()" style="max-width:220px">
    <select id="filter-type" onchange="render()" style="max-width:120px">
      <option value="">Tout</option>
      <option value="Devis">Devis</option>
      <option value="Facture">Factures</option>
    </select>
    <select id="filter-status" onchange="render()" style="max-width:140px">
      <option value="">Tous statuts</option>
      <option value="Brouillon">Brouillon</option>
      <option value="Envoyé">Envoyé</option>
      <option value="Accepté">Accepté</option>
      <option value="Payé">Payé</option>
      <option value="Refusé">Refusé</option>
    </select>
  </div>
  <div class="section-pad">
    <div class="table-wrap">
      <table>
        <thead><tr><th>N°</th><th>Type</th><th>Client</th><th>Objet</th><th>Montant HT</th><th>Statut</th><th></th></tr></thead>
        <tbody id="tbody"></tbody>
      </table>
      <div id="empty" class="empty" style="display:none">Aucun document trouvé</div>
    </div>
  </div>
</div>
<div class="tab-bar">
  <button class="tab-item active" onclick="">📋<span>Documents</span></button>
</div>

<div class="overlay" id="overlay" style="display:none" onclick="closeModal()">
  <div class="modal" onclick="event.stopPropagation()">
    <div class="modal-title" id="modal-title">Nouveau document</div>
    <div class="form-row">
      <div class="fg"><label class="fl">Type</label>
        <select id="f-type"><option>Devis</option><option>Facture</option></select>
      </div>
      <div class="fg"><label class="fl">Numéro</label><input id="f-num" placeholder="Ex: DEV-2024-001"></div>
    </div>
    <div class="fg"><label class="fl">Client</label><input id="f-client" placeholder="Nom du client"></div>
    <div class="fg"><label class="fl">Objet des travaux</label><input id="f-objet" placeholder="Description des travaux"></div>
    <div class="form-row">
      <div class="fg"><label class="fl">Montant HT (€)</label><input id="f-ht" type="number" placeholder="0" oninput="calcTTC()"></div>
      <div class="fg"><label class="fl">TVA (%)</label>
        <select id="f-tva" onchange="calcTTC()"><option value="20">20%</option><option value="10">10%</option><option value="5.5">5,5%</option><option value="0">0%</option></select>
      </div>
    </div>
    <div class="fg"><label class="fl">Montant TTC</label><input id="f-ttc" readonly style="background:#F7F7FB;font-weight:700"></div>
    <div class="form-row">
      <div class="fg"><label class="fl">Date émission</label><input id="f-date" type="date"></div>
      <div class="fg"><label class="fl">Date échéance</label><input id="f-echeance" type="date"></div>
    </div>
    <div class="fg"><label class="fl">Statut</label>
      <select id="f-status">
        <option>Brouillon</option><option>Envoyé</option><option>Accepté</option><option>Payé</option><option>Refusé</option>
      </select>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
      <button class="btn btn-ink" onclick="saveItem()">Enregistrer</button>
    </div>
  </div>
</div>

<script>
const KEY = 'biltia_devis_factures';
let items = [], editId = null;

const DEFAULTS = [
  {id:1,type:'Devis',num:'DEV-2024-001',client:'Résidence Les Pins',objet:'Travaux de maçonnerie - fondations',ht:48000,tva:20,date:'2024-01-10',echeance:'2024-02-10',status:'Accepté'},
  {id:2,type:'Facture',num:'FAC-2024-012',client:'Duval Logistique',objet:'Extension entrepôt - solde',ht:23750,tva:20,date:'2024-03-28',echeance:'2024-04-28',status:'Payé'},
  {id:3,type:'Devis',num:'DEV-2024-015',client:'Mairie de Montbel',objet:'Réfection toiture école primaire',ht:38500,tva:10,date:'2024-04-05',echeance:'2024-05-05',status:'Envoyé'}
];

function load(){
  try{ items=JSON.parse(localStorage.getItem(KEY)||'null')||null; }catch(e){ items=null; }
  if(!items){ items=DEFAULTS; save(); }
}
function save(){ localStorage.setItem(KEY,JSON.stringify(items)); }
function nextId(){ return items.length?Math.max(...items.map(i=>i.id))+1:1; }
function ttc(ht,tva){ return ht*(1+tva/100); }

function calcTTC(){
  const ht = +document.getElementById('f-ht').value||0;
  const tva = +document.getElementById('f-tva').value||0;
  document.getElementById('f-ttc').value = ttc(ht,tva).toLocaleString('fr-FR',{minimumFractionDigits:2})+'  €';
}

function statusBadge(s){
  const m = {Payé:'badge-green',Accepté:'badge-green',Envoyé:'badge-amber',Brouillon:'badge-gray',Refusé:'badge-red'};
  return \`<span class="badge \${m[s]||'badge-gray'}">\${s}</span>\`;
}

function renderKpi(){
  const total = items.reduce((s,i)=>s+ttc(+i.ht||0,+i.tva||0),0);
  const payes = items.filter(i=>i.status==='Payé').reduce((s,i)=>s+ttc(+i.ht||0,+i.tva||0),0);
  const attente = items.filter(i=>['Envoyé','Accepté'].includes(i.status)).reduce((s,i)=>s+ttc(+i.ht||0,+i.tva||0),0);
  document.getElementById('kpi-grid').innerHTML = \`
    <div class="kpi"><div class="kpi-label">CA total TTC</div><div class="kpi-value">\${(total/1000).toFixed(1)}k€</div></div>
    <div class="kpi"><div class="kpi-label">Encaissé</div><div class="kpi-value">\${(payes/1000).toFixed(1)}k€</div></div>
    <div class="kpi"><div class="kpi-label">En attente</div><div class="kpi-value">\${(attente/1000).toFixed(1)}k€</div></div>
    <div class="kpi"><div class="kpi-label">Documents</div><div class="kpi-value">\${items.length}</div></div>
  \`;
}

function render(){
  renderKpi();
  const q=(document.getElementById('search').value||'').toLowerCase();
  const ft=document.getElementById('filter-type').value;
  const fs=document.getElementById('filter-status').value;
  const list=items.filter(i=>{
    const m=!q||(i.client||'').toLowerCase().includes(q)||(i.num||'').toLowerCase().includes(q)||(i.objet||'').toLowerCase().includes(q);
    return m&&(!ft||i.type===ft)&&(!fs||i.status===fs);
  });
  const tbody=document.getElementById('tbody');
  const empty=document.getElementById('empty');
  if(!list.length){ tbody.innerHTML=''; empty.style.display=''; return; }
  empty.style.display='none';
  tbody.innerHTML=list.map(i=>\`
    <tr>
      <td style="font-weight:600;color:#7C3AED">\${i.num}</td>
      <td>\${i.type}</td>
      <td>\${i.client}</td>
      <td>\${i.objet}</td>
      <td style="font-weight:600">\${(+i.ht||0).toLocaleString('fr-FR')} €</td>
      <td>\${statusBadge(i.status)}</td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn btn-ghost btn-sm" onclick="openModal(\${i.id})">✏️</button>
          <button class="btn btn-danger" onclick="deleteItem(\${i.id})">🗑</button>
        </div>
      </td>
    </tr>
  \`).join('');
}

function openModal(id){
  editId=id||null;
  document.getElementById('modal-title').textContent=id?'Modifier le document':'Nouveau document';
  const i=id?items.find(x=>x.id===id):{};
  document.getElementById('f-type').value=i.type||'Devis';
  document.getElementById('f-num').value=i.num||'';
  document.getElementById('f-client').value=i.client||'';
  document.getElementById('f-objet').value=i.objet||'';
  document.getElementById('f-ht').value=i.ht||'';
  document.getElementById('f-tva').value=i.tva!=null?i.tva:20;
  document.getElementById('f-date').value=i.date||'';
  document.getElementById('f-echeance').value=i.echeance||'';
  document.getElementById('f-status').value=i.status||'Brouillon';
  calcTTC();
  document.getElementById('overlay').style.display='flex';
}
function closeModal(){ document.getElementById('overlay').style.display='none'; }

function saveItem(){
  const num=document.getElementById('f-num').value.trim();
  const client=document.getElementById('f-client').value.trim();
  if(!num||!client){ alert('Numéro et client obligatoires'); return; }
  const obj={
    id:editId||nextId(),
    type:document.getElementById('f-type').value,
    num,client,
    objet:document.getElementById('f-objet').value.trim(),
    ht:+document.getElementById('f-ht').value||0,
    tva:+document.getElementById('f-tva').value||0,
    date:document.getElementById('f-date').value,
    echeance:document.getElementById('f-echeance').value,
    status:document.getElementById('f-status').value
  };
  if(editId){ items=items.map(i=>i.id===editId?obj:i); }
  else{ items.push(obj); }
  save(); closeModal(); render();
}

function deleteItem(id){
  if(!confirm('Supprimer ce document ?')) return;
  items=items.filter(i=>i.id!==id);
  save(); render();
}

load(); render();
</script>
</body>
</html>`,
  },
  {
    id: "pointage_equipes",
    name: "Pointage des équipes",
    emoji: "⏱️",
    category: "RH",
    categoryColor: "bg-orange-50 text-orange-600",
    description: "Pointez les heures de vos équipes par chantier et calculez les coûts.",
    html: `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pointage des équipes</title>
${FONT_LINK}
<style>${CSS}</style>
</head>
<body>
<div class="app-header">
  <span class="app-title">⏱️ Pointage équipes</span>
  <button class="btn btn-ink btn-sm" onclick="openModal()">+ Pointer</button>
</div>
<div class="app-main">
  <div class="kpi-grid" id="kpi-grid"></div>
  <div class="search-bar">
    <input type="text" id="search" placeholder="Nom ou chantier…" oninput="render()" style="max-width:220px">
    <input type="date" id="filter-date" onchange="render()" style="max-width:150px">
    <button class="btn btn-ghost btn-sm" onclick="document.getElementById('filter-date').value='';render()">✕ Date</button>
  </div>
  <div class="section-pad">
    <div class="table-wrap">
      <table>
        <thead><tr><th>Date</th><th>Employé</th><th>Chantier</th><th>Heures</th><th>Taux/h</th><th>Coût</th><th>Type</th><th></th></tr></thead>
        <tbody id="tbody"></tbody>
      </table>
      <div id="empty" class="empty" style="display:none">Aucun pointage</div>
    </div>
  </div>
</div>
<div class="tab-bar">
  <button class="tab-item active" id="tab-list" onclick="showTab('list')">📋<span>Pointages</span></button>
  <button class="tab-item" id="tab-recap" onclick="showTab('recap')">👤<span>Par employé</span></button>
</div>

<div class="overlay" id="overlay" style="display:none" onclick="closeModal()">
  <div class="modal" onclick="event.stopPropagation()">
    <div class="modal-title" id="modal-title">Nouveau pointage</div>
    <div class="form-row">
      <div class="fg"><label class="fl">Date</label><input id="f-date" type="date"></div>
      <div class="fg"><label class="fl">Type</label>
        <select id="f-type"><option>Normal</option><option>Heure sup</option><option>Nuit</option><option>Dimanche</option></select>
      </div>
    </div>
    <div class="fg"><label class="fl">Employé</label><input id="f-employe" placeholder="Prénom Nom"></div>
    <div class="fg"><label class="fl">Chantier</label><input id="f-chantier" placeholder="Nom du chantier"></div>
    <div class="form-row">
      <div class="fg"><label class="fl">Heures travaillées</label><input id="f-heures" type="number" step="0.5" placeholder="8" oninput="calcCout()"></div>
      <div class="fg"><label class="fl">Taux horaire (€)</label><input id="f-taux" type="number" placeholder="18" oninput="calcCout()"></div>
    </div>
    <div class="fg"><label class="fl">Coût total</label><input id="f-cout" readonly style="background:#F7F7FB;font-weight:700"></div>
    <div class="fg"><label class="fl">Notes</label><textarea id="f-notes" rows="2" placeholder="Remarques…"></textarea></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
      <button class="btn btn-ink" onclick="saveItem()">Enregistrer</button>
    </div>
  </div>
</div>

<script>
const KEY='biltia_pointage_equipes';
let items=[],editId=null,activeTab='list';

const DEFAULTS=[
  {id:1,date:'2024-04-15',employe:'Mohammed Amrani',chantier:'Résidence Les Pins',heures:8,taux:18,type:'Normal',notes:''},
  {id:2,date:'2024-04-15',employe:'Lucas Bertrand',chantier:'Résidence Les Pins',heures:9,taux:20,type:'Heure sup',notes:'Rattrapage retard béton'},
  {id:3,date:'2024-04-16',employe:'Mohammed Amrani',chantier:'Extension Duval',heures:8,taux:18,type:'Normal',notes:'Coulage dalle'},
  {id:4,date:'2024-04-16',employe:'Sofia Moreau',chantier:'Résidence Les Pins',heures:7.5,taux:22,type:'Normal',notes:'Chef de chantier'},
  {id:5,date:'2024-04-17',employe:'Lucas Bertrand',chantier:'Résidence Les Pins',heures:8,taux:20,type:'Normal',notes:''}
];

function load(){
  try{ items=JSON.parse(localStorage.getItem(KEY)||'null')||null; }catch(e){ items=null; }
  if(!items){ items=DEFAULTS; save(); }
}
function save(){ localStorage.setItem(KEY,JSON.stringify(items)); }
function nextId(){ return items.length?Math.max(...items.map(i=>i.id))+1:1; }
function cout(h,t){ return (h||0)*(t||0); }

function calcCout(){
  const h=+document.getElementById('f-heures').value||0;
  const t=+document.getElementById('f-taux').value||0;
  document.getElementById('f-cout').value=(h*t).toLocaleString('fr-FR',{minimumFractionDigits:2})+' €';
}

function typeBadge(t){
  if(t==='Heure sup') return '<span class="badge badge-amber">H. sup</span>';
  if(t==='Nuit') return '<span class="badge badge-red">Nuit</span>';
  if(t==='Dimanche') return '<span class="badge badge-red">Dim.</span>';
  return '<span class="badge badge-gray">Normal</span>';
}

function renderKpi(){
  const totalH=items.reduce((s,i)=>s+(+i.heures||0),0);
  const totalC=items.reduce((s,i)=>s+cout(+i.heures||0,+i.taux||0),0);
  const employes=[...new Set(items.map(i=>i.employe))].length;
  document.getElementById('kpi-grid').innerHTML=\`
    <div class="kpi"><div class="kpi-label">Heures totales</div><div class="kpi-value">\${totalH.toFixed(1)}h</div></div>
    <div class="kpi"><div class="kpi-label">Coût main d'œuvre</div><div class="kpi-value">\${(totalC/1000).toFixed(1)}k€</div></div>
    <div class="kpi"><div class="kpi-label">Employés actifs</div><div class="kpi-value">\${employes}</div></div>
    <div class="kpi"><div class="kpi-label">Pointages</div><div class="kpi-value">\${items.length}</div></div>
  \`;
}

function render(){
  if(activeTab==='recap'){ renderRecap(); return; }
  renderKpi();
  const q=(document.getElementById('search').value||'').toLowerCase();
  const fd=document.getElementById('filter-date').value;
  const list=items.filter(i=>{
    const m=!q||(i.employe||'').toLowerCase().includes(q)||(i.chantier||'').toLowerCase().includes(q);
    return m&&(!fd||i.date===fd);
  }).sort((a,b)=>b.date.localeCompare(a.date));
  const tbody=document.getElementById('tbody');
  const empty=document.getElementById('empty');
  if(!list.length){ tbody.innerHTML=''; empty.style.display=''; return; }
  empty.style.display='none';
  tbody.innerHTML=list.map(i=>\`
    <tr>
      <td>\${i.date}</td>
      <td style="font-weight:600">\${i.employe}</td>
      <td>\${i.chantier}</td>
      <td style="font-weight:700;color:#7C3AED">\${i.heures}h</td>
      <td>\${i.taux} €</td>
      <td style="font-weight:600">\${cout(+i.heures,+i.taux).toLocaleString('fr-FR')} €</td>
      <td>\${typeBadge(i.type)}</td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn btn-ghost btn-sm" onclick="openModal(\${i.id})">✏️</button>
          <button class="btn btn-danger" onclick="deleteItem(\${i.id})">🗑</button>
        </div>
      </td>
    </tr>
  \`).join('');
}

function renderRecap(){
  const employes=[...new Set(items.map(i=>i.employe))];
  const rows=employes.map(e=>{
    const li=items.filter(i=>i.employe===e);
    const h=li.reduce((s,i)=>s+(+i.heures||0),0);
    const c=li.reduce((s,i)=>s+cout(+i.heures||0,+i.taux||0),0);
    return {e,h,c,n:li.length};
  }).sort((a,b)=>b.h-a.h);
  const maxH=Math.max(...rows.map(r=>r.h),1);
  document.getElementById('kpi-grid').innerHTML='';
  document.getElementById('tbody').innerHTML='';
  document.getElementById('empty').style.display='none';
  document.getElementById('tbody').closest('.table-wrap').style.display='none';

  let container=document.querySelector('#view-recap-container');
  if(!container){
    container=document.createElement('div');
    container.id='view-recap-container';
    container.style.cssText='padding:0 16px 16px';
    document.querySelector('.app-main').appendChild(container);
  }
  container.innerHTML=\`
    <div style="display:flex;flex-direction:column;gap:10px">
      \${rows.map(r=>\`
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
            <div style="font-weight:700;color:#0F172A">\${r.e}</div>
            <div style="font-size:12px;color:#6B7280">\${r.n} jour(s)</div>
          </div>
          <div style="display:flex;gap:16px;margin-bottom:8px">
            <div><div class="kpi-label">Heures</div><div style="font-weight:700;color:#7C3AED">\${r.h.toFixed(1)}h</div></div>
            <div><div class="kpi-label">Coût total</div><div style="font-weight:700">\${r.c.toLocaleString('fr-FR')} €</div></div>
          </div>
          <div class="prog-track"><div class="prog-fill" style="width:\${Math.round(r.h/maxH*100)}%"></div></div>
        </div>
      \`).join('')}
    </div>
  \`;
}

function showTab(t){
  activeTab=t;
  document.getElementById('tab-list').className='tab-item'+(t==='list'?' active':'');
  document.getElementById('tab-recap').className='tab-item'+(t==='recap'?' active':'');
  const rc=document.getElementById('view-recap-container');
  const tw=document.querySelector('.table-wrap');
  if(t==='list'){
    if(rc) rc.style.display='none';
    if(tw) tw.style.display='';
    renderKpi();
  }
  render();
}

function openModal(id){
  editId=id||null;
  document.getElementById('modal-title').textContent=id?'Modifier le pointage':'Nouveau pointage';
  const i=id?items.find(x=>x.id===id):{};
  document.getElementById('f-date').value=i.date||new Date().toISOString().split('T')[0];
  document.getElementById('f-employe').value=i.employe||'';
  document.getElementById('f-chantier').value=i.chantier||'';
  document.getElementById('f-heures').value=i.heures||8;
  document.getElementById('f-taux').value=i.taux||18;
  document.getElementById('f-type').value=i.type||'Normal';
  document.getElementById('f-notes').value=i.notes||'';
  calcCout();
  document.getElementById('overlay').style.display='flex';
}
function closeModal(){ document.getElementById('overlay').style.display='none'; }

function saveItem(){
  const employe=document.getElementById('f-employe').value.trim();
  if(!employe){ alert('Employé obligatoire'); return; }
  const obj={
    id:editId||nextId(),
    date:document.getElementById('f-date').value,
    employe,
    chantier:document.getElementById('f-chantier').value.trim(),
    heures:+document.getElementById('f-heures').value||0,
    taux:+document.getElementById('f-taux').value||0,
    type:document.getElementById('f-type').value,
    notes:document.getElementById('f-notes').value.trim()
  };
  if(editId){ items=items.map(i=>i.id===editId?obj:i); }
  else{ items.push(obj); }
  save(); closeModal(); render();
}

function deleteItem(id){
  if(!confirm('Supprimer ce pointage ?')) return;
  items=items.filter(i=>i.id!==id);
  save(); render();
}

load(); render();
</script>
</body>
</html>`,
  },
  {
    id: "sous_traitants",
    name: "Gestion sous-traitants",
    emoji: "🤝",
    category: "Achats",
    categoryColor: "bg-purple-50 text-purple-600",
    description: "Gérez vos sous-traitants, contrats et évaluations de performance.",
    html: `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Gestion sous-traitants</title>
${FONT_LINK}
<style>${CSS}</style>
</head>
<body>
<div class="app-header">
  <span class="app-title">🤝 Sous-traitants</span>
  <button class="btn btn-ink btn-sm" onclick="openModal()">+ Ajouter</button>
</div>
<div class="app-main">
  <div class="kpi-grid" id="kpi-grid"></div>
  <div class="search-bar">
    <input type="text" id="search" placeholder="Rechercher…" oninput="render()" style="max-width:220px">
    <select id="filter-metier" onchange="render()" style="max-width:160px">
      <option value="">Tous métiers</option>
      <option>Électricité</option><option>Plomberie</option><option>Peinture</option>
      <option>Menuiserie</option><option>Charpente</option><option>Couverture</option><option>Autre</option>
    </select>
  </div>
  <div class="section-pad">
    <div class="table-wrap">
      <table>
        <thead><tr><th>Société</th><th>Métier</th><th>Contact</th><th>Note /5</th><th>CA confié</th><th>Statut</th><th></th></tr></thead>
        <tbody id="tbody"></tbody>
      </table>
      <div id="empty" class="empty" style="display:none">Aucun sous-traitant</div>
    </div>
  </div>
</div>
<div class="tab-bar">
  <button class="tab-item active" id="tab-list" onclick="showTab('list')">📋<span>Liste</span></button>
  <button class="tab-item" id="tab-top" onclick="showTab('top')">⭐<span>Top ST</span></button>
</div>

<div class="overlay" id="overlay" style="display:none" onclick="closeModal()">
  <div class="modal" onclick="event.stopPropagation()">
    <div class="modal-title" id="modal-title">Nouveau sous-traitant</div>
    <div class="fg"><label class="fl">Raison sociale</label><input id="f-nom" placeholder="Nom de la société"></div>
    <div class="form-row">
      <div class="fg"><label class="fl">Métier</label>
        <select id="f-metier"><option>Électricité</option><option>Plomberie</option><option>Peinture</option><option>Menuiserie</option><option>Charpente</option><option>Couverture</option><option>Autre</option></select>
      </div>
      <div class="fg"><label class="fl">SIRET</label><input id="f-siret" placeholder="123 456 789 00012"></div>
    </div>
    <div class="fg"><label class="fl">Contact principal</label><input id="f-contact" placeholder="Prénom Nom"></div>
    <div class="form-row">
      <div class="fg"><label class="fl">Téléphone</label><input id="f-tel" type="tel" placeholder="06 XX XX XX XX"></div>
      <div class="fg"><label class="fl">Email</label><input id="f-email" type="email" placeholder="contact@sté.fr"></div>
    </div>
    <div class="form-row">
      <div class="fg"><label class="fl">Note /5</label><input id="f-note" type="number" min="0" max="5" step="0.5" placeholder="4.5"></div>
      <div class="fg"><label class="fl">CA confié (€)</label><input id="f-ca" type="number" placeholder="0"></div>
    </div>
    <div class="fg"><label class="fl">Statut</label>
      <select id="f-status"><option>Actif</option><option>Inactif</option><option>Blacklisté</option></select>
    </div>
    <div class="fg"><label class="fl">Commentaire</label><textarea id="f-comment" rows="2" placeholder="Remarques qualité, délais…"></textarea></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
      <button class="btn btn-ink" onclick="saveItem()">Enregistrer</button>
    </div>
  </div>
</div>

<script>
const KEY='biltia_sous_traitants';
let items=[],editId=null,activeTab='list';

const DEFAULTS=[
  {id:1,nom:'Élec Pro Services',metier:'Électricité',siret:'412 345 678 00021',contact:'Jean-Luc Favre',tel:'06 12 34 56 78',email:'jlf@elecpro.fr',note:4.5,ca:85000,status:'Actif',comment:'Sérieux, toujours dans les délais'},
  {id:2,nom:'Plomba Expert',metier:'Plomberie',siret:'502 876 543 00018',contact:'Karim Benali',tel:'06 98 76 54 32',email:'k.benali@plomba.fr',note:3.5,ca:42000,status:'Actif',comment:'Bon technicien, facturation parfois en retard'},
  {id:3,nom:'Peinture Couleurs Sud',metier:'Peinture',siret:'332 111 222 00034',contact:'Marie Vidal',tel:'07 11 22 33 44',email:'mvidal@couleurs-sud.fr',note:5,ca:28500,status:'Actif',comment:'Excellent rendu, recommandé pour chantiers premium'}
];

function load(){
  try{ items=JSON.parse(localStorage.getItem(KEY)||'null')||null; }catch(e){ items=null; }
  if(!items){ items=DEFAULTS; save(); }
}
function save(){ localStorage.setItem(KEY,JSON.stringify(items)); }
function nextId(){ return items.length?Math.max(...items.map(i=>i.id))+1:1; }

function stars(n){
  const full=Math.floor(n||0);
  return '★'.repeat(full)+'☆'.repeat(5-full);
}

function statusBadge(s){
  if(s==='Actif') return '<span class="badge badge-green">Actif</span>';
  if(s==='Blacklisté') return '<span class="badge badge-red">Blacklisté</span>';
  return '<span class="badge badge-gray">Inactif</span>';
}

function renderKpi(){
  const actifs=items.filter(i=>i.status==='Actif').length;
  const caTotal=items.reduce((s,i)=>s+(+i.ca||0),0);
  const noteM=items.length?items.reduce((s,i)=>s+(+i.note||0),0)/items.length:0;
  document.getElementById('kpi-grid').innerHTML=\`
    <div class="kpi"><div class="kpi-label">Sous-traitants</div><div class="kpi-value">\${items.length}</div></div>
    <div class="kpi"><div class="kpi-label">Actifs</div><div class="kpi-value">\${actifs}</div></div>
    <div class="kpi"><div class="kpi-label">CA confié total</div><div class="kpi-value">\${(caTotal/1000).toFixed(0)}k€</div></div>
    <div class="kpi"><div class="kpi-label">Note moyenne</div><div class="kpi-value">\${noteM.toFixed(1)}/5</div></div>
  \`;
}

function render(){
  if(activeTab==='top'){ renderTop(); return; }
  renderKpi();
  const q=(document.getElementById('search').value||'').toLowerCase();
  const fm=document.getElementById('filter-metier').value;
  const list=items.filter(i=>{
    const m=!q||(i.nom||'').toLowerCase().includes(q)||(i.contact||'').toLowerCase().includes(q);
    return m&&(!fm||i.metier===fm);
  });
  const tbody=document.getElementById('tbody');
  const empty=document.getElementById('empty');
  if(!list.length){ tbody.innerHTML=''; empty.style.display=''; return; }
  empty.style.display='none';
  tbody.innerHTML=list.map(i=>\`
    <tr>
      <td style="font-weight:700;color:#0F172A">\${i.nom}</td>
      <td>\${i.metier}</td>
      <td>\${i.contact}</td>
      <td style="color:#F59E0B">\${stars(i.note)} <span style="color:#6B7280;font-size:11px">(\${i.note||0})</span></td>
      <td>\${(+i.ca||0).toLocaleString('fr-FR')} €</td>
      <td>\${statusBadge(i.status)}</td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn btn-ghost btn-sm" onclick="openModal(\${i.id})">✏️</button>
          <button class="btn btn-danger" onclick="deleteItem(\${i.id})">🗑</button>
        </div>
      </td>
    </tr>
  \`).join('');
}

function renderTop(){
  const sorted=[...items].filter(i=>i.status==='Actif').sort((a,b)=>(+b.note||0)-(+a.note||0));
  document.getElementById('kpi-grid').innerHTML='';
  document.getElementById('tbody').innerHTML='';
  document.getElementById('empty').style.display='none';
  let cont=document.getElementById('top-container');
  if(!cont){
    cont=document.createElement('div');
    cont.id='top-container';
    cont.style.cssText='padding:0 16px 16px';
    document.querySelector('.app-main').appendChild(cont);
  }
  cont.style.display='';
  cont.innerHTML=sorted.length?sorted.map((i,idx)=>\`
    <div class="card" style="margin-bottom:10px">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="font-size:22px;font-weight:900;color:\${idx===0?'#F59E0B':idx===1?'#9CA3AF':'#B45309'}">#\${idx+1}</div>
        <div style="flex:1">
          <div style="font-weight:700">\${i.nom}</div>
          <div style="font-size:12px;color:#6B7280">\${i.metier} • \${i.contact}</div>
          <div style="color:#F59E0B;margin-top:4px">\${stars(i.note)} <span style="color:#6B7280;font-size:11px">(\${i.note}/5)</span></div>
        </div>
        <div style="text-align:right">
          <div style="font-weight:700;color:#7C3AED">\${(+i.ca||0).toLocaleString('fr-FR')} €</div>
          <div style="font-size:11px;color:#9CA3AF">CA confié</div>
        </div>
      </div>
      \${i.comment?\`<div style="margin-top:8px;font-size:12px;color:#6B7280;font-style:italic">"\${i.comment}"</div>\`:''}
    </div>
  \`).join(''):'<div class="empty">Aucun sous-traitant actif</div>';
}

function showTab(t){
  activeTab=t;
  document.getElementById('tab-list').className='tab-item'+(t==='list'?' active':'');
  document.getElementById('tab-top').className='tab-item'+(t==='top'?' active':'');
  const tc=document.getElementById('top-container');
  if(tc) tc.style.display=t==='top'?'':'none';
  const tw=document.querySelector('.table-wrap');
  const sb=document.querySelector('.search-bar');
  if(tw) tw.style.display=t==='list'?'':'none';
  if(sb) sb.style.display=t==='list'?'':'none';
  if(t==='list') renderKpi();
  render();
}

function openModal(id){
  editId=id||null;
  document.getElementById('modal-title').textContent=id?'Modifier sous-traitant':'Nouveau sous-traitant';
  const i=id?items.find(x=>x.id===id):{};
  document.getElementById('f-nom').value=i.nom||'';
  document.getElementById('f-metier').value=i.metier||'Électricité';
  document.getElementById('f-siret').value=i.siret||'';
  document.getElementById('f-contact').value=i.contact||'';
  document.getElementById('f-tel').value=i.tel||'';
  document.getElementById('f-email').value=i.email||'';
  document.getElementById('f-note').value=i.note||'';
  document.getElementById('f-ca').value=i.ca||'';
  document.getElementById('f-status').value=i.status||'Actif';
  document.getElementById('f-comment').value=i.comment||'';
  document.getElementById('overlay').style.display='flex';
}
function closeModal(){ document.getElementById('overlay').style.display='none'; }

function saveItem(){
  const nom=document.getElementById('f-nom').value.trim();
  if(!nom){ alert('Nom obligatoire'); return; }
  const obj={
    id:editId||nextId(),nom,
    metier:document.getElementById('f-metier').value,
    siret:document.getElementById('f-siret').value.trim(),
    contact:document.getElementById('f-contact').value.trim(),
    tel:document.getElementById('f-tel').value.trim(),
    email:document.getElementById('f-email').value.trim(),
    note:Math.min(5,Math.max(0,+document.getElementById('f-note').value||0)),
    ca:+document.getElementById('f-ca').value||0,
    status:document.getElementById('f-status').value,
    comment:document.getElementById('f-comment').value.trim()
  };
  if(editId){ items=items.map(i=>i.id===editId?obj:i); }
  else{ items.push(obj); }
  save(); closeModal(); render();
}

function deleteItem(id){
  if(!confirm('Supprimer ce sous-traitant ?')) return;
  items=items.filter(i=>i.id!==id);
  save(); render();
}

load(); render();
</script>
</body>
</html>`,
  },
  {
    id: "fiche_intervention",
    name: "Fiche d'intervention",
    emoji: "🔧",
    category: "SAV",
    categoryColor: "bg-red-50 text-red-600",
    description: "Créez et suivez les fiches d'intervention terrain de vos techniciens.",
    html: `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Fiches d'intervention</title>
${FONT_LINK}
<style>${CSS}</style>
</head>
<body>
<div class="app-header">
  <span class="app-title">🔧 Interventions</span>
  <button class="btn btn-ink btn-sm" onclick="openModal()">+ Nouvelle</button>
</div>
<div class="app-main">
  <div class="kpi-grid" id="kpi-grid"></div>
  <div class="search-bar">
    <input type="text" id="search" placeholder="Rechercher…" oninput="render()" style="max-width:220px">
    <select id="filter-status" onchange="render()" style="max-width:150px">
      <option value="">Tous statuts</option>
      <option>Planifiée</option><option>En cours</option><option>Terminée</option><option>À valider</option>
    </select>
  </div>
  <div class="section-pad">
    <div class="table-wrap">
      <table>
        <thead><tr><th>N°</th><th>Client / Site</th><th>Technicien</th><th>Date</th><th>Durée</th><th>Type</th><th>Statut</th><th></th></tr></thead>
        <tbody id="tbody"></tbody>
      </table>
      <div id="empty" class="empty" style="display:none">Aucune intervention</div>
    </div>
  </div>
</div>
<div class="tab-bar">
  <button class="tab-item active" id="tab-list" onclick="showTab('list')">📋<span>Fiches</span></button>
  <button class="tab-item" id="tab-tech" onclick="showTab('tech')">👷<span>Techniciens</span></button>
</div>

<div class="overlay" id="overlay" style="display:none" onclick="closeModal()">
  <div class="modal" onclick="event.stopPropagation()">
    <div class="modal-title" id="modal-title">Nouvelle intervention</div>
    <div class="form-row">
      <div class="fg"><label class="fl">N° fiche</label><input id="f-num" placeholder="INT-2024-001"></div>
      <div class="fg"><label class="fl">Type</label>
        <select id="f-type"><option>Dépannage</option><option>Maintenance</option><option>Mise en service</option><option>Contrôle</option></select>
      </div>
    </div>
    <div class="fg"><label class="fl">Client / Site</label><input id="f-client" placeholder="Nom du client"></div>
    <div class="fg"><label class="fl">Adresse du site</label><input id="f-adresse" placeholder="Adresse complète"></div>
    <div class="fg"><label class="fl">Technicien</label><input id="f-tech" placeholder="Prénom Nom"></div>
    <div class="form-row">
      <div class="fg"><label class="fl">Date</label><input id="f-date" type="date"></div>
      <div class="fg"><label class="fl">Durée (h)</label><input id="f-duree" type="number" step="0.5" placeholder="2"></div>
    </div>
    <div class="fg"><label class="fl">Description des travaux</label><textarea id="f-desc" rows="3" placeholder="Travaux effectués…"></textarea></div>
    <div class="fg"><label class="fl">Pièces utilisées</label><textarea id="f-pieces" rows="2" placeholder="Réf pièces, quantités…"></textarea></div>
    <div class="fg"><label class="fl">Statut</label>
      <select id="f-status"><option>Planifiée</option><option>En cours</option><option>Terminée</option><option>À valider</option></select>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
      <button class="btn btn-ink" onclick="saveItem()">Enregistrer</button>
    </div>
  </div>
</div>

<script>
const KEY='biltia_fiche_intervention';
let items=[],editId=null,activeTab='list';

const DEFAULTS=[
  {id:1,num:'INT-2024-001',type:'Dépannage',client:'Mairie de Montbel',adresse:'12 rue de la Paix, 34000 Montbel',tech:'Pierre Leroux',date:'2024-04-10',duree:3,desc:'Réparation fuite toiture côté nord, remplacement tuiles cassées suite tempête',pieces:'12x tuiles mécaniques réf TM220, 2x liteaux 60x40',status:'Terminée'},
  {id:2,num:'INT-2024-002',type:'Maintenance',client:'Résidence Les Pins',adresse:'Allée des Pins, 34100 Montpellier',tech:'Ahmed Bouazza',date:'2024-04-15',duree:4,desc:'Maintenance préventive chaudière collective + vérification radiateurs',pieces:'Filtre fioul réf FF45, joint 3/4"x2',status:'Terminée'},
  {id:3,num:'INT-2024-003',type:'Contrôle',client:'Duval Logistique',adresse:'ZI Nord, 34400 Lunel',tech:'Pierre Leroux',date:'2024-04-22',duree:2,desc:'Contrôle conformité installation électrique bâtiment extension',pieces:'',status:'Planifiée'}
];

function load(){
  try{ items=JSON.parse(localStorage.getItem(KEY)||'null')||null; }catch(e){ items=null; }
  if(!items){ items=DEFAULTS; save(); }
}
function save(){ localStorage.setItem(KEY,JSON.stringify(items)); }
function nextId(){ return items.length?Math.max(...items.map(i=>i.id))+1:1; }

function statusBadge(s){
  if(s==='Terminée') return '<span class="badge badge-green">Terminée</span>';
  if(s==='En cours') return '<span class="badge badge-amber">En cours</span>';
  if(s==='À valider') return '<span class="badge badge-amber">À valider</span>';
  return '<span class="badge badge-gray">Planifiée</span>';
}

function renderKpi(){
  const total=items.length;
  const terminees=items.filter(i=>i.status==='Terminée').length;
  const hTotal=items.reduce((s,i)=>s+(+i.duree||0),0);
  const techs=[...new Set(items.map(i=>i.tech).filter(Boolean))].length;
  document.getElementById('kpi-grid').innerHTML=\`
    <div class="kpi"><div class="kpi-label">Interventions</div><div class="kpi-value">\${total}</div></div>
    <div class="kpi"><div class="kpi-label">Terminées</div><div class="kpi-value">\${terminees}</div></div>
    <div class="kpi"><div class="kpi-label">Heures totales</div><div class="kpi-value">\${hTotal}h</div></div>
    <div class="kpi"><div class="kpi-label">Techniciens</div><div class="kpi-value">\${techs}</div></div>
  \`;
}

function render(){
  if(activeTab==='tech'){ renderTech(); return; }
  renderKpi();
  const q=(document.getElementById('search').value||'').toLowerCase();
  const fs=document.getElementById('filter-status').value;
  const list=items.filter(i=>{
    const m=!q||(i.client||'').toLowerCase().includes(q)||(i.tech||'').toLowerCase().includes(q)||(i.num||'').toLowerCase().includes(q);
    return m&&(!fs||i.status===fs);
  }).sort((a,b)=>b.date.localeCompare(a.date));
  const tbody=document.getElementById('tbody');
  const empty=document.getElementById('empty');
  if(!list.length){ tbody.innerHTML=''; empty.style.display=''; return; }
  empty.style.display='none';
  tbody.innerHTML=list.map(i=>\`
    <tr>
      <td style="font-weight:600;color:#7C3AED">\${i.num}</td>
      <td style="font-weight:600">\${i.client}</td>
      <td>\${i.tech}</td>
      <td>\${i.date}</td>
      <td>\${i.duree}h</td>
      <td>\${i.type}</td>
      <td>\${statusBadge(i.status)}</td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn btn-ghost btn-sm" onclick="openModal(\${i.id})">✏️</button>
          <button class="btn btn-danger" onclick="deleteItem(\${i.id})">🗑</button>
        </div>
      </td>
    </tr>
  \`).join('');
}

function renderTech(){
  const techs=[...new Set(items.map(i=>i.tech).filter(Boolean))];
  const rows=techs.map(t=>{
    const li=items.filter(i=>i.tech===t);
    const h=li.reduce((s,i)=>s+(+i.duree||0),0);
    const done=li.filter(i=>i.status==='Terminée').length;
    return {t,h,done,n:li.length};
  }).sort((a,b)=>b.h-a.h);
  let cont=document.getElementById('tech-container');
  if(!cont){ cont=document.createElement('div'); cont.id='tech-container'; cont.style.cssText='padding:0 16px 16px'; document.querySelector('.app-main').appendChild(cont); }
  cont.style.display='';
  document.querySelector('.search-bar').style.display='none';
  document.querySelector('.table-wrap').style.display='none';
  document.getElementById('kpi-grid').innerHTML='';
  cont.innerHTML=rows.map(r=>\`
    <div class="card" style="margin-bottom:10px">
      <div style="font-weight:700;font-size:15px;margin-bottom:6px">👷 \${r.t}</div>
      <div style="display:flex;gap:20px">
        <div><div class="kpi-label">Interventions</div><div style="font-weight:700">\${r.n}</div></div>
        <div><div class="kpi-label">Terminées</div><div style="font-weight:700;color:#7C3AED">\${r.done}</div></div>
        <div><div class="kpi-label">Heures</div><div style="font-weight:700">\${r.h}h</div></div>
      </div>
    </div>
  \`).join('');
}

function showTab(t){
  activeTab=t;
  document.getElementById('tab-list').className='tab-item'+(t==='list'?' active':'');
  document.getElementById('tab-tech').className='tab-item'+(t==='tech'?' active':'');
  const tc=document.getElementById('tech-container');
  if(t==='list'){
    if(tc) tc.style.display='none';
    const sb=document.querySelector('.search-bar'); if(sb) sb.style.display='';
    const tw=document.querySelector('.table-wrap'); if(tw) tw.style.display='';
    renderKpi();
  }
  render();
}

function openModal(id){
  editId=id||null;
  document.getElementById('modal-title').textContent=id?'Modifier fiche':'Nouvelle intervention';
  const i=id?items.find(x=>x.id===id):{};
  document.getElementById('f-num').value=i.num||'';
  document.getElementById('f-type').value=i.type||'Dépannage';
  document.getElementById('f-client').value=i.client||'';
  document.getElementById('f-adresse').value=i.adresse||'';
  document.getElementById('f-tech').value=i.tech||'';
  document.getElementById('f-date').value=i.date||new Date().toISOString().split('T')[0];
  document.getElementById('f-duree').value=i.duree||'';
  document.getElementById('f-desc').value=i.desc||'';
  document.getElementById('f-pieces').value=i.pieces||'';
  document.getElementById('f-status').value=i.status||'Planifiée';
  document.getElementById('overlay').style.display='flex';
}
function closeModal(){ document.getElementById('overlay').style.display='none'; }

function saveItem(){
  const client=document.getElementById('f-client').value.trim();
  if(!client){ alert('Client obligatoire'); return; }
  const obj={
    id:editId||nextId(),
    num:document.getElementById('f-num').value.trim(),
    type:document.getElementById('f-type').value,
    client,
    adresse:document.getElementById('f-adresse').value.trim(),
    tech:document.getElementById('f-tech').value.trim(),
    date:document.getElementById('f-date').value,
    duree:+document.getElementById('f-duree').value||0,
    desc:document.getElementById('f-desc').value.trim(),
    pieces:document.getElementById('f-pieces').value.trim(),
    status:document.getElementById('f-status').value
  };
  if(editId){ items=items.map(i=>i.id===editId?obj:i); }
  else{ items.push(obj); }
  save(); closeModal(); render();
}

function deleteItem(id){
  if(!confirm('Supprimer cette fiche ?')) return;
  items=items.filter(i=>i.id!==id);
  save(); render();
}

load(); render();
</script>
</body>
</html>`,
  },
  {
    id: "suivi_materiaux",
    name: "Suivi des matériaux",
    emoji: "🧱",
    category: "Achats",
    categoryColor: "bg-amber-50 text-amber-600",
    description: "Gérez vos stocks de matériaux, commandes et alertes de réapprovisionnement.",
    html: `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Suivi des matériaux</title>
${FONT_LINK}
<style>${CSS}</style>
</head>
<body>
<div class="app-header">
  <span class="app-title">🧱 Matériaux</span>
  <button class="btn btn-ink btn-sm" onclick="openModal()">+ Ajouter</button>
</div>
<div class="app-main">
  <div class="kpi-grid" id="kpi-grid"></div>
  <div class="search-bar">
    <input type="text" id="search" placeholder="Rechercher…" oninput="render()" style="max-width:220px">
    <select id="filter-cat" onchange="render()" style="max-width:150px">
      <option value="">Toutes catégories</option>
      <option>Béton & Maçonnerie</option><option>Charpente & Bois</option><option>Couverture</option>
      <option>Électricité</option><option>Plomberie</option><option>Isolants</option><option>Autre</option>
    </select>
    <label style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:#6B7280;cursor:pointer">
      <input type="checkbox" id="filter-alerte" onchange="render()"> Alertes seulement
    </label>
  </div>
  <div class="section-pad">
    <div class="table-wrap">
      <table>
        <thead><tr><th>Désignation</th><th>Catégorie</th><th>Stock</th><th>Seuil</th><th>Unité</th><th>Prix unit.</th><th>Valeur stock</th><th></th></tr></thead>
        <tbody id="tbody"></tbody>
      </table>
      <div id="empty" class="empty" style="display:none">Aucun matériau trouvé</div>
    </div>
  </div>
</div>
<div class="tab-bar">
  <button class="tab-item active" id="tab-stock" onclick="showTab('stock')">📦<span>Stock</span></button>
  <button class="tab-item" id="tab-mvt" onclick="showTab('mvt')">↕️<span>Mouvements</span></button>
</div>

<div class="overlay" id="overlay" style="display:none" onclick="closeModal()">
  <div class="modal" onclick="event.stopPropagation()">
    <div class="modal-title" id="modal-title">Nouveau matériau</div>
    <div class="fg"><label class="fl">Désignation</label><input id="f-nom" placeholder="Ex: Parpaing 20x20x50"></div>
    <div class="fg"><label class="fl">Catégorie</label>
      <select id="f-cat"><option>Béton & Maçonnerie</option><option>Charpente & Bois</option><option>Couverture</option><option>Électricité</option><option>Plomberie</option><option>Isolants</option><option>Autre</option></select>
    </div>
    <div class="form-row">
      <div class="fg"><label class="fl">Stock actuel</label><input id="f-stock" type="number" step="0.01" placeholder="0"></div>
      <div class="fg"><label class="fl">Unité</label>
        <select id="f-unite"><option>u</option><option>m²</option><option>m³</option><option>ml</option><option>kg</option><option>t</option><option>L</option><option>sac</option><option>palette</option></select>
      </div>
    </div>
    <div class="form-row">
      <div class="fg"><label class="fl">Seuil d'alerte</label><input id="f-seuil" type="number" step="0.01" placeholder="0"></div>
      <div class="fg"><label class="fl">Prix unitaire (€)</label><input id="f-prix" type="number" step="0.01" placeholder="0"></div>
    </div>
    <div class="fg"><label class="fl">Fournisseur</label><input id="f-fournisseur" placeholder="Nom du fournisseur"></div>
    <div class="fg"><label class="fl">Notes</label><textarea id="f-notes" rows="2" placeholder="Référence, remarques…"></textarea></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
      <button class="btn btn-ink" onclick="saveItem()">Enregistrer</button>
    </div>
  </div>
</div>

<div class="overlay" id="overlay-mvt" style="display:none" onclick="closeMvtModal()">
  <div class="modal" onclick="event.stopPropagation()">
    <div class="modal-title">Enregistrer un mouvement</div>
    <div class="fg"><label class="fl">Matériau</label><select id="mvt-mat" style=""></select></div>
    <div class="form-row">
      <div class="fg"><label class="fl">Type</label>
        <select id="mvt-type"><option value="entree">Entrée</option><option value="sortie">Sortie</option></select>
      </div>
      <div class="fg"><label class="fl">Quantité</label><input id="mvt-qte" type="number" step="0.01" placeholder="0"></div>
    </div>
    <div class="fg"><label class="fl">Date</label><input id="mvt-date" type="date"></div>
    <div class="fg"><label class="fl">Motif</label><input id="mvt-motif" placeholder="Ex: Livraison chantier Les Pins"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeMvtModal()">Annuler</button>
      <button class="btn btn-ink" onclick="saveMvt()">Valider</button>
    </div>
  </div>
</div>

<script>
const KEY='biltia_suivi_materiaux';
const KEY_MVT='biltia_suivi_materiaux_mvt';
let items=[],mvts=[],editId=null,activeTab='stock';

const DEFAULTS=[
  {id:1,nom:'Parpaing 20x20x50',cat:'Béton & Maçonnerie',stock:1240,seuil:200,unite:'u',prix:0.85,fournisseur:'MatBTP Sud',notes:'Palette=200u'},
  {id:2,nom:'Ciment Portland CEM I',cat:'Béton & Maçonnerie',stock:18,seuil:25,unite:'sac',prix:12.50,fournisseur:'LafargeHolcim',notes:'Sac 35kg'},
  {id:3,nom:'Tuile mécanique rouge',cat:'Couverture',stock:320,seuil:100,unite:'u',prix:1.20,fournisseur:'Edilians',notes:''},
  {id:4,nom:'Câble HO7V-U 2.5mm²',cat:'Électricité',stock:85,seuil:50,unite:'ml',prix:0.65,fournisseur:'Rexel',notes:'Bobine 100ml'},
  {id:5,nom:'Laine de verre 100mm',cat:'Isolants',stock:45,seuil:20,unite:'m²',prix:4.80,fournisseur:'Isover',notes:'Rouleau 16m²'}
];
const DEFAULTS_MVT=[
  {id:1,matId:1,type:'entree',qte:500,date:'2024-03-10',motif:'Livraison commande #234'},
  {id:2,matId:2,type:'sortie',qte:12,date:'2024-03-15',motif:'Chantier Les Pins - semaine 11'},
  {id:3,matId:3,type:'entree',qte:200,date:'2024-03-20',motif:'Livraison toiture'}
];

function load(){
  try{ items=JSON.parse(localStorage.getItem(KEY)||'null')||null; }catch(e){ items=null; }
  if(!items){ items=DEFAULTS; localStorage.setItem(KEY,JSON.stringify(items)); }
  try{ mvts=JSON.parse(localStorage.getItem(KEY_MVT)||'null')||null; }catch(e){ mvts=null; }
  if(!mvts){ mvts=DEFAULTS_MVT; localStorage.setItem(KEY_MVT,JSON.stringify(mvts)); }
}
function save(){ localStorage.setItem(KEY,JSON.stringify(items)); }
function saveMvts(){ localStorage.setItem(KEY_MVT,JSON.stringify(mvts)); }
function nextId(){ return items.length?Math.max(...items.map(i=>i.id))+1:1; }
function nextMvtId(){ return mvts.length?Math.max(...mvts.map(i=>i.id))+1:1; }

function renderKpi(){
  const total=items.length;
  const alertes=items.filter(i=>(+i.stock||0)<=(+i.seuil||0)).length;
  const valeur=items.reduce((s,i)=>s+(+i.stock||0)*(+i.prix||0),0);
  document.getElementById('kpi-grid').innerHTML=\`
    <div class="kpi"><div class="kpi-label">Références</div><div class="kpi-value">\${total}</div></div>
    <div class="kpi"><div class="kpi-label">Alertes stock</div><div class="kpi-value" style="color:#E11D48">\${alertes}</div></div>
    <div class="kpi"><div class="kpi-label">Valeur stock</div><div class="kpi-value">\${(valeur/1000).toFixed(1)}k€</div></div>
  \`;
}

function render(){
  if(activeTab==='mvt'){ renderMvt(); return; }
  renderKpi();
  const q=(document.getElementById('search').value||'').toLowerCase();
  const fc=document.getElementById('filter-cat').value;
  const fa=document.getElementById('filter-alerte').checked;
  const list=items.filter(i=>{
    const m=!q||(i.nom||'').toLowerCase().includes(q)||(i.fournisseur||'').toLowerCase().includes(q);
    const cat=!fc||i.cat===fc;
    const alerte=!fa||((+i.stock||0)<=(+i.seuil||0));
    return m&&cat&&alerte;
  });
  const tbody=document.getElementById('tbody');
  const empty=document.getElementById('empty');
  if(!list.length){ tbody.innerHTML=''; empty.style.display=''; return; }
  empty.style.display='none';
  tbody.innerHTML=list.map(i=>{
    const alerte=(+i.stock||0)<=(+i.seuil||0);
    return \`<tr>
      <td style="font-weight:600;color:#0F172A">\${i.nom}\${alerte?'&nbsp;<span class="badge badge-red">⚠️ Alerte</span>':''}</td>
      <td>\${i.cat}</td>
      <td style="font-weight:700;color:\${alerte?'#E11D48':'#7C3AED'}">\${(+i.stock||0).toLocaleString('fr-FR')}</td>
      <td style="color:#9CA3AF">\${+i.seuil||0}</td>
      <td>\${i.unite}</td>
      <td>\${(+i.prix||0).toLocaleString('fr-FR',{minimumFractionDigits:2})} €</td>
      <td style="font-weight:600">\${((+i.stock||0)*(+i.prix||0)).toLocaleString('fr-FR',{minimumFractionDigits:2})} €</td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn btn-ghost btn-sm" onclick="openModal(\${i.id})">✏️</button>
          <button class="btn btn-danger" onclick="deleteItem(\${i.id})">🗑</button>
        </div>
      </td>
    </tr>\`;
  }).join('');
}

function renderMvt(){
  document.getElementById('kpi-grid').innerHTML='';
  document.querySelector('.search-bar').style.display='none';
  document.querySelector('.table-wrap').style.display='none';
  let cont=document.getElementById('mvt-container');
  if(!cont){ cont=document.createElement('div'); cont.id='mvt-container'; cont.style.cssText='padding:0 16px 16px'; document.querySelector('.app-main').appendChild(cont); }
  cont.style.display='';
  const sorted=[...mvts].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  cont.innerHTML=\`
    <div style="margin-bottom:12px"><button class="btn btn-ink" onclick="openMvtModal()">+ Mouvement</button></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Date</th><th>Matériau</th><th>Type</th><th>Qté</th><th>Motif</th><th></th></tr></thead>
      <tbody>\${sorted.map(m=>{
        const mat=items.find(i=>i.id===m.matId);
        return \`<tr>
          <td>\${m.date}</td>
          <td style="font-weight:600">\${mat?mat.nom:'—'}</td>
          <td>\${m.type==='entree'?'<span class="badge badge-green">Entrée</span>':'<span class="badge badge-red">Sortie</span>'}</td>
          <td style="font-weight:700">\${m.qte} \${mat?mat.unite:''}</td>
          <td>\${m.motif}</td>
          <td><button class="btn btn-danger" onclick="deleteMvt(\${m.id})">🗑</button></td>
        </tr>\`;
      }).join('')}</tbody>
    </table></div>
  \`;
}

function showTab(t){
  activeTab=t;
  document.getElementById('tab-stock').className='tab-item'+(t==='stock'?' active':'');
  document.getElementById('tab-mvt').className='tab-item'+(t==='mvt'?' active':'');
  const mc=document.getElementById('mvt-container');
  if(t==='stock'){
    if(mc) mc.style.display='none';
    document.querySelector('.search-bar').style.display='';
    document.querySelector('.table-wrap').style.display='';
    renderKpi();
  }
  render();
}

function openModal(id){
  editId=id||null;
  document.getElementById('modal-title').textContent=id?'Modifier le matériau':'Nouveau matériau';
  const i=id?items.find(x=>x.id===id):{};
  document.getElementById('f-nom').value=i.nom||'';
  document.getElementById('f-cat').value=i.cat||'Béton & Maçonnerie';
  document.getElementById('f-stock').value=i.stock||'';
  document.getElementById('f-unite').value=i.unite||'u';
  document.getElementById('f-seuil').value=i.seuil||'';
  document.getElementById('f-prix').value=i.prix||'';
  document.getElementById('f-fournisseur').value=i.fournisseur||'';
  document.getElementById('f-notes').value=i.notes||'';
  document.getElementById('overlay').style.display='flex';
}
function closeModal(){ document.getElementById('overlay').style.display='none'; }

function saveItem(){
  const nom=document.getElementById('f-nom').value.trim();
  if(!nom){ alert('Désignation obligatoire'); return; }
  const obj={
    id:editId||nextId(),nom,
    cat:document.getElementById('f-cat').value,
    stock:+document.getElementById('f-stock').value||0,
    unite:document.getElementById('f-unite').value,
    seuil:+document.getElementById('f-seuil').value||0,
    prix:+document.getElementById('f-prix').value||0,
    fournisseur:document.getElementById('f-fournisseur').value.trim(),
    notes:document.getElementById('f-notes').value.trim()
  };
  if(editId){ items=items.map(i=>i.id===editId?obj:i); }
  else{ items.push(obj); }
  save(); closeModal(); render();
}

function deleteItem(id){
  if(!confirm('Supprimer ce matériau ?')) return;
  items=items.filter(i=>i.id!==id);
  save(); render();
}

function openMvtModal(){
  document.getElementById('mvt-mat').innerHTML=items.map(i=>\`<option value="\${i.id}">\${i.nom}</option>\`).join('');
  document.getElementById('mvt-date').value=new Date().toISOString().split('T')[0];
  document.getElementById('mvt-qte').value='';
  document.getElementById('mvt-motif').value='';
  document.getElementById('overlay-mvt').style.display='flex';
}
function closeMvtModal(){ document.getElementById('overlay-mvt').style.display='none'; }

function saveMvt(){
  const matId=+document.getElementById('mvt-mat').value;
  const type=document.getElementById('mvt-type').value;
  const qte=+document.getElementById('mvt-qte').value||0;
  if(!qte){ alert('Quantité obligatoire'); return; }
  mvts.push({id:nextMvtId(),matId,type,qte,date:document.getElementById('mvt-date').value,motif:document.getElementById('mvt-motif').value.trim()});
  const mat=items.find(i=>i.id===matId);
  if(mat){ mat.stock=Math.max(0,(+mat.stock||0)+(type==='entree'?qte:-qte)); }
  save(); saveMvts(); closeMvtModal(); render();
}

function deleteMvt(id){
  if(!confirm('Supprimer ce mouvement ?')) return;
  mvts=mvts.filter(m=>m.id!==id);
  saveMvts(); render();
}

load(); render();
</script>
</body>
</html>`,
  },
  {
    id: "parc_materiel",
    name: "Parc matériel",
    emoji: "🚛",
    category: "Matériel",
    categoryColor: "bg-slate-50 text-slate-600",
    description: "Gérez votre parc d'engins et matériels : affectations, entretiens, disponibilité.",
    html: `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Parc matériel</title>
${FONT_LINK}
<style>${CSS}</style>
</head>
<body>
<div class="app-header">
  <span class="app-title">🚛 Parc matériel</span>
  <button class="btn btn-ink btn-sm" onclick="openModal()">+ Ajouter</button>
</div>
<div class="app-main">
  <div class="kpi-grid" id="kpi-grid"></div>
  <div class="search-bar">
    <input type="text" id="search" placeholder="Rechercher…" oninput="render()" style="max-width:220px">
    <select id="filter-type" onchange="render()" style="max-width:160px">
      <option value="">Tous types</option>
      <option>Engin TP</option><option>Véhicule</option><option>Outil motorisé</option><option>Échafaudage</option><option>Autre</option>
    </select>
    <select id="filter-dispo" onchange="render()" style="max-width:150px">
      <option value="">Toutes dispo.</option>
      <option>Disponible</option><option>Affecté</option><option>En maintenance</option><option>HS</option>
    </select>
  </div>
  <div class="section-pad">
    <div class="table-wrap">
      <table>
        <thead><tr><th>Désignation</th><th>Type</th><th>Immat. / N°</th><th>Affectation</th><th>Prochain CT</th><th>Dispo.</th><th></th></tr></thead>
        <tbody id="tbody"></tbody>
      </table>
      <div id="empty" class="empty" style="display:none">Aucun matériel</div>
    </div>
  </div>
</div>
<div class="tab-bar">
  <button class="tab-item active" id="tab-parc" onclick="showTab('parc')">🚛<span>Parc</span></button>
  <button class="tab-item" id="tab-entretien" onclick="showTab('entretien')">🔧<span>Entretien</span></button>
</div>

<div class="overlay" id="overlay" style="display:none" onclick="closeModal()">
  <div class="modal" onclick="event.stopPropagation()">
    <div class="modal-title" id="modal-title">Nouveau matériel</div>
    <div class="fg"><label class="fl">Désignation</label><input id="f-nom" placeholder="Ex: Pelle hydraulique CAT 308"></div>
    <div class="form-row">
      <div class="fg"><label class="fl">Type</label>
        <select id="f-type"><option>Engin TP</option><option>Véhicule</option><option>Outil motorisé</option><option>Échafaudage</option><option>Autre</option></select>
      </div>
      <div class="fg"><label class="fl">Immat. / N° série</label><input id="f-immat" placeholder="AB-123-CD"></div>
    </div>
    <div class="form-row">
      <div class="fg"><label class="fl">Année</label><input id="f-annee" type="number" placeholder="2022"></div>
      <div class="fg"><label class="fl">Valeur (€)</label><input id="f-valeur" type="number" placeholder="0"></div>
    </div>
    <div class="fg"><label class="fl">Affectation chantier</label><input id="f-affect" placeholder="Chantier ou dépôt"></div>
    <div class="form-row">
      <div class="fg"><label class="fl">Dernier entretien</label><input id="f-dernier-ct" type="date"></div>
      <div class="fg"><label class="fl">Prochain CT</label><input id="f-prochain-ct" type="date"></div>
    </div>
    <div class="fg"><label class="fl">Disponibilité</label>
      <select id="f-dispo"><option>Disponible</option><option>Affecté</option><option>En maintenance</option><option>HS</option></select>
    </div>
    <div class="fg"><label class="fl">Notes</label><textarea id="f-notes" rows="2" placeholder="Remarques, état…"></textarea></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
      <button class="btn btn-ink" onclick="saveItem()">Enregistrer</button>
    </div>
  </div>
</div>

<script>
const KEY='biltia_parc_materiel';
let items=[],editId=null,activeTab='parc';

const DEFAULTS=[
  {id:1,nom:'Pelle hydraulique CAT 308',type:'Engin TP',immat:'ENE-0821',annee:2021,valeur:85000,affect:'Résidence Les Pins',dernierCT:'2024-01-15',prochainCT:'2024-07-15',dispo:'Affecté',notes:'Vidange faite'},
  {id:2,nom:'Camion benne Mercedes 18T',type:'Véhicule',immat:'DT-456-XY',annee:2019,valeur:62000,affect:'Dépôt central',dernierCT:'2024-02-20',prochainCT:'2025-02-20',dispo:'Disponible',notes:''},
  {id:3,nom:'Centrale à béton portative',type:'Outil motorisé',immat:'CB-003',annee:2020,valeur:8500,affect:'',dernierCT:'2023-11-10',prochainCT:'2024-05-10',dispo:'En maintenance',notes:'Remplacement courroie en cours'}
];

function load(){
  try{ items=JSON.parse(localStorage.getItem(KEY)||'null')||null; }catch(e){ items=null; }
  if(!items){ items=DEFAULTS; save(); }
}
function save(){ localStorage.setItem(KEY,JSON.stringify(items)); }
function nextId(){ return items.length?Math.max(...items.map(i=>i.id))+1:1; }

function dispoBadge(d){
  if(d==='Disponible') return '<span class="badge badge-green">Disponible</span>';
  if(d==='Affecté') return '<span class="badge badge-amber">Affecté</span>';
  if(d==='En maintenance') return '<span class="badge badge-red">Maintenance</span>';
  return '<span class="badge badge-red">HS</span>';
}

function ctAlert(date){
  if(!date) return false;
  const d=new Date(date); const now=new Date();
  return d<=new Date(now.getTime()+30*24*60*60*1000);
}

function renderKpi(){
  const total=items.length;
  const dispos=items.filter(i=>i.dispo==='Disponible').length;
  const affectes=items.filter(i=>i.dispo==='Affecté').length;
  const alerts=items.filter(i=>ctAlert(i.prochainCT)).length;
  document.getElementById('kpi-grid').innerHTML=\`
    <div class="kpi"><div class="kpi-label">Total matériel</div><div class="kpi-value">\${total}</div></div>
    <div class="kpi"><div class="kpi-label">Disponible</div><div class="kpi-value">\${dispos}</div></div>
    <div class="kpi"><div class="kpi-label">Affecté</div><div class="kpi-value">\${affectes}</div></div>
    <div class="kpi"><div class="kpi-label">CT à venir</div><div class="kpi-value" style="color:\${alerts?'#E11D48':'inherit'}">\${alerts}</div></div>
  \`;
}

function render(){
  if(activeTab==='entretien'){ renderEntretien(); return; }
  renderKpi();
  const q=(document.getElementById('search').value||'').toLowerCase();
  const ft=document.getElementById('filter-type').value;
  const fd=document.getElementById('filter-dispo').value;
  const list=items.filter(i=>{
    const m=!q||(i.nom||'').toLowerCase().includes(q)||(i.immat||'').toLowerCase().includes(q);
    return m&&(!ft||i.type===ft)&&(!fd||i.dispo===fd);
  });
  const tbody=document.getElementById('tbody');
  const empty=document.getElementById('empty');
  if(!list.length){ tbody.innerHTML=''; empty.style.display=''; return; }
  empty.style.display='none';
  tbody.innerHTML=list.map(i=>{
    const alert=ctAlert(i.prochainCT);
    return \`<tr>
      <td style="font-weight:600;color:#0F172A">\${i.nom}</td>
      <td>\${i.type}</td>
      <td style="font-family:monospace;font-size:12px">\${i.immat}</td>
      <td>\${i.affect||'—'}</td>
      <td style="color:\${alert?'#E11D48':'inherit'};font-weight:\${alert?700:400}">\${i.prochainCT||'—'}\${alert?'&nbsp;⚠️':''}</td>
      <td>\${dispoBadge(i.dispo)}</td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn btn-ghost btn-sm" onclick="openModal(\${i.id})">✏️</button>
          <button class="btn btn-danger" onclick="deleteItem(\${i.id})">🗑</button>
        </div>
      </td>
    </tr>\`;
  }).join('');
}

function renderEntretien(){
  document.getElementById('kpi-grid').innerHTML='';
  document.querySelector('.search-bar').style.display='none';
  document.querySelector('.table-wrap').style.display='none';
  let cont=document.getElementById('ent-container');
  if(!cont){ cont=document.createElement('div'); cont.id='ent-container'; cont.style.cssText='padding:0 16px 16px'; document.querySelector('.app-main').appendChild(cont); }
  cont.style.display='';
  const sorted=[...items].sort((a,b)=>(a.prochainCT||'9999').localeCompare(b.prochainCT||'9999'));
  cont.innerHTML=\`
    <div style="font-size:12px;color:#6B7280;margin-bottom:12px">Matériels triés par date de prochain contrôle</div>
    \${sorted.map(i=>{
      const alert=ctAlert(i.prochainCT);
      return \`<div class="card" style="margin-bottom:10px;border-left:3px solid \${alert?'#EF4444':'#14B8A6'}">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="font-weight:700">\${i.nom}</div>
          \${dispoBadge(i.dispo)}
        </div>
        <div style="font-size:12px;color:#6B7280;margin-top:4px">\${i.immat} • \${i.type}</div>
        <div style="display:flex;gap:16px;margin-top:8px;font-size:12px">
          <span>Dernier CT : <b>\${i.dernierCT||'—'}</b></span>
          <span style="color:\${alert?'#E11D48':'inherit'}">Prochain CT : <b>\${i.prochainCT||'—'}</b>\${alert?' ⚠️':''}</span>
        </div>
      </div>\`;
    }).join('')}
  \`;
}

function showTab(t){
  activeTab=t;
  document.getElementById('tab-parc').className='tab-item'+(t==='parc'?' active':'');
  document.getElementById('tab-entretien').className='tab-item'+(t==='entretien'?' active':'');
  const ec=document.getElementById('ent-container');
  if(t==='parc'){
    if(ec) ec.style.display='none';
    document.querySelector('.search-bar').style.display='';
    document.querySelector('.table-wrap').style.display='';
    renderKpi();
  }
  render();
}

function openModal(id){
  editId=id||null;
  document.getElementById('modal-title').textContent=id?'Modifier le matériel':'Nouveau matériel';
  const i=id?items.find(x=>x.id===id):{};
  document.getElementById('f-nom').value=i.nom||'';
  document.getElementById('f-type').value=i.type||'Engin TP';
  document.getElementById('f-immat').value=i.immat||'';
  document.getElementById('f-annee').value=i.annee||'';
  document.getElementById('f-valeur').value=i.valeur||'';
  document.getElementById('f-affect').value=i.affect||'';
  document.getElementById('f-dernier-ct').value=i.dernierCT||'';
  document.getElementById('f-prochain-ct').value=i.prochainCT||'';
  document.getElementById('f-dispo').value=i.dispo||'Disponible';
  document.getElementById('f-notes').value=i.notes||'';
  document.getElementById('overlay').style.display='flex';
}
function closeModal(){ document.getElementById('overlay').style.display='none'; }

function saveItem(){
  const nom=document.getElementById('f-nom').value.trim();
  if(!nom){ alert('Désignation obligatoire'); return; }
  const obj={
    id:editId||nextId(),nom,
    type:document.getElementById('f-type').value,
    immat:document.getElementById('f-immat').value.trim(),
    annee:+document.getElementById('f-annee').value||0,
    valeur:+document.getElementById('f-valeur').value||0,
    affect:document.getElementById('f-affect').value.trim(),
    dernierCT:document.getElementById('f-dernier-ct').value,
    prochainCT:document.getElementById('f-prochain-ct').value,
    dispo:document.getElementById('f-dispo').value,
    notes:document.getElementById('f-notes').value.trim()
  };
  if(editId){ items=items.map(i=>i.id===editId?obj:i); }
  else{ items.push(obj); }
  save(); closeModal(); render();
}

function deleteItem(id){
  if(!confirm('Supprimer ce matériel ?')) return;
  items=items.filter(i=>i.id!==id);
  save(); render();
}

load(); render();
</script>
</body>
</html>`,
  },
  {
    id: "contrats_maintenance",
    name: "Contrats de maintenance",
    emoji: "📝",
    category: "Maintenance",
    categoryColor: "bg-cyan-50 text-cyan-600",
    description: "Gérez vos contrats de maintenance, échéances et visites périodiques.",
    html: `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Contrats de maintenance</title>
${FONT_LINK}
<style>${CSS}</style>
</head>
<body>
<div class="app-header">
  <span class="app-title">📝 Maintenance</span>
  <button class="btn btn-ink btn-sm" onclick="openModal()">+ Contrat</button>
</div>
<div class="app-main">
  <div class="kpi-grid" id="kpi-grid"></div>
  <div class="search-bar">
    <input type="text" id="search" placeholder="Rechercher…" oninput="render()" style="max-width:220px">
    <select id="filter-type" onchange="render()" style="max-width:170px">
      <option value="">Tous types</option>
      <option>Climatisation</option><option>Chauffage</option><option>Électricité</option>
      <option>Ascenseur</option><option>Plomberie</option><option>Toiture</option><option>Autre</option>
    </select>
    <select id="filter-status" onchange="render()" style="max-width:140px">
      <option value="">Tous statuts</option>
      <option>Actif</option><option>Expiré</option><option>À renouveler</option><option>Résilié</option>
    </select>
  </div>
  <div class="section-pad">
    <div class="table-wrap">
      <table>
        <thead><tr><th>Client / Site</th><th>Type</th><th>Périodicité</th><th>Valeur/an</th><th>Échéance</th><th>Prochaine visite</th><th>Statut</th><th></th></tr></thead>
        <tbody id="tbody"></tbody>
      </table>
      <div id="empty" class="empty" style="display:none">Aucun contrat</div>
    </div>
  </div>
</div>
<div class="tab-bar">
  <button class="tab-item active" id="tab-contrats" onclick="showTab('contrats')">📋<span>Contrats</span></button>
  <button class="tab-item" id="tab-agenda" onclick="showTab('agenda')">📅<span>Agenda</span></button>
</div>

<div class="overlay" id="overlay" style="display:none" onclick="closeModal()">
  <div class="modal" onclick="event.stopPropagation()">
    <div class="modal-title" id="modal-title">Nouveau contrat</div>
    <div class="fg"><label class="fl">Client / Site</label><input id="f-client" placeholder="Nom du client"></div>
    <div class="fg"><label class="fl">Adresse du site</label><input id="f-adresse" placeholder="Adresse complète"></div>
    <div class="form-row">
      <div class="fg"><label class="fl">Type de maintenance</label>
        <select id="f-type"><option>Climatisation</option><option>Chauffage</option><option>Électricité</option><option>Ascenseur</option><option>Plomberie</option><option>Toiture</option><option>Autre</option></select>
      </div>
      <div class="fg"><label class="fl">Périodicité</label>
        <select id="f-period"><option>Mensuelle</option><option>Trimestrielle</option><option>Semestrielle</option><option>Annuelle</option></select>
      </div>
    </div>
    <div class="form-row">
      <div class="fg"><label class="fl">Date début</label><input id="f-debut" type="date"></div>
      <div class="fg"><label class="fl">Date échéance</label><input id="f-echeance" type="date"></div>
    </div>
    <div class="form-row">
      <div class="fg"><label class="fl">Valeur annuelle (€)</label><input id="f-valeur" type="number" placeholder="0"></div>
      <div class="fg"><label class="fl">Prochaine visite</label><input id="f-visite" type="date"></div>
    </div>
    <div class="fg"><label class="fl">Technicien référent</label><input id="f-tech" placeholder="Prénom Nom"></div>
    <div class="fg"><label class="fl">Statut</label>
      <select id="f-status"><option>Actif</option><option>À renouveler</option><option>Expiré</option><option>Résilié</option></select>
    </div>
    <div class="fg"><label class="fl">Notes</label><textarea id="f-notes" rows="2" placeholder="Remarques, équipements concernés…"></textarea></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
      <button class="btn btn-ink" onclick="saveItem()">Enregistrer</button>
    </div>
  </div>
</div>

<script>
const KEY='biltia_contrats_maintenance';
let items=[],editId=null,activeTab='contrats';

const DEFAULTS=[
  {id:1,client:'Résidence Les Pins',adresse:'Allée des Pins, 34100 Montpellier',type:'Chauffage',period:'Annuelle',debut:'2023-09-01',echeance:'2024-08-31',valeur:2400,visite:'2024-06-15',tech:'Ahmed Bouazza',status:'Actif',notes:'Chaudière collective gaz - 3 corps de chauffe'},
  {id:2,client:'Mairie de Montbel',adresse:'12 rue de la Paix, 34000 Montbel',type:'Climatisation',period:'Semestrielle',debut:'2024-01-01',echeance:'2024-12-31',valeur:1800,visite:'2024-07-01',tech:'Pierre Leroux',status:'Actif',notes:'6 unités split - école primaire'},
  {id:3,client:'Duval Logistique',adresse:'ZI Nord, 34400 Lunel',type:'Électricité',period:'Annuelle',debut:'2022-06-01',echeance:'2024-05-31',valeur:3600,visite:'',tech:'Pierre Leroux',status:'À renouveler',notes:'Vérification CONSUEL tableau général + éclairage secours'}
];

function load(){
  try{ items=JSON.parse(localStorage.getItem(KEY)||'null')||null; }catch(e){ items=null; }
  if(!items){ items=DEFAULTS; save(); }
}
function save(){ localStorage.setItem(KEY,JSON.stringify(items)); }
function nextId(){ return items.length?Math.max(...items.map(i=>i.id))+1:1; }

function statusBadge(s){
  if(s==='Actif') return '<span class="badge badge-green">Actif</span>';
  if(s==='À renouveler') return '<span class="badge badge-amber">À renouveler</span>';
  if(s==='Expiré') return '<span class="badge badge-red">Expiré</span>';
  return '<span class="badge badge-gray">Résilié</span>';
}

function visitAlert(date){
  if(!date) return false;
  const d=new Date(date); const now=new Date();
  return d<=new Date(now.getTime()+14*24*60*60*1000);
}

function renderKpi(){
  const total=items.length;
  const actifs=items.filter(i=>i.status==='Actif').length;
  const caAnnuel=items.filter(i=>i.status==='Actif').reduce((s,i)=>s+(+i.valeur||0),0);
  const renouveler=items.filter(i=>i.status==='À renouveler').length;
  document.getElementById('kpi-grid').innerHTML=\`
    <div class="kpi"><div class="kpi-label">Contrats</div><div class="kpi-value">\${total}</div></div>
    <div class="kpi"><div class="kpi-label">Actifs</div><div class="kpi-value">\${actifs}</div></div>
    <div class="kpi"><div class="kpi-label">CA récurrent</div><div class="kpi-value">\${(caAnnuel/1000).toFixed(1)}k€</div><div class="kpi-sub">/ an</div></div>
    <div class="kpi"><div class="kpi-label">À renouveler</div><div class="kpi-value" style="color:\${renouveler?'#E11D48':'inherit'}">\${renouveler}</div></div>
  \`;
}

function render(){
  if(activeTab==='agenda'){ renderAgenda(); return; }
  renderKpi();
  const q=(document.getElementById('search').value||'').toLowerCase();
  const ft=document.getElementById('filter-type').value;
  const fs=document.getElementById('filter-status').value;
  const list=items.filter(i=>{
    const m=!q||(i.client||'').toLowerCase().includes(q)||(i.type||'').toLowerCase().includes(q);
    return m&&(!ft||i.type===ft)&&(!fs||i.status===fs);
  });
  const tbody=document.getElementById('tbody');
  const empty=document.getElementById('empty');
  if(!list.length){ tbody.innerHTML=''; empty.style.display=''; return; }
  empty.style.display='none';
  tbody.innerHTML=list.map(i=>{
    const va=visitAlert(i.visite);
    return \`<tr>
      <td style="font-weight:700;color:#0F172A">\${i.client}</td>
      <td>\${i.type}</td>
      <td>\${i.period}</td>
      <td style="font-weight:600">\${(+i.valeur||0).toLocaleString('fr-FR')} €</td>
      <td>\${i.echeance||'—'}</td>
      <td style="color:\${va?'#E11D48':'inherit'};font-weight:\${va?700:400}">\${i.visite||'—'}\${va?' ⚠️':''}</td>
      <td>\${statusBadge(i.status)}</td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn btn-ghost btn-sm" onclick="openModal(\${i.id})">✏️</button>
          <button class="btn btn-danger" onclick="deleteItem(\${i.id})">🗑</button>
        </div>
      </td>
    </tr>\`;
  }).join('');
}

function renderAgenda(){
  document.getElementById('kpi-grid').innerHTML='';
  document.querySelector('.search-bar').style.display='none';
  document.querySelector('.table-wrap').style.display='none';
  let cont=document.getElementById('agenda-container');
  if(!cont){ cont=document.createElement('div'); cont.id='agenda-container'; cont.style.cssText='padding:0 16px 16px'; document.querySelector('.app-main').appendChild(cont); }
  cont.style.display='';

  const aVenir=[...items].filter(i=>i.visite).sort((a,b)=>a.visite.localeCompare(b.visite));
  const now=new Date();

  cont.innerHTML=aVenir.length?aVenir.map(i=>{
    const d=new Date(i.visite);
    const diff=Math.round((d-now)/(1000*60*60*24));
    const urgent=diff<=14;
    return \`<div class="card" style="margin-bottom:10px;border-left:3px solid \${urgent?'#EF4444':'#14B8A6'}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <div style="font-weight:700">\${i.client}</div>
          <div style="font-size:12px;color:#6B7280;margin-top:2px">\${i.type} • \${i.period} • Réf: \${i.tech||'—'}</div>
        </div>
        <div style="text-align:right">
          <div style="font-weight:700;color:\${urgent?'#E11D48':'#7C3AED'}">\${i.visite}</div>
          <div style="font-size:11px;color:#9CA3AF">\${diff>0?'dans '+diff+' j':diff===0?'Aujourd\\'hui':'il y a '+Math.abs(diff)+' j'}</div>
        </div>
      </div>
    </div>\`;
  }).join(''):'<div class="empty">Aucune visite planifiée</div>';
}

function showTab(t){
  activeTab=t;
  document.getElementById('tab-contrats').className='tab-item'+(t==='contrats'?' active':'');
  document.getElementById('tab-agenda').className='tab-item'+(t==='agenda'?' active':'');
  const ac=document.getElementById('agenda-container');
  if(t==='contrats'){
    if(ac) ac.style.display='none';
    document.querySelector('.search-bar').style.display='';
    document.querySelector('.table-wrap').style.display='';
    renderKpi();
  }
  render();
}

function openModal(id){
  editId=id||null;
  document.getElementById('modal-title').textContent=id?'Modifier le contrat':'Nouveau contrat';
  const i=id?items.find(x=>x.id===id):{};
  document.getElementById('f-client').value=i.client||'';
  document.getElementById('f-adresse').value=i.adresse||'';
  document.getElementById('f-type').value=i.type||'Climatisation';
  document.getElementById('f-period').value=i.period||'Annuelle';
  document.getElementById('f-debut').value=i.debut||'';
  document.getElementById('f-echeance').value=i.echeance||'';
  document.getElementById('f-valeur').value=i.valeur||'';
  document.getElementById('f-visite').value=i.visite||'';
  document.getElementById('f-tech').value=i.tech||'';
  document.getElementById('f-status').value=i.status||'Actif';
  document.getElementById('f-notes').value=i.notes||'';
  document.getElementById('overlay').style.display='flex';
}
function closeModal(){ document.getElementById('overlay').style.display='none'; }

function saveItem(){
  const client=document.getElementById('f-client').value.trim();
  if(!client){ alert('Client obligatoire'); return; }
  const obj={
    id:editId||nextId(),client,
    adresse:document.getElementById('f-adresse').value.trim(),
    type:document.getElementById('f-type').value,
    period:document.getElementById('f-period').value,
    debut:document.getElementById('f-debut').value,
    echeance:document.getElementById('f-echeance').value,
    valeur:+document.getElementById('f-valeur').value||0,
    visite:document.getElementById('f-visite').value,
    tech:document.getElementById('f-tech').value.trim(),
    status:document.getElementById('f-status').value,
    notes:document.getElementById('f-notes').value.trim()
  };
  if(editId){ items=items.map(i=>i.id===editId?obj:i); }
  else{ items.push(obj); }
  save(); closeModal(); render();
}

function deleteItem(id){
  if(!confirm('Supprimer ce contrat ?')) return;
  items=items.filter(i=>i.id!==id);
  save(); render();
}

load(); render();
</script>
</body>
</html>`,
  },
  {
    id: "planning_chantier",
    name: "Planning chantier",
    emoji: "📅",
    category: "Planification",
    categoryColor: "bg-teal-50 text-teal-600",
    description: "Planifiez vos tâches par chantier avec un diagramme de Gantt simplifié.",
    html: `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Planning chantier</title>
${FONT_LINK}
<style>${CSS}
.gantt-row{display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #EEF0F6}
.gantt-label{width:140px;font-size:12px;font-weight:600;color:#0F172A;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gantt-track{flex:1;height:20px;background:#EEF0F6;border-radius:4px;position:relative;overflow:hidden}
.gantt-bar{position:absolute;height:100%;border-radius:4px;background:linear-gradient(90deg,#14B8A6,#7C3AED);display:flex;align-items:center;padding:0 6px}
.gantt-bar-text{font-size:10px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden}
</style>
</head>
<body>
<div class="app-header">
  <span class="app-title">📅 Planning chantier</span>
  <button class="btn btn-ink btn-sm" onclick="openModal()">+ Tâche</button>
</div>
<div class="app-main">
  <div class="kpi-grid" id="kpi-grid"></div>
  <div class="search-bar">
    <input type="text" id="search" placeholder="Rechercher…" oninput="render()" style="max-width:200px">
    <select id="filter-chantier" onchange="render()" style="max-width:200px" id="filter-chantier">
      <option value="">Tous les chantiers</option>
    </select>
    <select id="filter-status" onchange="render()" style="max-width:140px">
      <option value="">Tous statuts</option>
      <option>À faire</option><option>En cours</option><option>Terminé</option><option>Bloqué</option>
    </select>
  </div>
  <div class="section-pad" id="gantt-section">
    <div class="table-wrap" style="padding:16px" id="gantt-wrap"></div>
  </div>
  <div class="section-pad">
    <div class="table-wrap">
      <table>
        <thead><tr><th>Tâche</th><th>Chantier</th><th>Responsable</th><th>Début</th><th>Fin</th><th>Statut</th><th></th></tr></thead>
        <tbody id="tbody"></tbody>
      </table>
      <div id="empty" class="empty" style="display:none">Aucune tâche planifiée</div>
    </div>
  </div>
</div>
<div class="tab-bar">
  <button class="tab-item active" id="tab-list" onclick="showTab('list')">📋<span>Tâches</span></button>
  <button class="tab-item" id="tab-gantt" onclick="showTab('gantt')">📊<span>Gantt</span></button>
</div>

<div class="overlay" id="overlay" style="display:none" onclick="closeModal()">
  <div class="modal" onclick="event.stopPropagation()">
    <div class="modal-title" id="modal-title">Nouvelle tâche</div>
    <div class="fg"><label class="fl">Nom de la tâche</label><input id="f-nom" placeholder="Ex: Coulage dalle RDC"></div>
    <div class="fg"><label class="fl">Chantier</label><input id="f-chantier" placeholder="Nom du chantier" list="chantier-list">
      <datalist id="chantier-list"></datalist>
    </div>
    <div class="fg"><label class="fl">Responsable</label><input id="f-resp" placeholder="Prénom Nom"></div>
    <div class="form-row">
      <div class="fg"><label class="fl">Date début</label><input id="f-debut" type="date"></div>
      <div class="fg"><label class="fl">Date fin</label><input id="f-fin" type="date"></div>
    </div>
    <div class="fg"><label class="fl">Statut</label>
      <select id="f-status"><option>À faire</option><option>En cours</option><option>Terminé</option><option>Bloqué</option></select>
    </div>
    <div class="fg"><label class="fl">Notes</label><textarea id="f-notes" rows="2" placeholder="Remarques…"></textarea></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
      <button class="btn btn-ink" onclick="saveItem()">Enregistrer</button>
    </div>
  </div>
</div>

<script>
const KEY='biltia_planning_chantier';
let items=[],editId=null,activeTab='list';

const DEFAULTS=[
  {id:1,nom:'Terrassement',chantier:'Résidence Les Pins',resp:'Équipe Dupont',debut:'2024-01-15',fin:'2024-01-26',status:'Terminé',notes:''},
  {id:2,nom:'Fondations',chantier:'Résidence Les Pins',resp:'Équipe Dupont',debut:'2024-01-29',fin:'2024-02-16',status:'Terminé',notes:'Béton C25/30'},
  {id:3,nom:'Gros œuvre RDC',chantier:'Résidence Les Pins',resp:'Équipe Martin',debut:'2024-02-19',fin:'2024-04-12',status:'En cours',notes:''},
  {id:4,nom:'Charpente',chantier:'Résidence Les Pins',resp:'Bois & Charpente SARL',debut:'2024-04-15',fin:'2024-05-10',status:'À faire',notes:'ST confirmé'},
  {id:5,nom:'Coulage dalle',chantier:'Extension Duval',resp:'Équipe Dupont',debut:'2024-02-01',fin:'2024-02-15',status:'Terminé',notes:''},
  {id:6,nom:'Structure métallique',chantier:'Extension Duval',resp:'MetalPro',debut:'2024-02-19',fin:'2024-03-15',status:'Bloqué',notes:'Attente livraison charpente métallique'}
];

function load(){
  try{ items=JSON.parse(localStorage.getItem(KEY)||'null')||null; }catch(e){ items=null; }
  if(!items){ items=DEFAULTS; save(); }
}
function save(){ localStorage.setItem(KEY,JSON.stringify(items)); }
function nextId(){ return items.length?Math.max(...items.map(i=>i.id))+1:1; }

function statusBadge(s){
  if(s==='Terminé') return '<span class="badge badge-green">Terminé</span>';
  if(s==='En cours') return '<span class="badge badge-amber">En cours</span>';
  if(s==='Bloqué') return '<span class="badge badge-red">Bloqué</span>';
  return '<span class="badge badge-gray">À faire</span>';
}

function renderKpi(){
  const total=items.length;
  const done=items.filter(i=>i.status==='Terminé').length;
  const wip=items.filter(i=>i.status==='En cours').length;
  const blocked=items.filter(i=>i.status==='Bloqué').length;
  document.getElementById('kpi-grid').innerHTML=\`
    <div class="kpi"><div class="kpi-label">Tâches totales</div><div class="kpi-value">\${total}</div></div>
    <div class="kpi"><div class="kpi-label">Terminées</div><div class="kpi-value">\${done}</div></div>
    <div class="kpi"><div class="kpi-label">En cours</div><div class="kpi-value">\${wip}</div></div>
    <div class="kpi"><div class="kpi-label">Bloquées</div><div class="kpi-value">\${blocked}</div></div>
  \`;
}

function updateChantierFilter(){
  const chantiers=[...new Set(items.map(i=>i.chantier).filter(Boolean))];
  const sel=document.getElementById('filter-chantier');
  const cur=sel.value;
  sel.innerHTML='<option value="">Tous les chantiers</option>'+chantiers.map(c=>\`<option\${c===cur?' selected':''}>\${c}</option>\`).join('');
  const dl=document.getElementById('chantier-list');
  if(dl) dl.innerHTML=chantiers.map(c=>\`<option value="\${c}">\`).join('');
}

function filteredItems(){
  const q=(document.getElementById('search').value||'').toLowerCase();
  const fc=document.getElementById('filter-chantier').value;
  const fs=document.getElementById('filter-status').value;
  return items.filter(i=>{
    const m=!q||(i.nom||'').toLowerCase().includes(q)||(i.resp||'').toLowerCase().includes(q);
    return m&&(!fc||i.chantier===fc)&&(!fs||i.status===fs);
  });
}

function render(){
  renderKpi();
  updateChantierFilter();
  const list=filteredItems().sort((a,b)=>(a.debut||'').localeCompare(b.debut||''));
  const tbody=document.getElementById('tbody');
  const empty=document.getElementById('empty');
  const ganttSection=document.getElementById('gantt-section');
  if(ganttSection) ganttSection.style.display=activeTab==='gantt'?'':'none';
  if(activeTab==='gantt'){ renderGantt(list); }
  if(!list.length){ tbody.innerHTML=''; empty.style.display=''; return; }
  empty.style.display='none';
  tbody.innerHTML=list.map(i=>\`
    <tr>
      <td style="font-weight:600;color:#0F172A">\${i.nom}</td>
      <td>\${i.chantier}</td>
      <td>\${i.resp}</td>
      <td>\${i.debut}</td>
      <td>\${i.fin}</td>
      <td>\${statusBadge(i.status)}</td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn btn-ghost btn-sm" onclick="openModal(\${i.id})">✏️</button>
          <button class="btn btn-danger" onclick="deleteItem(\${i.id})">🗑</button>
        </div>
      </td>
    </tr>
  \`).join('');
}

function renderGantt(list){
  if(!list.length){ document.getElementById('gantt-wrap').innerHTML='<div class="empty">Aucune tâche</div>'; return; }
  const dates=list.flatMap(i=>[i.debut,i.fin]).filter(Boolean).sort();
  const minD=new Date(dates[0]); const maxD=new Date(dates[dates.length-1]);
  const totalMs=maxD-minD||1;
  document.getElementById('gantt-wrap').innerHTML=\`
    <div style="font-weight:700;margin-bottom:12px;font-size:13px;color:#6B7280">
      \${minD.toLocaleDateString('fr-FR')} → \${maxD.toLocaleDateString('fr-FR')}
    </div>
    \${list.map(i=>{
      const s=new Date(i.debut||dates[0]); const e=new Date(i.fin||dates[dates.length-1]);
      const left=Math.max(0,(s-minD)/totalMs*100);
      const width=Math.max(2,(e-s)/totalMs*100);
      const colors={Terminé:'#7C3AED',En_cours:'#F59E0B',Bloqué:'#EF4444','À_faire':'#94A3B8'};
      const col=colors[(i.status||'').replace(' ','_')]||'#94A3B8';
      return \`<div class="gantt-row">
        <div class="gantt-label" title="\${i.nom}">\${i.nom}</div>
        <div class="gantt-track">
          <div class="gantt-bar" style="left:\${left}%;width:\${width}%;background:\${col}">
            <span class="gantt-bar-text">\${i.chantier}</span>
          </div>
        </div>
      </div>\`;
    }).join('')}
  \`;
}

function showTab(t){
  activeTab=t;
  document.getElementById('tab-list').className='tab-item'+(t==='list'?' active':'');
  document.getElementById('tab-gantt').className='tab-item'+(t==='gantt'?' active':'');
  render();
}

function openModal(id){
  editId=id||null;
  document.getElementById('modal-title').textContent=id?'Modifier la tâche':'Nouvelle tâche';
  const i=id?items.find(x=>x.id===id):{};
  document.getElementById('f-nom').value=i.nom||'';
  document.getElementById('f-chantier').value=i.chantier||'';
  document.getElementById('f-resp').value=i.resp||'';
  document.getElementById('f-debut').value=i.debut||'';
  document.getElementById('f-fin').value=i.fin||'';
  document.getElementById('f-status').value=i.status||'À faire';
  document.getElementById('f-notes').value=i.notes||'';
  const chantiers=[...new Set(items.map(x=>x.chantier).filter(Boolean))];
  document.getElementById('chantier-list').innerHTML=chantiers.map(c=>\`<option value="\${c}">\`).join('');
  document.getElementById('overlay').style.display='flex';
}
function closeModal(){ document.getElementById('overlay').style.display='none'; }

function saveItem(){
  const nom=document.getElementById('f-nom').value.trim();
  if(!nom){ alert('Nom de la tâche obligatoire'); return; }
  const obj={
    id:editId||nextId(),nom,
    chantier:document.getElementById('f-chantier').value.trim(),
    resp:document.getElementById('f-resp').value.trim(),
    debut:document.getElementById('f-debut').value,
    fin:document.getElementById('f-fin').value,
    status:document.getElementById('f-status').value,
    notes:document.getElementById('f-notes').value.trim()
  };
  if(editId){ items=items.map(i=>i.id===editId?obj:i); }
  else{ items.push(obj); }
  save(); closeModal(); render();
}

function deleteItem(id){
  if(!confirm('Supprimer cette tâche ?')) return;
  items=items.filter(i=>i.id!==id);
  save(); render();
}

load(); render();
</script>
</body>
</html>`,
  },
];

// Les modeles premium (design bespoke par modele) ecrasent les versions de base,
// et les modeles premium SANS equivalent de base (ex: equipes_taches) sont ajoutes.
export const TEMPLATE_APPS: TemplateApp[] = [
  ...BASE_APPS.map((a) => PREMIUM_APPS.find((p) => p.id === a.id) ?? a),
  ...PREMIUM_APPS.filter((p) => !BASE_APPS.some((a) => a.id === p.id)),
];
