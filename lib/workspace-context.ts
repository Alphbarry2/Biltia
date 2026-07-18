import type { SupabaseClient } from "@supabase/supabase-js";
import { neutralizeMarkers } from "./untrusted";
import {
  addCivilDays,
  assembleWorkspaceContext,
  civilTodayInTz,
  emptyCounts,
  renderWorkspaceBlock,
  resolveTenantTimeZone,
} from "./workspace-retard";
import type {
  ChantierRow,
  ClientCtx,
  ContextError,
  EmployeeCtx,
  WorkspaceContext,
  WorkspaceContextMode,
  WorkspaceContextResult,
  WorkspaceCounts,
} from "./workspace-retard";

export type {
  ChantierCtx,
  ChantierRow,
  ContextError,
  RetardState,
  WorkspaceContext,
  WorkspaceContextMeta,
  WorkspaceContextMode,
  WorkspaceContextResult,
} from "./workspace-retard";

export interface GetWorkspaceContextParams {
  db: SupabaseClient;
  tenantId: string;
  mode: WorkspaceContextMode;
  /** Journalisation seulement — jamais un filtre. */
  userId?: string | null;
}

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

// ── Sous-lectures isolées (une erreur ne remonte JAMAIS en exception) ─────────

async function fetchCounts(
  db: SupabaseClient,
  tenantId: string,
  today: string,
  errors: ContextError[]
): Promise<WorkspaceCounts> {
  const counts = emptyCounts();
  const cutoff = addCivilDays(today, 30);

  // Chaque compteur est un count exact, indépendant des échantillons : le contexte
  // reste borné même chez un très gros tenant. En échec → 0 + erreur non critique.
  const jobs: Array<[keyof WorkspaceCounts, PromiseLike<{ count: number | null; error: unknown }>]> = [
    ["employees_actifs", db.from("employees").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("statut", "actif")],
    ["chantiers_total", db.from("chantiers").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId)],
    ["chantiers_actifs", db.from("chantiers").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("statut", "en_cours")],
    ["clients_total", db.from("clients").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId)],
    ["materiels_disponibles", db.from("materials").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("statut", "disponible")],
    ["documents_expirant_bientot", db.from("documents").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("statut", "valide").not("expires_at", "is", null).lte("expires_at", cutoff)],
    // "en retard" = statut posé OU (actif, échéance passée, pas de fin réelle). Fait, pas prédiction.
    ["chantiers_en_retard", db.from("chantiers").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).or(`statut.eq.en_retard,and(statut.in.(en_cours,en_attente),date_fin_prevue.lt.${today},date_fin_reelle.is.null)`)],
  ];

  await Promise.all(
    jobs.map(async ([key, p]) => {
      try {
        const { count, error } = await p;
        if (error) throw error;
        if (typeof count === "number") counts[key] = count;
      } catch (e) {
        errors.push({ source: `counts.${key}`, critical: false, message: msg(e) });
      }
    })
  );
  return counts;
}

async function fetchChantiers(
  db: SupabaseClient,
  tenantId: string,
  errors: ContextError[]
): Promise<ChantierRow[]> {
  try {
    // État COURANT : actifs + en_retard. Les 'termine_en_retard' historiques ne
    // sont pas échantillonnés en Phase 1 (rétrospectif = plus tard).
    const { data, error } = await db
      .from("chantiers")
      .select("id, nom, statut, ville, avancement, date_debut, date_fin_prevue, date_fin_reelle")
      .eq("tenant_id", tenantId)
      .in("statut", ["en_cours", "en_attente", "en_retard"])
      .order("date_fin_prevue", { ascending: true, nullsFirst: false })
      .limit(20);
    if (error) throw error;
    return (data ?? []) as ChantierRow[];
  } catch (e) {
    // Source CRITIQUE : sans les chantiers, un agent ne doit ni décider ni envoyer.
    errors.push({ source: "chantiers", critical: true, message: msg(e) });
    return [];
  }
}

async function fetchEmployees(
  db: SupabaseClient,
  tenantId: string,
  errors: ContextError[]
): Promise<EmployeeCtx[]> {
  try {
    const { data, error } = await db
      .from("employees")
      .select("nom, prenom, role, corps_metier")
      .eq("tenant_id", tenantId)
      .eq("statut", "actif")
      .order("nom", { ascending: true })
      .limit(20);
    if (error) throw error;
    return (data ?? []) as EmployeeCtx[];
  } catch (e) {
    errors.push({ source: "employees", critical: false, message: msg(e) });
    return [];
  }
}

async function fetchClients(
  db: SupabaseClient,
  tenantId: string,
  errors: ContextError[]
): Promise<ClientCtx[]> {
  try {
    const { data, error } = await db
      .from("clients")
      .select("nom, type, ville")
      .eq("tenant_id", tenantId)
      .order("nom", { ascending: true })
      .limit(20);
    if (error) throw error;
    return (data ?? []) as ClientCtx[];
  } catch (e) {
    errors.push({ source: "clients", critical: false, message: msg(e) });
    return [];
  }
}

/**
 * Constructeur CANONIQUE du contexte workspace, partagé par le chat (client de
 * session, RLS) et les agents autonomes (service_role). Isolation par filtre
 * `tenant_id` EXPLICITE sur chaque requête — c'est la garde en mode admin, où la
 * RLS ne s'applique pas. Ne dépend jamais de auth.uid() : c'est ce qui répare le
 * bloc vide des agents.
 */
export async function getWorkspaceContextFor(
  params: GetWorkspaceContextParams
): Promise<WorkspaceContextResult> {
  const { db, tenantId, mode } = params;
  const start = Date.now();
  const errors: ContextError[] = [];

  // 1) Existence du tenant + fuseau. En mode admin c'est la seule preuve d'existence.
  let tenantExists = false;
  let timeZone = resolveTenantTimeZone(null);
  try {
    const { data, error } = await db
      .from("tenants")
      .select("id, company_info")
      .eq("id", tenantId)
      .maybeSingle();
    if (error) {
      errors.push({ source: "tenant", critical: true, message: msg(error) });
    } else if (data) {
      tenantExists = true;
      timeZone = resolveTenantTimeZone((data as { company_info?: unknown }).company_info);
    }
  } catch (e) {
    errors.push({ source: "tenant", critical: true, message: msg(e) });
  }

  const today = civilTodayInTz(timeZone);

  const finish = (
    context: WorkspaceContext | null,
    status: WorkspaceContextResult["meta"]["status"],
    counts: { employees: number; chantiers: number; clients: number }
  ): WorkspaceContextResult => ({
    context,
    meta: {
      mode,
      tenantId,
      tenantExists,
      status,
      loaded: status !== "failed",
      empty: status === "empty",
      durationMs: Date.now() - start,
      counts,
      fallbackUsed: errors.length > 0,
      errors,
    },
  });

  // Tenant introuvable → échec dur, aucun contexte (erreur contrôlée, pas de throw).
  if (!tenantExists) {
    return finish(null, "failed", { employees: 0, chantiers: 0, clients: 0 });
  }

  // 2) Lectures parallèles, chacune isolée.
  const [counts, employees, chantiers, clients] = await Promise.all([
    fetchCounts(db, tenantId, today, errors),
    fetchEmployees(db, tenantId, errors),
    fetchChantiers(db, tenantId, errors),
    fetchClients(db, tenantId, errors),
  ]);

  const assembled = assembleWorkspaceContext(
    { tenantExists: true, counts, employees, chantiers, clients, errors },
    today
  );

  return finish(assembled.context, assembled.status, {
    employees: employees.length,
    chantiers: chantiers.length,
    clients: clients.length,
  });
}

/**
 * Alias rétro-compatible pour le CHAT : renvoie le résultat complet, que
 * buildWorkspaceBlock sait rendre (avec, le cas échéant, la note "données
 * partielles"). Conservé pour ne pas toucher les sites d'appel du chat.
 */
export async function getWorkspaceContext(
  db: SupabaseClient,
  tenantId: string
): Promise<WorkspaceContextResult> {
  return getWorkspaceContextFor({ db, tenantId, mode: "session" });
}

/** Bloc prompt. Neutralisation anti-injection appliquée aux données libres. */
export function buildWorkspaceBlock(
  input: WorkspaceContextResult | WorkspaceContext | null
): string {
  return renderWorkspaceBlock(input, neutralizeMarkers);
}

/**
 * Snapshot PILOTAGE (trésorerie / commercial) pour l'ASSISTANT interactif : donne
 * au copilote de quoi répondre AVEC DE VRAIS CHIFFRES à « quelles factures sont en
 * retard ? », « combien je vais encaisser ? », « quels devis relancer ? » — ce que
 * le résumé chantiers/clients (get_workspace_context) ne couvrait pas. Lecture RLS
 * (client user), tenant-scopée, agrégée en JS sur volume borné. N'écrit RIEN et est
 * ENTIÈREMENT tolérant : toute table absente ou erreur → "" (jamais bloquant).
 */
export async function buildPilotageSnapshot(supabase: SupabaseClient, tenantId: string): Promise<string> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const eur = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;
    type Money = { statut?: string | null; montant_ttc?: number | null; montant_paye?: number | null; date_echeance?: string | null };
    const sum = (rows: Money[] | null, f: "montant_ttc" | "montant_paye") =>
      (rows ?? []).reduce((t, r) => t + (Number(r[f]) || 0), 0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const from = (t: string) => (supabase.from as any)(t);

    const [{ data: devisAll }, { data: factAll }] = await Promise.all([
      from("devis").select("statut, montant_ttc").eq("tenant_id", tenantId).limit(1000),
      from("factures").select("statut, montant_ttc, montant_paye, date_echeance").eq("tenant_id", tenantId).limit(1000),
    ]);
    const dv = (devisAll ?? []) as Money[];
    const fc = (factAll ?? []) as Money[];

    const emises = fc.filter((f) => ["envoyee", "partiellement_payee", "payee", "en_retard"].includes(String(f.statut)));
    const devisEnvoyes = dv.filter((d) => d.statut === "envoye");
    const caSigne = sum(dv.filter((d) => d.statut === "accepte"), "montant_ttc");
    const devisAttente = sum(devisEnvoyes, "montant_ttc");
    const caFacture = sum(emises, "montant_ttc");
    const caEncaisse = sum(emises, "montant_paye");
    const resteAEncaisser = Math.max(0, caFacture - caEncaisse);
    const echues = emises.filter((f) => f.statut !== "payee" && f.date_echeance && f.date_echeance < today);
    const resteEchu = echues.reduce((t, f) => t + Math.max(0, (Number(f.montant_ttc) || 0) - (Number(f.montant_paye) || 0)), 0);

    const lines: string[] = [];
    if (devisEnvoyes.length) lines.push(`- Devis en attente de réponse : ${devisEnvoyes.length} (${eur(devisAttente)})`);
    if (echues.length) lines.push(`- Factures échues impayées : ${echues.length} (${eur(resteEchu)} à recouvrer)`);
    if (caSigne > 0) lines.push(`- CA signé (devis acceptés) : ${eur(caSigne)}`);
    if (caFacture > 0) lines.push(`- CA facturé : ${eur(caFacture)} · encaissé ${eur(caEncaisse)} · reste à encaisser ${eur(resteAEncaisser)}`);

    // Payables fournisseurs (table depenses, migration 037 — tolérée absente).
    try {
      const { data: depAll, error } = await from("depenses")
        .select("statut, montant_ttc").eq("tenant_id", tenantId).in("statut", ["a_payer", "en_retard"]).limit(1000);
      if (!error) {
        const aPayer = sum((depAll ?? []) as Money[], "montant_ttc");
        if (aPayer > 0) lines.push(`- À payer aux fournisseurs : ${eur(aPayer)}`);
      }
    } catch {
      /* dépenses indisponibles → on ignore ce point */
    }

    if (!lines.length) return "";
    return ["# PILOTAGE — TRÉSORERIE & COMMERCIAL (chiffres à date, cite-les tels quels)", ...lines].join("\n");
  } catch {
    return "";
  }
}
