-- ─────────────────────────────────────────────────────────────────────────────
-- 036 — Enrichissement CRM de la fiche client : statut + source.
--
-- La table `clients` ne portait NI statut NI provenance : impossible de segmenter
-- (prospect / actif / inactif) ni de savoir d'où vient un client. Ce trou bloquait
-- toute une famille d'automatisations de suivi commercial. Deux colonnes, additives
-- (aucune donnée existante cassée), tenant-scopées par la RLS déjà en place sur
-- `clients` (migration 018).
--
--   • statut : cycle de vie commercial. 'actif' par défaut (une fiche saisie à la
--     main est en général un vrai client). 'prospect' pour un lead pas encore
--     transformé, 'inactif' pour un client sans activité récente (le veilleur
--     `client_inactif` le CALCULE via devis/factures/interventions), 'archive'
--     pour sortir une fiche du radar.
--   • source : d'où vient le client (« formulaire », « bouche-à-oreille »,
--     « recommandation », « salon »…). Texte libre borné ; posé à la création /
--     conversion d'un lead (via l'agent `act` ou la saisie manuelle).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.clients
  add column if not exists statut text not null default 'actif',
  add column if not exists source text;

-- Contrainte de valeurs sur statut (drop/add idempotent).
alter table public.clients
  drop constraint if exists clients_statut_check;
alter table public.clients
  add constraint clients_statut_check
  check (statut in ('prospect', 'actif', 'inactif', 'archive'));

-- Filtres de suivi fréquents (« mes prospects », « mes clients inactifs »).
create index if not exists clients_statut_idx on public.clients (tenant_id, statut);
