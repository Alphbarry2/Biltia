-- ============================================================
-- BILTIA — Migration 025 : DÉCLENCHEURS ÉVÉNEMENTIELS (« dès que… »)
-- ============================================================
-- Jusqu'ici un agent était PLANIFIÉ (trigger_type='schedule') : il passe à
-- heure fixe. Cette migration active le second mode prévu dès l'origine
-- (020 : « trigger_type … event (v2) ») : l'agent SURVEILLE une CONDITION
-- métier et agit DÈS QU'une fiche y correspond — sans SQL libre : un
-- catalogue de « veilleurs » nommés et paramétrés (lib/agent-watchers.ts).
--
--   • « préviens-moi quand un chantier prend du retard »  → chantier_en_retard
--   • « relance les devis non signés »                    → devis_non_signe
--   • « occupe-toi des factures impayées »                → facture_impayee
--   • « alerte-moi quand un document va expirer »         → echeance_proche
--
-- Le tick (pg_cron, migration 022) est PARTAGÉ : à chaque passage l'exécuteur
-- évalue les agents-événement dus (next_run_at sert de cadence de scan) en
-- plus des agents planifiés. Aucune infra nouvelle.
--
-- Deux ajouts :
--   1. agent_rules.trigger — config du veilleur : { watcher, params, scanEveryMinutes }.
--   2. agent_event_fires — IDEMPOTENCE PAR FICHE : un chantier en retard ne
--      déclenche qu'UNE alerte (pas une toutes les 5 min). UNIQUE(rule_id,
--      fire_key) où fire_key identifie la fiche (+ éventuelle période de
--      relance / date d'échéance). Miroir de l'idempotence par créneau
--      d'agent_runs (020), mais à la granularité de la fiche déclenchante.
--
-- Idempotent (IF NOT EXISTS / exception). RLS tenant (motif agent_runs/020).
-- ============================================================

-- ── 1. Config du déclencheur événementiel sur la règle ───────
alter table public.agent_rules
  add column if not exists trigger jsonb not null default '{}'::jsonb;
-- { watcher: 'facture_impayee', params: { days: 0 }, scanEveryMinutes: 60 }
-- Vide {} pour les agents planifiés (trigger_type='schedule').

-- ── 2. JOURNAL DES DÉCLENCHEMENTS PAR FICHE (idempotence) ─────
create table if not exists public.agent_event_fires (
  id uuid not null default gen_random_uuid(),
  rule_id uuid not null,
  tenant_id uuid not null,
  fire_key text not null,          -- '<watcher>:<fiche_id>[:<extra>][:w<bucket>]'
  label text not null default '',  -- lisible (« Facture F-2026-001 ») pour le journal
  created_at timestamptz not null default now()
);

do $$ begin
  alter table public.agent_event_fires add constraint agent_event_fires_pkey primary key (id);
  alter table public.agent_event_fires add constraint agent_event_fires_rule_id_fkey
    foreign key (rule_id) references public.agent_rules(id) on delete cascade;
  alter table public.agent_event_fires add constraint agent_event_fires_tenant_id_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade;
exception when duplicate_object or duplicate_table then null; end $$;

-- IDEMPOTENCE : une fiche (dans sa période) ne déclenche qu'une fois par agent.
create unique index if not exists agent_event_fires_key_idx
  on public.agent_event_fires (rule_id, fire_key);
create index if not exists agent_event_fires_tenant_idx
  on public.agent_event_fires (tenant_id, created_at desc);

-- ── RLS ──────────────────────────────────────────────────────
-- Lecture pour les membres du tenant (transparence du journal) ; écriture
-- RÉSERVÉE au service_role (l'exécuteur) — aucune policy insert/update, donc
-- un utilisateur ne peut ni forger ni effacer un déclenchement.
alter table public.agent_event_fires enable row level security;

drop policy if exists agent_event_fires_select on public.agent_event_fires;
create policy agent_event_fires_select on public.agent_event_fires
  for select using ( public.my_tenant_role(tenant_id) is not null );
