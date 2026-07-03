-- ============================================================
-- BATIFY — Migration 004 : Schema Baseline (snapshot prod)
-- ============================================================
-- Généré par introspection de la base de prod (docqrznkbtyctjqpvifu)
-- le 2026-06-27, pour clore le DRIFT : les migrations 001/002 ne
-- décrivaient que ~12 tables (et créaient `apps`, depuis renommée
-- `modules`). La prod en compte 27. Ce fichier rend le dépôt à
-- nouveau fidèle à la réalité.
--
-- PORTÉE : structure (enums, tables, contraintes, index, RLS, policies).
-- Les FONCTIONS et TRIGGERS vivent dans 001/002/003 + sont gérés à part.
--
-- USAGE : fichier de RÉFÉRENCE (la prod possède déjà ces objets). Pour
-- recréer un environnement vierge complet (fonctions/triggers inclus),
-- préférer `supabase db pull` (dump complet et ordonné). Toutes les
-- instructions sont idempotentes (IF NOT EXISTS) là où c'est possible.
-- ============================================================

create extension if not exists "pgcrypto";

-- ── ENUMS ────────────────────────────────────────────────────
do $$ begin
  create type public.app_status as enum ('active', 'archived', 'suspended');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.audit_action as enum ('create', 'update', 'delete', 'permission_change', 'login', 'logout', 'export', 'invite', 'revoke');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.chantier_statut as enum ('en_attente', 'en_cours', 'en_retard', 'termine', 'annule');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.member_role as enum ('owner', 'admin', 'manager', 'member', 'viewer');
exception when duplicate_object then null; end $$;

-- ── TABLES ───────────────────────────────────────────────────

create table if not exists public.tenants (
  id uuid not null default gen_random_uuid(),
  name text not null,
  slug text not null,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_members (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid not null,
  role member_role not null default 'member'::member_role,
  invited_by uuid,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id uuid not null,
  full_name text not null default ''::text,
  company_name text not null default ''::text,
  sector text not null default 'autre'::text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  tenant_id uuid
);

create table if not exists public.subscriptions (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  plan text not null default 'free'::text,
  status text not null default 'active'::text,
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_credits (
  user_id uuid not null,
  balance integer not null default 50,
  updated_at timestamptz default now()
);

create table if not exists public.modules (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  slug text,
  description text not null default ''::text,
  html_content text not null,
  format text not null default 'auto'::text,
  is_public boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  tenant_id uuid,
  created_by uuid,
  status app_status not null default 'active'::app_status,
  deployment_url text,
  vercel_project_id text,
  icon text,
  version integer not null default 1
);

create table if not exists public.module_versions (
  id uuid not null default gen_random_uuid(),
  module_id uuid not null,
  tenant_id uuid not null,
  version integer not null,
  code text,
  prompt text,
  description text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.app_members (
  id uuid not null default gen_random_uuid(),
  app_id uuid not null,
  tenant_id uuid not null,
  user_id uuid not null,
  role member_role not null default 'member'::member_role,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  nom text not null,
  siret text,
  type text default 'particulier'::text,
  email text,
  tel text,
  adresse text,
  ville text,
  code_postal text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.employees (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  nom text not null,
  prenom text,
  role text,
  corps_metier text,
  email text,
  tel text,
  date_embauche date,
  taux_horaire numeric(8,2),
  statut text default 'actif'::text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chantiers (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  client_id uuid,
  nom text not null,
  adresse text,
  ville text,
  code_postal text,
  description text,
  budget numeric(12,2) default 0,
  budget_engage numeric(12,2) default 0,
  avancement integer default 0,
  statut chantier_statut not null default 'en_attente'::chantier_statut,
  date_debut date,
  date_fin_prevue date,
  date_fin_reelle date,
  chef_chantier_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  chantier_id uuid,
  employee_id uuid,
  client_id uuid,
  nom text not null,
  type text not null,
  storage_path text,
  url text,
  expires_at date,
  statut text default 'valide'::text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.materials (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  chantier_id uuid,
  nom text not null,
  reference text,
  categorie text,
  quantite numeric(10,2) default 0,
  unite text default 'u'::text,
  statut text default 'disponible'::text,
  date_retour date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.suppliers (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  nom text not null,
  siret text,
  type text default 'fournisseur'::text,
  email text,
  tel text,
  adresse text,
  ville text,
  code_postal text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.equipment (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  chantier_id uuid,
  nom text not null,
  reference text,
  type text,
  marque text,
  numero_serie text,
  statut text not null default 'disponible'::text,
  date_achat date,
  prochain_controle date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.interventions (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  chantier_id uuid,
  client_id uuid,
  employee_id uuid,
  equipment_id uuid,
  type text not null,
  description text,
  statut text not null default 'planifie'::text,
  date_prevue timestamptz,
  date_reelle timestamptz,
  duree_heures numeric(5,2),
  rapport text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  chantier_id uuid,
  assignee_id uuid,
  title text not null,
  description text,
  status text not null default 'todo'::text,
  priority text not null default 'normal'::text,
  due_date date,
  done_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workflows (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  name text not null,
  description text,
  steps jsonb not null default '[]'::jsonb,
  status text not null default 'active'::text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.custom_entities (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  entity_type text not null,
  name text not null,
  data jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.files (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  entity_type text,
  entity_id uuid,
  name text not null,
  type text,
  size_bytes bigint,
  storage_path text not null,
  url text,
  uploaded_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid,
  type text not null,
  channel text not null default 'in_app'::text,
  title text not null,
  body text,
  data jsonb default '{}'::jsonb,
  read_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.integrations (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  provider text not null,
  status text not null default 'inactive'::text,
  credentials jsonb default '{}'::jsonb,
  settings jsonb default '{}'::jsonb,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.templates (
  id uuid not null default gen_random_uuid(),
  slug text not null,
  name text not null,
  description text,
  category text,
  icon text,
  prompt text,
  preview_data jsonb default '{}'::jsonb,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_usage (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  tenant_id uuid not null,
  app_id uuid,
  action text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cached_input_tokens integer not null default 0,
  cost_usd numeric(12,8) not null default 0,
  agent text,
  sector text,
  prompt_type text,
  created_at timestamptz not null default now()
);

create table if not exists public.app_events (
  id uuid not null default gen_random_uuid(),
  user_id uuid,
  app_id uuid,
  event_type text not null,
  agent text,
  sector text,
  app_type text,
  format text,
  prompt_length integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  tenant_id uuid
);

create table if not exists public.audit_logs (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid,
  app_id uuid,
  user_id uuid,
  action audit_action not null,
  resource text,
  resource_id uuid,
  old_data jsonb,
  new_data jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  description text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ── CONTRAINTES (PK / UNIQUE / FK / CHECK) ───────────────────
-- NB : noms de contraintes historiques (apps_* sur la table modules).
do $$ begin
  alter table public.tenants add constraint tenants_pkey primary key (id);
  alter table public.tenants add constraint tenants_slug_key unique (slug);
  alter table public.tenant_members add constraint tenant_members_pkey primary key (id);
  alter table public.tenant_members add constraint tenant_members_tenant_id_user_id_key unique (tenant_id, user_id);
  alter table public.tenant_members add constraint tenant_members_tenant_id_fkey foreign key (tenant_id) references tenants(id) on delete cascade;
  alter table public.tenant_members add constraint tenant_members_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
  alter table public.tenant_members add constraint tenant_members_invited_by_fkey foreign key (invited_by) references auth.users(id);
  alter table public.profiles add constraint profiles_pkey primary key (user_id);
  alter table public.profiles add constraint profiles_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
  alter table public.profiles add constraint profiles_tenant_id_fkey foreign key (tenant_id) references tenants(id) on delete set null;
  alter table public.subscriptions add constraint subscriptions_pkey primary key (id);
  alter table public.subscriptions add constraint subscriptions_tenant_id_key unique (tenant_id);
  alter table public.subscriptions add constraint subscriptions_tenant_id_fkey foreign key (tenant_id) references tenants(id) on delete cascade;
  alter table public.user_credits add constraint user_credits_pkey primary key (user_id);
  alter table public.user_credits add constraint user_credits_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
  alter table public.modules add constraint apps_pkey primary key (id);
  alter table public.modules add constraint apps_slug_key unique (slug);
  alter table public.modules add constraint apps_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
  alter table public.modules add constraint apps_tenant_id_fkey foreign key (tenant_id) references tenants(id) on delete cascade;
  alter table public.modules add constraint apps_created_by_fkey foreign key (created_by) references auth.users(id);
  alter table public.module_versions add constraint module_versions_pkey primary key (id);
  alter table public.module_versions add constraint module_versions_module_id_version_key unique (module_id, version);
  alter table public.module_versions add constraint module_versions_module_id_fkey foreign key (module_id) references modules(id) on delete cascade;
  alter table public.module_versions add constraint module_versions_tenant_id_fkey foreign key (tenant_id) references tenants(id) on delete cascade;
  alter table public.module_versions add constraint module_versions_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null;
  alter table public.app_members add constraint app_members_pkey primary key (id);
  alter table public.app_members add constraint app_members_app_id_user_id_key unique (app_id, user_id);
  alter table public.app_members add constraint app_members_app_id_fkey foreign key (app_id) references modules(id) on delete cascade;
  alter table public.app_members add constraint app_members_tenant_id_fkey foreign key (tenant_id) references tenants(id) on delete cascade;
  alter table public.app_members add constraint app_members_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
  alter table public.clients add constraint clients_pkey primary key (id);
  alter table public.clients add constraint clients_tenant_id_fkey foreign key (tenant_id) references tenants(id) on delete cascade;
  alter table public.employees add constraint employees_pkey primary key (id);
  alter table public.employees add constraint employees_tenant_id_fkey foreign key (tenant_id) references tenants(id) on delete cascade;
  alter table public.chantiers add constraint chantiers_pkey primary key (id);
  alter table public.chantiers add constraint chantiers_avancement_check check (((avancement >= 0) and (avancement <= 100)));
  alter table public.chantiers add constraint chantiers_tenant_id_fkey foreign key (tenant_id) references tenants(id) on delete cascade;
  alter table public.chantiers add constraint chantiers_client_id_fkey foreign key (client_id) references clients(id) on delete set null;
  alter table public.chantiers add constraint chantiers_chef_chantier_id_fkey foreign key (chef_chantier_id) references employees(id) on delete set null;
  alter table public.documents add constraint documents_pkey primary key (id);
  alter table public.documents add constraint documents_tenant_id_fkey foreign key (tenant_id) references tenants(id) on delete cascade;
  alter table public.documents add constraint documents_chantier_id_fkey foreign key (chantier_id) references chantiers(id) on delete cascade;
  alter table public.documents add constraint documents_client_id_fkey foreign key (client_id) references clients(id) on delete cascade;
  alter table public.documents add constraint documents_employee_id_fkey foreign key (employee_id) references employees(id) on delete cascade;
  alter table public.materials add constraint materials_pkey primary key (id);
  alter table public.materials add constraint materials_tenant_id_fkey foreign key (tenant_id) references tenants(id) on delete cascade;
  alter table public.materials add constraint materials_chantier_id_fkey foreign key (chantier_id) references chantiers(id) on delete set null;
  alter table public.suppliers add constraint suppliers_pkey primary key (id);
  alter table public.suppliers add constraint suppliers_tenant_id_fkey foreign key (tenant_id) references tenants(id) on delete cascade;
  alter table public.equipment add constraint equipment_pkey primary key (id);
  alter table public.equipment add constraint equipment_tenant_id_fkey foreign key (tenant_id) references tenants(id) on delete cascade;
  alter table public.equipment add constraint equipment_chantier_id_fkey foreign key (chantier_id) references chantiers(id) on delete set null;
  alter table public.interventions add constraint interventions_pkey primary key (id);
  alter table public.interventions add constraint interventions_tenant_id_fkey foreign key (tenant_id) references tenants(id) on delete cascade;
  alter table public.interventions add constraint interventions_chantier_id_fkey foreign key (chantier_id) references chantiers(id) on delete set null;
  alter table public.interventions add constraint interventions_client_id_fkey foreign key (client_id) references clients(id) on delete set null;
  alter table public.interventions add constraint interventions_employee_id_fkey foreign key (employee_id) references employees(id) on delete set null;
  alter table public.interventions add constraint interventions_equipment_id_fkey foreign key (equipment_id) references equipment(id) on delete set null;
  alter table public.tasks add constraint tasks_pkey primary key (id);
  alter table public.tasks add constraint tasks_tenant_id_fkey foreign key (tenant_id) references tenants(id) on delete cascade;
  alter table public.tasks add constraint tasks_chantier_id_fkey foreign key (chantier_id) references chantiers(id) on delete cascade;
  alter table public.tasks add constraint tasks_assignee_id_fkey foreign key (assignee_id) references employees(id) on delete set null;
  alter table public.tasks add constraint tasks_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null;
  alter table public.workflows add constraint workflows_pkey primary key (id);
  alter table public.workflows add constraint workflows_tenant_id_fkey foreign key (tenant_id) references tenants(id) on delete cascade;
  alter table public.workflows add constraint workflows_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null;
  alter table public.custom_entities add constraint custom_entities_pkey primary key (id);
  alter table public.custom_entities add constraint custom_entities_tenant_id_fkey foreign key (tenant_id) references tenants(id) on delete cascade;
  alter table public.custom_entities add constraint custom_entities_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null;
  alter table public.files add constraint files_pkey primary key (id);
  alter table public.files add constraint files_tenant_id_fkey foreign key (tenant_id) references tenants(id) on delete cascade;
  alter table public.files add constraint files_uploaded_by_fkey foreign key (uploaded_by) references auth.users(id) on delete set null;
  alter table public.notifications add constraint notifications_pkey primary key (id);
  alter table public.notifications add constraint notifications_tenant_id_fkey foreign key (tenant_id) references tenants(id) on delete cascade;
  alter table public.notifications add constraint notifications_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
  alter table public.integrations add constraint integrations_pkey primary key (id);
  alter table public.integrations add constraint integrations_tenant_id_provider_key unique (tenant_id, provider);
  alter table public.integrations add constraint integrations_tenant_id_fkey foreign key (tenant_id) references tenants(id) on delete cascade;
  alter table public.templates add constraint templates_pkey primary key (id);
  alter table public.templates add constraint templates_slug_key unique (slug);
  alter table public.ai_usage add constraint ai_usage_pkey primary key (id);
  alter table public.ai_usage add constraint ai_usage_tenant_id_fkey foreign key (tenant_id) references tenants(id) on delete cascade;
  alter table public.ai_usage add constraint ai_usage_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
  alter table public.app_events add constraint app_events_pkey primary key (id);
  alter table public.app_events add constraint app_events_app_id_fkey foreign key (app_id) references modules(id) on delete set null;
  alter table public.app_events add constraint app_events_tenant_id_fkey foreign key (tenant_id) references tenants(id) on delete set null;
  alter table public.app_events add constraint app_events_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
  alter table public.audit_logs add constraint audit_logs_pkey primary key (id);
  alter table public.audit_logs add constraint audit_logs_app_id_fkey foreign key (app_id) references modules(id) on delete set null;
  alter table public.audit_logs add constraint audit_logs_tenant_id_fkey foreign key (tenant_id) references tenants(id) on delete set null;
  alter table public.audit_logs add constraint audit_logs_user_id_fkey foreign key (user_id) references auth.users(id) on delete set null;
  alter table public.activity_logs add constraint activity_logs_pkey primary key (id);
  alter table public.activity_logs add constraint activity_logs_tenant_id_fkey foreign key (tenant_id) references tenants(id) on delete cascade;
  alter table public.activity_logs add constraint activity_logs_user_id_fkey foreign key (user_id) references auth.users(id) on delete set null;
exception when duplicate_object or duplicate_table then null; end $$;

-- ── INDEX ────────────────────────────────────────────────────
create index if not exists idx_tenant_members_tenant_user on public.tenant_members (tenant_id, user_id);
create index if not exists idx_tenant_members_user on public.tenant_members (user_id);
create index if not exists idx_profiles_tenant on public.profiles (tenant_id);
create index if not exists idx_profiles_user on public.profiles (user_id);
create index if not exists idx_apps_tenant on public.modules (tenant_id);
create index if not exists idx_apps_created_by on public.modules (created_by);
create index if not exists idx_apps_status on public.modules (status);
create index if not exists idx_apps_slug on public.modules (slug) where (slug is not null);
create index if not exists module_versions_module_idx on public.module_versions (module_id);
create index if not exists idx_app_members_app_user on public.app_members (app_id, user_id);
create index if not exists idx_app_members_tenant on public.app_members (tenant_id);
create index if not exists idx_app_members_user on public.app_members (user_id);
create index if not exists clients_tenant_idx on public.clients (tenant_id);
create index if not exists employees_tenant_idx on public.employees (tenant_id);
create index if not exists employees_statut_idx on public.employees (tenant_id, statut);
create index if not exists chantiers_tenant_idx on public.chantiers (tenant_id);
create index if not exists chantiers_statut_idx on public.chantiers (tenant_id, statut);
create index if not exists documents_tenant_idx on public.documents (tenant_id);
create index if not exists documents_expires_idx on public.documents (expires_at) where (expires_at is not null);
create index if not exists materials_tenant_idx on public.materials (tenant_id);
create index if not exists materials_chantier_idx on public.materials (chantier_id);
create index if not exists suppliers_tenant_idx on public.suppliers (tenant_id);
create index if not exists equipment_tenant_idx on public.equipment (tenant_id);
create index if not exists interventions_tenant_idx on public.interventions (tenant_id);
create index if not exists tasks_tenant_idx on public.tasks (tenant_id);
create index if not exists tasks_chantier_idx on public.tasks (chantier_id);
create index if not exists custom_entities_tenant_type_idx on public.custom_entities (tenant_id, entity_type);
create index if not exists files_tenant_idx on public.files (tenant_id);
create index if not exists files_entity_idx on public.files (entity_type, entity_id);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id) where (read_at is null);
create index if not exists ai_usage_tenant_created on public.ai_usage (tenant_id, created_at desc);
create index if not exists ai_usage_user_created on public.ai_usage (user_id, created_at desc);
create index if not exists ai_usage_action on public.ai_usage (action);
create index if not exists idx_app_events_tenant on public.app_events (tenant_id, created_at desc);
create index if not exists idx_app_events_app on public.app_events (app_id, created_at desc);
create index if not exists idx_app_events_user on public.app_events (user_id);
create index if not exists app_events_event_type_idx on public.app_events (event_type);
create index if not exists app_events_created_at_idx on public.app_events (created_at);
create index if not exists idx_audit_tenant on public.audit_logs (tenant_id, created_at desc);
create index if not exists idx_audit_app on public.audit_logs (app_id, created_at desc);
create index if not exists idx_audit_user on public.audit_logs (user_id, created_at desc);
create index if not exists idx_audit_resource on public.audit_logs (resource, resource_id);
create index if not exists activity_logs_tenant_idx on public.activity_logs (tenant_id, created_at desc);
create index if not exists activity_logs_entity_idx on public.activity_logs (entity_type, entity_id);

-- ── RLS : activée sur toutes les tables ──────────────────────
-- (les policies réelles sont versionnées en 001/002 + correctifs 005.
--  RLS « enabled » est ré-affirmé ici par sécurité.)
alter table public.tenants          enable row level security;
alter table public.tenant_members   enable row level security;
alter table public.profiles         enable row level security;
alter table public.subscriptions    enable row level security;
alter table public.user_credits     enable row level security;
alter table public.modules          enable row level security;
alter table public.module_versions  enable row level security;
alter table public.app_members      enable row level security;
alter table public.clients          enable row level security;
alter table public.employees        enable row level security;
alter table public.chantiers        enable row level security;
alter table public.documents        enable row level security;
alter table public.materials        enable row level security;
alter table public.suppliers        enable row level security;
alter table public.equipment        enable row level security;
alter table public.interventions    enable row level security;
alter table public.tasks            enable row level security;
alter table public.workflows        enable row level security;
alter table public.custom_entities  enable row level security;
alter table public.files            enable row level security;
alter table public.notifications    enable row level security;
alter table public.integrations     enable row level security;
alter table public.templates        enable row level security;
alter table public.ai_usage         enable row level security;
alter table public.app_events       enable row level security;
alter table public.audit_logs       enable row level security;
alter table public.activity_logs    enable row level security;
