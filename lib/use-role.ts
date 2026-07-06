"use client";

// ─────────────────────────────────────────────────────────────────────────────
// useRole — rôle de l'utilisateur dans le workspace ACTIF, côté client.
//
// Source unique côté UI pour masquer ce qu'un rôle n'a pas le droit de faire
// (« il voit juste ce qu'il est censé voir »). À coupler avec can() de
// lib/permissions.ts : ce qu'on cache ici est AUSSI bloqué côté serveur (défense
// en profondeur) — le masquage est un confort, pas la barrière.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { getActiveMembership } from "@/lib/tenant";
import { can, type Capability, type Role } from "@/lib/permissions";

export function useRole(): {
  role: Role | null;
  loading: boolean;
  can: (capability: Capability) => boolean;
} {
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase.auth
      .getUser()
      .then(async ({ data: { user } }) => {
        if (!user) {
          if (!cancelled) setLoading(false);
          return;
        }
        const membership = await getActiveMembership(supabase, user.id);
        if (!cancelled) {
          setRole((membership?.role as Role) ?? null);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { role, loading, can: (capability) => can(role, capability) };
}
