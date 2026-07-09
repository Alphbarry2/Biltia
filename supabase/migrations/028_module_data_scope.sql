-- ============================================================
-- BILTIA — Migration 028 : PORTÉE DES DONNÉES PAR APP (data_scope)
-- ============================================================
-- Au démarrage d'une app (template OU création IA), l'utilisateur choisit
-- comment elle est alimentée :
--   • Vierge  → l'app démarre VIDE ; ce qu'on y saisit est synchronisé dans le
--               workspace (source unique). En pratique : on n'affiche que les
--               enregistrements créés DEPUIS le démarrage de l'app.
--   • Import  → on charge un CSV/Excel dans le workspace, puis on affiche ces
--               enregistrements (même mécanique « depuis le démarrage »).
--   • Workspace → fenêtre live sur le workspace : TOUT, ou une SÉLECTION.
--
-- On stocke ce choix sur la ligne `modules` (jsonb, nullable = « tout le
-- workspace », comportement historique). Le filtrage de LECTURE est appliqué
-- côté serveur dans /api/data ; les écritures vont TOUJOURS au workspace.
--
-- Formes possibles du jsonb :
--   null                                         → tout le workspace (défaut)
--   { "mode": "all" }                            → tout le workspace
--   { "mode": "fresh", "since": "<iso ts>" }     → vierge / import
--   { "mode": "select", "records": { "chantiers": ["id1","id2"], ... } }
-- ============================================================

alter table public.modules
  add column if not exists data_scope jsonb;

comment on column public.modules.data_scope is
  'Portée des données de l''app (null=tout le workspace). { mode: all|fresh|select, since?, records? }. Filtre de LECTURE seulement — les écritures vont au workspace.';
