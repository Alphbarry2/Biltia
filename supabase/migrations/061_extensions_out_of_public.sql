-- ─────────────────────────────────────────────────────────────────────────────
-- 061 — extension_in_public (advisor 0014) : vector et pg_trgm hors de public
--
-- Vérifié en base avant d'agir (docqrznkbtyctjqpvifu, 2026-07-17) :
--   • vector et pg_trgm sont RELOCALISABLES (extrelocatable = true).
--   • Le schéma `extensions` existe déjà et fait partie du search_path PAR
--     DÉFAUT de la base ("$user", public, extensions). anon/authenticated
--     n'ont AUCUNE surcharge de search_path : PostgREST continue de résoudre
--     <=>, similarity(), word_similarity()... sans rien changer côté client.
--   • Une seule fonction applicative fige un search_path qui exclurait
--     `extensions` : match_knowledge (RAG) — corrigée ci-dessous.
--
-- pg_net reste en public, DÉLIBÉRÉMENT : NON relocalisable (extrelocatable =
-- false), et ses objets réels vivent déjà dans le schéma `net` (12 fonctions),
-- ZÉRO dans public — l'avertissement est cosmétique (l'entrée pg_extension
-- pointe sur public, mais rien n'y est exposé). Le « corriger » exigerait un
-- DROP EXTENSION pg_net CASCADE (perte de la queue net._http_response, sur
-- laquelle tournent les agents cron) pour un warning qui ne changerait rien
-- à la surface d'API réelle. Risque > bénéfice, non appliqué.
-- ─────────────────────────────────────────────────────────────────────────────

alter extension vector   set schema extensions;
alter extension pg_trgm  set schema extensions;

-- Le type et l'opérateur sont explicitement qualifiés `extensions.` : une
-- fonction `language sql` résout son corps au moment de la CRÉATION avec le
-- search_path AMBIANT de la session d'exécution de la migration (pas celui
-- déclaré par le `set search_path` de la fonction, qui ne joue qu'à l'appel).
-- On ne dépend donc plus de l'état de cette session.
create or replace function public.match_knowledge(
  query_embedding extensions.vector,
  match_count integer default 6,
  p_tenant_id uuid default null::uuid,
  p_trade_ids text[] default null::text[]
)
returns table (id uuid, document_id uuid, content text, title text,
               source_url text, source_type text, trade_ids text[],
               similarity double precision)
language sql
stable
set search_path to 'public, extensions'
as $$
  select
    c.id,
    c.document_id,
    c.content,
    d.title,
    d.source_url,
    d.source_type,
    c.trade_ids,
    1 - (c.embedding operator(extensions.<=>) query_embedding) as similarity
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
  order by c.embedding operator(extensions.<=>) query_embedding
  limit greatest(match_count, 1);
$$;
