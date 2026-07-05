-- ─────────────────────────────────────────────────────────────────────────────
-- 013 — Historique des conversations du générateur (façon ChatGPT).
-- Une conversation = la session de chat de l'atelier : messages (jsonb),
-- éventuellement liée à l'application sauvegardée (app_id) pour restaurer
-- la prévisualisation à la réouverture.
-- Personnelle : seul l'auteur la voit (pas de partage d'équipe en v1).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Nouvelle conversation',
  messages jsonb not null default '[]'::jsonb,
  app_id uuid references public.modules(id) on delete set null,
  kind text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversations_user_updated_idx
  on public.conversations (user_id, updated_at desc);

alter table public.conversations enable row level security;

drop policy if exists "conversations_select_own" on public.conversations;
create policy "conversations_select_own" on public.conversations
  for select using (auth.uid() = user_id);

drop policy if exists "conversations_insert_own" on public.conversations;
create policy "conversations_insert_own" on public.conversations
  for insert with check (auth.uid() = user_id);

drop policy if exists "conversations_update_own" on public.conversations;
create policy "conversations_update_own" on public.conversations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "conversations_delete_own" on public.conversations;
create policy "conversations_delete_own" on public.conversations
  for delete using (auth.uid() = user_id);

drop trigger if exists conversations_updated_at on public.conversations;
create trigger conversations_updated_at
  before update on public.conversations
  for each row execute procedure public.set_updated_at();
