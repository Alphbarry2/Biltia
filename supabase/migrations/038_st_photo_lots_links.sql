-- ─────────────────────────────────────────────────────────────────────────────
-- 038 — Déblocage sous-traitance + étapes de chantier (FK directes, motif 037).
--
-- Les audits BTP (sous-traitants #306-335) ont buté sur un plafond de MODÈLE : un
-- sous-traitant n'était relié qu'aux réserves/commandes, et il n'existait pas
-- d'ÉTAPE (lot) pour structurer un chantier. Cette migration lève ces deux points,
-- dans le style FK-directes déjà retenu en Phase 1 (037).
--
-- Cette migration est 100 % ADDITIVE (nouvelle table + colonnes NULLABLES,
-- FK on delete set null) : elle ne casse aucune donnée existante.
--
--   • NOUVELLE TABLE  lots        — étapes/lots d'un chantier (préparation, plomberie…)
--   • documents      + supplier_id             (attestations/pièces d'un sous-traitant)
--   • interventions  + supplier_id, lot_id      (un ST peut réaliser l'intervention)
--   • tasks          + supplier_id, lot_id      (une tâche peut viser un ST / un lot)
--   • reserves       + lot_id                    (réserve rattachée à une étape)
--
-- Débloque : suivi documentaire ST (#307-310), interventions/tâches ST (#312/320/326),
-- statut de lot / étapes (#319/377).
--
-- HORS PÉRIMÈTRE (volontaire) : le rattachement des PHOTOS/pièces jointes à une
-- tâche/réserve/intervention/étape passe par la table `files` EXISTANTE (lien
-- polymorphe entity_type/entity_id, migration 004), PAS par des colonnes sur
-- `documents`. Son exposition au niveau entité/SDK est une décision archi (Phase 2
-- « attaché-à-N ») encore non tranchée — non incluse ici.
--
-- Sécurité : motif IDENTIQUE à 018/037 — tenant_id NOT NULL, RLS via my_tenant_role()
-- (SELECT = tout membre ; INSERT/UPDATE = owner/admin/manager/member ; DELETE =
-- owner/admin), trigger set_updated_at, index tenant. FK en on delete set null.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── LOTS / ÉTAPES DE CHANTIER ────────────────────────────────────────────────
create table if not exists public.lots (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  chantier_id       uuid references public.chantiers(id) on delete cascade,
  nom               text not null,
  type              text not null default 'lot',      -- preparation|demolition|gros_oeuvre|plomberie|electricite|platrerie|peinture|carrelage|menuiserie|finition|reception|sav|lot
  ordre             integer not null default 0,
  statut            text not null default 'a_faire',  -- a_faire|en_cours|termine|bloque|receptionne
  assignee_id       uuid references public.employees(id) on delete set null,
  supplier_id       uuid references public.suppliers(id) on delete set null,   -- sous-traitant du lot
  date_debut_prevue date,
  date_fin_prevue   date,
  date_debut_reelle date,
  date_fin_reelle   date,
  avancement        integer not null default 0,       -- 0..100
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- RLS + trigger updated_at + index tenant (motif identique à 018/037).
do $$
declare t text;
begin
  foreach t in array array['lots'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_select', t);
    execute format('drop policy if exists %I on public.%I', t||'_insert', t);
    execute format('drop policy if exists %I on public.%I', t||'_update', t);
    execute format('drop policy if exists %I on public.%I', t||'_delete', t);
    execute format($f$create policy %I on public.%I for select using (public.my_tenant_role(tenant_id) is not null)$f$, t||'_select', t);
    execute format($f$create policy %I on public.%I for insert with check (public.my_tenant_role(tenant_id) in ('owner','admin','manager','member'))$f$, t||'_insert', t);
    execute format($f$create policy %I on public.%I for update using (public.my_tenant_role(tenant_id) in ('owner','admin','manager','member'))$f$, t||'_update', t);
    execute format($f$create policy %I on public.%I for delete using (public.my_tenant_role(tenant_id) in ('owner','admin'))$f$, t||'_delete', t);
    execute format('drop trigger if exists %I on public.%I', 'set_'||t||'_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute procedure public.set_updated_at()', 'set_'||t||'_updated_at', t);
    execute format('create index if not exists %I on public.%I(tenant_id)', 'idx_'||t||'_tenant', t);
  end loop;
end $$;

-- ── CÂBLAGE : rattachements ST / lot sur les entités existantes ──────────────
-- documents : une attestation / pièce peut désormais viser un sous-traitant
-- (kbis, décennale, urssaf…), en plus de chantier/client/employé.
alter table public.documents
  add column if not exists supplier_id uuid references public.suppliers(id) on delete set null;

alter table public.interventions
  add column if not exists supplier_id uuid references public.suppliers(id) on delete set null,
  add column if not exists lot_id      uuid references public.lots(id)      on delete set null;

alter table public.tasks
  add column if not exists supplier_id uuid references public.suppliers(id) on delete set null,
  add column if not exists lot_id      uuid references public.lots(id)      on delete set null;

alter table public.reserves
  add column if not exists lot_id uuid references public.lots(id) on delete set null;

-- Index sur les nouvelles clés étrangères (celles qui seront filtrées).
create index if not exists idx_lots_chantier          on public.lots(chantier_id);
create index if not exists idx_lots_supplier          on public.lots(supplier_id);
create index if not exists idx_documents_supplier     on public.documents(supplier_id);
create index if not exists idx_interventions_supplier on public.interventions(supplier_id);
create index if not exists idx_interventions_lot      on public.interventions(lot_id);
create index if not exists idx_tasks_supplier         on public.tasks(supplier_id);
create index if not exists idx_tasks_lot              on public.tasks(lot_id);
create index if not exists idx_reserves_lot           on public.reserves(lot_id);
