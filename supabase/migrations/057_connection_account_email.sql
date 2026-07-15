-- ─────────────────────────────────────────────────────────────────────────────
-- 057 — QUEL COMPTE EST BRANCHÉ.
--
-- La carte d'un connecteur affichait « Connecté » sans jamais dire SUR QUELLE
-- ADRESSE. Un artisan avec deux comptes (un perso, un pro) ne pouvait pas savoir
-- lequel Biltia utilisait pour envoyer ses devis — et pouvait avoir branché le
-- mauvais (typiquement le compte admin sans boîte mail) sans s'en apercevoir.
--
-- On mémorise donc l'adresse du compte, lue à la connexion dans l'id_token que
-- Google/Microsoft renvoient déjà (scope openid). Colonne PUREMENT informative :
-- jamais utilisée pour une décision d'autorisation, seulement pour l'AFFICHER.
-- Nullable : les connexions antérieures à cette colonne restent valides, elles
-- afficheront simplement leur adresse à la prochaine reconnexion.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.user_connections
  add column if not exists account_email text;

comment on column public.user_connections.account_email is
  'Adresse du compte OAuth branché (Google/Microsoft), pour AFFICHER sur quel compte l''artisan est connecté. Renseignée à la connexion depuis l''id_token. Purement informative : jamais une décision d''autorisation.';
