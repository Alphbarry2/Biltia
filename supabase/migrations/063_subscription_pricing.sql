-- ============================================================
-- BILTIA — Migration 063 : traçabilité tarifaire des abonnements
--
-- Contexte : la console admin affichait un MRR estimé à plat
-- (nombre d'abonnés payants × prix plancher du palier Pro de base),
-- faute de connaître le palier RÉEL de chaque abonnement. Le MRR
-- affiché est désormais lu EN DIRECT sur Stripe (source de vérité,
-- lib/stripe-revenue.ts) — ces colonnes ne servent PAS à ce calcul,
-- elles permettent d'afficher le palier réel par client (ex. « Top
-- comptes ») et de préparer un futur suivi du churn dans le temps.
--
-- NON APPLIQUÉE À LA PROD — écrite en attente de confirmation.
-- ============================================================

alter table public.subscriptions
  add column if not exists stripe_price_id text,
  add column if not exists credits_per_month integer not null default 0,
  add column if not exists canceled_at timestamptz;

comment on column public.subscriptions.stripe_price_id is
  'Price ID Stripe réel de l''abonnement (résolu via findTierByPriceId au webhook). Informatif — le MRR admin est calculé en direct sur Stripe, pas depuis cette colonne.';
comment on column public.subscriptions.credits_per_month is
  'Crédits du palier souscrit, résolus au webhook (0 = Free ou palier inconnu).';
comment on column public.subscriptions.canceled_at is
  'Horodatage de résiliation (posé par customer.subscription.deleted). Permet un suivi du churn dans le temps — uniquement à partir de la mise en prod de cette colonne, pas de backfill possible.';

-- ============================================================
-- FIN 063_subscription_pricing.sql
-- ============================================================
