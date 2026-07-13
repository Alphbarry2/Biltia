// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC FORM — HTML autonome d'un formulaire public (lien app_share_links kind='form').
//
// Rendu côté serveur par /partage/[token] pour un visiteur ANONYME. Poste vers
// /api/share/submit avec le token (le token EST la capacité). Zéro dépendance
// externe (CSP-safe) : CSS + JS inline, comme le HTML des modules déjà servis.
// Les libellés/titre viennent du scope (fourni par l'artisan) → ÉCHAPPÉS (XSS).
// Honeypot `hp` : champ caché ; s'il est rempli, l'endpoint ignore en silence.
// ─────────────────────────────────────────────────────────────────────────────

import { pick, type Locale } from "./i18n/config";

export type PublicFormField = { key: string; label: string; type: string; required?: boolean };
export type PublicFormScope = { title?: string; intro?: string; fields?: PublicFormField[] };

// Champs réellement stockables — MIROIR de la liste blanche de /api/share/submit.
// Un champ hors liste ne serait pas enregistré : on ne l'affiche donc pas.
const STORABLE = new Set([
  "nom", "email", "tel", "ville", "adresse", "code_postal", "message", "demande", "projet", "budget",
]);

// Champs par défaut, dans la langue du formulaire. Les `key` (colonnes stockées)
// ne changent JAMAIS — seul le libellé affiché est traduit.
function defaultFields(l: Locale): PublicFormField[] {
  return [
    { key: "nom", label: pick(l, "Votre nom", "Your name"), type: "text", required: true },
    { key: "tel", label: pick(l, "Téléphone", "Phone"), type: "tel" },
    { key: "email", label: "Email", type: "email" },
    { key: "message", label: pick(l, "Votre demande", "Your request"), type: "textarea", required: true },
  ];
}

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fieldHtml(f: PublicFormField): string {
  const key = esc(f.key);
  const req = f.required ? "required" : "";
  const label = `${esc(f.label || f.key)}${f.required ? " *" : ""}`;
  const control =
    f.type === "textarea"
      ? `<textarea id="f_${key}" name="${key}" rows="4" ${req}></textarea>`
      : `<input id="f_${key}" name="${key}" type="${esc(f.type || "text")}" ${req} />`;
  return `<label class="fld"><span>${label}</span>${control}</label>`;
}

/** HTML complet d'un formulaire public pour un token 'form'.
 *  NB : le visiteur est ANONYME (client de l'artisan) et n'a donc normalement pas
 *  de cookie de langue → le formulaire sort en FRANÇAIS par défaut. Le titre, l'intro
 *  et les libellés définis par l'artisan (scope) sont affichés tels quels. */
export function renderPublicForm(
  token: string,
  scope: PublicFormScope | null | undefined,
  locale: Locale = "fr"
): string {
  const s = scope && typeof scope === "object" ? scope : {};
  const fallbackFields = defaultFields(locale);
  const title = esc(s.title || pick(locale, "Demande de devis", "Quote request"));
  const intro = s.intro ? `<p class="intro">${esc(s.intro)}</p>` : "";
  const chosen = (Array.isArray(s.fields) && s.fields.length ? s.fields : fallbackFields).filter(
    (f) => f && f.key && STORABLE.has(f.key)
  );
  const fieldsHtml = (chosen.length ? chosen : fallbackFields).map(fieldHtml).join("\n");
  const tokenJson = JSON.stringify(token);

  const tSend = esc(pick(locale, "Envoyer ma demande", "Send my request"));
  const tSending = esc(pick(locale, "Envoi…", "Sending…"));
  const tOk1 = pick(locale, "Merci ! Votre demande a bien été envoyée.", "Thank you! Your request has been sent.");
  const tOk2 = pick(locale, "On vous recontacte très vite.", "We'll get back to you very soon.");
  const tErr = pick(locale, "Une erreur est survenue. Merci de réessayer.", "Something went wrong. Please try again.");
  const tPowered = pick(locale, "Propulsé par", "Powered by");

  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${title}</title>
<style>
*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:#F5F3FB;color:#0A0A0A;-webkit-font-smoothing:antialiased}
.wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.card{width:100%;max-width:440px;background:#fff;border-radius:20px;box-shadow:0 10px 40px rgba(80,60,160,.12);padding:28px 26px}
h1{font-size:22px;font-weight:800;margin:0 0 6px;letter-spacing:-.02em}
.intro{font-size:14.5px;color:#5B5B66;line-height:1.5;margin:0 0 18px}
.fld{display:block;margin:0 0 14px}
.fld span{display:block;font-size:13px;font-weight:600;color:#3A3A46;margin:0 0 6px}
input,textarea{width:100%;border:1px solid #E4E0EF;border-radius:12px;padding:11px 13px;font-size:15px;font-family:inherit;background:#FBFAFE;transition:border-color .15s,box-shadow .15s}
input:focus,textarea:focus{outline:none;border-color:#7C3AED;box-shadow:0 0 0 3px rgba(124,58,237,.12)}
textarea{resize:vertical}
.hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
button{width:100%;margin-top:6px;border:0;border-radius:12px;padding:13px;font-size:15px;font-weight:700;color:#fff;background:#6D4AE0;cursor:pointer;transition:background .15s,transform .05s}
button:hover{background:#5B37D6}
button:active{transform:translateY(1px)}
button:disabled{opacity:.6;cursor:default}
.msg{margin-top:14px;font-size:14px;text-align:center;display:none;line-height:1.5}
.ok .msg.ok{display:block;color:#059669}
.err .msg.err{display:block;color:#DC2626}
.ok form{display:none}
.foot{margin-top:18px;text-align:center;font-size:11.5px;color:#9A9AA6}
.foot b{color:#6D4AE0;font-weight:700}
</style>
</head>
<body>
<div class="wrap"><div class="card" id="card">
<h1>${title}</h1>
${intro}
<form id="form" novalidate>
<input class="hp" type="text" name="hp" tabindex="-1" autocomplete="off" aria-hidden="true" />
${fieldsHtml}
<button type="submit" id="btn">${tSend}</button>
</form>
<div class="msg ok">${tOk1}<br />${tOk2}</div>
<div class="msg err">${tErr}</div>
<div class="foot">${tPowered} <b>Biltia</b></div>
</div></div>
<script>
(function(){
  var TOKEN=${tokenJson};
  var form=document.getElementById('form'), btn=document.getElementById('btn'), card=document.getElementById('card');
  form.addEventListener('submit', function(e){
    e.preventDefault();
    var fd=new FormData(form), payload={}, hp='';
    fd.forEach(function(v,k){ if(k==='hp'){ hp=String(v); return; } payload[k]=String(v); });
    btn.disabled=true; btn.textContent=${JSON.stringify(tSending)}; card.classList.remove('err');
    fetch('/api/share/submit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:TOKEN,payload:payload,hp:hp})})
      .then(function(r){ return r.json().catch(function(){return {};}).then(function(j){ return { ok: r.ok && j && j.ok }; }); })
      .then(function(res){
        if(res.ok){ card.classList.add('ok'); }
        else { card.classList.add('err'); btn.disabled=false; btn.textContent=${JSON.stringify(tSend)}; }
      })
      .catch(function(){ card.classList.add('err'); btn.disabled=false; btn.textContent=${JSON.stringify(tSend)}; });
  });
})();
</script>
</body>
</html>`;
}
