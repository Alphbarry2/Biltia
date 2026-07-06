// ─────────────────────────────────────────────────────────────────────────────
// OAUTH GOOGLE / MICROSOFT — construction des URLs et échange des codes.
// STRICTEMENT CÔTÉ SERVEUR (lit les secrets d'environnement).
//
// Variables attendues (par fournisseur) :
//   GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET
//   MICROSOFT_OAUTH_CLIENT_ID / MICROSOFT_OAUTH_CLIENT_SECRET
// Redirect URI à déclarer chez le fournisseur : <origine>/api/connections/callback
// (NEXT_PUBLIC_APP_URL prime sur l'origine de la requête si défini).
//
// Absentes → oauthConfigured() renvoie false et l'API répond 501 avec un
// message honnête ; le reste du produit (version sans connexion) fonctionne.
// ─────────────────────────────────────────────────────────────────────────────

import type { OAuthProvider } from "./connectors";

export const OAUTH_STATE_COOKIE = "biltia_oauth_state";

type ProviderConf = {
  clientId: string;
  clientSecret: string;
  authorizeEndpoint: string;
  tokenEndpoint: string;
  /** Scopes d'identité toujours demandés en plus des scopes du connecteur. */
  baseScopes: string[];
};

function conf(provider: OAuthProvider): ProviderConf {
  if (provider === "google") {
    return {
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
      authorizeEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenEndpoint: "https://oauth2.googleapis.com/token",
      baseScopes: ["openid", "email"],
    };
  }
  return {
    clientId: process.env.MICROSOFT_OAUTH_CLIENT_ID ?? "",
    clientSecret: process.env.MICROSOFT_OAUTH_CLIENT_SECRET ?? "",
    authorizeEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    baseScopes: ["openid", "email", "offline_access"],
  };
}

export function oauthConfigured(provider: OAuthProvider): boolean {
  const c = conf(provider);
  return c.clientId.length > 0 && c.clientSecret.length > 0;
}

export function redirectUri(origin: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || origin;
  return `${base.replace(/\/$/, "")}/api/connections/callback`;
}

export function buildAuthorizeUrl(opts: {
  provider: OAuthProvider;
  scopes: string[];
  state: string;
  origin: string;
}): string {
  const c = conf(opts.provider);
  const params = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: redirectUri(opts.origin),
    response_type: "code",
    scope: [...c.baseScopes, ...opts.scopes].join(" "),
    state: opts.state,
  });
  if (opts.provider === "google") {
    // offline + consent → refresh_token ; scopes déjà accordés conservés.
    params.set("access_type", "offline");
    params.set("prompt", "consent");
    params.set("include_granted_scopes", "true");
  }
  return `${c.authorizeEndpoint}?${params.toString()}`;
}

export type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  /** Scopes réellement accordés, séparés par des espaces. */
  scope?: string;
};

/** Échange le code d'autorisation contre des jetons. Throw en cas d'échec. */
export async function exchangeCode(opts: {
  provider: OAuthProvider;
  code: string;
  origin: string;
}): Promise<TokenResponse> {
  const c = conf(opts.provider);
  const res = await fetch(c.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.clientId,
      client_secret: c.clientSecret,
      code: opts.code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri(opts.origin),
    }),
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse & { error?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(json.error ?? `Échange OAuth refusé (${res.status}).`);
  }
  return json;
}

/**
 * Rafraîchit un access_token à partir du refresh_token stocké. Throw en cas
 * d'échec (refresh_token révoqué/expiré → l'appelant redemandera une connexion).
 */
export async function refreshAccessToken(opts: {
  provider: OAuthProvider;
  refreshToken: string;
}): Promise<TokenResponse> {
  const c = conf(opts.provider);
  const res = await fetch(c.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.clientId,
      client_secret: c.clientSecret,
      grant_type: "refresh_token",
      refresh_token: opts.refreshToken,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse & { error?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(json.error ?? `Rafraîchissement OAuth refusé (${res.status}).`);
  }
  return json;
}
