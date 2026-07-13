// ─────────────────────────────────────────────────────────────────────────────
// AGENT WATCHERS — le catalogue des DÉCLENCHEURS ÉVÉNEMENTIELS (« dès que… »).
//
// Un agent-événement (trigger_type='event') ne passe pas à heure fixe : il
// SURVEILLE une condition métier et agit dès qu'une fiche y correspond. Pour
// que l'IA ne génère JAMAIS de SQL libre, chaque condition est un « veilleur »
// nommé et paramétré, dont la requête est écrite ICI, à la main, tenant-scopée.
//
// Le parseur (lib/agent-rules.ts) choisit un veilleur + son paramètre (délai /
// fenêtre en jours) ; l'exécuteur (lib/agent-executor.ts) l'évalue à chaque
// tick du cron et déclenche l'action UNE fois par fiche (idempotence via
// agent_event_fires, migration 025).
//
// Sécurité : lecture seule, tenant_id TOUJOURS filtré, volume borné (limit).
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPlannedInterventions, findConflicts, formatWhenFr } from "./planning-slots";

export type WatcherKey =
  | "chantier_en_retard"
  | "chantier_fin_proche"
  | "chantier_hors_budget"
  | "chantier_sans_activite"
  | "chantier_sans_devis"
  | "chantier_termine"
  | "demande_urgente"
  | "devis_non_signe"
  | "devis_accepte"
  | "facture_impayee"
  | "facture_payee"
  | "echeance_proche"
  | "visite_terminee"
  | "rdv_demain"
  | "conflit_planning"
  | "intervention_annulee"
  | "tache_en_retard"
  | "tache_terminee"
  | "tache_sans_responsable"
  | "chantier_sans_responsable"
  | "equipe_surchargee"
  | "stock_bas"
  | "nouveau_lead"
  | "nouveau_client"
  | "nouveau_chantier"
  | "devis_expire_bientot"
  | "facture_echeance_proche"
  | "pointage_manquant"
  | "heures_a_valider"
  | "heures_incoherentes"
  | "chantier_trop_heures"
  | "document_a_regulariser"
  | "assurance_expiree"
  | "clients_doublons"
  | "client_mauvais_payeur"
  | "sous_traitant_a_probleme"
  | "sous_traitant_sans_assurance"
  | "documents_a_classer"
  | "chantier_sans_photo"
  | "intervention_sans_responsable"
  | "intervention_sans_date"
  | "intervention_en_retard"
  | "commande_en_retard"
  | "achat_non_affecte"
  | "facture_fournisseur_a_payer"
  | "chantier_sans_budget"
  | "client_inactif"
  | "rappel_echu"
  | "devis_accepte_sans_chantier"
  | "chantier_termine_non_facture"
  | "facture_brouillon_non_envoyee";
export const WATCHER_KEYS: WatcherKey[] = [
  "chantier_en_retard",
  "chantier_fin_proche",
  "chantier_hors_budget",
  "chantier_sans_activite",
  "chantier_sans_devis",
  "chantier_termine",
  "demande_urgente",
  "devis_non_signe",
  "devis_accepte",
  "devis_expire_bientot",
  "facture_echeance_proche",
  "facture_impayee",
  "facture_payee",
  "echeance_proche",
  "visite_terminee",
  "rdv_demain",
  "conflit_planning",
  "intervention_annulee",
  "tache_en_retard",
  "tache_terminee",
  "tache_sans_responsable",
  "chantier_sans_responsable",
  "equipe_surchargee",
  "stock_bas",
  "nouveau_lead",
  "nouveau_client",
  "nouveau_chantier",
  "pointage_manquant",
  "heures_a_valider",
  "heures_incoherentes",
  "chantier_trop_heures",
  "document_a_regulariser",
  "assurance_expiree",
  "clients_doublons",
  "client_mauvais_payeur",
  "sous_traitant_a_probleme",
  "sous_traitant_sans_assurance",
  "documents_a_classer",
  "chantier_sans_photo",
  "intervention_sans_responsable",
  "intervention_sans_date",
  "intervention_en_retard",
  "commande_en_retard",
  "achat_non_affecte",
  "facture_fournisseur_a_payer",
  "chantier_sans_budget",
  "client_inactif",
  "rappel_echu",
  "devis_accepte_sans_chantier",
  "chantier_termine_non_facture",
  "facture_brouillon_non_envoyee",
];

/** Une fiche qui remplit la condition surveillée. */
export type WatcherMatch = {
  /** Identifiant STABLE de la fiche pour l'idempotence (source-préfixé si multi-table). */
  ficheId: string;
  /**
   * Entité workspace de la fiche déclenchante (clients, devis, chantiers…),
   * quand `ficheId` est un vrai uuid de cette table. Sert à l'action `act` :
   * l'agent sait EXACTEMENT quelle fiche a déclenché et peut la relire/l'enrichir.
   * Absent quand la fiche n'est pas une entité standard (ex : lead, échéance multi-source).
   */
  entity?: string;
  /** Libellé lisible (« Facture F-2026-001 », « Chantier Morel »). */
  label: string;
  /** Détail factuel pour le message (« échue depuis 12 j, 3 200 € TTC »). */
  detail: string;
  /** Email du contact à relancer (send_email) — null si absent. */
  email?: string | null;
  /** Nom du contact (client) pour personnaliser. */
  contactName?: string | null;
  /**
   * Suffixe ajouté à la clé d'idempotence : quand la MÊME fiche doit re-déclencher
   * sur une nouvelle valeur (ex : une échéance renouvelée à une autre date).
   */
  dedupExtra?: string;
  /** Ligne source enrichie (noms résolus) — pour les actions qui ont besoin du détail (compte-rendu). */
  raw?: Record<string, unknown>;
};

export type WatcherDef = {
  key: WatcherKey;
  /** Libellé humain (« Factures impayées »). */
  label: string;
  /** Ce qui est surveillé, pour les messages (« les factures échues impayées »). */
  watching: string;
  /** Action naturelle : notify (prévenir le patron), send_email (relancer le client) ou compte_rendu (générer un document). */
  suggestedAction: "notify" | "send_email" | "compte_rendu";
  /** Paramètre principal en jours (sens selon le veilleur : délai avant relance, fenêtre d'échéance). */
  defaultDays: number;
  /** Le paramètre `days` a-t-il un sens pour ce veilleur ? (sinon on n'affiche rien). */
  daysMeaning: string | null;
  /**
   * Re-déclenche pour la même fiche tous les N jours (relances récurrentes) ;
   * null = une seule fois par fiche (alerte). Les relances client se répètent
   * doucement ; les alertes patron ne spamment pas.
   */
  refireDays: number | null;
  /**
   * JUGEMENT IA (cas « texte libre »). Quand présent, `run` ne renvoie que des
   * CANDIDATS (pré-filtre SQL bon marché) ; l'exécuteur demande ensuite à l'IA
   * de LIRE chaque fiche et de ne garder que celles qui remplissent ce critère
   * en langage naturel (« urgent », « à risque »…). Rend le passage PAYANT
   * (un appel IA par lot de nouvelles fiches). Absent = veilleur SQL pur.
   */
  aiJudge?: { criterion: string };
  run: (db: SupabaseClient, tenantId: string, days: number) => Promise<WatcherMatch[]>;
};

// ── Aides ────────────────────────────────────────────────────────────────────

/** Date UTC du jour décalée de `offsetDays`, au format AAAA-MM-JJ (comparable lexicalement). */
function isoDate(offsetDays = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/** Nombre de jours entiers écoulés depuis une date AAAA-MM-JJ (≥ 0 si passée). */
function daysSince(dateStr: string): number {
  const then = Date.parse(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(then)) return 0;
  return Math.floor((Date.now() - then) / 86_400_000);
}

/** Nombre de jours entiers jusqu'à une date AAAA-MM-JJ (≥ 0 si future), null si invalide. */
function daysUntil(dateStr: string): number | null {
  const then = Date.parse(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.ceil((then - Date.now()) / 86_400_000));
}

/** Montant lisible « 3 200 € ». */
function money(n: unknown): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return "";
  return `${v.toLocaleString("fr-FR")} €`;
}

/** Date lisible « 01/07/2026 » à partir d'un AAAA-MM-JJ. */
function frDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "?";
  const p = dateStr.slice(0, 10).split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : dateStr;
}

type ClientLite = { nom: string | null; email: string | null };

/** Charge les clients référencés (une requête) → map id → { nom, email }. */
async function loadClients(db: SupabaseClient, tenantId: string, ids: string[]): Promise<Map<string, ClientLite>> {
  const map = new Map<string, ClientLite>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return map;
  const { data } = await db
    .from("clients")
    .select("id, nom, email")
    .eq("tenant_id", tenantId)
    .in("id", unique);
  for (const c of (data ?? []) as { id: string; nom: string | null; email: string | null }[]) {
    map.set(c.id, { nom: c.nom, email: c.email });
  }
  return map;
}

/** Charge des lignes par id (une requête) → map id → ligne. Colonnes fixes (pas de select dynamique risqué). */
async function loadNamed(
  db: SupabaseClient,
  tenantId: string,
  table: "chantiers" | "employees",
  ids: string[]
): Promise<Map<string, Record<string, unknown>>> {
  const map = new Map<string, Record<string, unknown>>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return map;
  const cols = table === "chantiers" ? "id, nom, adresse, ville" : "id, nom, prenom, email";
  const { data } = await db.from(table).select(cols).eq("tenant_id", tenantId).in("id", unique);
  for (const r of ((data ?? []) as unknown) as Record<string, unknown>[]) {
    map.set(String(r.id), r);
  }
  return map;
}

const SCAN_LIMIT = 300;

// ── Les 4 veilleurs ────────────────────────────────────────────────────────

/** Chantiers dont la fin prévue est dépassée (ou déjà marqués en retard) et pas terminés. */
async function runChantierEnRetard(db: SupabaseClient, tenantId: string, graceDays: number): Promise<WatcherMatch[]> {
  const { data } = await db
    .from("chantiers")
    .select("id, nom, statut, date_fin_prevue")
    .eq("tenant_id", tenantId)
    .in("statut", ["en_attente", "en_cours", "en_retard"])
    .limit(SCAN_LIMIT);
  const cutoff = isoDate(-Math.max(0, graceDays));
  const out: WatcherMatch[] = [];
  for (const c of (data ?? []) as { id: string; nom: string | null; statut: string; date_fin_prevue: string | null }[]) {
    const overdue = !!c.date_fin_prevue && c.date_fin_prevue < cutoff;
    if (c.statut !== "en_retard" && !overdue) continue;
    const late = c.date_fin_prevue ? daysSince(c.date_fin_prevue) : null;
    out.push({
      ficheId: c.id,
      label: `Chantier « ${c.nom ?? "sans nom"} »`,
      detail: c.date_fin_prevue
        ? `fin prévue le ${frDate(c.date_fin_prevue)}${late && late > 0 ? ` (retard de ${late} j)` : ""}, toujours ${c.statut === "en_retard" ? "signalé en retard" : "en cours"}`
        : "signalé en retard",
    });
  }
  return out;
}

/**
 * Chantiers dont la date de fin prévue APPROCHE (fenêtre J-`windowDays`), pas
 * encore terminés → alerter AVANT l'échéance. Complément de chantier_en_retard
 * (qui, lui, agit APRÈS la date). Fenêtre FUTURE. La date entre dans la clé
 * (dedupExtra) : une fin replanifiée à une autre date re-déclenche.
 */
async function runChantierFinProche(db: SupabaseClient, tenantId: string, windowDays: number): Promise<WatcherMatch[]> {
  const win = Math.max(1, Math.floor(windowDays) || 7);
  const today = isoDate(0);
  const horizon = isoDate(win);
  const { data } = await db
    .from("chantiers")
    .select("id, nom, statut, date_fin_prevue, avancement, client_id")
    .eq("tenant_id", tenantId)
    .in("statut", ["en_attente", "en_cours"])
    .not("date_fin_prevue", "is", null)
    .gte("date_fin_prevue", today)
    .lte("date_fin_prevue", horizon)
    .limit(SCAN_LIMIT);
  const rows = (data ?? []) as {
    id: string; nom: string | null; statut: string; date_fin_prevue: string | null; avancement: number | null; client_id: string | null;
  }[];
  const out: WatcherMatch[] = [];
  for (const c of rows) {
    const date = c.date_fin_prevue ? c.date_fin_prevue.slice(0, 10) : "";
    if (!date) continue;
    const left = daysUntil(date);
    out.push({
      ficheId: c.id,
      entity: "chantiers",
      label: `Chantier « ${c.nom ?? "sans nom"} »`,
      detail: `fin prévue le ${frDate(date)}${left != null ? ` (dans ${left} j)` : ""}, avancement ${Number(c.avancement) || 0} %`,
      dedupExtra: date, // fin replanifiée → nouvelle date → re-déclenche
      raw: { nom: c.nom, statut: c.statut, date_fin_prevue: date, avancement: c.avancement, client_id: c.client_id },
    });
  }
  return out;
}

/** Devis envoyés restés sans réponse depuis au moins `delayDays` jours. */
async function runDevisNonSigne(db: SupabaseClient, tenantId: string, delayDays: number): Promise<WatcherMatch[]> {
  const { data } = await db
    .from("devis")
    .select("id, numero, statut, date_devis, montant_ttc, client_id")
    .eq("tenant_id", tenantId)
    .eq("statut", "envoye")
    .limit(SCAN_LIMIT);
  const rows = (data ?? []) as { id: string; numero: string | null; date_devis: string | null; montant_ttc: number | null; client_id: string | null }[];
  const clients = await loadClients(db, tenantId, rows.map((r) => r.client_id ?? ""));
  const out: WatcherMatch[] = [];
  for (const d of rows) {
    const age = d.date_devis ? daysSince(d.date_devis) : null;
    if (age === null || age < Math.max(0, delayDays)) continue;
    const cl = d.client_id ? clients.get(d.client_id) : undefined;
    out.push({
      ficheId: d.id,
      label: `Devis ${d.numero ?? "?"}`,
      detail: `${money(d.montant_ttc)} TTC, envoyé il y a ${age} j${cl?.nom ? ` à ${cl.nom}` : ""}, sans réponse`,
      email: cl?.email ?? null,
      contactName: cl?.nom ?? null,
    });
  }
  return out;
}

/**
 * Devis ENVOYÉS dont la date de validité approche (fenêtre J-`windowDays`), encore
 * sans réponse → relancer / alerter AVANT expiration. Fenêtre FUTURE (pas de
 * rattrapage de l'historique). La date de validité entre dans la clé (dedupExtra) :
 * une validité prolongée à une autre date re-déclenche.
 */
async function runDevisExpireBientot(db: SupabaseClient, tenantId: string, windowDays: number): Promise<WatcherMatch[]> {
  const win = Math.max(1, Math.floor(windowDays) || 7);
  const today = isoDate(0);
  const horizon = isoDate(win);
  const { data } = await db
    .from("devis")
    .select("id, numero, statut, date_validite, montant_ttc, client_id")
    .eq("tenant_id", tenantId)
    .eq("statut", "envoye")
    .not("date_validite", "is", null)
    .gte("date_validite", today)
    .lte("date_validite", horizon)
    .limit(SCAN_LIMIT);
  const rows = (data ?? []) as {
    id: string; numero: string | null; date_validite: string | null; montant_ttc: number | null; client_id: string | null;
  }[];
  const clients = await loadClients(db, tenantId, rows.map((r) => r.client_id ?? ""));
  const out: WatcherMatch[] = [];
  for (const d of rows) {
    const date = d.date_validite ? d.date_validite.slice(0, 10) : "";
    if (!date) continue;
    const cl = d.client_id ? clients.get(d.client_id) : undefined;
    const left = daysUntil(date);
    out.push({
      ficheId: d.id,
      entity: "devis",
      label: `Devis ${d.numero ?? "?"}`,
      detail: `${money(d.montant_ttc)} TTC, valable jusqu'au ${frDate(date)}${left != null ? ` (expire dans ${left} j)` : ""}${cl?.nom ? `, ${cl.nom}` : ""}`,
      email: cl?.email ?? null,
      contactName: cl?.nom ?? null,
      dedupExtra: date, // validité prolongée → nouvelle date → re-déclenche
      raw: { numero: d.numero, montant_ttc: d.montant_ttc, date_validite: date, client_id: d.client_id, client_nom: cl?.nom ?? null },
    });
  }
  return out;
}

/**
 * Factures NON SOLDÉES dont l'échéance APPROCHE (fenêtre J-`windowDays`) : rappel
 * de paiement AVANT le retard. Fenêtre FUTURE (échéance aujourd'hui → horizon).
 * La date d'échéance entre dans la clé (dedupExtra) : une échéance replanifiée
 * re-déclenche. Complémentaire de facture_impayee (qui, lui, agit APRÈS l'échéance).
 */
async function runFactureEcheanceProche(db: SupabaseClient, tenantId: string, windowDays: number): Promise<WatcherMatch[]> {
  const win = Math.max(1, Math.floor(windowDays) || 7);
  const today = isoDate(0);
  const horizon = isoDate(win);
  const { data } = await db
    .from("factures")
    .select("id, numero, statut, date_echeance, montant_ttc, montant_paye, client_id")
    .eq("tenant_id", tenantId)
    .in("statut", ["envoyee", "partiellement_payee"])
    .not("date_echeance", "is", null)
    .gte("date_echeance", today)
    .lte("date_echeance", horizon)
    .limit(SCAN_LIMIT);
  const rows = (data ?? []) as {
    id: string; numero: string | null; date_echeance: string | null;
    montant_ttc: number | null; montant_paye: number | null; client_id: string | null;
  }[];
  const clients = await loadClients(db, tenantId, rows.map((r) => r.client_id ?? ""));
  const out: WatcherMatch[] = [];
  for (const f of rows) {
    const date = f.date_echeance ? f.date_echeance.slice(0, 10) : "";
    if (!date) continue;
    const cl = f.client_id ? clients.get(f.client_id) : undefined;
    const left = daysUntil(date);
    const reste = Number(f.montant_ttc ?? 0) - Number(f.montant_paye ?? 0);
    out.push({
      ficheId: f.id,
      entity: "factures",
      label: `Facture ${f.numero ?? "?"}`,
      detail: `${money(reste > 0 ? reste : f.montant_ttc)} à régler, échéance le ${frDate(date)}${left != null ? ` (dans ${left} j)` : ""}${cl?.nom ? `, ${cl.nom}` : ""}`,
      email: cl?.email ?? null,
      contactName: cl?.nom ?? null,
      dedupExtra: date, // échéance replanifiée → nouvelle date → re-déclenche
      raw: { numero: f.numero, montant_ttc: f.montant_ttc, montant_paye: f.montant_paye, date_echeance: date, client_id: f.client_id, client_nom: cl?.nom ?? null },
    });
  }
  return out;
}

/** Factures échues non soldées (envoyée / partiellement payée / en retard). */
async function runFactureImpayee(db: SupabaseClient, tenantId: string, graceDays: number): Promise<WatcherMatch[]> {
  const { data } = await db
    .from("factures")
    .select("id, numero, statut, date_echeance, montant_ttc, montant_paye, client_id")
    .eq("tenant_id", tenantId)
    .in("statut", ["envoyee", "partiellement_payee", "en_retard"])
    .limit(SCAN_LIMIT);
  const rows = (data ?? []) as {
    id: string; numero: string | null; date_echeance: string | null;
    montant_ttc: number | null; montant_paye: number | null; client_id: string | null;
  }[];
  const clients = await loadClients(db, tenantId, rows.map((r) => r.client_id ?? ""));
  const cutoff = isoDate(-Math.max(0, graceDays));
  const out: WatcherMatch[] = [];
  for (const f of rows) {
    if (!f.date_echeance || f.date_echeance >= cutoff) continue;
    const late = daysSince(f.date_echeance);
    const cl = f.client_id ? clients.get(f.client_id) : undefined;
    const reste = Number(f.montant_ttc ?? 0) - Number(f.montant_paye ?? 0);
    out.push({
      ficheId: f.id,
      label: `Facture ${f.numero ?? "?"}`,
      detail: `${money(reste > 0 ? reste : f.montant_ttc)} dû, échue depuis ${late} j${cl?.nom ? ` (${cl.nom})` : ""}`,
      email: cl?.email ?? null,
      contactName: cl?.nom ?? null,
    });
  }
  return out;
}

/** Échéances à venir (J-`windowDays`) : documents, assurances, entretiens, contrats, contrôles. */
async function runEcheanceProche(db: SupabaseClient, tenantId: string, windowDays: number): Promise<WatcherMatch[]> {
  const today = isoDate(0);
  const horizon = isoDate(Math.max(1, windowDays));
  const out: WatcherMatch[] = [];

  // Petite fabrique : une table + sa colonne date + son étiquette.
  const sources: {
    table: string; dateCol: string; prefix: string;
    select: string; label: (r: Record<string, unknown>) => string;
  }[] = [
    { table: "documents", dateCol: "expires_at", prefix: "doc", select: "id, nom, type, expires_at",
      label: (r) => `Document « ${r.nom ?? r.type ?? "?"} »` },
    { table: "suppliers", dateCol: "assurance_expire", prefix: "sup", select: "id, nom, assurance_expire",
      label: (r) => `Assurance décennale — ${r.nom ?? "?"}` },
    { table: "parc_installe", dateCol: "prochain_entretien", prefix: "parc", select: "id, type, marque, prochain_entretien",
      label: (r) => `Entretien à prévoir — ${[r.type, r.marque].filter(Boolean).join(" ") || "équipement"}` },
    { table: "contrats", dateCol: "prochaine_echeance", prefix: "contrat", select: "id, reference, type, prochaine_echeance",
      label: (r) => `Contrat ${r.reference ?? r.type ?? ""}`.trim() },
    { table: "equipment", dateCol: "prochain_controle", prefix: "equip", select: "id, nom, prochain_controle",
      label: (r) => `Contrôle matériel — ${r.nom ?? "?"}` },
  ];

  for (const s of sources) {
    const { data, error } = await db
      .from(s.table)
      .select(s.select)
      .eq("tenant_id", tenantId)
      .gte(s.dateCol, today)
      .lte(s.dateCol, horizon)
      .limit(SCAN_LIMIT);
    if (error) continue; // table absente / migration partielle → on ignore cette source
    // select() dynamique → Supabase ne peut pas inférer le type : cast via unknown.
    for (const r of ((data ?? []) as unknown) as Record<string, unknown>[]) {
      const date = String(r[s.dateCol] ?? "").slice(0, 10);
      if (!date) continue;
      out.push({
        ficheId: `${s.prefix}:${String(r.id)}`,
        label: s.label(r),
        detail: `échéance le ${frDate(date)}`,
        // La date entre dans la clé : une échéance renouvelée à une autre date re-déclenche.
        dedupExtra: date,
      });
    }
  }
  return out;
}

/** Interventions RÉCEMMENT terminées (visite/SAV) → matière à compte-rendu. */
async function runVisiteTerminee(db: SupabaseClient, tenantId: string, windowDays: number): Promise<WatcherMatch[]> {
  const cutoff = new Date(Date.now() - Math.max(1, windowDays) * 86_400_000).toISOString();
  const { data } = await db
    .from("interventions")
    .select("id, type, description, rapport, statut, date_reelle, date_prevue, duree_heures, client_id, chantier_id, employee_id")
    .eq("tenant_id", tenantId)
    .eq("statut", "termine")
    .gte("date_reelle", cutoff) // récemment closes → pas de rattrapage massif de l'historique
    .limit(SCAN_LIMIT);
  const rows = (data ?? []) as {
    id: string; type: string | null; description: string | null; rapport: string | null;
    date_reelle: string | null; duree_heures: number | null;
    client_id: string | null; chantier_id: string | null; employee_id: string | null;
  }[];
  if (rows.length === 0) return [];
  const [clients, chantiers, employees] = await Promise.all([
    loadClients(db, tenantId, rows.map((r) => r.client_id ?? "")),
    loadNamed(db, tenantId, "chantiers", rows.map((r) => r.chantier_id ?? "")),
    loadNamed(db, tenantId, "employees", rows.map((r) => r.employee_id ?? "")),
  ]);
  const out: WatcherMatch[] = [];
  for (const iv of rows) {
    const cl = iv.client_id ? clients.get(iv.client_id) : undefined;
    const ch = iv.chantier_id ? chantiers.get(iv.chantier_id) : undefined;
    const emp = iv.employee_id ? employees.get(iv.employee_id) : undefined;
    const chantierNom = ch ? String(ch.nom ?? "") : "";
    const clientNom = cl?.nom ?? "";
    const empNom = emp ? [emp.prenom, emp.nom].filter(Boolean).join(" ") : "";
    const dateStr = iv.date_reelle ? iv.date_reelle.slice(0, 10) : "";
    out.push({
      ficheId: iv.id,
      label: `Visite ${iv.type ?? "chantier"}${chantierNom ? ` — ${chantierNom}` : clientNom ? ` — ${clientNom}` : ""}`,
      detail: `terminée${dateStr ? ` le ${frDate(dateStr)}` : ""}${empNom ? ` par ${empNom}` : ""}`,
      raw: {
        type: iv.type,
        description: iv.description,
        rapport: iv.rapport,
        date_reelle: dateStr,
        duree_heures: iv.duree_heures,
        chantier_nom: chantierNom,
        chantier_adresse: ch ? [ch.adresse, ch.ville].filter(Boolean).join(", ") : "",
        client_nom: clientNom,
        employee_nom: empNom,
      },
    });
  }
  return out;
}

/**
 * Chantiers dont le budget ENGAGÉ dépasse le budget prévu (dérive de marge).
 * Le paramètre numérique est ici une TOLÉRANCE EN POURCENT (0 = alerte dès le
 * premier euro de dépassement ; 10 = seulement au-delà de +10 %). Un chantier
 * sans budget renseigné n'est jamais comparé (rien à mesurer).
 */
async function runChantierHorsBudget(db: SupabaseClient, tenantId: string, tolerancePct: number): Promise<WatcherMatch[]> {
  const { data } = await db
    .from("chantiers")
    .select("id, nom, statut, budget, budget_engage")
    .eq("tenant_id", tenantId)
    .in("statut", ["en_attente", "en_cours", "en_retard"])
    .limit(SCAN_LIMIT);
  const tol = Math.max(0, tolerancePct) / 100;
  const out: WatcherMatch[] = [];
  for (const c of (data ?? []) as { id: string; nom: string | null; budget: number | null; budget_engage: number | null }[]) {
    const budget = Number(c.budget) || 0;
    const engage = Number(c.budget_engage) || 0;
    if (budget <= 0) continue; // pas de budget défini → rien à comparer
    if (engage <= budget * (1 + tol)) continue;
    const over = engage - budget;
    const pct = Math.round((over / budget) * 100);
    out.push({
      ficheId: c.id,
      label: `Chantier « ${c.nom ?? "sans nom"} »`,
      detail: `budget ${money(budget)} dépassé de ${money(over)} (+${pct} %) — engagé ${money(engage)}`,
    });
  }
  return out;
}

/**
 * Chantiers EN COURS qui n'avancent plus : aucune activité depuis `staleDays`.
 * « Activité » = la fiche chantier modifiée, OU un pointage saisi, OU une
 * intervention touchée sur ce chantier dans la fenêtre. On croise les trois pour
 * ne pas crier au loup sur un chantier réellement travaillé (pointages quotidiens)
 * dont seule la fiche n'a pas bougé. Re-signalé chaque semaine tant qu'il stagne.
 */
async function runChantierSansActivite(db: SupabaseClient, tenantId: string, staleDays: number): Promise<WatcherMatch[]> {
  const days = Math.max(1, Math.floor(staleDays) || 3);
  const cutoffMs = Date.now() - days * 86_400_000;
  const cutoffIso = new Date(cutoffMs).toISOString();
  const cutoffDate = cutoffIso.slice(0, 10);

  const { data } = await db
    .from("chantiers")
    .select("id, nom, statut, avancement, updated_at")
    .eq("tenant_id", tenantId)
    .in("statut", ["en_cours", "en_retard"])
    .limit(SCAN_LIMIT);
  const rows = (data ?? []) as { id: string; nom: string | null; avancement: number | null; updated_at: string | null }[];
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  // Chantiers avec une activité ANNEXE récente (pointage ou intervention) → actifs.
  const active = new Set<string>();
  const [{ data: pts }, { data: ivs }] = await Promise.all([
    db.from("pointages").select("chantier_id, date_pointage").eq("tenant_id", tenantId).in("chantier_id", ids).gte("date_pointage", cutoffDate),
    db.from("interventions").select("chantier_id, updated_at").eq("tenant_id", tenantId).in("chantier_id", ids).gte("updated_at", cutoffIso),
  ]);
  for (const p of (pts ?? []) as { chantier_id: string | null }[]) if (p.chantier_id) active.add(String(p.chantier_id));
  for (const iv of (ivs ?? []) as { chantier_id: string | null }[]) if (iv.chantier_id) active.add(String(iv.chantier_id));

  const out: WatcherMatch[] = [];
  for (const c of rows) {
    if (active.has(c.id)) continue; // du travail a été noté ailleurs
    const touched = c.updated_at ? Date.parse(c.updated_at) : 0;
    if (touched >= cutoffMs) continue; // fiche modifiée récemment
    const since = touched ? Math.floor((Date.now() - touched) / 86_400_000) : null;
    out.push({
      ficheId: c.id,
      label: `Chantier « ${c.nom ?? "sans nom"} »`,
      detail: `aucune activité depuis ${since != null ? `${since} j` : "un moment"} (avancement ${Number(c.avancement) || 0} %)`,
    });
  }
  return out;
}

/**
 * Chantiers EN COURS sans devis SIGNÉ (accepté) rattaché : on démarre les
 * travaux sans le document qui protège (accord de prix). `graceDays` = tolérance
 * après la date de début avant de s'inquiéter. Re-signalé chaque semaine.
 */
async function runChantierSansDevis(db: SupabaseClient, tenantId: string, graceDays: number): Promise<WatcherMatch[]> {
  const grace = Math.max(0, Math.floor(graceDays));
  const cutoff = isoDate(-grace); // démarré il y a plus de `grace` jours
  const { data } = await db
    .from("chantiers")
    .select("id, nom, statut, date_debut")
    .eq("tenant_id", tenantId)
    .in("statut", ["en_cours", "en_retard"])
    .limit(SCAN_LIMIT);
  const rows = (data ?? []) as { id: string; nom: string | null; date_debut: string | null }[];
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  const { data: devisRows } = await db
    .from("devis")
    .select("chantier_id, statut")
    .eq("tenant_id", tenantId)
    .eq("statut", "accepte")
    .in("chantier_id", ids);
  const withAccepted = new Set<string>();
  for (const d of (devisRows ?? []) as { chantier_id: string | null }[]) if (d.chantier_id) withAccepted.add(String(d.chantier_id));

  const out: WatcherMatch[] = [];
  for (const c of rows) {
    if (withAccepted.has(c.id)) continue;
    // Tolérance : un chantier démarré tout récemment n'est pas encore « en faute ».
    if (grace > 0 && c.date_debut && c.date_debut > cutoff) continue;
    out.push({
      ficheId: c.id,
      label: `Chantier « ${c.nom ?? "sans nom"} »`,
      detail: `en cours sans devis signé${c.date_debut ? ` (démarré le ${frDate(c.date_debut)})` : ""}`,
    });
  }
  return out;
}

/**
 * CANDIDATS pour le jugement IA (#7 SAV urgent) : interventions/demandes encore
 * OUVERTES (ni terminées ni annulées) porteuses d'une description à lire. Ce
 * veilleur ne décide PAS de l'urgence — il pré-filtre en SQL (bon marché), et
 * l'exécuteur laisse l'IA lire chaque description pour juger (aiJudge). Le
 * paramètre = âge minimum en jours avant d'examiner (0 = tout de suite).
 */
async function runDemandeUrgente(db: SupabaseClient, tenantId: string, minAgeDays: number): Promise<WatcherMatch[]> {
  const { data } = await db
    .from("interventions")
    .select("id, type, description, statut, created_at, client_id")
    .eq("tenant_id", tenantId)
    .not("statut", "in", "(termine,annule)")
    .not("description", "is", null)
    .order("created_at", { ascending: true })
    .limit(SCAN_LIMIT);
  const rows = (data ?? []) as {
    id: string; type: string | null; description: string | null; created_at: string | null; client_id: string | null;
  }[];
  if (rows.length === 0) return [];
  const clients = await loadClients(db, tenantId, rows.map((r) => r.client_id ?? ""));
  const minAge = Math.max(0, Math.floor(minAgeDays));
  const out: WatcherMatch[] = [];
  for (const iv of rows) {
    const desc = String(iv.description ?? "").trim();
    if (!desc) continue;
    const age = iv.created_at ? Math.floor((Date.now() - Date.parse(iv.created_at)) / 86_400_000) : 0;
    if (minAge > 0 && age < minAge) continue;
    const cl = iv.client_id ? clients.get(iv.client_id) : undefined;
    out.push({
      ficheId: iv.id,
      label: `Demande ${iv.type ?? "client"}${cl?.nom ? ` — ${cl.nom}` : ""}`,
      detail: `${desc.slice(0, 200)}${desc.length > 200 ? "…" : ""} (en attente depuis ${age} j)`,
    });
  }
  return out;
}

/**
 * Matériaux dont la quantité en stock est tombée à son seuil d'alerte (ou en
 * dessous). Seuls les matériaux AVEC un seuil renseigné (> 0) sont surveillés :
 * sans seuil, il n'y a rien à comparer. Le paramètre `days` n'a pas de sens ici.
 * Re-signalé chaque semaine tant que le stock reste bas (refireDays).
 */
async function runStockBas(db: SupabaseClient, tenantId: string): Promise<WatcherMatch[]> {
  const { data } = await db
    .from("materials")
    .select("id, nom, reference, quantite, unite, seuil_alerte")
    .eq("tenant_id", tenantId)
    .not("seuil_alerte", "is", null)
    .limit(SCAN_LIMIT);
  const out: WatcherMatch[] = [];
  for (const m of (data ?? []) as {
    id: string; nom: string | null; reference: string | null;
    quantite: number | null; unite: string | null; seuil_alerte: number | null;
  }[]) {
    const seuil = Number(m.seuil_alerte);
    if (!Number.isFinite(seuil) || seuil <= 0) continue; // pas de seuil → rien à comparer
    const qte = Number(m.quantite) || 0;
    if (qte > seuil) continue;
    const nom = m.nom ?? m.reference ?? "matériau";
    out.push({
      ficheId: m.id,
      label: `Stock bas — ${nom}`,
      detail: `${qte} ${m.unite ?? ""}`.trim() + ` en stock (seuil ${seuil})`,
    });
  }
  return out;
}

/**
 * Devis RÉCEMMENT acceptés → mot de confirmation/remerciement au client.
 * Fenêtre récente (updated_at) pour ne PAS relancer tout l'historique au premier
 * passage ; l'idempotence (refireDays=null) garantit UN seul envoi par devis.
 */
async function runDevisAccepte(db: SupabaseClient, tenantId: string, windowDays: number): Promise<WatcherMatch[]> {
  const cutoff = new Date(Date.now() - Math.max(1, windowDays) * 86_400_000).toISOString();
  const { data } = await db
    .from("devis")
    .select("id, numero, statut, montant_ttc, client_id, chantier_id, updated_at")
    .eq("tenant_id", tenantId)
    .eq("statut", "accepte")
    .gte("updated_at", cutoff)
    .limit(SCAN_LIMIT);
  const rows = (data ?? []) as { id: string; numero: string | null; montant_ttc: number | null; client_id: string | null; chantier_id: string | null }[];
  const clients = await loadClients(db, tenantId, rows.map((r) => r.client_id ?? ""));
  const out: WatcherMatch[] = [];
  for (const d of rows) {
    const cl = d.client_id ? clients.get(d.client_id) : undefined;
    out.push({
      ficheId: d.id,
      entity: "devis",
      label: `Devis ${d.numero ?? "?"} accepté`,
      detail: `${money(d.montant_ttc)} TTC accepté${cl?.nom ? ` par ${cl.nom}` : ""}`,
      email: cl?.email ?? null,
      contactName: cl?.nom ?? null,
      raw: { numero: d.numero, montant_ttc: d.montant_ttc, client_id: d.client_id, chantier_id: d.chantier_id, client_nom: cl?.nom ?? null },
    });
  }
  return out;
}

/**
 * Factures RÉCEMMENT soldées (payée) → remerciement au client. Même logique de
 * fenêtre récente + envoi unique par facture que les devis acceptés.
 */
async function runFacturePayee(db: SupabaseClient, tenantId: string, windowDays: number): Promise<WatcherMatch[]> {
  const cutoff = new Date(Date.now() - Math.max(1, windowDays) * 86_400_000).toISOString();
  const { data } = await db
    .from("factures")
    .select("id, numero, statut, montant_ttc, client_id, updated_at")
    .eq("tenant_id", tenantId)
    .eq("statut", "payee")
    .gte("updated_at", cutoff)
    .limit(SCAN_LIMIT);
  const rows = (data ?? []) as { id: string; numero: string | null; montant_ttc: number | null; client_id: string | null }[];
  const clients = await loadClients(db, tenantId, rows.map((r) => r.client_id ?? ""));
  const out: WatcherMatch[] = [];
  for (const f of rows) {
    const cl = f.client_id ? clients.get(f.client_id) : undefined;
    out.push({
      ficheId: f.id,
      label: `Facture ${f.numero ?? "?"} payée`,
      detail: `${money(f.montant_ttc)} réglé${cl?.nom ? ` par ${cl.nom}` : ""}`,
      email: cl?.email ?? null,
      contactName: cl?.nom ?? null,
    });
  }
  return out;
}

/**
 * Interventions/RDV À VENIR (dans les `leadDays` prochains jours) → rappel au
 * client. Fenêtre FUTURE : aucun risque de rattraper l'historique. La date entre
 * dans la clé (dedupExtra) : un RDV replanifié à une autre date re-déclenche.
 */
async function runRdvDemain(db: SupabaseClient, tenantId: string, leadDays: number): Promise<WatcherMatch[]> {
  const lead = Math.max(1, Math.floor(leadDays) || 1);
  const today = isoDate(0);
  const upperExcl = isoDate(lead + 1); // borne haute EXCLUSIVE → journée horizon incluse même si la colonne est un timestamp
  const { data } = await db
    .from("interventions")
    .select("id, type, statut, date_prevue, client_id, chantier_id")
    .eq("tenant_id", tenantId)
    .in("statut", ["planifie", "en_cours"])
    .gte("date_prevue", today)
    .lt("date_prevue", upperExcl)
    .limit(SCAN_LIMIT);
  const rows = (data ?? []) as {
    id: string; type: string | null; date_prevue: string | null; client_id: string | null; chantier_id: string | null;
  }[];
  if (rows.length === 0) return [];
  const [clients, chantiers] = await Promise.all([
    loadClients(db, tenantId, rows.map((r) => r.client_id ?? "")),
    loadNamed(db, tenantId, "chantiers", rows.map((r) => r.chantier_id ?? "")),
  ]);
  const out: WatcherMatch[] = [];
  for (const iv of rows) {
    const cl = iv.client_id ? clients.get(iv.client_id) : undefined;
    const ch = iv.chantier_id ? chantiers.get(iv.chantier_id) : undefined;
    const chantierNom = ch ? String(ch.nom ?? "") : "";
    const date = iv.date_prevue ? iv.date_prevue.slice(0, 10) : "";
    out.push({
      ficheId: iv.id,
      label: `RDV ${iv.type ?? "intervention"}${chantierNom ? ` — ${chantierNom}` : cl?.nom ? ` — ${cl.nom}` : ""}`,
      detail: `prévu le ${frDate(date)}`,
      email: cl?.email ?? null,
      contactName: cl?.nom ?? null,
      dedupExtra: date, // re-déclenche si le RDV est replanifié à une autre date
    });
  }
  return out;
}

/**
 * Chantiers RÉCEMMENT terminés → demande d'avis / recommandation au client (et
 * rappel du solde à facturer). Fenêtre récente (updated_at) + envoi unique par
 * chantier, comme les devis acceptés.
 */
async function runChantierTermine(db: SupabaseClient, tenantId: string, windowDays: number): Promise<WatcherMatch[]> {
  const cutoff = new Date(Date.now() - Math.max(1, windowDays) * 86_400_000).toISOString();
  const { data } = await db
    .from("chantiers")
    .select("id, nom, statut, client_id, updated_at")
    .eq("tenant_id", tenantId)
    .eq("statut", "termine")
    .gte("updated_at", cutoff)
    .limit(SCAN_LIMIT);
  const rows = (data ?? []) as { id: string; nom: string | null; client_id: string | null }[];
  const clients = await loadClients(db, tenantId, rows.map((r) => r.client_id ?? ""));
  const out: WatcherMatch[] = [];
  for (const c of rows) {
    const cl = c.client_id ? clients.get(c.client_id) : undefined;
    out.push({
      ficheId: c.id,
      entity: "chantiers",
      label: `Chantier « ${c.nom ?? "sans nom"} » terminé`,
      detail: `chantier terminé${cl?.nom ? ` pour ${cl.nom}` : ""}`,
      email: cl?.email ?? null,
      contactName: cl?.nom ?? null,
      raw: { nom: c.nom, client_id: c.client_id, client_nom: cl?.nom ?? null },
    });
  }
  return out;
}

/**
 * Nouvelles soumissions de formulaire public (leads) encore non traitées →
 * alerte l'artisan. Fenêtre récente + une fois par soumission. Le lead brut
 * reste dans form_submissions ; l'artisan le convertit ensuite en client.
 */
async function runNouveauLead(db: SupabaseClient, tenantId: string, windowDays: number): Promise<WatcherMatch[]> {
  const cutoff = new Date(Date.now() - Math.max(1, windowDays) * 86_400_000).toISOString();
  const { data } = await db
    .from("form_submissions")
    .select("id, payload, status, created_at")
    .eq("tenant_id", tenantId)
    .eq("status", "new")
    .gte("created_at", cutoff)
    .limit(SCAN_LIMIT);
  const rows = (data ?? []) as { id: string; payload: Record<string, unknown> | null }[];
  const out: WatcherMatch[] = [];
  for (const r of rows) {
    const p = (r.payload ?? {}) as Record<string, unknown>;
    const nom = String(p.nom ?? p.name ?? "").trim();
    const msg = String(p.message ?? p.demande ?? p.projet ?? "").trim();
    out.push({
      ficheId: r.id,
      // Pas une entité workspace : la donnée utile du lead est dans `raw` (payload
      // brut), pour qu'un act « crée la fiche client depuis le lead » l'exploite.
      label: `Nouveau lead${nom ? ` — ${nom}` : ""}`,
      detail: msg ? `${msg.slice(0, 160)}${msg.length > 160 ? "…" : ""}` : "nouvelle demande reçue via formulaire",
      email: (typeof p.email === "string" && p.email.includes("@") ? p.email : null),
      contactName: nom || null,
      raw: { ...p },
    });
  }
  return out;
}

/**
 * Clients RÉCEMMENT créés (fenêtre created_at) → matière à un act « à chaque
 * nouveau client, prépare X » (fiche chantier, devis brouillon, tâche d'accueil…).
 * Fenêtre récente + une fois par fiche : on ne rejoue pas tout l'historique.
 */
async function runNouveauClient(db: SupabaseClient, tenantId: string, windowDays: number): Promise<WatcherMatch[]> {
  const cutoff = new Date(Date.now() - Math.max(1, windowDays) * 86_400_000).toISOString();
  const { data } = await db
    .from("clients")
    .select("id, nom, email, tel, ville, type, created_at")
    .eq("tenant_id", tenantId)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(SCAN_LIMIT);
  const rows = (data ?? []) as { id: string; nom: string | null; email: string | null; tel: string | null; ville: string | null; type: string | null }[];
  const out: WatcherMatch[] = [];
  for (const c of rows) {
    out.push({
      ficheId: c.id,
      entity: "clients",
      label: `Nouveau client — ${c.nom ?? "sans nom"}`,
      detail: `${c.type ?? "client"}${c.ville ? ` · ${c.ville}` : ""}${c.email ? ` · ${c.email}` : ""}`.trim(),
      email: c.email ?? null,
      contactName: c.nom ?? null,
      raw: { nom: c.nom, email: c.email, tel: c.tel, ville: c.ville, type: c.type },
    });
  }
  return out;
}

/**
 * Clients INACTIFS : aucune activité (devis, facture, intervention) depuis plus de
 * `inactiveDays` jours → à recontacter. L'inactivité est CALCULÉE (pas une colonne
 * à maintenir) : on marque « actifs » les clients touchés récemment, les autres
 * (créés il y a un moment, non archivés) sont signalés. Re-signalé tous les 30 j
 * tant qu'ils restent inactifs (refireDays).
 */
async function runClientInactif(db: SupabaseClient, tenantId: string, inactiveDays: number): Promise<WatcherMatch[]> {
  const days = Math.max(7, Math.floor(inactiveDays) || 90);
  const cutoffIso = new Date(Date.now() - days * 86_400_000).toISOString();
  const cutoffDate = cutoffIso.slice(0, 10);

  const { data } = await db
    .from("clients")
    .select("id, nom, email, statut, created_at")
    .eq("tenant_id", tenantId)
    .neq("statut", "archive")
    .limit(SCAN_LIMIT);
  const clients = (data ?? []) as {
    id: string; nom: string | null; email: string | null; statut: string | null; created_at: string | null;
  }[];
  if (clients.length === 0) return [];
  const ids = clients.map((c) => c.id);

  // « Actifs » = clients touchés récemment par un devis, une facture ou une intervention.
  const active = new Set<string>();
  const [{ data: dv }, { data: fc }, { data: iv }] = await Promise.all([
    db.from("devis").select("client_id, date_devis").eq("tenant_id", tenantId).in("client_id", ids).gte("date_devis", cutoffDate),
    db.from("factures").select("client_id, date_facture").eq("tenant_id", tenantId).in("client_id", ids).gte("date_facture", cutoffDate),
    db.from("interventions").select("client_id, date_prevue").eq("tenant_id", tenantId).in("client_id", ids).gte("date_prevue", cutoffIso),
  ]);
  for (const r of (dv ?? []) as { client_id: string | null }[]) if (r.client_id) active.add(String(r.client_id));
  for (const r of (fc ?? []) as { client_id: string | null }[]) if (r.client_id) active.add(String(r.client_id));
  for (const r of (iv ?? []) as { client_id: string | null }[]) if (r.client_id) active.add(String(r.client_id));

  const out: WatcherMatch[] = [];
  for (const c of clients) {
    if (active.has(c.id)) continue;
    // Un client tout récemment créé n'est pas « inactif » : on lui laisse le temps.
    if (c.created_at && c.created_at > cutoffIso) continue;
    out.push({
      ficheId: c.id,
      entity: "clients",
      label: `Client ${c.nom ?? "sans nom"}`,
      detail: `aucune activité (devis, facture, intervention) depuis plus de ${days} j`,
      email: c.email ?? null,
      contactName: c.nom ?? null,
      raw: { nom: c.nom, email: c.email, statut: c.statut },
    });
  }
  return out;
}

/**
 * Chantiers RÉCEMMENT créés (fenêtre created_at) → matière à un act « à chaque
 * nouveau chantier, crée les tâches / le devis brouillon / etc. ». Fenêtre récente
 * + une fois par fiche.
 */
async function runNouveauChantier(db: SupabaseClient, tenantId: string, windowDays: number): Promise<WatcherMatch[]> {
  const cutoff = new Date(Date.now() - Math.max(1, windowDays) * 86_400_000).toISOString();
  const { data } = await db
    .from("chantiers")
    .select("id, nom, client_id, ville, statut, budget, created_at")
    .eq("tenant_id", tenantId)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(SCAN_LIMIT);
  const rows = (data ?? []) as { id: string; nom: string | null; client_id: string | null; ville: string | null; statut: string | null; budget: number | null }[];
  const clients = await loadClients(db, tenantId, rows.map((r) => r.client_id ?? ""));
  const out: WatcherMatch[] = [];
  for (const c of rows) {
    const cl = c.client_id ? clients.get(c.client_id) : undefined;
    out.push({
      ficheId: c.id,
      entity: "chantiers",
      label: `Nouveau chantier — ${c.nom ?? "sans nom"}`,
      detail: `${c.statut ?? "en attente"}${cl?.nom ? ` · ${cl.nom}` : ""}${c.ville ? ` · ${c.ville}` : ""}`.trim(),
      contactName: cl?.nom ?? null,
      raw: { nom: c.nom, client_id: c.client_id, client_nom: cl?.nom ?? null, ville: c.ville, statut: c.statut, budget: c.budget },
    });
  }
  return out;
}

/**
 * Interventions AFFECTÉES qui se CHEVAUCHENT pour un même intervenant dans la
 * fenêtre à venir (J → J+`days`) : un salarié ne peut pas être sur deux chantiers
 * en même temps. Alerte le patron pour qu'il replanifie. Une fois par paire (la
 * clé d'idempotence trie les deux ids), tant que le chevauchement subsiste.
 */
async function runConflitPlanning(db: SupabaseClient, tenantId: string, days: number): Promise<WatcherMatch[]> {
  const from = Date.now();
  const horizon = Math.max(1, Math.floor(days) || 14);
  const items = await loadPlannedInterventions(db, tenantId, from, from + horizon * 86_400_000);
  const conflicts = findConflicts(items);
  if (conflicts.length === 0) return [];

  const empIds = conflicts.flatMap((c) => [c.a.employeeId ?? "", c.b.employeeId ?? ""]);
  const chIds = conflicts.flatMap((c) => [c.a.chantierId ?? "", c.b.chantierId ?? ""]);
  const [employees, chantiers] = await Promise.all([
    loadNamed(db, tenantId, "employees", empIds),
    loadNamed(db, tenantId, "chantiers", chIds),
  ]);

  const out: WatcherMatch[] = [];
  for (const c of conflicts) {
    const emp = c.a.employeeId ? employees.get(c.a.employeeId) : undefined;
    const empNom = emp ? [emp.prenom, emp.nom].filter(Boolean).join(" ") || "un intervenant" : "un intervenant";
    const chA = c.a.chantierId ? chantiers.get(c.a.chantierId) : undefined;
    const chB = c.b.chantierId ? chantiers.get(c.b.chantierId) : undefined;
    const labA = chA ? String(chA.nom ?? "") : c.a.type ?? "intervention";
    const labB = chB ? String(chB.nom ?? "") : c.b.type ?? "intervention";
    // Clé stable par PAIRE (ids triés) : une seule alerte par chevauchement.
    const pair = [c.a.id, c.b.id].sort().join("|");
    out.push({
      ficheId: `conflit:${pair}`,
      label: `Conflit de planning — ${empNom}`,
      detail: `${empNom} est affecté à deux interventions qui se chevauchent le ${formatWhenFr(c.a.start)} : « ${labA} » et « ${labB} ». À replanifier.`,
    });
  }
  return out;
}

/**
 * Interventions RÉCEMMENT annulées (statut `annule`) → prévenir le client que son
 * rendez-vous est annulé, ou alerter le patron. Fenêtre récente (updated_at) +
 * une fois par fiche : on ne rejoue pas tout l'historique au premier passage.
 */
async function runInterventionAnnulee(db: SupabaseClient, tenantId: string, windowDays: number): Promise<WatcherMatch[]> {
  const cutoff = new Date(Date.now() - Math.max(1, windowDays) * 86_400_000).toISOString();
  const { data } = await db
    .from("interventions")
    .select("id, type, statut, date_prevue, client_id, chantier_id, updated_at")
    .eq("tenant_id", tenantId)
    .eq("statut", "annule")
    .gte("updated_at", cutoff)
    .limit(SCAN_LIMIT);
  const rows = (data ?? []) as {
    id: string; type: string | null; date_prevue: string | null; client_id: string | null; chantier_id: string | null;
  }[];
  if (rows.length === 0) return [];
  const [clients, chantiers] = await Promise.all([
    loadClients(db, tenantId, rows.map((r) => r.client_id ?? "")),
    loadNamed(db, tenantId, "chantiers", rows.map((r) => r.chantier_id ?? "")),
  ]);
  const out: WatcherMatch[] = [];
  for (const iv of rows) {
    const cl = iv.client_id ? clients.get(iv.client_id) : undefined;
    const ch = iv.chantier_id ? chantiers.get(iv.chantier_id) : undefined;
    const chantierNom = ch ? String(ch.nom ?? "") : "";
    const dateStr = iv.date_prevue ? iv.date_prevue.slice(0, 10) : "";
    out.push({
      ficheId: iv.id,
      entity: "interventions",
      label: `Intervention annulée${chantierNom ? ` — ${chantierNom}` : cl?.nom ? ` — ${cl.nom}` : ""}`,
      detail: `${iv.type ?? "intervention"} annulée${dateStr ? `, initialement prévue le ${frDate(dateStr)}` : ""}${cl?.nom ? ` (${cl.nom})` : ""}`,
      email: cl?.email ?? null,
      contactName: cl?.nom ?? null,
      raw: { type: iv.type, date_prevue: dateStr, client_id: iv.client_id, client_nom: cl?.nom ?? null, chantier_nom: chantierNom },
    });
  }
  return out;
}

/**
 * Tâches EN RETARD : échéance (due_date) dépassée et pas encore terminées.
 * `graceDays` = tolérance après l'échéance (0 = dès le lendemain). Re-signalé
 * chaque semaine tant qu'elles traînent (refireDays). Couvre aussi « non
 * commencées » (le statut todo/doing est rappelé dans le détail).
 */
async function runTacheEnRetard(db: SupabaseClient, tenantId: string, graceDays: number): Promise<WatcherMatch[]> {
  const cutoff = isoDate(-Math.max(0, Math.floor(graceDays)));
  const { data } = await db
    .from("tasks")
    .select("id, title, status, priority, due_date, chantier_id, assignee_id")
    .eq("tenant_id", tenantId)
    .neq("status", "done")
    .not("due_date", "is", null)
    .lt("due_date", cutoff)
    .limit(SCAN_LIMIT);
  const rows = (data ?? []) as {
    id: string; title: string | null; status: string | null; priority: string | null;
    due_date: string | null; chantier_id: string | null; assignee_id: string | null;
  }[];
  if (rows.length === 0) return [];
  const [employees, chantiers] = await Promise.all([
    loadNamed(db, tenantId, "employees", rows.map((r) => r.assignee_id ?? "")),
    loadNamed(db, tenantId, "chantiers", rows.map((r) => r.chantier_id ?? "")),
  ]);
  const out: WatcherMatch[] = [];
  for (const t of rows) {
    const late = t.due_date ? daysSince(t.due_date) : 0;
    const emp = t.assignee_id ? employees.get(t.assignee_id) : undefined;
    const empNom = emp ? [emp.prenom, emp.nom].filter(Boolean).join(" ") : "";
    const ch = t.chantier_id ? chantiers.get(t.chantier_id) : undefined;
    const chantierNom = ch ? String(ch.nom ?? "") : "";
    const etat = t.status === "doing" ? "en cours" : "pas commencée";
    out.push({
      ficheId: t.id,
      entity: "tasks",
      label: `Tâche en retard — ${t.title ?? "sans titre"}`,
      detail: `échue depuis ${late} j, ${etat}${empNom ? `, ${empNom}` : ", sans intervenant"}${chantierNom ? ` · ${chantierNom}` : ""}`,
      raw: { title: t.title, status: t.status, due_date: t.due_date, chantier_nom: chantierNom, employee_nom: empNom },
    });
  }
  return out;
}

/**
 * Tâches RÉCEMMENT terminées (status=done, updated_at dans la fenêtre) → prévenir
 * le patron qu'une tâche est bouclée. Fenêtre récente + une fois par tâche, comme
 * les autres transitions (devis_accepte, facture_payee).
 */
async function runTacheTerminee(db: SupabaseClient, tenantId: string, windowDays: number): Promise<WatcherMatch[]> {
  const cutoff = new Date(Date.now() - Math.max(1, windowDays) * 86_400_000).toISOString();
  const { data } = await db
    .from("tasks")
    .select("id, title, status, done_at, updated_at, chantier_id, assignee_id")
    .eq("tenant_id", tenantId)
    .eq("status", "done")
    .gte("updated_at", cutoff)
    .limit(SCAN_LIMIT);
  const rows = (data ?? []) as {
    id: string; title: string | null; done_at: string | null; chantier_id: string | null; assignee_id: string | null;
  }[];
  if (rows.length === 0) return [];
  const [employees, chantiers] = await Promise.all([
    loadNamed(db, tenantId, "employees", rows.map((r) => r.assignee_id ?? "")),
    loadNamed(db, tenantId, "chantiers", rows.map((r) => r.chantier_id ?? "")),
  ]);
  const out: WatcherMatch[] = [];
  for (const t of rows) {
    const emp = t.assignee_id ? employees.get(t.assignee_id) : undefined;
    const empNom = emp ? [emp.prenom, emp.nom].filter(Boolean).join(" ") : "";
    const ch = t.chantier_id ? chantiers.get(t.chantier_id) : undefined;
    const chantierNom = ch ? String(ch.nom ?? "") : "";
    out.push({
      ficheId: t.id,
      entity: "tasks",
      label: `Tâche terminée — ${t.title ?? "sans titre"}`,
      detail: `bouclée${empNom ? ` par ${empNom}` : ""}${chantierNom ? ` · ${chantierNom}` : ""}`,
      raw: { title: t.title, chantier_nom: chantierNom, employee_nom: empNom },
    });
  }
  return out;
}

/**
 * Tâches OUVERTES sans intervenant assigné (assignee_id null, pas terminées) :
 * un travail que personne n'a en charge. Re-signalé chaque semaine. Le paramètre
 * `days` n'a pas de sens ici.
 */
async function runTacheSansResponsable(db: SupabaseClient, tenantId: string): Promise<WatcherMatch[]> {
  const { data } = await db
    .from("tasks")
    .select("id, title, status, due_date, chantier_id")
    .eq("tenant_id", tenantId)
    .is("assignee_id", null)
    .neq("status", "done")
    .limit(SCAN_LIMIT);
  const rows = (data ?? []) as {
    id: string; title: string | null; due_date: string | null; chantier_id: string | null;
  }[];
  if (rows.length === 0) return [];
  const chantiers = await loadNamed(db, tenantId, "chantiers", rows.map((r) => r.chantier_id ?? ""));
  const out: WatcherMatch[] = [];
  for (const t of rows) {
    const ch = t.chantier_id ? chantiers.get(t.chantier_id) : undefined;
    const chantierNom = ch ? String(ch.nom ?? "") : "";
    out.push({
      ficheId: t.id,
      entity: "tasks",
      label: `Tâche sans intervenant — ${t.title ?? "sans titre"}`,
      detail: `personne n'est assigné${t.due_date ? `, échéance le ${frDate(t.due_date)}` : ""}${chantierNom ? ` · ${chantierNom}` : ""}`,
      raw: { title: t.title, due_date: t.due_date, chantier_nom: chantierNom },
    });
  }
  return out;
}

/**
 * Chantiers ACTIFS sans chef de chantier (chef_chantier_id null) : un chantier que
 * personne ne pilote. Re-signalé chaque semaine. Le paramètre `days` n'a pas de sens.
 */
async function runChantierSansResponsable(db: SupabaseClient, tenantId: string): Promise<WatcherMatch[]> {
  const { data } = await db
    .from("chantiers")
    .select("id, nom, statut, chef_chantier_id, ville")
    .eq("tenant_id", tenantId)
    .in("statut", ["en_attente", "en_cours", "en_retard"])
    .is("chef_chantier_id", null)
    .limit(SCAN_LIMIT);
  const out: WatcherMatch[] = [];
  for (const c of (data ?? []) as { id: string; nom: string | null; statut: string | null; ville: string | null }[]) {
    out.push({
      ficheId: c.id,
      entity: "chantiers",
      label: `Chantier sans chef — ${c.nom ?? "sans nom"}`,
      detail: `${c.statut ?? "actif"} sans chef de chantier désigné${c.ville ? ` · ${c.ville}` : ""}`,
      raw: { nom: c.nom, statut: c.statut, ville: c.ville },
    });
  }
  return out;
}

/**
 * Intervenants SURCHARGÉS : dont le nombre d'éléments OUVERTS (tâches non
 * terminées + interventions planifiées/en cours) dépasse un seuil. Le paramètre
 * numérique est ici le SEUIL par personne (défaut 8). Re-signalé chaque semaine.
 */
async function runEquipeSurchargee(db: SupabaseClient, tenantId: string, threshold: number): Promise<WatcherMatch[]> {
  const limit = Math.max(1, Math.floor(threshold) || 8);
  const [{ data: tks }, { data: ivs }] = await Promise.all([
    db.from("tasks").select("assignee_id, status").eq("tenant_id", tenantId).neq("status", "done").not("assignee_id", "is", null).limit(2000),
    db.from("interventions").select("employee_id, statut").eq("tenant_id", tenantId).in("statut", ["planifie", "en_cours"]).not("employee_id", "is", null).limit(2000),
  ]);
  const counts = new Map<string, { tasks: number; interventions: number }>();
  const bump = (id: string, kind: "tasks" | "interventions") => {
    const c = counts.get(id) ?? { tasks: 0, interventions: 0 };
    c[kind]++;
    counts.set(id, c);
  };
  for (const t of (tks ?? []) as { assignee_id: string | null }[]) if (t.assignee_id) bump(String(t.assignee_id), "tasks");
  for (const iv of (ivs ?? []) as { employee_id: string | null }[]) if (iv.employee_id) bump(String(iv.employee_id), "interventions");

  const overloaded = [...counts.entries()].filter(([, c]) => c.tasks + c.interventions > limit);
  if (overloaded.length === 0) return [];
  const employees = await loadNamed(db, tenantId, "employees", overloaded.map(([id]) => id));
  const out: WatcherMatch[] = [];
  for (const [id, c] of overloaded) {
    const emp = employees.get(id);
    const empNom = emp ? [emp.prenom, emp.nom].filter(Boolean).join(" ") || "un intervenant" : "un intervenant";
    const total = c.tasks + c.interventions;
    out.push({
      // Clé stable par personne : une alerte par semaine (refireDays), pas à chaque variation du compteur.
      ficheId: `surcharge:${id}`,
      label: `Charge élevée — ${empNom}`,
      detail: `${total} éléments ouverts (${c.tasks} tâche(s) + ${c.interventions} intervention(s)), au-dessus du seuil de ${limit}. À rééquilibrer.`,
    });
  }
  return out;
}

/**
 * Employés qui N'ONT PAS POINTÉ récemment. Robuste aux week-ends/congés : on ne
 * regarde que les « pointeurs réguliers » (au moins un pointage dans les 30 j) et
 * on n'alerte QUE si, sur la fenêtre récente (J-`days`, défaut 3), d'AUTRES ont
 * pointé (preuve que c'était une période travaillée). Pas d'invention : un employé
 * qui n'a jamais pointé n'est pas réclamé. Re-signalé chaque semaine.
 */
async function runPointageManquant(db: SupabaseClient, tenantId: string, days: number): Promise<WatcherMatch[]> {
  const window = Math.max(1, Math.floor(days) || 3);
  const recentCutoff = isoDate(-window);
  const monthCutoff = isoDate(-30);
  const { data: emps } = await db
    .from("employees")
    .select("id, nom, prenom, statut")
    .eq("tenant_id", tenantId)
    .eq("statut", "actif")
    .limit(SCAN_LIMIT);
  const employees = (emps ?? []) as { id: string; nom: string | null; prenom: string | null }[];
  if (employees.length === 0) return [];

  const { data: pts } = await db
    .from("pointages")
    .select("employee_id, date_pointage")
    .eq("tenant_id", tenantId)
    .gte("date_pointage", monthCutoff)
    .not("employee_id", "is", null)
    .limit(5000);
  const lastByEmp = new Map<string, string>();
  const pointedInWindow = new Set<string>();
  let windowHadActivity = false;
  for (const p of (pts ?? []) as { employee_id: string | null; date_pointage: string | null }[]) {
    if (!p.employee_id) continue;
    const d = String(p.date_pointage ?? "").slice(0, 10);
    if (!d) continue;
    const prev = lastByEmp.get(p.employee_id);
    if (!prev || d > prev) lastByEmp.set(p.employee_id, d);
    if (d >= recentCutoff) {
      pointedInWindow.add(p.employee_id);
      windowHadActivity = true;
    }
  }
  // Personne n'a pointé sur la fenêtre → période non travaillée (WE/congés) : on se tait.
  if (!windowHadActivity) return [];

  const out: WatcherMatch[] = [];
  for (const e of employees) {
    if (!lastByEmp.has(e.id)) continue; // pas un pointeur régulier → on n'invente pas
    if (pointedInWindow.has(e.id)) continue; // a bien pointé récemment
    const last = lastByEmp.get(e.id)!;
    const empNom = [e.prenom, e.nom].filter(Boolean).join(" ") || "sans nom";
    out.push({
      ficheId: e.id,
      entity: "employees",
      label: `Pointage manquant — ${empNom}`,
      detail: `aucun pointage sur les ${window} derniers jours (dernier pointage le ${frDate(last)})`,
      raw: { employee_nom: empNom, last_pointage: last },
    });
  }
  return out;
}

/**
 * Heures NON VALIDÉES qui traînent : pointages `valide=false` de plus de `minAge`
 * jours (défaut 7). Agrégé PAR employé pour ne pas noyer (un digest par personne).
 * Re-signalé chaque semaine tant qu'il reste des heures à valider.
 */
async function runHeuresAValider(db: SupabaseClient, tenantId: string, minAgeDays: number): Promise<WatcherMatch[]> {
  const age = Math.max(1, Math.floor(minAgeDays) || 7);
  const cutoff = isoDate(-age);
  const { data } = await db
    .from("pointages")
    .select("employee_id, heures, date_pointage, valide")
    .eq("tenant_id", tenantId)
    .eq("valide", false)
    .lte("date_pointage", cutoff)
    .not("employee_id", "is", null)
    .limit(5000);
  const agg = new Map<string, { count: number; heures: number; oldest: string }>();
  for (const p of (data ?? []) as { employee_id: string | null; heures: number | null; date_pointage: string | null }[]) {
    if (!p.employee_id) continue;
    const d = String(p.date_pointage ?? "").slice(0, 10);
    const a = agg.get(p.employee_id) ?? { count: 0, heures: 0, oldest: "9999-99-99" };
    a.count++;
    a.heures += Number(p.heures) || 0;
    if (d && d < a.oldest) a.oldest = d;
    agg.set(p.employee_id, a);
  }
  if (agg.size === 0) return [];
  const employees = await loadNamed(db, tenantId, "employees", [...agg.keys()]);
  const out: WatcherMatch[] = [];
  for (const [id, a] of agg) {
    const emp = employees.get(id);
    const empNom = emp ? [emp.prenom, emp.nom].filter(Boolean).join(" ") || "sans nom" : "sans nom";
    out.push({
      ficheId: `avalider:${id}`,
      label: `Heures à valider — ${empNom}`,
      detail: `${a.count} pointage(s) non validé(s) (${a.heures} h), le plus ancien du ${frDate(a.oldest)}`,
      raw: { employee_nom: empNom, count: a.count, heures: a.heures, oldest: a.oldest },
    });
  }
  return out;
}

/**
 * Heures INCOHÉRENTES : total pointé par (employé, jour) au-dessus d'un seuil. Le
 * paramètre numérique EST le seuil d'heures/jour (défaut 12). Les absences ne
 * comptent pas. Fenêtre 30 j (pertinence + volume borné). Une alerte par jour
 * incohérent (la valeur entre dans la clé → un total corrigé puis re-dépassé re-signale).
 */
async function runHeuresIncoherentes(db: SupabaseClient, tenantId: string, thresholdHours: number): Promise<WatcherMatch[]> {
  const limit = Math.max(1, Math.floor(thresholdHours) || 12);
  const cutoff = isoDate(-30);
  const { data } = await db
    .from("pointages")
    .select("employee_id, date_pointage, heures, type")
    .eq("tenant_id", tenantId)
    .gte("date_pointage", cutoff)
    .neq("type", "absence")
    .not("employee_id", "is", null)
    .limit(5000);
  const sums = new Map<string, { emp: string; date: string; h: number }>();
  for (const p of (data ?? []) as { employee_id: string | null; date_pointage: string | null; heures: number | null }[]) {
    if (!p.employee_id) continue;
    const date = String(p.date_pointage ?? "").slice(0, 10);
    if (!date) continue;
    const key = `${p.employee_id}|${date}`;
    const s = sums.get(key) ?? { emp: p.employee_id, date, h: 0 };
    s.h += Number(p.heures) || 0;
    sums.set(key, s);
  }
  const bad = [...sums.values()].filter((s) => s.h > limit);
  if (bad.length === 0) return [];
  const employees = await loadNamed(db, tenantId, "employees", bad.map((b) => b.emp));
  const out: WatcherMatch[] = [];
  for (const b of bad) {
    const emp = employees.get(b.emp);
    const empNom = emp ? [emp.prenom, emp.nom].filter(Boolean).join(" ") || "sans nom" : "sans nom";
    out.push({
      ficheId: `incoherent:${b.emp}:${b.date}`,
      label: `Heures incohérentes — ${empNom}`,
      detail: `${b.h} h pointées le ${frDate(b.date)} (au-dessus de ${limit} h/jour) — à vérifier`,
      dedupExtra: String(b.h),
    });
  }
  return out;
}

/**
 * Chantiers ACTIFS qui consomment TROP d'heures : total de main-d'œuvre pointée
 * au-dessus d'un seuil absolu. Le paramètre numérique EST le seuil d'heures
 * (défaut 200). Re-signalé chaque semaine tant que le seuil est dépassé.
 */
async function runChantierTropHeures(db: SupabaseClient, tenantId: string, thresholdHours: number): Promise<WatcherMatch[]> {
  const limit = Math.max(1, Math.floor(thresholdHours) || 200);
  const { data: chs } = await db
    .from("chantiers")
    .select("id, nom, statut")
    .eq("tenant_id", tenantId)
    .in("statut", ["en_cours", "en_retard"])
    .limit(SCAN_LIMIT);
  const chantiers = (chs ?? []) as { id: string; nom: string | null }[];
  if (chantiers.length === 0) return [];
  const ids = chantiers.map((c) => c.id);
  const { data: pts } = await db
    .from("pointages")
    .select("chantier_id, heures")
    .eq("tenant_id", tenantId)
    .in("chantier_id", ids)
    .limit(10000);
  const sums = new Map<string, number>();
  for (const p of (pts ?? []) as { chantier_id: string | null; heures: number | null }[]) {
    if (!p.chantier_id) continue;
    sums.set(p.chantier_id, (sums.get(p.chantier_id) ?? 0) + (Number(p.heures) || 0));
  }
  const out: WatcherMatch[] = [];
  for (const c of chantiers) {
    const h = sums.get(c.id) ?? 0;
    if (h <= limit) continue;
    out.push({
      ficheId: c.id,
      entity: "chantiers",
      label: `Chantier gourmand en heures — ${c.nom ?? "sans nom"}`,
      detail: `${h} h de main-d'œuvre pointées, au-dessus du seuil de ${limit} h`,
      raw: { nom: c.nom, heures: h },
    });
  }
  return out;
}

/**
 * Documents À RÉGULARISER : statut `manquant`/`expire`, OU dont la date
 * d'expiration est DÉJÀ passée. Complément de `echeance_proche` (qui, lui, alerte
 * AVANT l'échéance) : ici on traite le problème DÉJÀ survenu. Re-signalé chaque
 * semaine tant que ce n'est pas régularisé. Le paramètre `days` n'a pas de sens.
 */
async function runDocumentARegulariser(db: SupabaseClient, tenantId: string): Promise<WatcherMatch[]> {
  const today = isoDate(0);
  const { data } = await db
    .from("documents")
    .select("id, nom, type, statut, expires_at, chantier_id, client_id, employee_id")
    .eq("tenant_id", tenantId)
    .or(`statut.in.(manquant,expire),expires_at.lt.${today}`)
    .limit(SCAN_LIMIT);
  const rows = (data ?? []) as {
    id: string; nom: string | null; type: string | null; statut: string | null;
    expires_at: string | null; chantier_id: string | null; client_id: string | null; employee_id: string | null;
  }[];
  if (rows.length === 0) return [];
  const [chantiers, clients, employees] = await Promise.all([
    loadNamed(db, tenantId, "chantiers", rows.map((r) => r.chantier_id ?? "")),
    loadClients(db, tenantId, rows.map((r) => r.client_id ?? "")),
    loadNamed(db, tenantId, "employees", rows.map((r) => r.employee_id ?? "")),
  ]);
  const out: WatcherMatch[] = [];
  for (const d of rows) {
    const ch = d.chantier_id ? chantiers.get(d.chantier_id) : undefined;
    const cl = d.client_id ? clients.get(d.client_id) : undefined;
    const emp = d.employee_id ? employees.get(d.employee_id) : undefined;
    const rattache = ch
      ? String(ch.nom ?? "")
      : cl?.nom
        ? cl.nom
        : emp
          ? [emp.prenom, emp.nom].filter(Boolean).join(" ")
          : "";
    const expired = !!d.expires_at && d.expires_at.slice(0, 10) < today;
    const why = d.statut === "manquant" ? "manquant" : expired ? `expiré le ${frDate(d.expires_at)}` : "à régulariser";
    out.push({
      ficheId: d.id,
      entity: "documents",
      label: `Document à régulariser — ${d.nom ?? d.type ?? "document"}`,
      detail: `${why}${rattache ? ` · ${rattache}` : ""}`,
      raw: { nom: d.nom, type: d.type, statut: d.statut, expires_at: d.expires_at, rattache },
    });
  }
  return out;
}

/**
 * Assurances DÉJÀ EXPIRÉES d'un fournisseur/sous-traitant (assurance décennale) :
 * risque de conformité (travailler avec un intervenant non couvert). Complément
 * de `echeance_proche` (qui alerte AVANT). La date entre dans la clé : une
 * assurance renouvelée puis re-expirée re-déclenche. Re-signalé chaque semaine.
 */
async function runAssuranceExpiree(db: SupabaseClient, tenantId: string): Promise<WatcherMatch[]> {
  const today = isoDate(0);
  const { data } = await db
    .from("suppliers")
    .select("id, nom, email, categorie, assurance_expire, specialite")
    .eq("tenant_id", tenantId)
    .not("assurance_expire", "is", null)
    .lt("assurance_expire", today)
    .limit(SCAN_LIMIT);
  const out: WatcherMatch[] = [];
  for (const s of (data ?? []) as {
    id: string; nom: string | null; email: string | null; categorie: string | null; assurance_expire: string | null; specialite: string | null;
  }[]) {
    if (!s.assurance_expire) continue;
    const date = s.assurance_expire.slice(0, 10);
    const late = daysSince(date);
    const kind = s.categorie === "sous_traitant" ? "Sous-traitant" : "Fournisseur";
    out.push({
      ficheId: s.id,
      entity: "suppliers",
      label: `Assurance expirée — ${s.nom ?? "sans nom"}`,
      detail: `${kind}${s.specialite ? ` (${s.specialite})` : ""} : assurance décennale expirée depuis ${late} j (le ${frDate(date)})`,
      email: s.email ?? null,
      contactName: s.nom ?? null,
      dedupExtra: date,
      raw: { nom: s.nom, categorie: s.categorie, assurance_expire: date, specialite: s.specialite },
    });
  }
  return out;
}

/**
 * DOUBLONS clients — fiches qui semblent désigner le même client. HAUTE PRÉCISION :
 * on ne relie que sur des identifiants FORTS (même email OU même téléphone
 * normalisés), jamais le nom seul (« SARL Martin » ≠ doublon garanti). Union-find
 * pour regrouper les chaînes (A=B par email, B=C par tél → A,B,C). Une alerte par
 * grappe (clé = ids triés). Le paramètre `days` n'a pas de sens.
 */
async function runClientsDoublons(db: SupabaseClient, tenantId: string): Promise<WatcherMatch[]> {
  const { data } = await db
    .from("clients")
    .select("id, nom, email, tel, statut")
    .eq("tenant_id", tenantId)
    .neq("statut", "archive")
    .limit(1000);
  const rows = (data ?? []) as { id: string; nom: string | null; email: string | null; tel: string | null }[];
  if (rows.length < 2) return [];

  const parent = new Map<string, string>();
  for (const r of rows) parent.set(r.id, r.id);
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    return r;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  const normEmail = (e: string | null) => (e ?? "").trim().toLowerCase();
  const normTel = (t: string | null) => {
    const d = (t ?? "").replace(/\D/g, "");
    return d.length >= 9 ? d.slice(-9) : "";
  };
  const byEmail = new Map<string, string>();
  const byTel = new Map<string, string>();
  const link = (map: Map<string, string>, key: string, id: string) => {
    const prev = map.get(key);
    if (prev) union(prev, id);
    else map.set(key, id);
  };
  for (const r of rows) {
    const e = normEmail(r.email);
    if (e.includes("@")) link(byEmail, e, r.id);
    const t = normTel(r.tel);
    if (t) link(byTel, t, r.id);
  }

  const comps = new Map<string, string[]>();
  for (const r of rows) {
    const root = find(r.id);
    const arr = comps.get(root) ?? [];
    arr.push(r.id);
    comps.set(root, arr);
  }
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out: WatcherMatch[] = [];
  for (const ids of comps.values()) {
    if (ids.length < 2) continue;
    const names = ids.map((id) => byId.get(id)?.nom ?? "?");
    const key = [...ids].sort().join("|");
    out.push({
      ficheId: `doublon:${key}`,
      label: `Doublons clients — ${names[0]}`,
      detail: `${ids.length} fiches semblent en double (même email ou téléphone) : ${names.join(", ")}. À vérifier / fusionner.`,
      raw: { ids, names },
    });
  }
  return out;
}

/**
 * Clients MAUVAIS PAYEURS : plusieurs factures ÉCHUES impayées à leur nom. Le
 * paramètre numérique EST le SEUIL de factures échues (défaut 2). Complémentaire
 * de `facture_impayee` (relance PAR facture) : ici on qualifie le CLIENT. Re-signalé
 * chaque semaine tant que le seuil est franchi.
 */
async function runClientMauvaisPayeur(db: SupabaseClient, tenantId: string, threshold: number): Promise<WatcherMatch[]> {
  const limit = Math.max(2, Math.floor(threshold) || 2);
  const today = isoDate(0);
  const { data } = await db
    .from("factures")
    .select("client_id, statut, date_echeance, montant_ttc, montant_paye")
    .eq("tenant_id", tenantId)
    .in("statut", ["envoyee", "partiellement_payee", "en_retard"])
    .not("date_echeance", "is", null)
    .lt("date_echeance", today)
    .not("client_id", "is", null)
    .limit(5000);
  const agg = new Map<string, { count: number; reste: number }>();
  for (const f of (data ?? []) as { client_id: string | null; montant_ttc: number | null; montant_paye: number | null }[]) {
    if (!f.client_id) continue;
    const a = agg.get(f.client_id) ?? { count: 0, reste: 0 };
    a.count++;
    a.reste += Math.max(0, (Number(f.montant_ttc) || 0) - (Number(f.montant_paye) || 0));
    agg.set(f.client_id, a);
  }
  const bad = [...agg.entries()].filter(([, a]) => a.count >= limit);
  if (bad.length === 0) return [];
  const clients = await loadClients(db, tenantId, bad.map(([id]) => id));
  const out: WatcherMatch[] = [];
  for (const [id, a] of bad) {
    const cl = clients.get(id);
    out.push({
      ficheId: `mauvaispayeur:${id}`,
      entity: "clients",
      label: `Client mauvais payeur — ${cl?.nom ?? "?"}`,
      detail: `${a.count} factures échues impayées (${money(a.reste)} au total). À surveiller / relancer.`,
      email: cl?.email ?? null,
      contactName: cl?.nom ?? null,
      raw: { count: a.count, reste: a.reste, client_nom: cl?.nom ?? null },
    });
  }
  return out;
}

/**
 * Sous-traitants À PROBLÈME : ceux qui cumulent des RÉSERVES/incidents OUVERTS
 * (reserves.supplier_id, statut ouverte/en_cours). Le paramètre numérique EST le
 * SEUIL de réserves ouvertes (défaut 2) ; une réserve majeure/bloquante suffit
 * aussi. Re-signalé chaque semaine. Tolérant : si la table `reserves` n'est pas
 * (encore) déployée, on renvoie une liste vide plutôt que d'échouer.
 */
async function runSousTraitantAProbleme(db: SupabaseClient, tenantId: string, threshold: number): Promise<WatcherMatch[]> {
  const limit = Math.max(1, Math.floor(threshold) || 2);
  const { data, error } = await db
    .from("reserves")
    .select("supplier_id, statut, gravite")
    .eq("tenant_id", tenantId)
    .in("statut", ["ouverte", "en_cours"])
    .not("supplier_id", "is", null)
    .limit(5000);
  if (error) return []; // table absente / migration partielle → on ignore
  const agg = new Map<string, { count: number; grave: number }>();
  for (const r of (data ?? []) as { supplier_id: string | null; gravite: string | null }[]) {
    if (!r.supplier_id) continue;
    const a = agg.get(r.supplier_id) ?? { count: 0, grave: 0 };
    a.count++;
    if (r.gravite === "majeure" || r.gravite === "bloquante") a.grave++;
    agg.set(r.supplier_id, a);
  }
  const flagged = [...agg.entries()].filter(([, a]) => a.count >= limit || a.grave >= 1);
  if (flagged.length === 0) return [];
  const { data: sup } = await db
    .from("suppliers")
    .select("id, nom, email, specialite")
    .eq("tenant_id", tenantId)
    .in("id", flagged.map(([id]) => id));
  const supMap = new Map(((sup ?? []) as { id: string; nom: string | null; email: string | null; specialite: string | null }[]).map((s) => [s.id, s]));
  const out: WatcherMatch[] = [];
  for (const [id, a] of flagged) {
    const s = supMap.get(id);
    out.push({
      ficheId: `st_probleme:${id}`,
      entity: "suppliers",
      label: `Sous-traitant à problème — ${s?.nom ?? "?"}`,
      detail: `${a.count} réserve(s)/incident(s) ouvert(s)${a.grave > 0 ? ` dont ${a.grave} grave(s)/bloquante(s)` : ""}${s?.specialite ? ` · ${s.specialite}` : ""}. À suivre de près.`,
      email: s?.email ?? null,
      contactName: s?.nom ?? null,
      raw: { count: a.count, grave: a.grave, nom: s?.nom ?? null },
    });
  }
  return out;
}

/**
 * Sous-traitants SANS ASSURANCE décennale renseignée (aucune référence
 * `assurance_decennale`) : risque de conformité avant de les faire travailler.
 * Complément de `assurance_expiree` (qui traite l'assurance DÉJÀ expirée). Re-signalé
 * chaque semaine. Le paramètre `days` n'a pas de sens.
 */
async function runSousTraitantSansAssurance(db: SupabaseClient, tenantId: string): Promise<WatcherMatch[]> {
  const { data } = await db
    .from("suppliers")
    .select("id, nom, email, categorie, assurance_decennale, specialite")
    .eq("tenant_id", tenantId)
    .eq("categorie", "sous_traitant")
    .limit(SCAN_LIMIT);
  const out: WatcherMatch[] = [];
  for (const s of (data ?? []) as { id: string; nom: string | null; email: string | null; assurance_decennale: string | null; specialite: string | null }[]) {
    if (s.assurance_decennale && String(s.assurance_decennale).trim()) continue; // une décennale est renseignée
    out.push({
      ficheId: s.id,
      entity: "suppliers",
      label: `Sous-traitant sans assurance — ${s.nom ?? "sans nom"}`,
      detail: `aucune assurance décennale renseignée${s.specialite ? ` (${s.specialite})` : ""} — à réclamer avant de le faire travailler`,
      email: s.email ?? null,
      contactName: s.nom ?? null,
      raw: { nom: s.nom, specialite: s.specialite },
    });
  }
  return out;
}

/**
 * Documents À CLASSER : fichiers uploadés SANS aucun rattachement (chantier +
 * client + employé tous nuls). On exclut les statuts manquant/expire (traités par
 * `document_a_regulariser`) : ici ce sont de VRAIS fichiers à ranger. Une alerte
 * par document (le digest patron regroupe). Le paramètre `days` n'a pas de sens.
 */
async function runDocumentsAClasser(db: SupabaseClient, tenantId: string): Promise<WatcherMatch[]> {
  const { data } = await db
    .from("documents")
    .select("id, nom, type, statut, chantier_id, client_id, employee_id")
    .eq("tenant_id", tenantId)
    .is("chantier_id", null)
    .is("client_id", null)
    .is("employee_id", null)
    .not("statut", "in", "(manquant,expire)")
    .limit(SCAN_LIMIT);
  const out: WatcherMatch[] = [];
  for (const d of (data ?? []) as { id: string; nom: string | null; type: string | null }[]) {
    out.push({
      ficheId: d.id,
      entity: "documents",
      label: `Document à classer — ${d.nom ?? d.type ?? "document"}`,
      detail: `fichier non rattaché à un chantier/client — à ranger`,
      raw: { nom: d.nom, type: d.type },
    });
  }
  return out;
}

/**
 * Chantiers TERMINÉS sans AUCUNE photo au dossier : on ne documente pas la fin
 * (preuve, litige, vitrine). Une « photo » = document dont le type évoque une image
 * OU dont le nom/chemin a une extension d'image. Une alerte par chantier (refire null).
 * Le paramètre `days` n'a pas de sens.
 */
async function runChantierSansPhoto(db: SupabaseClient, tenantId: string): Promise<WatcherMatch[]> {
  const { data: chs } = await db
    .from("chantiers")
    .select("id, nom, statut, ville")
    .eq("tenant_id", tenantId)
    .eq("statut", "termine")
    .limit(SCAN_LIMIT);
  const chantiers = (chs ?? []) as { id: string; nom: string | null; ville: string | null }[];
  if (chantiers.length === 0) return [];
  const ids = chantiers.map((c) => c.id);

  const { data: docs } = await db
    .from("documents")
    .select("chantier_id, type, nom, storage_path")
    .eq("tenant_id", tenantId)
    .in("chantier_id", ids);
  const isImageExt = (s: string) => /\.(jpe?g|png|heic|heif|webp|gif|bmp|tiff?)$/.test(s);
  const isPhoto = (d: { type: string | null; nom: string | null; storage_path: string | null }) => {
    const t = (d.type ?? "").toLowerCase();
    return t.includes("photo") || t.includes("image") || isImageExt((d.nom ?? "").toLowerCase()) || isImageExt((d.storage_path ?? "").toLowerCase());
  };
  const withPhoto = new Set<string>();
  for (const d of (docs ?? []) as { chantier_id: string | null; type: string | null; nom: string | null; storage_path: string | null }[]) {
    if (d.chantier_id && isPhoto(d)) withPhoto.add(d.chantier_id);
  }

  const out: WatcherMatch[] = [];
  for (const c of chantiers) {
    if (withPhoto.has(c.id)) continue;
    out.push({
      ficheId: c.id,
      entity: "chantiers",
      label: `Chantier terminé sans photo — ${c.nom ?? "sans nom"}`,
      detail: `chantier terminé sans aucune photo au dossier${c.ville ? ` · ${c.ville}` : ""} — pensez aux photos de fin (preuve / litige / vitrine)`,
      raw: { nom: c.nom, ville: c.ville },
    });
  }
  return out;
}

/**
 * Interventions/SAV OUVERTS sans intervenant assigné (employee_id null, pas
 * terminées/annulées) : une demande que personne n'a en charge. Re-signalé chaque
 * semaine. Le paramètre `days` n'a pas de sens.
 */
async function runInterventionSansResponsable(db: SupabaseClient, tenantId: string): Promise<WatcherMatch[]> {
  const { data } = await db
    .from("interventions")
    .select("id, type, statut, date_prevue, client_id, chantier_id")
    .eq("tenant_id", tenantId)
    .not("statut", "in", "(termine,annule)")
    .is("employee_id", null)
    .limit(SCAN_LIMIT);
  const rows = (data ?? []) as { id: string; type: string | null; client_id: string | null; chantier_id: string | null }[];
  if (rows.length === 0) return [];
  const [clients, chantiers] = await Promise.all([
    loadClients(db, tenantId, rows.map((r) => r.client_id ?? "")),
    loadNamed(db, tenantId, "chantiers", rows.map((r) => r.chantier_id ?? "")),
  ]);
  const out: WatcherMatch[] = [];
  for (const iv of rows) {
    const cl = iv.client_id ? clients.get(iv.client_id) : undefined;
    const ch = iv.chantier_id ? chantiers.get(iv.chantier_id) : undefined;
    const ctx = ch ? String(ch.nom ?? "") : cl?.nom ?? "";
    out.push({
      ficheId: iv.id,
      entity: "interventions",
      label: `Intervention sans intervenant — ${iv.type ?? "intervention"}`,
      detail: `personne n'est assigné${ctx ? ` · ${ctx}` : ""} — à affecter`,
      raw: { type: iv.type, ctx },
    });
  }
  return out;
}

/**
 * Interventions/SAV OUVERTS sans date prévue (date_prevue null, pas
 * terminées/annulées) : à planifier. Re-signalé chaque semaine. `days` ignoré.
 */
async function runInterventionSansDate(db: SupabaseClient, tenantId: string): Promise<WatcherMatch[]> {
  const { data } = await db
    .from("interventions")
    .select("id, type, statut, client_id, chantier_id")
    .eq("tenant_id", tenantId)
    .not("statut", "in", "(termine,annule)")
    .is("date_prevue", null)
    .limit(SCAN_LIMIT);
  const rows = (data ?? []) as { id: string; type: string | null; client_id: string | null; chantier_id: string | null }[];
  if (rows.length === 0) return [];
  const [clients, chantiers] = await Promise.all([
    loadClients(db, tenantId, rows.map((r) => r.client_id ?? "")),
    loadNamed(db, tenantId, "chantiers", rows.map((r) => r.chantier_id ?? "")),
  ]);
  const out: WatcherMatch[] = [];
  for (const iv of rows) {
    const cl = iv.client_id ? clients.get(iv.client_id) : undefined;
    const ch = iv.chantier_id ? chantiers.get(iv.chantier_id) : undefined;
    const ctx = ch ? String(ch.nom ?? "") : cl?.nom ?? "";
    out.push({
      ficheId: iv.id,
      entity: "interventions",
      label: `Intervention à planifier — ${iv.type ?? "intervention"}`,
      detail: `aucune date prévue${ctx ? ` · ${ctx}` : ""} — à caler dans le planning`,
      raw: { type: iv.type, ctx },
    });
  }
  return out;
}

/**
 * Interventions/SAV EN RETARD : date prévue dépassée et pas terminées.
 * `graceDays` = tolérance après la date prévue (0 = dès le lendemain). Re-signalé
 * chaque semaine tant que ce n'est pas soldé.
 */
async function runInterventionEnRetard(db: SupabaseClient, tenantId: string, graceDays: number): Promise<WatcherMatch[]> {
  const cutoff = isoDate(-Math.max(0, Math.floor(graceDays)));
  const { data } = await db
    .from("interventions")
    .select("id, type, statut, date_prevue, client_id, chantier_id")
    .eq("tenant_id", tenantId)
    .in("statut", ["planifie", "en_cours"])
    .not("date_prevue", "is", null)
    .lt("date_prevue", cutoff)
    .limit(SCAN_LIMIT);
  const rows = (data ?? []) as { id: string; type: string | null; date_prevue: string | null; client_id: string | null; chantier_id: string | null }[];
  if (rows.length === 0) return [];
  const [clients, chantiers] = await Promise.all([
    loadClients(db, tenantId, rows.map((r) => r.client_id ?? "")),
    loadNamed(db, tenantId, "chantiers", rows.map((r) => r.chantier_id ?? "")),
  ]);
  const out: WatcherMatch[] = [];
  for (const iv of rows) {
    const cl = iv.client_id ? clients.get(iv.client_id) : undefined;
    const ch = iv.chantier_id ? chantiers.get(iv.chantier_id) : undefined;
    const ctx = ch ? String(ch.nom ?? "") : cl?.nom ?? "";
    const date = iv.date_prevue ? iv.date_prevue.slice(0, 10) : "";
    const late = date ? daysSince(date) : null;
    out.push({
      ficheId: iv.id,
      entity: "interventions",
      label: `Intervention en retard — ${iv.type ?? "intervention"}`,
      detail: `prévue le ${frDate(date)}${late && late > 0 ? ` (en retard de ${late} j)` : ""}, toujours ouverte${ctx ? ` · ${ctx}` : ""}`,
      raw: { type: iv.type, date_prevue: date, ctx },
    });
  }
  return out;
}

/**
 * Commandes fournisseur EN RETARD de livraison : envoyées/confirmées, date de
 * livraison prévue dépassée, pas encore reçues. `graceDays` = tolérance après la
 * date prévue. Re-signalé chaque semaine. Tolérant si la table `commandes` n'est
 * pas (encore) déployée.
 */
async function runCommandeEnRetard(db: SupabaseClient, tenantId: string, graceDays: number): Promise<WatcherMatch[]> {
  const cutoff = isoDate(-Math.max(0, Math.floor(graceDays)));
  const { data, error } = await db
    .from("commandes")
    .select("id, numero, statut, fournisseur_id, chantier_id, date_livraison_prevue")
    .eq("tenant_id", tenantId)
    .in("statut", ["envoyee", "confirmee"])
    .not("date_livraison_prevue", "is", null)
    .is("date_livraison_reelle", null)
    .lt("date_livraison_prevue", cutoff)
    .limit(SCAN_LIMIT);
  if (error) return []; // table absente / migration partielle → on ignore
  const rows = (data ?? []) as { id: string; numero: string | null; fournisseur_id: string | null; chantier_id: string | null; date_livraison_prevue: string | null }[];
  if (rows.length === 0) return [];
  const chantiers = await loadNamed(db, tenantId, "chantiers", rows.map((r) => r.chantier_id ?? ""));
  const supIds = [...new Set(rows.map((r) => r.fournisseur_id).filter(Boolean))] as string[];
  const { data: sup } = supIds.length
    ? await db.from("suppliers").select("id, nom, email").eq("tenant_id", tenantId).in("id", supIds)
    : { data: [] };
  const supMap = new Map(((sup ?? []) as { id: string; nom: string | null; email: string | null }[]).map((s) => [s.id, s]));
  const out: WatcherMatch[] = [];
  for (const c of rows) {
    const date = c.date_livraison_prevue ? c.date_livraison_prevue.slice(0, 10) : "";
    const late = date ? daysSince(date) : null;
    const s = c.fournisseur_id ? supMap.get(c.fournisseur_id) : undefined;
    const fnom = s?.nom ?? null;
    const ch = c.chantier_id ? chantiers.get(c.chantier_id) : undefined;
    const chantierNom = ch ? String(ch.nom ?? "") : "";
    out.push({
      ficheId: c.id,
      entity: "commandes",
      label: `Commande en retard — ${c.numero ?? "sans n°"}`,
      detail: `livraison prévue le ${frDate(date)}${late && late > 0 ? ` (retard de ${late} j)` : ""}, non reçue${fnom ? ` · ${fnom}` : ""}${chantierNom ? ` · ${chantierNom}` : ""}`,
      // Email du fournisseur porté sur la fiche : une action send_email (« relance
      // le fournisseur quand la commande tarde ») peut alors VRAIMENT lui écrire.
      email: s?.email ?? null,
      contactName: fnom,
      dedupExtra: date, // livraison replanifiée → nouvelle date → re-déclenche
      raw: { numero: c.numero, fournisseur: fnom, chantier_nom: chantierNom, date_livraison_prevue: date },
    });
  }
  return out;
}

/**
 * Dépenses / achats fournisseur NON AFFECTÉS à un chantier (chantier_id null),
 * pour les catégories qui DEVRAIENT l'être (matériaux, sous-traitance, location) :
 * un coût qui n'est rattaché à aucun chantier fausse la marge réelle. On ignore
 * les frais généraux (carburant/frais/autre) qui n'appartiennent pas forcément à
 * un chantier. Une alerte par dépense (refire null). `days` n'a pas de sens.
 * Tolérant : si la table `depenses` n'est pas (encore) déployée → liste vide.
 */
async function runAchatNonAffecte(db: SupabaseClient, tenantId: string): Promise<WatcherMatch[]> {
  const { data, error } = await db
    .from("depenses")
    .select("id, numero, categorie, montant_ttc, date_depense, fournisseur_id, statut")
    .eq("tenant_id", tenantId)
    .is("chantier_id", null)
    .in("categorie", ["materiaux", "sous_traitance", "location"])
    .limit(SCAN_LIMIT);
  if (error) return []; // table absente / migration partielle → on ignore
  const rows = (data ?? []) as {
    id: string; numero: string | null; categorie: string | null; montant_ttc: number | null; date_depense: string | null; fournisseur_id: string | null;
  }[];
  if (rows.length === 0) return [];
  const supIds = [...new Set(rows.map((r) => r.fournisseur_id).filter(Boolean))] as string[];
  const { data: sup } = supIds.length
    ? await db.from("suppliers").select("id, nom").eq("tenant_id", tenantId).in("id", supIds)
    : { data: [] };
  const supMap = new Map(((sup ?? []) as { id: string; nom: string | null }[]).map((s) => [s.id, s.nom]));
  const out: WatcherMatch[] = [];
  for (const d of rows) {
    const fnom = d.fournisseur_id ? supMap.get(d.fournisseur_id) : null;
    const date = d.date_depense ? d.date_depense.slice(0, 10) : "";
    out.push({
      ficheId: d.id,
      entity: "depenses",
      label: `Achat non affecté — ${d.numero ?? d.categorie ?? "dépense"}`,
      detail: `${money(d.montant_ttc)}${fnom ? ` · ${fnom}` : ""}${date ? ` · ${frDate(date)}` : ""} — à rattacher à un chantier (sinon la marge est faussée)`,
      raw: { numero: d.numero, categorie: d.categorie, montant_ttc: d.montant_ttc, fournisseur: fnom, date_depense: date },
    });
  }
  return out;
}

/**
 * Factures fournisseur / dépenses À PAYER dont l'échéance est DÉPASSÉE (statut
 * a_payer/en_retard, date_echeance passée) : ce que l'entreprise DOIT à ses
 * fournisseurs (cash prévisionnel sortant). Symétrique de facture_impayee (qui,
 * lui, concerne l'argent que les CLIENTS nous doivent). `graceDays` = tolérance
 * après l'échéance. Re-signalé chaque semaine. Tolérant si `depenses` absente.
 */
async function runFactureFournisseurAPayer(db: SupabaseClient, tenantId: string, graceDays: number): Promise<WatcherMatch[]> {
  const cutoff = isoDate(-Math.max(0, Math.floor(graceDays)));
  const { data, error } = await db
    .from("depenses")
    .select("id, numero, categorie, montant_ttc, date_echeance, fournisseur_id, chantier_id, statut")
    .eq("tenant_id", tenantId)
    .in("statut", ["a_payer", "en_retard"])
    .not("date_echeance", "is", null)
    .lt("date_echeance", cutoff)
    .limit(SCAN_LIMIT);
  if (error) return []; // table absente / migration partielle → on ignore
  const rows = (data ?? []) as {
    id: string; numero: string | null; categorie: string | null; montant_ttc: number | null; date_echeance: string | null; fournisseur_id: string | null; chantier_id: string | null;
  }[];
  if (rows.length === 0) return [];
  const chantiers = await loadNamed(db, tenantId, "chantiers", rows.map((r) => r.chantier_id ?? ""));
  const supIds = [...new Set(rows.map((r) => r.fournisseur_id).filter(Boolean))] as string[];
  const { data: sup } = supIds.length
    ? await db.from("suppliers").select("id, nom").eq("tenant_id", tenantId).in("id", supIds)
    : { data: [] };
  const supMap = new Map(((sup ?? []) as { id: string; nom: string | null }[]).map((s) => [s.id, s.nom]));
  const out: WatcherMatch[] = [];
  for (const d of rows) {
    const date = d.date_echeance ? d.date_echeance.slice(0, 10) : "";
    const late = date ? daysSince(date) : null;
    const fnom = d.fournisseur_id ? supMap.get(d.fournisseur_id) : null;
    const ch = d.chantier_id ? chantiers.get(d.chantier_id) : undefined;
    const chantierNom = ch ? String(ch.nom ?? "") : "";
    out.push({
      ficheId: d.id,
      entity: "depenses",
      label: `Facture fournisseur à régler — ${d.numero ?? d.categorie ?? "dépense"}`,
      detail: `${money(d.montant_ttc)} à payer${fnom ? ` à ${fnom}` : ""}, échéance dépassée${late && late > 0 ? ` depuis ${late} j` : ""}${chantierNom ? ` · ${chantierNom}` : ""}`,
      raw: { numero: d.numero, categorie: d.categorie, montant_ttc: d.montant_ttc, fournisseur: fnom, date_echeance: date, chantier_nom: chantierNom },
    });
  }
  return out;
}

/**
 * Chantiers ACTIFS sans budget renseigné (budget null ou 0) : impossible de
 * piloter la marge sans montant de référence. Alerte d'HYGIÈNE (renseigner le
 * budget), une fois par chantier (refire null). `days` n'a pas de sens.
 */
async function runChantierSansBudget(db: SupabaseClient, tenantId: string): Promise<WatcherMatch[]> {
  const { data } = await db
    .from("chantiers")
    .select("id, nom, statut, budget, ville, client_id")
    .eq("tenant_id", tenantId)
    .in("statut", ["en_attente", "en_cours", "en_retard"])
    .or("budget.is.null,budget.eq.0")
    .limit(SCAN_LIMIT);
  const rows = (data ?? []) as { id: string; nom: string | null; statut: string | null; ville: string | null; client_id: string | null }[];
  if (rows.length === 0) return [];
  const clients = await loadClients(db, tenantId, rows.map((r) => r.client_id ?? ""));
  const out: WatcherMatch[] = [];
  for (const c of rows) {
    const cl = c.client_id ? clients.get(c.client_id) : undefined;
    out.push({
      ficheId: c.id,
      entity: "chantiers",
      label: `Chantier sans budget — ${c.nom ?? "sans nom"}`,
      detail: `${c.statut ?? "actif"} sans budget renseigné${cl?.nom ? ` · ${cl.nom}` : ""}${c.ville ? ` · ${c.ville}` : ""} — renseignez le budget pour piloter la marge`,
      raw: { nom: c.nom, statut: c.statut, ville: c.ville, client_nom: cl?.nom ?? null },
    });
  }
  return out;
}

/**
 * Rappels/échéances arrivés à terme (rappels.due_date ≤ aujourd'hui) encore
 * « a_faire » → les faire remonter au patron. C'est ce qui rendait la table
 * `rappels` VIVANTE : sans ce veilleur, un rappel créé (par l'humain ou un agent)
 * ne « sonnait » jamais. Re-signalé chaque semaine tant qu'il n'est pas traité.
 * Tolérant : si la table `rappels` n'est pas (encore) déployée → liste vide.
 */
async function runRappelEchu(db: SupabaseClient, tenantId: string, graceDays: number): Promise<WatcherMatch[]> {
  const cutoff = isoDate(-Math.max(0, Math.floor(graceDays)));
  const { data } = await db
    .from("rappels")
    .select("id, titre, type, statut, due_date, client_id, chantier_id, assignee_id")
    .eq("tenant_id", tenantId)
    .eq("statut", "a_faire")
    .not("due_date", "is", null)
    .lte("due_date", cutoff)
    .limit(SCAN_LIMIT);
  const rows = (data ?? []) as {
    id: string; titre: string | null; type: string | null; due_date: string | null;
    client_id: string | null; chantier_id: string | null; assignee_id: string | null;
  }[];
  if (rows.length === 0) return [];
  const [employees, chantiers, clients] = await Promise.all([
    loadNamed(db, tenantId, "employees", rows.map((r) => r.assignee_id ?? "")),
    loadNamed(db, tenantId, "chantiers", rows.map((r) => r.chantier_id ?? "")),
    loadClients(db, tenantId, rows.map((r) => r.client_id ?? "")),
  ]);
  const out: WatcherMatch[] = [];
  for (const r of rows) {
    const late = r.due_date ? daysSince(r.due_date) : 0;
    const emp = r.assignee_id ? employees.get(r.assignee_id) : undefined;
    const empNom = emp ? [emp.prenom, emp.nom].filter(Boolean).join(" ") : "";
    const ch = r.chantier_id ? chantiers.get(r.chantier_id) : undefined;
    const cl = r.client_id ? clients.get(r.client_id) : undefined;
    const ctx = [ch ? String(ch.nom ?? "") : "", cl?.nom ?? ""].filter(Boolean).join(" · ");
    out.push({
      ficheId: r.id,
      entity: "rappels",
      label: `Rappel — ${r.titre ?? "sans titre"}`,
      detail: `${late > 0 ? `échu depuis ${late} j` : "à échéance aujourd'hui"}${empNom ? `, ${empNom}` : ""}${ctx ? ` · ${ctx}` : ""}`,
      raw: { titre: r.titre, type: r.type, due_date: r.due_date, contexte: ctx, assignee_nom: empNom },
    });
  }
  return out;
}

/**
 * Devis ACCEPTÉS dont le CHANTIER n'a pas été ouvert (chantier_id null) : le devis
 * est signé mais l'exécution n'est pas tracée. `graceDays` = tolérance après
 * l'acceptation (proxy : updated_at). Re-signalé chaque semaine.
 */
async function runDevisAccepteSansChantier(db: SupabaseClient, tenantId: string, graceDays: number): Promise<WatcherMatch[]> {
  const cutoffIso = new Date(Date.now() - Math.max(0, Math.floor(graceDays)) * 86_400_000).toISOString();
  const { data } = await db
    .from("devis")
    .select("id, numero, statut, montant_ttc, client_id, chantier_id, updated_at")
    .eq("tenant_id", tenantId)
    .eq("statut", "accepte")
    .is("chantier_id", null)
    .limit(SCAN_LIMIT);
  const rows = (data ?? []) as { id: string; numero: string | null; montant_ttc: number | null; client_id: string | null; updated_at: string | null }[];
  if (rows.length === 0) return [];
  const clients = await loadClients(db, tenantId, rows.map((r) => r.client_id ?? ""));
  const out: WatcherMatch[] = [];
  for (const d of rows) {
    if (graceDays > 0 && d.updated_at && d.updated_at > cutoffIso) continue; // accepté tout récemment
    const cl = d.client_id ? clients.get(d.client_id) : undefined;
    out.push({
      ficheId: d.id,
      entity: "devis",
      label: `Devis ${d.numero ?? "?"} accepté`,
      detail: `${money(d.montant_ttc)} TTC accepté${cl?.nom ? ` par ${cl.nom}` : ""} — chantier pas encore ouvert`,
      email: cl?.email ?? null,
      contactName: cl?.nom ?? null,
      raw: { numero: d.numero, montant_ttc: d.montant_ttc, client_id: d.client_id, client_nom: cl?.nom ?? null },
    });
  }
  return out;
}

/**
 * Chantiers TERMINÉS sans AUCUNE facture émise (hors factures annulées) : du travail
 * livré mais pas facturé (argent oublié). `graceDays` = tolérance après la fin
 * (proxy : updated_at). Re-signalé chaque semaine.
 */
async function runChantierTermineNonFacture(db: SupabaseClient, tenantId: string, graceDays: number): Promise<WatcherMatch[]> {
  const cutoffIso = new Date(Date.now() - Math.max(0, Math.floor(graceDays)) * 86_400_000).toISOString();
  const { data: chs } = await db
    .from("chantiers")
    .select("id, nom, statut, client_id, ville, updated_at")
    .eq("tenant_id", tenantId)
    .eq("statut", "termine")
    .limit(SCAN_LIMIT);
  const chantiers = (chs ?? []) as { id: string; nom: string | null; client_id: string | null; ville: string | null; updated_at: string | null }[];
  if (chantiers.length === 0) return [];
  const ids = chantiers.map((c) => c.id);
  const { data: facs } = await db
    .from("factures")
    .select("chantier_id, statut")
    .eq("tenant_id", tenantId)
    .in("chantier_id", ids)
    .neq("statut", "annulee");
  const facture = new Set<string>();
  for (const f of (facs ?? []) as { chantier_id: string | null }[]) if (f.chantier_id) facture.add(String(f.chantier_id));
  const clients = await loadClients(db, tenantId, chantiers.map((c) => c.client_id ?? ""));
  const out: WatcherMatch[] = [];
  for (const c of chantiers) {
    if (facture.has(c.id)) continue;
    if (graceDays > 0 && c.updated_at && c.updated_at > cutoffIso) continue;
    const cl = c.client_id ? clients.get(c.client_id) : undefined;
    out.push({
      ficheId: c.id,
      entity: "chantiers",
      label: `Chantier « ${c.nom ?? "sans nom"} » terminé`,
      detail: `terminé sans facture émise${cl?.nom ? ` · ${cl.nom}` : ""}${c.ville ? ` · ${c.ville}` : ""} — à facturer`,
      email: cl?.email ?? null,
      contactName: cl?.nom ?? null,
      raw: { nom: c.nom, client_id: c.client_id, client_nom: cl?.nom ?? null, ville: c.ville },
    });
  }
  return out;
}

/**
 * Factures restées en BROUILLON (jamais envoyées) au-delà de `graceDays` jours :
 * de l'argent prêt à réclamer mais dormant. Proxy d'âge : updated_at. Re-signalé
 * chaque semaine.
 */
async function runFactureBrouillonNonEnvoyee(db: SupabaseClient, tenantId: string, graceDays: number): Promise<WatcherMatch[]> {
  const cutoffIso = new Date(Date.now() - Math.max(0, Math.floor(graceDays)) * 86_400_000).toISOString();
  const { data } = await db
    .from("factures")
    .select("id, numero, statut, montant_ttc, client_id, updated_at")
    .eq("tenant_id", tenantId)
    .eq("statut", "brouillon")
    .limit(SCAN_LIMIT);
  const rows = (data ?? []) as { id: string; numero: string | null; montant_ttc: number | null; client_id: string | null; updated_at: string | null }[];
  if (rows.length === 0) return [];
  const clients = await loadClients(db, tenantId, rows.map((r) => r.client_id ?? ""));
  const out: WatcherMatch[] = [];
  for (const f of rows) {
    if (graceDays > 0 && f.updated_at && f.updated_at > cutoffIso) continue;
    const cl = f.client_id ? clients.get(f.client_id) : undefined;
    out.push({
      ficheId: f.id,
      entity: "factures",
      label: `Facture ${f.numero ?? "brouillon"}`,
      detail: `${money(f.montant_ttc)} en brouillon, jamais envoyée${cl?.nom ? ` · ${cl.nom}` : ""} — à finaliser`,
      email: cl?.email ?? null,
      contactName: cl?.nom ?? null,
      raw: { numero: f.numero, montant_ttc: f.montant_ttc, client_id: f.client_id, client_nom: cl?.nom ?? null },
    });
  }
  return out;
}

// ── Le catalogue ─────────────────────────────────────────────────────────────

export const WATCHERS: Record<WatcherKey, WatcherDef> = {
  chantier_en_retard: {
    key: "chantier_en_retard",
    label: "Chantiers en retard",
    watching: "les chantiers qui dépassent leur date de fin prévue",
    suggestedAction: "notify",
    defaultDays: 0,
    daysMeaning: "jours de tolérance après la date de fin prévue",
    refireDays: null,
    run: runChantierEnRetard,
  },
  chantier_fin_proche: {
    key: "chantier_fin_proche",
    label: "Chantiers bientôt à échéance",
    watching: "les chantiers dont la date de fin prévue approche",
    suggestedAction: "notify",
    defaultDays: 7,
    daysMeaning: "jours avant la fin prévue (fenêtre d'alerte)",
    refireDays: null,
    run: runChantierFinProche,
  },
  chantier_hors_budget: {
    key: "chantier_hors_budget",
    label: "Chantiers hors budget",
    watching: "les chantiers dont le budget engagé dépasse le budget prévu",
    suggestedAction: "notify",
    defaultDays: 0,
    daysMeaning: "% de dépassement toléré avant l'alerte",
    refireDays: null,
    run: runChantierHorsBudget,
  },
  chantier_sans_activite: {
    key: "chantier_sans_activite",
    label: "Chantiers sans avancement",
    watching: "les chantiers en cours qui n'ont plus aucune activité",
    suggestedAction: "notify",
    defaultDays: 3,
    daysMeaning: "jours sans activité avant l'alerte",
    refireDays: 7,
    run: runChantierSansActivite,
  },
  chantier_sans_devis: {
    key: "chantier_sans_devis",
    label: "Chantiers sans devis signé",
    watching: "les chantiers démarrés sans devis signé",
    suggestedAction: "notify",
    defaultDays: 0,
    daysMeaning: "jours de tolérance après le démarrage",
    refireDays: 7,
    run: runChantierSansDevis,
  },
  chantier_termine: {
    key: "chantier_termine",
    label: "Chantiers terminés",
    watching: "les chantiers qui viennent d'être terminés",
    suggestedAction: "send_email",
    defaultDays: 3,
    daysMeaning: "jours de rattrapage après la fin du chantier",
    refireDays: null,
    run: runChantierTermine,
  },
  demande_urgente: {
    key: "demande_urgente",
    label: "Demandes urgentes sans réponse",
    watching: "les demandes clients urgentes restées sans réponse",
    suggestedAction: "notify",
    defaultDays: 0,
    daysMeaning: "jours d'attente minimum avant d'examiner",
    refireDays: null,
    aiJudge: {
      criterion:
        "la demande décrit une situation VRAIMENT URGENTE (fuite d'eau, panne bloquante — chauffage/électricité coupés, problème de sécurité, dégât en cours, sinistre, client explicitement très mécontent, ou échéance imminente) qui appelle une intervention rapide. En cas de simple demande ordinaire ou de doute, NE PAS retenir.",
    },
    run: runDemandeUrgente,
  },
  devis_non_signe: {
    key: "devis_non_signe",
    label: "Devis non signés",
    watching: "les devis envoyés restés sans réponse",
    suggestedAction: "send_email",
    defaultDays: 7,
    daysMeaning: "jours d'attente avant relance",
    refireDays: 7,
    run: runDevisNonSigne,
  },
  devis_accepte: {
    key: "devis_accepte",
    label: "Devis acceptés",
    watching: "les devis qui viennent d'être acceptés",
    suggestedAction: "send_email",
    defaultDays: 3,
    daysMeaning: "jours de rattrapage après l'acceptation",
    refireDays: null,
    run: runDevisAccepte,
  },
  devis_expire_bientot: {
    key: "devis_expire_bientot",
    label: "Devis proches d'expiration",
    watching: "les devis envoyés dont la date de validité approche",
    suggestedAction: "send_email",
    defaultDays: 7,
    daysMeaning: "jours avant l'expiration (fenêtre d'alerte)",
    refireDays: null,
    run: runDevisExpireBientot,
  },
  facture_echeance_proche: {
    key: "facture_echeance_proche",
    label: "Factures bientôt échues",
    watching: "les factures non soldées dont l'échéance approche",
    suggestedAction: "notify",
    defaultDays: 7,
    daysMeaning: "jours avant l'échéance (fenêtre d'alerte)",
    refireDays: null,
    run: runFactureEcheanceProche,
  },
  facture_impayee: {
    key: "facture_impayee",
    label: "Factures impayées",
    watching: "les factures échues non soldées",
    suggestedAction: "send_email",
    defaultDays: 0,
    daysMeaning: "jours de tolérance après l'échéance",
    refireDays: 7,
    run: runFactureImpayee,
  },
  facture_payee: {
    key: "facture_payee",
    label: "Factures payées",
    watching: "les factures qui viennent d'être soldées",
    suggestedAction: "send_email",
    defaultDays: 3,
    daysMeaning: "jours de rattrapage après le paiement",
    refireDays: null,
    run: runFacturePayee,
  },
  echeance_proche: {
    key: "echeance_proche",
    label: "Échéances à venir",
    watching: "les documents, assurances, contrats et entretiens qui arrivent à échéance",
    suggestedAction: "notify",
    defaultDays: 30,
    daysMeaning: "jours avant l'échéance (fenêtre d'alerte)",
    refireDays: null,
    run: runEcheanceProche,
  },
  visite_terminee: {
    key: "visite_terminee",
    label: "Comptes-rendus de visite",
    watching: "les interventions/visites chantier qui viennent d'être terminées",
    suggestedAction: "compte_rendu",
    defaultDays: 3,
    daysMeaning: "jours après la clôture (fenêtre de rattrapage)",
    refireDays: null,
    run: runVisiteTerminee,
  },
  rdv_demain: {
    key: "rdv_demain",
    label: "Rappels de RDV",
    watching: "les interventions/RDV clients prévus prochainement",
    suggestedAction: "send_email",
    defaultDays: 1,
    daysMeaning: "jours avant le RDV pour prévenir le client (1 = la veille)",
    refireDays: null,
    run: runRdvDemain,
  },
  conflit_planning: {
    key: "conflit_planning",
    label: "Conflits de planning",
    watching: "les interventions d'un même intervenant qui se chevauchent",
    suggestedAction: "notify",
    defaultDays: 14,
    daysMeaning: "jours à venir surveillés (horizon du planning)",
    refireDays: null,
    run: runConflitPlanning,
  },
  intervention_annulee: {
    key: "intervention_annulee",
    label: "Rendez-vous annulés",
    watching: "les interventions/RDV qui viennent d'être annulés",
    suggestedAction: "send_email",
    defaultDays: 3,
    daysMeaning: "jours de rattrapage après l'annulation",
    refireDays: null,
    run: runInterventionAnnulee,
  },
  tache_en_retard: {
    key: "tache_en_retard",
    label: "Tâches en retard",
    watching: "les tâches dont l'échéance est dépassée et qui ne sont pas terminées",
    suggestedAction: "notify",
    defaultDays: 0,
    daysMeaning: "jours de tolérance après l'échéance",
    refireDays: 7,
    run: runTacheEnRetard,
  },
  tache_terminee: {
    key: "tache_terminee",
    label: "Tâches terminées",
    watching: "les tâches qui viennent d'être terminées",
    suggestedAction: "notify",
    defaultDays: 3,
    daysMeaning: "jours de rattrapage après la clôture",
    refireDays: null,
    run: runTacheTerminee,
  },
  tache_sans_responsable: {
    key: "tache_sans_responsable",
    label: "Tâches sans intervenant",
    watching: "les tâches ouvertes que personne n'a en charge",
    suggestedAction: "notify",
    defaultDays: 0,
    daysMeaning: null,
    refireDays: 7,
    run: runTacheSansResponsable,
  },
  chantier_sans_responsable: {
    key: "chantier_sans_responsable",
    label: "Chantiers sans chef",
    watching: "les chantiers actifs sans chef de chantier désigné",
    suggestedAction: "notify",
    defaultDays: 0,
    daysMeaning: null,
    refireDays: 7,
    run: runChantierSansResponsable,
  },
  equipe_surchargee: {
    key: "equipe_surchargee",
    label: "Intervenants surchargés",
    watching: "les intervenants dont la charge ouverte dépasse un seuil",
    suggestedAction: "notify",
    defaultDays: 8,
    daysMeaning: "nombre d'éléments ouverts par personne au-delà duquel alerter",
    refireDays: 7,
    run: runEquipeSurchargee,
  },
  pointage_manquant: {
    key: "pointage_manquant",
    label: "Pointages manquants",
    watching: "les employés qui n'ont pas pointé récemment (alors que d'autres l'ont fait)",
    suggestedAction: "notify",
    defaultDays: 3,
    daysMeaning: "jours récents examinés (fenêtre sans pointage)",
    refireDays: 7,
    run: runPointageManquant,
  },
  heures_a_valider: {
    key: "heures_a_valider",
    label: "Heures à valider",
    watching: "les pointages non validés qui traînent",
    suggestedAction: "notify",
    defaultDays: 7,
    daysMeaning: "ancienneté minimale (jours) avant de réclamer la validation",
    refireDays: 7,
    run: runHeuresAValider,
  },
  heures_incoherentes: {
    key: "heures_incoherentes",
    label: "Heures incohérentes",
    watching: "les journées où un employé a pointé un total d'heures anormalement élevé",
    suggestedAction: "notify",
    defaultDays: 12,
    daysMeaning: "seuil d'heures/jour au-delà duquel c'est jugé incohérent",
    refireDays: null,
    run: runHeuresIncoherentes,
  },
  chantier_trop_heures: {
    key: "chantier_trop_heures",
    label: "Chantiers gourmands en heures",
    watching: "les chantiers actifs dont la main-d'œuvre pointée dépasse un seuil",
    suggestedAction: "notify",
    defaultDays: 200,
    daysMeaning: "seuil d'heures cumulées par chantier au-delà duquel alerter",
    refireDays: 7,
    run: runChantierTropHeures,
  },
  document_a_regulariser: {
    key: "document_a_regulariser",
    label: "Documents à régulariser",
    watching: "les documents manquants ou déjà expirés à régulariser",
    suggestedAction: "notify",
    defaultDays: 0,
    daysMeaning: null,
    refireDays: 7,
    run: runDocumentARegulariser,
  },
  assurance_expiree: {
    key: "assurance_expiree",
    label: "Assurances expirées",
    watching: "les fournisseurs/sous-traitants dont l'assurance décennale est déjà expirée",
    suggestedAction: "notify",
    defaultDays: 0,
    daysMeaning: null,
    refireDays: 7,
    run: runAssuranceExpiree,
  },
  clients_doublons: {
    key: "clients_doublons",
    label: "Doublons clients",
    watching: "les fiches clients en double (même email ou téléphone)",
    suggestedAction: "notify",
    defaultDays: 0,
    daysMeaning: null,
    refireDays: null,
    run: runClientsDoublons,
  },
  client_mauvais_payeur: {
    key: "client_mauvais_payeur",
    label: "Clients mauvais payeurs",
    watching: "les clients cumulant plusieurs factures échues impayées",
    suggestedAction: "notify",
    defaultDays: 2,
    daysMeaning: "nombre de factures échues impayées au-delà duquel signaler le client",
    refireDays: 7,
    run: runClientMauvaisPayeur,
  },
  sous_traitant_a_probleme: {
    key: "sous_traitant_a_probleme",
    label: "Sous-traitants à problème",
    watching: "les sous-traitants cumulant des réserves/incidents ouverts",
    suggestedAction: "notify",
    defaultDays: 2,
    daysMeaning: "nombre de réserves ouvertes au-delà duquel signaler le sous-traitant",
    refireDays: 7,
    run: runSousTraitantAProbleme,
  },
  sous_traitant_sans_assurance: {
    key: "sous_traitant_sans_assurance",
    label: "Sous-traitants sans assurance",
    watching: "les sous-traitants sans assurance décennale renseignée",
    suggestedAction: "notify",
    defaultDays: 0,
    daysMeaning: null,
    refireDays: 7,
    run: runSousTraitantSansAssurance,
  },
  documents_a_classer: {
    key: "documents_a_classer",
    label: "Documents à classer",
    watching: "les documents uploadés sans rattachement (à ranger)",
    suggestedAction: "notify",
    defaultDays: 0,
    daysMeaning: null,
    refireDays: null,
    run: runDocumentsAClasser,
  },
  chantier_sans_photo: {
    key: "chantier_sans_photo",
    label: "Chantiers terminés sans photo",
    watching: "les chantiers terminés sans aucune photo au dossier",
    suggestedAction: "notify",
    defaultDays: 0,
    daysMeaning: null,
    refireDays: null,
    run: runChantierSansPhoto,
  },
  intervention_sans_responsable: {
    key: "intervention_sans_responsable",
    label: "Interventions sans intervenant",
    watching: "les interventions/SAV ouverts que personne n'a en charge",
    suggestedAction: "notify",
    defaultDays: 0,
    daysMeaning: null,
    refireDays: 7,
    run: runInterventionSansResponsable,
  },
  intervention_sans_date: {
    key: "intervention_sans_date",
    label: "Interventions à planifier",
    watching: "les interventions/SAV ouverts sans date prévue",
    suggestedAction: "notify",
    defaultDays: 0,
    daysMeaning: null,
    refireDays: 7,
    run: runInterventionSansDate,
  },
  intervention_en_retard: {
    key: "intervention_en_retard",
    label: "Interventions en retard",
    watching: "les interventions/SAV dont la date prévue est dépassée",
    suggestedAction: "notify",
    defaultDays: 0,
    daysMeaning: "jours de tolérance après la date prévue",
    refireDays: 7,
    run: runInterventionEnRetard,
  },
  commande_en_retard: {
    key: "commande_en_retard",
    label: "Commandes en retard",
    watching: "les commandes fournisseur dont la livraison est en retard",
    suggestedAction: "notify",
    defaultDays: 0,
    daysMeaning: "jours de tolérance après la date de livraison prévue",
    refireDays: 7,
    run: runCommandeEnRetard,
  },
  achat_non_affecte: {
    key: "achat_non_affecte",
    label: "Achats non affectés",
    watching: "les dépenses/achats fournisseur non rattachés à un chantier",
    suggestedAction: "notify",
    defaultDays: 0,
    daysMeaning: null,
    refireDays: null,
    run: runAchatNonAffecte,
  },
  facture_fournisseur_a_payer: {
    key: "facture_fournisseur_a_payer",
    label: "Factures fournisseur à régler",
    watching: "les factures fournisseur dont l'échéance de paiement est dépassée",
    suggestedAction: "notify",
    defaultDays: 0,
    daysMeaning: "jours de tolérance après l'échéance de paiement",
    refireDays: 7,
    run: runFactureFournisseurAPayer,
  },
  chantier_sans_budget: {
    key: "chantier_sans_budget",
    label: "Chantiers sans budget",
    watching: "les chantiers actifs sans budget renseigné (marge impilotable)",
    suggestedAction: "notify",
    defaultDays: 0,
    daysMeaning: null,
    refireDays: null,
    run: runChantierSansBudget,
  },
  stock_bas: {
    key: "stock_bas",
    label: "Stock bas",
    watching: "les matériaux dont la quantité passe sous leur seuil d'alerte",
    suggestedAction: "notify",
    defaultDays: 0,
    daysMeaning: null,
    refireDays: 7,
    run: runStockBas,
  },
  nouveau_lead: {
    key: "nouveau_lead",
    label: "Nouveaux leads",
    watching: "les nouvelles demandes reçues via un formulaire public",
    suggestedAction: "notify",
    defaultDays: 3,
    daysMeaning: "jours de rattrapage après réception",
    refireDays: null,
    run: runNouveauLead,
  },
  nouveau_client: {
    key: "nouveau_client",
    label: "Nouveaux clients",
    watching: "les clients qui viennent d'être créés",
    suggestedAction: "notify",
    defaultDays: 3,
    daysMeaning: "jours de rattrapage après la création",
    refireDays: null,
    run: runNouveauClient,
  },
  nouveau_chantier: {
    key: "nouveau_chantier",
    label: "Nouveaux chantiers",
    watching: "les chantiers qui viennent d'être créés",
    suggestedAction: "notify",
    defaultDays: 3,
    daysMeaning: "jours de rattrapage après la création",
    refireDays: null,
    run: runNouveauChantier,
  },
  client_inactif: {
    key: "client_inactif",
    label: "Clients inactifs",
    watching: "les clients sans activité depuis longtemps",
    suggestedAction: "notify",
    defaultDays: 90,
    daysMeaning: "jours sans activité avant de le signaler",
    refireDays: 30,
    run: runClientInactif,
  },
  rappel_echu: {
    key: "rappel_echu",
    label: "Rappels arrivés à échéance",
    watching: "les rappels/échéances arrivés à terme et pas encore traités",
    suggestedAction: "notify",
    defaultDays: 0,
    daysMeaning: "jours de tolérance après l'échéance",
    refireDays: 7,
    run: runRappelEchu,
  },
  devis_accepte_sans_chantier: {
    key: "devis_accepte_sans_chantier",
    label: "Devis acceptés sans chantier",
    watching: "les devis acceptés dont le chantier n'a pas été ouvert",
    suggestedAction: "notify",
    defaultDays: 3,
    daysMeaning: "jours de tolérance après l'acceptation",
    refireDays: 7,
    run: runDevisAccepteSansChantier,
  },
  chantier_termine_non_facture: {
    key: "chantier_termine_non_facture",
    label: "Chantiers terminés non facturés",
    watching: "les chantiers terminés sans aucune facture émise",
    suggestedAction: "notify",
    defaultDays: 3,
    daysMeaning: "jours de tolérance après la fin du chantier",
    refireDays: 7,
    run: runChantierTermineNonFacture,
  },
  facture_brouillon_non_envoyee: {
    key: "facture_brouillon_non_envoyee",
    label: "Factures en brouillon",
    watching: "les factures restées en brouillon, jamais envoyées",
    suggestedAction: "notify",
    defaultDays: 3,
    daysMeaning: "jours en brouillon avant l'alerte",
    refireDays: 7,
    run: runFactureBrouillonNonEnvoyee,
  },
};

export function getWatcher(key: string | null | undefined): WatcherDef | null {
  if (!key) return null;
  return (WATCHERS as Record<string, WatcherDef>)[key] ?? null;
}

// ── DATA-DRIVEN (Phase 4) : DOMAINE métier de chaque veilleur, en source UNIQUE.
//    Le type `Record<WatcherKey, WatcherDomain>` garantit au COMPILE-TIME que
//    chaque veilleur a exactement un domaine (ajouter un veilleur sans domaine ne
//    compile pas). Sert à la vitrine (regroupement UI par métier) et au routage,
//    sans dupliquer l'information ailleurs.
export type WatcherDomain =
  | "commercial" | "finance" | "chantier" | "planning" | "sav" | "equipe" | "approvisionnement" | "documents";

export const WATCHER_DOMAIN: Record<WatcherKey, WatcherDomain> = {
  // Commercial (devis, prospects, relation client)
  devis_non_signe: "commercial",
  devis_expire_bientot: "commercial",
  devis_accepte: "commercial",
  nouveau_lead: "commercial",
  nouveau_client: "commercial",
  client_inactif: "commercial",
  clients_doublons: "commercial",
  client_mauvais_payeur: "commercial",
  devis_accepte_sans_chantier: "commercial",
  // Finance (factures clients & fournisseurs, dépenses)
  facture_echeance_proche: "finance",
  facture_impayee: "finance",
  facture_payee: "finance",
  facture_fournisseur_a_payer: "finance",
  achat_non_affecte: "finance",
  chantier_termine_non_facture: "finance",
  facture_brouillon_non_envoyee: "finance",
  // Chantier
  chantier_en_retard: "chantier",
  chantier_fin_proche: "chantier",
  chantier_hors_budget: "chantier",
  chantier_sans_budget: "chantier",
  chantier_sans_activite: "chantier",
  chantier_sans_devis: "chantier",
  chantier_sans_responsable: "chantier",
  chantier_trop_heures: "chantier",
  chantier_termine: "chantier",
  chantier_sans_photo: "chantier",
  nouveau_chantier: "chantier",
  // Planning (RDV, conflits)
  rdv_demain: "planning",
  conflit_planning: "planning",
  // SAV / interventions
  visite_terminee: "sav",
  demande_urgente: "sav",
  intervention_annulee: "sav",
  intervention_sans_responsable: "sav",
  intervention_sans_date: "sav",
  intervention_en_retard: "sav",
  // Équipe (pointages, heures, tâches, charge)
  pointage_manquant: "equipe",
  heures_a_valider: "equipe",
  heures_incoherentes: "equipe",
  equipe_surchargee: "equipe",
  tache_en_retard: "equipe",
  tache_terminee: "equipe",
  tache_sans_responsable: "equipe",
  // Approvisionnement / sous-traitants
  stock_bas: "approvisionnement",
  commande_en_retard: "approvisionnement",
  sous_traitant_a_probleme: "approvisionnement",
  sous_traitant_sans_assurance: "approvisionnement",
  // Documents / conformité / rappels
  echeance_proche: "documents",
  document_a_regulariser: "documents",
  documents_a_classer: "documents",
  assurance_expiree: "documents",
  rappel_echu: "documents",
};

/** Domaine métier d'un veilleur (pour la vitrine / le routage). */
export function getWatcherDomain(key: WatcherKey): WatcherDomain {
  return WATCHER_DOMAIN[key];
}

/** Les veilleurs regroupés par domaine (ordre du registre préservé). Pour l'UI. */
export function listWatchersByDomain(): Record<WatcherDomain, WatcherKey[]> {
  const out: Record<WatcherDomain, WatcherKey[]> = {
    commercial: [], finance: [], chantier: [], planning: [], sav: [], equipe: [], approvisionnement: [], documents: [],
  };
  for (const k of WATCHER_KEYS) out[WATCHER_DOMAIN[k]].push(k);
  return out;
}

/**
 * Veilleurs dont la fiche déclenchante porte l'email d'un FOURNISSEUR/SOUS-TRAITANT
 * (pas d'un client) : une action send_email les relance LUI (« relance le fournisseur
 * quand la commande tarde », « réclame l'attestation au sous-traitant »). Ces
 * veilleurs suggèrent par défaut `notify` (alerte patron) ; l'envoi n'a lieu que si
 * l'utilisateur demande explicitement d'écrire au fournisseur. Source unique
 * partagée par le parseur (agent-rules) et l'exécuteur (ton neutre, pas de recouvrement).
 */
export const SUPPLIER_RELANCE_WATCHERS: WatcherKey[] = [
  "commande_en_retard",
  "sous_traitant_a_probleme",
  "sous_traitant_sans_assurance",
  "assurance_expiree",
];

/** Ce veilleur relance-t-il un fournisseur/sous-traitant (et non un client) ? */
export function isSupplierRelanceWatcher(key: string | null | undefined): boolean {
  return !!key && (SUPPLIER_RELANCE_WATCHERS as string[]).includes(key);
}

/**
 * Clé d'idempotence d'un déclenchement. Inclut la fiche, un éventuel suffixe
 * (date d'échéance) et, pour les relances récurrentes, le « bucket » de période
 * (semaine) — ainsi une facture toujours impayée est re-relancée après refireDays,
 * mais jamais deux fois dans la même période.
 */
export function buildFireKey(watcher: WatcherDef, match: WatcherMatch): string {
  const parts = [watcher.key, match.ficheId];
  if (match.dedupExtra) parts.push(match.dedupExtra);
  if (watcher.refireDays && watcher.refireDays > 0) {
    const bucket = Math.floor(Date.now() / 86_400_000 / watcher.refireDays);
    parts.push(`w${bucket}`);
  }
  return parts.join(":");
}
