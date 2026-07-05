-- ─────────────────────────────────────────────────────────────────────────────
-- 015 — Fiche entreprise fonctionnelle (Paramètres → Entreprise).
--   1. tenants.company_info : pays (FR/BE), n° TVA, SIRET / n° BCE, adresse…
--      Alimente les documents générés (en-têtes devis/factures).
--   2. Policy UPDATE sur tenants : owner/admin uniquement (il n'en existait
--      AUCUNE → le bouton « Enregistrer » de l'entreprise échouait toujours).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.tenants
  add column if not exists company_info jsonb not null default '{}'::jsonb;

drop policy if exists "tenant_update_admin" on public.tenants;
create policy "tenant_update_admin" on public.tenants
  for update using (
    exists (
      select 1 from public.tenant_members m
      where m.tenant_id = tenants.id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  ) with check (
    exists (
      select 1 from public.tenant_members m
      where m.tenant_id = tenants.id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );
