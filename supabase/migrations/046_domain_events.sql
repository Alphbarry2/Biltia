-- ─────────────────────────────────────────────────────────────────────────────
-- 046 — ÉVÉNEMENTS MÉTIER (outbox) — Phase 5.
--
-- Table d'ÉVÉNEMENTS DE DOMAINE, à NE PAS confondre avec `app_events` (télémétrie
-- de génération). Ici : ce qui se passe DANS les données (record_created,
-- status_changed, relation_added…). Émis best-effort à chaque écriture de
-- /api/data. Sert de FILET D'ÉVÉNEMENTS aux agents (aujourd'hui ils POLLENT les
-- tables ; demain ils consomment cet outbox). `processed_at` = marqueur outbox.
--
-- ⚠️ NOUVELLE TABLE : l'émission est INERTE tant que 046 n'est pas appliquée
-- (missing-table capturé → aucune écriture bloquée). Prod-drift : `db pull` avant
-- DDL. Réversible (drop table).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.domain_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  module_id uuid references public.modules(id) on delete set null,  -- app émettrice (si connue)
  type text not null,          -- record_created | record_updated | status_changed | …
  entity text not null,        -- entité canonique OU collection custom
  record_id text,              -- id de l'enregistrement concerné (uuid en texte)
  actor_id uuid references auth.users(id) on delete set null,
  before jsonb,                -- état avant (update/status_changed) — optionnel
  after jsonb,                 -- état après — optionnel
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz     -- null = pas encore traité par le moteur d'agents
);

create index if not exists domain_events_tenant_created_idx
  on public.domain_events (tenant_id, created_at desc);
create index if not exists domain_events_tenant_entity_type_idx
  on public.domain_events (tenant_id, entity, type);
-- Outbox : les événements NON traités, les plus anciens d'abord (consommation FIFO).
create index if not exists domain_events_unprocessed_idx
  on public.domain_events (tenant_id, created_at)
  where processed_at is null;

alter table public.domain_events enable row level security;

-- Lecture : membres du tenant. Écriture : rôles qui peuvent modifier des données.
-- Le marquage `processed_at` se fait via service_role (moteur d'agents), pas depuis
-- une session → aucune policy UPDATE cliente (l'outbox est immuable côté app).
drop policy if exists "domain_events_select" on public.domain_events;
create policy "domain_events_select" on public.domain_events
  for select using (
    exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id = domain_events.tenant_id
        and tm.user_id = auth.uid()
        and tm.accepted_at is not null
    )
  );

drop policy if exists "domain_events_insert" on public.domain_events;
create policy "domain_events_insert" on public.domain_events
  for insert with check (
    exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id = domain_events.tenant_id
        and tm.user_id = auth.uid()
        and tm.accepted_at is not null
        and tm.role in ('owner', 'admin', 'manager', 'member')
    )
  );
