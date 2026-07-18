-- Rollback 067 puis 066 sur la base ÉPHÉMÈRE UNIQUEMENT. -v ON_ERROR_STOP=1.
-- (La ré-application se fait ENSUITE par le workflow en rejouant les fichiers de
--  migration 066 puis 067, qui sont idempotents « if [not] exists ».)
\echo '=== Rollback 067 puis 066 (base éphémère) ==='

-- ── 067 down ──
drop index if exists public.devis_parent_idx;
alter table public.devis drop column if exists parent_devis_id;
alter table public.devis drop column if exists type;

-- ── 066 down ──
drop index if exists public.ai_usage_run_idx;
alter table public.ai_usage drop column if exists run_id;
drop table if exists public.agent_run_steps;

-- Vérifie la disparition.
do $$
begin
  if to_regclass('public.agent_run_steps') is not null then
    raise exception 'rollback 066: agent_run_steps TOUJOURS présente'; end if;
  if exists (select 1 from information_schema.columns
      where table_name='ai_usage' and column_name='run_id') then
    raise exception 'rollback 066: ai_usage.run_id TOUJOURS présente'; end if;
  if exists (select 1 from information_schema.columns
      where table_name='devis' and column_name='type') then
    raise exception 'rollback 067: devis.type TOUJOURS présente'; end if;
  if exists (select 1 from information_schema.columns
      where table_name='devis' and column_name='parent_devis_id') then
    raise exception 'rollback 067: devis.parent_devis_id TOUJOURS présente'; end if;
  raise notice 'OK — rollback 066/067 : table + colonnes supprimées';
end $$;
