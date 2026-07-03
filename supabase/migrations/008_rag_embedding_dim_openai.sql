-- ============================================================
-- BATIFY — Migration 008 : dimension d'embedding 1024 → 1536
-- ============================================================
-- Bascule du fournisseur d'embeddings vers OpenAI `text-embedding-3-small`
-- (1536 dimensions) au lieu de Mistral (1024). Aucune donnée n'ayant encore
-- été ingérée, on drop/recrée la colonne `embedding` et la RPC proprement.
--
-- ⚠️ Lié à lib/embeddings.ts (EMBEDDING_DIM = 1536). Re-changer de modèle
-- imposerait une nouvelle migration + un ré-embed complet.
-- ============================================================

drop index if exists public.knowledge_chunks_embedding_idx;

alter table public.knowledge_chunks drop column if exists embedding;
alter table public.knowledge_chunks add column embedding vector(1536) not null;

create index if not exists knowledge_chunks_embedding_idx
  on public.knowledge_chunks using hnsw (embedding vector_cosine_ops);

-- La signature change (vecteur de dimension différente) → drop + recreate.
drop function if exists public.match_knowledge(vector, integer, uuid, text[]);

create function public.match_knowledge(
  query_embedding vector(1536),
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
    (c.tenant_id is null or c.tenant_id = p_tenant_id)
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
