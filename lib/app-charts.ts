// ─────────────────────────────────────────────────────────────────────────────
// MOTEUR DE GRAPHIQUES PARTAGÉ (apps phares) — interactif + animé, zéro dépendance.
//
// Deux chaînes injectées dans le HTML des apps générées :
//   • CHART_CSS      → dans <style> (utilise les tokens --line/--ink/--vio/--faint
//                      de l'app, donc s'adapte à chaque palette).
//   • CHART_ENGINE_JS → dans <script> (fonctions drawArea / drawBars / chartCountUp).
//
// Autonome : n'utilise que window + `$` (getElementById, présent dans chaque app).
// Chaque série = { value, label (axe X), tip? (infobulle, défaut = label) }.
// Options : { id, color, color2, fmt(v)->string, unit, rd (id d'un readout à mettre
// à jour au survol), rdDef (valeur par défaut du readout) }.
// Survol → repère vertical + point/barre mis en avant + infobulle + readout ; au
// montage → tracé de la courbe / montée des barres animés. Dégrade proprement si
// requestAnimationFrame absent (rendu statique, ex. tests DOM-shim).
//
// Contrainte : PAS de backticks dans le corps JS (ce fichier EST un backtick TS).
// ─────────────────────────────────────────────────────────────────────────────

export const CHART_CSS = `
.chart-card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:16px 16px 12px;box-shadow:var(--shadow)}
.chart-hd{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:8px}
.chart-hd b{font-size:14px;font-weight:700}
.chart-hd .rd{font-size:12px;color:var(--faint);font-variant-numeric:tabular-nums;white-space:nowrap}
.chart-host{touch-action:pan-y;overflow:hidden}
.chart-card{overflow:hidden}
.chart-rel{position:relative}
/* Le viewBox est recalculé à la largeur RÉELLE du conteneur (voir _cwatch) : le SVG
   garde donc ses proportions exactes. height:auto empêche l'étirement vertical qui
   faisait déborder les barres hors de leur carte sur tablette et grand écran. */
.chart-rel svg{display:block;width:100%;height:auto;max-width:100%}
.chart-tip{position:absolute;pointer-events:none;background:var(--ink);color:#fff;border-radius:9px;padding:6px 10px;font-size:11.5px;line-height:1.25;white-space:nowrap;transition:opacity .12s;box-shadow:0 8px 20px rgba(0,0,0,.24);z-index:6}
.chart-tip b{display:block;font-weight:800;font-variant-numeric:tabular-nums;font-size:12.5px}
.chart-tip span{color:rgba(255,255,255,.6);font-size:10px}
.chart-x{display:flex;justify-content:space-between;padding:0 2px;margin-top:6px}
.chart-x span{font-size:9.5px;color:var(--faint);flex:1;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 1px}
.bar{cursor:pointer;transition:opacity .15s}
`;

export const CHART_ENGINE_JS = `
function _cnum(v){var n=parseFloat(String(v==null?"":v).replace(",",".").replace(/[^0-9.\\-]/g,""));return isFinite(n)?n:0;}
function _cesc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function _canim(fn){ if(window.requestAnimationFrame)window.requestAnimationFrame(fn); else fn(); }
function chartCountUp(el,to,fmt,dur){ if(!el)return; to=_cnum(to); if(!window.requestAnimationFrame){ el.textContent=fmt?fmt(to):Math.round(to); return; } dur=dur||900; var t0=null; function step(ts){ if(t0==null)t0=ts; var p=Math.min(1,(ts-t0)/dur),e=1-Math.pow(1-p,3),v=to*e; el.textContent=fmt?fmt(v):Math.round(v); if(p<1)window.requestAnimationFrame(step);} window.requestAnimationFrame(step); }
function _cgeom(host,series,H,pt,pb){ var W=Math.max(60,host.clientWidth||host.offsetWidth||320),pl=6,pr=6,n=series.length; var vals=series.map(function(s){return _cnum(s.value);}); var max=Math.max.apply(null,vals.concat([1])); if(max<=0)max=1; var iw=W-pl-pr,ih=H-pt-pb; return {W:W,H:H,pl:pl,pr:pr,pt:pt,pb:pb,n:n,iw:iw,ih:ih,max:max,X:function(i){return pl+(n<=1?iw/2:iw*i/(n-1));},Y:function(v){return pt+ih-(_cnum(v)/max)*ih;}}; }
function drawArea(host,series,opt){
  if(!host||!series||!series.length)return; opt=opt||{}; var color=opt.color||"#6D5EF6",fmt=opt.fmt||function(v){return Math.round(v).toLocaleString("fr-FR");},unit=opt.unit||"";
  var g=_cgeom(host,series,opt.h||150,16,22),pts=series.map(function(s,i){return {x:g.X(i),y:g.Y(s.value),v:_cnum(s.value),label:s.label,tip:s.tip||s.label};});
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
  host.innerHTML='<div class="chart-rel">'+svg+'<div class="chart-tip" style="opacity:0"></div></div><div class="chart-x">'+series.map(function(s){return '<span>'+_cesc(s.label)+'</span>';}).join("")+'</div>';
  var svgEl=host.querySelector("svg"),gl=host.querySelector(".ar-g"),dot=host.querySelector(".ar-d"),tip=host.querySelector(".chart-tip"),ln=host.querySelector(".ar-line"),ar=host.querySelector(".ar-area");
  _canim(function(){ if(ar&&ar.style){ar.style.transition="opacity .6s ease";ar.style.opacity="1";} try{ var L=ln.getTotalLength(); ln.style.strokeDasharray=L; ln.style.strokeDashoffset=L; ln.getBoundingClientRect&&ln.getBoundingClientRect(); ln.style.transition="stroke-dashoffset .9s ease"; ln.style.strokeDashoffset="0"; }catch(e){} });
  function show(i){ var p=pts[i]; if(!p)return; gl.setAttribute("x1",p.x);gl.setAttribute("x2",p.x);gl.style.opacity="1"; dot.setAttribute("cx",p.x);dot.setAttribute("cy",p.y);dot.style.opacity="1"; if(tip){ tip.innerHTML='<b>'+fmt(p.v)+unit+'</b><span>'+_cesc(p.tip)+'</span>'; tip.style.opacity="1"; var tw=tip.offsetWidth||64; tip.style.left=Math.max(2,Math.min(g.W-tw-2,p.x-tw/2))+"px"; tip.style.top=Math.max(0,p.y-46)+"px"; } if(opt.rd){var r=$(opt.rd);if(r)r.textContent=fmt(p.v)+unit;} }
  function hide(){ gl.style.opacity="0";dot.style.opacity="0";if(tip)tip.style.opacity="0"; if(opt.rd&&opt.rdDef!=null){var r=$(opt.rd);if(r)r.textContent=opt.rdDef;} }
  function at(cx){ if(!svgEl.getBoundingClientRect)return; var rc=svgEl.getBoundingClientRect(); var fx=(cx-rc.left)/(rc.width||g.W); show(Math.max(0,Math.min(g.n-1,Math.round(fx*(g.n-1))))); }
  if(svgEl.addEventListener){ svgEl.addEventListener("pointermove",function(e){at(e.clientX);}); svgEl.addEventListener("pointerdown",function(e){at(e.clientX);}); svgEl.addEventListener("pointerleave",hide); svgEl.addEventListener("touchmove",function(e){if(e.touches&&e.touches[0])at(e.touches[0].clientX);},{passive:true}); }
  _cwatch(host,function(){drawArea(host,series,opt);});
}
/* REDESSIN À LA VOLÉE. La géométrie était figée au montage (host.clientWidth lu une
   seule fois) : au moindre changement de largeur — tablette, rotation, sidebar qui se
   replie, fenêtre redimensionnée — le viewBox restait périmé et le dessin débordait.
   On observe le conteneur et on redessine à sa largeur réelle. */
function _cwatch(host,fn){
  if(!host||typeof ResizeObserver==="undefined")return;
  if(host.__cro){try{host.__cro.disconnect();}catch(e){}}
  var w=host.clientWidth,t;
  var ro=new ResizeObserver(function(){
    var nw=host.clientWidth;
    if(!nw||Math.abs(nw-w)<8)return; /* ignore les micro-variations */
    w=nw; clearTimeout(t); t=setTimeout(fn,120);
  });
  try{ro.observe(host);host.__cro=ro;}catch(e){}
}
function drawBars(host,series,opt){
  if(!host||!series||!series.length)return; opt=opt||{}; var c1=opt.color||"#6D5EF6",c2=opt.color2||"#A78BFA",fmt=opt.fmt||function(v){return Math.round(v).toLocaleString("fr-FR");},unit=opt.unit||"";
  var g=_cgeom(host,series,opt.h||150,12,22),slot=g.iw/g.n,bw=Math.min(46,slot*0.56); if(bw<5)bw=Math.max(4,slot*0.6);
  var bars=series.map(function(s,i){ var h=(_cnum(s.value)/g.max)*g.ih; var x=g.pl+i*slot+(slot-bw)/2; return {x:x,y:g.pt+g.ih-h,h:h,bw:bw,v:_cnum(s.value),label:s.label,tip:s.tip||s.label,base:g.pt+g.ih}; });
  var gid="bg"+(opt.id||"");
  var rects=bars.map(function(b,i){return '<rect class="bar" data-i="'+i+'" x="'+b.x.toFixed(1)+'" y="'+b.base.toFixed(1)+'" width="'+b.bw.toFixed(1)+'" height="0" rx="5" fill="url(#'+gid+')"/>';}).join("");
  var svg='<svg width="'+g.W+'" height="'+g.H+'" viewBox="0 0 '+g.W+' '+g.H+'"><defs><linearGradient id="'+gid+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="'+c2+'"/><stop offset="1" stop-color="'+c1+'"/></linearGradient></defs>'+rects+'</svg>';
  host.innerHTML='<div class="chart-rel">'+svg+'<div class="chart-tip" style="opacity:0"></div></div><div class="chart-x">'+series.map(function(s){return '<span>'+_cesc(s.label)+'</span>';}).join("")+'</div>';
  var svgEl=host.querySelector("svg"),tip=host.querySelector(".chart-tip"),rs=host.querySelectorAll(".bar");
  _canim(function(){ for(var i=0;i<rs.length;i++){ (function(el,b){ if(el.style)el.style.transition="y .7s cubic-bezier(.2,.8,.2,1),height .7s cubic-bezier(.2,.8,.2,1)"; el.setAttribute("y",b.y.toFixed(1)); el.setAttribute("height",Math.max(0,b.h).toFixed(1)); })(rs[i],bars[i]); } });
  function show(i){ var b=bars[i]; if(!b)return; for(var k=0;k<rs.length;k++)if(rs[k].style)rs[k].style.opacity=(k===i?"1":"0.45"); if(tip){ tip.innerHTML='<b>'+fmt(b.v)+unit+'</b><span>'+_cesc(b.tip)+'</span>'; tip.style.opacity="1"; var tw=tip.offsetWidth||60; tip.style.left=Math.max(2,Math.min(g.W-tw-2,b.x+b.bw/2-tw/2))+"px"; tip.style.top=Math.max(0,b.y-46)+"px"; } if(opt.rd){var r=$(opt.rd);if(r)r.textContent=fmt(b.v)+unit;} }
  function hide(){ for(var k=0;k<rs.length;k++)if(rs[k].style)rs[k].style.opacity="1"; if(tip)tip.style.opacity="0"; if(opt.rd&&opt.rdDef!=null){var r=$(opt.rd);if(r)r.textContent=opt.rdDef;} }
  function at(cx){ if(!svgEl.getBoundingClientRect)return; var rc=svgEl.getBoundingClientRect(); var fx=(cx-rc.left)/(rc.width||g.W); show(Math.max(0,Math.min(g.n-1,Math.floor(fx*g.n)))); }
  if(svgEl.addEventListener){ svgEl.addEventListener("pointermove",function(e){at(e.clientX);}); svgEl.addEventListener("pointerdown",function(e){at(e.clientX);}); svgEl.addEventListener("pointerleave",hide); svgEl.addEventListener("touchmove",function(e){if(e.touches&&e.touches[0])at(e.touches[0].clientX);},{passive:true}); }
  _cwatch(host,function(){drawBars(host,series,opt);});
}
`;

// ─────────────────────────────────────────────────────────────────────────────
// INJECTION (apps GÉNÉRÉES par l'IA). Les apps phares embarquent déjà le moteur
// via `${CHART_ENGINE_JS}` à la compilation ; les apps produites par le LLM, elles,
// se contentent d'APPELER drawArea/drawBars/chartCountUp (le prompt le leur dit) —
// ce helper injecte le moteur (CSS + JS) dans le <head> AVANT le script de l'app,
// exactement comme injectBiltiaSDK. Idempotent, et sans effet sur une app qui
// embarque déjà le moteur (flagship). Ainsi le « graphique interactif signature »
// marche à coup sûr, sans que le modèle ait à réécrire 40 lignes de SVG.
// ─────────────────────────────────────────────────────────────────────────────

const CHART_MARKER = "/* __biltia_charts_v1__ */";

export function injectChartEngine(html: string): string {
  if (typeof html !== "string" || !html) return html;
  if (html.includes(CHART_MARKER)) return html; // déjà injecté
  if (html.includes("function drawBars(")) return html; // app phare : moteur déjà embarqué
  const block =
    "<style>" +
    CHART_MARKER +
    "\n" +
    CHART_CSS +
    "\n</style>\n<script>" +
    CHART_MARKER +
    "\nif(typeof window!==\"undefined\"&&typeof window.$===\"undefined\"){window.$=function(id){return document.getElementById(id);};}\n" +
    CHART_ENGINE_JS +
    "\n</script>";
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => m + "\n" + block);
  }
  return block + html;
}

