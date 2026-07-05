-- ─────────────────────────────────────────────────────────────────────────────
-- 017 — Multi-entreprises : création d'un nouveau workspace par l'utilisateur.
--
-- Un workspace = une entreprise ; chaque espace porte son propre abonnement
-- (le nouvel espace naît en Free). Aucune policy INSERT sur tenants — voulu :
-- la création passe par cette RPC SECURITY DEFINER, même recette que le
-- trigger d'inscription (handle_new_user) : tenant (slug = id) + membership
-- owner accepté + trace dans activity_logs.
--
-- Sécurité :
--   • auth.uid() obligatoire (pas d'anon), grant à authenticated uniquement.
--   • Nom borné 2–60 caractères (espaces normalisés).
--   • Garde-fou anti-abus : 10 espaces possédés maximum par utilisateur.
--   • search_path fixé (même durcissement que les RPC existantes, cf. 003).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.create_workspace(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name      text;
  v_tenant_id uuid;
  v_owned     int;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  v_name := regexp_replace(coalesce(trim(p_name), ''), '\s+', ' ', 'g');
  if length(v_name) < 2 or length(v_name) > 60 then
    raise exception 'invalid workspace name';
  end if;

  select count(*) into v_owned
  from public.tenant_members
  where user_id = auth.uid() and role = 'owner';
  if v_owned >= 10 then
    raise exception 'workspace limit reached';
  end if;

  v_tenant_id := gen_random_uuid();

  insert into public.tenants (id, name, slug)
  values (v_tenant_id, v_name, v_tenant_id::text);

  insert into public.tenant_members (tenant_id, user_id, role, accepted_at)
  values (v_tenant_id, auth.uid(), 'owner', now());

  -- Journal d'activité best-effort : ne bloque jamais la création.
  begin
    insert into public.activity_logs (tenant_id, user_id, action, entity_type, entity_id, description)
    values (v_tenant_id, auth.uid(), 'create', 'workspace', v_tenant_id,
            'Espace « ' || v_name || ' » créé');
  exception when others then
    null;
  end;

  return v_tenant_id;
end;
$$;

revoke execute on function public.create_workspace(text) from public, anon;
grant execute on function public.create_workspace(text) to authenticated;
