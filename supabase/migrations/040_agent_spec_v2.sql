-- ─────────────────────────────────────────────────────────────────────────────
-- 040 — MODÈLE D'AGENT V2 : colonne canonique `spec` (Phase 2a)
--
-- Le moteur d'agents évolue vers un modèle unifié (lib/agent-model.ts : trigger,
-- scope, watcher, conditions, actions[], recipients[], approval, escalation,
-- retry, execution, metadata). Les colonnes legacy (`action` singulier,
-- `schedule`, `trigger`, `trigger_type`) NE CHANGENT PAS et restent la source
-- exécutée ; on AJOUTE une colonne `spec` qui portera la représentation V2
-- canonique — d'abord une simple élévation des colonnes legacy (Phase 2a),
-- puis, quand le parseur produira des règles plus riches (multi-actions,
-- conditions), la forme complète que l'exécuteur consommera (Phase 2a.3).
--
-- ADDITIVE et NON BLOQUANTE :
--   • `default '{}'` → les règles existantes reçoivent un spec vide ; le code lit
--     alors la règle via normalizeRule() qui RELÈVE les colonnes legacy. Aucune
--     règle ne change de comportement.
--   • L'écriture du spec côté application est BEST-EFFORT (guarded) : tant que
--     cette migration n'est pas appliquée, l'update échoue silencieusement et la
--     création d'agent fonctionne normalement (chemin legacy). Zéro couplage de
--     déploiement.
--
-- RLS : `spec` hérite des policies d'agent_rules (020) — rien à ajouter.
-- Idempotent (IF NOT EXISTS).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.agent_rules
  add column if not exists spec jsonb not null default '{}'::jsonb;
