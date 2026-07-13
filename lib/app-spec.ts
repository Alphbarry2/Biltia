// ─────────────────────────────────────────────────────────────────────────────
// APP SPEC V1 — contrat structuré d'une application (Phase 1).
//
// Une app reste rendue en HTML/JS libre (on ne casse rien). L'AppSpec est un
// CONTRAT stocké À CÔTÉ du HTML (colonne modules.app_spec) qui décrit ce que
// l'app est censée faire : entités branchées, vues, actions, calculs,
// permissions, événements, automatisations suggérées, agents attachés.
//
// Deux sources, fusionnées :
//   • DÉCLARÉE (intention) : le modèle émet un bloc <!--BILTIA_SPEC …--> à la
//     création → purpose, description, permissions, automatisations suggérées.
//   • DÉRIVÉE (réel) : extraction 100 % déterministe du HTML → entités réellement
//     branchées, vues détectées, actions câblées. C'est la base de la validation
//     post-génération (Phase 2 : « le HTML respecte-t-il la spec ? »).
//
// Rétrocompat : app_spec est NULLABLE. Une app legacy sans spec reste lisible et
// modifiable ; sa spec est dérivée à la première sauvegarde par le chemin
// autoritaire (/api/modules/save). Aucune dépendance au code libre n'est ajoutée.
// ─────────────────────────────────────────────────────────────────────────────

import { ALLOWED_ENTITIES } from "./data-entities";

export type AppViewType =
  | "table"
  | "list"
  | "cards"
  | "kanban"
  | "calendar"
  | "planning"
  | "dashboard"
  | "detail"
  | "form"
  | "gallery"
  | "timeline"
  | "map"
  | "public_form"
  | "portal";

export type AppActionType =
  | "create_record"
  | "update_record"
  | "archive_record"
  | "delete_record"
  | "update_status"
  | "assign_record"
  | "transform_record"
  | "send_email"
  | "send_sms"
  | "generate_document"
  | "request_approval"
  | "request_signature"
  | "trigger_agent"
  | "create_agent"
  | "open_map"
  | "export_csv"
  | "print_pdf"
  | "ai_action";

export interface WorkspaceRelationBinding {
  field: string;
  targetEntity: string;
}

export interface WorkspaceBinding {
  entity: string;
  mode: "read" | "write" | "read_write";
  fields?: string[];
  aliases?: string[];
  relations?: WorkspaceRelationBinding[];
  required?: boolean;
}

export interface CustomEntityRef {
  key: string; // nom de la collection app_records libre
  name?: string;
  customEntityId?: string | null; // Phase 3 : lien vers custom_entities
}

export interface AppFilterCondition {
  field: string;
  op: string;
  value?: unknown;
}
export interface AppFilterGroup {
  type: "all" | "any" | "not";
  conditions: AppFilterCondition[];
}
export interface AppSortSpec {
  field: string;
  direction?: "asc" | "desc";
}
export interface AppComponentSpec {
  id: string;
  type: string;
  label?: string;
}

export interface AppViewSpec {
  id: string;
  name: string;
  type: AppViewType;
  entity?: string;
  fields?: string[];
  filters?: AppFilterGroup;
  sorting?: AppSortSpec[];
  grouping?: { field: string };
  components?: AppComponentSpec[];
  mobileMode?: string;
}

export interface AppActionSpec {
  id: string;
  label: string;
  type: AppActionType;
  entity?: string;
  operation?: string;
  params?: Record<string, unknown>;
  requiresSelection?: boolean;
  approvalRequired?: boolean;
  allowedRoles?: string[];
}

export interface AppFormulaExpression {
  operation: string;
  args?: unknown[];
  field?: string;
  relationSum?: string;
}
export interface AppCalculationSpec {
  id: string;
  name: string;
  type: "sum" | "count" | "average" | "percentage" | "difference" | "formula" | "server_metric";
  entity?: string;
  field?: string;
  formula?: AppFormulaExpression;
  serverOperation?: string;
}

export interface AppPermissionSpec {
  role:
    | "owner"
    | "admin"
    | "manager"
    | "member"
    | "viewer"
    | "client"
    | "subcontractor";
  viewIds?: string[];
  actions?: string[];
  rowScope?: "all" | "assigned" | "related_client" | "related_chantier" | "explicit";
}

export interface AppEventSpec {
  type: string; // AppDomainEventType (Phase 5)
  entity?: string;
}

export interface SuggestedAutomationSpec {
  title: string;
  purpose: string;
  trigger?: string;
}

export interface AppNavigationSpec {
  views: string[]; // ids de vues, dans l'ordre
}

export interface AppSpecV1 {
  version: 1;
  id?: string;
  name: string;
  description?: string;
  purpose: string;
  sector?: string;
  problemStatement?: string;
  dataMode: "workspace" | "custom" | "hybrid" | "import" | "empty";
  workspaceBindings: WorkspaceBinding[];
  customEntities: CustomEntityRef[];
  views: AppViewSpec[];
  actions: AppActionSpec[];
  calculations: AppCalculationSpec[];
  permissions: AppPermissionSpec[];
  emittedEvents: AppEventSpec[];
  suggestedAutomations: SuggestedAutomationSpec[];
  attachedRuleIds: string[];
  navigation?: AppNavigationSpec;
  metadata?: Record<string, unknown>;
}

// ── EXTRACTION du bloc spec émis par le modèle ────────────────────────────────
// Le modèle émet, APRÈS </html>, un bloc HTML-commenté :
//   <!--BILTIA_SPEC {"version":1,...} BILTIA_SPEC-->
// On l'extrait et on renvoie le HTML nettoyé (le bloc ne doit jamais atteindre
// l'app servie). Tolérant : si absent/malformé → { spec:null, cleanedHtml:html }.
const SPEC_BLOCK_RE = /<!--\s*BILTIA_SPEC\s*([\s\S]*?)\s*BILTIA_SPEC\s*-->/i;

export function extractSpecBlock(raw: string): { spec: unknown | null; cleanedHtml: string } {
  const m = raw.match(SPEC_BLOCK_RE);
  if (!m) return { spec: null, cleanedHtml: raw };
  const cleanedHtml = raw.replace(SPEC_BLOCK_RE, "").trimEnd();
  let spec: unknown | null = null;
  try {
    spec = JSON.parse(m[1].trim());
  } catch {
    spec = null; // JSON cassé → on retombera sur la dérivation
  }
  return { spec, cleanedHtml };
}

/** Fragment de prompt : demande au modèle d'émettre le bloc spec (création). */
export function buildSpecInstruction(): string {
  return `# CONTRAT STRUCTURÉ (obligatoire, APRÈS le HTML)
Juste APRÈS la balise \`</html>\` finale (donc en dehors du document), ajoute UN bloc de métadonnées, exactement sous cette forme :
<!--BILTIA_SPEC {"version":1,"name":"…","purpose":"…","dataMode":"workspace|custom|hybrid|import|empty","customEntities":[{"key":"controles_qualite","name":"Contrôle qualité","aliases":["inspection"],"statuses":["ouvert","levé"],"fields":[{"key":"gravite","label":"Gravité","type":"select","options":["mineure","majeure"]},{"key":"chantier_id","label":"Chantier","type":"relation","relation":{"targetEntity":"chantiers","cardinality":"one"}}]}],"suggestedAutomations":[{"title":"…","purpose":"…","trigger":"quotidien|hebdomadaire|dès qu'un devis est accepté|…"}],"permissions":[{"role":"member","rowScope":"assigned"}]} BILTIA_SPEC-->
Règles :
- JSON STRICT sur une seule ligne, entre les marqueurs \`BILTIA_SPEC\`. Rien d'autre après.
- \`purpose\` : une phrase = à quoi sert l'app. \`dataMode\` : "workspace" si elle lit/écrit des entités du workspace, "custom" si des collections libres, "hybrid" si les deux, "import" si elle démarre par un import, "empty" si elle démarre vide.
- \`customEntities\` : UNIQUEMENT pour les notions qui n'existent PAS déjà dans le workspace (ni chantiers, clients, devis, factures, employés, interventions, tâches, réserves, etc.). Pour chacune : \`key\` en snake_case, \`fields\` typés (types : text, long_text, number, currency, percentage, boolean, date, datetime, email, phone, url, select, multi_select, status, relation, photo, signature, formula), \`statuses\` si l'entité a un cycle de vie, et un champ \`relation\` (type:"relation", relation.targetEntity) pour la relier à une entité workspace (ex : chantiers). Si l'app n'utilise QUE des entités workspace, mets \`"customEntities":[]\`. NE redéclare JAMAIS une entité workspace ici.
- \`suggestedAutomations\` : 1 à 3 automatisations UTILES que l'utilisateur pourrait vouloir plus tard (ex : « Relancer un devis non signé sous 7 jours »). N'active RIEN, ce sont des suggestions.
- Ce bloc N'EST PAS affiché à l'utilisateur : c'est un contrat interne. Ne le mentionne jamais dans l'app.`;
}

// ── DÉRIVATION déterministe depuis le HTML ────────────────────────────────────

function bindingModes(html: string): Map<string, { read: boolean; write: boolean }> {
  const out = new Map<string, { read: boolean; write: boolean }>();
  const re = /biltia\.(list|get|create|update|remove|bulkCreate)\(\s*["']([a-zA-Z_]+)["']/g;
  for (const m of html.matchAll(re)) {
    const op = m[1];
    const entity = m[2];
    const cur = out.get(entity) ?? { read: false, write: false };
    if (op === "list" || op === "get") cur.read = true;
    else cur.write = true;
    out.set(entity, cur);
  }
  return out;
}

function deriveViews(html: string): AppViewSpec[] {
  const views: AppViewSpec[] = [];
  const seen = new Set<string>();
  const push = (id: string, name: string, type: AppViewType) => {
    if (seen.has(id)) return;
    seen.add(id);
    views.push({ id, name, type });
  };
  // Vues nommées (onglets/commutateurs).
  for (const m of html.matchAll(/data-view=["']([a-zA-Z0-9_-]+)["']/g)) {
    push(m[1], m[1], "list");
  }
  // Types détectés par marqueurs structurels.
  if (/\bdraggable\b/.test(html) && /dragstart|dragover|drop\b/.test(html)) push("kanban", "Kanban", "kanban");
  if (/class=["'][^"']*\b(calendar|agenda|planning)\b/i.test(html)) push("calendrier", "Calendrier", "calendar");
  if (/class=["'][^"']*\b(kpi-grid|cockpit|hero)\b/.test(html) && /chart-host|drawArea|drawBars/.test(html))
    push("dashboard", "Tableau de bord", "dashboard");
  if (/<table\b/i.test(html)) push("table", "Tableau", "table");
  if (/class=["'][^"']*\bmodal\b/.test(html) || /<form\b/i.test(html)) push("form", "Formulaire", "form");
  if (/class=["'][^"']*\bgallery\b/i.test(html)) push("gallery", "Galerie", "gallery");
  return views;
}

function deriveActions(html: string): AppActionSpec[] {
  const actions: AppActionSpec[] = [];
  const add = (id: string, label: string, type: AppActionType) => {
    if (actions.some((a) => a.id === id)) return;
    actions.push({ id, label, type });
  };
  const modes = bindingModes(html);
  const anyWrite = [...modes.values()].some((m) => m.write);
  if (anyWrite) {
    add("create_record", "Créer une fiche", "create_record");
    add("update_record", "Modifier une fiche", "update_record");
  }
  if (/biltia\.remove\(/.test(html)) add("delete_record", "Supprimer", "delete_record");
  if (/biltia\.sendEmail\(/.test(html)) add("send_email", "Envoyer un email", "send_email");
  if (/biltia\.sendSms\(/.test(html)) add("send_sms", "Envoyer un SMS", "send_sms");
  if (/biltia\.invoiceFromDevis\(/.test(html)) add("invoice_from_devis", "Facturer le devis", "transform_record");
  if (/biltia\.chantierFromDevis\(/.test(html)) add("chantier_from_devis", "Ouvrir le chantier", "transform_record");
  if (/biltia\.devisFromDemande\(/.test(html)) add("devis_from_demande", "Créer le devis", "transform_record");
  if (/biltia\.taskFromNote\(/.test(html)) add("task_from_note", "Créer une tâche", "transform_record");
  if (/biltia\.reserveFromNote\(/.test(html)) add("reserve_from_note", "Créer une réserve", "transform_record");
  if (/biltia\.extract\(/.test(html)) add("ai_extract", "Lire une photo (IA)", "ai_action");
  if (/biltia\.(transcribe|parseDevis)\(/.test(html)) add("ai_voice", "Dictée (IA)", "ai_action");
  if (/window\.print\(/.test(html)) add("print_pdf", "Imprimer / PDF", "print_pdf");
  if (/text\/csv|createObjectURL/.test(html) && /download/.test(html)) add("export_csv", "Export CSV", "export_csv");
  if (/calendar\.google\.com|maps\.google|google\.com\/maps/.test(html)) add("open_map", "Ouvrir Maps / Agenda", "open_map");
  return actions;
}

/**
 * Dérive une AppSpec V1 des FAITS STRUCTURELS d'un HTML (entités branchées, vues,
 * actions). N'invente aucune intention (purpose vide) : c'est la couche « réel »,
 * pas « déclaré ». 100 % déterministe.
 */
export function deriveAppSpecFromHtml(
  html: string,
  ctx: { name?: string; description?: string; sector?: string | null } = {}
): AppSpecV1 {
  const modes = bindingModes(html);
  const workspaceBindings: WorkspaceBinding[] = [];
  const customEntities: CustomEntityRef[] = [];
  for (const [entity, m] of modes) {
    const mode: WorkspaceBinding["mode"] = m.read && m.write ? "read_write" : m.write ? "write" : "read";
    if (ALLOWED_ENTITIES.includes(entity)) workspaceBindings.push({ entity, mode });
    else customEntities.push({ key: entity, customEntityId: null });
  }

  let dataMode: AppSpecV1["dataMode"] = "empty";
  if (workspaceBindings.length && customEntities.length) dataMode = "hybrid";
  else if (workspaceBindings.length) dataMode = "workspace";
  else if (customEntities.length) dataMode = "custom";
  else if (/<input[^>]+type=["']file["']/i.test(html)) dataMode = "import";

  const views = deriveViews(html);

  return {
    version: 1,
    name: ctx.name || "Application",
    description: ctx.description || "",
    purpose: "",
    sector: ctx.sector ?? undefined,
    dataMode,
    workspaceBindings,
    customEntities,
    views,
    actions: deriveActions(html),
    calculations: [],
    permissions: [],
    emittedEvents: [],
    suggestedAutomations: [],
    attachedRuleIds: [],
    navigation: views.length ? { views: views.map((v) => v.id) } : undefined,
    metadata: { source: "derived" },
  };
}

// ── COERCION d'une spec DÉCLARÉE par le modèle (défensif) ──────────────────────
// On ne fait JAMAIS confiance au JSON brut du LLM : on ne retient que les champs
// d'INTENTION (le structurel vient de la dérivation), bornés et normalisés.

function str(v: unknown, max = 400): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;
}

const VALID_DATA_MODES = new Set(["workspace", "custom", "hybrid", "import", "empty"]);
const VALID_ROLES = new Set(["owner", "admin", "manager", "member", "viewer", "client", "subcontractor"]);
const VALID_ROW_SCOPES = new Set(["all", "assigned", "related_client", "related_chantier", "explicit"]);

/** Extrait les champs d'INTENTION exploitables d'une spec émise par le modèle. */
export function coerceDeclaredIntent(input: unknown): Partial<AppSpecV1> {
  if (!input || typeof input !== "object") return {};
  const o = input as Record<string, unknown>;
  const out: Partial<AppSpecV1> = {};

  const purpose = str(o.purpose, 400);
  if (purpose) out.purpose = purpose;
  const description = str(o.description, 600);
  if (description) out.description = description;
  const problem = str(o.problemStatement, 600);
  if (problem) out.problemStatement = problem;
  if (typeof o.dataMode === "string" && VALID_DATA_MODES.has(o.dataMode))
    out.dataMode = o.dataMode as AppSpecV1["dataMode"];

  if (Array.isArray(o.suggestedAutomations)) {
    const autos: SuggestedAutomationSpec[] = [];
    for (const a of o.suggestedAutomations.slice(0, 5)) {
      const ao = (a ?? {}) as Record<string, unknown>;
      const title = str(ao.title, 120);
      if (!title) continue;
      autos.push({ title, purpose: str(ao.purpose, 240) ?? "", trigger: str(ao.trigger, 120) });
    }
    out.suggestedAutomations = autos;
  }

  if (Array.isArray(o.permissions)) {
    const perms: AppPermissionSpec[] = [];
    for (const p of o.permissions.slice(0, 12)) {
      const po = (p ?? {}) as Record<string, unknown>;
      if (typeof po.role !== "string" || !VALID_ROLES.has(po.role)) continue;
      const rowScope =
        typeof po.rowScope === "string" && VALID_ROW_SCOPES.has(po.rowScope)
          ? (po.rowScope as AppPermissionSpec["rowScope"])
          : undefined;
      perms.push({ role: po.role as AppPermissionSpec["role"], rowScope });
    }
    out.permissions = perms;
  }

  return out;
}

/**
 * Compose la spec FINALE stockée : structure DÉRIVÉE (autoritaire) + intention
 * (déclarée par le modèle à la création, ou reportée depuis la spec existante
 * lors d'une modification). Le structurel gagne toujours ; l'intention enrichit.
 */
export function composeAppSpec(
  derived: AppSpecV1,
  intent: Partial<AppSpecV1> | null | undefined,
  source: "llm" | "carried" | "derived"
): AppSpecV1 {
  const i = intent ?? {};
  return {
    ...derived,
    name: i.name || derived.name,
    description: i.description || derived.description,
    purpose: i.purpose || derived.purpose || "",
    problemStatement: i.problemStatement ?? derived.problemStatement,
    // dataMode : on garde le DÉRIVÉ (le réel prime), sauf s'il est "empty" et que
    // l'intention déclare mieux (import/empty voulu).
    dataMode: derived.dataMode === "empty" && i.dataMode ? i.dataMode : derived.dataMode,
    calculations: derived.calculations.length ? derived.calculations : i.calculations ?? [],
    permissions: i.permissions ?? derived.permissions ?? [],
    suggestedAutomations: i.suggestedAutomations ?? derived.suggestedAutomations ?? [],
    attachedRuleIds: i.attachedRuleIds ?? derived.attachedRuleIds ?? [],
    metadata: { ...(derived.metadata ?? {}), source },
  };
}

/** Extrait les champs d'intention d'une spec DÉJÀ stockée (pour report en modif). */
export function intentFromStored(stored: unknown): Partial<AppSpecV1> {
  if (!stored || typeof stored !== "object") return {};
  const o = stored as Record<string, unknown>;
  const out: Partial<AppSpecV1> = {};
  if (typeof o.purpose === "string") out.purpose = o.purpose;
  if (typeof o.problemStatement === "string") out.problemStatement = o.problemStatement;
  if (Array.isArray(o.suggestedAutomations)) out.suggestedAutomations = o.suggestedAutomations as SuggestedAutomationSpec[];
  if (Array.isArray(o.permissions)) out.permissions = o.permissions as AppPermissionSpec[];
  if (Array.isArray(o.attachedRuleIds)) out.attachedRuleIds = o.attachedRuleIds as string[];
  return out;
}

// ── VALIDATION structurelle (Phase 1 — forme seulement) ───────────────────────
export interface AppSpecShapeResult {
  valid: boolean;
  errors: string[];
}
/**
 * Normalise une spec STOCKÉE (jsonb) en AppSpecV1 sûr, ou null si la forme est
 * invalide. Garantit que tous les tableaux existent (défensif) → applyAppSpecPatch
 * et diffToPatch peuvent l'utiliser sans crash. (Phase 7 / A2.)
 */
export function asStoredAppSpec(raw: unknown): AppSpecV1 | null {
  if (!validateAppSpecShape(raw).valid) return null;
  const s = raw as AppSpecV1;
  const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  return {
    ...s,
    views: arr<AppViewSpec>(s.views),
    actions: arr<AppActionSpec>(s.actions),
    workspaceBindings: arr<WorkspaceBinding>(s.workspaceBindings),
    customEntities: arr<CustomEntityRef>(s.customEntities),
    permissions: arr<AppPermissionSpec>(s.permissions),
    calculations: arr<AppCalculationSpec>(s.calculations),
    emittedEvents: arr<AppEventSpec>(s.emittedEvents),
    suggestedAutomations: arr<SuggestedAutomationSpec>(s.suggestedAutomations),
    attachedRuleIds: arr<string>(s.attachedRuleIds),
  };
}

export function validateAppSpecShape(spec: unknown): AppSpecShapeResult {
  const errors: string[] = [];
  if (!spec || typeof spec !== "object") return { valid: false, errors: ["spec absente"] };
  const s = spec as Record<string, unknown>;
  if (s.version !== 1) errors.push("version doit valoir 1");
  if (typeof s.name !== "string" || !s.name.trim()) errors.push("name requis");
  if (typeof s.dataMode !== "string" || !VALID_DATA_MODES.has(s.dataMode)) errors.push("dataMode invalide");
  for (const key of ["workspaceBindings", "views", "actions", "customEntities", "permissions"]) {
    if (!Array.isArray(s[key])) errors.push(`${key} doit être un tableau`);
  }
  return { valid: errors.length === 0, errors };
}
