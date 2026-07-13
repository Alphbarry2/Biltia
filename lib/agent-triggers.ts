// ─────────────────────────────────────────────────────────────────────────────
// AGENT TRIGGERS — déclencheurs GÉNÉRIQUES (Phase 7).
//
// Les 51 veilleurs couvrent les conditions métier nommées. Ici, un déclencheur
// PARAMÉTRABLE que l'utilisateur peut viser sur N'IMPORTE quelle date autorisée,
// sans qu'on code un veilleur par cas :
//
//   relative_date — « N jours AVANT/APRÈS une date » (échéance facture, validité
//   devis, fin de chantier, RDV, expiration document…). Générique mais SÉCURISÉ :
//   seules des paires (entité, champ_date) WHITELISTÉES sont interrogeables — le
//   modèle ne choisit jamais une colonne arbitraire (cf spec §8 : accès limité).
//
// Renvoie des WatcherMatch (mêmes que les veilleurs) → se branche tel quel dans le
// runner V2 (idempotence par fiche, exécution par fiche). Lecture seule, tenant
// forcé, ne throw jamais.
//
// status_changed « vrai événement » (transition old→new) = infra de triggers DB à
// venir ; les cas courants sont déjà couverts par des veilleurs de transition
// (devis_accepte, facture_payee, chantier_termine…). inactivity générique = idem
// (client_inactif, chantier_sans_activite). Non réimplémentés ici.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";
import type { WatcherMatch } from "./agent-watchers";

/** Paires (entité → champs date) autorisées pour relative_date. Aucune autre colonne. */
export const RELATIVE_DATE_FIELDS: Record<string, string[]> = {
  devis: ["date_validite", "date_devis"],
  factures: ["date_echeance", "date_facture"],
  chantiers: ["date_fin_prevue", "date_debut"],
  interventions: ["date_prevue"],
  documents: ["expires_at"],
  suppliers: ["assurance_expire"],
  contrats: ["prochaine_echeance"],
  parc_installe: ["prochain_entretien"],
  tasks: ["due_date"],
  rappels: ["due_date"],
};

export function isAllowedRelativeField(entity: string, field: string): boolean {
  return (RELATIVE_DATE_FIELDS[entity] ?? []).includes(field);
}

export type RelativeDateConfig = {
  entityType: string;
  dateField: string;
  offsetValue: number;
  offsetUnit: "minutes" | "hours" | "days" | "weeks" | "months";
  direction: "before" | "after";
};

const OFFSET_UNITS = ["minutes", "hours", "days", "weeks", "months"] as const;

/**
 * Valide DÉFENSIVEMENT une config relative_date (sortie LLM du parseur, snake_case
 * ou camelCase) en RelativeDateConfig. La paire (entité, champ_date) DOIT être
 * whitelistée (RELATIVE_DATE_FIELDS) sinon `null` — le modèle ne peut JAMAIS viser
 * une colonne arbitraire. Offset borné [0, 365]. Ne throw jamais.
 */
export function coerceRelativeDate(input: unknown): RelativeDateConfig | null {
  const o = input && typeof input === "object" ? (input as Record<string, unknown>) : null;
  if (!o) return null;
  const pick = (a: string, b: string) =>
    typeof o[a] === "string" ? String(o[a]).trim() : typeof o[b] === "string" ? String(o[b]).trim() : "";
  const entityType = pick("entity_type", "entityType");
  const dateField = pick("date_field", "dateField");
  if (!isAllowedRelativeField(entityType, dateField)) return null;
  const rawUnit = pick("offset_unit", "offsetUnit") || "days";
  const offsetUnit = (OFFSET_UNITS as readonly string[]).includes(rawUnit)
    ? (rawUnit as RelativeDateConfig["offsetUnit"])
    : "days";
  const rawVal = Number(o.offset_value ?? o.offsetValue);
  const offsetValue = Number.isFinite(rawVal) ? Math.max(0, Math.min(365, Math.floor(rawVal))) : 0;
  const direction = o.direction === "after" ? "after" : "before";
  return { entityType, dateField, offsetValue, offsetUnit, direction };
}

const DAY = 86_400_000;

/** AAAA-MM-JJ décalé de `offsetDays` (comparable lexicalement). */
function isoDate(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);
}

/** Convertit un offset en JOURS (borné). Minutes/heures → arrondi au jour ≥ 0. */
export function offsetToDays(value: number, unit: RelativeDateConfig["offsetUnit"]): number {
  const v = Math.max(0, Math.floor(Number(value) || 0));
  switch (unit) {
    case "weeks": return v * 7;
    case "months": return v * 30;
    case "hours": return Math.max(0, Math.round(v / 24));
    case "minutes": return Math.max(0, Math.round(v / 1440));
    default: return v; // days
  }
}

/**
 * Fenêtre de scan pour un relative_date :
 *   • before : la date approche → [aujourd'hui, aujourd'hui + offset].
 *   • after  : la date est passée d'`offset` jours → [J-(offset+7), J-offset]
 *     (fenêtre d'une semaine après le franchissement ; l'idempotence par fiche
 *     évite tout re-déclenchement au-delà).
 */
export function relativeDateWindow(days: number, direction: "before" | "after"): { lo: string; hi: string } {
  if (direction === "before") return { lo: isoDate(0), hi: isoDate(days) };
  return { lo: isoDate(-(days + 7)), hi: isoDate(-days) };
}

/**
 * Évalue un déclencheur relative_date : les fiches de `entityType` dont `dateField`
 * tombe dans la fenêtre. WHITELIST obligatoire (entité + champ) : sinon []. Ne throw
 * jamais. `select("*")` (tenant forcé) → raw complet pour interpolation/destinataires.
 */
export async function evaluateRelativeDate(
  admin: SupabaseClient,
  tenantId: string,
  cfg: RelativeDateConfig
): Promise<WatcherMatch[]> {
  if (!isAllowedRelativeField(cfg.entityType, cfg.dateField)) return [];
  const days = offsetToDays(cfg.offsetValue, cfg.offsetUnit);
  const { lo, hi } = relativeDateWindow(days, cfg.direction);
  try {
    const { data, error } = await admin
      .from(cfg.entityType)
      .select("*")
      .eq("tenant_id", tenantId)
      .gte(cfg.dateField, lo)
      .lte(cfg.dateField, hi)
      .limit(300);
    if (error) return [];
    const rows = (data ?? []) as Record<string, unknown>[];
    const dir = cfg.direction === "before" ? `dans ${days} j` : `il y a ${days} j`;
    return rows.map((r) => {
      const dateVal = String(r[cfg.dateField] ?? "").slice(0, 10);
      return {
        ficheId: String(r.id),
        entity: cfg.entityType,
        label: `${cfg.entityType} ${String(r.numero ?? r.nom ?? r.id)}`,
        detail: `${cfg.dateField} ${dir} (${dateVal})`,
        email: typeof r.email === "string" ? r.email : null,
        contactName: typeof r.nom === "string" ? r.nom : null,
        dedupExtra: dateVal, // date replanifiée → re-déclenche
        raw: r,
      } satisfies WatcherMatch;
    });
  } catch {
    return [];
  }
}
