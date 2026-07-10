// ─────────────────────────────────────────────────────────────────────────────
// PARTAGE D'APP — helpers PURS (URL, validation, état d'un lien).
//
// Aucun import serveur/navigateur : utilisable dans les routes API, la route
// publique /partage/[token] ET l'UI. La table est app_share_links (migration
// 029). Le token (uuid) est le secret dans l'URL — il EST la capacité d'accès.
// ─────────────────────────────────────────────────────────────────────────────

//   • 'preview' : aperçu lecture seule de l'app (slice 1), sans données privées.
//   • 'client'  : portail scopé à UN chantier — lecture seule de ce chantier et
//                 de ses enfants directs uniquement (slice 2).
export type ShareKind = "preview" | "client";

/** Ligne de lien de partage (sous-ensemble exposé au client). */
export interface ShareLink {
  id: string;
  token: string;
  kind: ShareKind;
  label: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

// ── Portée d'un lien « client » ───────────────────────────────────────────────
// Slice 2 : la racine d'un portail client est UN chantier. Les seules autres
// entités lisibles sont ses ENFANTS DIRECTS (rattachés par chantier_id). Tout le
// reste (autres chantiers, clients, employés, fournisseurs, app_records) est
// hors de portée et renvoyé vide par l'endpoint tokenisé — jamais exposé.
export interface ClientScope {
  entity: "chantiers";
  record_id: string;
}

/** Entités enfants d'un chantier lisibles dans un portail client (clé = chantier_id). */
export const CLIENT_CHILD_ENTITIES = [
  "interventions",
  "documents",
  "tasks",
  "materials",
  "equipment",
] as const;

// Colonnes EXPOSABLES à un client, par entité. On ne fait JAMAIS `select *` :
// les tables portent des champs internes (budget/marge, prix d'achat, notes,
// storage_path, FK d'affectation) qu'un client ne doit pas voir. Liste stricte
// d'inclusion → tout nouveau champ est masqué par défaut. Toutes ces colonnes
// existent dans le schéma de base (004) ; un champ absent (drift) fait juste
// échouer la requête → réponse vide (fail-safe, jamais de fuite).
export const CLIENT_READABLE_COLUMNS: Record<string, string> = {
  // Chantier : PAS budget / budget_engage / client_id / chef_chantier_id.
  chantiers:
    "id, nom, adresse, ville, code_postal, description, avancement, statut, date_debut, date_fin_prevue, date_fin_reelle, created_at, updated_at",
  interventions:
    "id, chantier_id, type, description, statut, date_prevue, date_reelle, duree_heures, rapport, created_at, updated_at",
  // Document : PAS storage_path (interne) ni notes.
  documents: "id, chantier_id, nom, type, url, statut, expires_at, created_at",
  tasks: "id, chantier_id, title, description, status, priority, due_date, done_at, created_at",
  // Matériel : PAS de prix d'achat/vente ni fournisseur ni notes.
  materials: "id, chantier_id, nom, reference, categorie, quantite, unite, statut, date_retour",
  equipment: "id, chantier_id, nom, reference, type, marque, statut, prochain_controle",
};

/** Colonnes client-safe d'une entité (fallback ultra-minimal si inconnue). */
export function clientReadableColumns(entity: string): string {
  return CLIENT_READABLE_COLUMNS[entity] ?? "id";
}

/**
 * Valide/normalise le scope d'un lien client. Renvoie null si le scope n'est pas
 * exactement { entity:'chantiers', record_id:<uuid> } — refus par défaut.
 */
export function resolveClientScope(scope: unknown): ClientScope | null {
  if (!scope || typeof scope !== "object") return null;
  const s = scope as Record<string, unknown>;
  const recordId = typeof s.record_id === "string" ? s.record_id : null;
  if (s.entity !== "chantiers" || !recordId || !isShareToken(recordId)) return null;
  return { entity: "chantiers", record_id: recordId };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Le token a-t-il la forme d'un uuid ? (garde d'entrée avant toute requête). */
export function isShareToken(s: string): boolean {
  return UUID_RE.test(s);
}

/** URL publique d'un lien de partage. */
export function shareLinkUrl(base: string, token: string): string {
  return `${base.replace(/\/+$/, "")}/partage/${token}`;
}

/**
 * Base URL publique : variable d'env d'abord (domaine canonique), sinon origin
 * de la requête. Évite de dépendre de lib/demo-server (qui tire le mailer).
 */
export function publicBaseUrl(req: Request): string {
  const env = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (env) return env.replace(/\/+$/, "");
  try {
    return new URL(req.url).origin;
  } catch {
    return "https://www.biltia.com";
  }
}

/** Un lien est-il vivant ? (ni révoqué, ni expiré à l'instant nowMs) */
export function isLinkLive(
  row: { revoked_at: string | null; expires_at: string | null },
  nowMs: number
): boolean {
  if (row.revoked_at) return false;
  if (row.expires_at && new Date(row.expires_at).getTime() <= nowMs) return false;
  return true;
}
