// ─────────────────────────────────────────────────────────────────────────────
// OÙ UNE APP GÉNÉRÉE PEUT-ELLE ÊTRE SERVIE ?
//
// Le SDK (lib/biltia-sdk.ts) ne fait PAS de fetch : il poste BILTIA_API_CALL à
// window.parent et attend BILTIA_API_RESPONSE, avec un timeout de 30 s. Servir
// une app porteuse du SDK là où PERSONNE ne répond ne donne donc pas « une app
// sans données » : ça donne une app qui GÈLE 30 s puis affiche « Connexion trop
// lente » sur chaque écran. Pire qu'une erreur franche — l'artisan croit que son
// réseau déraille et réessaie indéfiniment.
//
// Les SEULS répondeurs qui existent :
//   • le shell Biltia (/generate, /apps/[id]) → iframe, la page parente répond ;
//   • /partage/[token] de type 'client'       → lib/share-bridge.ts, scopé à UN
//     chantier, lecture seule.
//
// Toute autre surface (page publique de premier niveau, autre domaine) DOIT
// refuser une app porteuse du SDK plutôt que livrer une coquille qui gèle.
//
// ⚠️ Ce test n'a PAS de variante fine « oui, mais cette app-là n'utilise pas
// vraiment les données ». /api/generate injecte le SDK dans TOUTES les apps
// (« TOUTES les apps, connectées ou non »), et le kit biltiaUI
// (lib/app-components.ts) contient lui-même des `window.biltia.list(...)`.
// Aucune analyse du HTML ne peut donc isoler une app « autonome » : la catégorie
// est indétectable, et en pratique vide. Ne pas la réinventer — c'est
// exactement l'erreur qui avait produit un bouton « Déployer » que 100 % des
// apps échouaient à satisfaire.
// ─────────────────────────────────────────────────────────────────────────────

/** L'app a-t-elle besoin d'un hôte capable de répondre à ses appels de données ? */
export function requiresBiltiaHost(html: string | null | undefined): boolean {
  return typeof html === "string" && html.includes("window.biltia");
}
