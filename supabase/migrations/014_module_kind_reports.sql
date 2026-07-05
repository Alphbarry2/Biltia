-- ─────────────────────────────────────────────────────────────────────────────
-- 014 — Bibliothèque complète :
--   1. modules.kind ('app' | 'document') pour séparer les onglets
--      Applications / Documents PDF.
--   2. table reports : analyses de documents ('analyse') et contrôles par lot
--      ('controle'), payload JSON complet pour réouverture dans /reports/[id].
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.modules
  add column if not exists kind text not null default 'app';

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('analyse', 'controle')),
  title text not null default 'Rapport',
  file_count integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  conversation_id uuid references public.conversations(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists reports_user_created_idx
  on public.reports (user_id, created_at desc);

alter table public.reports enable row level security;

drop policy if exists "reports_select_own" on public.reports;
create policy "reports_select_own" on public.reports
  for select using (auth.uid() = user_id);

drop policy if exists "reports_insert_own" on public.reports;
create policy "reports_insert_own" on public.reports
  for insert with check (auth.uid() = user_id);

drop policy if exists "reports_delete_own" on public.reports;
create policy "reports_delete_own" on public.reports
  for delete using (auth.uid() = user_id);
