-- ─────────────────────────────────────────────────────────────────────────────
-- 056 — LE TENANT FONDATEUR : tous les droits, aucune limite, et un CA qui reste vrai.
--
-- LE BESOIN : le compte fondateur (contact@biltia.com) doit avoir le plan le plus
-- élevé, sans aucune limite.
--
-- LA FAUSSE BONNE IDÉE : lui poser un abonnement « equipe » en base. C'est
-- précisément ce qu'il ne faut PAS faire. Le MRR de la console admin compte TOUT
-- tenant dont le plan n'est pas « free » (app/api/admin/stats/route.ts) : un
-- abonnement de complaisance afficherait « 1 client payant, 49 € de CA ». Le
-- fondateur se mentirait à lui-même sur le seul chiffre qui compte vraiment, et
-- c'est toute la raison d'être de la règle « fondateur isolé des métriques ».
--
-- ON SÉPARE DONC LES DEUX :
--   · l'ABONNEMENT reste ce qu'il est (« free ») → jamais compté comme un client ;
--   · un DRAPEAU dit « ce tenant est interne » → lib/entitlements.ts lui rend des
--     droits illimités (jamais gelé, jamais borné par l'essai, toutes les features).
-- Les CRÉDITS, eux, étaient déjà illimités par ailleurs (lib/founder.ts).
--
-- ⚠️ SOURCE DE VÉRITÉ DES EMAILS : lib/founder.ts. Ce drapeau ne se pose pas tout
-- seul : si tu ajoutes un fondateur là-bas, rejoue le UPDATE ci-dessous.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.tenants
  add column if not exists founder boolean not null default false;

comment on column public.tenants.founder is
  'Tenant INTERNE (fondateur) : droits illimités (lib/entitlements.ts), jamais gelé, et JAMAIS compté dans le MRR. Emails source : lib/founder.ts.';

-- Le drapeau suit le PROPRIÉTAIRE du tenant, jamais un simple membre : un
-- fondateur invité dans le workspace d'un client ne doit pas rendre CE workspace
-- illimité (ce serait offrir le plan Équipe à quiconque nous invite).
update public.tenants t
set founder = true
where exists (
  select 1
  from public.tenant_members tm
  join auth.users u on u.id = tm.user_id
  where tm.tenant_id = t.id
    and tm.role = 'owner'
    and lower(u.email) in ('contact@biltia.com', 'barryalpha9755@gmail.com')
);
