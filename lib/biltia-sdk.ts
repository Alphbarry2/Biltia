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
const SDK_MARKER = "__biltia_sdk_v17__";

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
  /* Télémétrie d'usage (Phase 10) : bufferisée puis envoyée par lots (jamais bloquant). */
  var _tel = [];
  function _flushTel(){
    if (!_tel.length) return;
    var batch = _tel.splice(0, 20);
    try { call({ __endpoint: 'telemetry', events: batch }).catch(function(){}); } catch(e){}
  }
  window.biltia = {
    list: function(entity, opts){ return call(Object.assign({ entity: entity, action: 'list' }, opts || {})).then(function(r){ return r.data || []; }); },
    /* Liste PAGINÉE + filtrée côté serveur (Phase 9). opts : { filters, search,
       searchFields, order, ascending, offset, limit }. Resout { data, total, hasMore }.
       filters = { type:'all'|'any'|'not', conditions:[{field, op, value}] } ; op parmi
       eq/neq/gt/gte/lt/lte/contains/before/after/is_empty/is_not_empty/in/mine ;
       valeurs de date relatives : '@today', '@today-7d', '@today+1m'. */
    listPage: function(entity, opts){ opts = opts || {}; if(opts.offset==null)opts.offset=0; return call(Object.assign({ entity: entity, action: 'list' }, opts)).then(function(r){ return { data: (r&&r.data)||[], total: r&&r.total, hasMore: !!(r&&r.hasMore) }; }); },
    get: function(entity, id){ return call({ entity: entity, action: 'get', id: id }).then(function(r){ return r.data; }); },
    create: function(entity, values){ return call({ entity: entity, action: 'create', values: values }).then(function(r){ return r.data; }); },
    /* Insertion en masse : cree PLUSIEURS lignes d'un coup (ex: les lignes d'un
       devis). rows = tableau d'objets. Resout { ok, inserted }. Bien plus rapide
       et fiable qu'une boucle de create() pour des lots (lignes de devis/facture). */
    bulkCreate: function(entity, rows){ return call({ entity: entity, action: 'bulk_create', rows: Array.isArray(rows) ? rows : [] }).then(function(r){ return r || {}; }); },
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
    },
    /* IA VOIX → DEVIS : transcrit une dictee qui peut contenir PLUSIEURS devis
       ("je fais 3 devis : pour le client Martin, renovation SdB, depose 400 pose
       carrelage 1200 ; pour Durand ...") et renvoie un TABLEAU de devis structures :
       { text, devis:[{ client_nom, chantier_nom, date_devis, lignes:[{designation,
       quantite, unite, prix_unitaire_ht, taux_tva}], notes }] }. L'app affiche
       chaque devis en carte editable AVANT enregistrement. ~10 credits (le lot,
       pas l'unite : une meme dictee peut contenir plusieurs devis). */
    parseDevis: function(audioDataUrl){
      var au = String(audioDataUrl || '');
      if (au.indexOf('data:') !== 0 || au.indexOf(';base64,') < 0) {
        return Promise.reject(new Error('biltia.parseDevis attend un audio (dataURL base64).'));
      }
      var mt = au.slice(5, au.indexOf(';base64,'));
      var d = au.slice(au.indexOf(';base64,') + 8);
      return call({ __endpoint: 'app-ai', action: 'parse_devis', audio: { mediaType: mt, data: d } })
        .then(function(r){ return r || {}; });
    },
    /* EMAIL : envoie un email au nom de l'entreprise. Utilise le Gmail connecté
       de l'utilisateur si dispo (les réponses lui reviennent), sinon l'envoi
       Biltia. Ex : await biltia.sendEmail({ to:'client@ex.fr', subject:'Votre devis',
       body:'Bonjour, veuillez trouver...' }). Résout { ok, via, note } ; rejette
       (toast) si aucun canal ou destinataire manquant. */
    sendEmail: function(opts){
      opts = opts || {};
      var to = Array.isArray(opts.to) ? opts.to : (opts.to ? [opts.to] : []);
      return call({ __endpoint: 'email',
        to: to,
        subject: String(opts.subject || opts.objet || ''),
        body: String(opts.body || opts.corps || opts.text || opts.message || '') })
        .then(function(r){ return r || {}; });
    },
    /* DOCUMENT COMMERCIAL (devis / facture) : l'app ne rédige PLUS le mail. Elle
       désigne la FICHE, et le serveur produit le PDF aux couleurs et au logo de
       l'entreprise (Réglages → Identité visuelle), l'envoie en pièce jointe dans
       une enveloppe email de marque, et joint un lien « Voir et accepter » où le
       client signe son bon pour accord.
       Ex : await biltia.sendDocument({ kind:'devis', id: d.id });
       opts.to : destinataires explicites (défaut : l'email du client de la fiche).
       opts.message : mot d'accompagnement libre.
       opts.intro / opts.subjectLabel : pour une RELANCE, qui ne s'ouvre pas comme
       un premier envoi (ex : subjectLabel:'Relance facture').
       Résout { ok, via, note, url, attachment, to } ; rejette (toast) si le client
       n'a pas d'email ou si aucun canal d'envoi n'est disponible. */
    sendDocument: function(opts){
      opts = opts || {};
      var to = Array.isArray(opts.to) ? opts.to : (opts.to ? [opts.to] : []);
      return call({ __endpoint: 'document',
        kind: String(opts.kind || 'devis'),
        id: String(opts.id || ''),
        to: to,
        message: String(opts.message || ''),
        intro: String(opts.intro || ''),
        subjectLabel: String(opts.subjectLabel || '') })
        .then(function(r){ return r || {}; });
    },
    /* SMS : envoie un SMS court au nom de l'entreprise (relance, confirmation de
       RDV…). Idéal quand le client ne lit pas ses mails. Numéros au format +33…
       Ex : await biltia.sendSms({ to:'+33612345678', body:'Rappel : RDV demain 9h' }).
       Résout { ok, sent, failed } ; rejette (toast) si SMS non configuré ou numéro
       invalide. */
    sendSms: function(opts){
      opts = opts || {};
      var to = Array.isArray(opts.to) ? opts.to : (opts.to ? [opts.to] : []);
      return call({ __endpoint: 'sms',
        to: to,
        body: String(opts.body || opts.message || opts.text || opts.corps || '') })
        .then(function(r){ return r || {}; });
    },
    /* DEVIS -> FACTURE : cree une facture A PARTIR d'un devis accepte, sans
       re-saisie (client, chantier et montants repris ; numero legal genere cote
       serveur ; devis_id relie). opts.mode : 'solde' (reste a facturer, defaut)
       | 'acompte' (opts.pct %, defaut 30) | 'situation' (opts.pct %). Resout la
       facture creee, ou rejette (toast) si le devis est deja entierement facture. */
    invoiceFromDevis: function(devisId, opts){
      opts = opts || {};
      return call({ entity: 'factures', action: 'invoice_from_devis',
        devisId: String(devisId || ''),
        mode: opts.mode || 'solde',
        pct: opts.pct != null ? opts.pct : null })
        .then(function(r){ return (r && r.data) || null; });
    },
    /* TRANSFORMATIONS 1-CLIC (memes garanties serveur : rattachements repris,
       idempotentes). Resolvent la fiche CREEE (ou l'existante si deja liee). */
    /* DEVIS ACCEPTE -> CHANTIER : ouvre le chantier d'execution (client/site/adresse
       repris, budget = montant HT, devis relie). */
    chantierFromDevis: function(devisId){
      return call({ entity: 'chantiers', action: 'chantier_from_devis', devisId: String(devisId || '') })
        .then(function(r){ return (r && r.data) || null; });
    },
    /* DEMANDE -> DEVIS : amorce un devis brouillon (client/site repris, demande reliee). */
    devisFromDemande: function(demandeId){
      return call({ entity: 'devis', action: 'devis_from_demande', demandeId: String(demandeId || '') })
        .then(function(r){ return (r && r.data) || null; });
    },
    /* NOTE -> TACHE : cree une tache suivie depuis une note terrain. */
    taskFromNote: function(noteId){
      return call({ entity: 'tasks', action: 'task_from_note', noteId: String(noteId || '') })
        .then(function(r){ return (r && r.data) || null; });
    },
    /* NOTE -> RESERVE : cree une reserve/incident depuis une note terrain. */
    reserveFromNote: function(noteId){
      return call({ entity: 'reserves', action: 'reserve_from_note', noteId: String(noteId || '') })
        .then(function(r){ return (r && r.data) || null; });
    },
    /* PILOTAGE : rentabilite REELLE par chantier (facture - heures pointees x taux
       horaire - achats materiaux). Agregat serveur cross-entites. Resout un tableau
       [{ id, nom, statut, budget, facture, encaisse, reste_a_encaisser, cout_mo,
       cout_materiaux, cout_total, marge, marge_pct }] trie du moins au plus
       rentable. opts.match filtre les chantiers (ex : { statut:'en_cours' }). */
    chantierRentabilite: function(opts){
      opts = opts || {};
      return call({ entity: 'chantiers', action: 'chantier_rentabilite', match: opts.match || null })
        .then(function(r){ return (r && r.data) || []; });
    },
    /* RELATIONS PLUSIEURS-À-PLUSIEURS (many-to-many). Relie deux fiches quelconques
       (workspace ou collection libre) : un employe a PLUSIEURS chantiers, un chantier
       PLUSIEURS employes. Le lien est unique et symetrique (link(A,B)==link(B,A)).
       Ex : await biltia.link({entity:'employees',id:e}, {entity:'chantiers',id:c}, 'affecte'); */
    link: function(a, b, relation){
      return call({ action: 'link', a: a, b: b, relation: relation || '' }).then(function(r){ return r || {}; });
    },
    /* Retire un lien. Ex : await biltia.unlink({entity:'employees',id:e}, {entity:'chantiers',id:c}, 'affecte'); */
    unlink: function(a, b, relation){
      return call({ action: 'unlink', a: a, b: b, relation: relation || '' }).then(function(r){ return r || {}; });
    },
    /* Liste les fiches liees a (entity,id), dans les DEUX sens. opts.with filtre par
       type (« les employees de ce chantier »). Resout [{entity, id, relation}].
       Ex : var emps = await biltia.links('chantiers', c, {with:'employees'}); */
    links: function(entity, id, opts){
      opts = opts || {};
      return call({ action: 'list_links', entity: entity, id: id, with: opts.with || null })
        .then(function(r){ return (r && r.data) || []; });
    },
    /* AGENTS RATTACHES A L'APP (Phase 6). Une app peut piloter les agents nes en
       son sein : les lister, en creer, les mettre en pause, les relancer, voir les
       validations en attente. Passe TOUJOURS par le serveur (permissions verifiees). */
    /* Liste les agents rattaches a CETTE app. Resout [{id,title,status,trigger_type,last_run_at,next_run_at,blocked_reason}]. */
    listAttachedAgents: function(){
      return call({ __endpoint: 'agents', action: 'list_attached' }).then(function(r){ return (r && r.data) || []; });
    },
    /* Cree un agent depuis l'app (rattache automatiquement). instruction = la mission
       en clair (« chaque vendredi, envoie le recap du chantier au client »). opts.viewId
       relie l'agent a une vue precise. Resout { ok, ruleId, message, blocked }. */
    createAgent: function(instruction, opts){
      opts = opts || {};
      return call({ __endpoint: 'agents', action: 'create', instruction: String(instruction || ''), viewId: opts.viewId || null })
        .then(function(r){ return r || {}; });
    },
    /* Lance un agent MAINTENANT (hors de son planning). Resout { ok, status, summary }. */
    triggerAgent: function(ruleId){
      return call({ __endpoint: 'agents', action: 'trigger', ruleId: String(ruleId || '') }).then(function(r){ return r || {}; });
    },
    /* Met un agent en pause. */
    pauseAgent: function(ruleId){
      return call({ __endpoint: 'agents', action: 'pause', ruleId: String(ruleId || '') }).then(function(r){ return r || {}; });
    },
    /* Reactive un agent en pause (rearme son prochain passage). */
    resumeAgent: function(ruleId){
      return call({ __endpoint: 'agents', action: 'resume', ruleId: String(ruleId || '') }).then(function(r){ return r || {}; });
    },
    /* Validations en attente des agents de l'app (messages prepares a valider avant envoi).
       Resout [{id, rule_id, kind, fiche_label, subject, body, status, created_at}]. */
    listPendingApprovals: function(){
      return call({ __endpoint: 'agents', action: 'pending_approvals' }).then(function(r){ return (r && r.data) || []; });
    },
    /* TELEMETRIE D'USAGE : signale un evenement d'usage (bufferise, envoye par lots).
       Types utiles : 'view_opened', 'action_clicked', 'record_created_from_app',
       'action_failed'. Ex : biltia.track('action_clicked', { action:'export' }).
       Ne bloque jamais, jamais d'attente. app_opened est envoye automatiquement. */
    track: function(type, meta){
      try { _tel.push({ type: String(type || ''), meta: meta || {} }); if (_tel.length >= 8) _flushTel(); } catch(e){}
    }
  };
  /* Amorce : app ouverte + purge periodique + a la fermeture (best-effort). */
  try {
    window.biltia.track('app_opened');
    setInterval(_flushTel, 10000);
    window.addEventListener('pagehide', _flushTel);
    document.addEventListener('visibilitychange', function(){ if (document.visibilityState === 'hidden') _flushTel(); });
  } catch(e){}
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
  if (html.includes("__biltia_sdk_v6__")) {
    return html.replace(/<script>\s*\/\* __biltia_sdk_v6__ \*\/[\s\S]*?<\/script>/, BILTIA_SDK_SCRIPT);
  }
  if (html.includes("__biltia_sdk_v7__")) {
    return html.replace(/<script>\s*\/\* __biltia_sdk_v7__ \*\/[\s\S]*?<\/script>/, BILTIA_SDK_SCRIPT);
  }
  if (html.includes("__biltia_sdk_v8__")) {
    return html.replace(/<script>\s*\/\* __biltia_sdk_v8__ \*\/[\s\S]*?<\/script>/, BILTIA_SDK_SCRIPT);
  }
  if (html.includes("__biltia_sdk_v9__")) {
    return html.replace(/<script>\s*\/\* __biltia_sdk_v9__ \*\/[\s\S]*?<\/script>/, BILTIA_SDK_SCRIPT);
  }
  if (html.includes("__biltia_sdk_v10__")) {
    return html.replace(/<script>\s*\/\* __biltia_sdk_v10__ \*\/[\s\S]*?<\/script>/, BILTIA_SDK_SCRIPT);
  }
  if (html.includes("__biltia_sdk_v11__")) {
    return html.replace(/<script>\s*\/\* __biltia_sdk_v11__ \*\/[\s\S]*?<\/script>/, BILTIA_SDK_SCRIPT);
  }
  if (html.includes("__biltia_sdk_v12__")) {
    return html.replace(/<script>\s*\/\* __biltia_sdk_v12__ \*\/[\s\S]*?<\/script>/, BILTIA_SDK_SCRIPT);
  }
  if (html.includes("__biltia_sdk_v13__")) {
    return html.replace(/<script>\s*\/\* __biltia_sdk_v13__ \*\/[\s\S]*?<\/script>/, BILTIA_SDK_SCRIPT);
  }
  if (html.includes("__biltia_sdk_v14__")) {
    return html.replace(/<script>\s*\/\* __biltia_sdk_v14__ \*\/[\s\S]*?<\/script>/, BILTIA_SDK_SCRIPT);
  }
  if (html.includes("__biltia_sdk_v15__")) {
    return html.replace(/<script>\s*\/\* __biltia_sdk_v15__ \*\/[\s\S]*?<\/script>/, BILTIA_SDK_SCRIPT);
  }
  if (html.includes("__biltia_sdk_v16__")) {
    return html.replace(/<script>\s*\/\* __biltia_sdk_v16__ \*\/[\s\S]*?<\/script>/, BILTIA_SDK_SCRIPT);
  }
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => m + "\n" + BILTIA_SDK_SCRIPT);
  }
  return BILTIA_SDK_SCRIPT + html;
}
