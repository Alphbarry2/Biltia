// ─────────────────────────────────────────────────────────────────────────────
// VÉRIFICATION POST-ACTION — « outil appelé » ≠ « mission vérifiée ».
//
// Après CHAQUE écriture d'un outil d'agent (create/update/delete/transform/
// avenant, + envois email/SMS), on RELIT la source officielle et on COMPARE
// DÉTERMINISTIQUEMENT l'état obtenu à l'intention. Aucune vérification par LLM :
// du code pur + une relecture ciblée. Le résultat est renvoyé AU MODÈLE dans le
// tool_result, et un mismatch/échec INTERDIT de présenter l'action comme faite.
//
// Ce module est VOLONTAIREMENT sans dépendance locale à l'exécution (pas d'import
// de valeur `@/…`) : il reste chargeable tel quel par le runner de tests
// (`node --test --experimental-strip-types`). Les briques serveur dont il a besoin
// — le calcul déterministe des montants (lib/devis-amounts.ts) et le schéma des
// entités (table/colonnes) — lui sont INJECTÉES par l'appelant (lib/agent-tools.ts),
// pour ne JAMAIS dupliquer la logique métier.
// ─────────────────────────────────────────────────────────────────────────────

import type { DevisLineInput, ComputedLine, DevisTotals } from "./devis-amounts";

// ── Types publics ────────────────────────────────────────────────────────────

export type VerificationStatus =
  | "verified" //        l'état enregistré correspond à la demande
  | "mismatch" //        l'objet existe mais ne correspond pas (ou n'existe plus/pas)
  | "not_verifiable" //  action acceptée mais non confirmable (ex : envoi accepté, livraison ?)
  | "failed"; //         la vérification elle-même a échoué (lecture impossible, id absent…)

export interface FieldMismatch {
  field: string;
  expected: unknown;
  observed: unknown;
}

export interface ActionVerification {
  status: VerificationStatus;
  toolName: string;
  entity?: string;
  objectId?: string;
  expected?: Record<string, unknown>;
  observed?: Record<string, unknown>;
  mismatches?: FieldMismatch[];
  reason?: string;
  verifiedAt: string;
}

export type VerificationEventType =
  | "tool_started"
  | "tool_succeeded"
  | "verification_started"
  | "verification_verified"
  | "verification_mismatch"
  | "verification_failed"
  | "verification_not_verifiable"
  | "verification_blocked";

export interface VerificationEvent {
  type: VerificationEventType;
  toolName: string;
  target?: string;
}

// Client base minimal (session RLS ou service_role) — même motif que lib/agent-tools.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MinimalClient = { from: (table: string) => any };

/** Fonctions de calcul déterministe injectées (lib/devis-amounts.ts). */
export interface AmountDeps {
  computeLines?: (lines: DevisLineInput[]) => ComputedLine[];
  computeTotals?: (lines: ComputedLine[]) => DevisTotals;
}

export interface VerifyDeps extends AmountDeps {
  /** Horloge injectable pour des tests déterministes. */
  now?: () => string;
}

export interface VerifyRequest {
  toolName: string;
  input: Record<string, unknown>;
  /** Le résultat renvoyé par l'outil (contient `ok`, `row`, `deleted`…). */
  result: Record<string, unknown>;
  /** Table à relire (create/update/delete) — fournie par l'appelant via ENTITIES. */
  table?: string;
  /** Colonnes comparables (create/update) — writable de l'entité. */
  writable?: string[];
  /** Table produite par une transformation — fournie via TRANSFORM_TARGET. */
  targetTable?: string;
}

// ── Outils vérifiables ───────────────────────────────────────────────────────

export const VERIFIABLE_WRITE_TOOLS = new Set<string>([
  "workspace_create",
  "workspace_update",
  "workspace_delete",
  "workspace_transform",
  "create_avenant",
  "send_email",
  "send_sms",
]);

export function isVerifiableWrite(toolName: string): boolean {
  return VERIFIABLE_WRITE_TOOLS.has(toolName);
}

/**
 * Clé de CIBLE d'une écriture, pour borner les tentatives correctives (au plus
 * UNE re-tentative par fiche et par passage). `null` quand la cible n'est pas
 * identifiable AVANT exécution (création : l'id n'existe pas encore).
 */
export function targetKey(toolName: string, input: Record<string, unknown>): string | null {
  const s = (v: unknown) => (v == null ? "" : String(v));
  if (toolName === "workspace_update" || toolName === "workspace_delete") {
    const e = s(input.entity);
    const id = s(input.id);
    return e && id ? `${e}:${id}` : null;
  }
  if (toolName === "workspace_transform") {
    const a = s(input.action);
    const src = s(input.source_id ?? input.sourceId);
    return a && src ? `transform:${a}:${src}` : null;
  }
  if (toolName === "create_avenant") {
    const d = s(input.devis_id ?? input.devisId);
    return d ? `avenant:${d}` : null;
  }
  return null;
}

/** Clé de cible APRÈS exécution (l'id de l'objet touché/produit est connu). */
export function resultTargetKey(v: ActionVerification): string | null {
  if (v.entity && v.objectId) return `${v.entity}:${v.objectId}`;
  return null;
}

/**
 * Le budget de correction est-il épuisé pour cette cible ? Vrai quand l'écriture
 * d'origine ET la (ou les) correction(s) autorisée(s) ont été consommées et que
 * la fiche reste NON conforme. Une fois « verified », plus rien ne bloque.
 */
export function isCorrectionBudgetExhausted(
  state: { attempts: number; lastStatus: VerificationStatus } | undefined,
  maxCorrectionAttempts: number
): boolean {
  return !!state && state.attempts > maxCorrectionAttempts && state.lastStatus !== "verified";
}

export function statusToEvent(status: VerificationStatus): VerificationEventType {
  switch (status) {
    case "verified":
      return "verification_verified";
    case "mismatch":
      return "verification_mismatch";
    case "not_verifiable":
      return "verification_not_verifiable";
    default:
      return "verification_failed";
  }
}

// ── Comparaison déterministe (PURE, exportée pour les tests) ──────────────────

export function isEmpty(v: unknown): boolean {
  return v == null || (typeof v === "string" && v.trim() === "");
}

function asBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

function asNum(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

function isDateStr(v: unknown): boolean {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}([T ].*)?$/.test(v.trim());
}

function dayOf(v: unknown): string | null {
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * Égalité métier tolérante : gère vide/null, booléens, nombres (tolérance 0,01
 * pour la monnaie), dates (comparées au jour), et sinon chaîne (trim). Un « " " »
 * et `null` sont équivalents (miroir du `sanitize` de l'écriture).
 */
export function valuesEqual(expected: unknown, observed: unknown, moneyEps = 0.01): boolean {
  if (isEmpty(expected) && isEmpty(observed)) return true;
  if (isEmpty(expected) !== isEmpty(observed)) return false;

  const be = asBool(expected);
  const bo = asBool(observed);
  if (be !== null && bo !== null) return be === bo;

  // Dates AVANT nombres (une date ISO n'est pas un nombre).
  if (isDateStr(expected) && isDateStr(observed)) {
    const de = dayOf(expected);
    const dobs = dayOf(observed);
    if (de && dobs) return de === dobs;
  }

  const ne = asNum(expected);
  const no = asNum(observed);
  if (ne !== null && no !== null) return Math.abs(ne - no) <= moneyEps;

  return String(expected).trim() === String(observed).trim();
}

/**
 * Compare les champs DEMANDÉS (présents dans `expected` ET dans la liste
 * comparable) à l'objet relu. Applique le même « "" → null » que l'écriture.
 */
export function compareFields(
  expected: Record<string, unknown>,
  observed: Record<string, unknown> | null,
  fields: string[]
): FieldMismatch[] {
  const out: FieldMismatch[] = [];
  const obs = observed ?? {};
  for (const f of fields) {
    if (!(f in expected)) continue; // on n'affirme QUE ce que l'action a fixé
    let exp = expected[f];
    if (typeof exp === "string" && exp.trim() === "") exp = null;
    const o = obs[f] ?? null;
    if (!valuesEqual(exp, o)) out.push({ field: f, expected: exp, observed: o });
  }
  return out;
}

// ── Relecture (IO tolérant — ne throw jamais) ────────────────────────────────

async function readOne(
  db: MinimalClient,
  table: string,
  tenantId: string,
  id: string
): Promise<{ row: Record<string, unknown> | null; error: string | null }> {
  try {
    const { data, error } = await db.from(table).select("*").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
    if (error) return { row: null, error: (error as { message?: string }).message ?? "read error" };
    return { row: (data as Record<string, unknown> | null) ?? null, error: null };
  } catch (e) {
    return { row: null, error: e instanceof Error ? e.message : "read failed" };
  }
}

async function readManyBy(
  db: MinimalClient,
  table: string,
  tenantId: string,
  col: string,
  val: string
): Promise<{ rows: Record<string, unknown>[]; error: string | null }> {
  try {
    const { data, error } = await db.from(table).select("*").eq("tenant_id", tenantId).eq(col, val);
    if (error) return { rows: [], error: (error as { message?: string }).message ?? "read error" };
    return { rows: (data as Record<string, unknown>[] | null) ?? [], error: null };
  } catch (e) {
    return { rows: [], error: e instanceof Error ? e.message : "read failed" };
  }
}

// ── Vérificateurs par outil ──────────────────────────────────────────────────

const nowIso = (deps: VerifyDeps): string => (deps.now ? deps.now() : new Date().toISOString());

async function verifyCreate(db: MinimalClient, tenantId: string, req: VerifyRequest, deps: VerifyDeps): Promise<ActionVerification> {
  const base = { toolName: req.toolName, entity: req.table, verifiedAt: nowIso(deps) };
  const row = (req.result?.row ?? null) as Record<string, unknown> | null;
  const id = row && typeof row.id === "string" ? row.id : "";
  if (!req.table || !id) {
    return { ...base, status: "failed", reason: "Création sans identifiant/table exploitable." };
  }
  const { row: fresh, error } = await readOne(db, req.table, tenantId, id);
  if (error) return { ...base, objectId: id, status: "not_verifiable", reason: `Relecture impossible : ${error}` };
  if (!fresh) return { ...base, objectId: id, status: "mismatch", reason: "Objet introuvable après création (tenant ?)." };

  const values = (req.input.values ?? {}) as Record<string, unknown>;
  const mism = compareFields(values, fresh, req.writable ?? Object.keys(values));
  const tenantOk = String(fresh.tenant_id ?? "") === tenantId;
  if (!tenantOk) mism.push({ field: "tenant_id", expected: tenantId, observed: fresh.tenant_id ?? null });

  return {
    ...base,
    objectId: id,
    expected: pick(values, mism.map((m) => m.field)),
    observed: pick(fresh, mism.map((m) => m.field)),
    mismatches: mism.length ? mism : undefined,
    status: mism.length ? "mismatch" : "verified",
  };
}

async function verifyUpdate(db: MinimalClient, tenantId: string, req: VerifyRequest, deps: VerifyDeps): Promise<ActionVerification> {
  const base = { toolName: req.toolName, entity: req.table, verifiedAt: nowIso(deps) };
  const id = String(req.input.id ?? "");
  if (!req.table || !id) return { ...base, status: "failed", reason: "Mise à jour sans id/table." };
  const { row: fresh, error } = await readOne(db, req.table, tenantId, id);
  if (error) return { ...base, objectId: id, status: "not_verifiable", reason: `Relecture impossible : ${error}` };
  if (!fresh) return { ...base, objectId: id, status: "mismatch", reason: "Objet introuvable après mise à jour (tenant ?)." };

  const values = (req.input.values ?? {}) as Record<string, unknown>;
  const fields = (req.writable ?? Object.keys(values)).filter((f) => f in values);
  const mism = compareFields(values, fresh, fields);
  return {
    ...base,
    objectId: id,
    expected: pick(values, fields),
    observed: pick(fresh, fields),
    mismatches: mism.length ? mism : undefined,
    status: mism.length ? "mismatch" : "verified",
  };
}

async function verifyDelete(db: MinimalClient, tenantId: string, req: VerifyRequest, deps: VerifyDeps): Promise<ActionVerification> {
  const base = { toolName: req.toolName, entity: req.table, verifiedAt: nowIso(deps) };
  const id = String(req.input.id ?? "");
  if (!req.table || !id) return { ...base, status: "failed", reason: "Suppression sans id/table." };

  // PREUVE de suppression : l'outil workspace_delete LIT la fiche AVANT de la
  // supprimer et renvoie `deleted.id`. Cette lecture préalable prouve que la fiche
  // était VISIBLE pour ce client (donc la RLS ne la cachait pas). Sans cette
  // preuve, une relecture à zéro ligne NE prouve RIEN (elle peut être masquée par
  // la RLS, un mauvais tenant, un accès refusé) → jamais « verified » par défaut.
  const del = (req.result?.deleted ?? null) as { id?: unknown } | null;
  const confirmedDelete = req.result?.ok === true && del != null && String(del.id ?? "") === id;

  const { row: fresh, error } = await readOne(db, req.table, tenantId, id);
  // Erreur de relecture = vérification en échec (réseau / SQL / permission).
  if (error) return { ...base, objectId: id, status: "failed", reason: `Relecture impossible — suppression NON prouvée : ${error}` };
  // Fiche encore présente (tenant-scopée) = suppression ratée.
  if (fresh) {
    return {
      ...base,
      objectId: id,
      expected: { exists: false },
      observed: { exists: true },
      mismatches: [{ field: "exists", expected: false, observed: true }],
      status: "mismatch",
      reason: "L'objet est encore présent après suppression.",
    };
  }
  // Zéro ligne SANS preuve d'existence préalable → on ne peut pas distinguer
  // « supprimé » de « invisible (RLS / mauvais tenant / accès refusé) » → not_verifiable.
  if (!confirmedDelete) {
    return {
      ...base,
      objectId: id,
      expected: { exists: false },
      observed: { exists: "unknown" },
      status: "not_verifiable",
      reason: "Absence non prouvée : l'outil n'a pas confirmé la suppression d'une fiche existante (la fiche a pu rester invisible via RLS / mauvais tenant).",
    };
  }
  // Suppression confirmée (fiche lue puis supprimée) ET relecture tenant-scopée absente.
  return { ...base, objectId: id, expected: { exists: false }, observed: { exists: false }, status: "verified" };
}

async function verifyTransform(db: MinimalClient, tenantId: string, req: VerifyRequest, deps: VerifyDeps): Promise<ActionVerification> {
  const base = { toolName: req.toolName, verifiedAt: nowIso(deps) };
  const produced = (req.result?.row ?? null) as Record<string, unknown> | null;
  const producedId = produced && typeof produced.id === "string" ? produced.id : "";
  const action = String(req.input.action ?? "");
  const sourceId = String(req.input.source_id ?? req.input.sourceId ?? "");
  if (!req.targetTable || !producedId) {
    return { ...base, status: "failed", reason: "Transformation sans objet produit exploitable." };
  }
  const { row: fresh, error } = await readOne(db, req.targetTable, tenantId, producedId);
  if (error) return { ...base, entity: req.targetTable, objectId: producedId, status: "not_verifiable", reason: `Relecture impossible : ${error}` };
  if (!fresh) return { ...base, entity: req.targetTable, objectId: producedId, status: "mismatch", reason: "Objet produit introuvable (tenant ?)." };

  const mism: FieldMismatch[] = [];
  // Lien vers la source, quand la transformation en pose un.
  if (action === "devis_from_demande") {
    if (String(fresh.demande_id ?? "") !== sourceId) {
      mism.push({ field: "demande_id", expected: sourceId, observed: fresh.demande_id ?? null });
    }
  } else if (action === "chantier_from_devis") {
    const src = await readOne(db, "devis", tenantId, sourceId);
    if (src.row && String(src.row.chantier_id ?? "") !== producedId) {
      mism.push({ field: "devis.chantier_id", expected: producedId, observed: src.row.chantier_id ?? null });
    }
  }
  return {
    ...base,
    entity: req.targetTable,
    objectId: producedId,
    mismatches: mism.length ? mism : undefined,
    status: mism.length ? "mismatch" : "verified",
  };
}

/** Map d'entrée `create_avenant` → lignes normalisées (miroir de lib/agent-tools.ts). */
function mapAvenantLines(input: Record<string, unknown>): DevisLineInput[] {
  const raw = Array.isArray(input.lignes) ? input.lignes : Array.isArray(input.lines) ? input.lines : [];
  return raw.map((item) => {
    const o = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    return {
      designation: String(o.designation ?? ""),
      quantite: o.quantite != null ? Number(o.quantite) : undefined,
      unite: typeof o.unite === "string" ? o.unite : null,
      prix_unitaire_ht: Number(o.prix_unitaire_ht) || 0,
      taux_tva: o.taux_tva != null ? Number(o.taux_tva) : undefined,
    };
  });
}

async function verifyAvenant(db: MinimalClient, tenantId: string, req: VerifyRequest, deps: VerifyDeps): Promise<ActionVerification> {
  const base = { toolName: req.toolName, entity: "devis", verifiedAt: nowIso(deps) };
  const created = (req.result?.row ?? null) as Record<string, unknown> | null;
  const id = created && typeof created.id === "string" ? created.id : "";
  const devisId = String(req.input.devis_id ?? req.input.devisId ?? "");
  if (!id) return { ...base, status: "failed", reason: "Avenant sans identifiant produit." };

  const { row: av, error } = await readOne(db, "devis", tenantId, id);
  if (error) return { ...base, objectId: id, status: "not_verifiable", reason: `Relecture impossible : ${error}` };
  if (!av) return { ...base, objectId: id, status: "mismatch", reason: "Avenant introuvable après création (tenant ?)." };

  const mism: FieldMismatch[] = [];
  if (String(av.type ?? "") !== "avenant") mism.push({ field: "type", expected: "avenant", observed: av.type ?? null });
  if (String(av.parent_devis_id ?? "") !== devisId) mism.push({ field: "parent_devis_id", expected: devisId, observed: av.parent_devis_id ?? null });
  if (String(av.tenant_id ?? "") !== tenantId) mism.push({ field: "tenant_id", expected: tenantId, observed: av.tenant_id ?? null });

  // Cohérence avec le devis source (client / chantier).
  const src = await readOne(db, "devis", tenantId, devisId);
  if (src.row) {
    if (String(av.client_id ?? "") !== String(src.row.client_id ?? "")) {
      mism.push({ field: "client_id", expected: src.row.client_id ?? null, observed: av.client_id ?? null });
    }
    if (String(av.chantier_id ?? "") !== String(src.row.chantier_id ?? "")) {
      mism.push({ field: "chantier_id", expected: src.row.chantier_id ?? null, observed: av.chantier_id ?? null });
    }
  }

  // Montants : comparés au CALCUL DÉTERMINISTE serveur (injecté), jamais au LLM.
  const expected: Record<string, unknown> = { type: "avenant", parent_devis_id: devisId };
  if (deps.computeLines && deps.computeTotals) {
    const computed = deps.computeLines(mapAvenantLines(req.input)).filter((l) => l.designation && l.total_ht > 0);
    const totals = deps.computeTotals(computed);
    expected.montant_ht = totals.montant_ht;
    expected.montant_tva = totals.montant_tva;
    expected.montant_ttc = totals.montant_ttc;
    expected.lignes = computed.length;
    if (!valuesEqual(av.montant_ht, totals.montant_ht)) mism.push({ field: "montant_ht", expected: totals.montant_ht, observed: av.montant_ht ?? null });
    if (!valuesEqual(av.montant_tva, totals.montant_tva)) mism.push({ field: "montant_tva", expected: totals.montant_tva, observed: av.montant_tva ?? null });
    if (!valuesEqual(av.montant_ttc, totals.montant_ttc)) mism.push({ field: "montant_ttc", expected: totals.montant_ttc, observed: av.montant_ttc ?? null });

    const { rows: lignes, error: lErr } = await readManyBy(db, "lignes", tenantId, "devis_id", id);
    if (lErr) {
      return { ...base, objectId: id, expected, mismatches: mism.length ? mism : undefined, status: "not_verifiable", reason: `Lignes non relisibles : ${lErr}` };
    }
    if (lignes.length !== computed.length) {
      mism.push({ field: "lignes", expected: computed.length, observed: lignes.length });
    }
    const sumHt = round2(lignes.reduce((s, l) => s + (Number(l.total_ht) || 0), 0));
    if (!valuesEqual(sumHt, totals.montant_ht)) {
      mism.push({ field: "somme_lignes_ht", expected: totals.montant_ht, observed: sumHt });
    }
  } else {
    // Sans calcul serveur injecté : structure vérifiée, montants non recalculés.
    return {
      ...base,
      objectId: id,
      expected,
      observed: pick(av, ["type", "parent_devis_id", "client_id", "chantier_id"]),
      mismatches: mism.length ? mism : undefined,
      status: mism.length ? "mismatch" : "not_verifiable",
      reason: mism.length ? undefined : "Montants non recalculés (dépendances de calcul absentes).",
    };
  }

  return {
    ...base,
    objectId: id,
    expected,
    observed: pick(av, ["type", "parent_devis_id", "client_id", "chantier_id", "montant_ht", "montant_tva", "montant_ttc"]),
    mismatches: mism.length ? mism : undefined,
    status: mism.length ? "mismatch" : "verified",
  };
}

function verifySend(req: VerifyRequest, deps: VerifyDeps): ActionVerification {
  // Envoi : on distingue ACCEPTATION par le fournisseur de LIVRAISON réelle.
  // On ne prétend JAMAIS qu'un message a été reçu — seulement accepté.
  const r = req.result ?? {};
  const observed: Record<string, unknown> = {};
  if ("via" in r) observed.via = r.via;
  if ("sent" in r) observed.sent = r.sent;
  if ("failed" in r) observed.failed = r.failed;
  if ("note" in r && r.note) observed.note = r.note;
  const failed = Number((r as { failed?: unknown }).failed) || 0;
  const reason =
    failed > 0
      ? `Envoi partiellement accepté (${failed} échec(s)) — livraison non confirmée.`
      : "Envoi accepté par le fournisseur — livraison/réception non confirmée.";
  return {
    toolName: req.toolName,
    status: "not_verifiable",
    observed,
    reason,
    verifiedAt: nowIso(deps),
  };
}

/**
 * Point d'entrée : vérifie une action d'écriture qui a répondu `ok`. Ne throw
 * jamais. Le statut `not_verifiable` couvre les envois (acceptés ≠ livrés) et les
 * relectures impossibles.
 */
export async function verifyAction(
  db: MinimalClient,
  actor: { tenantId: string },
  req: VerifyRequest,
  deps: VerifyDeps = {}
): Promise<ActionVerification> {
  const t = actor.tenantId;
  switch (req.toolName) {
    case "workspace_create":
      return verifyCreate(db, t, req, deps);
    case "workspace_update":
      return verifyUpdate(db, t, req, deps);
    case "workspace_delete":
      return verifyDelete(db, t, req, deps);
    case "workspace_transform":
      return verifyTransform(db, t, req, deps);
    case "create_avenant":
      return verifyAvenant(db, t, req, deps);
    case "send_email":
    case "send_sms":
      return verifySend(req, deps);
    default:
      return { toolName: req.toolName, status: "not_verifiable", reason: "Outil non vérifiable.", verifiedAt: nowIso(deps) };
  }
}

// ── Restitution AU MODÈLE (signal dur) ───────────────────────────────────────

const DIRECTIVES: Record<VerificationStatus, string> = {
  verified: "Vérifié : l'état enregistré correspond à la demande. Tu peux présenter cette action comme faite.",
  mismatch:
    "VÉRIFICATION ÉCHOUÉE : l'état enregistré NE correspond PAS à la demande. NE présente PAS cette action comme terminée. Tu peux tenter UNE seule correction si l'action est sûre et réversible ; sinon, signale l'écart honnêtement.",
  failed: "VÉRIFICATION IMPOSSIBLE : l'action n'a pas pu être confirmée. Ne la présente pas comme terminée ; signale-le.",
  not_verifiable:
    "NON VÉRIFIABLE : l'envoi a été accepté par le fournisseur, mais la réception/livraison n'est PAS confirmée. N'affirme pas que le message a été reçu.",
};

/** Objet compact renvoyé au modèle dans le tool_result. */
export function summarizeVerificationForModel(v: ActionVerification): Record<string, unknown> {
  return {
    status: v.status,
    ...(v.mismatches ? { mismatches: v.mismatches } : {}),
    ...(v.reason ? { reason: v.reason } : {}),
    directive: DIRECTIVES[v.status],
  };
}

// ── Compte rendu déterministe (construit à partir des résultats VÉRIFIÉS) ─────

export function allVerified(vs: ActionVerification[]): boolean {
  return vs.every((v) => v.status === "verified");
}

function actionLabel(v: ActionVerification): string {
  const id = v.objectId ? ` #${String(v.objectId).slice(0, 8)}` : "";
  switch (v.toolName) {
    case "workspace_create":
      return `Création ${v.entity ?? ""}${id}`.trim();
    case "workspace_update":
      return `Mise à jour ${v.entity ?? ""}${id}`.trim();
    case "workspace_delete":
      return `Suppression ${v.entity ?? ""}${id}`.trim();
    case "workspace_transform":
      return `Transformation → ${v.entity ?? ""}${id}`.trim();
    case "create_avenant":
      return `Avenant${id}`;
    case "send_email":
      return "Email";
    case "send_sms":
      return "SMS";
    default:
      return v.toolName;
  }
}

function fmt(val: unknown): string {
  if (val === null || val === undefined) return "∅";
  return String(val);
}

/**
 * Compte rendu déterministe : ✓ vérifié, ⚠ écart, ✕ échec, • non vérifiable.
 * Construit à partir des VÉRIFICATIONS, pas du texte libre du modèle. Interdit
 * de fait toute formulation « tout est terminé » quand une action ne l'est pas.
 */
/**
 * Compose le TEXTE FINAL honnête destiné à l'utilisateur / au résumé persisté, à
 * partir du texte libre du modèle ET des vérifications. C'est LA garantie
 * partagée (chat, confirmPlan, executor) : dès qu'une écriture n'est pas vérifiée,
 * le rapport déterministe PASSE DEVANT le texte du modèle — impossible d'annoncer
 * « c'est fait » à tort, même si le modèle a écrit « Tout est terminé ».
 *   - aucune écriture vérifiable → on renvoie le texte du modèle tel quel.
 *   - tout vérifié → texte du modèle (ou, à défaut, le rapport ✓).
 *   - au moins une non vérifiée → rapport EN TÊTE, puis le texte du modèle.
 */
export function composeVerifiedText(modelText: string | null | undefined, vs: ActionVerification[]): string | null {
  const text = (modelText ?? "").trim();
  if (!vs.length) return text || null;
  if (allVerified(vs)) return text || buildVerifiedReport(vs);
  const report = buildVerifiedReport(vs);
  return text ? `${report}\n\n${text}` : report;
}

export function buildVerifiedReport(vs: ActionVerification[]): string {
  if (!vs.length) return "";
  const lines = vs.map((v) => {
    const label = actionLabel(v);
    if (v.status === "verified") return `✓ ${label} — vérifié`;
    if (v.status === "not_verifiable") return `• ${label} — accepté, réception/livraison non confirmée`;
    if (v.status === "mismatch") {
      const details =
        v.mismatches && v.mismatches.length
          ? v.mismatches.map((m) => `${m.field} attendu ${fmt(m.expected)}, obtenu ${fmt(m.observed)}`).join(" ; ")
          : v.reason ?? "écart constaté";
      return `⚠ ${label} — NON conforme (${details})`;
    }
    return `✕ ${label} — non vérifié (${v.reason ?? "vérification impossible"})`;
  });
  const header = allVerified(vs) ? "État vérifié — toutes les actions ont été confirmées :" : "État vérifié des actions :";
  const footer = allVerified(vs) ? "" : "\nJe n'annonce pas comme terminé ce qui n'a pas été vérifié.";
  return `${header}\n${lines.join("\n")}${footer}`;
}

// ── Utilitaires internes ─────────────────────────────────────────────────────

function pick(obj: Record<string, unknown> | null, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!obj) return out;
  for (const k of keys) if (k in obj) out[k] = obj[k];
  return out;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
