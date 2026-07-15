-- ─────────────────────────────────────────────────────────────────────────────
-- 058 — MONTANTS DE PARRAINAGE recalés (refonte tarifaire 2026-07-15).
--
-- Le plan Équipe a été SUPPRIMÉ (un seul plan payant : Pro). On recale donc les
-- bonus de parrainage, et on retire la branche « equipe » (morte).
--   • Inscription du filleul : 200 → 400 crédits (poche topup non expirable).
--   • Conversion Pro : parrain 1500 → 2000, filleul 1000 → 1500.
--
-- ⚠️ Ces montants DOIVENT rester alignés sur lib/plans.ts :
--     REFERRAL_SIGNUP_BONUS=400 · REFERRAL_PRO_REFERRER=2000 · REFERRAL_PRO_REFERRED=1500
-- (le SQL ne peut pas importer le TS ; source de vérité dupliquée, à garder synchro).
-- ─────────────────────────────────────────────────────────────────────────────

-- +400 au filleul dès l'inscription (au lieu de +200).
create or replace function public.claim_referral(p_code text)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_referred uuid := auth.uid();
  v_referrer uuid;
  v_existing uuid;
begin
  if v_referred is null then return 'unauthenticated'; end if;
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
  perform public.award_referral_bonus('signup:' || v_referred, v_referred, 400);
  return 'linked';
end;
$function$;

-- Conversion payante = toujours Pro depuis la refonte : parrain +2000, filleul +1500.
-- (Branche « equipe » retirée ; la colonne referrals.plan reste mais n'est plus lue ici.)
create or replace function public.release_referral_bonuses()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  r record;
  v_count int := 0;
begin
  for r in
    select * from public.referrals
    where status = 'converted'
      and refunded_at is null
      and hold_release_at is not null
      and hold_release_at <= now()
  loop
    perform public.award_referral_bonus('convert_referrer:' || r.id, r.referrer_user_id, 2000);
    perform public.award_referral_bonus('convert_referred:' || r.id, r.referred_user_id, 1500);
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
$function$;
