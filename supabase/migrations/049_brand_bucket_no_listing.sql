-- ─────────────────────────────────────────────────────────────────────────────
-- 049 — Le bucket `brand` ne doit pas être ÉNUMÉRABLE.
--
-- La 047 avait posé une policy SELECT large (`brand_public_read`) sur
-- storage.objects pour le bucket `brand`. Or ce bucket est PUBLIC : les URLs
-- d'objets (/storage/v1/object/public/brand/...) fonctionnent SANS aucune policy.
-- La policy n'apportait donc rien à l'affichage, mais autorisait le LISTING :
-- n'importe qui pouvait énumérer les logos de TOUS les artisans clients, et donc
-- déduire la liste des clients de Biltia.
--
-- Le code n'appelle jamais .list() : il upload via service_role (qui contourne la
-- RLS) et sert le logo via getPublicUrl. Retirer la policy est sans effet visible.
-- Bucket vide au moment du correctif (0 objet) : rien n'a été exposé.
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists "brand_public_read" on storage.objects;
