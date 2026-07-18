-- ─────────────────────────────────────────────────────────────────────────────
-- BASELINE CONTRACTUEL — Agent V1 (test réel PostgreSQL / Auth / RLS en CI).
--
-- ⚠️ CE N'EST PAS UN CLONE DE PRODUCTION, et cela NE valide PAS la reconstruction
-- de la chaîne historique 001→067 (non reproductible — dette documentée à part).
-- C'est le schéma MINIMAL nécessaire au parcours de référence de l'Agent V1, avec
-- une RLS RÉELLE (isolation par tenant via l'appartenance de l'utilisateur auth).
-- Données 100 % fictives, aucune clé/URL de production.
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
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'owner',
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

-- ⚠️ Les COLONNES ci-dessous ne sont pas décoratives : elles correspondent EXACTEMENT
-- aux `selectFields` du registre de recherche (lib/workspace-search.ts). PostgREST
-- REJETTE toute colonne inexistante dans un select → une colonne manquante casse
-- workspace_search en production. Le baseline doit donc les exposer toutes pour les
-- entités traversées par le parcours de référence.

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  nom text,
  siret text, email text, tel text, ville text, type text,
  created_at timestamptz not null default now()
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  nom text, prenom text, email text, adresse text, statut text default 'actif',
  role text, corps_metier text, tel text,
  created_at timestamptz not null default now()
);

create table if not exists public.chantiers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  nom text,
  client_id uuid references public.clients(id),
  chef_chantier_id uuid, site_id uuid,          -- relations du registre (uuid libres)
  adresse text, ville text, description text,    -- selectFields secondaires
  statut text default 'en_attente',
  date_debut date, date_fin_prevue date, date_fin_reelle date,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text,
  description text,
  chantier_id uuid references public.chantiers(id),
  assignee_id uuid references public.employees(id),
  status text default 'todo',
  due_date date, done_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid,
  action text, entity_type text, entity_id uuid, description text,
  created_at timestamptz not null default now()
);

-- ── RLS RÉELLE ───────────────────────────────────────────────────────────────
-- Helper SECURITY DEFINER : les tenants de l'utilisateur courant, SANS récursion RLS.
create or replace function public.auth_tenant_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select tenant_id from public.tenant_members where user_id = auth.uid();
$$;

-- Rôles PostgREST : accès aux tables (la RLS filtre ensuite les LIGNES).
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant execute on function public.auth_tenant_ids() to authenticated, service_role;

-- Chaque table métier : visible/écrivable UNIQUEMENT pour un membre du tenant.
do $$
declare t text;
begin
  foreach t in array array['chantiers','tasks','clients','employees','activity_logs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_tenant_rw', t);
    execute format($f$create policy %I on public.%I for all to authenticated
      using (tenant_id in (select public.auth_tenant_ids()))
      with check (tenant_id in (select public.auth_tenant_ids()))$f$, t||'_tenant_rw', t);
  end loop;
end $$;

-- tenants : lisible par ses membres ; tenant_members : chacun voit SES appartenances.
alter table public.tenants enable row level security;
drop policy if exists tenants_member_read on public.tenants;
create policy tenants_member_read on public.tenants for select to authenticated
  using (id in (select public.auth_tenant_ids()));

alter table public.tenant_members enable row level security;
drop policy if exists tm_self_read on public.tenant_members;
create policy tm_self_read on public.tenant_members for select to authenticated
  using (user_id = auth.uid());
