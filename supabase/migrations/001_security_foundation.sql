-- ============================================================
-- BILTIA — Security Foundation Migration
-- Implements: Multi-tenancy, RBAC, RLS, Audit Logs
-- Every table has tenant_id + app_id isolation.
-- ============================================================

-- Extensions
create extension if not exists "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================

create type public.member_role as enum ('owner', 'admin', 'manager', 'member', 'viewer');
create type public.audit_action as enum (
  'create', 'update', 'delete',
  'permission_change', 'login', 'logout', 'export',
  'invite', 'revoke'
);
create type public.app_status as enum ('active', 'archived', 'suspended');

-- ============================================================
-- TENANTS (organisations)
-- ============================================================

create table public.tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  logo_url    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.tenants enable row level security;

-- Only members of a tenant can see it
create policy "tenant_select" on public.tenants
  for select using (
    exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id = id
        and tm.user_id = auth.uid()
        and tm.accepted_at is not null
    )
  );

-- ============================================================
-- TENANT MEMBERS  (user ↔ tenant, with role)
-- ============================================================

create table public.tenant_members (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        public.member_role not null default 'member',
  invited_by  uuid references auth.users(id),
  invited_at  timestamptz not null default now(),
  accepted_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique(tenant_id, user_id)
);

alter table public.tenant_members enable row level security;

-- Members see their own membership + all members of shared tenants
create policy "tenant_members_select" on public.tenant_members
  for select using (
    user_id = auth.uid()
    or
    exists (
      select 1 from public.tenant_members tm2
      where tm2.tenant_id = tenant_id
        and tm2.user_id = auth.uid()
        and tm2.accepted_at is not null
    )
  );

-- Only owner/admin can insert new members
create policy "tenant_members_insert" on public.tenant_members
  for insert with check (
    exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id = tenant_id
        and tm.user_id = auth.uid()
        and tm.role in ('owner', 'admin')
        and tm.accepted_at is not null
    )
  );

-- Owner/admin can update roles; member can accept their own invite
create policy "tenant_members_update" on public.tenant_members
  for update using (
    user_id = auth.uid()
    or
    exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id = tenant_id
        and tm.user_id = auth.uid()
        and tm.role in ('owner', 'admin')
        and tm.accepted_at is not null
    )
  );

-- Only owner can delete members (or member leaves)
create policy "tenant_members_delete" on public.tenant_members
  for delete using (
    user_id = auth.uid()
    or
    exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id = tenant_id
        and tm.user_id = auth.uid()
        and tm.role = 'owner'
        and tm.accepted_at is not null
    )
  );

-- ============================================================
-- APPS
-- ============================================================

create table public.apps (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  created_by   uuid not null references auth.users(id),
  name         text not null,
  description  text not null default '',
  slug         text not null,
  html_content text not null default '',
  status       public.app_status not null default 'active',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique(tenant_id, slug)
);

alter table public.apps enable row level security;

-- Helper: get current user's role in a tenant
create or replace function public.my_tenant_role(p_tenant_id uuid)
returns public.member_role
language sql stable security definer
as $$
  select role from public.tenant_members
  where tenant_id = p_tenant_id
    and user_id = auth.uid()
    and accepted_at is not null
  limit 1;
$$;

-- Helper: check if user is member of tenant owning an app
create or replace function public.is_app_member(p_app_id uuid)
returns boolean
language sql stable security definer
as $$
  select exists (
    select 1
    from public.apps a
    join public.tenant_members tm on tm.tenant_id = a.tenant_id
    where a.id = p_app_id
      and tm.user_id = auth.uid()
      and tm.accepted_at is not null
  );
$$;

create policy "apps_select" on public.apps
  for select using (public.is_app_member(id));

-- Only owner/admin/manager can create apps
create policy "apps_insert" on public.apps
  for insert with check (
    public.my_tenant_role(tenant_id) in ('owner', 'admin', 'manager')
  );

-- owner/admin/manager can update
create policy "apps_update" on public.apps
  for update using (
    public.my_tenant_role(tenant_id) in ('owner', 'admin', 'manager')
  );

-- Only owner/admin can delete
create policy "apps_delete" on public.apps
  for delete using (
    public.my_tenant_role(tenant_id) in ('owner', 'admin')
  );

-- ============================================================
-- APP MEMBERS  (restrict app access within a tenant)
-- ============================================================

create table public.app_members (
  id         uuid primary key default gen_random_uuid(),
  app_id     uuid not null references public.apps(id) on delete cascade,
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       public.member_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(app_id, user_id)
);

alter table public.app_members enable row level security;

create policy "app_members_select" on public.app_members
  for select using (public.is_app_member(app_id));

create policy "app_members_insert" on public.app_members
  for insert with check (
    public.my_tenant_role(tenant_id) in ('owner', 'admin', 'manager')
  );

create policy "app_members_update" on public.app_members
  for update using (
    public.my_tenant_role(tenant_id) in ('owner', 'admin', 'manager')
  );

create policy "app_members_delete" on public.app_members
  for delete using (
    public.my_tenant_role(tenant_id) in ('owner', 'admin')
  );

-- ============================================================
-- USER CREDITS  (per user, global)
-- ============================================================

create table public.user_credits (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  balance    integer not null default 50 check (balance >= 0),
  updated_at timestamptz not null default now()
);

alter table public.user_credits enable row level security;

create policy "credits_select" on public.user_credits
  for select using (auth.uid() = user_id);

-- Only server-side (security definer functions) can update credits
-- No direct update policy — use the deduct_credits() function below

-- ============================================================
-- AUDIT LOGS
-- ============================================================

create table public.audit_logs (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid references public.tenants(id) on delete set null,
  app_id       uuid references public.apps(id) on delete set null,
  user_id      uuid references auth.users(id) on delete set null,
  action       public.audit_action not null,
  resource     text,           -- table or entity name
  resource_id  uuid,           -- id of the affected row
  old_data     jsonb,
  new_data     jsonb,
  ip_address   inet,
  user_agent   text,
  created_at   timestamptz not null default now()
);

alter table public.audit_logs enable row level security;

-- Only owner/admin can read audit logs for their tenant
create policy "audit_logs_select" on public.audit_logs
  for select using (
    public.my_tenant_role(tenant_id) in ('owner', 'admin')
  );

-- Logs are inserted only via security definer functions — no direct insert
create policy "audit_logs_insert" on public.audit_logs
  for insert with check (false);

-- Immutable: no update, no delete
-- (no policies = denied by default under RLS)

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Insert an audit log entry (security definer, called from server)
create or replace function public.log_audit(
  p_tenant_id  uuid,
  p_app_id     uuid,
  p_action     public.audit_action,
  p_resource   text,
  p_resource_id uuid default null,
  p_old_data   jsonb default null,
  p_new_data   jsonb default null,
  p_ip_address inet default null,
  p_user_agent text default null
)
returns void
language plpgsql security definer
as $$
begin
  insert into public.audit_logs (
    tenant_id, app_id, user_id, action,
    resource, resource_id,
    old_data, new_data,
    ip_address, user_agent
  ) values (
    p_tenant_id, p_app_id, auth.uid(), p_action,
    p_resource, p_resource_id,
    p_old_data, p_new_data,
    p_ip_address, p_user_agent
  );
end;
$$;

-- Deduct credits (atomic, security definer)
create or replace function public.deduct_credits(p_user_id uuid, p_amount integer)
returns boolean
language plpgsql security definer
as $$
declare
  v_balance integer;
begin
  select balance into v_balance
  from public.user_credits
  where user_id = p_user_id
  for update;

  if v_balance is null or v_balance < p_amount then
    return false;
  end if;

  update public.user_credits
  set balance = balance - p_amount,
      updated_at = now()
  where user_id = p_user_id;

  return true;
end;
$$;

-- Auto-create credits + personal tenant on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
as $$
declare
  v_tenant_id uuid;
begin
  -- Credits
  insert into public.user_credits (user_id, balance)
  values (new.id, 50)
  on conflict (user_id) do nothing;

  -- Personal tenant
  v_tenant_id := gen_random_uuid();
  insert into public.tenants (id, name, slug)
  values (
    v_tenant_id,
    coalesce(new.raw_user_meta_data->>'full_name', 'Mon espace'),
    v_tenant_id::text
  );

  -- Owner membership
  insert into public.tenant_members (tenant_id, user_id, role, accepted_at)
  values (v_tenant_id, new.id, 'owner', now());

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tenants_updated_at before update on public.tenants
  for each row execute procedure public.set_updated_at();
create trigger tenant_members_updated_at before update on public.tenant_members
  for each row execute procedure public.set_updated_at();
create trigger apps_updated_at before update on public.apps
  for each row execute procedure public.set_updated_at();
create trigger app_members_updated_at before update on public.app_members
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- INDEXES
-- ============================================================

create index on public.tenant_members (tenant_id, user_id);
create index on public.tenant_members (user_id);
create index on public.apps (tenant_id);
create index on public.app_members (app_id, user_id);
create index on public.audit_logs (tenant_id, created_at desc);
create index on public.audit_logs (app_id, created_at desc);
create index on public.audit_logs (user_id, created_at desc);
