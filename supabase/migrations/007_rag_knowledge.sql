-- ============================================================
-- BATIFY — Migration 007 : RAG Knowledge Base (pgvector)
-- ============================================================
-- Donne à Batify un "cerveau" documentaire vérifiable au lieu de
-- la connaissance de mémoire du modèle (source d'hallucinations sur
-- les normes / sections de câble / taux / calculs).
--
-- Deux niveaux de corpus :
--   • tenant_id IS NULL      → bibliothèque GLOBALE (sources libres,
--                              curées). Écriture réservée à service_role.
--   • tenant_id = <tenant>   → documents PRIVÉS d'un tenant (RLS stricte).
--
-- Embeddings : mistral-embed → vecteurs de dimension 1024.
-- Changer de modèle d'embeddings = re-migrer la dimension + ré-embed.
--
-- Idempotent (IF NOT EXISTS) — mêmes conventions que 004/005.
-- Réutilise le helper RLS public.my_tenant_role(tenant_id).
-- ============================================================

create extension if not exists "vector";

-- ── TABLES ───────────────────────────────────────────────────

create table if not exists public.knowledge_documents (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid,                         -- NULL = bibliothèque globale
  title text not null,
  source_url text,
  source_type text not null default 'guide'::text,  -- guide | reglementaire | catalogue | cctp | interne | ...
  license text not null default 'public'::text,     -- public | licensed | private
  trade_ids text[] not null default '{}'::text[],   -- sous-métiers concernés (ids btp-catalog)
  checksum text,                          -- dédoublonnage à l'ingestion
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.knowledge_chunks (
  id uuid not null default gen_random_uuid(),
  document_id uuid not null,
  tenant_id uuid,                         -- dénormalisé (RLS + filtre rapide) — miroir du document
  content text not null,
  embedding vector(1024) not null,
  trade_ids text[] not null default '{}'::text[],
  chunk_index integer not null default 0,
  token_count integer,
  created_at timestamptz not null default now()
);

-- ── CONTRAINTES ──────────────────────────────────────────────
do $$ begin
  alter table public.knowledge_documents add constraint knowledge_documents_pkey primary key (id);
  alter table public.knowledge_documents add constraint knowledge_documents_tenant_id_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade;
  alter table public.knowledge_documents add constraint knowledge_documents_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null;

  alter table public.knowledge_chunks add constraint knowledge_chunks_pkey primary key (id);
  alter table public.knowledge_chunks add constraint knowledge_chunks_document_id_fkey
    foreign key (document_id) references public.knowledge_documents(id) on delete cascade;
  alter table public.knowledge_chunks add constraint knowledge_chunks_tenant_id_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade;
exception when duplicate_object or duplicate_table then null; end $$;

-- ── INDEX ────────────────────────────────────────────────────
-- HNSW cosine : recherche vectorielle sous-linéaire.
create index if not exists knowledge_chunks_embedding_idx
  on public.knowledge_chunks using hnsw (embedding vector_cosine_ops);
create index if not exists knowledge_chunks_tenant_idx
  on public.knowledge_chunks (tenant_id);
create index if not exists knowledge_chunks_trade_idx
  on public.knowledge_chunks using gin (trade_ids);
create index if not exists knowledge_documents_tenant_idx
  on public.knowledge_documents (tenant_id);
create index if not exists knowledge_documents_checksum_idx
  on public.knowledge_documents (checksum) where (checksum is not null);

-- ── RLS ──────────────────────────────────────────────────────
alter table public.knowledge_documents enable row level security;
alter table public.knowledge_chunks    enable row level security;

-- SELECT : bibliothèque globale (tenant_id IS NULL) lisible par tous les
-- membres authentifiés + documents du/des tenant(s) de l'utilisateur.
drop policy if exists knowledge_documents_select on public.knowledge_documents;
create policy knowledge_documents_select on public.knowledge_documents
  for select
  using ( tenant_id is null or public.my_tenant_role(tenant_id) is not null );

drop policy if exists knowledge_chunks_select on public.knowledge_chunks;
create policy knowledge_chunks_select on public.knowledge_chunks
  for select
  using ( tenant_id is null or public.my_tenant_role(tenant_id) is not null );

-- WRITE (docs privés du tenant) : réservé owner/admin/manager du tenant ciblé.
-- Les docs GLOBAUX (tenant_id IS NULL) n'ont AUCUNE policy write → ils ne sont
-- écrivables que via service_role (script d'ingestion, qui bypass RLS).
drop policy if exists knowledge_documents_insert on public.knowledge_documents;
create policy knowledge_documents_insert on public.knowledge_documents
  for insert
  with check ( tenant_id is not null and public.my_tenant_role(tenant_id) in ('owner','admin','manager') );

drop policy if exists knowledge_documents_update on public.knowledge_documents;
create policy knowledge_documents_update on public.knowledge_documents
  for update
  using ( tenant_id is not null and public.my_tenant_role(tenant_id) in ('owner','admin','manager') )
  with check ( tenant_id is not null and public.my_tenant_role(tenant_id) in ('owner','admin','manager') );

drop policy if exists knowledge_documents_delete on public.knowledge_documents;
create policy knowledge_documents_delete on public.knowledge_documents
  for delete
  using ( tenant_id is not null and public.my_tenant_role(tenant_id) in ('owner','admin','manager') );

drop policy if exists knowledge_chunks_insert on public.knowledge_chunks;
create policy knowledge_chunks_insert on public.knowledge_chunks
  for insert
  with check ( tenant_id is not null and public.my_tenant_role(tenant_id) in ('owner','admin','manager') );

drop policy if exists knowledge_chunks_delete on public.knowledge_chunks;
create policy knowledge_chunks_delete on public.knowledge_chunks
  for delete
  using ( tenant_id is not null and public.my_tenant_role(tenant_id) in ('owner','admin','manager') );

-- ── RPC de recherche sémantique ──────────────────────────────
-- SECURITY INVOKER (défaut, réaffirmé) : la RLS ci-dessus s'applique à
-- l'appelant → un tenant ne peut JAMAIS récupérer les chunks d'un autre.
-- (On n'utilise PAS SECURITY DEFINER — cf. failles ouvertes historiques.)
create or replace function public.match_knowledge(
  query_embedding vector(1024),
  match_count integer default 6,
  p_tenant_id uuid default null,
  p_trade_ids text[] default null
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  title text,
  source_url text,
  source_type text,
  trade_ids text[],
  similarity double precision
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    c.id,
    c.document_id,
    c.content,
    d.title,
    d.source_url,
    d.source_type,
    c.trade_ids,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks c
  join public.knowledge_documents d on d.id = c.document_id
  where
    -- global toujours inclus + docs du tenant actif
    (c.tenant_id is null or c.tenant_id = p_tenant_id)
    -- filtre métier souple : chunks génériques (sans trade) toujours éligibles
    and (
      p_trade_ids is null
      or cardinality(p_trade_ids) = 0
      or c.trade_ids = '{}'
      or c.trade_ids && p_trade_ids
    )
  order by c.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

grant execute on function public.match_knowledge(vector, integer, uuid, text[]) to authenticated;
