-- ============================================================
-- BILTIA — Migration 023 : INVITÉ = pas de crédits ni d'espace perso
-- ============================================================
-- Un utilisateur INVITÉ (rejoint une équipe existante via /api/team) ne doit PAS
-- recevoir les 300 crédits offerts ni un espace personnel : il rejoint le tenant
-- de celui qui l'invite, avec le rôle attribué. On le détecte via
-- raw_user_meta_data.invited_tenant_id (posé par inviteUserByEmail dans /api/team).
-- Le profil est créé rattaché à l'équipe invitée, avec preferences.onboarded=true
-- (il saute l'onboarding entreprise). La membership est posée par /api/team.
-- ============================================================
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

  insert into public.user_credits (user_id, balance)
  values (new.id, 300)
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
