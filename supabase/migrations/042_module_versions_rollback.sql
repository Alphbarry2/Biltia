-- ─────────────────────────────────────────────────────────────────────────────
-- 042 — VERSIONS & ROLLBACK des applications (Phase 0).
--
-- La table `module_versions` (créée en 004) a RLS ACTIVÉE mais AUCUNE policy →
-- personne ne peut la lire/écrire via une session. Le code Phase 0 y accède côté
-- serveur via le service_role (tenant vérifié en amont), donc cette migration
-- n'est PAS nécessaire au fonctionnement immédiat. Elle ajoute néanmoins les
-- policies de LECTURE (défense en profondeur + future consultation client de
-- l'historique) et une policy d'écriture restreinte, cohérentes avec le reste.
--
-- ⚠️ NON DÉPLOYÉE tant que non validée. Rappel prod-drift : faire `db pull` avant
-- tout DDL (les policies existantes en prod peuvent différer du dépôt). Aucune
-- donnée n'est touchée — migration purement additive et réversible (drop policies).
-- ─────────────────────────────────────────────────────────────────────────────

-- Membre accepté du tenant → peut LIRE l'historique de ses applications.
drop policy if exists "module_versions_select" on public.module_versions;
create policy "module_versions_select" on public.module_versions
  for select using (
    exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id = module_versions.tenant_id
        and tm.user_id = auth.uid()
        and tm.accepted_at is not null
    )
  );

-- Écriture réservée aux rôles qui peuvent créer/modifier une app
-- (owner/admin/manager/member) — aligné sur la capacité `ai.create`. En pratique
-- le code écrit via service_role ; cette policy est le filet si l'écriture passe
-- un jour par une session.
drop policy if exists "module_versions_insert" on public.module_versions;
create policy "module_versions_insert" on public.module_versions
  for insert with check (
    exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id = module_versions.tenant_id
        and tm.user_id = auth.uid()
        and tm.accepted_at is not null
        and tm.role in ('owner', 'admin', 'manager', 'member')
    )
  );

-- Pas de policy UPDATE/DELETE : une version est IMMUABLE (historique). La purge
-- éventuelle se fera via service_role/administration, jamais depuis une session.

create index if not exists module_versions_tenant_module_idx
  on public.module_versions (tenant_id, module_id, version desc);
