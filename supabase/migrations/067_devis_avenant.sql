-- ============================================================
-- Phase 2 — L'AVENANT devient un vrai objet métier
-- Un avenant = un `devis` de type 'avenant' lié à son devis source.
-- Additive et RÉVERSIBLE. NON appliquée tant que non validée en prod.
--   (down : alter table public.devis drop column parent_devis_id ;
--           alter table public.devis drop column type ;
--           drop index devis_parent_idx.)
--
-- ⚠️ AVANT APPLICATION : vérifier le schéma RÉEL en prod (dérive dépôt/prod) —
--    colonnes de public.devis, et numéro de migration libre (la prod a 064/065).
-- ============================================================

-- Discriminant : un devis normal ('devis') ou un avenant ('avenant').
alter table public.devis
  add column if not exists type text not null default 'devis';

-- Lien vers le devis d'origine (pour un avenant). NULL pour un devis normal.
alter table public.devis
  add column if not exists parent_devis_id uuid references public.devis(id) on delete set null;

create index if not exists devis_parent_idx on public.devis (parent_devis_id);
