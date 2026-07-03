import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// ─────────────────────────────────────────────────────────────────────────────
// CLIENT SERVICE_ROLE — contourne RLS. STRICTEMENT CÔTÉ SERVEUR.
// Ne jamais importer dans du code client (la clé ne doit jamais fuiter au navigateur).
//
// Sert aux opérations privilégiées qui ne doivent PAS être appelables par
// l'utilisateur (ex : refund_credits, désormais réservé à service_role —
// cf. migration 003_security_hardening.sql).
// ─────────────────────────────────────────────────────────────────────────────

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/**
 * Retourne un client service_role, ou `null` si la clé n'est pas configurée
 * (permet aux appelants de dégrader proprement plutôt que de crasher).
 */
export function createAdminClient() {
  if (!url.startsWith("https://") || serviceKey.length < 20) return null;

  return createSupabaseClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
