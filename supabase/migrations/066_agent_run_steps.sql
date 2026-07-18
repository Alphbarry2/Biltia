-- ============================================================
-- WS-E — Observabilité des passages d'agents
-- Additive et RÉVERSIBLE. NON appliquée tant que non validée en prod.
-- (down : drop table agent_run_steps ; alter table ai_usage drop column run_id ;
--         drop index ai_usage_run_idx.)
--
-- ⚠️ AVANT APPLICATION : vérifier le schéma RÉEL en prod (dérive dépôt/prod).
--   - colonnes de public.agent_runs / public.ai_usage
--   - numéro de migration libre (la prod a déjà 064/065)
-- ============================================================

-- Journal d'étapes RÉDIGÉ : outil, entité, CLÉS de filtre, compteurs, résumé
-- court, durée. JAMAIS de prompts, réponses, raisonnement, valeurs de lignes ni PII.
create table if not exists public.agent_run_steps (
  id             uuid primary key default gen_random_uuid(),
  run_id         uuid not null references public.agent_runs(id) on delete cascade,
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  seq            smallint not null default 0,        -- ordre dans le passage
  kind           text not null,                      -- read | write | email | sms | blocked
  tool           text,                               -- workspace_list, workspace_update, ...
  entity         text,                               -- nom d'entité visée (pas de valeurs)
  input_redacted jsonb not null default '{}'::jsonb, -- clés de filtre + limites, jamais de valeurs
  result_summary text,                               -- « 12 ligne(s) », « id … » (borné)
  created_at     timestamptz not null default now()
);

create index if not exists agent_run_steps_run_idx    on public.agent_run_steps (run_id, seq);
create index if not exists agent_run_steps_tenant_idx on public.agent_run_steps (tenant_id, created_at desc);

alter table public.agent_run_steps enable row level security;

-- Lecture : owner/admin du tenant (aligné sur ai_usage). Insert : service_role uniquement.
create policy "agent_run_steps_select" on public.agent_run_steps
  for select using (
    exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id = agent_run_steps.tenant_id
        and tm.user_id = auth.uid()
        and tm.role in ('owner', 'admin')
        and tm.accepted_at is not null
    )
  );

create policy "agent_run_steps_insert" on public.agent_run_steps
  for insert with check (false);

-- Lien COÛT ↔ PASSAGE. Nullable : les appels chat n'ont pas de run_id.
-- Le code écrit ce lien de façon TOLÉRANTE (repli sans run_id si la colonne
-- n'est pas encore là), donc l'ordre d'application est sans risque.
alter table public.ai_usage
  add column if not exists run_id uuid references public.agent_runs(id) on delete set null;

create index if not exists ai_usage_run_idx on public.ai_usage (run_id);
