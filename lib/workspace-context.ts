import { SupabaseClient } from "@supabase/supabase-js";

export type WorkspaceContext = {
  employees_actifs: number;
  chantiers_total: number;
  chantiers_actifs: number;
  clients_total: number;
  materiels_disponibles: number;
  documents_expirant_bientot: number;
  employees: { nom: string; prenom: string | null; role: string | null; corps_metier: string | null }[];
  chantiers: { nom: string; statut: string; ville: string | null; avancement: number }[];
  clients: { nom: string; type: string | null; ville: string | null }[];
};

export async function getWorkspaceContext(
  supabase: SupabaseClient,
  tenantId: string
): Promise<WorkspaceContext | null> {
  const { data } = await supabase.rpc("get_workspace_context", {
    p_tenant_id: tenantId,
  });
  return data ?? null;
}

export function buildWorkspaceBlock(ctx: WorkspaceContext | null): string {
  if (!ctx) return "";

  const lines: string[] = [
    "# CONTEXTE DU WORKSPACE (données déjà présentes — utilise-les)",
    "",
    `## Résumé`,
    `- ${ctx.employees_actifs} employés actifs`,
    `- ${ctx.chantiers_actifs} chantiers en cours (${ctx.chantiers_total} au total)`,
    `- ${ctx.clients_total} clients`,
    `- ${ctx.materiels_disponibles} matériels disponibles`,
  ];

  if (ctx.documents_expirant_bientot > 0) {
    lines.push(`- ⚠️ ${ctx.documents_expirant_bientot} documents expirant dans les 30 jours`);
  }

  if (ctx.employees?.length) {
    lines.push("", "## Employés actifs");
    ctx.employees.slice(0, 10).forEach((e) => {
      const label = [e.prenom, e.nom].filter(Boolean).join(" ");
      const meta = [e.role, e.corps_metier].filter(Boolean).join(" · ");
      lines.push(`- ${label}${meta ? ` (${meta})` : ""}`);
    });
    if (ctx.employees.length > 10) lines.push(`  … et ${ctx.employees.length - 10} autres`);
  }

  if (ctx.chantiers?.length) {
    lines.push("", "## Chantiers actifs");
    ctx.chantiers.slice(0, 10).forEach((c) => {
      lines.push(`- ${c.nom}${c.ville ? ` · ${c.ville}` : ""} — ${c.avancement}% (${c.statut})`);
    });
  }

  if (ctx.clients?.length) {
    lines.push("", "## Clients");
    ctx.clients.slice(0, 10).forEach((c) => {
      lines.push(`- ${c.nom}${c.type ? ` (${c.type})` : ""}${c.ville ? ` · ${c.ville}` : ""}`);
    });
  }

  lines.push(
    "",
    "## Règle absolue",
    "Le module que tu génères fait PARTIE de ce workspace. Il doit utiliser les",
    "vrais noms d'employés, de chantiers et de clients ci-dessus comme données",
    "d'exemple pré-remplies — pas des données inventées. L'utilisateur doit",
    "reconnaître ses propres données dès la première ouverture.",
  );

  return lines.join("\n");
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
