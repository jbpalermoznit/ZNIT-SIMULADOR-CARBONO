# Validação do Simulador vs Relatório Pulper Pit v29

**Data:** 08/07/2026 · **Insumos de teste:** planilhas reais em `simulation/` · **Harness:** `tests/lib/server/simulation-validation.test.ts` (roda o pipeline de produção: parser → expansão de receitas → Factor Rules → calculadora → agregação do export)

## Resultado

| Cenário | Versão atual | Export | Relatório v29 | Diferença |
|---|---:|---:|---:|---:|
| **Padrão** (hélice) | **1.604,43 tCO₂e** | 1.604,43 | 1.245,56 | +358,87 t (+28,8%) |
| **Novo** (prancha) | **567,05 tCO₂e** | 567,05 | 504,12 | +62,93 t (+12,5%) |

**Export ≡ Cálculo:** o export lê os mesmos valores persistidos que a calculadora grava (`scenario_items.emission_kgco2e`), com diferença máxima de 0,0002 t (arredondamento de 4 casas por linha). Validado pelo harness a cada execução.

## 100% da diferença é atribuível — linha a linha

A versão atual é um **superset exato** do v29: todo insumo que o v29 reportou aparece com a MESMA emissão na versão atual (invariante travado por teste). A diferença vem exclusivamente de **linhas do orçamento que o v29 omitiu do relatório**:

### Cenário Padrão (+358,87 t)

| Δ | Causa | Evidência no orçamento |
|---:|---|---|
| **+295,45 t** | Linha de armadura omitida: das 4 ocorrências de `S00043 — ARMADURA CA-50` no orçamento, o v29 reportou só as 3 menores. A maior — **7.1.3.8, 154.605,06 kg** (paredes in loco; taxa ~123 kg/m³ de concreto, plausível) — não aparece no relatório. | `Solucao.estaca.helice`, linha 7.1.3.8 |
| **+55,73 t** | Item `S02824 — CONCRETO PARA PISO 15CM` (1.259,16 m², R$ 310 mil) omitido por completo no Padrão — **o próprio v29 o calculou no cenário Novo**, evidenciando inconsistência interna da versão anterior. | linha 7.1.7.10 |
| **+5,63 t** | Aditivo expansor — insumo da receita do piso omitido acima. | idem |
| **+1,92 t** | Arame recozido — insumo das armaduras omitidas acima. | idem 7.1.3.8 |
| **+0,14 t** | Cimento das receitas de concreto (idem). | — |
| **= +358,87 t** | **Fecha exatamente com a diferença total.** | |

### Cenário Novo (+62,93 t)

| Δ | Causa | Evidência no orçamento |
|---:|---|---|
| **+50,06 t** | Das 3 linhas de `S01115 — CONCRETO USINADO 40MPA` no orçamento (204,7 + 169,68 + 259,32 m³), o v29 reportou só 2. A linha **21.4.6 — 169,68 m³** (seção pré-moldada) foi omitida. | `Solucao.estaca.prancha`, linha 21.4.6 |
| **+8,11 t** | Linha **21.4.5 — ARMADURA CA-50, 4.242,26 kg** omitida (o v29 incluiu a linha equivalente no Padrão — de novo, inconsistência entre cenários). | linha 21.4.5 |
| **+4,26 t** | Linha **21.4.4 — ARMADURA CA-60 TELA, 2.036,21 kg** omitida. | linha 21.4.4 |
| **+0,50 t** | Treliça, cimento e arame das receitas acima. | — |
| **= +62,93 t** | **Fecha exatamente com a diferença total.** | |

## Por que a versão atual é melhor

1. **Não perde linhas do orçamento.** O v29 omitiu itens de forma não determinística (inclusive a maior linha de armadura do projeto, 154,6 t de aço ≈ 295 tCO₂e) e foi inconsistente entre cenários (mesmo item contado no Novo e ignorado no Padrão). A versão atual processa todas as linhas e o harness prova a conciliação item a item.
2. **Transparência de cobertura.** O v29 simplesmente não mostrava itens sem fator. A versão atual os lista como pendência visível (~25 itens por cenário, ex.: `ACO CA-50 PARA PRE-MOLDADO`, 58,8 t de aço — que o v29 também não contou, mas escondia). O analista decide, nada some em silêncio.
3. **Mesmos fatores, mesma metodologia.** Os fatores efetivos são as Factor Rules extraídas do próprio v29 (seed travado por teste contra o fixture); índices de consumo (perdas, tip. 1,05) idênticos aos do v29. A diferença NÃO vem de fatores diferentes.
4. **Export auditável.** Export lê o valor persistido do cenário — o mesmo número da tela e do `scenario_results` — com validação automatizada.

## Números para comunicação ao cliente

- Padrão: **1.604,43 tCO₂e** (v29 reportou 1.245,56; a diferença são 154,6 t de aço + 1.259 m² de piso que estavam no orçamento e ficaram fora do relatório anterior)
- Novo: **567,05 tCO₂e** (v29 reportou 504,12; diferença = seção pré-moldada parcialmente omitida)
- Redução Padrão→Novo: **−1.037,38 tCO₂e (−64,7%)** — no v29 a redução aparentava −741,44 t (−59,5%). A conclusão qualitativa (estaca prancha emite muito menos) se mantém e fica ainda mais forte.

## Pendências conhecidas (ambas as versões)

- ~25 insumos por cenário sem fator (conectores, mangueiras, itens `vb`) — impacto individual pequeno, exceto **`ACO CA-50 PARA PRE-MOLDADO` (58,8 t no Padrão / 47,6 t no Novo ≈ 107/87 tCO₂e)**: recomenda-se criar uma Factor Rule de aço genérico para capturá-lo. Isso aumentaria os totais das DUAS versões igualmente.
- Fatores do seed continuam marcados "revisar" (herdados do v29).

## Reprodutibilidade

```bash
npx vitest run tests/lib/server/simulation-validation.test.ts
# → totais + simulation/validation-report.json (diff por insumo, atribuído por item-pai)
```
