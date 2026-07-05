-- ============================================================
-- BILTIA — Migration 005 : Correctifs RLS multi-tenant
-- ============================================================
-- Découverts en générant la baseline 004 :
--
--  1. 🔴 CRITIQUE — tenant_members_insert : la condition était
--     `tm.tenant_id = tm.tenant_id` (TOUJOURS vraie). Résultat :
--     tout owner/admin d'UN tenant pouvait insérer une adhésion
--     dans N'IMPORTE QUEL autre tenant → escalade inter-tenant.
--     Corrigé : l'acteur doit être owner/admin DU tenant ciblé.
--
--  2. tenant_select : condition `tm.tenant_id = tm.id` (compare les
--     mauvaises colonnes) → la policy ne matchait jamais. Corrigé.
--
--  3. modules.is_public DEFAULT true + policy publique → tout module
--     était lisible par n'importe qui par défaut (html_content =
--     données potentiellement sensibles). DEFAULT passé à false ;
--     policy publique large supprimée (on garde l'opt-in actif).
-- ============================================================

-- ── 1. Escalade inter-tenant ─────────────────────────────────
drop policy if exists tenant_members_insert on public.tenant_members;
create policy tenant_members_insert on public.tenant_members
  for insert
  with check ( public.my_tenant_role(tenant_id) in ('owner', 'admin') );

-- ── 2. tenant_select cassée ──────────────────────────────────
drop policy if exists tenant_select on public.tenants;
create policy tenant_select on public.tenants
  for select
  using ( public.my_tenant_role(id) is not null );

-- ── 3. Modules privés par défaut ─────────────────────────────
alter table public.modules alter column is_public set default false;

-- Policy publique trop large (sans filtre de statut) → supprimée.
-- On conserve "apps_public_select" (is_public = true AND status = active)
-- pour l'opt-in marketplace explicite.
drop policy if exists "Public apps are readable by anyone" on public.modules;
