-- ─────────────────────────────────────────────────────────────────────────────
-- 050 — LE RLS APPREND LES RÔLES (escalade de privilège : rôle « Lecteur »)
--
-- LE PROBLÈME (constaté en production, pas théorique).
-- La matrice lib/permissions.ts est appliquée dans les routes API, mais QUATRE
-- tables avaient un RLS qui ne connaissait que le TENANT, jamais le RÔLE :
--
--   agent_rules      insert/update/delete : my_tenant_role(...) IS NOT NULL
--   agent_outbox     update               : my_tenant_role(...) IS NOT NULL
--   app_records      insert/update/delete : simple appartenance au tenant
--   app_share_links  insert/update        : my_tenant_role(...) IS NOT NULL
--
-- Or la clé anon Supabase est publiquement présente dans le bundle navigateur :
-- n'importe quel membre connecté peut parler à PostgREST EN DIRECT et ne jamais
-- passer par nos routes. Les contrôles `can(role, ...)` des routes ne protègent
-- donc que ceux qui veulent bien les emprunter.
--
-- Concrètement, un rôle « Lecteur » — vendu comme « consulte et pose des
-- questions, ne peut rien créer ni modifier » — pouvait :
--   • CRÉER un agent autonome que le cron exécuterait ensuite en service_role
--     (donc écrire aux clients de l'entreprise en son nom) ;
--   • SUPPRIMER tous les agents de l'entreprise ;
--   • ÉCRIRE et SUPPRIMER les données de toutes les apps (app_records) ;
--   • RÉVOQUER le portail client d'un chantier ;
--   • JETER les relances en attente dans l'outbox.
-- Le gel d'abonnement (lecture seule) se contournait par le même chemin.
--
-- LE PRINCIPE. Le RLS est le DERNIER rempart, pas un doublon décoratif : il doit
-- encoder la même matrice que lib/permissions.ts. Les tables métier (clients,
-- devis, factures…) le font déjà correctement depuis 018/037/039 — on aligne
-- simplement les quatre retardataires sur ce modèle.
--
-- BONUS — un bug qui coûtait de l'argent aux utilisateurs.
-- `modules` : apps_insert/apps_update excluaient `member`, alors que la matrice
-- donne `ai.create` à member ET que le libellé du rôle promet « génère apps et
-- documents ». Un employé lançait donc une génération (crédits tenus, puis
-- débités au coût réel par /api/generate), et la base REFUSAIT ensuite
-- d'enregistrer l'app : il payait et repartait les mains vides. Le RLS était le
-- fautif, pas la matrice → on ajoute `member`.
--
-- Idempotente : chaque policy est droppée puis recréée.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── agent_rules — capacité « agents.manage » = owner / admin / manager ────────
-- Aligne la base sur ce que /api/agents vérifie déjà (can(role,"agents.manage")).
drop policy if exists agent_rules_insert on public.agent_rules;
create policy agent_rules_insert on public.agent_rules
  for insert with check (
    public.my_tenant_role(tenant_id) = any (array['owner','admin','manager']::member_role[])
  );

drop policy if exists agent_rules_update on public.agent_rules;
create policy agent_rules_update on public.agent_rules
  for update using (
    public.my_tenant_role(tenant_id) = any (array['owner','admin','manager']::member_role[])
  );

drop policy if exists agent_rules_delete on public.agent_rules;
create policy agent_rules_delete on public.agent_rules
  for delete using (
    public.my_tenant_role(tenant_id) = any (array['owner','admin','manager']::member_role[])
  );

-- SELECT inchangé : tout membre (y compris viewer) peut CONSULTER les agents.

-- ── agent_outbox — valider/jeter une relance = « agents.manage » ──────────────
-- Un viewer pouvait basculer une relance en `discarded` : sabotage silencieux.
drop policy if exists agent_outbox_update on public.agent_outbox;
create policy agent_outbox_update on public.agent_outbox
  for update using (
    public.my_tenant_role(tenant_id) = any (array['owner','admin','manager']::member_role[])
  );

-- ── app_records — les données des apps suivent la MÊME règle que les données ──
-- métier : écriture = data.write, suppression = data.delete. C'était le second
-- chemin de /api/data (JSONB), et le seul qui n'était pas gardé en base.
drop policy if exists app_records_insert on public.app_records;
create policy app_records_insert on public.app_records
  for insert with check (
    public.my_tenant_role(tenant_id) = any (array['owner','admin','manager','member']::member_role[])
  );

drop policy if exists app_records_update on public.app_records;
create policy app_records_update on public.app_records
  for update using (
    public.my_tenant_role(tenant_id) = any (array['owner','admin','manager','member']::member_role[])
  );

drop policy if exists app_records_delete on public.app_records;
create policy app_records_delete on public.app_records
  for delete using (
    public.my_tenant_role(tenant_id) = any (array['owner','admin']::member_role[])
  );

-- SELECT inchangé : lecture ouverte à tout membre accepté (data.read).

-- ── app_share_links — publier / révoquer un lien = « ai.create » ──────────────
-- On conserve la garde de la migration 032 (le module DOIT appartenir au tenant
-- du lien) : elle défend contre une ligne forgée pointant vers le module privé
-- d'un autre tenant. On y AJOUTE le rôle.
drop policy if exists app_share_links_insert on public.app_share_links;
create policy app_share_links_insert on public.app_share_links
  for insert with check (
    public.my_tenant_role(tenant_id) = any (array['owner','admin','manager','member']::member_role[])
    and exists (
      select 1 from public.modules m
      where m.id = app_share_links.module_id
        and m.tenant_id = app_share_links.tenant_id
    )
  );

drop policy if exists app_share_links_update on public.app_share_links;
create policy app_share_links_update on public.app_share_links
  for update using (
    public.my_tenant_role(tenant_id) = any (array['owner','admin','manager','member']::member_role[])
  );

-- ── modules — un `member` doit pouvoir ENREGISTRER ce qu'il a payé ────────────
-- Sans cela : crédits débités par /api/generate, insert refusé par le RLS.
drop policy if exists apps_insert on public.modules;
create policy apps_insert on public.modules
  for insert with check (
    public.my_tenant_role(tenant_id) = any (array['owner','admin','manager','member']::member_role[])
  );

drop policy if exists apps_update on public.modules;
create policy apps_update on public.modules
  for update using (
    public.my_tenant_role(tenant_id) = any (array['owner','admin','manager','member']::member_role[])
  );

-- apps_delete (owner/admin) et modules_select inchangés.
