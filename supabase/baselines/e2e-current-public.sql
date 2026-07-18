-- ─────────────────────────────────────────────────────────────────────────────
-- BASELINE CONTRACTUEL DE TEST — E2E « vertical slice »
--
-- ⚠️ CECI N'EST PAS UN CLONE DE LA PRODUCTION. C'est un schéma CONTRACTUEL minimal,
-- strictement limité aux tables/colonnes que le scénario E2E manipule. Il sert à
-- documenter le CONTRAT applicatif et, le cas échéant, à monter un Postgres réel
-- (Supabase local) pour un futur test « base réelle ». Il ne prouve PAS la fidélité
-- exacte au schéma de production (la chaîne 001→067 est non reproductible).
--
-- Aucune donnée métier, aucun utilisateur réel, aucun secret, aucune URL, aucun
-- historique supabase_migrations. Hors de la chaîne normale des migrations
-- (dossier supabase/baselines/, jamais supabase/migrations/).
--
-- La couche E2E DÉTERMINISTE (e2e/*.e2e.mjs) N'UTILISE PAS ce fichier : elle tourne
-- sur une base EN MÉMOIRE. Ce baseline est fourni pour un run « Postgres réel »
-- ultérieur (non exécuté ici : environnement sans Docker/Postgres).
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text,
  logo_url text,
  company_info jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.tenant_members (
  tenant_id uuid not null references public.tenants(id),
  user_id uuid not null,
  role text not null default 'owner',
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  nom text,
  created_at timestamptz not null default now()
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  nom text, prenom text, email text, adresse text, statut text default 'actif',
  created_at timestamptz not null default now()
);

create table if not exists public.chantiers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  nom text,
  client_id uuid references public.clients(id),
  statut text default 'en_attente',
  date_debut date, date_fin_prevue date, date_fin_reelle date,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  title text,
  chantier_id uuid references public.chantiers(id),
  assignee_id uuid references public.employees(id),
  status text default 'todo',
  due_date date, done_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  user_id uuid,
  action text, entity_type text, entity_id uuid, description text,
  created_at timestamptz not null default now()
);

-- RLS — isolation par tenant (le CODE force déjà .eq(tenant_id) ; la RLS est le
-- second rempart, prouvable seulement sur un Postgres réel). Exemple minimal :
alter table public.chantiers enable row level security;
alter table public.tasks enable row level security;
alter table public.employees enable row level security;
alter table public.clients enable row level security;

-- (Politiques à brancher selon le rôle authenticated + le claim tenant lors d'un
-- run Postgres réel ; laissées en commentaire pour ce baseline contractuel.)
-- create policy tenant_isolation_chantiers on public.chantiers
--   using (tenant_id = current_setting('request.jwt.claims.tenant_id', true)::uuid);
