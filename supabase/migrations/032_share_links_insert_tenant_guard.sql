-- ─────────────────────────────────────────────────────────────────────────────
-- 032 — DURCISSEMENT de la policy INSERT de app_share_links (faille cross-tenant).
--
-- La policy 029 (`with check (my_tenant_role(tenant_id) is not null)`) ne
-- contraignait PAS `module_id` au tenant du lien. Un membre pouvait donc insérer
-- en direct (PostgREST) une ligne { tenant_id: le sien, module_id: app PRIVÉE
-- d'un AUTRE tenant } puis la servir via /partage/[token] (service_role). On
-- exige désormais que le module appartienne AU MÊME tenant que le lien.
--
-- Défense en profondeur : /partage/[token] refuse aussi tout module dont le
-- tenant_id ≠ celui du lien (contrôle applicatif). Idempotent (drop/create).
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists app_share_links_insert on public.app_share_links;
create policy app_share_links_insert on public.app_share_links
  for insert with check (
    public.my_tenant_role(tenant_id) is not null
    and exists (
      select 1
      from public.modules m
      where m.id = app_share_links.module_id
        and m.tenant_id = app_share_links.tenant_id
    )
  );
