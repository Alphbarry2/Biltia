// ─────────────────────────────────────────────────────────────────────────────
// TENANT ACTIF — résolution unique du workspace de l'utilisateur.
//
// Un utilisateur peut appartenir à PLUSIEURS espaces : le sien (créé à
// l'inscription, rôle owner) + ceux où il a été invité (rôle admin/manager/
// member/viewer) + ceux qu'il crée ensuite (multi-entreprises).
//
// Résolution, dans l'ordre :
//   1. Choix explicite de l'utilisateur (cookie biltia_active_tenant, posé par
//      le sélecteur de workspace) — s'il correspond à un membership accepté.
//   2. Sinon, règle produit historique : un collaborateur invité travaille DANS
//      l'espace de l'entreprise qui l'a invité → membership accepté le plus
//      récent où il n'est PAS owner ; sinon son propre espace le plus ancien.
//
// Côté client le cookie est lu automatiquement ; côté serveur (routes API,
// Server Components) passer par getActiveMembershipServer (lib/tenant-server)
// qui lit le cookie via next/headers.
// ─────────────────────────────────────────────────────────────────────────────

export type ActiveMembership = { tenant_id: string; role: string };

export type WorkspaceMembership = {
  tenant_id: string;
  role: string;
  name: string;
};

export const ACTIVE_TENANT_COOKIE = "biltia_active_tenant";

/** Lit le cookie du workspace actif — navigateur uniquement (sinon null). */
export function readActiveTenantCookie(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${ACTIVE_TENANT_COOKIE}=([^;]+)`)
  );
  return m ? decodeURIComponent(m[1]) : null;
}

/** Pose le cookie du workspace actif — navigateur uniquement (1 an, lax). */
export function writeActiveTenantCookie(tenantId: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${ACTIVE_TENANT_COOKIE}=${encodeURIComponent(
    tenantId
  )}; path=/; max-age=31536000; samesite=lax`;
}

/** Vue minimale d'un client Supabase — compatible client navigateur, serveur
 *  (cookies) et service_role, typés ou non. */
type MinimalClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

/**
 * Retourne le workspace actif de l'utilisateur (tenant_id + rôle), ou null
 * s'il n'a aucun membership accepté. Ne throw jamais.
 *
 * `preferredTenantId` : choix explicite (cookie) — ignoré s'il ne correspond
 * pas à un membership accepté. Non fourni côté navigateur → cookie lu
 * automatiquement.
 */
export async function getActiveMembership(
  supabase: MinimalClient,
  userId: string,
  preferredTenantId?: string | null
): Promise<ActiveMembership | null> {
  try {
    const { data } = await supabase
      .from("tenant_members")
      .select("tenant_id, role, created_at")
      .eq("user_id", userId)
      .not("accepted_at", "is", null)
      .order("created_at", { ascending: false });

    const rows = (data ?? []) as { tenant_id: string; role: string }[];
    if (!rows.length) return null;

    // 1. Choix explicite (sélecteur de workspace) — validé contre les memberships.
    const preferred =
      preferredTenantId === undefined ? readActiveTenantCookie() : preferredTenantId;
    if (preferred) {
      const chosen = rows.find((m) => m.tenant_id === preferred);
      if (chosen) return { tenant_id: chosen.tenant_id, role: chosen.role };
    }

    // 2. Invité quelque part → cet espace-là est son espace de travail.
    const invited = rows.find((m) => m.role !== "owner");
    const m = invited ?? rows[rows.length - 1]; // sinon : son espace le plus ancien
    return { tenant_id: m.tenant_id, role: m.role };
  } catch {
    return null;
  }
}

/**
 * Liste tous les workspaces de l'utilisateur (memberships acceptés), avec le
 * nom du tenant, du plus ancien au plus récent. Ne throw jamais.
 */
export async function listWorkspaces(
  supabase: MinimalClient,
  userId: string
): Promise<WorkspaceMembership[]> {
  try {
    const { data } = await supabase
      .from("tenant_members")
      .select("tenant_id, role, created_at, tenants(name)")
      .eq("user_id", userId)
      .not("accepted_at", "is", null)
      .order("created_at", { ascending: true });

    const rows = (data ?? []) as {
      tenant_id: string;
      role: string;
      tenants: { name: string } | { name: string }[] | null;
    }[];

    return rows.map((r) => {
      const t = Array.isArray(r.tenants) ? r.tenants[0] : r.tenants;
      return { tenant_id: r.tenant_id, role: r.role, name: t?.name ?? "Mon espace" };
    });
  } catch {
    return [];
  }
}
