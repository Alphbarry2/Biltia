-- ============================================================
-- BILTIA — Migration 054 : l'essai gratuit a une fin
-- ============================================================
-- DÉCISION USER (2026-07-14) : plus de plan Free PERMANENT. Un essai borné par
-- DEUX limites, la première atteinte gagne : les CRÉDITS (400) ou le TEMPS (14 jours).
--
-- ⚠️ LE VRAI VERROU, CE SONT LES CRÉDITS. Le chronomètre est le second, et il ne
-- démarre PAS à l'inscription : il démarre à la PREMIÈRE APPLICATION CRÉÉE.
--
-- Les deux limites ne mordent jamais sur la même personne :
--   • l'artisan engagé brûle ses 400 crédits en 2-3 jours → c'est le plafond de
--     crédits qui l'arrête, et c'est lui qui le convertit ;
--   • l'artisan lent (dans le BTP c'est la norme : il est sur un toit, pas devant un
--     écran) s'inscrit, crée son app, part 3 semaines sur un chantier. Un compte à
--     rebours lancé à l'INSCRIPTION le gèlerait au jour 15 alors qu'il lui reste des
--     crédits et qu'il n'a PAS ENCORE eu le déclic.
--
-- Un chrono lancé à l'inscription ne se déclenche donc QUE sur les gens qu'on n'a pas
-- convaincus. Lancé à la première app, il dit la bonne chose : « tu as vu ce que ça
-- fait, tu as deux semaines pour décider. »
--
-- NULL = l'essai n'a pas commencé (il n'a encore rien construit). Il reste writable :
-- ses crédits le bornent déjà.
--
-- Le GEL lui-même n'est pas ici : la mécanique existe (lib/entitlements.ts →
-- `frozen`/`writable`, déjà utilisée pour les abonnements expirés). On lui donne
-- juste une seconde source de vérité. Les données et les apps restent CONSERVÉES et
-- consultables — c'est précisément ce qui rend coûteux le fait de partir.
--
-- ⚠️ Miroir applicatif : TRIAL_DAYS dans lib/plans.ts. Les deux bougent ensemble.
-- ============================================================

alter table public.tenants
  add column if not exists trial_ends_at timestamptz;

comment on column public.tenants.trial_ends_at is
  'Fin de l''essai gratuit. Posé à la PREMIÈRE application créée (pas à l''inscription), à +TRIAL_DAYS jours. NULL = essai pas encore démarré. Un tenant Free dont la date est passée bascule en LECTURE SEULE (lib/entitlements.ts). Ignoré dès qu''un abonnement payant existe.';

-- Les tenants DÉJÀ inscrits gardent trial_ends_at = NULL : ils ne sont pas gelés
-- rétroactivement. Leur chrono partira à leur prochaine création d'application.
-- On ne punit personne pour un changement de règles décidé après son inscription.

-- Lecture du champ par le tenant lui-même : la policy SELECT existante sur `tenants`
-- couvre déjà la colonne (RLS au niveau ligne, pas colonne). Rien à ajouter.
-- L'ÉCRITURE de trial_ends_at se fait en service_role (route serveur), jamais par
-- le client — sans quoi n'importe qui repousserait sa propre date de fin d'essai.
