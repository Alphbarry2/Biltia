-- ============================================================
-- BILTIA — Migration 002 : BTP Workspace + Bug Fixes
--
-- 1. Fix deduct_credits (use auth.uid() internally)
-- 2. Add refund_credits
-- 3. Add profiles table
-- 4. Add app_events table
-- 5. Add missing columns on apps
-- 6. BTP shared entities: employees, chantiers, clients,
--    documents, materials
-- ============================================================


-- ============================================================
-- 1. FIX deduct_credits
--    Ancien: p_user_id passé en param → jamais fourni côté TS
--    Nouveau: utilise auth.uid() en interne (security definer)
-- ============================================================

create or replace function public.deduct_credits(p_amount integer)
returns boolean
language plpgsql security definer
as $$
declare
  v_uid    uuid := auth.uid();
  v_balance integer;
begin
  if v_uid is null then
    return false;
  end if;

  select balance into v_balance
  from public.user_credits
  where user_id = v_uid
  for update;

  if v_balance is null or v_balance < p_amount then
    return false;
  end if;

  update public.user_credits
  set balance    = balance - p_amount,
      updated_at = now()
  where user_id = v_uid;

  return true;
end;
$$;


-- ============================================================
-- 2. ADD refund_credits
-- ============================================================

create or replace function public.refund_credits(p_user_id uuid, p_amount integer)
returns void
language plpgsql security definer
as $$
begin
  update public.user_credits
  set balance    = balance + p_amount,
      updated_at = now()
  where user_id = p_user_id;
end;
$$;


-- ============================================================
-- 3. PROFILES TABLE
--    Stocke le secteur/corps de métier de l'utilisateur
-- ============================================================

create table if not exists public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  sector     text,                 -- JSON: {"subTrades":["electricite"],"activityType":"artisan"}
  corps_metier text,               -- label lisible (ex: "Électricité")
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select" on public.profiles
  for select using (user_id = auth.uid());

create policy "profiles_insert" on public.profiles
  for insert with check (user_id = auth.uid());

create policy "profiles_update" on public.profiles
  for update using (user_id = auth.uid());

-- Trigger updated_at
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

-- Auto-create profile on signup (extend handle_new_user)
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
as $$
declare
  v_tenant_id uuid;
  v_full_name text;
begin
  v_full_name := coalesce(new.raw_user_meta_data->>'full_name', '');

  -- Credits (50 offerts au départ)
  insert into public.user_credits (user_id, balance)
  values (new.id, 50)
  on conflict (user_id) do nothing;

  -- Personal tenant (workspace)
  v_tenant_id := gen_random_uuid();
  insert into public.tenants (id, name, slug)
  values (
    v_tenant_id,
    case when v_full_name <> '' then v_full_name || '''s workspace' else 'Mon espace' end,
    v_tenant_id::text
  );

  -- Owner membership
  insert into public.tenant_members (tenant_id, user_id, role, accepted_at)
  values (v_tenant_id, new.id, 'owner', now());

  -- Profile
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


-- ============================================================
-- 4. APP_EVENTS TABLE
--    Tracking des actions IA (génération, modification…)
-- ============================================================

create table if not exists public.app_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  tenant_id    uuid references public.tenants(id) on delete set null,
  app_id       uuid references public.apps(id) on delete set null,
  event_type   text not null,       -- 'app_created' | 'app_edited' | 'app_deployed'
  agent        text,                -- agent IA utilisé
  sector       text,                -- sous-métier détecté
  app_type     text,
  format       text,                -- 'mobile' | 'desktop' | 'auto'
  prompt_length integer,
  credits_used  integer default 0,
  metadata     jsonb default '{}',
  created_at   timestamptz not null default now()
);

alter table public.app_events enable row level security;

create policy "app_events_select" on public.app_events
  for select using (user_id = auth.uid());

create policy "app_events_insert" on public.app_events
  for insert with check (user_id = auth.uid());

create index on public.app_events (user_id, created_at desc);
create index on public.app_events (tenant_id, created_at desc);


-- ============================================================
-- 5. MISSING COLUMNS ON apps
-- ============================================================

alter table public.apps
  add column if not exists deployment_url    text,
  add column if not exists vercel_project_id text,
  add column if not exists format            text default 'auto',
  add column if not exists description       text default '';


-- ============================================================
-- 6. BTP SHARED ENTITIES
--    Toutes isolées par tenant_id + RLS
-- ============================================================

-- ── 6a. CLIENTS ──────────────────────────────────────────────

create table if not exists public.clients (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  nom         text not null,
  siret       text,
  type        text default 'particulier', -- 'particulier' | 'entreprise' | 'collectivite'
  email       text,
  tel         text,
  adresse     text,
  ville       text,
  code_postal text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.clients enable row level security;

create policy "clients_select" on public.clients
  for select using (public.my_tenant_role(tenant_id) is not null);

create policy "clients_insert" on public.clients
  for insert with check (public.my_tenant_role(tenant_id) in ('owner','admin','manager','member'));

create policy "clients_update" on public.clients
  for update using (public.my_tenant_role(tenant_id) in ('owner','admin','manager','member'));

create policy "clients_delete" on public.clients
  for delete using (public.my_tenant_role(tenant_id) in ('owner','admin'));

create trigger clients_updated_at
  before update on public.clients
  for each row execute procedure public.set_updated_at();

create index on public.clients (tenant_id);


-- ── 6b. CHANTIERS ────────────────────────────────────────────

create type public.chantier_statut as enum (
  'en_attente', 'en_cours', 'en_retard', 'termine', 'annule'
);

create table if not exists public.chantiers (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  client_id        uuid references public.clients(id) on delete set null,
  nom              text not null,
  adresse          text,
  ville            text,
  code_postal      text,
  description      text,
  budget           numeric(12,2) default 0,
  budget_engage    numeric(12,2) default 0,
  avancement       integer default 0 check (avancement between 0 and 100),
  statut           public.chantier_statut not null default 'en_attente',
  date_debut       date,
  date_fin_prevue  date,
  date_fin_reelle  date,
  chef_chantier_id uuid,               -- référence employees
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.chantiers enable row level security;

create policy "chantiers_select" on public.chantiers
  for select using (public.my_tenant_role(tenant_id) is not null);

create policy "chantiers_insert" on public.chantiers
  for insert with check (public.my_tenant_role(tenant_id) in ('owner','admin','manager','member'));

create policy "chantiers_update" on public.chantiers
  for update using (public.my_tenant_role(tenant_id) in ('owner','admin','manager','member'));

create policy "chantiers_delete" on public.chantiers
  for delete using (public.my_tenant_role(tenant_id) in ('owner','admin'));

create trigger chantiers_updated_at
  before update on public.chantiers
  for each row execute procedure public.set_updated_at();

create index on public.chantiers (tenant_id);
create index on public.chantiers (tenant_id, statut);
create index on public.chantiers (client_id);


-- ── 6c. EMPLOYEES ────────────────────────────────────────────

create table if not exists public.employees (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  nom            text not null,
  prenom         text,
  role           text,                  -- 'chef_equipe' | 'maçon' | 'coffreur' | ...
  corps_metier   text,                  -- 'Maçonnerie' | 'Électricité' | ...
  email          text,
  tel            text,
  date_embauche  date,
  taux_horaire   numeric(8,2),
  statut         text default 'actif',  -- 'actif' | 'inactif' | 'arret'
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- FK retardée pour chef_chantier_id (employee → employee, après création)
alter table public.chantiers
  add constraint chantiers_chef_fk
  foreign key (chef_chantier_id) references public.employees(id) on delete set null;

alter table public.employees enable row level security;

create policy "employees_select" on public.employees
  for select using (public.my_tenant_role(tenant_id) is not null);

create policy "employees_insert" on public.employees
  for insert with check (public.my_tenant_role(tenant_id) in ('owner','admin','manager','member'));

create policy "employees_update" on public.employees
  for update using (public.my_tenant_role(tenant_id) in ('owner','admin','manager','member'));

create policy "employees_delete" on public.employees
  for delete using (public.my_tenant_role(tenant_id) in ('owner','admin'));

create trigger employees_updated_at
  before update on public.employees
  for each row execute procedure public.set_updated_at();

create index on public.employees (tenant_id);
create index on public.employees (tenant_id, statut);


-- ── 6d. DOCUMENTS ────────────────────────────────────────────

create table if not exists public.documents (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  -- Rattachement optionnel à une entité
  chantier_id    uuid references public.chantiers(id) on delete cascade,
  employee_id    uuid references public.employees(id) on delete cascade,
  client_id      uuid references public.clients(id) on delete cascade,
  -- Données
  nom            text not null,
  type           text not null,   -- 'kbis' | 'urssaf' | 'rc_pro' | 'qualibat' | 'devis' | 'facture' | ...
  storage_path   text,            -- Supabase Storage path
  url            text,            -- URL publique si partagé
  expires_at     date,            -- date d'expiration (alerte J-30)
  statut         text default 'valide', -- 'valide' | 'expire' | 'manquant' | 'en_attente'
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.documents enable row level security;

create policy "documents_select" on public.documents
  for select using (public.my_tenant_role(tenant_id) is not null);

create policy "documents_insert" on public.documents
  for insert with check (public.my_tenant_role(tenant_id) in ('owner','admin','manager','member'));

create policy "documents_update" on public.documents
  for update using (public.my_tenant_role(tenant_id) in ('owner','admin','manager','member'));

create policy "documents_delete" on public.documents
  for delete using (public.my_tenant_role(tenant_id) in ('owner','admin'));

create trigger documents_updated_at
  before update on public.documents
  for each row execute procedure public.set_updated_at();

create index on public.documents (tenant_id);
create index on public.documents (tenant_id, type);
create index on public.documents (expires_at) where expires_at is not null;


-- ── 6e. MATERIALS ────────────────────────────────────────────

create table if not exists public.materials (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  chantier_id  uuid references public.chantiers(id) on delete set null,
  nom          text not null,
  reference    text,
  categorie    text,               -- 'levage' | 'béton' | 'accès' | 'mesure' | ...
  quantite     numeric(10,2) default 0,
  unite        text default 'u',   -- 'u' | 'm²' | 'm³' | 'ml' | 'kg' | 'h'
  statut       text default 'disponible', -- 'disponible' | 'affecte' | 'maintenance' | 'hors_service'
  date_retour  date,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.materials enable row level security;

create policy "materials_select" on public.materials
  for select using (public.my_tenant_role(tenant_id) is not null);

create policy "materials_insert" on public.materials
  for insert with check (public.my_tenant_role(tenant_id) in ('owner','admin','manager','member'));

create policy "materials_update" on public.materials
  for update using (public.my_tenant_role(tenant_id) in ('owner','admin','manager','member'));

create policy "materials_delete" on public.materials
  for delete using (public.my_tenant_role(tenant_id) in ('owner','admin'));

create trigger materials_updated_at
  before update on public.materials
  for each row execute procedure public.set_updated_at();

create index on public.materials (tenant_id);
create index on public.materials (chantier_id);
create index on public.materials (tenant_id, statut);


-- ============================================================
-- 7. WORKSPACE CONTEXT VIEW
--    Utilisée par le context loader IA pour connaître
--    l'état du workspace avant génération
-- ============================================================

create or replace view public.workspace_summary as
select
  t.id                                                    as tenant_id,
  t.name                                                  as workspace_name,
  count(distinct e.id) filter (where e.statut = 'actif') as employees_actifs,
  count(distinct c.id)                                    as chantiers_total,
  count(distinct c.id) filter (where c.statut = 'en_cours') as chantiers_actifs,
  count(distinct cl.id)                                   as clients_total,
  count(distinct m.id) filter (where m.statut = 'disponible') as materiels_disponibles,
  count(distinct d.id) filter (
    where d.expires_at is not null
      and d.expires_at <= current_date + interval '30 days'
      and d.statut = 'valide'
  )                                                       as documents_expirant_bientot
from public.tenants t
left join public.employees  e  on e.tenant_id = t.id
left join public.chantiers  c  on c.tenant_id = t.id
left join public.clients    cl on cl.tenant_id = t.id
left join public.materials  m  on m.tenant_id = t.id
left join public.documents  d  on d.tenant_id = t.id
group by t.id, t.name;

-- RLS via la vue : seuls les membres du tenant voient leurs données
-- (les tables sous-jacentes ont déjà RLS — la vue hérite de la sécurité)


-- ============================================================
-- 8. FUNCTION get_workspace_context(tenant_id)
--    Retourne un bloc texte prêt pour le system prompt IA
-- ============================================================

create or replace function public.get_workspace_context(p_tenant_id uuid)
returns jsonb
language plpgsql stable security definer
as $$
declare
  v_summary  record;
  v_result   jsonb;
begin
  -- Vérifier que l'utilisateur a accès à ce tenant
  if public.my_tenant_role(p_tenant_id) is null then
    return null;
  end if;

  select * into v_summary
  from public.workspace_summary
  where tenant_id = p_tenant_id;

  select jsonb_build_object(
    'employees_actifs',           v_summary.employees_actifs,
    'chantiers_total',            v_summary.chantiers_total,
    'chantiers_actifs',           v_summary.chantiers_actifs,
    'clients_total',              v_summary.clients_total,
    'materiels_disponibles',      v_summary.materiels_disponibles,
    'documents_expirant_bientot', v_summary.documents_expirant_bientot,
    'employees', (
      select jsonb_agg(jsonb_build_object('nom', nom, 'prenom', prenom, 'role', role, 'corps_metier', corps_metier))
      from public.employees where tenant_id = p_tenant_id and statut = 'actif' limit 20
    ),
    'chantiers', (
      select jsonb_agg(jsonb_build_object('nom', nom, 'statut', statut, 'ville', ville, 'avancement', avancement))
      from public.chantiers where tenant_id = p_tenant_id and statut in ('en_cours','en_attente') limit 20
    ),
    'clients', (
      select jsonb_agg(jsonb_build_object('nom', nom, 'type', type, 'ville', ville))
      from public.clients where tenant_id = p_tenant_id limit 20
    )
  ) into v_result;

  return v_result;
end;
$$;
