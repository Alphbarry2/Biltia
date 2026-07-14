-- ============================================================
-- BILTIA — Migration 053 : solde d'inscription 300 → 400 crédits
-- ============================================================
-- POURQUOI (décision tarifaire user, 2026-07-14) :
--
-- Le prix d'une application sur mesure passe de 250 à 300 crédits (lib/plans.ts →
-- ACTION_CREDITS.application). Le prix suit désormais la VALEUR, plus le coût du
-- modèle : à 98-99 % de marge, le coût ne peut plus arbitrer quoi que ce soit.
-- L'app est l'HAMEÇON (bon marché, elle amène le workspace) ; l'AGENT est le moteur
-- (40 cr par passage rédigé, soit 880 cr/mois — le seul poste qui revient tous les mois).
--
-- Conséquence sur l'essai gratuit : le plan Free promet « Créez votre première
-- application », et le hold est prélevé D'AVANCE. Avec exactement 300 crédits offerts
-- pour une app à 300, l'inscrit consomme TOUT son solde sur sa première app et se
-- retrouve à zéro — il ne peut même plus poser une question sur ce qu'il vient de
-- créer. Il faut une marge après la première app, sinon l'essai s'arrête net.
--
-- 400 = 1 application (300) + une trentaine de questions ensuite.
--
-- ⚠️ MIROIR OBLIGATOIRE de SIGNUP_FREE_CREDITS (lib/plans.ts). Les deux doivent
--    bouger ENSEMBLE, sans quoi l'inscription et l'affichage se contredisent.
--
-- Rappel (migration 023, préservé tel quel ci-dessous) : un utilisateur INVITÉ ne
-- reçoit ni crédits ni espace personnel — il rejoint le tenant de celui qui l'invite.
-- ============================================================

-- 1) Défaut de la colonne (inscriptions futures qui passeraient hors du trigger).
alter table public.user_credits alter column balance set default 400;

-- 2) handle_new_user : recopié à l'identique de la définition en production
--    (migration 023), SEUL le montant change. Ne rien retirer d'autre.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tenant_id uuid;
  v_invited   uuid := nullif(new.raw_user_meta_data->>'invited_tenant_id', '')::uuid;
begin
  if v_invited is not null then
    -- INVITÉ : profil rattaché à l'équipe invitée, onboarding entreprise sauté.
    -- La membership (avec rôle/invited_by) est posée par /api/team.
    insert into public.profiles (user_id, full_name, company_name, sector, tenant_id, preferences)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'full_name', ''),
      '',
      'autre',
      v_invited,
      jsonb_build_object('onboarded', true, 'invited', true)
    )
    on conflict (user_id) do nothing;
    return new;
  end if;

  -- NOUVEAU COMPTE STANDARD : 400 crédits (miroir de SIGNUP_FREE_CREDITS) + espace perso.
  insert into public.user_credits (user_id, balance)
  values (new.id, 400)
  on conflict (user_id) do nothing;

  v_tenant_id := gen_random_uuid();
  insert into public.tenants (id, name, slug)
  values (
    v_tenant_id,
    coalesce(
      nullif(new.raw_user_meta_data->>'company_name', ''),
      nullif(new.raw_user_meta_data->>'full_name', ''),
      'Mon espace'
    ),
    v_tenant_id::text
  );

  insert into public.tenant_members (tenant_id, user_id, role, accepted_at)
  values (v_tenant_id, new.id, 'owner', now());

  insert into public.profiles (user_id, full_name, company_name, sector, tenant_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'company_name', ''),
    coalesce(nullif(new.raw_user_meta_data->>'sector', ''), 'autre'),
    v_tenant_id
  )
  on conflict (user_id) do nothing;

  return new;
end;
$function$;

-- 3) Rattrapage des inscrits qui n'ont RIEN dépensé.
--    Condition volontairement stricte (balance = 300 EXACTEMENT, soit l'ancien
--    défaut intact) : on ne recrédite que ceux qui se sont inscrits sous l'ancienne
--    promesse sans jamais consommer. Quelqu'un qui a déjà dépensé a bénéficié des
--    anciens tarifs (app à 250) — il n'y a rien à réparer chez lui.
update public.user_credits
   set balance = 400
 where balance = 300;
