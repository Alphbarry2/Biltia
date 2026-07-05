// ─────────────────────────────────────────────────────────────────────────────
// JOURNAL D'ACTIVITÉ — « Ce que Biltia a fait pour vous ».
//
// Alimente la table `activity_logs` (lue par app/(app)/activity/page.tsx).
// Best-effort ABSOLU : ne throw jamais, ne bloque jamais la réponse.
// RLS : insert autorisé aux membres du tenant (with_check my_tenant_role).
// ─────────────────────────────────────────────────────────────────────────────

/** Actions reconnues par l'UI (icônes) : create, generate, update, delete,
 *  export, send, document. Toute autre valeur retombe sur l'icône générique. */
export type ActivityAction =
  | "create"
  | "generate"
  | "update"
  | "delete"
  | "export"
  | "send"
  | "document";

type MinimalClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export async function logActivity(
  supabase: MinimalClient,
  params: {
    tenantId: string;
    userId?: string;
    action: ActivityAction | string;
    entityType: string;
    entityId?: string | null;
    description: string;
  }
): Promise<void> {
  try {
    await supabase.from("activity_logs").insert({
      tenant_id: params.tenantId,
      user_id: params.userId ?? null,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId ?? null,
      description: params.description.slice(0, 300),
    });
  } catch {
    // Le journal ne casse jamais la fonctionnalité.
  }
}
