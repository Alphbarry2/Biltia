-- ─────────────────────────────────────────────────────────────────────────────
-- 045 — RELATIONS MANY-TO-MANY génériques (Phase 4).
--
-- Table de liaison POLYMORPHE : relie n'importe quel enregistrement (entité
-- canonique OU collection custom) à n'importe quel autre, tenant-scopé. Remplace
-- les « UUID libres dans le JSONB sans validation » par des liens VALIDÉS,
-- DÉDUPLIQUÉS, FILTRABLES et SUPPRIMABLES proprement.
--
-- La paire est stockée dans un ORDRE CANONIQUE (le plus petit (entité,id) à
-- gauche) → link(A,B) et link(B,A) produisent la MÊME ligne (l'index unique
-- déduplique). `relation` = libellé optionnel (« affecté », « responsable »…).
--
-- ⚠️ NOUVELLE TABLE : Phase 4 est INERTE tant que 045 n'est pas appliquée (les
-- actions link/unlink échouent proprement, le nettoyage au delete est best-effort).
-- Prod-drift : `db pull` avant DDL. Réversible (drop table).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.entity_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  left_entity text not null,
  left_id uuid not null,
  right_entity text not null,
  right_id uuid not null,
  relation text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Un seul lien par (paire ordonnée + libellé) et par tenant → pas de doublon.
create unique index if not exists entity_links_uniq
  on public.entity_links (tenant_id, left_entity, left_id, right_entity, right_id, relation);
-- Recherche des liens d'un enregistrement (dans les deux sens).
create index if not exists entity_links_left_idx
  on public.entity_links (tenant_id, left_entity, left_id);
create index if not exists entity_links_right_idx
  on public.entity_links (tenant_id, right_entity, right_id);

alter table public.entity_links enable row level security;

drop policy if exists "entity_links_select" on public.entity_links;
create policy "entity_links_select" on public.entity_links
  for select using (
    exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id = entity_links.tenant_id
        and tm.user_id = auth.uid()
        and tm.accepted_at is not null
    )
  );

drop policy if exists "entity_links_insert" on public.entity_links;
create policy "entity_links_insert" on public.entity_links
  for insert with check (
    exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id = entity_links.tenant_id
        and tm.user_id = auth.uid()
        and tm.accepted_at is not null
        and tm.role in ('owner', 'admin', 'manager', 'member')
    )
  );

drop policy if exists "entity_links_delete" on public.entity_links;
create policy "entity_links_delete" on public.entity_links
  for delete using (
    exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id = entity_links.tenant_id
        and tm.user_id = auth.uid()
        and tm.accepted_at is not null
        and tm.role in ('owner', 'admin', 'manager', 'member')
    )
  );
