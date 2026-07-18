// ─────────────────────────────────────────────────────────────────────────────
// RECHERCHE CANONIQUE DU WORKSPACE — retrouver un objet par nom/référence/adresse,
// tolérant aux accents et aux petites fautes, avec résolution d'ambiguïté.
//
// « Retrouve le chantier Dupont », « la facture FAC-2026-004 », « Karim »,
// « le chantier Dupon » (faute) → l'agent identifie le BON objet, ou demande
// lequel quand c'est ambigu, sans jamais choisir au hasard ni inventer.
//
// SÉCURITÉ (mêmes remparts que les autres outils) :
//   • Registre CANONIQUE typé (SEARCH_SPECS) = seule source des tables/colonnes.
//   • Le LLM ne fournit NI table, NI colonne, NI SQL brut — juste `query`/`entity`.
//   • tenant_id TOUJOURS forcé côté serveur (`.eq("tenant_id", …)`).
//   • Le résultat n'expose QUE de quoi identifier l'objet — jamais la ligne
//     complète, jamais un champ sensible (contenu de message, email/tél de
//     signataire, notes libres…).
//
// Module PUR (aucun import de valeur locale / SDK) → chargeable par `node --test`.
// La montée en charge est bornée (voir CAPS + le rapport de performance).
// ─────────────────────────────────────────────────────────────────────────────

export type SearchResolution = "unique" | "ambiguous" | "not_found";

export type SearchMatchType =
  | "id_exact"
  | "reference_exact"
  | "label_exact"
  | "prefix"
  | "contains"
  | "secondary"
  | "fuzzy";

export interface RelationHint {
  entity: string;
  id: string;
  label?: string;
}

export interface WorkspaceSearchResult {
  entity: string;
  id: string;
  label: string;
  secondaryLabel?: string;
  reference?: string;
  matchType: SearchMatchType;
  score: number;
  matchedFields: string[];
  relationHints?: RelationHint[];
}

export interface WorkspaceSearchResponse {
  query: string;
  entity?: string;
  resolution: SearchResolution;
  count: number;
  results: WorkspaceSearchResult[];
}

export interface WorkspaceSearchInput {
  query: string;
  entity?: string;
  limit?: number;
}

/** Définition CANONIQUE de recherche d'une entité. Seule source de vérité. */
export interface EntitySearchSpec {
  entity: string;
  table: string;
  /** Champs de LIBELLÉ (nom/désignation…) : exact / préfixe / contient / fuzzy. */
  primaryFields: string[];
  /** Champs de RÉFÉRENCE (numéro / référence) : correspondance exacte prioritaire. */
  referenceFields: string[];
  /** Champs SECONDAIRES (contient seulement, score plus bas). */
  secondaryFields: string[];
  /** Colonnes composant le libellé affiché. */
  labelFrom: string[];
  /** Colonnes composant le sous-libellé (contexte : ville, statut…). */
  secondaryFrom: string[];
  /** Colonnes réellement lues (jamais « * » : pas de champ sensible superflu). */
  selectFields: string[];
  /** Relations utiles (FK → entité) pour rendre le résultat identifiable. */
  relations: { field: string; entity: string }[];
  /** Inclus quand aucune entité n'est précisée. */
  inDefaultSet: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MinimalDb = { from: (table: string) => any };

// ── CAPS (bornes de charge — voir rapport de performance) ────────────────────
const TARGETED_CAP = 20; // lignes par champ ciblé (ilike serveur)
const RECENT_CAP = 50; //   fenêtre récente pour la tolérance aux fautes (par entité)
const HARD_CAP = 80; //     candidats max chargés en mémoire par entité
const MIN_SCORE = 0.5; //   plancher pour retenir un candidat
const FUZZY_THRESHOLD = 0.8; // similarité min pour une correspondance approximative
const CONFIDENT = 0.85; //  score « fiable » (préfixe ou mieux) pour trancher « unique » à plusieurs
const AMBIG_GAP = 0.12; //  écart min entre #1 et #2 pour trancher « unique »
const SINGLE_FLOOR = 0.65; // un SEUL résultat : « unique » si ≥ contient ; une simple
//                            correspondance approximative (fuzzy < 0.65) reste « ambiguous »
//                            (confirmation demandée — jamais d'action auto sur une faute).

// ── Registre (helper de construction) ────────────────────────────────────────
function uniq(arr: string[]): string[] {
  return Array.from(new Set(arr.filter(Boolean)));
}
function spec(
  entity: string,
  table: string,
  o: {
    primary?: string[];
    reference?: string[];
    secondary?: string[];
    labelFrom?: string[];
    secondaryFrom?: string[];
    relations?: { field: string; entity: string }[];
    inDefaultSet?: boolean;
  }
): EntitySearchSpec {
  const primaryFields = o.primary ?? [];
  const referenceFields = o.reference ?? [];
  const secondaryFields = o.secondary ?? [];
  const labelFrom = o.labelFrom ?? (primaryFields.length ? [primaryFields[0]] : []);
  const secondaryFrom = o.secondaryFrom ?? [];
  const relations = o.relations ?? [];
  const selectFields = uniq([
    "id",
    "created_at",
    ...primaryFields,
    ...referenceFields,
    ...secondaryFields,
    ...labelFrom,
    ...secondaryFrom,
    ...relations.map((r) => r.field),
  ]);
  return { entity, table, primaryFields, referenceFields, secondaryFields, labelFrom, secondaryFrom, selectFields, relations, inDefaultSet: o.inDefaultSet ?? true };
}

const R = (field: string, entity: string) => ({ field, entity });

/** LE REGISTRE — colonnes RÉELLES (auditées sur lib/data-entities.ts). */
export const SEARCH_SPECS: Record<string, EntitySearchSpec> = {
  chantiers: spec("chantiers", "chantiers", { primary: ["nom"], secondary: ["adresse", "ville", "description"], secondaryFrom: ["ville", "statut"], relations: [R("client_id", "clients"), R("chef_chantier_id", "employees"), R("site_id", "sites")] }),
  clients: spec("clients", "clients", { primary: ["nom"], reference: ["siret"], secondary: ["email", "tel", "ville"], secondaryFrom: ["ville", "type"] }),
  employees: spec("employees", "employees", { primary: ["nom", "prenom"], secondary: ["role", "corps_metier", "email", "tel"], labelFrom: ["prenom", "nom"], secondaryFrom: ["role", "corps_metier"] }),
  documents: spec("documents", "documents", { primary: ["nom"], secondary: ["type"], secondaryFrom: ["type", "statut"], relations: [R("chantier_id", "chantiers"), R("client_id", "clients")] }),
  materials: spec("materials", "materials", { primary: ["nom"], reference: ["reference"], secondary: ["categorie"], secondaryFrom: ["reference", "statut"], relations: [R("chantier_id", "chantiers"), R("fournisseur_id", "suppliers")] }),
  suppliers: spec("suppliers", "suppliers", { primary: ["nom"], reference: ["siret"], secondary: ["specialite", "categorie", "email", "ville"], secondaryFrom: ["categorie", "specialite"] }),
  equipment: spec("equipment", "equipment", { primary: ["nom"], reference: ["reference", "numero_serie"], secondary: ["type", "marque"], secondaryFrom: ["marque", "statut"], relations: [R("chantier_id", "chantiers")] }),
  interventions: spec("interventions", "interventions", { primary: ["type"], secondary: ["description", "rapport"], labelFrom: ["type"], secondaryFrom: ["statut"], relations: [R("chantier_id", "chantiers"), R("client_id", "clients"), R("employee_id", "employees"), R("supplier_id", "suppliers")] }),
  tasks: spec("tasks", "tasks", { primary: ["title"], secondary: ["description"], labelFrom: ["title"], secondaryFrom: ["status"], relations: [R("chantier_id", "chantiers"), R("assignee_id", "employees")] }),
  catalogue: spec("catalogue", "catalogue", { primary: ["designation"], reference: ["reference"], secondary: ["aliases", "mots_cles", "marque", "modele"], secondaryFrom: ["reference", "type"], relations: [R("fournisseur_id", "suppliers")] }),
  catalogue_composants: spec("catalogue_composants", "catalogue_composants", { relations: [R("ouvrage_id", "catalogue"), R("composant_id", "catalogue")], inDefaultSet: false }),
  devis: spec("devis", "devis", { primary: ["numero"], reference: ["numero"], secondary: ["notes"], secondaryFrom: ["statut"], relations: [R("client_id", "clients"), R("chantier_id", "chantiers")] }),
  factures: spec("factures", "factures", { primary: ["numero"], reference: ["numero"], secondary: ["notes"], secondaryFrom: ["statut", "type"], relations: [R("client_id", "clients"), R("chantier_id", "chantiers"), R("devis_id", "devis")] }),
  lignes: spec("lignes", "lignes", { primary: ["designation"], relations: [R("devis_id", "devis"), R("facture_id", "factures")], inDefaultSet: false }),
  pointages: spec("pointages", "pointages", { labelFrom: ["date_pointage"], relations: [R("employee_id", "employees"), R("chantier_id", "chantiers")], inDefaultSet: false }),
  // ── Entités jadis CASSÉES (colonne « nom » inexistante → corrigées) ──────────
  contrats: spec("contrats", "contrats", { primary: ["reference"], reference: ["reference"], secondary: ["type"], secondaryFrom: ["type", "statut"], relations: [R("client_id", "clients"), R("parc_id", "parc_installe")] }),
  parc_installe: spec("parc_installe", "parc_installe", { primary: ["type", "marque", "modele"], reference: ["numero_serie"], secondary: ["localisation"], labelFrom: ["type", "marque", "modele"], secondaryFrom: ["localisation"], relations: [R("client_id", "clients"), R("chantier_id", "chantiers")] }),
  sites: spec("sites", "sites", { primary: ["nom"], secondary: ["adresse", "ville"], secondaryFrom: ["ville", "type"], relations: [R("client_id", "clients")] }),
  demandes: spec("demandes", "demandes", { primary: ["titre"], secondary: ["description"], labelFrom: ["titre"], secondaryFrom: ["type", "statut"], relations: [R("client_id", "clients"), R("site_id", "sites")] }),
  commandes: spec("commandes", "commandes", { primary: ["numero"], reference: ["numero"], secondaryFrom: ["statut"], relations: [R("fournisseur_id", "suppliers"), R("chantier_id", "chantiers")] }),
  depenses: spec("depenses", "depenses", { primary: ["numero"], reference: ["numero"], secondary: ["categorie"], secondaryFrom: ["categorie", "statut"], relations: [R("fournisseur_id", "suppliers"), R("chantier_id", "chantiers")] }),
  paiements: spec("paiements", "paiements", { primary: ["reference"], reference: ["reference"], secondary: ["methode"], secondaryFrom: ["methode", "statut"], relations: [R("facture_id", "factures"), R("client_id", "clients")] }),
  reserves: spec("reserves", "reserves", { primary: ["titre"], secondary: ["description", "type"], labelFrom: ["titre"], secondaryFrom: ["gravite", "statut"], relations: [R("chantier_id", "chantiers"), R("client_id", "clients"), R("assignee_id", "employees")] }),
  lots: spec("lots", "lots", { primary: ["nom"], secondary: ["type"], secondaryFrom: ["type", "statut"], relations: [R("chantier_id", "chantiers"), R("assignee_id", "employees")] }),
  rappels: spec("rappels", "rappels", { primary: ["titre"], secondary: ["type"], labelFrom: ["titre"], secondaryFrom: ["type", "statut"], relations: [R("client_id", "clients"), R("chantier_id", "chantiers")] }),
  // messages.corps / notes.contenu : recherchés (secondary) mais JAMAIS renvoyés.
  messages: spec("messages", "messages", { primary: ["objet"], secondary: ["corps", "destinataire", "expediteur"], labelFrom: ["objet"], secondaryFrom: ["canal", "direction"], relations: [R("client_id", "clients"), R("chantier_id", "chantiers")] }),
  notes: spec("notes", "notes", { primary: ["titre"], secondary: ["contenu"], labelFrom: ["titre"], secondaryFrom: ["source"], relations: [R("chantier_id", "chantiers"), R("client_id", "clients")] }),
  // validations : signataire_nom recherché ; email/tél du signataire NON lus.
  validations: spec("validations", "validations", { primary: ["signataire_nom"], secondary: ["type"], labelFrom: ["type", "signataire_nom"], secondaryFrom: ["statut"], relations: [R("devis_id", "devis"), R("client_id", "clients")] }),
};

/** Colonne de recherche texte CANONIQUE d'une entité (partagée avec workspace_list).
 *  `null` = entité sans champ texte pertinent → workspace_list ne fait pas d'ilike. */
export function searchColumnFor(entity: string): string | null {
  const s = SEARCH_SPECS[entity];
  if (!s) return null;
  return s.primaryFields[0] ?? s.referenceFields[0] ?? null;
}

/** Entités balayées quand aucune n'est précisée (ensemble raisonnable). */
export const DEFAULT_SEARCH_ENTITIES = Object.values(SEARCH_SPECS)
  .filter((s) => s.inDefaultSet)
  .map((s) => s.entity);

// ── Normalisation & similarité (PURES, exportées pour les tests) ─────────────

/** minuscule + sans accents + apostrophes/tirets/ponctuation → espaces + compact. */
export function normalizeText(input: unknown): string {
  const s = fieldToString(input);
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // accents
    .replace(/[''`´]/g, " ") // apostrophes
    .replace(/[-_.,;:!?/\\()[\]{}"]/g, " ") // tirets + ponctuation simple
    .replace(/\s+/g, " ")
    .trim();
}

/** Champ → chaîne (tableau joint par espace). */
export function fieldToString(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map((x) => (x == null ? "" : String(x))).join(" ");
  return String(v);
}

const ENTITY_ALIASES: Record<string, string[]> = {
  chantiers: ["chantier", "chantiers"],
  clients: ["client", "cliente", "clients"],
  devis: ["devis"],
  factures: ["facture", "factures"],
  interventions: ["intervention", "interventions", "sav"],
  tasks: ["tache", "taches"],
  suppliers: ["fournisseur", "fournisseurs", "sous traitant"],
  employees: ["employe", "employes", "salarie", "compagnon"],
  demandes: ["demande", "demandes"],
  commandes: ["commande", "commandes"],
  depenses: ["depense", "depenses"],
  paiements: ["paiement", "paiements", "encaissement"],
  reserves: ["reserve", "reserves"],
  documents: ["document", "documents"],
  contrats: ["contrat", "contrats"],
  materials: ["materiel", "materiels", "materiau", "materiaux"],
  sites: ["site", "sites", "adresse"],
  lots: ["lot", "lots"],
  rappels: ["rappel", "rappels"],
  messages: ["message", "messages"],
  notes: ["note", "notes"],
};

/** Retire un préfixe d'entité en tête (« chantier Dupont » → « dupont »). */
export function stripEntityPrefix(normalizedQuery: string, entity: string): string {
  const aliases = ENTITY_ALIASES[entity];
  if (!aliases) return normalizedQuery;
  for (const a of aliases) {
    if (normalizedQuery === a) return normalizedQuery; // « chantier » seul : ne pas vider
    if (normalizedQuery.startsWith(a + " ")) return normalizedQuery.slice(a.length + 1).trim();
  }
  return normalizedQuery;
}

/** Distance de Levenshtein (bornée par la taille des chaînes ; O(n·m)). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + cost);
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** Similarité 0→1 (1 = identique). */
export function similarity(a: string, b: string): number {
  if (!a && !b) return 1;
  const max = Math.max(a.length, b.length);
  if (!max) return 1;
  return 1 - levenshtein(a, b) / max;
}

/** Meilleure similarité de `q` contre la chaîne entière ET chacun de ses mots. */
function bestTokenSimilarity(q: string, field: string): number {
  let best = similarity(q, field);
  for (const tok of field.split(" ")) if (tok) best = Math.max(best, similarity(q, tok));
  return best;
}

// ── Scoring d'un candidat (PUR) ──────────────────────────────────────────────

function normFields(fields: string[], row: Record<string, unknown>): { field: string; value: string }[] {
  return fields.map((f) => ({ field: f, value: normalizeText(row[f]) })).filter((x) => x.value);
}

/** Meilleur type/score de correspondance d'un candidat, ou null si aucun. */
export function scoreCandidate(
  spec: EntitySearchSpec,
  nq: string,
  rawQuery: string,
  row: Record<string, unknown>
): { matchType: SearchMatchType; score: number; matchedFields: string[] } | null {
  const id = typeof row.id === "string" ? row.id : "";
  if (id && (id === rawQuery.trim() || id === nq)) return { matchType: "id_exact", score: 1, matchedFields: ["id"] };

  // Référence exacte (numéro/référence normalisé).
  for (const { field, value } of normFields(spec.referenceFields, row)) {
    if (value === nq) return { matchType: "reference_exact", score: 0.98, matchedFields: [field] };
  }
  // Libellé : exact > préfixe > contient.
  let best: { matchType: SearchMatchType; score: number; matchedFields: string[] } | null = null;
  const better = (c: typeof best) => {
    if (c && (!best || c.score > best.score)) best = c;
  };
  for (const { field, value } of normFields(spec.primaryFields, row)) {
    if (value === nq) better({ matchType: "label_exact", score: 0.95, matchedFields: [field] });
    else if (nq.length >= 2 && value.startsWith(nq)) better({ matchType: "prefix", score: 0.85, matchedFields: [field] });
    else if (nq.length >= 2 && value.includes(nq)) better({ matchType: "contains", score: 0.7, matchedFields: [field] });
  }
  // Référence partielle (« 2026-004 »).
  for (const { field, value } of normFields(spec.referenceFields, row)) {
    if (nq.length >= 2 && value.includes(nq)) better({ matchType: "contains", score: 0.72, matchedFields: [field] });
  }
  if (best) return best;
  // Champs secondaires (contient seulement).
  for (const { field, value } of normFields(spec.secondaryFields, row)) {
    if (nq.length >= 2 && value.includes(nq)) better({ matchType: "secondary", score: 0.55, matchedFields: [field] });
  }
  if (best) return best;
  // Correspondance approximative (petite faute) sur les champs de libellé.
  let bestSim = 0;
  let fuzzyField = "";
  for (const { field, value } of normFields(spec.primaryFields, row)) {
    const sim = bestTokenSimilarity(nq, value);
    if (sim > bestSim) {
      bestSim = sim;
      fuzzyField = field;
    }
  }
  if (bestSim >= FUZZY_THRESHOLD && nq.length >= 3) {
    // score borné dans [0.5, 0.65) → toujours SOUS un « contains », donc jamais
    // tranché « unique » sans confirmation.
    const score = 0.5 + (bestSim - FUZZY_THRESHOLD) * (0.15 / (1 - FUZZY_THRESHOLD));
    return { matchType: "fuzzy", score: Math.min(score, 0.649), matchedFields: [fuzzyField] };
  }
  return null;
}

// ── Construction du résultat (PUR) ───────────────────────────────────────────

function joinFrom(fields: string[], row: Record<string, unknown>, sep: string): string {
  return fields
    .map((f) => fieldToString(row[f]).trim())
    .filter(Boolean)
    .join(sep);
}

export function buildLabel(spec: EntitySearchSpec, row: Record<string, unknown>): string {
  const l = joinFrom(spec.labelFrom, row, " ");
  if (l) return l.slice(0, 120);
  const id = typeof row.id === "string" ? row.id.slice(0, 8) : "";
  return `${spec.entity} #${id}`;
}

function buildRelationHints(spec: EntitySearchSpec, row: Record<string, unknown>): RelationHint[] | undefined {
  const hints: RelationHint[] = [];
  for (const rel of spec.relations) {
    const v = row[rel.field];
    if (typeof v === "string" && v) hints.push({ entity: rel.entity, id: v });
  }
  return hints.length ? hints : undefined;
}

function toResult(spec: EntitySearchSpec, row: Record<string, unknown>, sc: { matchType: SearchMatchType; score: number; matchedFields: string[] }): WorkspaceSearchResult {
  const ref = spec.referenceFields.map((f) => fieldToString(row[f]).trim()).find(Boolean);
  const secondary = joinFrom(spec.secondaryFrom, row, " · ");
  return {
    entity: spec.entity,
    id: String(row.id),
    label: buildLabel(spec, row),
    secondaryLabel: secondary || undefined,
    reference: ref || undefined,
    matchType: sc.matchType,
    score: Math.round(sc.score * 1000) / 1000,
    matchedFields: sc.matchedFields,
    relationHints: buildRelationHints(spec, row),
  };
}

/** Résolution déterministe (§8). */
export function resolveResolution(ranked: WorkspaceSearchResult[]): SearchResolution {
  if (!ranked.length) return "not_found";
  const top = ranked[0];
  // Un seul candidat : fiable dès un « contient » ; une simple faute (fuzzy) reste
  // à confirmer.
  if (ranked.length === 1) return top.score >= SINGLE_FLOOR ? "unique" : "ambiguous";
  // Plusieurs candidats : « unique » seulement si le 1er est fiable (préfixe/exact)
  // ET nettement devant le 2e ; sinon on demande lequel.
  const gap = top.score - ranked[1].score;
  return top.score >= CONFIDENT && gap >= AMBIG_GAP ? "unique" : "ambiguous";
}

// ── Accès données (IO tolérant, bornés) ──────────────────────────────────────

async function safeQuery<T>(fn: () => Promise<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  try {
    const { data, error } = await fn();
    if (error) return [];
    return (data as T[]) ?? [];
  } catch {
    return [];
  }
}

async function fetchCandidates(
  db: MinimalDb,
  tenantId: string,
  spec: EntitySearchSpec,
  rawQuery: string,
  withFuzzyWindow: boolean
): Promise<Record<string, unknown>[]> {
  const seen = new Set<string>();
  const out: Record<string, unknown>[] = [];
  const select = spec.selectFields.join(", ");
  const add = (rows: Record<string, unknown>[]) => {
    for (const r of rows) {
      const id = typeof r?.id === "string" ? r.id : "";
      if (id && !seen.has(id) && out.length < HARD_CAP) {
        seen.add(id);
        out.push(r);
      }
    }
  };

  // 1. Ciblé serveur (ilike) sur libellé + référence → exact/préfixe/contient à
  //    l'échelle (même sur un objet ancien). Les champs tableau (aliases) rejettent
  //    l'ilike → safeQuery renvoie [] et on retombe sur la fenêtre récente.
  const targeted = uniq([...spec.primaryFields, ...spec.referenceFields]);
  for (const field of targeted) {
    if (out.length >= HARD_CAP) break;
    const rows = await safeQuery<Record<string, unknown>>(() =>
      db.from(spec.table).select(select).eq("tenant_id", tenantId).ilike(field, `%${rawQuery}%`).limit(TARGETED_CAP)
    );
    add(rows);
  }

  // 2. Fenêtre récente (tolérance aux fautes / accents / secondaires) — bornée,
  //    UNIQUEMENT quand une entité est ciblée (une recherche multi-entités reste
  //    sur le ciblé serveur pour ne pas exploser la charge).
  if (withFuzzyWindow && out.length < HARD_CAP) {
    const rows = await safeQuery<Record<string, unknown>>(() =>
      db.from(spec.table).select(select).eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(RECENT_CAP)
    );
    if (rows.length) add(rows);
    else {
      const fallback = await safeQuery<Record<string, unknown>>(() => db.from(spec.table).select(select).eq("tenant_id", tenantId).limit(RECENT_CAP));
      add(fallback);
    }
  }
  return out;
}

/** Résout le libellé des relations des résultats renvoyés (borné : ≤ résultats). */
async function resolveRelationLabels(db: MinimalDb, tenantId: string, results: WorkspaceSearchResult[]): Promise<void> {
  const byEntity = new Map<string, Set<string>>();
  for (const r of results) for (const h of r.relationHints ?? []) {
    if (!byEntity.has(h.entity)) byEntity.set(h.entity, new Set());
    byEntity.get(h.entity)!.add(h.id);
  }
  for (const [entity, ids] of byEntity) {
    const s = SEARCH_SPECS[entity];
    if (!s || !s.labelFrom.length) continue;
    const select = uniq(["id", ...s.labelFrom]).join(", ");
    const rows = await safeQuery<Record<string, unknown>>(() => db.from(s.table).select(select).eq("tenant_id", tenantId).in("id", Array.from(ids)));
    const map = new Map<string, string>();
    for (const row of rows) if (typeof row.id === "string") map.set(row.id, buildLabel(s, row));
    for (const r of results) for (const h of r.relationHints ?? []) if (h.entity === entity && map.has(h.id)) h.label = map.get(h.id);
  }
}

/**
 * Recherche canonique. Tenant FORCÉ (`tenantId` serveur). Le modèle ne fournit
 * que query/entity/limit — jamais table/colonne/SQL. Résultats bornés + résolution.
 */
export async function searchWorkspace(db: MinimalDb, tenantId: string, input: WorkspaceSearchInput): Promise<WorkspaceSearchResponse> {
  const query = (input.query ?? "").trim();
  const entity = input.entity && SEARCH_SPECS[input.entity] ? input.entity : undefined;
  const limit = Math.min(Math.max(Number(input.limit) || 5, 1), 20);
  if (!query) return { query, entity, resolution: "not_found", count: 0, results: [] };

  const nqFull = normalizeText(query);
  const targets = entity ? [entity] : DEFAULT_SEARCH_ENTITIES;
  const singleEntity = !!entity;

  const scored: WorkspaceSearchResult[] = [];
  for (const e of targets) {
    const s = SEARCH_SPECS[e];
    if (!s || (!s.primaryFields.length && !s.referenceFields.length)) continue; // rien de textuel
    const nq = stripEntityPrefix(nqFull, e);
    if (!nq) continue;
    const rows = await fetchCandidates(db, tenantId, s, query, singleEntity);
    for (const row of rows) {
      const sc = scoreCandidate(s, nq, query, row);
      if (sc && sc.score >= MIN_SCORE) scored.push(toResult(s, row, sc));
    }
  }

  scored.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  const results = scored.slice(0, limit);
  await resolveRelationLabels(db, tenantId, results);
  return { query, entity, resolution: resolveResolution(results), count: results.length, results };
}

// ── Projection pour le modèle + tool ─────────────────────────────────────────

const RESOLUTION_NOTE: Record<SearchResolution, string> = {
  unique: "Un seul objet fiable identifié. Tu peux agir dessus (workspace_get ou l'action demandée). Cite son label pour confirmer.",
  ambiguous:
    "Plusieurs objets plausibles OU confiance insuffisante. NE choisis PAS tout seul : demande à l'utilisateur lequel, en citant label + details (+ related).",
  not_found: "Aucun objet trouvé pour cette recherche. Signale-le honnêtement ; ne l'invente pas, ne devine pas d'id.",
};

/** Sortie compacte au modèle (que de quoi identifier — jamais la ligne complète). */
export function formatSearchForModel(resp: WorkspaceSearchResponse): Record<string, unknown> {
  return {
    resolution: resp.resolution,
    count: resp.count,
    results: resp.results.map((r) => ({
      entity: r.entity,
      id: r.id,
      label: r.label,
      ...(r.secondaryLabel ? { details: r.secondaryLabel } : {}),
      ...(r.reference ? { reference: r.reference } : {}),
      match: r.matchType,
      score: r.score,
      ...(r.relationHints?.length
        ? { related: r.relationHints.map((h) => ({ entity: h.entity, id: h.id, ...(h.label ? { label: h.label } : {}) })) }
        : {}),
    })),
    note: RESOLUTION_NOTE[resp.resolution],
  };
}

/** Schéma du tool (objet nu, sans SDK → testable). Aucun accès table/colonne SQL. */
export const WORKSPACE_SEARCH_TOOL = {
  name: "workspace_search",
  description:
    "Retrouve un objet du workspace désigné par un NOM, une RÉFÉRENCE, une adresse ou une formulation naturelle (« le chantier Dupont », « la facture FAC-2026-004 », « Karim », « le chantier Dupon » avec une faute). Tolère casse, accents, tirets et petites fautes. `entity` (optionnel) restreint la catégorie. Réponse : `resolution` = unique | ambiguous | not_found. Si ambiguous, NE choisis PAS : demande à l'utilisateur lequel. Préfère cet outil à workspace_list quand l'utilisateur DÉSIGNE un objet ; garde workspace_list pour filtrer/lister par statut ou relation.",
  input_schema: {
    type: "object" as const,
    properties: {
      query: { type: "string" as const, description: "Le texte désignant l'objet (nom, numéro, référence, adresse…)." },
      entity: {
        type: "string" as const,
        description: "Catégorie où chercher (optionnel). Ex : chantiers, clients, devis, factures, interventions, tasks, suppliers, employees…",
      },
      limit: { type: "integer" as const, description: "Nombre max de résultats (défaut 5, max 20)." },
    },
    required: ["query"] as const,
    additionalProperties: false as const,
  },
};
