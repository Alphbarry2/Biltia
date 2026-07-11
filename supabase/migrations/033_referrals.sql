-- ============================================================
-- BILTIA — Migration 033 : PARRAINAGE (referral) « Spread the love »
-- ============================================================
-- Deux niveaux de récompense (validés) :
--   • Inscription (email confirmé) : FILLEUL +200, PARRAIN 0.
--       → le parrain ne gagne RIEN tant que le filleul ne paie pas : anti faux
--         comptes créés pour farmer des crédits.
--   • 1ʳᵉ souscription payante du filleul :
--       - Pro    : parrain +1500, filleul +1000
--       - Équipe : parrain +3000, filleul +2000
--       → versés APRÈS une fenêtre non-remboursable de 14 j (anti chargeback /
--         remboursement), pour les DEUX (parrain ET filleul). Correction clé :
--         le bonus filleul n'est PAS immédiat, sinon paiement → crédits →
--         chargeback = crédits gratuits.
--
-- Tous les bonus vont dans user_credits.topup_balance (poche NON expirable, comme
-- les packs — cf. 027) : le renouvellement / gel mensuel n'y touche pas.
--
-- Anti-abus :
--   • pas d'auto-parrainage (referrer <> referred, code du filleul ≠ le sien) ;
--   • bonus idempotents via referral_bonus_ledger (clé unique) — webhook/cron
--     rejoués = pas de double crédit ;
--   • gros bonus en attente 14 j, annulés si remboursement dans la fenêtre ;
--   • (l'empreinte de carte Stripe est vérifiée côté webhook, cf. route).
-- ============================================================

-- ── 1. Code de parrainage stable par utilisateur ─────────────────────────────
create table if not exists public.referral_codes (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  code       text unique not null,
  created_at timestamptz not null default now()
);
alter table public.referral_codes enable row level security;

-- L'utilisateur peut LIRE son propre code (pour l'afficher dans la modal).
drop policy if exists referral_codes_select_own on public.referral_codes;
create policy referral_codes_select_own on public.referral_codes
  for select using (user_id = auth.uid());
-- (Création du code = uniquement via la RPC security definer ci-dessous.)

-- ── 2. Événements de parrainage (un filleul → un parrain) ────────────────────
create table if not exists public.referrals (
  id                         uuid primary key default gen_random_uuid(),
  referrer_user_id           uuid not null references auth.users(id) on delete cascade,
  referred_user_id           uuid not null references auth.users(id) on delete cascade,
  code                       text not null,
  -- signed_up → converted (a payé, en attente) → released (bonus versés)
  --                         | refunded (remboursé pendant l'attente) | void
  status                     text not null default 'signed_up',
  plan                       text,            -- 'pro' | 'equipe' (à la conversion)
  first_payment_at           timestamptz,
  hold_release_at            timestamptz,     -- first_payment + 14 j
  refunded_at                timestamptz,
  referred_signup_bonus_at   timestamptz,     -- +200 versé
  referred_convert_bonus_at  timestamptz,     -- +1000/+2000 versé
  referrer_convert_bonus_at  timestamptz,     -- +1500/+3000 versé
  stripe_subscription_id     text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  unique (referred_user_id),                            -- un filleul = un seul parrain
  constraint referrals_no_self check (referrer_user_id <> referred_user_id)
);
create index if not exists referrals_referrer_idx on public.referrals(referrer_user_id);
create index if not exists referrals_release_idx  on public.referrals(status, hold_release_at);

-- RLS activée SANS policy de select : les filleuls d'un parrain ne sont lisibles
-- que via la RPC d'agrégats (on n'expose pas l'identité des filleuls au parrain).
alter table public.referrals enable row level security;

-- ── 3. Journal des bonus versés (idempotence, même modèle que 027) ───────────
create table if not exists public.referral_bonus_ledger (
  bonus_key  text primary key,   -- 'signup:<uid>' | 'convert_referrer:<refid>' | 'convert_referred:<refid>'
  user_id    uuid not null references auth.users(id) on delete cascade,
  amount     integer not null,
  created_at timestamptz not null default now()
);
alter table public.referral_bonus_ledger enable row level security; -- service_role only

-- ── 4. Versement idempotent d'un bonus dans la poche NON expirable ───────────
create or replace function public.award_referral_bonus(
  p_key text,
  p_user_id uuid,
  p_amount integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_amount is null or p_amount <= 0 or p_user_id is null then
    return false;
  end if;

  -- 1ʳᵉ fois qu'on voit cette clé → on enregistre, puis on crédite. Rejeu = no-op.
  insert into public.referral_bonus_ledger (bonus_key, user_id, amount)
  values (p_key, p_user_id, p_amount)
  on conflict (bonus_key) do nothing;
  if not found then
    return false; -- bonus déjà versé
  end if;

  -- Garantit la ligne user_credits, puis ajoute au topup_balance (payé = non expirable).
  insert into public.user_credits (user_id, balance, topup_balance)
  values (p_user_id, 0, 0)
  on conflict (user_id) do nothing;

  update public.user_credits
     set topup_balance = coalesce(topup_balance, 0) + p_amount,
         updated_at    = now()
   where user_id = p_user_id;

  return true;
end;
$$;

-- ── 5. RÉCLAMER un parrainage à l'inscription (appelé par le filleul connecté) ─
-- Sécurité : le filleul est TOUJOURS auth.uid() (jamais un paramètre forgeable).
-- Verse le +200 tout de suite (l'utilisateur est authentifié = email confirmé
-- pour le flux email/mot de passe). Idempotent.
create or replace function public.claim_referral(p_code text)
returns text  -- 'linked' | 'already' | 'self' | 'unknown' | 'unauthenticated'
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_referred uuid := auth.uid();
  v_referrer uuid;
  v_existing uuid;
begin
  if v_referred is null then return 'unauthenticated'; end if;

  -- Déjà parrainé ? (idempotent, on ne change pas de parrain)
  select referrer_user_id into v_existing
    from public.referrals where referred_user_id = v_referred;
  if v_existing is not null then return 'already'; end if;

  select user_id into v_referrer
    from public.referral_codes where code = upper(trim(p_code));
  if v_referrer is null then return 'unknown'; end if;
  if v_referrer = v_referred then return 'self'; end if;

  insert into public.referrals (referrer_user_id, referred_user_id, code, status,
                                referred_signup_bonus_at)
  values (v_referrer, v_referred, upper(trim(p_code)), 'signed_up', now())
  on conflict (referred_user_id) do nothing;

  -- +200 au filleul (poche non expirable), idempotent sur la clé signup:<uid>.
  perform public.award_referral_bonus('signup:' || v_referred, v_referred, 200);
  return 'linked';
end;
$$;

-- ── 6. Récupérer / créer son code de parrainage (filleul → parrain) ──────────
create or replace function public.get_or_create_referral_code()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_code text;
  v_try  int := 0;
begin
  if v_uid is null then return null; end if;

  select code into v_code from public.referral_codes where user_id = v_uid;
  if v_code is not null then return v_code; end if;

  loop
    v_try := v_try + 1;
    -- 8 caractères hexadécimaux majuscules, dérivés d'un uuid aléatoire.
    v_code := upper(replace(substr(gen_random_uuid()::text, 1, 8), '-', ''));
    begin
      insert into public.referral_codes (user_id, code) values (v_uid, v_code);
      return v_code;
    exception when unique_violation then
      if v_try > 8 then raise; end if;  -- collision improbable, on retente
    end;
  end loop;
end;
$$;

-- ── 7. Compteurs pour la modal (agrégats, sans exposer l'identité des filleuls) ─
create or replace function public.my_referral_stats()
returns table (signed_up integer, converted integer, credits_earned integer)
language sql
security definer
set search_path = public, pg_temp
as $$
  select
    coalesce(count(*) filter (where r.referrer_user_id = auth.uid()), 0)::int,
    coalesce(count(*) filter (where r.referrer_user_id = auth.uid()
                                and r.status in ('converted','released','refunded')), 0)::int,
    coalesce((select sum(l.amount)::int
                from public.referral_bonus_ledger l
               where l.user_id = auth.uid()
                 and l.bonus_key like 'convert_referrer:%'), 0)
  from public.referrals r
  where r.referrer_user_id = auth.uid();
$$;

-- ── 8. Marquer la CONVERSION (appelé par le webhook Stripe, 1ʳᵉ souscription) ─
-- Programme la fenêtre d'attente ; ne verse RIEN encore (cf. release).
create or replace function public.mark_referral_converted(
  p_referred uuid,
  p_plan text,
  p_sub text,
  p_hold_days integer default 14
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.referrals
     set status                 = 'converted',
         plan                   = coalesce(plan, p_plan),
         stripe_subscription_id = coalesce(stripe_subscription_id, p_sub),
         first_payment_at       = coalesce(first_payment_at, now()),
         hold_release_at        = coalesce(hold_release_at,
                                           now() + make_interval(days => p_hold_days)),
         updated_at             = now()
   where referred_user_id = p_referred
     and status = 'signed_up';
end;
$$;

-- ── 9. ANNULER un parrainage remboursé pendant l'attente (webhook refund/cancel) ─
create or replace function public.void_referral_on_refund(p_referred uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- On n'annule que si les bonus ne sont PAS encore libérés (la fenêtre de 14 j
  -- existe précisément pour ne jamais avoir à récupérer des crédits déjà versés).
  update public.referrals
     set status = 'refunded', refunded_at = now(), updated_at = now()
   where referred_user_id = p_referred
     and status = 'converted';
end;
$$;

-- ── 10. LIBÉRER les bonus arrivés à échéance (cron horaire) ───────────────────
create or replace function public.release_referral_bonuses()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  v_count int := 0;
  v_referrer_amt int;
  v_referred_amt int;
begin
  for r in
    select * from public.referrals
    where status = 'converted'
      and refunded_at is null
      and hold_release_at is not null
      and hold_release_at <= now()
  loop
    if r.plan = 'equipe' then
      v_referrer_amt := 3000; v_referred_amt := 2000;
    else -- 'pro' par défaut
      v_referrer_amt := 1500; v_referred_amt := 1000;
    end if;

    perform public.award_referral_bonus('convert_referrer:' || r.id, r.referrer_user_id, v_referrer_amt);
    perform public.award_referral_bonus('convert_referred:' || r.id, r.referred_user_id, v_referred_amt);

    update public.referrals
       set status                    = 'released',
           referrer_convert_bonus_at = now(),
           referred_convert_bonus_at = now(),
           updated_at                = now()
     where id = r.id;

    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ── 11. Grants ────────────────────────────────────────────────────────────────
-- Utilisateur connecté : réclamer un parrainage, obtenir son code, voir ses stats.
revoke execute on function public.claim_referral(text)            from public, anon;
grant  execute on function public.claim_referral(text)            to authenticated;
revoke execute on function public.get_or_create_referral_code()   from public, anon;
grant  execute on function public.get_or_create_referral_code()   to authenticated;
revoke execute on function public.my_referral_stats()             from public, anon;
grant  execute on function public.my_referral_stats()             to authenticated;

-- Service_role uniquement : versement brut, conversion, annulation, libération.
revoke execute on function public.award_referral_bonus(text, uuid, integer) from public, anon, authenticated;
grant  execute on function public.award_referral_bonus(text, uuid, integer) to service_role;
revoke execute on function public.mark_referral_converted(uuid, text, text, integer) from public, anon, authenticated;
grant  execute on function public.mark_referral_converted(uuid, text, text, integer) to service_role;
revoke execute on function public.void_referral_on_refund(uuid)   from public, anon, authenticated;
grant  execute on function public.void_referral_on_refund(uuid)   to service_role;
revoke execute on function public.release_referral_bonuses()      from public, anon, authenticated;
grant  execute on function public.release_referral_bonuses()      to service_role;

-- ── 12. Cron horaire de libération (pg_cron, déjà utilisé par les agents / 022) ─
-- Défensif : si l'extension cron n'est pas disponible dans ce contexte, on
-- n'échoue pas la migration (le job pourra être posé à la main).
do $$
begin
  perform cron.schedule(
    'release-referral-bonuses',
    '17 * * * *',                       -- chaque heure à HH:17
    $cron$ select public.release_referral_bonuses(); $cron$
  );
exception when others then
  raise notice 'cron.schedule indisponible (release-referral-bonuses à poser manuellement) : %', sqlerrm;
end;
$$;
