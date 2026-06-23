# Paridade com o Simulador Antigo (ZNIT/Fortanks)

Comparativo `Teste de Simuladores.xlsx` (novo vs. antigo) sobre os cenários
**Estaca Hélice (Padrão)** e **Estaca Prancha (Novo)** — mesmas planilhas de
teste do repositório antigo (`SECAGEM-*.xlsx` + `Solucao*.xlsx`).

## Como o antigo calcula

`Emissões = Σ(Qtd_Item × Índice_Composição × Fator_Emissão)`

- Explode cada composição em insumos **Material** com `índice > 0` (igual ao novo).
- Fator vem da tabela `fatores_compra_produto_servicos_fortanks` em **tCO2**,
  selecionado por um serviço de RAG/vector-search (`retrieval-api/classificar`).
- Agrega por `ID_PAI | CENARIO | QTD_PAI` (material repetido em trechos
  diferentes é somado e exibido agrupado, não 3×).

## Diagnóstico — causa raiz das divergências

A explosão de composições do novo simulador **já estava correta** (aço, diesel,
brita e combustível aparecem na receita com quantidade certa). O grande desvio
(total novo ≈ 60% do antigo) vinha do **match de fator**:

`lib/server/emission-mapper.ts` → `extractKeywords` fazia `toLowerCase()` mas
**não removia acento**, enquanto as chaves dos dicionários de busca usam grafia
acentuada (`"aço"`, `"óleo"`, `"combustível"`, `"alumínio"`, `"escavação"`). As
descrições do iTwo chegam em CAIXA ALTA e SEM acento. Resultado:

| Descrição (orçamento) | Antes | Efeito |
|---|---|---|
| `ACO CA-50 - BITOLA MEDIA` | 0 hits (`aço`/`ca50` não casavam) | aço da armadura não calculava → "só o arame bateu" |
| `COMBUSTIVEL PARA VEICULOS E EQUIPAMENTOS` | 0 hits | "outros combustíveis não calcularam" |
| `PARABOLT EM ACO INOX` | 0 hits | "parabolt não calculado" |
| `GUARDA-CORPO ... ACO GALVANIZADO` | 0 hits → fuzzy bruto | casava fator enorme (147 tCO₂e) |

Além disso, `CA-50/CA-60/CA-25` era fragmentado em `ca` + `50` e nunca virava
o token `ca50` que as tabelas reconhecem.

## Correções aplicadas (este commit)

1. **Match insensível a acento** (`emission-mapper.ts`): `stripAccents` + mapas
   normalizados `SEARCH_QUERIES_NORM` / `CECARBON_QUERIES_NORM` /
   `GHG_TRIGGER_WORDS_NORM`. O lookup passa a casar `aco→aço`, `oleo→óleo`,
   `combustivel→combustível`, `aluminio→alumínio`, `escavacao→escavação`, etc.
   Os tokens retornados preservam a grafia original (não quebra contratos).
2. **Token de bitola do aço**: `CA-50 / CA 50 / CA50 → ca50` (idem 60/25),
   emitido **além** de `ca`/`50`. Resolve armaduras, parabolt e guarda-corpo.
3. **Combustível genérico → diesel**: `extractKeywords` injeta `diesel` para
   `COMBUSTIVEL...` e há entradas explícitas `combustível → óleo diesel`
   (CECarbon, kgCO₂/L) e `→ diesel` (GHG), como no tratamento do antigo.
4. **UI do cenário** (`scenarios/page.tsx`):
   - Itens diretos agora exibem **fator e fonte** (antes só composições).
   - **Agregação** de itens diretos iguais (ex.: CONCRETO 40MPA em 3 trechos)
     numa linha única com badge `N× no orçamento` — fim do "aparece 3x".
   - Mais **casas decimais** (fator 4, emissão 3) e guarda de `null → "—"`.

Testes: `tests/lib/server/emission-mapper.test.ts` cobre acento, `ca50/60/25`,
combustível→diesel e o match de aço/óleo a partir de descrição sem acento.

## Pendências que dependem do banco `backend` (não verificáveis sem acesso)

Estas exigem a base de fatores para validar valor a valor:

- **Escala de fator (tCO₂ vs kgCO₂e)**: GUARDA CORPO deu `147,04` = antigo
  `0,147 × 1000`. Indica fator(es) gravado(s) em tCO₂ rotulado(s) como kgCO₂e
  no schema `backend`. Auditar magnitudes.
- **"Ref diferentes"**: o valor exato do fator depende da seleção por RAG do
  antigo + base `fatores_compra_produto_servicos_fortanks`. A metodologia agora
  bate; o valor literal só será idêntico com a mesma base/serviço.
- Revisar fatores ausentes para insumos pontuais que ainda fiquem "não
  encontrados" após o fix de acento (rodar o auto-map e conferir cobertura).
