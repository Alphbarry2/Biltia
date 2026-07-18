-- Contrôle de schéma 066/067 sur la base éphémère. Lance avec -v ON_ERROR_STOP=1.
\echo '=== Contrôle schéma 066 / 067 ==='
do $$
begin
  -- ── 066 : agent_run_steps + ai_usage.run_id ──
  if to_regclass('public.agent_run_steps') is null then
    raise exception '066: table agent_run_steps ABSENTE'; end if;
  if not exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='agent_run_steps' and column_name='run_id') then
    raise exception '066: agent_run_steps.run_id ABSENTE'; end if;
  if not exists (
    select 1 from information_schema.table_constraints tc
    join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
    where tc.table_name='agent_run_steps' and tc.constraint_type='FOREIGN KEY' and ccu.table_name='agent_runs'
  ) then raise exception '066: FK agent_run_steps.run_id -> agent_runs ABSENTE'; end if;
  if not exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='ai_usage' and column_name='run_id') then
    raise exception '066: ai_usage.run_id ABSENTE'; end if;
  if not (select relrowsecurity from pg_class where oid='public.agent_run_steps'::regclass) then
    raise exception '066: RLS non activée sur agent_run_steps'; end if;
  if not exists (select 1 from pg_policies where schemaname='public'
      and tablename='agent_run_steps' and policyname='agent_run_steps_select') then
    raise exception '066: policy SELECT (lecture owner/admin) ABSENTE'; end if;
  if not exists (select 1 from pg_policies where schemaname='public'
      and tablename='agent_run_steps' and policyname='agent_run_steps_insert') then
    raise exception '066: policy INSERT (service_role only) ABSENTE'; end if;
  if not exists (select 1 from pg_indexes where schemaname='public'
      and tablename='agent_run_steps' and indexname='agent_run_steps_run_idx') then
    raise exception '066: index (run_id, seq) ABSENT'; end if;

  -- ── 067 : devis.type + devis.parent_devis_id ──
  if not exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='devis' and column_name='type') then
    raise exception '067: devis.type ABSENTE'; end if;
  if not exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='devis' and column_name='parent_devis_id') then
    raise exception '067: devis.parent_devis_id ABSENTE'; end if;
  if not exists (
    select 1 from information_schema.table_constraints tc
    join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
    where tc.table_name='devis' and tc.constraint_type='FOREIGN KEY'
      and ccu.table_name='devis' and ccu.column_name='id'
  ) then raise exception '067: FK parent_devis_id -> devis ABSENTE'; end if;
  -- Compat descendante : les devis existants (seed) ont type par défaut, non NULL.
  if exists (select 1 from public.devis where type is null) then
    raise exception '067: des devis ont type NULL (défaut non appliqué)'; end if;

  raise notice 'OK — schéma 066/067 conforme';
end $$;
