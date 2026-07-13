-- ─────────────────────────────────────────────────────────────────────────────
-- 044 — ENTITÉS PERSONNALISÉES : activation du registre (Phase 3).
--
-- La table `custom_entities` (créée en 004) a RLS activée mais AUCUNE policy et
-- n'était jamais utilisée. Le code Phase 3 y stocke des DÉFINITIONS d'entités
-- custom (convention : entity_type = clé, data = { fields, relations, statuses,
-- aliases, description }). Les ENREGISTREMENTS restent dans app_records
-- (collection == clé). Aucun changement de schéma de table.
--
-- Cette migration ajoute les policies RLS (lecture pour les membres du tenant) +
-- une unicité (tenant_id, entity_type) pour empêcher les définitions en double.
-- Le code écrit via service_role (upsert applicatif), donc ces policies sont un
-- filet de défense + la future lecture client du registre.
--
-- ⚠️ NON DÉPLOYÉE tant que non validée. Prod-drift : `db pull` avant DDL. Additif
-- et réversible (drop policies / index). Le code fonctionne déjà sans (admin).
-- ─────────────────────────────────────────────────────────────────────────────

-- Une seule définition par (tenant, clé). Ignoré si des doublons préexistent
-- (aucun attendu : la table était inutilisée).
create unique index if not exists custom_entities_tenant_key_uniq
  on public.custom_entities (tenant_id, entity_type);

drop policy if exists "custom_entities_select" on public.custom_entities;
create policy "custom_entities_select" on public.custom_entities
  for select using (
    exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id = custom_entities.tenant_id
        and tm.user_id = auth.uid()
        and tm.accepted_at is not null
    )
  );

drop policy if exists "custom_entities_write" on public.custom_entities;
create policy "custom_entities_write" on public.custom_entities
  for all using (
    exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id = custom_entities.tenant_id
        and tm.user_id = auth.uid()
        and tm.accepted_at is not null
        and tm.role in ('owner', 'admin', 'manager', 'member')
    )
  ) with check (
    exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id = custom_entities.tenant_id
        and tm.user_id = auth.uid()
        and tm.accepted_at is not null
        and tm.role in ('owner', 'admin', 'manager', 'member')
    )
  );
