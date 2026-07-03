# Validação contra a versão funcional v29 (pulper pit)

Referência: `simulation/relatorio_pulperpit_v29.xlsx` — saída da versão antiga
funcional. **Critério de aceite: o simulador deve reproduzir estes totais** (no
mínimo) para os arquivos de exemplo em `simulation/`.

## Entradas

| Cenário | Itens | Insumos |
|---|---|---|
| 🟢 Padrão | `Solucao estaca helice.xlsx` | `SECAGEM-Sump Pit_In Loco.xlsx` |
| 🔵 Novo | `Solucao estaca prancha pulper pit - secagem.xlsx` | `SECAGEM-Sump Pit_Estaca Prancha.xlsx` |

## Totais-alvo (v29)

| Cenário | Emissões Totais |
|---|---|
| **Padrão (helice / In Loco)** | **1.245,56 tCO₂e** |
| **Novo (prancha / pulper pit)** | **504,12 tCO₂e** |

## Tabela de fatores usada pelo v29 (a "verdade")

Fatores em **tCO₂e por unidade** (o sistema atual armazena em kgCO₂ → ×1000).

| Material (insumo) | Fator (t/un) | Unid | Fonte |
|---|---|---|---|
| CONCRETO USINADO 40MPA (silica/slump/auto-adensável/4,5mtrf) | 0,281 | m³ | ECOINVENT 3.11 |
| CONCRETO USINADO MAGRO | 0,228 | m³ | ECOINVENT 3.11 |
| CIMENTO PORTLAND (EMB 50KG) | 0,0284 | SC | ECOINVENT 3.11 |
| ADITIVO EXPANSOR (óxido de cálcio) | 0,0284 | KG | ECOINVENT 3.11 |
| OLEO DIESEL / COMBUSTIVEL VEÍCULOS | 0,00264 | L | BEN 2023 |
| ACO CA-50 / CA-25 / CA-60 tela / inserto / parabolt / trelica | 0,00182 | KG | ECOINVENT 3.11 |
| FORMA METALICA QUICKJET | 0,00182 | m² | ECOINVENT 3.11 |
| ARAME (recozido/galvanizado) / PREGO / ELETRODO | 0,00099 | KG | CECARBON 2024 |
| PONTALETE 8X8CM | 0,01306 | M | CECARBON 2024 |
| CAIBRO 7X5CM / SARRAFO 2,5X8CM | 0,00165 | M | CECARBON 2024 |
| CHAPA COMPENSADA PLASTIFICADA/RESINADA 14MM | 0,01262 | FL | CECARBON 2024 |
| TAIPA ESP 2,5CM | 0,1374 | m² (×esp.) | CECARBON 2024 |
| TUBO PVC (…6M) rígido/vinilfort | 0,00154 | PC (×6) | CECARBON 2024 |
| TUBO/CURVA PVC ESGOTO (…6M) | 0,0021 | PC (×6) | CECARBON 2024 |
| ELETRODUTO PVC / CURVA 90 VINILFORT | 0,00782 | M / UN | CECARBON 2024 |
| GRADE / TAMPA FERRO FUNDIDO / CANTONEIRA L | 0,00195 | UN / M | CECARBON 2024 |
| DESMOLDANTE PARA FORMAS | 0,00358 | BD | ECOINVENT 3.11 |
| TINTA RICA EM ZINCO | 0,00051 | GL | CECARBON 2024 |
| GRAXA | 0,0017 | KG | ECOINVENT 3.11 |
| FITA CREPE / FITA ISOLANTE | 0,00031 | UN | ECOINVENT 3.11 |
| SELANTE SIKAFLEX (600ML) | 0,0012 | UN | ECOINVENT 3.11 |
| BRITA GRADUADA | 0,00427 | TON | CECARBON 2024 |
| ISOPOR ESP 2,0CM | 0,00364 | FL | GEMIS |

51 materiais distintos no total (lista completa no relatório).

## Conversões de unidade que o v29 aplica

- **m² → m³** por espessura (taipa "ESP 2,5CM", concreto de piso "15CM").
- **PC → m** por comprimento na descrição (tubo "(6M)" → ×6).
- **M linear** (pontalete/caibro/sarrafo): fator já por metro.
- **SC** (cimento): fator por saco.
- **FL / BD / GL / UN**: fator por embalagem/peça direto.

## Estado atual (a alinhar)

O sistema atual **superestima** o Padrão (helice) — ~1.546–1.652 tCO₂e vs alvo
1.245,56 — porque o match (vetorial + reranker) escolhe fatores diferentes dos
do v29 e algumas conversões de unidade não disparam. O caminho determinístico
para atender o v29 é **semear Factor Rules com esta tabela** (camada 0, por
empresa) + garantir as receitas de unidade acima.
