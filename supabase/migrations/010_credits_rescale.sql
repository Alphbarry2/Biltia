-- ============================================================
-- 010 — Rescale des crédits (×10) + profil au signup + préférences
--
-- ✅ APPLIQUÉE À LA PROD le 2026-07-03 (migration
--    `credits_rescale_profiles_signup_preferences` via MCP).
--    Ce fichier est le miroir exact de ce qui a été exécuté.
--
-- Contenu :
--   1. profiles.preferences (jsonb) — consolidation de 009.
--   2. Solde d'inscription 50 → 300 (échelle ×10, couvre 1 app).
--   3. handle_new_user : crédits 300 + tenant nommé d'après l'entreprise
--      + création du PROFIL (full_name, company_name, sector) — auparavant
--      les métadonnées d'inscription étaient perdues.
--   4. Colonne ai_usage.credits (reporting du débit réel).
--   5. Rescale ×10 des soldes existants (exécuté UNE fois).
--   6. Backfill des profils manquants.
--   7. Drop de la policy INSERT user_credits (porte d'auto-recharge).
-- ============================================================

-- 1) Préférences IA par utilisateur (jsonb sur profiles) — migration 009.
alter table public.profiles
  add column if not exists preferences jsonb not null default '{}'::jsonb;

comment on column public.profiles.preferences is
  'Préférences IA de l''utilisateur (always_confirm, always_pdf, prefer_app, ai_notifications, tone). Voir lib/user-preferences.ts.';

-- 2) Solde offert à l'inscription : 50 (ancien) → 300 (échelle ×10).
alter table public.user_credits alter column balance set default 300;

-- 3) handle_new_user : crédits 300 + création du profil.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tenant_id uuid;
begin
  -- Crédits Free (miroir de SIGNUP_FREE_CREDITS dans lib/plans.ts)
  insert into public.user_credits (user_id, balance)
  values (new.id, 300)
  on conflict (user_id) do nothing;

  -- Espace personnel (nommé d'après l'entreprise si fournie)
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

  -- Membership propriétaire
  insert into public.tenant_members (tenant_id, user_id, role, accepted_at)
  values (v_tenant_id, new.id, 'owner', now());

  -- Profil : colonnes NOT NULL en prod → jamais de NULL ('' / 'autre' par défaut).
  -- (⚠️ corrigé le 2026-07-03 : nullif(...) passait NULL quand l'entreprise,
  --  champ optionnel, était vide → signup en 500.)
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
$$;

-- 4) Tracer les crédits débités par appel (reporting).
alter table public.ai_usage
  add column if not exists credits integer not null default 0;

-- 5) Rescale ×10 des soldes EXISTANTS (exécuté une seule fois en prod).
update public.user_credits set balance = balance * 10, updated_at = now();

-- 6) Backfill des profils manquants pour les comptes existants.
insert into public.profiles (user_id, full_name, company_name, sector)
select
  u.id,
  nullif(u.raw_user_meta_data->>'full_name', ''),
  nullif(u.raw_user_meta_data->>'company_name', ''),
  nullif(u.raw_user_meta_data->>'sector', '')
from auth.users u
left join public.profiles p on p.user_id = u.id
where p.user_id is null;

-- 7) Sécurité : le solde ne se modifie QUE via les RPC (deduct/refund) ou le
--    trigger d'inscription. La policy INSERT côté client était une porte
--    d'auto-recharge théorique → supprimée.
drop policy if exists "Users can insert own credits" on public.user_credits;
