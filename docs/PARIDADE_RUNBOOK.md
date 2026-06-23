# Runbook — Ativação do match de alta precisão (PARIDADE_SIMULADOR.md)

Passo a passo para executar a seção **"Setup (para ativar)"** do
[PARIDADE_SIMULADOR.md](./PARIDADE_SIMULADOR.md). O código já está commitado e
validado (typecheck limpo, 104 testes passando). Faltam só os passos de infra
abaixo — eles tocam o **Supabase de produção** e exigem chaves de API.

> Pré-requisito comum: preencha os campos `<<< FILL >>>` em `.env.local`
> (já criado na raiz, fora do git). No mínimo `SUPABASE_SERVICE_ROLE_KEY`.

As migrações SQL são aplicadas pelo **SQL Editor do Supabase**
(Dashboard → SQL Editor → New query → cole o arquivo → Run), já que o `psql`
não está instalado nesta máquina. Cada script é idempotente (`BEGIN/COMMIT`,
`IF NOT EXISTS`, `UPDATE` condicionado ao valor atual).

---

## Fase 0 — Correção de escala de fatores  (ganho imediato, independente)

Corrige 3 fatores com escala errada em `backend.produtos_cecarbon_dev`
(óleo lubrificante, alumínio, aço Gerdau). **Revise os valores antes** — o
cabeçalho do SQL explica a hipótese de cada correção.

1. Abra `supabase/fix-factor-scale.sql`, confirme os 3 `UPDATE`.
2. SQL Editor → cole o conteúdo → **Run**.
3. Conferência (deve voltar **0 linhas**):
   ```sql
   SELECT id, "Descrição fator de emissao", "Unidade", "fator de emissão (kgCO2)"
     FROM backend.produtos_cecarbon_dev
    WHERE ("Unidade" IN ('kg','L') AND "fator de emissão (kgCO2)" > 10)
      AND "Descrição fator de emissao" NOT LIKE '*%';
   ```

✅ Pronto. Nenhuma flag para ligar — o matcher determinístico já usa os valores
corrigidos.

---

## Fase 1 — Busca semântica de fatores (RAG / pgvector)

Requer `VOYAGE_API_KEY` (Voyage AI — embeddings `voyage-3.5`, 1024d).

1. **Migração** — SQL Editor → cole `supabase/migration-pgvector-factor-embeddings.sql`
   → **Run**. Cria a extensão `vector`, a tabela `backend.factor_embeddings`,
   o índice HNSW e a função `backend.match_factor_embeddings`.
   > Se o projeto não permitir `create extension vector`, ative o pgvector em
   > Dashboard → Database → Extensions → **vector** antes de rodar a migração.

2. **Preencha `.env.local`**: `SUPABASE_SERVICE_ROLE_KEY` e `VOYAGE_API_KEY`.

3. **Backfill dos embeddings** (lê CECarbon/GHG/Ecoinvent, gera embeddings,
   popula a tabela). Roda standalone, fora do Next:
   ```bash
   set -a; source .env.local; set +a
   node scripts/backfill-factor-embeddings.mjs
   ```
   Saída esperada: `Carregados N fatores...`, `upsert N/N`, `Backfill concluído.`
   (idempotente — `upsert` por `source_tier,source_id`; pode re-rodar).

4. **Ligue a flag** em `.env.local`:
   ```
   FACTOR_VECTOR_SEARCH_ENABLED=true
   ```
   Reinicie o `next dev` / faça novo deploy para carregar o env.

Verificação rápida no SQL Editor:
```sql
SELECT source_tier, count(*) FROM backend.factor_embeddings GROUP BY 1;
```

---

## Fase 2 — Reranker via Claude

Requer `ANTHROPIC_API_KEY`. O reranker escolhe/valida o melhor candidato
(inclui checagem de unidade) sobre o resultado da Fase 1 + determinístico.

1. **Preencha** `ANTHROPIC_API_KEY` em `.env.local`.
2. **Ligue a flag**:
   ```
   FACTOR_RERANKER_ENABLED=true
   ```
   (Modelo padrão `claude-opus-4-8`; trocar via `FACTOR_RERANKER_MODEL`.)
3. Reinicie / re-deploy.

Falha de chamada (rede/chave) → o pipeline **mantém o match determinístico**
(comportamento coberto por `tests/lib/server/claude-reranker.test.ts`).

---

## Notas / segurança

- **Não commite `.env.local`** (já está no `.gitignore`).
- Ative primeiro num **projeto de teste** e confira cobertura/itens antes de
  produção (ver aviso ⚠️ no PARIDADE_SIMULADOR.md).
- Itens recorrentes devem virar **Factor Rule** (camada 0, determinística e
  barata) para não depender do reranker turno a turno.
- Em produção (Vercel), replique as variáveis de `.env.local` nas **Environment
  Variables** do projeto — `.env.local` é só local.

## Checklist

- [ ] `.env.local` com `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Fase 0: `fix-factor-scale.sql` aplicado · query de conferência = 0 linhas
- [ ] Fase 1: migração pgvector aplicada · `VOYAGE_API_KEY` setada
- [ ] Fase 1: backfill rodado · `factor_embeddings` populada
- [ ] Fase 1: `FACTOR_VECTOR_SEARCH_ENABLED=true` + restart
- [ ] Fase 2: `ANTHROPIC_API_KEY` setada · `FACTOR_RERANKER_ENABLED=true` + restart
- [ ] (Vercel) variáveis replicadas no ambiente de deploy
