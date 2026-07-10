-- ─────────────────────────────────────────────────────────────────────────────
-- 030 — Liens de partage : niveau « client » (portail scopé à UN chantier).
--
-- Slice 2 du modèle « Partager » ([[project_share_publish_model]]). On élargit
-- app_share_links.kind à 'client' : un lien LECTURE SEULE borné à un seul
-- enregistrement racine (scope = { entity:'chantiers', record_id }). La lecture
-- passe par un endpoint public tokenisé (/api/share/data) qui applique le scope
-- côté serveur (zero-trust) — le token ne donne JAMAIS accès au workspace entier.
--
-- Rien à changer côté RLS : la table reste deny-all pour anon (résolution
-- service_role), gestion réservée aux membres (migration 029). Seule la
-- contrainte CHECK de `kind` évolue.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.app_share_links
  drop constraint if exists app_share_links_kind_check;

alter table public.app_share_links
  add constraint app_share_links_kind_check
  check (kind in ('preview', 'client'));
