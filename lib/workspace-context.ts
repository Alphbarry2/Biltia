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
