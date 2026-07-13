// ─────────────────────────────────────────────────────────────────────────────
// COMPOSANTS DÉTERMINISTES (Phase 8) — runtime `window.biltiaUI` injecté.
//
// Même patron que le moteur de graphiques (app-charts.ts) : un runtime robuste,
// sans dépendance, PRÉ-INJECTÉ dans chaque app. Le LLM APPELLE ces fonctions pour
// les BRIQUES CRITIQUES (table, formulaire, kanban, KPI) — la plomberie fragile
// (liaison window.biltia, CRUD, recherche/tri, glisser-déposer persistant, selects
// relationnels) devient DÉTERMINISTE et garantie. Le reste de l'UI reste libre.
//
// Hybride assumé : on ne rend PAS toute l'interface rigide. Le LLM choisit la
// composition, les colonnes, les libellés, le style ; le moteur garantit que
// « ça marche vraiment » là où l'audit pointait la fragilité n°1.
//
// S'appuie sur le SDK window.biltia (injecté séparément) et sur le design system
// CSS déjà présent (.table-wrap, .btn, .modal, .badge, .kpi…).
// ─────────────────────────────────────────────────────────────────────────────

const COMPONENT_MARKER = "__biltia_ui_v3__";

export const BILTIA_UI_SCRIPT = `<script>
/* ${COMPONENT_MARKER} */
(function(){
  if (window.biltiaUI) return;
  function el(tag, props, kids){
    var e = document.createElement(tag);
    if (props) for (var k in props){
      if (k === 'class') e.className = props[k];
      else if (k === 'html') e.innerHTML = props[k];
      else if (k === 'text') e.textContent = props[k];
      else if (k.slice(0,2) === 'on' && typeof props[k] === 'function') e.addEventListener(k.slice(2).toLowerCase(), props[k]);
      else if (props[k] != null) e.setAttribute(k, props[k]);
    }
    if (kids) (Array.isArray(kids)?kids:[kids]).forEach(function(c){ if(c==null)return; e.appendChild(typeof c==='string'?document.createTextNode(c):c); });
    return e;
  }
  var frInt = new Intl.NumberFormat('fr-FR');
  var frCur = new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:2});
  function fmt(v, type){
    if (v == null || v === '') return '—';
    try {
      if (type === 'currency') return frCur.format(Number(v)||0);
      if (type === 'percentage') return (Math.round((Number(v)||0))) + ' %';
      if (type === 'number') return frInt.format(Number(v)||0);
      if (type === 'boolean') return v ? 'Oui' : 'Non';
      if (type === 'date') { var d = new Date(v); return isNaN(d)? String(v) : d.toLocaleDateString('fr-FR'); }
      if (type === 'datetime') { var d2 = new Date(v); return isNaN(d2)? String(v) : d2.toLocaleString('fr-FR'); }
    } catch(e){}
    return String(v);
  }
  function trk(t, m){ try { if (window.biltia && window.biltia.track) window.biltia.track(t, m || {}); } catch(e){} }
  function statusFieldOf(row){ return ('statut' in row) ? 'statut' : ('status' in row) ? 'status' : null; }
  function host(h){ return typeof h === 'string' ? document.getElementById(h) : h; }
  function setState(node, kind, msg){
    node.innerHTML = '';
    var cls = kind === 'error' ? 'empty' : 'empty';
    node.appendChild(el('div',{class:cls}, [
      el('div',{class:'empty-title', text: kind==='error' ? 'Connexion impossible' : (kind==='loading'?'Chargement…':'Rien pour l\\'instant')}),
      msg ? el('div',{class:'empty-sub', text: msg}) : null
    ]));
  }

  // ── TABLE ────────────────────────────────────────────────────────────────
  // opts: { entity, columns:[{key,label,type}], search, order, ascending, match,
  //         limit, onRowClick(row), rowActions:[{label,onClick(row)}], title }
  function table(h, opts){
    var node = host(h); if(!node) return;
    opts = opts || {}; var cols = opts.columns || [];
    var state = { rows: [], q: '', sortKey: null, sortAsc: true };
    var firstLoad = true;
    setState(node,'loading');
    function load(){
      return window.biltia.list(opts.entity, { order: opts.order||'created_at', ascending: opts.ascending===true, match: opts.match||null, limit: opts.limit||200 })
        .then(function(rows){ state.rows = rows||[]; render(); if(firstLoad){ firstLoad=false; trk('view_opened',{view:'table',entity:opts.entity}); } })
        .catch(function(){ setState(node,'error','Impossible de charger les données du workspace.'); trk('action_failed',{entity:opts.entity,action:'load'}); });
    }
    function filtered(){
      var r = state.rows;
      if (state.q){ var q = state.q.toLowerCase(); r = r.filter(function(row){ return cols.some(function(c){ return String(row[c.key]==null?'':row[c.key]).toLowerCase().indexOf(q) >= 0; }); }); }
      if (state.sortKey){ r = r.slice().sort(function(a,b){ var x=a[state.sortKey], y=b[state.sortKey]; if(x==null)return 1; if(y==null)return -1; if(x<y)return state.sortAsc?-1:1; if(x>y)return state.sortAsc?1:-1; return 0; }); }
      return r;
    }
    function render(){
      node.innerHTML='';
      if (opts.search){
        var bar = el('div',{class:'search-bar'});
        var input = el('input',{type:'search',placeholder:'Rechercher…',oninput:function(e){ state.q=e.target.value; renderBody(); }});
        bar.appendChild(input); node.appendChild(bar);
      }
      var wrap = el('div',{class:'table-wrap'});
      var tbl = el('table');
      var thead = el('thead'); var htr = el('tr');
      cols.forEach(function(c){ htr.appendChild(el('th',{ style:'cursor:pointer', onclick:function(){ if(state.sortKey===c.key)state.sortAsc=!state.sortAsc; else{state.sortKey=c.key;state.sortAsc=true;} renderBody(); }, text: c.label||c.key })); });
      if (opts.rowActions && opts.rowActions.length) htr.appendChild(el('th',{text:''}));
      thead.appendChild(htr); tbl.appendChild(thead);
      var tbody = el('tbody'); tbl.appendChild(tbody); wrap.appendChild(tbl); node.appendChild(wrap);
      node._tbody = tbody; renderBody();
    }
    function renderBody(){
      var tbody = node._tbody; if(!tbody) return; tbody.innerHTML='';
      var rows = filtered();
      if (!rows.length){ var tr=el('tr'); tr.appendChild(el('td',{colspan:String(cols.length+1),html:'<div class="empty"><div class="empty-title">Aucun résultat</div></div>'})); tbody.appendChild(tr); return; }
      rows.forEach(function(row){
        var tr = el('tr',{ style: opts.onRowClick?'cursor:pointer':'', onclick: opts.onRowClick?function(){opts.onRowClick(row);}:null });
        cols.forEach(function(c){ tr.appendChild(el('td',{title:String(row[c.key]==null?'':row[c.key]),text: fmt(row[c.key], c.type)})); });
        if (opts.rowActions && opts.rowActions.length){
          var td = el('td'); opts.rowActions.forEach(function(a){ td.appendChild(el('button',{class:'btn btn-ghost btn-sm',style:'margin-right:6px',onclick:function(ev){ev.stopPropagation();a.onClick(row);},text:a.label})); }); tr.appendChild(td);
        }
        tbody.appendChild(tr);
      });
    }
    node._reload = load; load();
    return { reload: load };
  }

  // ── KPI ──────────────────────────────────────────────────────────────────
  // opts: { entity, label, compute:'count'|'sum'|'avg', field, match, type, sub }
  function kpi(h, opts){
    var node = host(h); if(!node) return; opts = opts||{};
    node.innerHTML=''; var card = el('div',{class:'kpi'});
    var lab = el('div',{class:'kpi-label',text:opts.label||''}); var val = el('div',{class:'kpi-value',text:'…'});
    card.appendChild(lab); card.appendChild(val); if(opts.sub) card.appendChild(el('div',{class:'kpi-sub',text:opts.sub})); node.appendChild(card);
    window.biltia.list(opts.entity,{match:opts.match||null,limit:500}).then(function(rows){
      rows = rows||[]; var out=0;
      if (opts.compute==='sum'||opts.compute==='avg'){ var s=0,n=0; rows.forEach(function(r){ var x=Number(r[opts.field]); if(!isNaN(x)){s+=x;n++;} }); out = opts.compute==='avg'? (n?s/n:0) : s; }
      else out = rows.length;
      val.textContent = fmt(out, opts.type||(opts.compute==='count'?'number':'number'));
    }).catch(function(){ val.textContent='—'; });
  }

  // ── KANBAN ─────────────────────────────────────────────────────────────────
  // opts: { entity, statusField, columns:[{value,label}], cardTitle(row), cardMeta(row), onCardClick(row) }
  function kanban(h, opts){
    var node = host(h); if(!node) return; opts = opts||{};
    var sf = opts.statusField; var firstK = true;
    setState(node,'loading');
    function load(){
      return window.biltia.list(opts.entity,{limit:300}).then(function(rows){ render(rows||[]); if(firstK){ firstK=false; trk('view_opened',{view:'kanban',entity:opts.entity}); } }).catch(function(){ setState(node,'error'); trk('action_failed',{entity:opts.entity,action:'load'}); });
    }
    function move(id, to){ var patch={}; patch[sf]=to; return window.biltia.update(opts.entity,id,patch).then(load).catch(function(){ load(); }); }
    function render(rows){
      node.innerHTML='';
      var wrap = el('div',{style:'display:flex;gap:12px;overflow-x:auto;padding:4px 2px;-webkit-overflow-scrolling:touch'});
      (opts.columns||[]).forEach(function(col, ci){
        var lane = el('div',{style:'flex:1;min-width:230px;background:var(--soft,#F6F6F8);border:1px solid var(--line,#ECECF0);border-radius:16px;padding:10px'});
        var items = rows.filter(function(r){ return String(r[sf]||'') === String(col.value); });
        lane.appendChild(el('div',{class:'kpi-label',style:'padding:2px 4px 8px',text:(col.label||col.value)+' · '+items.length}));
        lane.setAttribute('data-col', col.value);
        lane.addEventListener('dragover', function(e){ e.preventDefault(); });
        lane.addEventListener('drop', function(e){ e.preventDefault(); var id=e.dataTransfer.getData('text/id'); if(id) move(id, col.value); });
        items.forEach(function(r){
          var card = el('div',{ draggable:'true', style:'background:#fff;border:1px solid var(--line,#ECECF0);border-radius:12px;padding:10px 12px;margin-bottom:8px;box-shadow:var(--shadow);cursor:pointer', onclick: opts.onCardClick?function(){opts.onCardClick(r);}:null });
          card.addEventListener('dragstart', function(e){ e.dataTransfer.setData('text/id', r.id); });
          card.appendChild(el('div',{style:'font-weight:600;font-size:13px',text: opts.cardTitle?opts.cardTitle(r):(r.nom||r.title||r.titre||r.designation||'—')}));
          if (opts.cardMeta){ card.appendChild(el('div',{style:'font-size:12px;color:var(--mut,#63636B);margin-top:3px',text: opts.cardMeta(r)})); }
          // Mobile : boutons ‹ › pour changer de colonne au tap.
          var nav = el('div',{style:'display:flex;gap:6px;margin-top:8px'});
          if (ci>0) nav.appendChild(el('button',{class:'btn btn-ghost btn-sm',text:'‹',onclick:function(ev){ev.stopPropagation();move(r.id,opts.columns[ci-1].value);}}));
          if (ci<opts.columns.length-1) nav.appendChild(el('button',{class:'btn btn-ghost btn-sm',text:'›',onclick:function(ev){ev.stopPropagation();move(r.id,opts.columns[ci+1].value);}}));
          card.appendChild(nav);
          lane.appendChild(card);
        });
        wrap.appendChild(lane);
      });
      node.appendChild(wrap);
    }
    node._reload = load; load();
    return { reload: load };
  }

  // ── FORM ───────────────────────────────────────────────────────────────────
  // opts: { entity, fields:[{key,label,type,required,options,relation}], record, onSaved(row) }
  function form(h, opts){
    var node = host(h); if(!node) return; opts = opts||{};
    var rec = opts.record || {}; var fields = opts.fields || [];
    node.innerHTML=''; var frm = el('form',{class:'card'});
    var inputs = {};
    fields.forEach(function(f){
      var fg = el('div',{class:'fg'});
      fg.appendChild(el('label',{class:'fl',text:(f.label||f.key)+(f.required?' *':'')}));
      var input;
      if (f.type==='relation' && f.relation){
        input = el('select'); input.appendChild(el('option',{value:'',text:'—'}));
        window.biltia.list(f.relation,{limit:500}).then(function(rows){ (rows||[]).forEach(function(r){ var label=r.nom||(r.prenom?(r.prenom+' '+(r.nom||'')):null)||r.title||r.titre||r.numero||r.designation||r.id; var o=el('option',{value:r.id,text:label}); if(String(rec[f.key])===String(r.id))o.setAttribute('selected','selected'); input.appendChild(o); }); }).catch(function(){});
      } else if (f.type==='select' || f.type==='status'){
        input = el('select'); input.appendChild(el('option',{value:'',text:'—'}));
        (f.options||[]).forEach(function(op){ var o=el('option',{value:op,text:op}); if(rec[f.key]===op)o.setAttribute('selected','selected'); input.appendChild(o); });
      } else if (f.type==='long_text'){
        input = el('textarea',{rows:'3'}); if(rec[f.key]!=null)input.value=rec[f.key];
      } else if (f.type==='boolean'){
        input = el('input',{type:'checkbox'}); if(rec[f.key])input.setAttribute('checked','checked');
      } else {
        var itype = f.type==='number'||f.type==='currency'||f.type==='percentage'?'number': f.type==='date'?'date': f.type==='datetime'?'datetime-local': f.type==='email'?'email': f.type==='phone'?'tel': f.type==='url'?'url':'text';
        input = el('input',{type:itype}); if(rec[f.key]!=null)input.value=rec[f.key];
      }
      inputs[f.key]=input; fg.appendChild(input);
      var err = el('span',{class:'field-error',style:'display:none'}); fg.appendChild(err); inputs[f.key]._err=err;
      frm.appendChild(fg);
    });
    var actions = el('div',{class:'modal-actions'});
    var submit = el('button',{class:'btn btn-primary',type:'submit',text: rec.id?'Enregistrer':'Créer'}); actions.appendChild(submit);
    frm.appendChild(actions);
    frm.addEventListener('submit', function(e){
      e.preventDefault(); var values={}; var ok=true;
      fields.forEach(function(f){ var input=inputs[f.key]; var v = f.type==='boolean'?input.checked:input.value;
        input.classList.remove('invalid'); input._err.style.display='none';
        if (f.required && (v==null || v==='')){ ok=false; input.classList.add('invalid'); input._err.textContent='Champ requis'; input._err.style.display='block'; }
        if (v==='' && f.type!=='boolean') v = null;
        if ((f.type==='number'||f.type==='currency'||f.type==='percentage') && v!=null) v = Number(v);
        values[f.key]=v;
      });
      if(!ok) return;
      submit.disabled=true; submit.textContent='…';
      var isNew = !rec.id;
      var p = rec.id ? window.biltia.update(opts.entity, rec.id, values) : window.biltia.create(opts.entity, values);
      p.then(function(row){ window.biltia.notify(rec.id?'Enregistré':'Créé'); if(isNew)trk('record_created_from_app',{entity:opts.entity}); if(opts.onSaved)opts.onSaved(row); }).catch(function(){ submit.disabled=false; submit.textContent=rec.id?'Enregistrer':'Créer'; trk('action_failed',{entity:opts.entity,action:'save'}); });
    });
    node.appendChild(frm);
  }

  // ── FORMULE DÉCLARATIVE (Phase 9) — évaluateur DSL borné, aucun eval ─────────
  // expr : { value } | { field } | { relationSum } | { operation, args:[...] }.
  function num(v){ if(typeof v==='boolean')return v?1:0; var n=Number(v); return isFinite(n)?n:0; }
  function compute(expr, record, opts, depth){
    opts = opts || {}; depth = depth||0; if(depth>20 || !expr || typeof expr!=='object') return null;
    if ('value' in expr) return expr.value;
    if ('field' in expr) return record ? record[expr.field] : null;
    if ('relationSum' in expr) return (opts.sums && opts.sums[expr.relationSum]) || 0;
    if (!('operation' in expr)) return null;
    var args = Array.isArray(expr.args)?expr.args:[];
    var ev = function(e){ return compute(e, record, opts, depth+1); };
    var ns = function(){ return args.map(function(a){ return num(ev(a)); }); };
    switch(expr.operation){
      case 'add': case 'sum': return ns().reduce(function(a,b){return a+b;},0);
      case 'subtract': { var n=ns(); return n.length? n.slice(1).reduce(function(a,b){return a-b;},n[0]):0; }
      case 'multiply': return ns().reduce(function(a,b){return a*b;},1);
      case 'divide': { var n2=ns(); return n2.length>=2&&n2[1]!==0? n2[0]/n2[1]:0; }
      case 'average': { var n3=ns(); return n3.length? n3.reduce(function(a,b){return a+b;},0)/n3.length:0; }
      case 'count': return args.filter(function(a){ var v=ev(a); return v!=null&&v!==''; }).length;
      case 'min': { var n4=ns(); return n4.length?Math.min.apply(null,n4):0; }
      case 'max': { var n5=ns(); return n5.length?Math.max.apply(null,n5):0; }
      case 'percentage': { var n6=ns(); return n6.length>=2&&n6[1]!==0? Math.round(n6[0]/n6[1]*100):0; }
      case 'coalesce': { for(var i=0;i<args.length;i++){ var v=ev(args[i]); if(v!=null&&v!=='')return v; } return null; }
      case 'if': return ev(args[0])? ev(args[1]) : (args[2]!=null?ev(args[2]):null);
      case 'date_diff': { var a=new Date(ev(args[0])), b=new Date(ev(args[1])); if(isNaN(a)||isNaN(b))return 0; return Math.round((a.getTime()-b.getTime())/86400000); }
      default: return null;
    }
  }

  window.biltiaUI = { table: table, kpi: kpi, kanban: kanban, form: form, format: fmt, compute: compute };
})();
<\/script>`;

/** Insère le runtime de composants dans le <head> (idempotent). */
export function injectComponentEngine(html: string): string {
  if (html.includes(COMPONENT_MARKER)) return html;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => m + "\n" + BILTIA_UI_SCRIPT);
  }
  return BILTIA_UI_SCRIPT + html;
}
