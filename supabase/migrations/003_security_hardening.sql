-- ============================================================
-- BATIFY — Migration 003 : Security Hardening (Roadmap Étape 1)
-- ============================================================
-- Corrige les constats de l'audit du 2026-06-27 :
--
--  1. 🔴 CRITIQUE — refund_credits était exécutable par PUBLIC (anon)
--     et incrémentait un solde SANS condition. N'importe qui pouvait
--     créditer n'importe quel compte → réservé au rôle service_role.
--
--  2. Fonctions SECURITY DEFINER exposées à anon/PUBLIC sans raison
--     (RPC PostgREST) → REVOKE EXECUTE + GRANT ciblé.
--     NB : les fonctions trigger se déclenchent SANS privilège EXECUTE,
--     donc révoquer leur exécution RPC ne casse pas les triggers.
--
--  3. search_path mutable (advisor 0011) → figé sur les fonctions
--     SECURITY DEFINER concernées.
--
--  4. admin_analytics référençait public.apps (table supprimée, devenue
--     public.modules) → la fonction était cassée. Référence corrigée.
--
-- Idempotent : ALTER / REVOKE / GRANT / CREATE OR REPLACE rejouables.
-- ============================================================

-- ── 1. refund_credits — CRITIQUE : service_role uniquement ──────────────
alter function public.refund_credits(uuid, integer) set search_path = public, pg_temp;
revoke execute on function public.refund_credits(uuid, integer) from public, anon, authenticated;
grant  execute on function public.refund_credits(uuid, integer) to service_role;

-- ── 2. deduct_credits — auth.uid() interne, réservé authenticated ───────
alter function public.deduct_credits(integer) set search_path = public, pg_temp;
revoke execute on function public.deduct_credits(integer) from public, anon;
grant  execute on function public.deduct_credits(integer) to authenticated, service_role;

-- ── 3. get_workspace_context — gardé en interne (my_tenant_role), pas d'anon ──
revoke execute on function public.get_workspace_context(uuid) from public, anon;
grant  execute on function public.get_workspace_context(uuid) to authenticated, service_role;

-- ── 4. log_activity — écriture SECURITY DEFINER, pas d'anon ─────────────
alter function public.log_activity(uuid, text, uuid, text, text, jsonb) set search_path = public, pg_temp;
revoke execute on function public.log_activity(uuid, text, uuid, text, text, jsonb) from public, anon;
grant  execute on function public.log_activity(uuid, text, uuid, text, text, jsonb) to authenticated, service_role;

-- ── 5. Fonctions trigger / event-trigger — aucune exécution RPC légitime ─
alter function public.on_tenant_created() set search_path = public, pg_temp;
revoke execute on function public.on_tenant_created() from public, anon, authenticated;
grant  execute on function public.on_tenant_created() to service_role;

alter function public.auto_confirm_email() set search_path = public, pg_temp;
revoke execute on function public.auto_confirm_email() from public, anon, authenticated;
grant  execute on function public.auto_confirm_email() to service_role;

alter function public.set_updated_at() set search_path = public, pg_temp;

revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
grant  execute on function public.rls_auto_enable() to service_role;

-- ── 6. admin_analytics — corrige public.apps → public.modules ──────────
create or replace function public.admin_analytics()
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_email text;
begin
  v_email := auth.jwt() ->> 'email';
  if v_email is null or v_email != 'barryalpha9755@gmail.com' then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  return (
    select json_build_object(
      'total_events',  (select count(*) from public.app_events),
      'total_created', (select count(*) from public.app_events where event_type = 'app_created'),
      'total_apps',    (select count(*) from public.modules),
      'total_users',   (select count(*) from auth.users),
      'by_agent', (
        select json_agg(json_build_object('key', agent, 'count', cnt))
        from (select agent, count(*) as cnt from public.app_events where agent is not null group by agent order by cnt desc limit 10) t
      ),
      'by_sector', (
        select json_agg(json_build_object('key', sector, 'count', cnt))
        from (select sector, count(*) as cnt from public.app_events where sector is not null group by sector order by cnt desc) t
      ),
      'by_app_type', (
        select json_agg(json_build_object('key', app_type, 'count', cnt))
        from (select app_type, count(*) as cnt from public.app_events where app_type is not null group by app_type order by cnt desc limit 10) t
      ),
      'by_day', (
        select json_agg(json_build_object('day', day, 'count', cnt))
        from (select date_trunc('day', created_at)::date::text as day, count(*) as cnt from public.app_events where created_at >= now() - interval '30 days' group by day order by day) t
      ),
      'top_companies', (
        select json_agg(json_build_object('company', company_name, 'sector', sector, 'apps', cnt))
        from (select p.company_name, p.sector, count(ae.*) as cnt from public.profiles p left join public.app_events ae on ae.user_id = p.user_id and ae.event_type = 'app_created' group by p.company_name, p.sector order by cnt desc limit 20) t
      )
    )
  );
end;
$function$;

-- ── 7. Fonctions encore exposées à PUBLIC (grant par défaut) ────────────
--    handle_new_user : trigger auth → service_role uniquement.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant  execute on function public.handle_new_user() to service_role;

--    my_tenant_role / is_app_member : utilisées DANS les policies RLS →
--    'authenticated' indispensable, mais pas 'anon'.
revoke execute on function public.my_tenant_role(uuid) from public, anon;
grant  execute on function public.my_tenant_role(uuid) to authenticated, service_role;
revoke execute on function public.is_app_member(uuid) from public, anon;
grant  execute on function public.is_app_member(uuid) to authenticated, service_role;

--    log_audit : empêche la pollution ANONYME du journal d'audit
--    (SECURITY DEFINER → contourne la policy insert=false).
revoke execute on function public.log_audit(uuid, uuid, public.audit_action, text, uuid, jsonb, jsonb, inet, text) from public, anon;
grant  execute on function public.log_audit(uuid, uuid, public.audit_action, text, uuid, jsonb, jsonb, inet, text) to authenticated, service_role;

--    admin_analytics : garde-fou email interne, on retire anon/PUBLIC.
revoke execute on function public.admin_analytics() from public, anon;
grant  execute on function public.admin_analytics() to authenticated, service_role;
