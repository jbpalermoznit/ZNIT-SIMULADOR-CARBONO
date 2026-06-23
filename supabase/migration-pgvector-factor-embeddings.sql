-- =====================================================================
-- Fase 1 — Busca semântica de fatores (RAG) via pgvector
-- =====================================================================
-- Cria a tabela de embeddings dos fatores e a função de match por cosseno.
-- Popular com: node scripts/backfill-factor-embeddings.mjs (precisa de
-- VOYAGE_API_KEY). A dimensão 1024 corresponde ao voyage-3.5 — se trocar de
-- modelo de embeddings, ajuste vector(N) aqui, EMBEDDING_DIM em embeddings.ts
-- e re-rode o backfill.
--
-- Só tem efeito quando FACTOR_VECTOR_SEARCH_ENABLED=true no app.
-- =====================================================================

create extension if not exists vector;

create table if not exists backend.factor_embeddings (
  id            bigserial primary key,
  source_tier   text   not null,           -- 'cecarbon' | 'ghg_protocol' | 'ecoinvent'
  source_id     text   not null,           -- id/pk na tabela de origem
  description   text   not null,           -- texto embedado
  unit          text,
  factor_value  numeric,
  factor_unit   text,
  product_unit  text,
  factor_source text,
  embedding     vector(1024) not null,
  updated_at    timestamptz default now(),
  unique (source_tier, source_id)
);

-- Índice ANN por cosseno (HNSW). Para bases pequenas a busca exata também
-- funciona; o índice acelera quando o catálogo cresce.
create index if not exists factor_embeddings_embedding_idx
  on backend.factor_embeddings
  using hnsw (embedding vector_cosine_ops);

-- Função consumida por vector-search.ts via supabaseEmission.rpc(...).
create or replace function backend.match_factor_embeddings(
  query_embedding vector(1024),
  match_count     int default 15
)
returns table (
  source_tier   text,
  source_id     text,
  factor_name   text,
  factor_value  numeric,
  factor_unit   text,
  product_unit  text,
  factor_source text,
  similarity    float
)
language sql stable
as $$
  select
    fe.source_tier,
    fe.source_id,
    fe.description as factor_name,
    fe.factor_value,
    fe.factor_unit,
    fe.product_unit,
    fe.factor_source,
    1 - (fe.embedding <=> query_embedding) as similarity
  from backend.factor_embeddings fe
  order by fe.embedding <=> query_embedding
  limit match_count;
$$;
