// ─────────────────────────────────────────────────────────────────────────────
// APERÇU STATIQUE D'UNE APP (vignette de carte).
//
// Problème réglé : une app CONNECTÉE (window.biltia) affichée en vignette reste
// bloquée sur « Chargement du workspace… » — la carte n'a pas de pont de données
// et le sandbox n'a pas de session. Résultat : un spinner qui tourne, moche.
//
// Solution : on injecte un STUB `window.biltia` qui résout instantanément avec
// des données vides. Le vrai SDK commence par `if (window.biltia) return;`
// (cf. lib/biltia-sdk.ts) → il s'auto-désactive. L'app rend donc sa coquille
// (en-tête, KPIs, tableau) immédiatement, sans réseau ni « Chargement… ».
//
// À n'utiliser QUE pour les vignettes non interactives (pointer-events:none).
// La vraie app (viewer /apps/[id]) garde le SDK réel pour lire les données.
// ─────────────────────────────────────────────────────────────────────────────

const PREVIEW_STUB = `<script>
/* biltia-preview-stub : neutralise la connexion aux données pour la vignette. */
window.biltia = {
  list: function(){ return Promise.resolve([]); },
  get: function(){ return Promise.resolve(null); },
  create: function(){ return Promise.resolve(null); },
  update: function(){ return Promise.resolve(null); },
  remove: function(){ return Promise.resolve(true); },
  notify: function(){}
};
<\/script>`;

/**
 * Prépare le HTML d'une app pour un aperçu figé : injecte le stub avant tout le
 * reste (le SDK réel s'efface). Idempotent au sens où un second passage réinjecte
 * un stub inoffensif. Renvoie le HTML inchangé s'il est vide.
 */
export function toPreviewHtml(html: string): string {
  if (!html) return html;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => m + "\n" + PREVIEW_STUB);
  }
  return PREVIEW_STUB + html;
}
