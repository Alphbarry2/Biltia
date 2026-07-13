// ─────────────────────────────────────────────────────────────────────────────
// CONSOMMATEUR D'OUTBOX (câble Phase 5 → Phase 6).
//
// L'outbox `domain_events` était ÉMIS mais jamais LU : les agents ne réagissaient
// aux changements qu'au fil de leur `next_run_at` (scan périodique aveugle). Ici,
// à chaque tick, on lit les événements non traités et on AVANCE le `next_run_at`
// des règles-ÉVÉNEMENT dont l'entité surveillée vient de bouger → elles réagissent
// dès CE tick, sur la donnée fraîche.
//
// 100 % ADDITIF : on ne change AUCUNE logique d'exécution. On met seulement
// `next_run_at = now` (le tick existant les sélectionne) et on marque les events
// traités. L'idempotence par fiche (executeEventRule) reste intacte ; le coût est
// borné aux fiches RÉELLEMENT nouvelles (le pré-filtre du veilleur ne rappelle pas
// l'IA sur des fiches déjà traitées). Best-effort : ne casse jamais le tick.
// ─────────────────────────────────────────────────────────────────────────────

import { markEventsProcessed } from "./domain-events";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = { from: (t: string) => any };

/**
 * Entité(s) workspace surveillée(s) par un veilleur (heuristique par préfixe de clé
 * — les clés du catalogue sont préfixées par leur domaine : chantier_*, devis_*…).
 * Un mismatch éventuel est SANS DANGER : la règle n'est simplement pas avancée et
 * tourne à son rythme normal.
 */
export function watcherEntities(key: string): string[] {
  if (!key) return [];
  if (key === "facture_fournisseur_a_payer" || key === "achat_non_affecte") return ["depenses"];
  if (key === "nouveau_chantier") return ["chantiers"];
  if (key === "nouveau_lead") return ["demandes"];
  if (key === "nouveau_client" || key === "clients_doublons") return ["clients"];
  if (key === "stock_bas") return ["materials"];
  if (key === "rdv_demain" || key === "visite_terminee" || key === "conflit_planning") return ["interventions"];
  if (key === "equipe_surchargee") return ["pointages"];
  if (key === "assurance_expiree") return ["documents", "suppliers"];
  if (key === "echeance_proche") return ["documents", "suppliers", "parc_installe", "contrats", "equipment"];
  if (key.startsWith("chantier")) return ["chantiers"];
  if (key.startsWith("devis")) return ["devis"];
  if (key.startsWith("facture")) return ["factures"];
  if (key.startsWith("tache")) return ["tasks"];
  if (key.startsWith("intervention")) return ["interventions"];
  if (key.startsWith("client")) return ["clients"];
  if (key.startsWith("demande")) return ["demandes"];
  if (key.startsWith("sous_traitant")) return ["suppliers"];
  if (key.startsWith("commande")) return ["commandes"];
  if (key.startsWith("pointage") || key.startsWith("heures")) return ["pointages"];
  if (key.startsWith("document")) return ["documents"];
  if (key.startsWith("rappel")) return ["rappels"];
  return [];
}

export interface ConsumeResult {
  consumed: number; // événements marqués traités
  advanced: number; // règles-événement avancées à « maintenant »
}

/**
 * Lit l'outbox (global, borné), avance les règles-événement concernées et marque
 * les événements traités. Appelé au DÉBUT du tick (avant la sélection des règles
 * dues) → les règles avancées sont prises dans le MÊME tick. Best-effort.
 */
export async function consumeOutbox(
  admin: SupabaseLike | null,
  opts: { limit?: number; nowIso?: string } = {}
): Promise<ConsumeResult> {
  if (!admin) return { consumed: 0, advanced: 0 };
  const from = (t: string) => admin.from(t);
  const nowIso = opts.nowIso ?? new Date().toISOString();
  try {
    const { data: events, error } = await from("domain_events")
      .select("id, tenant_id, entity")
      .is("processed_at", null)
      .order("created_at", { ascending: true })
      .limit(Math.min(opts.limit ?? 500, 1000));
    if (error || !events || !events.length) return { consumed: 0, advanced: 0 };

    const byTenant = new Map<string, Set<string>>();
    const ids: string[] = [];
    for (const e of events as { id: string; tenant_id: string; entity: string }[]) {
      ids.push(e.id);
      let set = byTenant.get(e.tenant_id);
      if (!set) { set = new Set(); byTenant.set(e.tenant_id, set); }
      if (e.entity) set.add(e.entity);
    }

    const tenantIds = [...byTenant.keys()];
    const { data: rules } = await from("agent_rules")
      .select("id, tenant_id, trigger")
      .eq("status", "active")
      .eq("trigger_type", "event")
      .in("tenant_id", tenantIds)
      .gt("next_run_at", nowIso) // uniquement celles dont le passage est dans le FUTUR
      .limit(1000);

    const toAdvance: string[] = [];
    for (const r of (rules ?? []) as { id: string; tenant_id: string; trigger: { watcher?: string } | null }[]) {
      const watcher = r.trigger?.watcher;
      if (!watcher) continue;
      const touched = byTenant.get(r.tenant_id);
      if (!touched) continue;
      if (watcherEntities(watcher).some((en) => touched.has(en))) toAdvance.push(r.id);
    }

    if (toAdvance.length) {
      await from("agent_rules").update({ next_run_at: nowIso }).in("id", toAdvance);
    }
    // Marque traité APRÈS l'avancement (si l'update échoue, les events sont
    // re-consommés au prochain tick — idempotent, sans effet de bord).
    await markEventsProcessed(from, ids);

    return { consumed: ids.length, advanced: toAdvance.length };
  } catch {
    return { consumed: 0, advanced: 0 };
  }
}
