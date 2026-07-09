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

export type WatcherKey =
  | "chantier_en_retard"
  | "chantier_hors_budget"
  | "chantier_sans_activite"
  | "chantier_sans_devis"
  | "demande_urgente"
  | "devis_non_signe"
  | "facture_impayee"
  | "echeance_proche"
  | "visite_terminee";
export const WATCHER_KEYS: WatcherKey[] = [
  "chantier_en_retard",
  "chantier_hors_budget",
  "chantier_sans_activite",
  "chantier_sans_devis",
  "demande_urgente",
  "devis_non_signe",
  "facture_impayee",
  "echeance_proche",
  "visite_terminee",
];

/** Une fiche qui remplit la condition surveillée. */
export type WatcherMatch = {
  /** Identifiant STABLE de la fiche pour l'idempotence (source-préfixé si multi-table). */
  ficheId: string;
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
};

export function getWatcher(key: string | null | undefined): WatcherDef | null {
  if (!key) return null;
  return (WATCHERS as Record<string, WatcherDef>)[key] ?? null;
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
