// ─────────────────────────────────────────────────────────────────────────────
// ENTITÉS PERSONNALISÉES STRUCTURÉES (Phase 3).
//
// Problème réglé : une notion qui n'existe pas dans les 34 entités canoniques
// (ex : « contrôle qualité ») partait dans app_records en JSONB anarchique — pas
// de schéma, pas de types, pas de statuts, pas de dédup → deux apps créaient deux
// silos pour le même concept. Ici on active un REGISTRE de DÉFINITIONS.
//
// Choix d'archi (rétrocompat, prod-drift) : on RÉUTILISE la table `custom_entities`
// (créée en 004, jamais exploitée) SANS changer son schéma. Convention :
//   • une DÉFINITION = une ligne { entity_type: <key>, name, data: {…définition} }.
//   • les ENREGISTREMENTS restent dans app_records (collection == key). Le lien est
//     le NOM (key == collection) → aucune colonne ajoutée à app_records.
// Accès via le client ADMIN (tenant vérifié en amont) : comme module_versions, la
// table a RLS activée mais pas de policy en prod tant que 044 n'est pas appliquée.
// Best-effort : jamais bloquant pour la sauvegarde d'une app.
// ─────────────────────────────────────────────────────────────────────────────

import { ALLOWED_ENTITIES, detectConnectedEntities } from "./data-entities";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = { from: (t: string) => any } | null;

export type CustomFieldType =
  | "text"
  | "long_text"
  | "number"
  | "currency"
  | "percentage"
  | "boolean"
  | "date"
  | "datetime"
  | "duration"
  | "email"
  | "phone"
  | "url"
  | "select"
  | "multi_select"
  | "status"
  | "relation"
  | "user"
  | "file"
  | "photo"
  | "signature"
  | "formula";

const VALID_FIELD_TYPES = new Set<string>([
  "text", "long_text", "number", "currency", "percentage", "boolean", "date", "datetime",
  "duration", "email", "phone", "url", "select", "multi_select", "status", "relation",
  "user", "file", "photo", "signature", "formula",
]);

export interface CustomFieldDefinition {
  key: string;
  label: string;
  type: CustomFieldType;
  required?: boolean;
  unique?: boolean;
  defaultValue?: unknown;
  options?: string[];
  relation?: { targetEntity: string; cardinality: "one" | "many" };
  validation?: { min?: number; max?: number; pattern?: string };
}

export interface CustomRelationDefinition {
  key: string;
  sourceEntity: string;
  targetEntity: string;
  type: "one_to_one" | "one_to_many" | "many_to_one" | "many_to_many";
  required?: boolean;
}

export interface CustomEntityDefinition {
  id?: string;
  tenantId?: string;
  key: string;
  name: string;
  description?: string;
  aliases: string[];
  fields: CustomFieldDefinition[];
  relations: CustomRelationDefinition[];
  statuses?: string[];
  createdBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

const RESERVED_KEYS = new Set(["__unmet_requests"]);

/** snake_case ASCII sans accents, borné. « Contrôles Qualité » → controles_qualite. */
export function normalizeEntityKey(input: string): string {
  const base = (input || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  return base || "collection";
}

function normToken(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Forme singulier/pluriel naïve pour rapprocher « chantier » et « chantiers ». */
function keyVariants(key: string): Set<string> {
  const k = normalizeEntityKey(key);
  const v = new Set<string>([k]);
  if (k.endsWith("s")) v.add(k.slice(0, -1));
  else v.add(k + "s");
  return v;
}

/** Singularise CHAQUE token → rapproche « controles_qualite » et « controle_qualite ». */
function singularizeKey(key: string): string {
  return normalizeEntityKey(key)
    .split("_")
    .map((tok) => (tok.length > 3 && tok.endsWith("s") ? tok.slice(0, -1) : tok))
    .join("_");
}

// ── INFÉRENCE DE TYPE ─────────────────────────────────────────────────────────

/** Devine le type d'un champ à partir de son NOM (heuristique déterministe). */
export function inferFieldTypeFromKey(key: string): CustomFieldType {
  const k = normToken(key).replace(/\s+/g, "_");
  if (k.endsWith("_id") || k === "id") return "relation";
  if (/(^|_)(email|mail)($|_)/.test(k)) return "email";
  if (/(^|_)(tel|telephone|phone|mobile|portable)($|_)/.test(k)) return "phone";
  if (/(^|_)(url|lien|site|web)($|_)/.test(k)) return "url";
  if (/(montant|prix|cout|tarif|budget|total_ttc|total_ht|solde|reste)/.test(k)) return "currency";
  if (/(taux|pourcentage|pct|avancement|progression)/.test(k)) return "percentage";
  if (/(date|echeance|deadline|debut|fin|jour)/.test(k)) return "date";
  if (/(statut|status|etat|etape)/.test(k)) return "status";
  if (/(quantite|nombre|nb_|count|heures|duree|note_sur|score)/.test(k)) return "number";
  if (/(photo|image|piece_jointe|fichier|document|scan)/.test(k)) return "photo";
  if (/(signature|signe)/.test(k)) return "signature";
  if (/(description|notes|commentaire|remarque|contenu|observation)/.test(k)) return "long_text";
  if (/(actif|valide|paye|termine|fait|ok|is_|has_)/.test(k)) return "boolean";
  return "text";
}

function humanLabel(key: string): string {
  const t = normToken(key).replace(/_/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : key;
}

/** Un champ inféré depuis une clé. */
export function fieldFromKey(key: string): CustomFieldDefinition {
  const type = inferFieldTypeFromKey(key);
  const def: CustomFieldDefinition = { key, label: humanLabel(key), type };
  if (type === "relation") {
    const target = key.replace(/_id$/, "");
    def.relation = { targetEntity: keyVariants(target).has(target + "s") ? target + "s" : target, cardinality: "one" };
  }
  return def;
}

/** Propose des champs à partir d'un échantillon d'enregistrements app_records (migration assistée). */
export function inferFieldsFromRecords(rows: Record<string, unknown>[]): CustomFieldDefinition[] {
  const seen = new Map<string, CustomFieldType>();
  for (const row of rows.slice(0, 50)) {
    for (const [k, v] of Object.entries(row)) {
      if (["id", "created_at", "updated_at"].includes(k)) continue;
      if (seen.has(k)) continue;
      let t = inferFieldTypeFromKey(k);
      // Affiner avec la valeur observée.
      if (t === "text") {
        if (typeof v === "boolean") t = "boolean";
        else if (typeof v === "number") t = "number";
        else if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) t = "date";
      }
      seen.set(k, t);
    }
  }
  return [...seen.entries()].map(([key, type]) => ({ key, label: humanLabel(key), type }));
}

// ── COERCION d'une définition déclarée par le modèle (défensif) ────────────────

export function coerceEntityDefinition(input: unknown, fallbackKey?: string): CustomEntityDefinition | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const rawKey = typeof o.key === "string" && o.key.trim() ? o.key : typeof o.name === "string" ? o.name : fallbackKey;
  if (!rawKey) return null;
  const key = normalizeEntityKey(rawKey);
  if (ALLOWED_ENTITIES.includes(key) || RESERVED_KEYS.has(key)) return null; // jamais redéfinir une canonique

  const name = typeof o.name === "string" && o.name.trim() ? o.name.trim().slice(0, 80) : humanLabel(key);
  const aliases = Array.isArray(o.aliases)
    ? o.aliases.filter((a): a is string => typeof a === "string").map((a) => a.trim()).filter(Boolean).slice(0, 12)
    : [];

  const fields: CustomFieldDefinition[] = [];
  if (Array.isArray(o.fields)) {
    for (const f of o.fields.slice(0, 60)) {
      const fo = (f ?? {}) as Record<string, unknown>;
      const fkey = typeof fo.key === "string" && fo.key.trim() ? normalizeEntityKey(fo.key) : null;
      if (!fkey) continue;
      const type = typeof fo.type === "string" && VALID_FIELD_TYPES.has(fo.type)
        ? (fo.type as CustomFieldType)
        : inferFieldTypeFromKey(fkey);
      const field: CustomFieldDefinition = {
        key: fkey,
        label: typeof fo.label === "string" && fo.label.trim() ? fo.label.trim().slice(0, 80) : humanLabel(fkey),
        type,
      };
      if (fo.required === true) field.required = true;
      if (Array.isArray(fo.options)) field.options = fo.options.filter((x): x is string => typeof x === "string").slice(0, 40);
      if (fo.relation && typeof fo.relation === "object") {
        const ro = fo.relation as Record<string, unknown>;
        if (typeof ro.targetEntity === "string")
          field.relation = { targetEntity: normalizeEntityKey(ro.targetEntity), cardinality: ro.cardinality === "many" ? "many" : "one" };
      }
      fields.push(field);
    }
  }

  const relations: CustomRelationDefinition[] = [];
  if (Array.isArray(o.relations)) {
    for (const r of o.relations.slice(0, 20)) {
      const ro = (r ?? {}) as Record<string, unknown>;
      const target = typeof ro.targetEntity === "string" ? normalizeEntityKey(ro.targetEntity) : null;
      if (!target) continue;
      const type = ["one_to_one", "one_to_many", "many_to_one", "many_to_many"].includes(String(ro.type))
        ? (ro.type as CustomRelationDefinition["type"])
        : "many_to_one";
      relations.push({
        key: typeof ro.key === "string" ? normalizeEntityKey(ro.key) : `${target}_id`,
        sourceEntity: key,
        targetEntity: target,
        type,
        required: ro.required === true,
      });
    }
  }

  const statuses = Array.isArray(o.statuses)
    ? o.statuses.filter((s): s is string => typeof s === "string").map((s) => s.trim()).filter(Boolean).slice(0, 20)
    : undefined;

  return {
    key,
    name,
    description: typeof o.description === "string" ? o.description.trim().slice(0, 300) : undefined,
    aliases,
    fields,
    relations,
    statuses,
  };
}

// ── DÉTECTION DE DOUBLON SÉMANTIQUE ───────────────────────────────────────────

export interface SimilarityResult {
  kind: "canonical" | "custom" | "none";
  key?: string; // entité (canonique ou custom) à réutiliser
  reason?: string;
}

/**
 * Une entité proposée est-elle un DOUBLON d'une entité existante ?
 *   • canonique : le nom mappe vers une des 34 entités du workspace → à réutiliser
 *     (jamais recréer). C'est aussi ce que Phase 2 signale comme silo/typo.
 *   • custom : une définition existante du tenant a la même key/alias/nom proche.
 *   • none : concept nouveau → à enregistrer.
 */
export function findSimilarEntity(
  proposedKey: string,
  proposedName: string | undefined,
  existing: CustomEntityDefinition[]
): SimilarityResult {
  const key = normalizeEntityKey(proposedKey);
  const variants = keyVariants(key);

  // 1) Canonique : match direct (singulier/pluriel) ou via mots-clés.
  for (const v of variants) {
    if (ALLOWED_ENTITIES.includes(v)) return { kind: "canonical", key: v, reason: "correspond à une entité workspace" };
  }
  const mapped = detectConnectedEntities(`${proposedName ?? ""} ${key.replace(/_/g, " ")}`).filter((e) =>
    ALLOWED_ENTITIES.includes(e)
  );
  // Ne mappe que si le nom est VRAIMENT proche (le token du concept apparaît).
  if (mapped.length) {
    const nameTok = normToken(`${proposedName ?? ""} ${key}`);
    const strong = mapped.find((m) => nameTok.includes(m.slice(0, 5)) || nameTok.includes(m.replace(/s$/, "")));
    if (strong) return { kind: "canonical", key: strong, reason: "concept déjà couvert par le workspace" };
  }

  // 2) Custom existant : même key/variante, alias, ou nom normalisé identique.
  const pname = normToken(proposedName ?? key);
  const pSing = singularizeKey(key);
  for (const e of existing) {
    const ek = normalizeEntityKey(e.key);
    if (variants.has(ek) || keyVariants(ek).has(key) || singularizeKey(ek) === pSing)
      return { kind: "custom", key: e.key, reason: "clé identique" };
    const aliasHit = (e.aliases ?? []).some((a) => normToken(a) === pname || normalizeEntityKey(a) === key);
    if (aliasHit) return { kind: "custom", key: e.key, reason: "alias correspondant" };
    if (normToken(e.name) && normToken(e.name) === pname) return { kind: "custom", key: e.key, reason: "nom identique" };
  }

  return { kind: "none" };
}

// ── CRUD (client ADMIN, tenant vérifié en amont) ──────────────────────────────

const DEF_MARKER = "__custom_entity_def__"; // sécurité : jamais un vrai entity_type métier

function rowToDefinition(r: Record<string, unknown>): CustomEntityDefinition | null {
  const data = (r.data && typeof r.data === "object" ? r.data : {}) as Record<string, unknown>;
  const key = typeof r.entity_type === "string" ? r.entity_type : typeof data.key === "string" ? data.key : "";
  if (!key || key === DEF_MARKER) return null;
  return {
    id: typeof r.id === "string" ? r.id : undefined,
    tenantId: typeof r.tenant_id === "string" ? r.tenant_id : undefined,
    key,
    name: typeof r.name === "string" ? r.name : key,
    description: typeof data.description === "string" ? data.description : undefined,
    aliases: Array.isArray(data.aliases) ? (data.aliases as string[]) : [],
    fields: Array.isArray(data.fields) ? (data.fields as CustomFieldDefinition[]) : [],
    relations: Array.isArray(data.relations) ? (data.relations as CustomRelationDefinition[]) : [],
    statuses: Array.isArray(data.statuses) ? (data.statuses as string[]) : undefined,
    createdBy: typeof r.created_by === "string" ? r.created_by : null,
    createdAt: typeof r.created_at === "string" ? r.created_at : undefined,
    updatedAt: typeof r.updated_at === "string" ? r.updated_at : undefined,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FromFn = (t: string) => any;

/** Définition d'UNE entité custom par sa clé (via un `from` de session OU admin). */
export async function getCustomEntityByKey(
  from: FromFn,
  tenantId: string,
  key: string
): Promise<CustomEntityDefinition | null> {
  const k = normalizeEntityKey(key);
  if (!k || ALLOWED_ENTITIES.includes(k) || RESERVED_KEYS.has(k)) return null;
  try {
    const { data } = await from("custom_entities")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("entity_type", k)
      .maybeSingle();
    return data ? rowToDefinition(data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export interface DefValidation {
  ok: boolean;
  errors: string[];
  values: Record<string, unknown>;
}

/**
 * Valide + coerce un payload contre une définition d'entité custom (Phase 3 → B5).
 * `partial` (update) : ne vérifie PAS les requis (payload partiel), coerce seulement
 * les champs fournis. Les clés HORS définition sont CONSERVÉES telles quelles (on ne
 * perd jamais de donnée). Pur, jamais d'exception.
 */
export function validateAgainstDefinition(
  values: Record<string, unknown>,
  def: CustomEntityDefinition,
  opts: { partial?: boolean } = {}
): DefValidation {
  const partial = opts.partial === true;
  const out: Record<string, unknown> = { ...values };
  const errors: string[] = [];
  const byKey = new Map(def.fields.map((f) => [f.key, f]));

  if (!partial) {
    for (const f of def.fields) {
      if (f.required) {
        const v = values[f.key];
        if (v == null || v === "") errors.push(`Champ requis : ${f.label || f.key}`);
      }
    }
  }

  for (const k of Object.keys(values)) {
    const f = byKey.get(k);
    if (!f) continue; // champ hors schéma → conservé tel quel
    const v = values[k];
    if (v == null || v === "") {
      out[k] = null;
      continue;
    }
    if (f.type === "number" || f.type === "currency" || f.type === "percentage") {
      const n = Number(v);
      if (Number.isFinite(n)) out[k] = n;
      else errors.push(`${f.label || f.key} doit être un nombre`);
    } else if (f.type === "boolean") {
      out[k] = v === true || v === "true" || v === 1 || v === "1" || v === "on";
    } else if ((f.type === "select" || f.type === "status") && Array.isArray(f.options) && f.options.length) {
      if (!f.options.includes(String(v))) errors.push(`${f.label || f.key} : valeur non autorisée « ${String(v)} »`);
    }
    // autres types (text/date/relation…) : conservés tels quels
  }

  return { ok: errors.length === 0, errors, values: out };
}

/** Toutes les définitions d'un tenant. Best-effort ([] si table/policy absente). */
export async function listCustomEntities(admin: AdminClient, tenantId: string): Promise<CustomEntityDefinition[]> {
  if (!admin) return [];
  try {
    const { data, error } = await admin
      .from("custom_entities")
      .select("*")
      .eq("tenant_id", tenantId)
      .neq("entity_type", DEF_MARKER)
      .limit(500);
    if (error || !data) return [];
    return (data as Record<string, unknown>[]).map(rowToDefinition).filter((d): d is CustomEntityDefinition => !!d);
  } catch {
    return [];
  }
}

/**
 * Bloc de prompt (B8) : les entités custom DÉJÀ définies dans le workspace, pour
 * que le modèle les RÉUTILISE à la génération (même clé + mêmes champs) au lieu
 * d'en recréer → tue le silo cross-app. "" si aucune. Pur.
 */
export function buildCustomEntityBlock(entities: CustomEntityDefinition[]): string {
  if (!entities.length) return "";
  const lines = entities
    .slice(0, 30)
    .map((e) => {
      const fields = (e.fields ?? [])
        .slice(0, 20)
        .map((f) => `${f.key}:${f.type}${f.required ? "*" : ""}`)
        .join(", ");
      const statuses = e.statuses?.length ? ` ; statuts: ${e.statuses.join("|")}` : "";
      return `- \`${e.key}\`${e.name ? ` (${e.name})` : ""}${fields ? ` — champs: ${fields}` : ""}${statuses}`;
    })
    .join("\n");
  return `# ENTITÉS PERSONNALISÉES DÉJÀ DÉFINIES DANS CE WORKSPACE — RÉUTILISE-LES
Ces collections custom EXISTENT DÉJÀ avec CE schéma. Si ton application gère un concept équivalent (même de loin), RÉUTILISE la clé EXACTE et ses champs via \`window.biltia.create/list('<clé>', …)\` — ne recrée JAMAIS une collection différente pour la même notion (sinon silo, données invisibles au reste de l'entreprise). Respecte les champs requis (marqués \`*\`) et les statuts définis.
${lines}`;
}

/** Enregistre/complète une définition (upsert par tenant+key). Best-effort. */
export async function upsertCustomEntity(
  admin: AdminClient,
  tenantId: string,
  userId: string | null,
  def: CustomEntityDefinition
): Promise<{ created: boolean } | null> {
  if (!admin) return null;
  const key = normalizeEntityKey(def.key);
  if (!key || ALLOWED_ENTITIES.includes(key) || RESERVED_KEYS.has(key)) return null;
  const payload = {
    key,
    description: def.description ?? null,
    aliases: def.aliases ?? [],
    fields: def.fields ?? [],
    relations: def.relations ?? [],
    statuses: def.statuses ?? null,
  };
  try {
    const { data: existing } = await admin
      .from("custom_entities")
      .select("id, data")
      .eq("tenant_id", tenantId)
      .eq("entity_type", key)
      .maybeSingle();
    if (existing?.id) {
      // Enrichit sans écraser : fusionne les champs (union par key), garde le nom.
      const prev = (existing.data && typeof existing.data === "object" ? existing.data : {}) as Record<string, unknown>;
      const prevFields = Array.isArray(prev.fields) ? (prev.fields as CustomFieldDefinition[]) : [];
      const mergedFields = mergeFields(prevFields, def.fields ?? []);
      await admin
        .from("custom_entities")
        .update({
          name: def.name,
          data: { ...payload, fields: mergedFields },
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .eq("tenant_id", tenantId);
      return { created: false };
    }
    await admin.from("custom_entities").insert({
      tenant_id: tenantId,
      entity_type: key,
      name: def.name,
      data: payload,
      created_by: userId,
    });
    return { created: true };
  } catch {
    return null;
  }
}

/** Union de champs par key (l'existant gagne ; les nouveaux enrichissent). */
function mergeFields(prev: CustomFieldDefinition[], next: CustomFieldDefinition[]): CustomFieldDefinition[] {
  const byKey = new Map<string, CustomFieldDefinition>();
  for (const f of prev) byKey.set(f.key, f);
  for (const f of next) if (!byKey.has(f.key)) byKey.set(f.key, f);
  return [...byKey.values()].slice(0, 80);
}

export interface RegisterOutcome {
  registered: string[]; // nouvelles définitions créées
  reused: string[]; // définitions/entités déjà existantes réutilisées
  skippedCanonical: string[]; // rejetées car couvertes par une entité canonique
}

/**
 * Enregistre les entités custom d'une app (dédupliquées). `declared` = définitions
 * riches du modèle ; `derivedKeys` = collections libres détectées dans le HTML
 * (schéma inféré). Best-effort, jamais bloquant.
 */
export async function registerCustomEntities(
  admin: AdminClient,
  tenantId: string,
  userId: string | null,
  declared: CustomEntityDefinition[],
  derivedKeys: string[]
): Promise<RegisterOutcome> {
  const out: RegisterOutcome = { registered: [], reused: [], skippedCanonical: [] };
  if (!admin) return out;

  const existing = await listCustomEntities(admin, tenantId);
  const byKey = new Map<string, CustomEntityDefinition>();
  for (const d of declared) byKey.set(normalizeEntityKey(d.key), d);
  // Collections dérivées sans définition déclarée → schéma minimal inféré.
  for (const k of derivedKeys) {
    const nk = normalizeEntityKey(k);
    if (!byKey.has(nk)) byKey.set(nk, { key: nk, name: humanLabel(nk), aliases: [], fields: [], relations: [] });
  }

  const liveExisting = [...existing];
  for (const def of byKey.values()) {
    const sim = findSimilarEntity(def.key, def.name, liveExisting);
    if (sim.kind === "canonical") {
      out.skippedCanonical.push(def.key);
      continue;
    }
    if (sim.kind === "custom") {
      // Réutilise ET enrichit la définition existante (nouveaux champs déclarés).
      if (def.fields.length) await upsertCustomEntity(admin, tenantId, userId, { ...def, key: sim.key! });
      out.reused.push(sim.key!);
      continue;
    }
    const res = await upsertCustomEntity(admin, tenantId, userId, def);
    if (res?.created) {
      out.registered.push(def.key);
      liveExisting.push(def); // évite un doublon dans le même lot
    } else if (res) {
      out.reused.push(def.key);
    }
  }
  return out;
}
