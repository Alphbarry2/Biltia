// ─────────────────────────────────────────────────────────────────────────────
// Résolution SERVEUR du compte par défaut : lit les connexions + la préférence de
// l'utilisateur, applique la règle pure (lib/send-preference), renvoie l'ordre des
// fournisseurs à essayer. Isolé du module pur pour que celui-ci reste importable
// côté client (l'UI calcule le même défaut sans jamais charger le service_role).
//
// Best-effort : toute panne base renvoie [] → l'appelant garde son ordre historique.
// ─────────────────────────────────────────────────────────────────────────────

import { createAdminClient } from "./supabase-admin";
import { normalizePreferences } from "./user-preferences";
import { orderForCapability, type SendCapability, type ConnLite } from "./send-preference";
import type { OAuthProvider } from "./connectors";

export async function preferredProviderOrder(
  tenantId: string,
  userId: string | null,
  capability: SendCapability
): Promise<OAuthProvider[]> {
  if (!userId) return [];
  const admin = createAdminClient();
  if (!admin) return [];
  try {
    const [conns, profile] = await Promise.all([
      admin
        .from("user_connections")
        .select("provider, connected_at, connectors")
        .eq("tenant_id", tenantId)
        .eq("user_id", userId),
      admin.from("profiles").select("preferences").eq("user_id", userId).maybeSingle(),
    ]);
    const connections = (conns.data ?? []) as ConnLite[];
    const prefs = normalizePreferences((profile.data as { preferences?: unknown } | null)?.preferences);
    const override = capability === "email" ? prefs.email_provider : prefs.calendar_provider;
    return orderForCapability(capability, connections, override);
  } catch {
    return [];
  }
}
