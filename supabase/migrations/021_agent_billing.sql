-- ============================================================
-- BILTIA — Migration 021 : DÉBIT DES AGENTS (service_role)
-- ============================================================
-- Les passages d'agents s'exécutent depuis le CRON (service_role, aucune
-- session utilisateur) : deduct_credits() existant est inutilisable là
-- (il lit auth.uid()). Cette RPC débite POUR un utilisateur donné, avec la
-- même garantie atomique (jamais de solde négatif), et n'est exécutable QUE
-- par service_role — miroir exact du modèle refund_credits (003).
--
-- Usage (lib/agent-executor.ts) : après chaque passage, le coût réel est
-- converti en crédits (creditsForCost) et débité ici. Échec (solde
-- insuffisant) → l'agent est mis en pause + notification, jamais de négatif.
-- ============================================================

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
  ok boolean := false;
begin
  if p_amount is null or p_amount <= 0 then
    return true; -- rien à débiter
  end if;

  update public.user_credits
     set balance = balance - p_amount,
         updated_at = now()
   where user_id = p_user_id
     and balance >= p_amount;

  ok := found;
  return ok;
end;
$$;

-- Réservé au service_role (l'exécuteur d'agents). Jamais anon/authenticated :
-- un utilisateur ne peut pas débiter (ni sonder le solde d')un autre compte.
revoke execute on function public.deduct_credits_for_user(uuid, integer) from public, anon, authenticated;
grant  execute on function public.deduct_credits_for_user(uuid, integer) to service_role;
