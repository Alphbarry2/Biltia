// ─────────────────────────────────────────────────────────────────────────────
// VERSIONS DE MODULES — Phase 0 (sécurité & rollback).
//
// La table `module_versions` existait (migration 004) mais n'était JAMAIS écrite :
// aucun historique, aucun rollback, une modification pouvait écraser une app sans
// filet. Ce module la branche enfin, côté SERVEUR uniquement (chemin d'écriture
// autoritaire, décision produit 2026-07-12) :
//   • snapshot d'une version (création / avant-après modif / avant rollback) ;
//   • évaluation du RISQUE d'une réécriture (garde-fou anti-destructif) ;
//   • lecture de l'historique.
//
// Accès `module_versions` via le client ADMIN (service_role) : la table a RLS
// activée mais AUCUNE policy en prod → un client de session ne pourrait ni lire ni
// écrire tant que la migration 042 n'est pas appliquée. On passe donc par l'admin
// (tenant TOUJOURS vérifié en amont dans les routes). Si la clé service_role
// manque, le snapshot est SAUTÉ (jamais bloquant) : la sauvegarde du module reste
// prioritaire — on n'empêche jamais un enregistrement à cause de l'historique.
// ─────────────────────────────────────────────────────────────────────────────

import { ALLOWED_ENTITIES } from "./data-entities";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = { from: (t: string) => any } | null;

export type ModuleChangeType =
  | "create"
  | "patch"
  | "full_rewrite"
  | "rollback"
  | "manual_edit"
  | "autofix";

export interface ModuleVersionRow {
  id: string;
  module_id: string;
  tenant_id: string;
  version: number;
  code: string | null; // html_content de cette version (colonne `code` existante)
  prompt: string | null; // demande source (colonne `prompt` existante)
  description: string | null; // description du changement (colonne `description`)
  created_by: string | null;
  created_at: string;
  meta?: Record<string, unknown> | null;
}

/**
 * Enregistre une version (snapshot du HTML à un instant T). Best-effort :
 * ne lève jamais — renvoie la ligne créée ou `null` (admin absent / erreur).
 * On stocke le changeType dans `description` (préfixe machine) pour ne pas
 * dépendre d'une nouvelle colonne : « [full_rewrite] Ajout d'une vue Kanban ».
 */
export async function snapshotModuleVersion(
  admin: AdminClient,
  args: {
    moduleId: string;
    tenantId: string;
    userId: string | null;
    version: number;
    html: string;
    sourcePrompt?: string | null;
    changeDescription?: string | null;
    changeType: ModuleChangeType;
    appSpec?: unknown; // Phase 1 : réservé (colonne app_spec pas encore créée)
  }
): Promise<ModuleVersionRow | null> {
  if (!admin) return null;
  try {
    const descr = `[${args.changeType}] ${(args.changeDescription ?? "").slice(0, 240)}`.trim();
    const { data, error } = await admin
      .from("module_versions")
      .insert({
        module_id: args.moduleId,
        tenant_id: args.tenantId,
        version: args.version,
        code: args.html,
        prompt: (args.sourcePrompt ?? "").slice(0, 4000) || null,
        description: descr,
        created_by: args.userId,
      })
      .select("*")
      .single();
    if (error) {
      // Unicité (module_id, version) déjà prise → on n'échoue pas : l'historique
      // reste best-effort, la sauvegarde du module a déjà réussi.
      return null;
    }
    return data as ModuleVersionRow;
  } catch {
    return null;
  }
}

/** Existe-t-il déjà au moins une version pour ce module ? (legacy = 0 ligne). */
export async function hasVersions(admin: AdminClient, moduleId: string): Promise<boolean> {
  if (!admin) return false;
  try {
    const { data } = await admin
      .from("module_versions")
      .select("id")
      .eq("module_id", moduleId)
      .limit(1);
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

/** Historique d'un module (le plus récent d'abord), borné. Tenant vérifié en amont. */
export async function listModuleVersions(
  admin: AdminClient,
  tenantId: string,
  moduleId: string,
  limit = 50
): Promise<ModuleVersionRow[]> {
  if (!admin) return [];
  try {
    const { data } = await admin
      .from("module_versions")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("module_id", moduleId)
      .order("version", { ascending: false })
      .limit(Math.min(Math.max(1, limit), 100));
    return (data ?? []) as ModuleVersionRow[];
  } catch {
    return [];
  }
}

/** Une version précise (tenant + module vérifiés). */
export async function getModuleVersion(
  admin: AdminClient,
  tenantId: string,
  moduleId: string,
  versionId: string
): Promise<ModuleVersionRow | null> {
  if (!admin) return null;
  try {
    const { data } = await admin
      .from("module_versions")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("module_id", moduleId)
      .eq("id", versionId)
      .maybeSingle();
    return (data as ModuleVersionRow) ?? null;
  } catch {
    return null;
  }
}

// ── GARDE-FOU ANTI-RÉÉCRITURE DESTRUCTIVE (4.4) ───────────────────────────────
// Compare l'ancien et le nouveau HTML et détecte les PERTES majeures. 100 %
// déterministe (aucun LLM) : de simples métriques structurelles sur le texte.
// Objectif : ne JAMAIS écraser silencieusement une app qui perdrait une vue, un
// formulaire, des actions, ou sa connexion au workspace. En cas de risque élevé,
// la route bloque et exige une confirmation explicite.

export interface RewriteRisk {
  risk: "low" | "high";
  losses: string[]; // libellés lisibles des pertes détectées
  metrics: {
    sizeRatio: number;
    oldViews: number;
    newViews: number;
    oldForms: number;
    newForms: number;
    oldActions: number;
    newActions: number;
    lostBindings: string[];
    sdkRemoved: boolean;
  };
}

function countMatches(html: string, re: RegExp): number {
  const m = html.match(re);
  return m ? m.length : 0;
}

/** Vues distinctes : onglets + commutateurs de vue (approximation robuste). */
function countViews(html: string): number {
  const tabs = countMatches(html, /class=["'][^"']*\btab-item\b/g);
  const dataViews = new Set(
    [...html.matchAll(/data-view=["']([^"']+)["']/g)].map((m) => m[1])
  ).size;
  const switchers = countMatches(html, /\b(?:showView|switchView|setView|goView|navigate)\s*\(/g);
  return Math.max(tabs, dataViews, switchers > 0 ? switchers : 0);
}

/** Formulaires : balises <form> + modales d'édition. */
function countForms(html: string): number {
  const forms = countMatches(html, /<form\b/gi);
  const modals = countMatches(html, /class=["'][^"']*\bmodal\b/g);
  return Math.max(forms, modals);
}

/** Actions : points d'interaction câblés (boutons cliquables). */
function countActions(html: string): number {
  const onclick = countMatches(html, /\bonclick=/gi);
  const listeners = countMatches(html, /addEventListener\(\s*["']click["']/g);
  return onclick + listeners;
}

/** Entités workspace réellement branchées via window.biltia dans ce HTML. */
function workspaceBindings(html: string): Set<string> {
  const out = new Set<string>();
  const re = /biltia\.(?:list|get|create|update|remove|bulkCreate)\(\s*["']([a-zA-Z_]+)["']/g;
  for (const m of html.matchAll(re)) out.add(m[1]);
  return out;
}

function hasSdkUsage(html: string): boolean {
  return /window\.biltia\b/.test(html) || /\bbiltia\.(?:list|get|create|update|remove|bulkCreate)\(/.test(html);
}

/**
 * Évalue le risque d'une réécriture. `risk="high"` si un signal CRITIQUE est
 * présent (SDK retiré, toutes les entités canoniques débranchées) OU si au moins
 * deux signaux FORTS concordent (réduction massive, vues/formulaires/actions
 * perdus). Sinon `low`. Une petite modification chirurgicale reste toujours `low`.
 */
export function assessRewriteRisk(oldHtml: string, newHtml: string): RewriteRisk {
  const oldLen = oldHtml.length || 1;
  const sizeRatio = newHtml.length / oldLen;

  const oldViews = countViews(oldHtml);
  const newViews = countViews(newHtml);
  const oldForms = countForms(oldHtml);
  const newForms = countForms(newHtml);
  const oldActions = countActions(oldHtml);
  const newActions = countActions(newHtml);

  const oldBind = workspaceBindings(oldHtml);
  const newBind = workspaceBindings(newHtml);
  const oldCanonical = [...oldBind].filter((e) => ALLOWED_ENTITIES.includes(e));
  const lostBindings = oldCanonical.filter((e) => !newBind.has(e));

  const sdkRemoved = hasSdkUsage(oldHtml) && !hasSdkUsage(newHtml);
  const allWorkspaceLost = oldCanonical.length > 0 && lostBindings.length === oldCanonical.length;

  const losses: string[] = [];
  const strong: string[] = [];

  // Signaux CRITIQUES → risque élevé immédiat.
  if (sdkRemoved) losses.push("La connexion aux données (window.biltia) a disparu.");
  if (allWorkspaceLost)
    losses.push(`Toutes les entités du workspace ont été débranchées (${oldCanonical.join(", ")}).`);

  // Signaux FORTS (≥ 2 → risque élevé).
  if (sizeRatio < 0.55) {
    const pct = Math.round((1 - sizeRatio) * 100);
    strong.push(`Réduction massive du code (−${pct} %).`);
  }
  if (oldViews >= 2 && newViews < oldViews && oldViews - newViews >= 2) {
    strong.push(`Des vues ont été supprimées (${oldViews} → ${newViews}).`);
  }
  if (oldForms >= 2 && newForms < oldForms) {
    strong.push(`Un ou plusieurs formulaires ont été supprimés (${oldForms} → ${newForms}).`);
  }
  if (oldActions >= 6 && newActions < oldActions * 0.5) {
    strong.push(`De nombreuses actions ont été retirées (${oldActions} → ${newActions}).`);
  }
  if (lostBindings.length > 0 && !allWorkspaceLost) {
    strong.push(`Branchement workspace retiré : ${lostBindings.join(", ")}.`);
  }

  const critical = sdkRemoved || allWorkspaceLost;
  const risk: "low" | "high" = critical || strong.length >= 2 ? "high" : "low";
  if (risk === "high") losses.push(...strong);

  return {
    risk,
    losses,
    metrics: {
      sizeRatio: Math.round(sizeRatio * 100) / 100,
      oldViews,
      newViews,
      oldForms,
      newForms,
      oldActions,
      newActions,
      lostBindings,
      sdkRemoved,
    },
  };
}
