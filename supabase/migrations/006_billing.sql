-- ============================================================
-- BILTIA — Migration 006 : Facturation (plans, abonnements, crédits)
--
-- Contexte : tarifs validés le 2026-07-02.
--   • Free     : 10 crédits à l'inscription, NON renouvelables, 1 app, 1 user,
--                pas de déploiement Live.
--   • Pro      : paliers 100→10 000 crédits, renouvelés chaque mois.
--   • Business : mêmes paliers, prix supérieurs + marque blanche, etc.
--
-- Politique crédits payants : RESET au forfait à chaque échéance (pas de report).
--
-- Sécurité (cf. memory / migration 003) :
--   • subscriptions : RLS, l'utilisateur lit UNIQUEMENT sa ligne.
--     Les écritures passent par le webhook Stripe (service_role) — aucune
--     policy INSERT/UPDATE pour authenticated/anon.
--   • set_credit_balance : SECURITY DEFINER, réservé à service_role.
-- ============================================================

-- ── 1. Enum des plans ────────────────────────────────────────
do $$ begin
  create type public.subscription_plan as enum ('free', 'pro', 'business');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.subscription_status as enum (
    'active', 'trialing', 'past_due', 'canceled', 'incomplete', 'unpaid'
  );
exception when duplicate_object then null; end $$;

-- ── 2. Table subscriptions ───────────────────────────────────
-- Une ligne par utilisateur (aligné sur user_credits, qui est per-user).
create table if not exists public.subscriptions (
  user_id                uuid primary key references auth.users(id) on delete cascade,
  plan                   public.subscription_plan   not null default 'free',
  status                 public.subscription_status not null default 'active',
  -- Crédits mensuels du palier souscrit (0 pour Free). Sert de cible de RESET.
  credits_per_month      integer not null default 0,
  stripe_customer_id     text,
  stripe_subscription_id text,
  stripe_price_id        text,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists idx_subscriptions_customer
  on public.subscriptions (stripe_customer_id);
create index if not exists idx_subscriptions_stripe_sub
  on public.subscriptions (stripe_subscription_id);

alter table public.subscriptions enable row level security;

-- Lecture : uniquement sa propre ligne.
drop policy if exists "subscriptions_select_own" on public.subscriptions;
create policy "subscriptions_select_own" on public.subscriptions
  for select using (auth.uid() = user_id);

-- Pas de policy INSERT/UPDATE/DELETE : réservé au service_role (webhook Stripe),
-- qui contourne la RLS. RLS activée => tout accès authenticated/anon en écriture
-- est refusé par défaut.

create trigger subscriptions_updated_at
  before update on public.subscriptions
  for each row execute procedure public.set_updated_at();

-- ── 3. RPC set_credit_balance (RESET au forfait) ─────────────
-- Positionne le solde à une valeur EXACTE. Utilisé par le webhook :
--   • à la souscription / renouvellement d'un plan payant → balance = palier.
-- SECURITY DEFINER + service_role only (jamais appelable par l'utilisateur).
create or replace function public.set_credit_balance(p_user_id uuid, p_amount integer)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.user_credits (user_id, balance)
  values (p_user_id, greatest(p_amount, 0))
  on conflict (user_id)
  do update set balance = greatest(p_amount, 0), updated_at = now();
end;
$$;

revoke execute on function public.set_credit_balance(uuid, integer) from public, anon, authenticated;
grant  execute on function public.set_credit_balance(uuid, integer) to service_role;

-- ── 4. handle_new_user : 10 crédits Free + ligne subscription ─
-- Remplace la version de la migration 002 (qui offrait 50 crédits).
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_full_name text;
begin
  v_full_name := coalesce(new.raw_user_meta_data->>'full_name', '');

  -- Crédits Free : 10 offerts, non renouvelables.
  insert into public.user_credits (user_id, balance)
  values (new.id, 10)
  on conflict (user_id) do nothing;

  -- Abonnement par défaut : Free.
  insert into public.subscriptions (user_id, plan, status, credits_per_month)
  values (new.id, 'free', 'active', 0)
  on conflict (user_id) do nothing;

  -- Tenant personnel (workspace).
  v_tenant_id := gen_random_uuid();
  insert into public.tenants (id, name, slug)
  values (
    v_tenant_id,
    case when v_full_name <> '' then v_full_name || '''s workspace' else 'Mon espace' end,
    v_tenant_id::text
  );

  -- Owner membership.
  insert into public.tenant_members (tenant_id, user_id, role, accepted_at)
  values (v_tenant_id, new.id, 'owner', now());

  -- Profil.
  insert into public.profiles (user_id, full_name, corps_metier)
  values (
    new.id,
    v_full_name,
    coalesce(new.raw_user_meta_data->>'corps_de_metier', null)
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- ── 5. Backfill : abonnement Free pour les comptes existants ──
insert into public.subscriptions (user_id, plan, status, credits_per_month)
select id, 'free', 'active', 0 from auth.users
on conflict (user_id) do nothing;

-- ── 6. Limite d'apps pour le plan Free (1 app) ───────────────
-- L'insertion des apps se fait côté client (RLS). On garde donc la limite au
-- niveau DB pour qu'elle soit inviolable (Zero Trust).
create or replace function public.enforce_app_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_plan    public.subscription_plan;
  v_count   integer;
begin
  select plan into v_plan
  from public.subscriptions
  where user_id = new.created_by;

  -- Défaut prudent : absence de ligne => Free.
  v_plan := coalesce(v_plan, 'free');

  if v_plan = 'free' then
    select count(*) into v_count
    from public.apps
    where created_by = new.created_by
      and status <> 'archived';

    if v_count >= 1 then
      raise exception
        'Le plan Free est limité à 1 application. Passez à Pro pour en créer davantage.'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_app_limit_trg on public.apps;
create trigger enforce_app_limit_trg
  before insert on public.apps
  for each row execute procedure public.enforce_app_limit();

-- ============================================================
-- FIN 006_billing.sql
-- ============================================================
