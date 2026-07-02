-- Migration v11 — cache determinístico das decisões do reranker (Claude).
--
-- O reranker via LLM não é reproduzível: re-subir o mesmo arquivo pode escolher
-- um fator ligeiramente diferente para alguns itens, fazendo o total oscilar
-- ±alguns tCO₂e mesmo com a mesma cobertura. Este cache fixa a decisão por
-- (modelo + descrição + unidade + conjunto de candidatos): a primeira vez chama
-- o LLM, as próximas retornam a mesma escolha — reprodutível e mais barato.
--
-- O código lê/grava com fallback gracioso: se a tabela não existir ou a query
-- falhar, ele apenas chama o LLM (nunca quebra o cálculo). Seguro aplicar a
-- qualquer momento.

create table if not exists public.reranker_cache (
  cache_key   text primary key,
  chosen_sig  text,               -- assinatura estável do candidato escolhido; null = "nenhum serve"
  confidence  text not null,      -- high | medium | low
  reason      text,
  created_at  timestamptz not null default now()
);

comment on table public.reranker_cache is
  'Memoização determinística das escolhas do reranker de fatores (Claude). Chave = hash(modelo|descrição|unidade|candidatos).';
