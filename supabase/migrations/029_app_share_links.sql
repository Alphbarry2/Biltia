-- ─────────────────────────────────────────────────────────────────────────────
-- 029 — Liens de partage d'app (« Partager » → lien de consultation).
--
-- Slice 1 du modèle de partage unifié : un lien TOKENISÉ, révocable et
-- éventuellement expirant, qui donne accès à UNE app en LECTURE SEULE, sans
-- compte. Il remplace le partage « tout ou rien » via modules.is_public + slug
-- devinable par un vrai rail : token non devinable, révocation, expiration, et
-- un champ `kind`/`scope` extensible pour les prochains niveaux du modèle
-- (portail client scopé à un chantier, formulaire public à écriture bornée).
--
-- Sécurité :
--   • RLS activée. Gestion (créer / lister / révoquer) réservée aux MEMBRES du
--     tenant via public.my_tenant_role(tenant_id) — même prédicat que agent_rules.
--   • AUCUNE policy anon : la résolution publique du token passe par le
--     service_role (route /partage/[token]). Le token EST la capacité — même
--     modèle de sécurité que demo_bookings (024).
--   • On ne SUPPRIME jamais un lien : on pose revoked_at (piste d'audit).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.app_share_links (
  id          uuid        primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),

  tenant_id   uuid not null references public.tenants(id)  on delete cascade,
  module_id   uuid not null references public.modules(id)  on delete cascade,

  -- Secret dans l'URL : /partage/<token>. Non devinable.
  token       uuid not null default gen_random_uuid(),

  -- Niveau de partage. Slice 1 = 'preview' (lecture seule + badge Biltia).
  -- La contrainte s'élargira aux prochains niveaux ('client', 'form').
  kind        text not null default 'preview' check (kind in ('preview')),

  -- Portée future (client/form) : { record_id?, view?, ... }. Vide en preview.
  scope       jsonb not null default '{}'::jsonb,

  created_by  uuid references auth.users(id) on delete set null,
  label       text,

  expires_at  timestamptz,  -- null = pas d'expiration
  revoked_at  timestamptz   -- non null = révoqué (jamais supprimé : audit)
);

create unique index if not exists app_share_links_token_idx  on public.app_share_links (token);
create index        if not exists app_share_links_module_idx on public.app_share_links (module_id);
create index        if not exists app_share_links_tenant_idx on public.app_share_links (tenant_id);

alter table public.app_share_links enable row level security;

-- Gestion réservée aux membres du tenant (lecture, création, révocation).
drop policy if exists app_share_links_select on public.app_share_links;
create policy app_share_links_select on public.app_share_links
  for select using ( public.my_tenant_role(tenant_id) is not null );

drop policy if exists app_share_links_insert on public.app_share_links;
create policy app_share_links_insert on public.app_share_links
  for insert with check ( public.my_tenant_role(tenant_id) is not null );

drop policy if exists app_share_links_update on public.app_share_links;
create policy app_share_links_update on public.app_share_links
  for update
  using      ( public.my_tenant_role(tenant_id) is not null )
  with check ( public.my_tenant_role(tenant_id) is not null );

-- Pas de policy DELETE : on révoque (revoked_at), on ne supprime pas.
