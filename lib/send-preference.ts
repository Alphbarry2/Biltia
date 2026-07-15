// ─────────────────────────────────────────────────────────────────────────────
// COMPTE PAR DÉFAUT quand plusieurs sont connectés (Gmail ET Outlook).
//
// Le problème : l'envoi et l'agenda choisissaient le fournisseur par un ordre CODÉ
// EN DUR (Gmail/Google d'abord). Un artisan qui branche Outlook comme adresse pro
// se voyait quand même envoyer depuis son Gmail perso, sans pouvoir décider.
//
// La règle, ici, une seule fois pour l'envoi ET l'agenda :
//   1. Le choix EXPLICITE de l'utilisateur d'abord, s'il est encore connecté.
//   2. Sinon le PREMIER connecté (connected_at le plus ancien) — le compte que
//      l'artisan a mis en place en premier est presque toujours son principal.
//   3. Repli, à égalité ou si rien ne tranche : Google (Gmail), l'ordre historique.
//
// Fonction PURE (providerOrder) : c'est elle qui porte la règle, testable seule.
// Les résolveurs serveur ne font que lui fournir connexions + préférence.
// ─────────────────────────────────────────────────────────────────────────────

import type { OAuthProvider } from "./connectors";

/** Ce dont la règle a besoin d'une connexion : qui, et depuis quand. */
export type ProviderCandidate = { provider: OAuthProvider; connected_at: string };

/**
 * Les fournisseurs CANDIDATS, ordonnés du plus prioritaire au moins prioritaire.
 * `override` = choix explicite de l'utilisateur (null si « automatique »). Un
 * override qui ne fait PAS partie des candidats (compte débranché depuis) est
 * ignoré : on ne renvoie jamais un fournisseur non connecté.
 */
export function providerOrder(
  candidates: ProviderCandidate[],
  override: OAuthProvider | null | undefined
): OAuthProvider[] {
  if (candidates.length === 0) return [];
  // Premier connecté d'abord ; à égalité de date, Google passe devant (repli
  // historique — changer cet ordre déplacerait silencieusement l'envoi par défaut).
  const byAge = [...candidates].sort((a, b) => {
    const ta = Date.parse(a.connected_at) || 0;
    const tb = Date.parse(b.connected_at) || 0;
    if (ta !== tb) return ta - tb;
    return a.provider === "google" ? -1 : 1;
  });
  const order = byAge.map((c) => c.provider);
  if (override && order.includes(override)) {
    return [override, ...order.filter((p) => p !== override)];
  }
  return order;
}

/** Fournisseur par défaut (tête de liste), ou null si aucun candidat. */
export function defaultProvider(
  candidates: ProviderCandidate[],
  override: OAuthProvider | null | undefined
): OAuthProvider | null {
  return providerOrder(candidates, override)[0] ?? null;
}

// ── Par capacité (email / agenda) ────────────────────────────────────────────
// Un fournisseur n'est CANDIDAT pour une capacité que si le connecteur qui la porte
// est branché : avoir Gmail connecté ne fait pas de Google un candidat pour l'AGENDA.

export type SendCapability = "email" | "calendar";

/** Le connecteur qui porte chaque capacité, par fournisseur. */
export const CAP_CONNECTOR: Record<SendCapability, Record<OAuthProvider, string>> = {
  email: { google: "gmail", microsoft: "outlook" },
  calendar: { google: "google-calendar", microsoft: "outlook-calendar" },
};

/** Forme minimale d'une connexion nécessaire au calcul (sous-ensemble de ConnectionInfo). */
export type ConnLite = { provider: OAuthProvider; connected_at: string; connectors: string[] };

/**
 * Ordre des fournisseurs branchés POUR cette capacité, choix explicite en tête.
 * Pure : mêmes entrées → même sortie, côté serveur (envoi) comme client (UI défaut).
 */
export function orderForCapability(
  capability: SendCapability,
  connections: ConnLite[],
  override: OAuthProvider | null | undefined
): OAuthProvider[] {
  const wanted = CAP_CONNECTOR[capability];
  const candidates = connections
    .filter(
      (c) =>
        (c.provider === "google" || c.provider === "microsoft") &&
        Array.isArray(c.connectors) &&
        c.connectors.includes(wanted[c.provider])
    )
    .map((c) => ({ provider: c.provider, connected_at: c.connected_at }));
  return providerOrder(candidates, override);
}

/** Fournisseur par défaut pour la capacité, ou null si aucun ne la porte. */
export function defaultForCapability(
  capability: SendCapability,
  connections: ConnLite[],
  override: OAuthProvider | null | undefined
): OAuthProvider | null {
  return orderForCapability(capability, connections, override)[0] ?? null;
}
