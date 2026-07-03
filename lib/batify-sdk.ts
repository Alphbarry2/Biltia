// ─────────────────────────────────────────────────────────────────────────────
// SDK BATIFY — runtime injecté dans le HTML de chaque module généré.
//
// Remplace localStorage par la base partagée du workspace pour les entités
// connectées (cf. data-entities.ts). Appelle /api/data en same-origin : les
// cookies de session authentifient l'utilisateur et la RLS isole le tenant.
//
// Hors Batify (module déployé sur un autre domaine), les appels échouent
// proprement (pas de cookie) — la persistance partagée n'est dispo qu'au sein
// de l'OS pour l'instant.
// ─────────────────────────────────────────────────────────────────────────────

export const BATIFY_SDK_SCRIPT = `<script>
(function(){
  if (window.batify) return;
  async function call(body){
    var res = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body)
    });
    var json = null;
    try { json = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error((json && json.error) || ('Batify API ' + res.status));
    return json;
  }
  window.batify = {
    list: function(entity, opts){ return call(Object.assign({ entity: entity, action: 'list' }, opts || {})).then(function(r){ return r.data || []; }); },
    get: function(entity, id){ return call({ entity: entity, action: 'get', id: id }).then(function(r){ return r.data; }); },
    create: function(entity, values){ return call({ entity: entity, action: 'create', values: values }).then(function(r){ return r.data; }); },
    update: function(entity, id, values){ return call({ entity: entity, action: 'update', id: id, values: values }).then(function(r){ return r.data; }); },
    remove: function(entity, id){ return call({ entity: entity, action: 'delete', id: id }).then(function(r){ return r.ok; }); }
  };
})();
<\/script>`;

/** Insère le SDK dans le <head> du HTML généré (idempotent). */
export function injectBatifySDK(html: string): string {
  if (html.includes("window.batify")) return html;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => m + "\n" + BATIFY_SDK_SCRIPT);
  }
  return BATIFY_SDK_SCRIPT + html;
}
