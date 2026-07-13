// ─────────────────────────────────────────────────────────────────────────────
// RATE LIMITING — distribué (Postgres), STRICTEMENT CÔTÉ SERVEUR.
//
// Empêche l'abus des routes coûteuses (bombardement d'appels IA, scraping,
// crash volontaire du backend). Le compteur vit en base (cf. migration 023) et
// est donc partagé entre toutes les instances serverless Vercel.
//
// FAIL-OPEN : si le limiteur lui-même est indisponible (clé service_role absente,
// RPC en erreur, migration pas encore déployée), on AUTORISE. Un limiteur cassé
// ne doit jamais bloquer le produit ; les autres barrières restent en place
// (auth, débit de crédits, RLS). Le rate limiting s'active dès que 023 est en
// prod, sans casse entre-temps.
// ─────────────────────────────────────────────────────────────────────────────

import { createAdminClient } from "./supabase-admin";
import { getLocale } from "./i18n/server";
import { pick } from "./i18n/config";

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  reset: number; // epoch (s) où la fenêtre courante se réinitialise
  retryAfter: number; // secondes à patienter (0 si autorisé)
};

/**
 * Vérifie et consomme un jeton de rate limit.
 *
 * @param name     nom logique de la limite (ex : "generate", "ask")
 * @param identity identité à limiter (id utilisateur, ou IP pour l'anonyme)
 * @param opts     limit = nb d'appels autorisés par fenêtre ; windowSec = durée
 */
export async function rateLimit(
  name: string,
  identity: string,
  opts: { limit: number; windowSec: number }
): Promise<RateLimitResult> {
  const nowSec = Math.floor(Date.now() / 1000);
  const openResult: RateLimitResult = {
    ok: true,
    remaining: opts.limit,
    reset: nowSec + opts.windowSec,
    retryAfter: 0,
  };

  const admin = createAdminClient();
  if (!admin) return openResult; // clé service_role absente → fail-open

  try {
    // Les types générés ne connaissent pas encore check_rate_limit → cast ciblé
    // (même convention que create_workspace, cf. app/api/workspaces/route.ts).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin.rpc as any)("check_rate_limit", {
      p_key: `${name}:${identity}`,
      p_limit: opts.limit,
      p_window_sec: opts.windowSec,
    });
    if (error || !data) return openResult; // RPC absente/en erreur → fail-open

    const d = data as { allowed: boolean; remaining: number; reset: number };
    return {
      ok: d.allowed,
      remaining: d.remaining,
      reset: d.reset,
      retryAfter: d.allowed ? 0 : Math.max(1, d.reset - nowSec),
    };
  } catch {
    return openResult; // toute panne du limiteur → fail-open
  }
}

/** Réponse 429 standard, avec en-tête Retry-After (secondes). Le message suit la
 *  langue de l'interface (cookie) : ce texte s'affiche en toast à l'utilisateur. */
export async function tooManyRequests(retryAfter: number): Promise<Response> {
  const locale = await getLocale();
  return Response.json(
    {
      error: pick(locale, "Trop de requêtes. Réessayez dans un instant.", "Too many requests. Try again in a moment."),
      retryAfter,
    },
    {
      status: 429,
      headers: { "Retry-After": String(Math.max(1, retryAfter)) },
    }
  );
}

/**
 * Garde tout-en-un pour un handler de route : renvoie une Response 429 si la
 * limite est dépassée, sinon `null` (on continue). Usage :
 *
 *   const limited = await enforceRateLimit("generate", user.id, GEN_LIMIT);
 *   if (limited) return limited;
 */
export async function enforceRateLimit(
  name: string,
  identity: string,
  opts: { limit: number; windowSec: number }
): Promise<Response | null> {
  const res = await rateLimit(name, identity, opts);
  return res.ok ? null : await tooManyRequests(res.retryAfter);
}

// ── Barèmes par route (bornes larges : viser l'ABUS, pas l'usage normal) ───────
// Un artisan réel ne déclenche jamais ces plafonds ; un script d'abus, si.
export const LIMITS = {
  generate: { limit: 12, windowSec: 60 }, // build d'app : lourd + payant
  ask: { limit: 30, windowSec: 60 }, // copilote Q&R
  automate: { limit: 20, windowSec: 60 }, // actions
  analyze: { limit: 20, windowSec: 60 }, // analyse fichiers/photos
  transcribe: { limit: 30, windowSec: 60 }, // dictée (clips courts)
  clarify: { limit: 40, windowSec: 60 }, // questions pré-création (léger)
  deploy: { limit: 10, windowSec: 60 }, // déploiement
  app_email: { limit: 15, windowSec: 60 }, // envoi email depuis une app (anti-spam)
  app_sms: { limit: 10, windowSec: 60 }, // envoi SMS depuis une app (anti-spam, coûteux)
  share: { limit: 20, windowSec: 60 }, // création de liens de partage (anti-abus)
  share_read: { limit: 120, windowSec: 60 }, // lecture d'un portail client tokenisé (par token)
  form_submit: { limit: 8, windowSec: 60 }, // soumission de formulaire public (par token, anti-spam)
} as const;
