-- ─────────────────────────────────────────────────────────────────────────────
-- 060 — Rattrapages advisor Supabase (linter du 2026-07-17)
--
-- Deux fonctions ont échappé au traitement standard appliqué ailleurs :
--
--   1. touch_demo_bookings_updated_at (024) — trigger créé sans
--      `set search_path`, contrairement à tous les autres triggers durcis
--      dans 003_security_hardening. Advisor 0011.
--
--   2. factures_guard_devis_total (051) — fonction de TRIGGER (retourne
--      `trigger`, jamais destinée à /rest/v1/rpc) créée sans révoquer les
--      grants EXECUTE par défaut sur anon/authenticated, contrairement à
--      tenant_members_guard (018) qui a reçu exactement ce traitement.
--      Non exploitable en pratique (Postgres refuse d'appeler une fonction
--      trigger hors trigger), mais on ferme la surface par cohérence avec
--      la politique de 018.
-- ─────────────────────────────────────────────────────────────────────────────

alter function public.touch_demo_bookings_updated_at() set search_path = public, pg_temp;

revoke execute on function public.factures_guard_devis_total() from public, anon, authenticated;
