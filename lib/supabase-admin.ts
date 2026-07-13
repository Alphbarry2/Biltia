import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
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

/**
 * Même client, mais SANS le typage `Database`.
 *
 * `lib/database.types.ts` est en retard sur la base réelle : les entités métier
 * (devis, factures, lignes, validations, document_links…) n'y figurent pas, alors
 * qu'elles existent en production. Un `.from("devis")` sur le client typé échoue
 * donc à la compilation, pour une table parfaitement valide.
 *
 * Motif déjà employé par lib/demo-server.ts:28 — centralisé ici pour ne pas le
 * recopier à chaque route. À supprimer le jour où les types seront régénérés.
 */
export function createAdminClientUntyped(): SupabaseClient | null {
  const admin = createAdminClient();
  return admin ? (admin as unknown as SupabaseClient) : null;
}
