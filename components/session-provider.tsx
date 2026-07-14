"use client";

// ─────────────────────────────────────────────────────────────────────────────
// SESSION PARTAGÉE — la source unique de « qui es-tu et où travailles-tu ».
//
// ⚠️ POURQUOI CE FICHIER EXISTE : `supabase.auth.getUser()` est un APPEL RÉSEAU.
//
// Ce n'est pas une lecture locale. Dans @supabase/auth-js, `getUser()` fait
// TOUJOURS un `GET /auth/v1/user` vers Supabase (100 à 400 ms), et — le point
// vraiment coûteux — il le fait derrière un VERROU GLOBAL (`navigator.locks`),
// sur un client navigateur qui est un SINGLETON. Autrement dit, les `getUser()`
// de composants différents ne partent pas en parallèle : ILS FONT LA QUEUE.
//
// Avant ce fichier, un simple affichage de /settings enchaînait CINQ getUser()
// sérialisés (le garde d'auth, la sidebar, le bandeau, la page, le hook de rôle),
// puis QUATRE résolutions de workspace identiques — soit une douzaine d'allers-
// retours réseau EN SÉRIE avant que le premier chiffre ne s'affiche. C'était ça,
// la lenteur : pas le rendu, pas les données, juste la file d'attente.
//
// Ici on résout TOUT une seule fois, et on le partage :
//
//   • `getSession()` au lieu de `getUser()`. Il lit la session depuis le cookie,
//     SANS réseau quand le jeton est valide (et le rafraîchit tout seul s'il est
//     expiré). Côté NAVIGATEUR c'est parfaitement sûr : la sécurité ne repose pas
//     sur ce que le client affirme, elle repose sur la RLS de Supabase, qui
//     revalide le jeton à CHAQUE requête. Un getUser() ici ne protège de rien.
//     ⚠️ Côté SERVEUR, c'est l'inverse : garder getUser(), il valide vraiment.
//
//   • le workspace, les crédits, l'abonnement et l'essai sont résolus UNE fois et
//     diffusés par contexte. La sidebar, le bandeau et les pages les lisent au
//     lieu de les redemander chacun de leur côté.
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { getActiveMembership } from "@/lib/tenant";

export type SessionUser = { id: string; email: string; name: string };
export type SessionMembership = { tenant_id: string; role: string };
export type SessionBilling = {
  /** Solde total : abonnement + packs (non expirables). */
  credits: number;
  plan: string | null;
  status: string | null;
  /** Fin de l'essai gratuit (ISO), null si non démarré ou si abonné. */
  trialEndsAt: string | null;
};

export type SessionState = {
  user: SessionUser | null;
  membership: SessionMembership | null;
  billing: SessionBilling | null;
  /** Vrai tant que la résolution est en cours (premier rendu). */
  loading: boolean;
  /** Recharge le solde de crédits après une action qui en consomme. */
  refreshCredits: () => Promise<void>;
};

const EMPTY: SessionState = {
  user: null,
  membership: null,
  billing: null,
  loading: true,
  refreshCredits: async () => {},
};

const SessionContext = createContext<SessionState>(EMPTY);

/** La session courante, résolue UNE fois pour toute l'application. */
export function useSession(): SessionState {
  return useContext(SessionContext);
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [membership, setMembership] = useState<SessionMembership | null>(null);
  const [billing, setBilling] = useState<SessionBilling | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshCredits = useCallback(async () => {
    if (!user) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("user_credits")
      .select("balance, topup_balance")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) {
      setBilling((b) =>
        b ? { ...b, credits: (data.balance ?? 0) + (data.topup_balance ?? 0) } : b
      );
    }
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    (async () => {
      // 1) La session, DEPUIS LE COOKIE — aucun aller-retour réseau quand le jeton
      //    est valide. C'est tout l'intérêt du fichier.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const u = session?.user;
      if (!u) {
        if (!cancelled) setLoading(false);
        return;
      }
      const nextUser: SessionUser = {
        id: u.id,
        email: u.email ?? "",
        name: u.user_metadata?.full_name ?? u.email?.split("@")[0] ?? "",
      };
      if (cancelled) return;
      setUser(nextUser);

      // 2) Workspace + crédits EN PARALLÈLE : rien ne les lie l'un à l'autre.
      const [m, credit] = await Promise.all([
        getActiveMembership(supabase, u.id),
        supabase.from("user_credits").select("balance, topup_balance").eq("user_id", u.id).maybeSingle(),
      ]);
      if (cancelled) return;
      setMembership(m ? { tenant_id: m.tenant_id, role: m.role } : null);

      const credits = credit.data
        ? (credit.data.balance ?? 0) + (credit.data.topup_balance ?? 0)
        : 0;

      // 3) Abonnement + essai : ils dépendent du tenant, donc ils viennent après —
      //    mais en parallèle l'un de l'autre.
      if (!m?.tenant_id) {
        if (!cancelled) {
          setBilling({ credits, plan: null, status: null, trialEndsAt: null });
          setLoading(false);
        }
        return;
      }
      const [sub, tenant] = await Promise.all([
        supabase.from("subscriptions").select("plan, status").eq("tenant_id", m.tenant_id).maybeSingle(),
        supabase.from("tenants").select("trial_ends_at").eq("id", m.tenant_id).maybeSingle(),
      ]);
      if (cancelled) return;

      setBilling({
        credits,
        plan: sub.data?.plan ?? null,
        status: sub.data?.status ?? null,
        // Un abonné n'a plus d'essai : sa date en base est ignorée (miroir exact de
        // lib/entitlements.ts — sans ça, il serait « en essai expiré » à l'écran).
        trialEndsAt: sub.data?.status ? null : (tenant.data?.trial_ends_at ?? null),
      });
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SessionContext.Provider value={{ user, membership, billing, loading, refreshCredits }}>
      {children}
    </SessionContext.Provider>
  );
}
