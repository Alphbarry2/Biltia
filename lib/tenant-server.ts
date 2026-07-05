// ─────────────────────────────────────────────────────────────────────────────
// TENANT ACTIF — variante serveur (routes API, Server Components).
//
// Identique à getActiveMembership, mais lit le choix explicite de workspace
// (cookie biltia_active_tenant) via next/headers — inaccessible depuis le
// module partagé lib/tenant.ts qui est aussi importé côté navigateur.
// ─────────────────────────────────────────────────────────────────────────────

import { cookies } from "next/headers";
import {
  ACTIVE_TENANT_COOKIE,
  getActiveMembership,
  type ActiveMembership,
} from "./tenant";

type MinimalClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

/**
 * Workspace actif de l'utilisateur côté serveur : respecte le cookie du
 * sélecteur s'il pointe vers un membership accepté, sinon règle historique.
 * Ne throw jamais.
 */
export async function getActiveMembershipServer(
  supabase: MinimalClient,
  userId: string
): Promise<ActiveMembership | null> {
  let preferred: string | null = null;
  try {
    const store = await cookies();
    preferred = store.get(ACTIVE_TENANT_COOKIE)?.value ?? null;
  } catch {
    // Hors contexte requête (build, tests) → pas de préférence.
  }
  return getActiveMembership(supabase, userId, preferred);
}
