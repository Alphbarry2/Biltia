-- ─────────────────────────────────────────────────────────────────────────────
-- 018 — Réduction de la surface RPC exposée (SECURITY DEFINER)
--
-- Appliqué en prod le 2026-07-04 (projet Biltia docqrznkbtyctjqpvifu).
--
-- Retire de l'API REST exposée les fonctions SECURITY DEFINER qui n'ont AUCUN
-- appelant applicatif (le journal passe par des INSERT directs, gated RLS) et la
-- fonction de trigger (jamais destinée à /rest/v1/rpc). Défense en profondeur :
-- même durcies par contrôle d'appartenance (cf. 017), ces RPC n'ont pas à être
-- atteignables depuis le navigateur.
--
-- CONSERVÉES executable par `authenticated` (usage applicatif légitime) :
--   • deduct_credits           — débit du propre solde (reconcileCredits)
--   • admin_analytics          — console /admin, gardée par email fondateur
--   • get_workspace_context    — copilote, contrôle d'appartenance interne
--   • my_tenant_role / is_app_member — utilisées DANS les policies RLS (obligatoire)
--   • match_knowledge          — RAG (SECURITY INVOKER, borné par RLS)
-- ─────────────────────────────────────────────────────────────────────────────

revoke execute on function public.log_activity(uuid, text, uuid, text, text, jsonb) from anon, authenticated;
revoke execute on function public.log_audit(uuid, uuid, public.audit_action, text, uuid, jsonb, jsonb, inet, text) from anon, authenticated;
revoke execute on function public.tenant_members_guard() from anon, authenticated, public;
