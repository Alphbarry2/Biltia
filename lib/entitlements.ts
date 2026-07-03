// ─────────────────────────────────────────────────────────────────────────────
// ENTITLEMENTS — droits d'un utilisateur selon son abonnement. CÔTÉ SERVEUR.
//
// Source unique des règles : lib/plans.ts. Ce module résout le WORKSPACE (tenant)
// de l'utilisateur puis lit la ligne `subscriptions` correspondante (indexée par
// tenant_id dans le schéma de prod), et expose limites + features pour le gating.
// Free par défaut si aucun workspace / aucun abonnement / erreur.
//
// NB : la table `subscriptions` n'est pas encore dans database.types.ts. On
// utilise donc un client structurel non typé (cf. lib/ai-usage.ts pour `ai_usage`).
// ─────────────────────────────────────────────────────────────────────────────

import { getPlan, type PlanId, type PlanLimits } from "./plans";

/** Vue minimale d'un client Supabase, compatible client typé ET service_role. */
type QueryableClient = { from: (table: string) => any };

export interface Entitlements {
  plan: PlanId;
  status: string;
  creditsPerMonth: number;
  limits: PlanLimits;
}

const FREE_ENTITLEMENTS: Entitlements = {
  plan: "free",
  status: "active",
  creditsPerMonth: 0,
  limits: getPlan("free").limits,
};

/**
 * Charge les droits de l'utilisateur. Dégrade vers Free si aucune ligne
 * d'abonnement ou en cas d'erreur (fail-safe : jamais plus permissif que Free).
 */
export async function getEntitlements(
  supabase: QueryableClient,
  userId: string
): Promise<Entitlements> {
  try {
    // 1. Workspace (tenant) de l'utilisateur — le plus ancien accepté.
    const { data: membership } = await supabase
      .from("tenant_members")
      .select("tenant_id")
      .eq("user_id", userId)
      .not("accepted_at", "is", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const tenantId: string | undefined = membership?.tenant_id;
    if (!tenantId) return FREE_ENTITLEMENTS;

    // 2. Abonnement du workspace (schéma prod : indexé par tenant_id).
    const { data } = await supabase
      .from("subscriptions")
      .select("plan, status")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (!data) return FREE_ENTITLEMENTS;

    // Un abonnement non actif (past_due, canceled…) retombe sur les droits Free.
    const active = data.status === "active" || data.status === "trialing";
    const plan: PlanId = active ? (data.plan as PlanId) : "free";

    return {
      plan,
      status: data.status ?? "active",
      // Le palier mensuel n'est pas stocké dans le schéma prod (par-tenant).
      creditsPerMonth: 0,
      limits: getPlan(plan).limits,
    };
  } catch {
    return FREE_ENTITLEMENTS;
  }
}

/** Raccourci : l'utilisateur peut-il déployer une app en Live ? */
export function canDeployLive(ent: Entitlements): boolean {
  return ent.limits.liveDeploy;
}
