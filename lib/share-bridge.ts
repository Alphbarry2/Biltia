// ─────────────────────────────────────────────────────────────────────────────
// BRIDGE DE PORTAIL CLIENT — répondeur window.biltia pour un lien 'client'.
//
// Le SDK injecté dans l'app poste { type:'BILTIA_API_CALL', id, body } vers
// window.parent et attend un BILTIA_API_RESPONSE. Servie en page publique (top),
// window.parent === window : ce script écoute sur window et répond en routant
// les lectures (list/get) vers /api/share/data avec le TOKEN. Tout le reste —
// écritures, e-mail, SMS, IA — est refusé (lien en lecture seule).
//
// Le scope réel est appliqué CÔTÉ SERVEUR par l'endpoint ; ce bridge n'est
// qu'un tuyau (aucune donnée sensible n'y transite en dur, hormis le token).
// ─────────────────────────────────────────────────────────────────────────────

export function injectShareBridge(html: string, token: string): string {
  const script =
    "\n<script>(function(){" +
    "var TOKEN=" +
    JSON.stringify(token) +
    ";" +
    "window.addEventListener('message',function(e){" +
    "var d=e&&e.data;if(!d||d.type!=='BILTIA_API_CALL')return;" +
    "var b=d.body||{};" +
    "function reply(p){var m={type:'BILTIA_API_RESPONSE',id:d.id};for(var k in p)m[k]=p[k];window.postMessage(m,'*');}" +
    // Endpoints non-données (email/sms/ia) → indisponibles sur un lien de partage.
    "if(b.__endpoint){reply({error:'Action indisponible sur ce lien.'});return;}" +
    // Lecture seule : seuls list/get sont autorisés.
    "if(b.action!=='list'&&b.action!=='get'){reply({error:'Ce lien est en lecture seule.'});return;}" +
    "fetch('/api/share/data',{method:'POST',headers:{'Content-Type':'application/json'}," +
    "body:JSON.stringify({token:TOKEN,entity:b.entity,action:b.action,id:b.id})})" +
    ".then(function(r){return r.json();})" +
    ".then(function(j){if(j&&j.error)reply({error:j.error});else reply({result:j});})" +
    ".catch(function(){reply({error:'Réseau indisponible.'});});" +
    "});" +
    "})();</script>\n";
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, script + "</body>");
  return html + script;
}
