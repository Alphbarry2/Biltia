-- ─────────────────────────────────────────────────────────────────────────────
-- 009_user_preferences.sql
-- Préférences IA par utilisateur (ton, confirmation, PDF systématique, app-first,
-- notifications IA). Additif et sûr : une seule colonne jsonb sur `profiles`.
--
-- Sécurité : `profiles` est déjà protégée par RLS (l'utilisateur ne lit/écrit que
-- sa propre ligne). Aucune nouvelle politique nécessaire — la colonne hérite de
-- la protection de la ligne. Consommée par :
--   - app/(app)/settings/page.tsx  (lecture/écriture, section « IA »)
--   - app/api/generate/route.ts    (injectée dans le prompt système, best-effort)
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists preferences jsonb not null default '{}'::jsonb;

comment on column public.profiles.preferences is
  'Préférences IA de l''utilisateur (always_confirm, always_pdf, prefer_app, ai_notifications, tone). Voir lib/user-preferences.ts.';
