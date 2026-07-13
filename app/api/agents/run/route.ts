// ─────────────────────────────────────────────────────────────────────────────
// /api/agents/run — TICK DES AGENTS. Balaye les règles dues et les exécute
// (lib/agent-executor.ts : idempotent, journalisé, replanifié).
//
// Déclencheurs acceptés (l'un OU l'autre) :
//   1. Vercel Cron        → en-tête `Authorization: Bearer ${CRON_SECRET}`
//                           (format injecté automatiquement par Vercel).
//   2. Scheduler externe  → en-tête `x-cron-secret: ${CRON_SECRET}`
//                           (même convention que /api/admin/promote-insights).
//   3. Session admin      → email whitelisté (lib/admin.ts), pour test manuel.
//
// « En temps et en heure » : planifier le cron TOUTES LES 5 MINUTES — la
// granularité des règles est la minute, l'idempotence (run_key) rend les
// passages rapprochés inoffensifs.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { isAdminEmail } from "@/lib/admin";
import { runDueRules } from "@/lib/agent-executor";
import { getLocale } from "@/lib/i18n/server";
import { pick } from "@/lib/i18n/config";

// DURÉE MAXIMALE — explicite. Un tick enchaîne jusqu'à 20 règles, dont certaines
// composent un rapport avec un modèle : sans borne déclarée, la fonction pouvait
// être tuée en plein vol par la limite implicite de la plateforme. Or un tick tué
// laisse ses `agent_runs` en `running` POUR TOUJOURS et n'avance jamais
// `next_run_at` → la règle est ensuite « skipped » à chaque passage, l'agent est
// mort en silence alors que l'UI le dit « Actif ». Le reaper (cf. runDueRules)
// répare l'état ; cette borne réduit la fréquence à laquelle il doit intervenir.
export const maxDuration = 300;

async function authorize(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret && secret.length >= 12) {
    if (req.headers.get("x-cron-secret") === secret) return true;
    if (req.headers.get("authorization") === `Bearer ${secret}`) return true;
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return isAdminEmail(user?.email);
}

async function run(req: Request) {
  const locale = await getLocale();
  if (!(await authorize(req))) {
    return Response.json({ error: pick(locale, "Accès refusé.", "Access denied.") }, { status: 403 });
  }
  const admin = createAdminClient();
  if (!admin) {
    return Response.json(
      { error: pick(locale, "Service role non configuré.", "Service role not configured.") },
      { status: 503 }
    );
  }

  const { scanned, results, metrics } = await runDueRules(admin);
  return Response.json({
    ok: true,
    scanned,
    metrics,
    results: results.map((r) => ({ title: r.title, status: r.outcome.status, summary: r.outcome.summary })),
  });
}

// GET : Vercel Cron appelle en GET. POST : schedulers externes / test manuel.
export async function GET(req: Request) {
  return run(req);
}
export async function POST(req: Request) {
  return run(req);
}
