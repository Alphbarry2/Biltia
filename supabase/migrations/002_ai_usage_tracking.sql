-- ============================================================
-- AI Usage Tracking
-- Logs every Anthropic API call with token counts and cost.
-- ============================================================

create table public.ai_usage (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  app_id              uuid,                        -- null for non-app calls
  action              text not null,               -- 'create_app', 'edit_app', 'autofix', etc.
  model               text not null,
  input_tokens        integer not null default 0,
  output_tokens       integer not null default 0,
  cached_input_tokens integer not null default 0,
  cost_usd            numeric(12, 8) not null default 0,
  agent               text,                        -- route agent key
  sector              text,
  prompt_type         text,                        -- 'create' | 'modify' | 'autofix'
  created_at          timestamptz not null default now()
);

alter table public.ai_usage enable row level security;

-- Users can read their own usage; admins/owners can read the full tenant
create policy "ai_usage_select_own" on public.ai_usage
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id = ai_usage.tenant_id
        and tm.user_id = auth.uid()
        and tm.role in ('owner', 'admin')
        and tm.accepted_at is not null
    )
  );

-- Only server-side inserts (service role) — no direct client inserts
create policy "ai_usage_insert_service" on public.ai_usage
  for insert with check (false);

-- Indexes for dashboard queries
create index ai_usage_tenant_created on public.ai_usage (tenant_id, created_at desc);
create index ai_usage_user_created   on public.ai_usage (user_id, created_at desc);
create index ai_usage_action         on public.ai_usage (action);
