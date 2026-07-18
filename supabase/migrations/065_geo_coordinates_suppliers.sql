-- ─────────────────────────────────────────────────────────────────────────────
-- 065 — Coordonnées géographiques sur les fournisseurs / sous-traitants.
--
-- Complète 064 : le champ « Adresse » est désormais géolocalisé PARTOUT dans le
-- workspace (dont les fournisseurs). Colonnes optionnelles, héritent des RLS de
-- la table. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.suppliers add column if not exists latitude  double precision;
alter table public.suppliers add column if not exists longitude double precision;

comment on column public.suppliers.latitude  is 'Latitude WGS84 (géocodage de l''adresse). NULL si non géolocalisé.';
comment on column public.suppliers.longitude is 'Longitude WGS84 (géocodage de l''adresse).';
