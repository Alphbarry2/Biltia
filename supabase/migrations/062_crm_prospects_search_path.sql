-- ─────────────────────────────────────────────────────────────────────────────
-- 062 — touch_crm_prospects_updated_at (059) a le même trou que 024 :
-- créée sans `set search_path`. Advisor 0011. Même correctif que 060.
-- ─────────────────────────────────────────────────────────────────────────────

alter function public.touch_crm_prospects_updated_at() set search_path = public, pg_temp;
