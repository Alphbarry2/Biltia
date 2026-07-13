-- ─────────────────────────────────────────────────────────────────────────────
-- 051 — ON NE PEUT PLUS FACTURER UN DEVIS DEUX FOIS
--
-- LE PROBLÈME. `invoiceFromDevis` (lib/workspace-transforms.ts) lit le « déjà
-- facturé » puis insère : un read-then-write classique, sans verrou.
--
--   • DOUBLE CLIC sur « Facturer » → les deux appels lisent `invoicedHt = 0`,
--     calculent tous deux `ht = totalHt`, et insèrent DEUX factures pleines.
--     Le second insert collisionne sur le numéro (index unique tenant+numero),
--     mais la boucle anti-collision RÉESSAIE avec le numéro suivant… et réussit.
--     Le garde-fou applicatif « Rien à facturer » ne rattrape que le clic
--     SÉQUENTIEL. Résultat : le client de l'artisan est facturé deux fois.
--
--   • SUR-FACTURATION : en mode `acompte` / `situation`, `ht` est calculé à partir
--     du pourcentage SANS jamais vérifier que `déjà facturé + ht <= total`. Cinq
--     appels en `acompte 100 %` produisent cinq factures de 100 % du devis,
--     toutes valides, toutes numérotées. Atteignable en un appel d'agent.
--
-- CE QU'ON NE FAIT SURTOUT PAS : un index UNIQUE (tenant_id, devis_id). Un devis
-- porte LÉGITIMEMENT plusieurs factures (acompte, puis situation(s), puis solde).
-- Une telle contrainte casserait les acomptes, c'est-à-dire le cas normal en BTP.
--
-- CE QU'ON FAIT. Un trigger qui, avant chaque écriture de facture rattachée à un
-- devis, VERROUILLE la ligne du devis (`for update`). Ce verrou sérialise les
-- insertions concurrentes portant sur le MÊME devis : la seconde attend, relit la
-- somme réelle, et se voit refusée. L'invariant devient une propriété de la BASE,
-- plus une intention du code applicatif.
--
--   invariant : Σ(factures.montant_ht, avoirs déduits) <= devis.montant_ht
--
-- Les avoirs (type = 'avoir') se déduisent, ce qui permet d'annuler puis de
-- refacturer normalement.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.factures_guard_devis_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total numeric;
  v_deja  numeric;
  v_delta numeric;
begin
  -- Facture libre (sans devis) : rien à contrôler.
  if new.devis_id is null then
    return new;
  end if;

  -- VERROU. C'est le cœur du correctif : deux « Facturer » concurrents sur le
  -- même devis ne peuvent plus lire la même photo périmée. Le second attend ici.
  select montant_ht into v_total
  from public.devis
  where id = new.devis_id
    and tenant_id = new.tenant_id
  for update;

  -- Devis absent / d'un autre tenant / sans montant : on ne bloque pas ici (la
  -- RLS et le code applicatif traitent déjà ces cas). Le trigger ne fait qu'UNE
  -- chose, et la fait bien.
  if v_total is null or v_total <= 0 then
    return new;
  end if;

  select coalesce(
           sum(case when type = 'avoir' then -coalesce(montant_ht, 0)
                    else coalesce(montant_ht, 0) end),
           0)
    into v_deja
  from public.factures
  where tenant_id = new.tenant_id
    and devis_id  = new.devis_id
    and (tg_op = 'INSERT' or id <> new.id);   -- en UPDATE, on s'exclut soi-même

  v_delta := coalesce(new.montant_ht, 0);
  if new.type = 'avoir' then
    v_delta := -v_delta;
  end if;

  -- Tolérance d'un centime : les arrondis de TVA et de pourcentage ne doivent pas
  -- faire échouer une facture de solde parfaitement légitime.
  if v_deja + v_delta > v_total + 0.01 then
    raise exception
      'Facturation impossible : ce devis est déjà facturé à hauteur de % € HT sur % € HT.',
      round(v_deja, 2), round(v_total, 2)
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists factures_guard_devis_total on public.factures;
create trigger factures_guard_devis_total
  before insert or update of montant_ht, type, devis_id on public.factures
  for each row
  execute function public.factures_guard_devis_total();
