// ─────────────────────────────────────────────────────────────────────────────
// SDK BILTIA — runtime injecté dans le HTML de chaque module généré.
//
// Remplace localStorage par la base partagée du workspace pour les entités
// connectées (cf. data-entities.ts). Appelle /api/data en same-origin : les
// cookies de session authentifient l'utilisateur et la RLS isole le tenant.
//
// v2 : toute erreur API affiche un TOAST visible dans l'app (plus jamais
// d'échec silencieux visible seulement en console — un artisan ne lit pas la
// console, il churn). Plomberie garantie serveur, pas déléguée au LLM.
//
// Hors Biltia (module déployé sur un autre domaine), les appels échouent
// proprement (pas de cookie) — la persistance partagée n'est dispo qu'au sein
// de l'OS pour l'instant.
// ─────────────────────────────────────────────────────────────────────────────

/** Marqueur d'idempotence : présent UNIQUEMENT dans le script du SDK lui-même.
 *  (Ne jamais tester `window.biltia` : le code généré par le modèle CONTIENT
 *  des appels `window.biltia.list(...)` → faux positif → SDK jamais injecté.)
 *
 *  v3 : appels via postMessage → parent (localhost:3000) plutôt que fetch direct
 *  depuis l'iframe srcdoc (origin: null → CORS bloqué). */
const SDK_MARKER = "__biltia_sdk_v6__";

export const BILTIA_SDK_SCRIPT = `<script>
/* ${SDK_MARKER} */
(function(){
  if (window.biltia) return;
  /* Un SEUL toast, mais deux tons NETS : succès (✓ vert, discret, 2,4 s) vs
     erreur (⚠ rouge, 5 s). Une confirmation d'enregistrement ne doit JAMAIS
     porter l'icône d'alerte — c'est déroutant pour un artisan. */
  function toast(msg, kind){
    try {
      var isErr = kind === 'error';
      var host = document.getElementById('__biltia_toasts');
      if (!host) {
        host = document.createElement('div');
        host.id = '__biltia_toasts';
        host.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483647;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;font-family:Inter,system-ui,sans-serif';
        document.body.appendChild(host);
      }
      var el = document.createElement('div');
      el.style.cssText = 'display:flex;align-items:center;gap:8px;max-width:92vw;background:#0A0A0A;color:#fff;font-size:13px;font-weight:600;line-height:1.45;padding:11px 15px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.22);opacity:0;transition:opacity .2s, transform .2s;transform:translateY(6px)';
      var ico = document.createElement('span');
      ico.style.cssText = 'font-size:14px;line-height:1;color:' + (isErr ? '#FB7185' : '#34D399');
      ico.textContent = isErr ? '⚠' : '✓';
      var txt = document.createElement('span');
      txt.textContent = String(msg || '');
      el.appendChild(ico); el.appendChild(txt);
      host.appendChild(el);
      requestAnimationFrame(function(){ el.style.opacity = '1'; el.style.transform = 'none'; });
      setTimeout(function(){
        el.style.opacity = '0'; el.style.transform = 'translateY(6px)';
        setTimeout(function(){ el.remove(); }, 250);
      }, isErr ? 5000 : 2400);
    } catch (e) {}
  }
  /* Pont postMessage : l'iframe (origin:null) ne peut pas faire fetch directement.
     Le parent reçoit BILTIA_API_CALL, fait le vrai fetch same-origin, renvoie
     BILTIA_API_RESPONSE avec le même id. */
  function call(body){
    return new Promise(function(resolve, reject){
      var id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      var timer = setTimeout(function(){
        window.removeEventListener('message', handler);
        toast('Connexion trop lente — réessayez.', 'error');
        reject(new Error('timeout'));
      }, 30000);
      function handler(e){
        if (!e.data || e.data.type !== 'BILTIA_API_RESPONSE' || e.data.id !== id) return;
        window.removeEventListener('message', handler);
        clearTimeout(timer);
        if (e.data.error) {
          toast(e.data.error, 'error');
          reject(new Error(e.data.error));
        } else {
          resolve(e.data.result);
        }
      }
      window.addEventListener('message', handler);
      window.parent.postMessage({ type: 'BILTIA_API_CALL', id: id, body: body }, '*');
    });
  }
  window.biltia = {
    list: function(entity, opts){ return call(Object.assign({ entity: entity, action: 'list' }, opts || {})).then(function(r){ return r.data || []; }); },
    get: function(entity, id){ return call({ entity: entity, action: 'get', id: id }).then(function(r){ return r.data; }); },
    create: function(entity, values){ return call({ entity: entity, action: 'create', values: values }).then(function(r){ return r.data; }); },
    update: function(entity, id, values){ return call({ entity: entity, action: 'update', id: id, values: values }).then(function(r){ return r.data; }); },
    remove: function(entity, id){ return call({ entity: entity, action: 'delete', id: id }).then(function(r){ return r.ok; }); },
    notify: function(msg){ toast(String(msg || ''), 'success'); },
    /* IA vision : lit une PHOTO (dataURL base64) et renvoie les champs demandés,
       prêts à stocker via biltia.create(). opts.fields = ['numero','fournisseur',…].
       Ex : var d = await biltia.extract(photoDataUrl, {fields:['numero','date']}); */
    extract: function(imageDataUrl, opts){
      opts = opts || {};
      var url = String(imageDataUrl || '');
      if (url.indexOf('data:') !== 0 || url.indexOf(';base64,') < 0) {
        return Promise.reject(new Error('biltia.extract attend une image (dataURL base64).'));
      }
      var mediaType = url.slice(5, url.indexOf(';base64,'));
      var data = url.slice(url.indexOf(';base64,') + 8);
      return call({ __endpoint: 'app-ai', action: 'extract',
        image: { name: opts.name || 'photo.jpg', mediaType: mediaType, data: data },
        fields: opts.fields || opts.champs || null,
        question: opts.question || opts.instructions || '' })
        .then(function(r){ return (r && r.data) || {}; });
    },
    /* IA voix : transcrit une DICTÉE (audio dataURL base64) → { text }. Avec
       opts.fields, structure aussi la dictée → { text, data:{...} } (ex : pointage). */
    transcribe: function(audioDataUrl, opts){
      opts = opts || {};
      var au = String(audioDataUrl || '');
      if (au.indexOf('data:') !== 0 || au.indexOf(';base64,') < 0) {
        return Promise.reject(new Error('biltia.transcribe attend un audio (dataURL base64).'));
      }
      var mt = au.slice(5, au.indexOf(';base64,'));
      var d = au.slice(au.indexOf(';base64,') + 8);
      return call({ __endpoint: 'app-ai', action: 'transcribe',
        audio: { mediaType: mt, data: d },
        fields: opts.fields || opts.champs || null,
        question: opts.question || opts.instructions || '' })
        .then(function(r){ return r || {}; });
    }
  };
})();
<\/script>`;

/** Insère le SDK dans le <head> du HTML généré (idempotent, upgrade v1…v5 → v6). */
export function injectBiltiaSDK(html: string): string {
  if (html.includes(SDK_MARKER)) return html; // déjà à jour
  // Versions antérieures présentes → on remplace par la v4 (ajout window.biltia.extract).
  if (html.includes("__biltia_sdk_v1__")) {
    return html.replace(/<script>\s*\/\* __biltia_sdk_v1__ \*\/[\s\S]*?<\/script>/, BILTIA_SDK_SCRIPT);
  }
  if (html.includes("__biltia_sdk_v2__")) {
    return html.replace(/<script>\s*\/\* __biltia_sdk_v2__ \*\/[\s\S]*?<\/script>/, BILTIA_SDK_SCRIPT);
  }
  if (html.includes("__biltia_sdk_v3__")) {
    return html.replace(/<script>\s*\/\* __biltia_sdk_v3__ \*\/[\s\S]*?<\/script>/, BILTIA_SDK_SCRIPT);
  }
  if (html.includes("__biltia_sdk_v4__")) {
    return html.replace(/<script>\s*\/\* __biltia_sdk_v4__ \*\/[\s\S]*?<\/script>/, BILTIA_SDK_SCRIPT);
  }
  if (html.includes("__biltia_sdk_v5__")) {
    return html.replace(/<script>\s*\/\* __biltia_sdk_v5__ \*\/[\s\S]*?<\/script>/, BILTIA_SDK_SCRIPT);
  }
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => m + "\n" + BILTIA_SDK_SCRIPT);
  }
  return BILTIA_SDK_SCRIPT + html;
}
