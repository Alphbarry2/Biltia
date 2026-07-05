// ─────────────────────────────────────────────────────────────────────────────
// /api/admin/promote-insights — PROMOTION DU CERVEAU COLLECTIF.
//
// Agrège les signaux d'apprentissage de tous les tenants (opt-out exclus par la
// vue SQL), applique le K-anonymat (≥ MIN_DISTINCT_TENANTS entreprises distinctes),
// synthétise les insights et les publie dans le corpus GLOBAL du RAG. À partir de
// là, match_knowledge les ressert automatiquement à toute la plateforme.
//
// Deux façons de déclencher (l'une OU l'autre) :
//   1. Session admin (email whitelisté, lib/admin.ts) — bouton dans /admin-console.
//   2. Secret cron : en-tête `x-cron-secret` == process.env.CRON_SECRET — pour un
//      job planifié (Vercel Cron / GitHub Action) sans session.
//
// Opération service_role (bypass RLS) : ne JAMAIS répondre sans avoir validé
// l'une des deux barrières.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { isAdminEmail } from "@/lib/admin";
import { promoteInsights, MIN_DISTINCT_TENANTS } from "@/lib/collective-brain";

async function authorize(req: Request): Promise<boolean> {
  // Barrière cron : secret d'en-tête (constant, non devinable). Deux formats :
  // x-cron-secret (scheduler externe) et Authorization Bearer (Vercel Cron,
  // injecté automatiquement quand la variable CRON_SECRET est définie).
  const secret = process.env.CRON_SECRET;
  if (secret && secret.length >= 12) {
    if (req.headers.get("x-cron-secret") === secret) return true;
    if (req.headers.get("authorization") === `Bearer ${secret}`) return true;
  }
  // Barrière admin : session + email whitelisté.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return isAdminEmail(user?.email);
}

async function run(req: Request) {
  if (!(await authorize(req))) {
    return Response.json({ error: "Accès refusé." }, { status: 403 });
  }
  const admin = createAdminClient();
  if (!admin) {
    return Response.json({ error: "Service role non configuré." }, { status: 503 });
  }

  const summary = await promoteInsights(admin, { minTenants: MIN_DISTINCT_TENANTS });
  return Response.json({ ok: true, minTenants: MIN_DISTINCT_TENANTS, ...summary });
}

// POST : déclenchement manuel (console admin).
export async function POST(req: Request) {
  return run(req);
}

// GET : compatible avec les schedulers cron (Vercel Cron appelle en GET).
export async function GET(req: Request) {
  return run(req);
}
