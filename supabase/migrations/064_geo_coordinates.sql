-- ─────────────────────────────────────────────────────────────────────────────
-- 064 — Coordonnées géographiques (géocodage d'adresse).
--
-- Permet de poser un point sur la carte : l'autocomplétion d'adresse (BAN / Photon)
-- renseigne latitude/longitude à la saisie d'un chantier, d'un site ou d'un client.
-- Colonnes optionnelles (NULL = adresse non géolocalisée). Aucune politique RLS à
-- ajouter : les nouvelles colonnes héritent des policies existantes de chaque table.
--
-- Idempotent (add column if not exists) — sûr à rejouer.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.chantiers add column if not exists latitude  double precision;
alter table public.chantiers add column if not exists longitude double precision;

alter table public.sites     add column if not exists latitude  double precision;
alter table public.sites     add column if not exists longitude double precision;

alter table public.clients   add column if not exists latitude  double precision;
alter table public.clients   add column if not exists longitude double precision;

comment on column public.chantiers.latitude  is 'Latitude WGS84 (géocodage de l''adresse). NULL si non géolocalisé.';
comment on column public.chantiers.longitude is 'Longitude WGS84 (géocodage de l''adresse).';
comment on column public.sites.latitude      is 'Latitude WGS84 (géocodage de l''adresse). NULL si non géolocalisé.';
comment on column public.sites.longitude     is 'Longitude WGS84 (géocodage de l''adresse).';
comment on column public.clients.latitude    is 'Latitude WGS84 (géocodage de l''adresse). NULL si non géolocalisé.';
comment on column public.clients.longitude   is 'Longitude WGS84 (géocodage de l''adresse).';
