-- ============================================================
-- BILTIA — Migration 020 : AGENTS AUTONOMES (« recruter »)
-- ============================================================
-- Vision « créer + recruter » (2026-07-05) : à côté du générateur (créer un
-- outil), l'utilisateur RECRUTE un agent — une RÈGLE PERMANENTE dictée en
-- langage courant (« relance ce client tous les jours à midi », « chaque soir
-- à 18h vérifie les pointages ») que Biltia exécute seul, en temps et en heure.
--
-- Deux tables :
--
--   1. agent_rules — la règle : déclencheur (planning v1, événement plus tard),
--      action structurée (parsée par Haiku depuis l'instruction brute), état.
--      États : active | paused | blocked. `blocked` = il MANQUE une info pour
--      exécuter (email du client absent…) — l'agent ne devine JAMAIS, il
--      réclame (blocked_reason + missing) et reprend dès que l'info arrive.
--
--   2. agent_runs — le JOURNAL d'exécution : chaque passage est tracé
--      (succès / bloqué / échec), avec IDEMPOTENCE stricte : une contrainte
--      UNIQUE (rule_id, run_key) garantit qu'un créneau planifié ne s'exécute
--      qu'UNE fois, même si le cron rejoue (jamais deux relances au client).
--
-- Sécurité : RLS tenant sur les deux tables (motif learning_signals/019).
-- L'EXÉCUTEUR écrit via service_role ; les membres consultent leur journal.
--
-- Idempotent (IF NOT EXISTS / do $$ … exception). Réutilise public.my_tenant_role.
-- ============================================================

-- ── 1. RÈGLES (les agents recrutés) ──────────────────────────
create table if not exists public.agent_rules (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  created_by uuid,
  title text not null,                               -- libellé court (« Relance devis en attente »)
  instruction text not null,                         -- les mots exacts de l'utilisateur
  trigger_type text not null default 'schedule',     -- schedule | event (v2)
  schedule jsonb not null default '{}'::jsonb,       -- { time: "HH:MM", days: [1..7] (vide = tous les jours), tz: "Europe/Paris" }
  action jsonb not null default '{}'::jsonb,         -- plan structuré : { type: send_email|notify|report, recipient_kind, recipient_id, content_instruction, data_focus }
  status text not null default 'active',             -- active | paused | blocked
  blocked_reason text,                               -- lisible : « il me manque l'email du client Martin »
  missing jsonb,                                     -- machine : { entity, id, name, field } → l'UI sait quoi demander
  next_run_at timestamptz,                           -- prochain passage dû (NULL si paused/blocked)
  last_run_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── 2. JOURNAL D'EXÉCUTION ───────────────────────────────────
create table if not exists public.agent_runs (
  id uuid not null default gen_random_uuid(),
  rule_id uuid not null,
  tenant_id uuid not null,
  run_key text not null,                             -- créneau planifié (ISO) → idempotence
  status text not null default 'running',            -- running | success | blocked | failed
  summary text not null default '',                  -- 1-2 phrases lisibles (« Relance envoyée à… »)
  output jsonb not null default '{}'::jsonb,         -- détail (email envoyé, rapport produit…)
  error text,
  credits_used integer not null default 0,           -- journalisé ; la tarification agents sera tranchée plus tard
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

-- ── CONTRAINTES ──────────────────────────────────────────────
do $$ begin
  alter table public.agent_rules add constraint agent_rules_pkey primary key (id);
  alter table public.agent_rules add constraint agent_rules_tenant_id_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade;
  alter table public.agent_rules add constraint agent_rules_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null;

  alter table public.agent_runs add constraint agent_runs_pkey primary key (id);
  alter table public.agent_runs add constraint agent_runs_rule_id_fkey
    foreign key (rule_id) references public.agent_rules(id) on delete cascade;
  alter table public.agent_runs add constraint agent_runs_tenant_id_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade;
exception when duplicate_object or duplicate_table then null; end $$;

-- IDEMPOTENCE : un créneau ne s'exécute qu'une fois par règle, quoi qu'il arrive.
create unique index if not exists agent_runs_rule_slot_idx
  on public.agent_runs (rule_id, run_key);

-- ── INDEX ────────────────────────────────────────────────────
-- L'exécuteur ne balaie que l'actif dû : index partiel dédié.
create index if not exists agent_rules_due_idx
  on public.agent_rules (next_run_at) where (status = 'active');
create index if not exists agent_rules_tenant_idx
  on public.agent_rules (tenant_id);
create index if not exists agent_runs_tenant_idx
  on public.agent_runs (tenant_id, created_at desc);

-- ── RLS ──────────────────────────────────────────────────────
alter table public.agent_rules enable row level security;
alter table public.agent_runs  enable row level security;

-- RÈGLES : les membres du tenant gèrent leurs agents (créer/pauser/supprimer).
drop policy if exists agent_rules_select on public.agent_rules;
create policy agent_rules_select on public.agent_rules
  for select using ( public.my_tenant_role(tenant_id) is not null );

drop policy if exists agent_rules_insert on public.agent_rules;
create policy agent_rules_insert on public.agent_rules
  for insert with check ( public.my_tenant_role(tenant_id) is not null );

drop policy if exists agent_rules_update on public.agent_rules;
create policy agent_rules_update on public.agent_rules
  for update
  using ( public.my_tenant_role(tenant_id) is not null )
  with check ( public.my_tenant_role(tenant_id) is not null );

drop policy if exists agent_rules_delete on public.agent_rules;
create policy agent_rules_delete on public.agent_rules
  for delete using ( public.my_tenant_role(tenant_id) is not null );

-- JOURNAL : lecture pour les membres ; écriture RÉSERVÉE au service_role
-- (l'exécuteur) — aucune policy insert/update → un utilisateur ne peut pas
-- forger un historique d'exécution.
drop policy if exists agent_runs_select on public.agent_runs;
create policy agent_runs_select on public.agent_runs
  for select using ( public.my_tenant_role(tenant_id) is not null );
