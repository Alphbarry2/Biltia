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

/**
 * RÉVOQUE le consentement chez le fournisseur. Appelé quand l'artisan débranche son
 * DERNIER outil d'un compte.
 *
 * Pourquoi c'est indispensable (bug du 2026-07-14) : « Déconnecter » ne faisait que
 * supprimer la ligne locale. Le consentement, lui, restait accordé chez Google —
 * qui, avec `include_granted_scopes=true`, le renvoyait à la connexion suivante. Un
 * artisan qui débranchait son Agenda le voyait donc réapparaître « Connecté » dès
 * qu'il rebranchait Gmail. Débrancher doit couper pour de bon.
 *
 * Google expose un endpoint de révocation ; Microsoft n'en a pas d'équivalent (la
 * révocation passe par le portail du compte). On supprime alors le jeton, ce qui
 * est tout ce qui est en notre pouvoir. Ne throw jamais : une révocation qui échoue
 * ne doit pas empêcher la déconnexion locale.
 */
export async function revokeToken(provider: OAuthProvider, token: string | null): Promise<void> {
  if (provider !== "google" || !token) return;
  try {
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }).toString(),
    });
  } catch {
    /* révocation best-effort : la ligne locale est supprimée quoi qu'il arrive */
  }
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
  // TOUJOURS forcer le CHOIX du compte. Sans ça, un artisan déjà connecté à un
  // compte Microsoft/Google dans son navigateur ET dont le consentement est déjà
  // accordé est reconnecté EN SILENCE sur ce compte-là, sans voir le sélecteur : il
  // clique « Connecter » et se retrouve branché sur un compte qu'il n'a pas choisi
  // — souvent le mauvais (le compte admin sans boîte mail au lieu de sa vraie adresse
  // d'envoi). « select_account » impose le sélecteur : le choix redevient explicite.
  if (opts.provider === "google") {
    // offline → refresh_token. consent conservé (Google n'émet le refresh_token
    // de façon fiable qu'avec consent) ; select_account ajoute le choix du compte.
    params.set("access_type", "offline");
    params.set("prompt", "select_account consent");
    params.set("include_granted_scopes", "true");
  } else {
    // Microsoft : select_account suffit. Le consentement réapparaît de lui-même
    // quand de nouveaux scopes sont demandés (connexion incrémentale).
    params.set("prompt", "select_account");
  }
  return `${c.authorizeEndpoint}?${params.toString()}`;
}

export type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  /** Scopes réellement accordés, séparés par des espaces. */
  scope?: string;
  /** Jeton d'identité (JWT) : présent car on demande le scope `openid`. Porte
   *  l'email du compte — utilisé UNIQUEMENT pour afficher sur quel compte on est
   *  branché (cf. accountEmailFromIdToken). */
  id_token?: string;
};

/**
 * Adresse du compte, lue dans l'id_token (JWT) que le fournisseur renvoie déjà
 * quand le scope `openid` est demandé (notre cas). AUCUN appel réseau.
 *
 * On NE vérifie PAS la signature : l'id_token vient d'être reçu du endpoint token
 * en TLS direct, et il ne sert qu'à AFFICHER quel compte est branché, jamais à une
 * décision d'autorisation. Google expose `email` ; Microsoft expose
 * `preferred_username` (l'UPN, en pratique l'adresse) et parfois `email`.
 */
export function accountEmailFromIdToken(idToken: string | undefined | null): string | null {
  if (!idToken) return null;
  const payloadB64 = idToken.split(".")[1];
  if (!payloadB64) return null;
  try {
    const json = Buffer.from(payloadB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const claims = JSON.parse(json) as { email?: string; preferred_username?: string; upn?: string };
    const email = claims.email ?? claims.preferred_username ?? claims.upn ?? null;
    return email && email.includes("@") ? email.toLowerCase() : null;
  } catch {
    return null;
  }
}

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
 *
 * `scopes` : indispensable chez Microsoft, inutile chez Google. Un jeton Azure ne
 * porte QUE les scopes demandés au moment où il est frappé — il n'est PAS
 * cumulatif (Google, lui, l'est via include_granted_scopes). Sans ce paramètre,
 * connecter OneDrive après Outlook rendrait le jeton aveugle à Mail.Send et
 * l'envoi tomberait en 403 alors que la carte afficherait « Connecté ».
 * On re-frappe donc toujours le jeton sur l'UNION des droits déjà consentis.
 */
export async function refreshAccessToken(opts: {
  provider: OAuthProvider;
  refreshToken: string;
  scopes?: string[];
}): Promise<TokenResponse> {
  const c = conf(opts.provider);
  const body = new URLSearchParams({
    client_id: c.clientId,
    client_secret: c.clientSecret,
    grant_type: "refresh_token",
    refresh_token: opts.refreshToken,
  });
  if (opts.scopes?.length) {
    body.set("scope", [...new Set([...c.baseScopes, ...opts.scopes])].join(" "));
  }
  const res = await fetch(c.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse & { error?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(json.error ?? `Rafraîchissement OAuth refusé (${res.status}).`);
  }
  return json;
}
