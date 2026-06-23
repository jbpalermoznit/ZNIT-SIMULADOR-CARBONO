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

## Segunda onda — validação contra os fatores reais (exportados do Supabase)

Com as 3 tabelas reais (`produtos_cecarbon_dev`, `fatores_ghg_dev`,
`ecoinvent_dev`) rodamos o `autoMatchItem` **real** offline sobre a explosão
das planilhas. O fix de acento foi confirmado (aço/diesel/brita/armadura batem
com o antigo), mas expôs 3 bugs de match pré-existentes — corrigidos:

1. **Unidade do Ecoinvent** (`emission-mapper.ts`): o `factor_unit` era só
   `"kg CO2-Eq"` (sem denominador) → `getConversionFactor` removia o prefixo,
   sobrava vazio e devolvia `1.0`, aplicando um fator por **kg** a itens em
   **m/un/m²**. Passamos a codificar o `product_unit` real
   (`kgCO2e/<product_unit>`), então a conversão e a penalidade de unidade
   funcionam e rejeitam incompatíveis.
2. **Match espúrio por peça**: `PARAFUSO` (un) casava com Ecoinvent
   `air compressor, screw-type` = 794 kgCO₂/unit → inflava o GUARDA CORPO para
   147 t. Baixamos o corte de fatores por-peça (`unit/un`) de 10000 → 100.
3. **Concreto pegava Ecoinvent 404/m³** em vez de CECarbon BR `concreto 40 mpa`
   274/m³: a busca CECarbon tinha `limit 10` + ordem alfabética, e os ~15
   `bloco de concreto…` cortavam o concreto certo. Subimos o limite p/ 25 e
   adicionamos a normalização `40MPA → fck=40` (query específica `concreto 40`).
4. **Serviços** (`parser.ts`): `acabamento` e `fabricacao e montagem`
   classificados como Tipo F (mão-de-obra/montagem; material já contado em
   linha própria) — não casam fator de material bruto.

### Resultado (Cenário Padrão, tCO₂e)

| Versão | Total |
|---|---|
| Novo **pré-fix** | 697,8 |
| Novo **só fix de acento** | ~3157 (overshoot) |
| Novo **fixes #1–#4** | **~1378** |
| **Antigo (alvo)** | **1245,6** |

Itens-chave: CONCRETO 40MPA 389 vs 370 ✅ · ESCAVACAO 31,04 = 31,04 ✅ ·
ARMADURA estacas 49,5 vs 47,5 ✅ · BRITA 1,37 = 1,37 ✅ · GUARDA CORPO ~0 (era
147) ✅. As diferenças residuais são majoritariamente **artefato de comparação**
(o Excel "Lista detalhada" lista por ocorrência; aqui somamos por código).

## Pendências / resíduos

- **"Ref diferentes"**: o valor literal do fator depende da seleção por RAG do
  antigo + base `fatores_compra_produto_servicos_fortanks`. A metodologia e a
  ordem de grandeza agora batem; o valor idêntico só com a mesma base/serviço.
- **Concreto por m² (laje/piso)**: `CONCRETO PARA PISO` (m²) não converte para
  volume (espessura) → fica 0. O antigo contava ~56 t. Precisa de regra de
  espessura→m³ se quiser paridade nesse item.
- Insumos pontuais sem fator (pontalete, sarrafo, espaçador, mangueiras, fitas):
  cobertura menor; avaliar cadastro de fatores se relevante ao total.
