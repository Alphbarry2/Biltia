-- ============================================================
-- BILTIA — Migration 027 : PACKS DE CRÉDITS (recharges non expirables)
-- ============================================================
-- Deux poches de crédits par utilisateur :
--   • balance        = crédits d'ABONNEMENT, remis à niveau chaque mois par le
--                      webhook (SET idempotent, INCHANGÉ ici). Use-it-or-lose-it.
--   • topup_balance  = crédits ACHETÉS en pack (recharge). PAYÉS, donc ils ne
--                      périment JAMAIS : le renouvellement n'y touche pas.
--
-- Les débits dépensent la poche ABONNEMENT d'abord, puis les packs : ainsi les
-- crédits qui périment (abonnement) partent avant les crédits payés (packs).
--
-- Anti-double-crédit : redeem_credit_pack() est idempotent sur l'ID de session
-- Stripe (le webhook peut être rejoué sans créditer deux fois).
-- ============================================================

-- ── 1. Seconde poche ──────────────────────────────────────────────────────────
alter table public.user_credits
  add column if not exists topup_balance integer not null default 0;

-- ── 2. Débit (session utilisateur) : abonnement d'abord, puis packs ───────────
create or replace function public.deduct_credits(p_amount integer)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid          uuid := auth.uid();
  v_balance      integer;
  v_topup        integer;
  v_from_balance integer;
begin
  if v_uid is null then
    return false;
  end if;
  if p_amount is null or p_amount <= 0 then
    return true; -- rien à débiter
  end if;

  select balance, coalesce(topup_balance, 0)
    into v_balance, v_topup
  from public.user_credits
  where user_id = v_uid
  for update;

  if v_balance is null or (v_balance + v_topup) < p_amount then
    return false;
  end if;

  -- On vide la poche abonnement en premier (elle expire), puis les packs.
  v_from_balance := least(v_balance, p_amount);
  update public.user_credits
     set balance       = balance - v_from_balance,
         topup_balance  = topup_balance - (p_amount - v_from_balance),
         updated_at     = now()
   where user_id = v_uid;

  return true;
end;
$$;

-- ── 3. Débit POUR un utilisateur (service_role : cron agents) ─────────────────
create or replace function public.deduct_credits_for_user(
  p_user_id uuid,
  p_amount integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_balance      integer;
  v_topup        integer;
  v_from_balance integer;
begin
  if p_amount is null or p_amount <= 0 then
    return true; -- rien à débiter
  end if;

  select balance, coalesce(topup_balance, 0)
    into v_balance, v_topup
  from public.user_credits
  where user_id = p_user_id
  for update;

  if v_balance is null or (v_balance + v_topup) < p_amount then
    return false;
  end if;

  v_from_balance := least(v_balance, p_amount);
  update public.user_credits
     set balance       = balance - v_from_balance,
         topup_balance  = topup_balance - (p_amount - v_from_balance),
         updated_at     = now()
   where user_id = p_user_id;

  return true;
end;
$$;

-- Grants inchangés (miroir de 003 / 021) : re-affirmés par prudence.
revoke execute on function public.deduct_credits(integer) from public, anon;
grant  execute on function public.deduct_credits(integer) to authenticated, service_role;
revoke execute on function public.deduct_credits_for_user(uuid, integer) from public, anon, authenticated;
grant  execute on function public.deduct_credits_for_user(uuid, integer) to service_role;

-- ── 4. Journal des achats de packs (idempotence) ──────────────────────────────
create table if not exists public.credit_pack_purchases (
  stripe_session_id text primary key,
  user_id           uuid not null references auth.users(id) on delete cascade,
  credits           integer not null,
  created_at        timestamptz not null default now()
);
-- RLS activée SANS policy → seul service_role (bypass RLS) y accède. Un
-- utilisateur ne peut ni lire ni forger un achat.
alter table public.credit_pack_purchases enable row level security;

-- ── 5. Crédit d'un pack, atomique + idempotent sur la session Stripe ──────────
create or replace function public.redeem_credit_pack(
  p_session_id text,
  p_user_id uuid,
  p_amount integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- 1ʳᵉ fois qu'on voit cette session → on enregistre puis on crédite.
  insert into public.credit_pack_purchases (stripe_session_id, user_id, credits)
  values (p_session_id, p_user_id, p_amount)
  on conflict (stripe_session_id) do nothing;

  if not found then
    return false; -- session déjà traitée (webhook rejoué) : ne pas re-créditer
  end if;

  update public.user_credits
     set topup_balance = coalesce(topup_balance, 0) + p_amount,
         updated_at    = now()
   where user_id = p_user_id;

  return true;
end;
$$;

revoke execute on function public.redeem_credit_pack(text, uuid, integer) from public, anon, authenticated;
grant  execute on function public.redeem_credit_pack(text, uuid, integer) to service_role;
