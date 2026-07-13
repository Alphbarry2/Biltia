-- ─────────────────────────────────────────────────────────────────────────────
-- 041 — Outbox GÉNÉRALISÉ : items d'ACTION de workflow (Phase 6b.2)
--
-- agent_outbox (035) ne portait que des RELANCES email (to_email/subject/body).
-- Le runner V2 prépare aussi des ACTIONS sensibles en attente de validation
-- (ex : « ouvrir le chantier d'un devis accepté »). On généralise SANS casser
-- l'existant :
--   • kind reste text libre → 'relance' (email) coexiste avec 'workflow_step'.
--   • on AJOUTE operation / params / record_ref (nullable) pour rejouer l'action
--     à la validation via lib/workspace-transforms (runWorkspaceTransform).
--   • on RELÂCHE le NOT NULL de to_email/subject/body : un item d'action n'a pas
--     d'email. Les items 'relance' existants les renseignent toujours → inchangés.
--
-- ADDITIVE / NON BLOQUANTE : les colonnes existantes ne bougent pas, les lignes
-- existantes restent valides, la route /api/agents/outbox garde son chemin email
-- intact (le chemin 'workflow_step' est un branchement additif). L'écriture d'un
-- item workflow_step côté runner est best-effort (guarded) : tant que 041 n'est
-- pas appliquée, l'insert échoue et l'opération retombe en 'deferred'.
--
-- RLS : héritée d'agent_outbox (035). status garde son CHECK (pending|sent|discarded).
-- Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.agent_outbox
  add column if not exists operation  text,
  add column if not exists params     jsonb not null default '{}'::jsonb,
  add column if not exists record_ref jsonb;

do $$ begin
  alter table public.agent_outbox alter column to_email drop not null;
  alter table public.agent_outbox alter column subject  drop not null;
  alter table public.agent_outbox alter column body     drop not null;
exception when others then null; end $$;
