// ─────────────────────────────────────────────────────────────────────────────
// MODIFICATIONS STRUCTURÉES (Phase 7) — patch d'AppSpec + diff.
//
// Deux usages :
//   • applyAppSpecPatch : appliquer une modification CIBLÉE à une AppSpec
//     (ajouter une vue, une action, un branchement…) sans toucher au reste.
//   • diffAppSpec : comparer deux specs (avant/après une modification) et produire
//     un résumé LISIBLE (« Vue Kanban ajoutée · 2 actions ajoutées »). Comme la
//     spec réelle est DÉRIVÉE du HTML (Phase 1), differ deux specs dérivées donne
//     un diff DÉTERMINISTE de ce qui a VRAIMENT changé — sans dépendre du LLM.
//
// Pur (aucune I/O). Testable.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  AppSpecV1,
  AppViewSpec,
  AppActionSpec,
  WorkspaceBinding,
  AppPermissionSpec,
  CustomEntityRef,
} from "./app-spec";

export interface AppSpecPatch {
  addViews?: AppViewSpec[];
  updateViews?: (Partial<AppViewSpec> & { id: string })[];
  removeViewIds?: string[];
  addActions?: AppActionSpec[];
  updateActions?: (Partial<AppActionSpec> & { id: string })[];
  removeActionIds?: string[];
  addBindings?: WorkspaceBinding[];
  addCustomEntities?: CustomEntityRef[];
  updatePermissions?: AppPermissionSpec[];
}

function upsertById<T extends { id: string }>(list: T[], updates: (Partial<T> & { id: string })[]): T[] {
  const byId = new Map(list.map((x) => [x.id, x]));
  for (const u of updates) {
    const cur = byId.get(u.id);
    if (cur) byId.set(u.id, { ...cur, ...u });
  }
  return [...byId.values()];
}

/** Applique un patch à une spec → NOUVELLE spec (l'originale n'est pas mutée). */
export function applyAppSpecPatch(spec: AppSpecV1, patch: AppSpecPatch): AppSpecV1 {
  let views = [...spec.views];
  if (patch.removeViewIds?.length) views = views.filter((v) => !patch.removeViewIds!.includes(v.id));
  if (patch.updateViews?.length) views = upsertById(views, patch.updateViews);
  if (patch.addViews?.length) {
    const ids = new Set(views.map((v) => v.id));
    for (const v of patch.addViews) if (!ids.has(v.id)) views.push(v);
  }

  let actions = [...spec.actions];
  if (patch.removeActionIds?.length) actions = actions.filter((a) => !patch.removeActionIds!.includes(a.id));
  if (patch.updateActions?.length) actions = upsertById(actions, patch.updateActions);
  if (patch.addActions?.length) {
    const ids = new Set(actions.map((a) => a.id));
    for (const a of patch.addActions) if (!ids.has(a.id)) actions.push(a);
  }

  let workspaceBindings = [...spec.workspaceBindings];
  if (patch.addBindings?.length) {
    const keys = new Set(workspaceBindings.map((b) => b.entity));
    for (const b of patch.addBindings) if (!keys.has(b.entity)) workspaceBindings.push(b);
  }

  let customEntities = [...spec.customEntities];
  if (patch.addCustomEntities?.length) {
    const keys = new Set(customEntities.map((c) => c.key));
    for (const c of patch.addCustomEntities) if (!keys.has(c.key)) customEntities.push(c);
  }

  const permissions = patch.updatePermissions?.length ? patch.updatePermissions : spec.permissions;

  return { ...spec, views, actions, workspaceBindings, customEntities, permissions };
}

/**
 * Construit le PATCH qui transforme `before` en `after` sur le plan STRUCTUREL
 * (vues/actions par id, bindings par entité, entités custom par clé). Appliqué à
 * `before` via applyAppSpecPatch, il reconstruit la structure de `after` TOUT EN
 * préservant les objets inchangés de `before` (leurs métadonnées déclarées). Sert
 * à mettre à jour la spec STOCKÉE (riche en intention) lors d'une modification,
 * sans repartir de zéro. Ne gère pas la SUPPRESSION de bindings/customEntities
 * (applyAppSpecPatch ne fait qu'ajouter pour ces deux-là — un binding retiré reste
 * dans la spec, sans effet néfaste).
 */
export function diffToPatch(before: AppSpecV1, after: AppSpecV1): AppSpecPatch {
  const beforeViewIds = new Set(before.views.map((v) => v.id));
  const afterViewIds = new Set(after.views.map((v) => v.id));
  const beforeActionIds = new Set(before.actions.map((a) => a.id));
  const afterActionIds = new Set(after.actions.map((a) => a.id));
  const beforeEntities = new Set(before.workspaceBindings.map((b) => b.entity));
  const beforeCustom = new Set(before.customEntities.map((c) => c.key));

  return {
    addViews: after.views.filter((v) => !beforeViewIds.has(v.id)),
    removeViewIds: before.views.filter((v) => !afterViewIds.has(v.id)).map((v) => v.id),
    addActions: after.actions.filter((a) => !beforeActionIds.has(a.id)),
    removeActionIds: before.actions.filter((a) => !afterActionIds.has(a.id)).map((a) => a.id),
    addBindings: after.workspaceBindings.filter((b) => !beforeEntities.has(b.entity)),
    addCustomEntities: after.customEntities.filter((c) => !beforeCustom.has(c.key)),
  };
}

// ── DIFF ──────────────────────────────────────────────────────────────────────

export interface ListDiff {
  added: string[];
  removed: string[];
}
export interface AppSpecDiff {
  views: ListDiff;
  actions: ListDiff;
  bindings: ListDiff;
  customEntities: ListDiff;
  changed: boolean;
  summary: string; // lisible par l'utilisateur (FR)
}

function listDiff(before: string[], after: string[]): ListDiff {
  const b = new Set(before);
  const a = new Set(after);
  return {
    added: after.filter((x) => !b.has(x)),
    removed: before.filter((x) => !a.has(x)),
  };
}

const VIEW_LABEL: Record<string, string> = {
  table: "Tableau",
  list: "Liste",
  cards: "Cartes",
  kanban: "Kanban",
  calendar: "Calendrier",
  planning: "Planning",
  dashboard: "Tableau de bord",
  detail: "Fiche",
  form: "Formulaire",
  gallery: "Galerie",
  timeline: "Chronologie",
  map: "Carte",
};

function frJoin(parts: string[]): string {
  return parts.filter(Boolean).join(" · ");
}

/** Compare deux specs et produit un résumé lisible du changement. */
export function diffAppSpec(before: AppSpecV1, after: AppSpecV1): AppSpecDiff {
  // Les vues sont comparées par TYPE (plus parlant que l'id dérivé).
  const views = listDiff(before.views.map((v) => v.type), after.views.map((v) => v.type));
  const actions = listDiff(before.actions.map((a) => a.type), after.actions.map((a) => a.type));
  const bindings = listDiff(before.workspaceBindings.map((b) => b.entity), after.workspaceBindings.map((b) => b.entity));
  const customEntities = listDiff(before.customEntities.map((c) => c.key), after.customEntities.map((c) => c.key));

  const parts: string[] = [];
  for (const t of views.added) parts.push(`vue ${VIEW_LABEL[t] ?? t} ajoutée`);
  for (const t of views.removed) parts.push(`vue ${VIEW_LABEL[t] ?? t} retirée`);
  if (actions.added.length) parts.push(`${actions.added.length} action(s) ajoutée(s)`);
  if (actions.removed.length) parts.push(`${actions.removed.length} action(s) retirée(s)`);
  if (bindings.added.length) parts.push(`données branchées : ${bindings.added.join(", ")}`);
  if (bindings.removed.length) parts.push(`données débranchées : ${bindings.removed.join(", ")}`);
  if (customEntities.added.length) parts.push(`nouvelle(s) entité(s) : ${customEntities.added.join(", ")}`);
  if (customEntities.removed.length) parts.push(`entité(s) retirée(s) : ${customEntities.removed.join(", ")}`);

  const changed =
    views.added.length + views.removed.length + actions.added.length + actions.removed.length +
      bindings.added.length + bindings.removed.length + customEntities.added.length + customEntities.removed.length >
    0;

  return {
    views,
    actions,
    bindings,
    customEntities,
    changed,
    summary: changed ? frJoin(parts) : "ajustements de présentation",
  };
}
