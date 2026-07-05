-- ============================================================
-- 011 — Résolution email → user_id pour l'invitation d'équipe.
--
-- ✅ APPLIQUÉE À LA PROD le 2026-07-03 (migration `team_email_lookup`).
--
-- STRICTEMENT réservée à service_role : l'API /api/team vérifie le rôle
-- owner/admin du demandeur AVANT de l'appeler via le client admin.
-- ============================================================

create or replace function public.get_user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path to 'public', 'pg_temp'
as $$
  select id from auth.users where lower(email) = lower(trim(p_email)) limit 1;
$$;

revoke execute on function public.get_user_id_by_email(text) from public;
revoke execute on function public.get_user_id_by_email(text) from anon;
revoke execute on function public.get_user_id_by_email(text) from authenticated;
grant execute on function public.get_user_id_by_email(text) to service_role;
