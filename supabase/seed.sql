-- ─────────────────────────────────────────────────────────────────────────────
-- SEED D'INTÉGRATION — données FICTIVES uniquement (préfixe BILTIA_TEST_).
-- Appliqué par `supabase db reset` / `supabase start` sur la base ÉPHÉMÈRE du
-- runner. AUCUNE donnée réelle, aucune imitation de production.
--
-- Un insert dans auth.users déclenche public.handle_new_user() qui crée
-- automatiquement un tenant (nom = full_name) + un owner membership. On exploite
-- ce comportement, puis on capte les ids réels dans un bloc DO.
-- ─────────────────────────────────────────────────────────────────────────────

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'owner-a@biltia.test',     '{"full_name":"BILTIA_TEST_TENANT_A"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'member-a@biltia.test',    '{"full_name":"BILTIA_TEST member A"}'::jsonb),
  ('33333333-3333-3333-3333-333333333333', 'owner-b@biltia.test',     '{"full_name":"BILTIA_TEST_TENANT_B"}'::jsonb),
  ('44444444-4444-4444-4444-444444444444', 'owner-empty@biltia.test', '{"full_name":"BILTIA_TEST_TENANT_EMPTY"}'::jsonb)
on conflict (id) do nothing;

do $$
declare
  ta uuid; tb uuid;
  cli_a uuid; ch_ok uuid; dv_a uuid;
begin
  select tenant_id into ta from public.tenant_members
    where user_id = '11111111-1111-1111-1111-111111111111' and role = 'owner' limit 1;
  select tenant_id into tb from public.tenant_members
    where user_id = '33333333-3333-3333-3333-333333333333' and role = 'owner' limit 1;

  -- Un MEMBRE (non-owner) sur le tenant A (pour les tests RBAC).
  insert into public.tenant_members (tenant_id, user_id, role, accepted_at)
  values (ta, '22222222-2222-2222-2222-222222222222', 'member', now())
  on conflict do nothing;

  -- ── TENANT A : données riches ─────────────────────────────────────────────
  insert into public.clients (tenant_id, nom) values (ta, 'BILTIA_TEST Client Dupont') returning id into cli_a;

  insert into public.employees (tenant_id, nom, prenom, role, statut) values
    (ta, 'BILTIA_TEST Martin', 'Paul', 'chef_equipe', 'actif'),
    (ta, 'BILTIA_TEST Durand', 'Luc',  'macon',       'actif');

  -- Chantier explicitement EN RETARD (statut posé).
  insert into public.chantiers (tenant_id, nom, client_id, statut, date_debut, date_fin_prevue, avancement)
    values (ta, 'BILTIA_TEST Chantier RETARD', cli_a, 'en_retard', '2026-01-01', '2026-06-01', 40);
  -- Chantier dont l'ÉCHÉANCE est DÉPASSÉE mais statut NON confirmé (date fixe passée).
  insert into public.chantiers (tenant_id, nom, client_id, statut, date_debut, date_fin_prevue, avancement)
    values (ta, 'BILTIA_TEST Chantier ECHEANCE', cli_a, 'en_cours', '2026-01-01', '2026-02-01', 60);
  -- Chantier sain (échéance future).
  insert into public.chantiers (tenant_id, nom, client_id, statut, date_debut, date_fin_prevue, avancement)
    values (ta, 'BILTIA_TEST Chantier OK', cli_a, 'en_cours', '2026-06-01', '2026-12-01', 20)
    returning id into ch_ok;

  -- Devis ACCEPTÉ + lignes (source pour l'avenant).
  insert into public.devis (tenant_id, numero, client_id, chantier_id, statut, date_devis, date_validite, montant_ht, montant_tva, montant_ttc)
    values (ta, 'D-2026-001', cli_a, ch_ok, 'accepte', '2026-01-05', '2026-02-05', 10000, 2000, 12000)
    returning id into dv_a;
  insert into public.lignes (tenant_id, devis_id, designation, quantite, unite, prix_unitaire_ht, taux_tva, total_ht, position) values
    (ta, dv_a, 'BILTIA_TEST Gros oeuvre', 1, 'forfait', 8000, 20, 8000, 0),
    (ta, dv_a, 'BILTIA_TEST Finitions',   1, 'forfait', 2000, 20, 2000, 1);

  -- ── TENANT B : données DIFFÉRENTES, aucun lien avec A ─────────────────────
  insert into public.clients (tenant_id, nom) values (tb, 'BILTIA_TEST Client Bernard');
  insert into public.chantiers (tenant_id, nom, statut, date_debut, date_fin_prevue, avancement)
    values (tb, 'BILTIA_TEST Chantier B', 'en_cours', '2026-03-01', '2026-11-01', 10);

  -- ── TENANT vide : rien (owner-empty a un tenant valide sans données) ──────
end $$;
