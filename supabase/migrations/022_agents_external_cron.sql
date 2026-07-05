-- ============================================================
-- BILTIA — Migration 022 : TICK DES AGENTS VIA pg_cron (plan Vercel Hobby)
-- ============================================================
-- Le plan Vercel Hobby interdit tout cron plus fréquent qu'une fois par jour.
-- Le tick des agents (toutes les 5 min) est donc déplacé de Vercel Cron vers
-- pg_cron + pg_net : Postgres appelle l'endpoint /api/agents/run en HTTP toutes
-- les 5 minutes. Le cron quotidien /api/admin/promote-insights reste sur Vercel
-- (une fois/jour = autorisé sur Hobby).
--
-- SÉCURITÉ : l'endpoint exige l'en-tête `x-cron-secret == process.env.CRON_SECRET`
-- (voir app/api/agents/run/route.ts). Le secret n'est JAMAIS écrit ici : il est
-- lu au moment de l'exécution depuis Supabase Vault (secret nommé
-- `biltia_cron_secret`). Tant que ce secret Vault n'est pas renseigné, l'appel
-- part avec un en-tête vide et l'endpoint répond 403 (inoffensif).
--
-- POUR ACTIVER (une seule fois, hors dépôt — le secret ne transite pas par git) :
--   select vault.create_secret(
--     '<VALEUR EXACTE DE CRON_SECRET CÔTÉ VERCEL>',
--     'biltia_cron_secret',
--     'Secret partagé cron externe -> /api/agents/run'
--   );
-- (le rejouer avec vault.update_secret(id, ...) pour le faire tourner.)
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Idempotent : cron.schedule(name, ...) fait un upsert par nom (pg_cron >= 1.4).
select cron.schedule(
  'biltia-agents-tick',
  '*/5 * * * *',
  $job$
    select net.http_post(
      url := 'https://biltia-arqivs-projects.vercel.app/api/agents/run',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', coalesce(
          (select decrypted_secret from vault.decrypted_secrets where name = 'biltia_cron_secret'),
          ''
        )
      ),
      timeout_milliseconds := 8000
    ) as request_id;
  $job$
);
