-- ============================================================
-- BILTIA — Migration 019 : CERVEAU COLLECTIF (transfer learning au niveau business)
-- ============================================================
-- Inspiration : la connaissance qu'un agent acquiert chez un client (ex : « les
-- devis qui mentionnent la garantie décennale sont plus souvent acceptés ») est
-- ANONYMISÉE, AGRÉGÉE, puis reversée dans le corpus GLOBAL du RAG (007/008) —
-- où `match_knowledge` la ressert à TOUS les tenants. Plus il y a d'entreprises
-- sur Biltia, plus chaque agent devient intelligent.
--
-- Deux pièces seulement (la diffusion existe déjà : knowledge_documents/chunks
-- avec tenant_id IS NULL = bibliothèque globale, servie à tous) :
--
--   1. learning_signals — journal des SIGNAUX DE SUCCÈS bruts, anonymisés,
--      PRIVÉS au tenant. Jamais lus par un autre tenant (RLS). Seul le
--      service_role les agrège (K-anonymat) pour fabriquer un insight global.
--
--   2. tenants.contributes_to_brain — OPT-OUT (défaut : true = contribue).
--      Un tenant qui se retire n'émet plus de signal (garantie côté applicatif)
--      ET est exclu de l'agrégation (garantie côté SQL, cf. la vue plus bas).
--
-- Garantie de confidentialité (RGPD FR/BE) : un insight n'est JAMAIS publié à
-- partir d'un signal isolé. La promotion (lib/collective-brain.ts) exige un
-- K-anonymat — un pattern observé chez ≥ N tenants DISTINCTS — et ne stocke
-- aucune donnée client verbatim (montants → tranches, textes → filtrés PII).
--
-- Idempotent (IF NOT EXISTS / do $$ … exception). Réutilise public.my_tenant_role.
-- ============================================================

-- ── 1. OPT-OUT (défaut : contribue) ──────────────────────────
alter table public.tenants
  add column if not exists contributes_to_brain boolean not null default true;

-- ── 2. SIGNAUX D'APPRENTISSAGE (privés, anonymisés) ──────────
create table if not exists public.learning_signals (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  signal_type text not null,                         -- devis_accepte | devis_refuse | facture_payee | ...
  outcome text not null default 'success',           -- success | fail
  sector text,                                       -- secteur/métier (démographie, jamais nominatif)
  trade_ids text[] not null default '{}'::text[],    -- sous-métiers concernés (ids btp-catalog)
  amount_bucket text,                                -- tranche de montant (JAMAIS le montant exact)
  context text not null default '',                  -- texte libre DÉJÀ anonymisé (conditions, motif…)
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz                           -- NULL = pas encore agrégé
);

do $$ begin
  alter table public.learning_signals add constraint learning_signals_pkey primary key (id);
  alter table public.learning_signals add constraint learning_signals_tenant_id_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade;
exception when duplicate_object or duplicate_table then null; end $$;

-- ── INDEX ────────────────────────────────────────────────────
-- L'agrégation ne balaie que le NON traité : index partiel dédié.
create index if not exists learning_signals_unprocessed_idx
  on public.learning_signals (signal_type, created_at) where (processed_at is null);
create index if not exists learning_signals_tenant_idx
  on public.learning_signals (tenant_id);

-- ── RLS ──────────────────────────────────────────────────────
-- Un signal appartient au tenant qui l'a émis. Aucun tenant ne lit ceux d'un
-- autre. L'agrégation inter-tenants passe EXCLUSIVEMENT par le service_role
-- (qui bypass RLS) — jamais par un utilisateur authentifié.
alter table public.learning_signals enable row level security;

-- INSERT : réservé aux membres du tenant ciblé (n'importe quel rôle).
drop policy if exists learning_signals_insert on public.learning_signals;
create policy learning_signals_insert on public.learning_signals
  for insert
  with check ( public.my_tenant_role(tenant_id) is not null );

-- SELECT : TRANSPARENCE — un owner/admin peut auditer ce que SON espace émet
-- (droit RGPD d'accès). Personne ne voit les signaux d'un autre tenant.
drop policy if exists learning_signals_select on public.learning_signals;
create policy learning_signals_select on public.learning_signals
  for select
  using ( public.my_tenant_role(tenant_id) in ('owner','admin') );

-- Pas de policy UPDATE/DELETE pour les utilisateurs : le marquage `processed_at`
-- (et toute purge) est une opération service_role.

-- ── VUE D'AGRÉGATION (service_role) ──────────────────────────
-- Expose UNIQUEMENT les signaux éligibles à l'apprentissage : non traités ET
-- issus de tenants qui n'ont pas fait opt-out. La logique K-anonymat (compte de
-- tenants distincts, synthèse Haiku) vit côté applicatif ; cette vue garantit
-- au niveau SQL qu'un tenant retiré ne nourrit jamais le cerveau collectif.
create or replace view public.learning_signals_eligible as
  select s.*
  from public.learning_signals s
  join public.tenants t on t.id = s.tenant_id
  where s.processed_at is null
    and t.contributes_to_brain = true;

-- Réservée à l'agrégateur : jamais exposée aux rôles applicatifs.
revoke all on public.learning_signals_eligible from anon, authenticated;
grant select on public.learning_signals_eligible to service_role;
