-- ============================================================
-- 012 — Abonnements Web Push (PWA).
--
-- ✅ APPLIQUÉE À LA PROD le 2026-07-04 (migration `push_subscriptions`).
--
-- Un utilisateur peut avoir plusieurs appareils. L'utilisateur gère SES
-- abonnements (RLS) ; l'ENVOI (lecture de tous les endpoints d'un user)
-- passe par service_role (lib/push.ts).
-- ============================================================

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

create policy push_subscriptions_select on public.push_subscriptions
  for select using (user_id = auth.uid());
create policy push_subscriptions_insert on public.push_subscriptions
  for insert with check (user_id = auth.uid());
create policy push_subscriptions_delete on public.push_subscriptions
  for delete using (user_id = auth.uid());

create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);
