-- ─────────────────────────────────────────────────────────────────────────────
-- 043 — APP SPEC V1 : contrat structuré à côté du HTML (Phase 1).
--
-- Ajoute une colonne NULLABLE `app_spec` sur `modules`. Le HTML reste la source
-- du rendu (`html_content`) ; `app_spec` porte le contrat (entités branchées,
-- vues, actions, permissions, automatisations suggérées, agents attachés).
--
-- Rétrocompat TOTALE : `app_spec` est null pour toutes les apps existantes → elles
-- continuent de fonctionner. La spec est dérivée à la première sauvegarde via le
-- chemin autoritaire (/api/modules/save). Additif, réversible (drop column).
--
-- ⚠️ NON DÉPLOYÉE tant que non validée. Rappel prod-drift : `db pull` avant DDL.
-- Le code Phase 1 écrit `app_spec` en BEST-EFFORT (update séparé toléré) : tant
-- que cette colonne n'existe pas en prod, l'écriture est ignorée sans casser la
-- sauvegarde. La fonctionnalité s'active automatiquement une fois la colonne créée.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.modules
  add column if not exists app_spec jsonb;

comment on column public.modules.app_spec is
  'Contrat structuré AppSpecV1 (lib/app-spec.ts). Null = app legacy sans spec.';
