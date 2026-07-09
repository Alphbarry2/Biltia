-- ─────────────────────────────────────────────────────────────────────────────
-- 026 — GARDE-FOUS DE COÛT DES AGENTS (budget par agent)
--
-- Un agent-événement agit « dès qu'une fiche remplit la condition ». Sans borne,
-- le coût = (coût par passage) × (nb de fiches) × (fréquence) : un backlog de
-- fiches peut drainer les crédits. On ajoute DEUX plafonds par agent, exprimés
-- en crédits (la monnaie déjà journalisée dans agent_runs.credits_used) :
--
--   • monthly_credit_budget — plafond MENSUEL. Atteint → l'agent se met en PAUSE
--     (status blocked) et prévient le patron. Reprise le mois suivant ou après
--     relèvement du plafond. Filet de sécurité : coût mensuel BORNÉ et prévisible.
--   • daily_credit_budget   — plafond QUOTIDIEN. Atteint → les fiches restantes
--     sont REPORTÉES au lendemain (pas de pause). Lisse les pics (évite qu'un gros
--     backlog parte d'un coup).
--
-- 0 = illimité (le code traite <= 0 comme « pas de plafond »).
-- Le calcul de la dépense se fait par somme de agent_runs.credits_used sur la
-- période → index dédié (rule_id, created_at).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.agent_rules
  add column if not exists monthly_credit_budget integer not null default 600,
  add column if not exists daily_credit_budget   integer not null default 60;

-- Somme rapide de la dépense d'un agent sur une fenêtre temporelle.
create index if not exists agent_runs_rule_created_idx
  on public.agent_runs (rule_id, created_at desc);
