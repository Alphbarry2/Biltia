// ─────────────────────────────────────────────────────────────────────────────
// GARDE-FOU DÉTERMINISTE — « l'app s'affiche bien mais n'enregistre rien »
//
// Constat mesuré (banc 101 apps, 2026-07-13) : TOUS les modèles, du plus cher au
// gratuit, ignoraient `biltiaUI` (0 % à 21 % d'usage) et réécrivaient les
// formulaires à la main. Résultat : une app sur trois ne contenait AUCUN appel
// d'écriture, et le bouton « Enregistrer » ne sauvait rien.
//
// La cause était le prompt (il ENSEIGNAIT le fait-main). Le prompt est corrigé —
// mais on ne fait pas reposer la fiabilité du produit sur la bonne volonté d'un
// LLM. Ce module vérifie le HTML produit et signale les violations, pour qu'on
// puisse les corriger avant de livrer l'app à l'artisan.
// ─────────────────────────────────────────────────────────────────────────────

import { ALLOWED_ENTITIES } from "./data-entities";

export type BindingViolation = {
  kind: "form_fait_main" | "table_fait_main" | "aucune_ecriture";
  entity: string | null;
  detail: string;
};

/** Le HTML utilise-t-il le runtime de données pour cette brique ? */
const usesUI = (html: string, verb: "form" | "table" | "kanban" | "kpi") =>
  new RegExp(`biltiaUI\\.${verb}\\s*\\(`).test(html);

/** Entités du workspace réellement manipulées par l'app. */
export function entitiesUsedBy(html: string): string[] {
  return ALLOWED_ENTITIES.filter((e) =>
    new RegExp(`['"\`]${e}['"\`]`).test(html)
  );
}

/**
 * Cherche les briques de données écrites à la main alors qu'un composant
 * déterministe existe. Ne juge PAS le design : un `<form>` de recherche ou un
 * `<table>` d'affichage statique ne sont pas concernés — seul compte le fait
 * qu'une ENTITÉ DU WORKSPACE soit lue/écrite sans passer par `biltiaUI`.
 */
export function findBindingViolations(html: string): BindingViolation[] {
  const entities = entitiesUsedBy(html);
  if (!entities.length) return []; // app sans donnée partagée : rien à garantir

  const violations: BindingViolation[] = [];

  // 1) L'app ne contient AUCUN chemin d'écriture → la saisie part à la poubelle.
  //    C'est le défaut le plus grave : l'artisan croit avoir enregistré.
  const writes =
    /biltia\.(create|update|bulkCreate)\s*\(/.test(html) || usesUI(html, "form");
  if (!writes) {
    violations.push({
      kind: "aucune_ecriture",
      entity: entities[0],
      detail:
        "L'app manipule des entités du workspace mais ne contient AUCUN appel d'écriture " +
        "(ni biltiaUI.form, ni biltia.create/update). Toute saisie de l'utilisateur sera perdue.",
    });
  }

  // 2) Formulaire fait-main sur une entité, sans biltiaUI.form.
  //    Signature : un <form>/<input> + un create/update manuel, et pas de biltiaUI.form.
  const handRolledForm =
    /<form[\s>]/i.test(html) && /biltia\.(create|update)\s*\(/.test(html);
  if (handRolledForm && !usesUI(html, "form")) {
    violations.push({
      kind: "form_fait_main",
      entity: entities[0],
      detail:
        "Formulaire d'entité écrit à la main (create/update manuel) au lieu de biltiaUI.form : " +
        "selects relationnels non peuplés, requis non validés, pas de rechargement après écriture.",
    });
  }

  // 3) Tableau d'entité fait-main, sans biltiaUI.table.
  const handRolledTable =
    /<table[\s>]/i.test(html) && /biltia\.list(Page)?\s*\(/.test(html);
  if (handRolledTable && !usesUI(html, "table")) {
    violations.push({
      kind: "table_fait_main",
      entity: entities[0],
      detail:
        "Tableau d'entité rendu à la main au lieu de biltiaUI.table : pas de recherche/tri " +
        "câblés, pas de rechargement, état vide non géré.",
    });
  }

  return violations;
}

/**
 * Consigne de réparation, à renvoyer au modèle en une passe ciblée. On ne
 * régénère pas l'app : on convertit les briques fautives.
 */
export function buildBindingRepairPrompt(violations: BindingViolation[]): string {
  const list = violations.map((v) => `- ${v.detail}`).join("\n");
  return `⚠️ CORRECTION OBLIGATOIRE — CÂBLAGE DES DONNÉES

L'application produite présente ce ou ces défauts :
${list}

Corrige-les en convertissant les briques de données vers le runtime déterministe déjà injecté :
- toute liste d'entité → \`biltiaUI.table('host', { entity:'…', columns:[…], search:true })\`
- tout formulaire d'entité → \`biltiaUI.form('host', { entity:'…', fields:[…], record:ficheOuNull, onSaved:function(){…} })\`
  (les champs \`*_id\` se déclarent \`type:'relation', relation:'clients'\` — le select se peuple tout seul)
- tout kanban d'entité → \`biltiaUI.kanban(...)\` ; tout KPI d'entité → \`biltiaUI.kpi(...)\`

NE CHANGE RIEN D'AUTRE : ni la mise en page, ni la palette, ni la navigation, ni les textes,
ni les graphiques. Ces composants réutilisent les mêmes classes CSS — le rendu doit rester
IDENTIQUE à l'œil. Seul le câblage change.`;
}
