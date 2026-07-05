-- ─────────────────────────────────────────────────────────────────────────────
-- 017 — DURCISSEMENT SÉCURITÉ : anti-escalade de privilèges + intégrité
--
-- Appliqué en prod le 2026-07-04 (projet Biltia docqrznkbtyctjqpvifu).
--
-- A. tenant_members : un membre pouvait s'auto-promouvoir 'owner' (RLS UPDATE
--    trop permissive : USING user_id = auth.uid()). → verrouillé owner/admin +
--    trigger anti-escalade (immutabilité du tenant, pas d'auto-promotion,
--    seul un owner peut créer un owner).
-- B. subscriptions : un owner/admin pouvait éditer plan/status et s'octroyer Pro
--    gratuitement (les entitlements lisent ces colonnes). → écriture réservée au
--    service_role (webhook Stripe). Lecture conservée.
-- C. log_activity / log_audit (SECURITY DEFINER, exécutables par authenticated,
--    tenant_id arbitraire, sans contrôle d'appartenance) : forge du journal
--    d'audit possible dans n'importe quel tenant. → contrôle d'appartenance ajouté.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── A. tenant_members : anti-escalade ───────────────────────────────────────
drop policy if exists tenant_members_update on public.tenant_members;

-- Seuls owner/admin du tenant peuvent modifier une adhésion (gestion des rôles).
create policy tenant_members_update on public.tenant_members
  for update
  using (public.my_tenant_role(tenant_id) in ('owner'::member_role, 'admin'::member_role))
  with check (public.my_tenant_role(tenant_id) in ('owner'::member_role, 'admin'::member_role));

-- Garde-fou invariant, indépendant du chemin d'accès (RLS ou RPC). UPDATE only :
-- les INSERT de signup (handle_new_user) et d'équipe (service_role) ne sont pas
-- touchés. Les chemins serveur de confiance (service_role, triggers DEFINER) ont
-- auth.uid() = null → laissés passer.
create or replace function public.tenant_members_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role member_role;
begin
  if v_actor is null then
    return new;  -- service_role / contexte serveur de confiance
  end if;

  select role into v_actor_role
  from public.tenant_members
  where tenant_id = new.tenant_id
    and user_id = v_actor
    and accepted_at is not null
  limit 1;

  -- Le tenant d'une adhésion est immuable par tout chemin utilisateur.
  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'Modification du tenant interdite.' using errcode = '42501';
  end if;

  -- Un membre ne peut JAMAIS élever son propre rôle.
  if new.user_id = v_actor and new.role is distinct from old.role then
    raise exception 'Auto-modification de rôle interdite.' using errcode = '42501';
  end if;

  -- Seul un owner peut nommer un owner (un admin ne peut pas fabriquer d'owner).
  if new.role = 'owner'::member_role
     and old.role <> 'owner'::member_role
     and coalesce(v_actor_role::text, '') <> 'owner' then
    raise exception 'Seul un proprietaire peut nommer un proprietaire.' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists tenant_members_guard_update on public.tenant_members;
create trigger tenant_members_guard_update
  before update on public.tenant_members
  for each row execute function public.tenant_members_guard();

-- ── B. subscriptions : écriture réservée au service_role ─────────────────────
-- Retrait de la policy UPDATE (owner/admin). Sans policy d'écriture, le rôle
-- authenticated ne peut plus muter subscriptions ; seul le service_role (webhook
-- Stripe, bypass RLS) et on_tenant_created (SECURITY DEFINER) y écrivent.
drop policy if exists subscriptions_update on public.subscriptions;

-- ── C. log_activity / log_audit : contrôle d'appartenance ────────────────────
create or replace function public.log_activity(
  p_tenant_id uuid, p_entity_type text, p_entity_id uuid,
  p_action text, p_description text default null, p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  -- Un appelant authentifié ne peut journaliser que dans SON tenant.
  if auth.uid() is not null and public.my_tenant_role(p_tenant_id) is null then
    raise exception 'Acces refuse au tenant.' using errcode = '42501';
  end if;

  insert into public.activity_logs (tenant_id, user_id, entity_type, entity_id, action, description, metadata)
  values (p_tenant_id, auth.uid(), p_entity_type, p_entity_id, p_action, p_description, p_metadata);
end;
$$;

create or replace function public.log_audit(
  p_tenant_id uuid, p_app_id uuid, p_action audit_action, p_resource text,
  p_resource_id uuid default null, p_old_data jsonb default null, p_new_data jsonb default null,
  p_ip_address inet default null, p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentification requise.' using errcode = '42501';
  end if;

  -- Empêche la forge d'entrées d'audit dans un tenant dont on n'est pas membre.
  if public.my_tenant_role(p_tenant_id) is null then
    raise exception 'Acces refuse au tenant.' using errcode = '42501';
  end if;

  insert into public.audit_logs (
    tenant_id, app_id, user_id, action,
    resource, resource_id, old_data, new_data,
    ip_address, user_agent
  ) values (
    p_tenant_id, p_app_id, auth.uid(), p_action,
    p_resource, p_resource_id, p_old_data, p_new_data,
    p_ip_address, p_user_agent
  );
end;
$$;
