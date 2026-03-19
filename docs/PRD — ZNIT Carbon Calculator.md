# PRD — ZNIT Carbon Calculator
**Versão:** 1.1 | **Data:** 2026-03-17 | **Autor:** João Palermo (ZNIT)
**Status:** Piloto Grupo HTB — Raízen VRO R8

---

## 1. Visão do Produto

### 1.1 Problema
Empresas de construção civil não conseguem calcular a pegada de carbono dos seus projetos durante a fase de orçamentação. O processo atual é:
- 100% manual, baseado em planilhas locais
- Sem fatores de emissão atrelados aos materiais do orçamento
- Sem capacidade de comparar cenários de materiais sustentáveis
- Sem output claro para propostas comerciais com dados de carbono

### 1.2 Solução
Plataforma SaaS que recebe a Curva ABC exportada do iTwo (sistema de orçamentação), mapeia automaticamente fatores de emissão (EPDs) por item, calcula a pegada de carbono e gera cenários comparativos — tudo sem alterar o processo atual da equipe de orçamento.

### 1.3 Proposta de Valor
> "Em menos de 1 hora, a equipe de orçamento tem o inventário de carbono do projeto e alternativas de materiais para value engineering sustentável."

### 1.4 Usuários-alvo

| Persona | Papel | Dor Principal |
|---|---|---|
| **Analista de Orçamento** | Exporta ABC curve do iTwo, valida itens | Não tem tempo para processo manual de carbono |
| **Analista ESG** | Parametriza materiais, gera cenários | Falta de ferramenta específica para construção |
| **Gestor de Inovação ESG** | Avalia resultados, decide continuidade | Sem dados confiáveis para proposta executiva |
| **Executivo** | Consome dashboard, assina proposta | Sem visibilidade do impacto ambiental do portfólio |

### 1.5 Contexto do Piloto
- **Cliente:** Grupo HTB
- **Projeto:** Raízen VRO R8 (~R$ 102M)
- **Duração:** 90 dias (gratuito, NDA assinado)
- **Comparação:** Resultado ZNIT vs solução interna CLIMAS da HTB
- **Decisão pós-piloto:** Expansão para outros projetos e integração ao processo padrão

---

## 2. Escopo

### 2.1 Dentro do Escopo (v1 — Piloto)
- Upload e processamento de Curva ABC em formato XLSX/XLSM (iTwo)
- Banco de fatores de emissão organizado em hierarquia de 3 tiers: EPD certificada → GHG Protocol BR → Ecoinvent
- Mapeamento automático de itens a fatores de emissão
- Parametrização manual de itens não mapeados
- Cálculo de emissões Scope 1, 2 e 3 (logística)
- Geração de até 6 cenários com versionamento
- Comparativo de cenários (tCO₂e e tCO₂e/unidade funcional)
- Dashboard executivo de top emissores
- Alertas para itens sem EPD mapeado
- Exportação Excel/CSV (compatível Power BI)
- Memorando de cálculo em PDF
- Identidade visual do cliente nos relatórios
- Multi-usuário com papéis (admin, analista, viewer)
- Suporte e treinamento durante POC

### 2.2 Fora do Escopo (v1)
- Integração API em tempo real com iTwo
- Mais de 6 cenários por projeto
- Cálculo de Scope 1 e 2 operacional (foco é Scope 3 embodied carbon)
- App mobile
- Integração com Power BI em tempo real (apenas export manual)
- Geolocalização automática de fornecedores

### 2.3 Roadmap Futuro (pós-piloto)
- Integração API nativa com iTwo, Totvs, Sienge
- Comparação automática com CLIMAS (API HTB)
- Marketplace de EPDs (EPD Norge, IBU, Inies)
- Power BI Connector live
- Módulo de gestão de execução de obra (tracking real vs planejado)

---

## 3. Requisitos Funcionais

### RF-01 — Gestão de Projetos
| ID | Requisito | Prioridade |
|---|---|---|
| RF-01.1 | Criar projeto com nome, cliente, endereço, área total (m²), tipo de obra | Must Have |
| RF-01.2 | Listar projetos por empresa com filtros (status, data, cliente) | Must Have |
| RF-01.3 | Arquivar e restaurar projetos | Should Have |
| RF-01.4 | Dashboard geral com portfólio de projetos e emissões agregadas | Could Have |

### RF-02 — Importação da Curva ABC
| ID | Requisito | Prioridade |
|---|---|---|
| RF-02.1 | Upload de arquivo XLSX e XLSM (formato iTwo) | Must Have |
| RF-02.2 | Parser detecta automaticamente colunas: CostCode, Descrição, Quantidade, Unidade, Custo Total | Must Have |
| RF-02.3 | Preview da tabela antes de confirmar importação | Must Have |
| RF-02.4 | Detecção e sinalização de itens agrupados (ex: múltiplos materiais em um código) | Must Have |
| RF-02.5 | Normalização de unidades (m², m³, kg, h, un, m, t) | Must Have |
| RF-02.6 | Cálculo automático de Classificação Pareto por % custo acumulado: P1 (0–80%), P2 (80–95%), P3 (95–100%) — nomenclatura P1/P2/P3 para evitar confusão com tipos de item A–F | Must Have |
| RF-02.7 | Histórico de importações por projeto (data, arquivo, usuário) | Should Have |
| RF-02.8 | Template padrão para download (formato esperado pelo sistema) | Should Have |

### RF-03 — Banco de Fatores de Emissão

> **Modelo de dados:** cada fator tem um campo `source_tier` que define a qual nível da hierarquia pertence. O sistema busca fatores em ordem de prioridade: EPD certificada → GHG Protocol → Ecoinvent. Ver _EPD Data Requirements_ para o schema completo.

#### Hierarquia de fontes

| Tier | Tipo | Uso | Exemplo |
|---|---|---|---|
| **1 — EPD** | Declaração ambiental de produto certificada por terceiros | Primeira escolha — mais específico e preciso | EPD Votorantim Concreto 2024, EPD Gerdau Aço 2023 |
| **2 — GHG Protocol** | Fatores setoriais médios com contexto brasileiro | Fallback preferencial quando não há EPD | GHG Protocol BR — Concreto Fck=30: 355 kgCO₂e/m³ |
| **3 — Ecoinvent** | Base LCA processo a processo, referência global | Fallback secundário; requer atenção aos limites de sistema (origem europeia) | Ecoinvent 3.10 — Steel rebar: 1,70 kgCO₂e/kg |

| ID | Requisito | Prioridade |
|---|---|---|
| RF-03.1 | Banco de fatores com campos: `source_tier`, `material_name`, `variant_name`, `category`, `factor_kgco2e_per_unit`, `unit`, `scope`, `source`, `system_boundary`, `region`, `valid_until`, `keywords` | Must Have |
| RF-03.2 | Campo `source_tier` obrigatório em todos os fatores: `"epd"` \| `"ghg_protocol"` \| `"ecoinvent"` | Must Have |
| RF-03.3 | Escopo por fator: Scope 1 (combustão direta), Scope 2 (energia), Scope 3 (materiais e logística) | Must Have |
| RF-03.4 | Fatores com múltiplas variantes por tier (ex: Concreto Fck=30 convencional vs 30% cinza volante, ambos em GHG Protocol) | Must Have |
| RF-03.5 | ZNIT Admin pode adicionar, editar e versionar fatores em qualquer tier | Must Have |
| RF-03.6 | Fatores Ecoinvent registram `system_boundary` (ex: "A1-A3") e `region` ("EU", "Global", "BR") para rastreabilidade | Must Have |
| RF-03.7 | Alerta no memorando quando fator Ecoinvent é aplicado: origem europeia e limite de sistema | Must Have |
| RF-03.8 | Visualização do banco de fatores pelo cliente com filtro por tier, categoria e fonte (read-only) | Should Have |

### RF-04 — Mapeamento de Fatores por Item

> O mapper busca fatores em ordem de tier (EPD → GHG Protocol → Ecoinvent). Quando nenhum tier retorna score ≥ 60, o item entra no fluxo de fallback manual.

| ID | Requisito | Prioridade |
|---|---|---|
| RF-04.1 | Mapeamento automático por tier: busca EPD primeiro; se score < 60, tenta GHG Protocol; se score < 60, tenta Ecoinvent | Must Have |
| RF-04.2 | Score de confiança exibido (alta ≥ 80, média 60–79, baixa < 60) + tier utilizado (EPD / GHG Protocol / Ecoinvent) | Must Have |
| RF-04.3 | Interface de revisão e ajuste manual: busca por qualquer tier, filtro por `source_tier`, seleção de variante alternativa | Must Have |
| RF-04.4 | Itens sem match em nenhum tier entram no fluxo de fallback (ver RF-04.9 a RF-04.11) | Must Have |
| RF-04.5 | Salvar mapeamento CostCode → fator como regra reutilizável em projetos futuros | Must Have |
| RF-04.6 | Campos de Scope 3 logística por item: distância km, modal (caminhão/trem/navio), tonelagem | Must Have |
| RF-04.7 | Drawer de parametrização por item com todos os campos editáveis e tier atual visível | Must Have |
| RF-04.8 | Bulk mapping: aplicar fator a múltiplos itens de uma vez | Should Have |
| RF-04.9 | **Fallback nível 1:** analista insere fator manual (valor + unidade + fonte + justificativa); registrado como `mapped_by = "user_custom"` | Must Have |
| RF-04.10 | **Fallback nível 2:** excluir item do inventário com justificativa obrigatória; registrado no memorando como item fora do escopo | Must Have |
| RF-04.11 | Indicador na tabela de itens distingue: mapeado por EPD / GHG Protocol / Ecoinvent / manual / excluído | Must Have |

### RF-05 — Cálculo de Emissões
| ID | Requisito | Prioridade |
|---|---|---|
| RF-05.1 | Cálculo por item: `Emissão = Quantidade × Fator_EPD` | Must Have |
| RF-05.2 | Total do projeto em kgCO₂e e tCO₂e | Must Have |
| RF-05.3 | Intensidade: tCO₂e/m², tCO₂e/m³, tCO₂e/unidade funcional | Must Have |
| RF-05.4 | Breakdown por scope (Scope 1, 2, 3) | Must Have |
| RF-05.5 | Scope 3 logística: `Emissão_log = distância_km × tonelagem × fator_modal` | Must Have |
| RF-05.6 | Recalculo automático ao alterar qualquer parâmetro | Must Have |
| RF-05.7 | Rastreabilidade: cada emissão mostra tier (EPD/GHG Protocol/Ecoinvent/manual), fonte, data de validade e `system_boundary` quando aplicável | Must Have |
| RF-05.8 | % cobertura: total de itens com emissão calculada vs total de itens | Must Have |

### RF-06 — Cenários e Versionamento
| ID | Requisito | Prioridade |
|---|---|---|
| RF-06.1 | Criar cenário base (Cenário 0) a partir da importação | Must Have |
| RF-06.2 | Duplicar cenário e editar materiais/EPDs para criar alternativas | Must Have |
| RF-06.3 | Máximo de 6 cenários por projeto na v1 | Must Have |
| RF-06.4 | Nomear e descrever cada cenário (ex: "Cenário A — Concreto com cinza volante") | Must Have |
| RF-06.5 | Histórico de alterações por cenário (o que mudou, quando, quem) | Must Have |
| RF-06.6 | Comparativo lado a lado: até 3 cenários simultaneamente | Must Have |
| RF-06.7 | Delta entre cenários: tCO₂e economizados, % redução, economia em R$ (estimada) | Must Have |
| RF-06.8 | Sugestão automática de materiais substitutos com menor fator de emissão | Should Have |
| RF-06.9 | Lock de cenário (readonly após aprovação) | Could Have |

### RF-07 — Dashboard e Visualizações
| ID | Requisito | Prioridade |
|---|---|---|
| RF-07.1 | Gráfico Pareto de top emissores (itens × tCO₂e) | Must Have |
| RF-07.2 | Cards KPI: total tCO₂e, intensidade tCO₂e/m², % cobertura, % itens Classe A cobertos | Must Have |
| RF-07.3 | Gráfico de barras comparativo de cenários | Must Have |
| RF-07.4 | Breakdown de emissões por scope (donut chart) | Must Have |
| RF-07.5 | Tabela de todos os itens com filtros (classe ABC, status EPD, categoria) | Must Have |
| RF-07.6 | Painel de alertas: itens sem EPD, itens agrupados pendentes | Must Have |
| RF-07.7 | Filtro por categoria de material (concreto, aço, solo, madeira, etc.) | Should Have |
| RF-07.8 | Timeline de evolução de emissões entre versões de cenário | Could Have |

### RF-08 — Relatórios e Exportações
| ID | Requisito | Prioridade |
|---|---|---|
| RF-08.1 | Exportação Excel: todos os itens com emissões calculadas (compatível Power BI) | Must Have |
| RF-08.2 | Exportação CSV: formato plano para integração | Must Have |
| RF-08.3 | Memorando de cálculo em PDF: premissas, metodologia, tier e fonte por item, avisos para fatores Ecoinvent (origem europeia, system boundary), lista de itens excluídos com justificativa | Must Have |
| RF-08.4 | Logo e paleta do cliente nos relatórios (identidade visual HTB para o piloto) | Must Have |
| RF-08.5 | Relatório comparativo de cenários em PDF | Should Have |
| RF-08.6 | Export de apenas itens Classe A (filtrado) | Should Have |

### RF-09 — Usuários e Multi-tenant
| ID | Requisito | Prioridade |
|---|---|---|
| RF-09.1 | Autenticação: email/senha + reset de senha por email | Must Have |
| RF-09.2 | Multi-tenant: dados isolados por empresa | Must Have |
| RF-09.3 | Papéis: Admin, Analista, Viewer | Must Have |
| RF-09.4 | Convite de usuários por email | Must Have |
| RF-09.5 | Admin ZNIT: acesso a todas as empresas (superadmin) | Must Have |
| RF-09.6 | Log de atividades por projeto (quem fez o quê) | Should Have |

### RF-10 — Gestão de Premissas e Tipologia de Itens

> **Contexto real:** Análise da `Curva ABC_Raizen VRO_R8.xlsm` (116 itens) e `Cost Code - itwo.xlsx` (1.584 códigos) revelou que os itens do iTwo se dividem em **6 tipos distintos**, cada um com uma lógica de tratamento diferente para cálculo de carbono. O sistema precisa reconhecer e tratar cada tipo explicitamente.

#### Mapa de Tipologia de Itens (baseado nos arquivos reais)

| Tipo | Tag | Descrição | Exemplo real | Tratamento |
|---|---|---|---|---|
| **A — Material Direto** | `material` | Material físico com EPD documentado | Aço CA50, Concreto Fck=30, Bloco de concreto | Mapeamento automático → fator EPD direto |
| **B — Mão de Obra** | `labor` | Serviço humano sem material físico | Oficial Forma, Servente Concreto, Encarregado, Salário Médio | Requer definição de premissa metodológica |
| **C — Item Agrupado** | `grouped` | Um código engloba múltiplos materiais/serviços | `450201-SubTerrapl-Pav-Dren`, Estaca Hélice, DryWall | Bloqueado até ser decomposto |
| **D — Serviço com Material Embutido** | `embedded` | Serviço especializado onde o material já foi contado separadamente | Corte e Dobra de Aço, Bombeamento de Concreto, Arrasamento de Estaca | Requer análise de dupla contagem |
| **E — Equipamento/Locação** | `equipment` | Equipamento que emite por horas de uso ou combustível | Retroescavadeira (h), Caminhão Basculante (h), Andaime | Requer dados de operação: h de uso, combustível, modal |
| **F — Administrativo/Indireto** | `indirect` | Sem emissão direta clara | Salário Mensalista, Ensaios, Horas de Planejamento, Diesel | Decisão de escopo: incluir ou excluir com justificativa |

#### Distribuição real no projeto Raízen VRO R8

| Tipo | Qtd de itens | % do orçamento (estimado) | Ação necessária |
|---|---|---|---|
| A — Material Direto | ~86 itens | ~55% | Mapeamento automático (foco principal) |
| B — Mão de Obra | ~63 itens | ~25% | Definir premissa: incluir ou não no inventário |
| C — Agrupado | ~34 itens | ~10% | Decomposição obrigatória antes de calcular |
| D — Serviço c/ Material Embutido | ~9 itens | ~5% | Análise de dupla contagem |
| E — Equipamento | ~4 itens | ~3% | Dados operacionais complementares |
| F — Administrativo | ~13 itens | ~2% | Decisão de inclusão no escopo |

#### Requisitos por tipo de item

| ID | Requisito | Prioridade |
|---|---|---|
| RF-10.1 | Parser classifica automaticamente cada item em um dos 6 tipos (A-F) via CostCode prefix e keywords na descrição | Must Have |
| RF-10.2 | Tipo exibido como badge colorido na tabela de itens | Must Have |
| RF-10.3 | Filtro da tabela por tipo (A, B, C, D, E, F) | Must Have |
| RF-10.4 | **Tipo A:** Mapeamento automático EPD como fluxo padrão | Must Have |
| RF-10.5 | **Tipo B (Mão de Obra):** Wizard de definição de premissa com 3 opções: (1) Excluir do inventário com justificativa, (2) Incluir via fator indireto por hora trabalhada, (3) Incluir via Scope 3 de deslocamento de trabalhadores | Must Have |
| RF-10.6 | **Tipo C (Agrupado):** Item bloqueado para cálculo com badge "Aguardando decomposição". Interface para o analista inserir sub-itens manualmente ou solicitar suporte ZNIT | Must Have |
| RF-10.7 | **Tipo D (Material Embutido):** Alerta de risco de dupla contagem. Analyst confirma se o material já foi contado em outro item antes de mapear fator | Must Have |
| RF-10.8 | **Tipo E (Equipamento):** Campos adicionais na parametrização: horas de uso, tipo de combustível, consumo (L/h ou kWh/h). Fator de emissão calculado via: horas × consumo × fator combustível | Must Have |
| RF-10.9 | **Tipo F (Administrativo):** Decisão binária: Incluir (com fator genérico) ou Excluir (com justificativa registrada no memorando). Óleo Diesel tem fator direto de combustão | Must Have |
| RF-10.10 | Premissas de cada tipo registradas e exportadas no memorando de cálculo | Must Have |
| RF-10.11 | KPI na tela de overview: "X itens aguardando decomposição (Tipo C)", "Y itens com premissa pendente" | Must Have |
| RF-10.12 | Reclassificação manual de tipo pelo analista (com justificativa) | Should Have |

#### Decisões de Premissa — Casos Específicos do Raízen

**Mão de Obra (Tipo B) — 3 opções de premissa:**
```
Opção 1 (Recomendada para piloto): EXCLUIR
  → Justificativa: foco em embodied carbon de materiais (Scope 3)
  → Registrar no memorando como premissa acordada

Opção 2: INCLUIR via fator indireto
  → Fator: ~0,03 tCO₂e/trabalhador/mês (referência: IPCC)
  → Requer: nº de trabalhadores × duração em meses

Opção 3: INCLUIR via deslocamento (Scope 3)
  → Requer: nº trabalhadores, distância média residência-obra, modal
```

**Itens Agrupados (Tipo C) — Workflow de decomposição:**
```
Ex: 450201-SubTerrapl-Pav-Dren (8,8% do orçamento = ~R$9M)
→ Bloquear cálculo do item agrupado
→ Solicitar ao contratante: planilha decomposta com:
    - Terraplenagem: X m³ a R$/m³
    - Pavimentação: Y m² a R$/m²
    - Drenagem: Z m a R$/m
→ Inserir sub-itens manualmente como Tipo A
→ Mapear EPD individualmente
→ Item original marcado como "Resolvido via decomposição"
```

**Equipamentos (Tipo E) — Cálculo de emissão:**
```
Ex: Retroescavadeira (440105-Retro) — unidade: horas
→ Dados necessários:
    - Horas totais na obra (da ABC curve: já disponível)
    - Consumo: ~15 L diesel/hora (valor padrão editável)
    - Fator diesel: 2,68 kgCO₂e/L (GHG Protocol BR)
→ Emissão = horas × consumo_L_h × 2,68 kgCO₂e/L
→ Se elétrico: horas × consumo_kWh × fator_grid_BR (0,1 kgCO₂e/kWh)
```

**Diesel Operacional (Tipo F — caso especial):**
```
Ex: 460114-OléoDiesel — tem fator de emissão direto
→ Tratar como Tipo A (exceção ao Tipo F)
→ Fator: 2,68 kgCO₂e/L (Scope 1 — combustão)
→ Reclassificar para Tipo A com nota
```

---

## 4. Agente de IA para Itens Complexos (Tipos C, D, E, F)

> **Princípio:** Nenhum formulário ou wizard para itens complexos. Um agente de IA conduz uma conversa natural com o analista, coleta as informações necessárias, toma decisões fundamentadas e persiste cada decisão como regra reutilizável. Na próxima vez que um item similar aparecer — em qualquer projeto — o agente aplica a regra sem precisar perguntar novamente.

---

### 4.1 Arquitetura do Agente

O agente é um LLM (Claude API com tool use) com acesso a ferramentas que lêem e escrevem no banco de dados da plataforma. Ele opera em dois modos:

```
MODO CONVERSA
  Usuário abre o painel "Itens Pendentes" e o agente inicia a sessão.
  O agente conduz um diálogo para resolver cada item Tipo C/D/E/F,
  um por um ou em lote quando são do mesmo tipo.

MODO AUTÔNOMO (background)
  Após importação, o agente verifica a Premissa Library.
  Para cada item com regra de alta confiança:
    → aplica sem interação humana
    → registra no log de auditoria
  Entra em modo conversa apenas para os itens sem regra.
```

**Ferramentas disponíveis para o agente:**

```python
tools = [
  get_item_details(item_id)               # dados completos do item
  search_premissa_library(cost_code, keywords, item_type)  # regras salvas
  get_similar_items_in_project(item_id)   # agrupa itens análogos no mesmo projeto
  get_equipment_profiles()                # biblioteca de perfis de equipamento
  get_corporate_policies(company_id)      # políticas já definidas pela empresa
  check_double_count_risk(item_id)        # detecta pares com risco de dupla contagem
  apply_premissa(item_id, config)         # grava decisão no banco
  save_rule(match_pattern, config, visibility)  # persiste regra para uso futuro
  request_clarification(question)         # pergunta para o usuário (retorna resposta)
  suggest_and_confirm(suggestion)         # propõe decisão e aguarda aceite/ajuste
]
```

---

### 4.2 Fluxo Pós-Importação com o Agente

```
Upload da Curva ABC
        │
        ▼
Parser classifica itens em tipos A-F
        │
        ▼
Agente — Modo Autônomo (background, segundos)
  ├─ Consulta Premissa Library para cada item Tipo C/D/E/F
  ├─ Aplica regras com confiança ≥ 0.85 automaticamente
  └─ Prepara fila de itens pendentes (sem regra ou baixa confiança)
        │
        ▼
Tela de revisão pós-importação
┌───────────────────────────────────────────────────────┐
│  Raízen VRO R8 — Importação concluída                │
│                                                       │
│  ✅ 86 itens Tipo A mapeados automaticamente          │
│  ✅ 41 regras aplicadas pelo agente (sem interação)   │
│  💬 18 itens aguardam conversa com o agente          │
│                                                       │
│  [Iniciar sessão com o agente →]                     │
└───────────────────────────────────────────────────────┘
        │
        ▼
Painel de Chat com o Agente
  → Agente resolve os 18 itens em conversa com o analista
```

---

### 4.3 Interface do Agente — Painel de Chat

O painel tem duas colunas: à esquerda a lista de itens pendentes, à direita a conversa com o agente. O agente navega entre os itens, mostrando qual está tratando no momento.

```
┌─────────────────────────┬──────────────────────────────────────────────┐
│  ITENS PENDENTES (18)   │  AGENTE ZNIT                                 │
│                         │                                              │
│  ⛔ Tipo C (5 itens)    │  Olá! Vou te ajudar a parametrizar 18 itens │
│  > SubTerrapl-Pav-Dren  │  que precisam de informação adicional.      │
│    SubHélice            │                                              │
│    SubFormasMetálicas   │  Começando pelo item de maior impacto no    │
│    SubEstruturaMetálica │  orçamento:                                  │
│    SubImpermeabilização │                                              │
│                         │  ┌──────────────────────────────────────┐   │
│  ⚠️ Tipo D (4 itens)    │  │ 450201 — SubTerrapl-Pav-Dren         │   │
│  > Corte e Dobra Aço    │  │ Custo: R$ 8,98M  |  Classe A         │   │
│    Bombeamento Concreto │  │ Tipo: Agrupado (C)                   │   │
│    Arrasamento Estaca   │  └──────────────────────────────────────┘   │
│    Estaca Piloto        │                                              │
│                         │  Este item engloba Terraplenagem,           │
│  🔧 Tipo E (4 itens)    │  Pavimentação e Drenagem juntos — não       │
│  > Retroescavadeira     │  consigo calcular o carbono sem separar.    │
│    Caminhão Basculante  │                                              │
│    Máquina de Solda     │  Você tem os quantitativos separados para   │
│    Andaime              │  cada serviço, ou prefere que eu estime a   │
│                         │  distribuição com base em obras similares?  │
│  📋 Tipo F (5 itens)    │                                              │
│  > Salário Mensalistas  │  [Tenho os dados]   [Pode estimar]          │
│    Horas Planejamento   │                                              │
│    Ensaio PIT           │  ──────────────────────────────────────     │
│    Controle Concreto    │  Você: Pode estimar                         │
│    Prova de Carga       │                                              │
│                         │  Baseado em 12 obras industriais similares  │
│                         │  na base ZNIT, a distribuição típica é:     │
│                         │                                              │
│                         │  • Terraplenagem:  58% → R$ 5,21M          │
│                         │  • Pavimentação:   27% → R$ 2,42M          │
│                         │  • Drenagem:       15% → R$ 1,35M          │
│                         │                                              │
│                         │  Posso usar essa distribuição para o Raízen │
│                         │  ou quer ajustar as proporções?             │
│                         │                                              │
│                         │  [Usar essa distribuição]  [Ajustar]        │
└─────────────────────────┴──────────────────────────────────────────────┘
```

---

### 4.4 Comportamento do Agente por Tipo

#### Tipo C — Agrupados: o agente decompõe com estimativa ou dados

```
Agente → identifica serviços dentro do código
Agente → verifica se existe template salvo para o CostCode
  SE SIM  → propõe template com valores ajustáveis (1 mensagem)
  SE NÃO  → pergunta se o analista tem dados ou quer estimativa
              → com dados: coleta quantitativos via chat
              → com estimativa: usa base de projetos similares + confirma
Agente → aplica decomposição
Agente → "Salvo este template para o próximo projeto?"
```

**Exemplo de conversa — Tipo C com template existente:**
```
Agente:  "O item 'SubHélice' (R$ 2,1M) também é agrupado. Já resolvi
          um item similar em outro projeto da HTB. Minha sugestão:

          Estaca Hélice Contínua — distribuição padrão HTB:
          • Concreto (40%): 840 m³ → estimado via fck e diâmetro
          • Aço CA50 (25%): 137.000 kg
          • Serviço perfuração (35%): excluído (mão de obra)

          Aplico esse template ou você tem os quantitativos exatos?"

Usuário: "Aplica, mas o aço aqui é CA60, não CA50"

Agente:  "Anotado — usando CA60. Emissão ajustada: 252 tCO₂e.
          Atualizei o template para esta empresa."
```

---

#### Tipo D — Dupla Contagem: o agente detecta e propõe

```
Agente → detecta par suspeito (serviço + material)
Agente → explica o risco em linguagem simples
Agente → propõe a solução mais comum para aquele par
  SE aceito  → aplica + salva regra "par X+Y → excluir Y"
  SE ajuste  → coleta o fator de energia do processo (ex: kWh/ton)
Agente → "Aplicar esta regra para todos os outros projetos?"
```

**Exemplo:**
```
Agente:  "Encontrei um risco de dupla contagem:
          • Aço CA50 (420301): 612 tCO₂e — já calculado como material
          • Corte e Dobra (450503): seria contado como serviço

          Em 94% dos casos que vi, 'Corte e Dobra' é excluído porque
          o aço já carrega essa emissão. Excluo aqui também?"

Usuário: "Sim"

Agente:  "Feito. Salvarei a regra: 'Quando CA50 e Corte e Dobra
          coexistem, excluir Corte e Dobra'. Aplico em projetos futuros
          da HTB automaticamente?"

Usuário: "Sim, pode salvar"
```

---

#### Tipo E — Equipamentos: o agente usa perfis e coleta dados operacionais

```
Agente → verifica se existe perfil salvo para o equipamento
  SE SIM (alta conf) → aplica automaticamente, informa na conversa
  SE SIM (baixa conf) → propõe perfil + confirma dados
  SE NÃO → pergunta combustível e consumo, sugere padrão editável
Agente → calcula emissão = horas × consumo × fator
Agente → "Salvo perfil 'Retroescavadeira — HTB padrão'?"
```

**Exemplo:**
```
Agente:  "Retroescavadeira (440105): 480 horas de uso.
          Não tenho perfil salvo para esta empresa ainda.

          Para retroescavadeiras em obra civil, o consumo típico
          é 14-16 L/h de diesel. Posso usar 15 L/h como padrão?

          Emissão estimada: 480h × 15L/h × 2,68 kgCO₂/L = 19,3 tCO₂e"

Usuário: "Usa 16 L/h, essa máquina é maior"

Agente:  "Ajustado: 20,5 tCO₂e. Salvo perfil 'Retroescavadeira grande
          — 16L/h diesel' para os próximos projetos?"
```

---

#### Tipo B/F — Mão de Obra e Administrativos: política única, aplicada em massa

```
Agente → ao encontrar o primeiro item Tipo B, verifica política corporativa
  SE política existe → informa que aplicará a todos (sem perguntar item a item)
  SE não existe      → faz UMA pergunta de política, não por item
Agente → aplica política a todos os itens B/F de uma vez
Agente → registra no memorando como premissa metodológica
```

**Exemplo — primeiro projeto da HTB:**
```
Agente:  "Encontrei 63 itens de mão de obra (Tipo B) neste projeto.
          Como a HTB trata esses itens no inventário de carbono?

          As opções mais usadas em inventários de embodied carbon são:

          1. Excluir — foco em materiais e logística (GHG Protocol Scope 3)
          2. Incluir via horas trabalhadas — 0,03 kgCO₂e/h por trabalhador
          3. Incluir via deslocamento — requer distância média trabalhador-obra

          Para o primeiro inventário, recomendo a opção 1. O que prefere?"

Usuário: "Opção 1"

Agente:  "Perfeito. Todos os 63 itens de mão de obra foram excluídos
          com justificativa: 'Escopo 3 embodied carbon — mão de obra
          excluída conforme GHG Protocol'.

          Salvo isso como política padrão da HTB? Em projetos futuros
          aplicarei automaticamente, sem precisar perguntar."
```

**Projetos subsequentes (modo autônomo):**
```
[LOG] Política HTB aplicada automaticamente:
  63 itens Tipo B → Excluídos (política: embodied carbon sem MO)
  13 itens Tipo F → Excluídos (mesma política)
  Sem interação necessária.
```

---

### 4.5 Separação de Responsabilidades: Rule Engine vs Agente LLM

**Ponto crítico de arquitetura:** o agente de IA (LLM) é invocado apenas para itens sem regra aplicável. O processamento autônomo é feito por um **rule engine determinístico em Python** — rápido, auditável e sem custo de API.

```
Importação concluída
        │
        ▼
Rule Engine (Python puro — segundos, sem LLM)
  ├─ Para cada item Tipo B/C/D/E/F:
  │   1. Verifica CorporatePolicy → aplica sempre (conf = 1.0)
  │   2. Busca PremissaRule com melhor match → ordena por confidence
  │   3. conf ≥ 0.85 → AUTO-APLICA + loga
  │   4. conf 0.50–0.84 → coloca na fila de sugestões
  │   5. conf < 0.50 ou sem regra → coloca na fila de conversa
        │
        ├─ N itens auto-aplicados (zero interação)
        ├─ M itens com sugestão (1 clique)
        └─ P itens para conversa com o agente LLM
                │
                ▼
          Agente LLM (Claude API)
          invocado apenas para os P itens pendentes
```

---

### 4.6 Anatomia de uma Regra

Cada `PremissaRule` tem três partes: **como encontrar** o item, **o que fazer** com ele, e **o quanto confiar** na regra.

```json
{
  "id": "uuid",
  "item_type": "D",
  "match": {
    "type": "pair",
    "values": ["420301-ca50B", "450503-SubMOCorteDobra"]
  },
  "action": {
    "type": "exclude_item",
    "target_cost_code": "450503-SubMOCorteDobra",
    "reason": "dupla contagem — material já contado em 420301",
    "scope_justification": "GHG Protocol Scope 3 — serviço de processamento excluído"
  },
  "confidence": 0.82,
  "times_applied": 3,
  "times_overridden": 0,
  "visibility": "company",
  "created_from": "agent_conversation",
  "created_at": "2026-03-15T10:23:00Z"
}
```

**Tipos de `match`:**

| match.type | Como funciona | Exemplo |
|---|---|---|
| `exact_cost_code` | CostCode idêntico | `"450201-SubTerrapl-Pav-Dren"` |
| `cost_code_prefix` | CostCode começa com o valor | `"440105"` → casa com qualquer retroescavadeira |
| `keyword` | Palavra-chave na descrição (case-insensitive) | `["Diesel", "Óleo Diesel"]` |
| `category` | Categoria classificada pelo parser | `"equipment:escavadeira"` |
| `pair` | Dois CostCodes coexistem no mesmo projeto | `["420301", "450503"]` |
| `item_type` | Todos os itens de um tipo | `"B"` → todos os itens de mão de obra |

**Tipos de `action`:**

| action.type | O que faz | Para tipo |
|---|---|---|
| `exclude` | Exclui item do inventário com justificativa | B, D, F |
| `apply_corporate_policy` | Aplica política da empresa (substitui regra individual) | B, F |
| `apply_equipment_profile` | Usa perfil de equipamento salvo para calcular | E |
| `apply_decomposition_template` | Carrega template de sub-itens para item agrupado | C |
| `exclude_pair_item` | Exclui um dos dois itens de um par (dupla contagem) | D |
| `reclassify` | Reclassifica item para outro tipo (ex: F → A para diesel) | F→A |
| `include_with_factor` | Inclui com fator específico (ex: kgCO₂e/h para mão de obra) | B, E |

---

### 4.7 Exemplos de Regras — Raízen VRO R8 (primeiro projeto)

Após a primeira sessão com o agente no projeto Raízen, estas regras estariam salvas e prontas para o próximo projeto:

**Regra 1 — Política corporativa HTB (todos os itens Tipo B)**
```json
{
  "item_type": "B",
  "match": { "type": "item_type", "value": "B" },
  "action": {
    "type": "exclude",
    "reason": "Escopo 3 embodied carbon — mão de obra excluída conforme GHG Protocol",
    "memo_text": "Itens de mão de obra excluídos por política HTB v1 (2026-03)"
  },
  "confidence": 1.0,
  "source": "corporate_policy"
}
```
→ No próximo projeto HTB: todos os 63 itens Tipo B excluídos automaticamente em < 1 segundo.

---

**Regra 2 — Dupla contagem CA50 + Corte e Dobra (Tipo D)**
```json
{
  "item_type": "D",
  "match": {
    "type": "pair",
    "values": ["420301-ca50B", "450503-SubMOCorteDobra"]
  },
  "action": {
    "type": "exclude_pair_item",
    "target": "450503-SubMOCorteDobra",
    "reason": "serviço aplicado sobre material já contabilizado"
  },
  "confidence": 0.70
}
```
→ Se os dois itens aparecerem juntos em outro projeto: auto-aplicado quando confidence ≥ 0.85 (após 3 aceitações), sugestão antes disso.

---

**Regra 3 — Retroescavadeira (Tipo E)**
```json
{
  "item_type": "E",
  "match": { "type": "cost_code_prefix", "value": "440105" },
  "action": {
    "type": "apply_equipment_profile",
    "profile_id": "uuid-retro-htb-16lh",
    "profile_name": "Retroescavadeira HTB — 16 L/h diesel"
  },
  "confidence": 0.70
}
```
→ Qualquer item com CostCode começando em `440105` recebe o perfil automaticamente.

---

**Regra 4 — Template de decomposição (Tipo C)**
```json
{
  "item_type": "C",
  "match": { "type": "exact_cost_code", "value": "450201-SubTerrapl-Pav-Dren" },
  "action": {
    "type": "apply_decomposition_template",
    "template_id": "uuid-terrap-pav-dren-htb",
    "template_name": "SubTerrapl-Pav-Dren padrão HTB",
    "sub_items": [
      { "description": "Terraplenagem/Escavação", "cost_pct": 0.58, "unit": "m³" },
      { "description": "Pavimentação", "cost_pct": 0.27, "unit": "m²" },
      { "description": "Drenagem", "cost_pct": 0.15, "unit": "m" }
    ]
  },
  "confidence": 0.80
}
```
→ Próxima vez que `450201-SubTerrapl-Pav-Dren` aparecer: agente propõe o template com valores editáveis. Após 1 aceitação sem modificação: confidence sobe para 0.85 → auto-aplica.

---

**Regra 5 — Diesel (plataforma ZNIT — Tipo F → reclassificar para A)**
```json
{
  "item_type": "F",
  "match": {
    "type": "keyword",
    "values": ["Diesel", "OleoDiesel", "460114"]
  },
  "action": {
    "type": "reclassify",
    "new_type": "A",
    "epd_factor_id": "uuid-diesel-ghg-br",
    "factor_description": "Diesel — combustão direta — 2,68 kgCO₂e/L (GHG Protocol BR)"
  },
  "confidence": 0.95,
  "visibility": "platform"
}
```
→ Regra curada pela ZNIT, compartilhada com todos os clientes. Diesel sempre vira Tipo A e recebe fator direto.

---

### 4.8 Evolução do Score de Confiança

```
Regra criada pelo agente (primeira vez):         0.70
+ Aceita sem qualquer modificação:              +0.05 por ocorrência
+ Aceita com ajuste menor (ex: quantidade):     +0.01
+ Aplicada em projeto de empresa diferente:     +0.03
+ Override (usuário decidiu diferente):         -0.10
+ Override com justificativa diferente:         -0.15

Threshold para sugestão:    ≥ 0.50
Threshold para auto-apply:  ≥ 0.85
Confiança máxima:           1.00 (reservado para políticas e regras ZNIT curadas)
```

**Exemplo de evolução da Regra 2 (dupla contagem CA50 + Corte e Dobra):**
```
Criada:               0.70 → sugestão (usuário confirma)
Projeto 2 (aceita):   0.75 → sugestão (usuário confirma)
Projeto 3 (aceita):   0.80 → sugestão (usuário confirma)
Projeto 4 (aceita):   0.85 → AUTO-APLICA nos projetos seguintes
Projeto 6 (override): 0.75 → volta a sugerir até recuperar confiança
```

---

### 4.9 Log de Auditoria de Cada Regra Aplicada

Todo item resolvido pelo rule engine gera um registro imutável:

```
[2026-03-15 10:23:41] AUTO-APPLY
  Projeto: Raízen VRO R8 | Item: 450503-SubMOCorteDobra | Tipo: D
  Regra: "Dupla contagem CA50 + Corte e Dobra" (id: uuid, conf: 0.87)
  Ação: Excluído do inventário
  Origem: 3 projetos anteriores (HTB), 0 overrides
  Rastreável no memorando: Seção 4.2 — Premissas Tipo D
```

Esse log é exportado no memorando de cálculo e auditável pelo cliente a qualquer momento.

---

### 4.10 Motor de Aprendizado — Como as Regras São Geradas

Cada decisão tomada na conversa gera um ou mais objetos na Premissa Library:

```
Conversa do agente
        │
        ▼
Decisão confirmada pelo usuário
        │
        ├─ Cria ItemPremissa (decisão para o item específico do projeto)
        │
        └─ Cria/atualiza PremissaRule (se o usuário autorizou salvar):
               match_type: "exact_cost_code" | "keyword" | "category"
               match_value: "450201" | "Corte e Dobra" | "equipamento:escavadeira"
               confidence_score: começa em 0.7, sobe a cada aceitação
               visibility: "company" | "platform"

Na próxima importação:
  PremissaRule com confidence ≥ 0.85 → aplicada em modo autônomo
  PremissaRule com confidence 0.5–0.85 → agente propõe e aguarda confirmação
  PremissaRule com confidence < 0.5 → agente menciona mas pede nova decisão
```

**O score de confiança evolui assim:**
```
Regra criada:                    0.70
+ Aceita sem modificação:        +0.05 por ocorrência
+ Aceita com pequeno ajuste:     +0.01
+ Override (decisão diferente):  -0.10
+ Aplicada em outro projeto:     +0.03
Threshold para auto-apply:       ≥ 0.85
```

---

### 4.6 Requisitos Funcionais — Agente de IA

| ID | Requisito | Prioridade |
|---|---|---|
| RF-11.1 | Agente LLM (Claude API com tool use) com acesso a ferramentas de leitura e escrita no banco | Must Have |
| RF-11.2 | Modo autônomo pós-importação: aplica regras com confiança ≥ 0.85 sem interação | Must Have |
| RF-11.3 | Painel de chat em duas colunas: lista de itens pendentes + conversa com o agente | Must Have |
| RF-11.4 | Agente navega entre itens pendentes, mostrando qual está tratando no momento | Must Have |
| RF-11.5 | Agente agrupa itens do mesmo tipo/padrão e resolve em lote quando possível | Must Have |
| RF-11.6 | Toda decisão da conversa gera ItemPremissa persistido + PremissaRule se autorizado | Must Have |
| RF-11.7 | Score de confiança das regras atualiza a cada aceitação/override | Must Have |
| RF-11.8 | Políticas corporativas (Tipo B/F) definidas uma vez, aplicadas em modo autônomo nos projetos seguintes | Must Have |
| RF-11.9 | Perfis de equipamento (Tipo E) salvos pelo agente, reutilizados automaticamente | Must Have |
| RF-11.10 | Templates de decomposição (Tipo C) salvos pelo agente e propostos em projetos futuros | Must Have |
| RF-11.11 | Agente detecta dupla contagem (Tipo D) proativamente e salva regra de par | Must Have |
| RF-11.12 | Usuário pode corrigir qualquer decisão do agente (override) com justificativa | Must Have |
| RF-11.13 | Todas as premissas (autônomas e via chat) exportadas no memorando com rastreabilidade | Must Have |
| RF-11.14 | Conversa do agente preservada como histórico consultável por projeto | Should Have |
| RF-11.15 | Agente pode explicar o raciocínio de qualquer decisão automática passada | Should Have |
| RF-11.16 | Regras com visibilidade "platform" compartilhadas entre todos os clientes ZNIT (curada pela ZNIT) | Should Have |

---

## 5. Requisitos Não-Funcionais

| ID | Requisito | Critério |
|---|---|---|
| RNF-01 | Performance do parser | Processar arquivo XLSM de até 5.000 linhas em < 30 segundos |
| RNF-02 | Responsividade | Funcional em desktop (1280px+); tablet aceitável; mobile fora do escopo v1 |
| RNF-03 | Segurança | Dados isolados por tenant (Row Level Security), HTTPS, JWT com refresh token |
| RNF-04 | Disponibilidade | 99% uptime no horário comercial durante piloto |
| RNF-05 | Auditabilidade | Todas as emissões rastreáveis a fonte EPD + data + versão do fator |
| RNF-06 | Extensibilidade | API REST documentada (OpenAPI) para futuras integrações |
| RNF-07 | Idioma | Português do Brasil (interface e relatórios) |

---

## 5. Modelo de Dados

### Entidades Principais

```
Company
  id, name, logo_url, color_primary, color_secondary, created_at

User
  id, company_id, name, email, role (admin/analyst/viewer), created_at

Project
  id, company_id, name, client_name, address,
  total_area_m2, building_type, status, created_at

AbcCurve
  id, project_id, file_name, imported_at, imported_by_user_id, version

AbcItem
  id, abc_curve_id, cost_code, description, quantity, unit,
  unit_cost, total_cost, cost_pct, cumulative_pct, abc_class,
  item_type (material/labor/grouped/embedded/equipment/indirect),
  mapping_status (auto/manual/pending/blocked/excluded),
  type_override_by_user_id, type_override_justification

ItemPremissa
  id, abc_item_id, project_id,
  premissa_type (exclude/include_indirect/include_scope3/decompose/equipment_calc),
  justification, defined_by_user_id, defined_at,
  automation_level (auto/suggested/manual),         -- como foi definida
  rule_id (FK → PremissaRule, nullable),            -- qual regra originou
  -- campos específicos por tipo:
  labor_workers_count, labor_duration_months,       -- Tipo B opção 2
  labor_transport_km, labor_transport_modal,         -- Tipo B opção 3
  equipment_profile_id (FK → EquipmentProfile),     -- Tipo E
  decomposition_status (pending/in_progress/done)   -- Tipo C

PremissaRule
  id, company_id (null = plataforma ZNIT),
  item_type (B/C/D/E/F),
  match_type (exact_cost_code/keyword/category),
  match_value,                                      -- ex: "450201" ou "Corte e Dobra"
  premissa_type, premissa_config (JSON),            -- decisão salva
  confidence_score (0.0-1.0),                       -- sobe com cada aceitação sem override
  times_applied, times_overridden,
  visibility (company/platform),
  created_by_user_id, created_at

DecompositionTemplate
  id, company_id, name, source_cost_code,
  sub_items (JSON array: [{description, unit, qty_factor, cost_pct}]),
  version, created_by_user_id, created_at

EquipmentProfile
  id, company_id (null = ZNIT padrão),
  name, equipment_type,
  fuel_type (diesel/electric/gasoline),
  consumption_per_hour, consumption_unit (L_h/kWh_h),
  emission_factor_kgco2_per_unit, factor_source,
  is_platform_default (boolean),
  created_by_user_id, created_at

CorporatePolicy
  id, company_id, policy_type (labor_scope/admin_scope),
  decision (exclude/include_indirect/include_scope3),
  config (JSON),
  applies_to_all_projects (boolean),
  created_by_user_id, created_at

EpdFactor
  id, material_name, category, variant_name,
  factor_kgco2e_per_unit, unit, scope (1/2/3),
  source (GHG/IPCC/Ecoinvent/ECI), source_url, valid_from, valid_until

ItemMapping
  id, abc_item_id, epd_factor_id, confidence (high/medium/low),
  mapped_by (auto/user_id), distance_km, transport_modal,
  tonnage, notes, created_at

Scenario
  id, project_id, abc_curve_id, name, description,
  status (draft/locked), version, created_at, created_by_user_id

ScenarioItem
  id, scenario_id, abc_item_id, epd_factor_id (pode ser diferente do mapeamento base),
  quantity_override, emission_kgco2e, emission_scope3_kgco2e

ScenarioResult
  id, scenario_id, total_kgco2e, total_tco2e,
  intensity_tco2e_per_m2, scope1_kgco2e, scope2_kgco2e, scope3_kgco2e,
  coverage_pct, calculated_at
```

---

## 6. API — Endpoints Principais

```
# Projetos
GET    /api/projects                          → lista projetos da empresa
POST   /api/projects                          → cria projeto
GET    /api/projects/{id}                     → detalhe do projeto
PUT    /api/projects/{id}                     → atualiza projeto

# Importação
POST   /api/projects/{id}/upload-abc          → upload e parse da curva ABC
GET    /api/projects/{id}/abc-items           → lista itens da curva importada
GET    /api/projects/{id}/abc-items/alerts    → itens sem EPD + itens agrupados

# Mapeamento de Fatores
POST   /api/projects/{id}/map-factors         → executa mapeamento automático
PUT    /api/abc-items/{id}/mapping            → atualiza mapeamento manual de item
GET    /api/epd-factors                       → lista banco de EPDs (com filtros)
GET    /api/epd-factors/search?q=concreto     → busca por nome/categoria

# Cenários
POST   /api/projects/{id}/scenarios           → cria cenário (a partir de base ou cópia)
GET    /api/projects/{id}/scenarios           → lista cenários do projeto
GET    /api/scenarios/{id}                    → detalhe do cenário com resultados
PUT    /api/scenarios/{id}/items/{item_id}    → altera material/EPD em um item do cenário
POST   /api/scenarios/{id}/calculate          → (re)calcula emissões do cenário
GET    /api/projects/{id}/scenarios/compare   → comparativo entre cenários

# Relatórios
GET    /api/scenarios/{id}/export/excel       → download Excel com emissões por item
GET    /api/scenarios/{id}/export/csv         → download CSV
GET    /api/scenarios/{id}/export/memo        → download memorando PDF
GET    /api/projects/{id}/export/comparison   → PDF comparativo de cenários

# Premissas e Tipologia
GET    /api/projects/{id}/items/by-type             → itens por tipo com contagem por nível de automação
POST   /api/abc-items/{id}/premissa                 → define/salva premissa para item
PUT    /api/abc-items/{id}/type                     → reclassifica tipo com justificativa
POST   /api/abc-items/{id}/decompose                → inicia decomposição (Tipo C)
POST   /api/abc-items/{id}/sub-items                → adiciona sub-item de decomposição

# Motor de Aprendizado — Premissa Library
GET    /api/premissa-rules?item_type=C&match=450201 → busca regras aplicáveis a um item
POST   /api/premissa-rules                          → salva nova regra a partir de decisão
PUT    /api/premissa-rules/{id}/feedback            → registra accept/override (atualiza score)
GET    /api/premissa-rules                          → lista todas as regras da empresa

# Políticas Corporativas
GET    /api/companies/{id}/policies                 → retorna políticas ativas
PUT    /api/companies/{id}/policies                 → atualiza política corporativa

# Perfis de Equipamento
GET    /api/equipment-profiles                      → lista perfis (empresa + ZNIT padrão)
POST   /api/equipment-profiles                      → cria perfil de equipamento
PUT    /api/equipment-profiles/{id}                 → atualiza perfil

# Templates de Decomposição
GET    /api/decomposition-templates?cost_code=450201 → busca templates para um código
POST   /api/decomposition-templates                  → salva novo template
POST   /api/decomposition-templates/{id}/apply       → aplica template a um item (com preview)

# Agente de IA
POST   /api/agent/sessions                        → inicia sessão do agente para um projeto
GET    /api/agent/sessions/{id}/stream            → SSE: streaming de mensagens do agente
POST   /api/agent/sessions/{id}/message           → envia mensagem do usuário para o agente
GET    /api/agent/sessions/{id}/history           → histórico da conversa
POST   /api/agent/sessions/{id}/run-autonomous    → executa modo autônomo (aplica regras salvas)

# Admin (ZNIT)
POST   /api/admin/epd-factors                 → adiciona novo fator EPD
PUT    /api/admin/epd-factors/{id}            → atualiza fator EPD
GET    /api/admin/companies                   → lista todas as empresas

# Auth
POST   /api/auth/login
POST   /api/auth/logout
POST   /api/auth/refresh
POST   /api/auth/invite                       → convida usuário por email
POST   /api/auth/reset-password
```

---

## 7. Fluxos de Usuário

### Fluxo 1 — Primeiro Uso (Analista de Orçamento)
```
Login → Criar Projeto (nome, cliente, área m²) → Upload Curva ABC (XLSM) →
Preview da tabela → Confirmar importação →
  [Agente autônomo processa em background — segundos] →
Tela de resultado:
  "86 mapeados, 41 regras aplicadas, 18 aguardam o agente" →
[Iniciar sessão com o agente] →
  Agente conduz conversa para os 18 itens pendentes →
  Cada decisão é persistida como premissa + regra salva →
Calcular Cenário Base → Ver dashboard com top emissores
```

### Fluxo 2 — Criação de Cenário Alternativo (Analista ESG)
```
Abrir projeto → Ir em Cenários → Duplicar Cenário Base →
Renomear (ex: "Cenário A — Concreto com cinza volante") →
Editar item: Concreto Fck=30 → selecionar variante "30% cinza volante" →
Recalcular → Ver delta vs Cenário Base (tCO₂e economizados, % redução) →
Exportar comparativo PDF
```

### Fluxo 3 — Revisão Executiva (Gestor ESG)
```
Login → Abrir projeto Raízen → Ver dashboard →
KPIs: X tCO₂e total, Y tCO₂e/m², Z% cobertura →
Ver Pareto de top 10 emissores →
Comparar Cenário Base vs Cenário A vs Cenário B →
Baixar memorando de cálculo PDF com identidade HTB →
Compartilhar link do projeto com equipe CLIMAS
```

---

## 8. Telas da Aplicação

### 8.1 Estrutura de Pastas do Projeto

```
znit-carbon/
├── frontend/                        # Next.js 14
│   ├── app/
│   │   ├── (auth)/
│   │   ├── (dashboard)/
│   │   │   ├── projects/[id]/
│   │   │   │   ├── overview/        # dashboard KPIs, Pareto, alertas
│   │   │   │   ├── import/          # upload + preview Curva ABC
│   │   │   │   ├── items/           # tabela de itens com badges por tipo
│   │   │   │   ├── agent/           # painel de chat com o agente
│   │   │   │   ├── scenarios/       # gestão de cenários
│   │   │   │   └── reports/         # exportações e relatórios
│   │   │   └── library/             # premissa library, perfis, políticas
│   │   └── api/                     # proxy routes para o backend
│   └── components/
│       ├── agent/
│       │   ├── AgentChat.tsx        # painel de chat em duas colunas
│       │   ├── PendingItemsList.tsx # lista de itens pendentes à esquerda
│       │   └── AgentMessage.tsx     # bolha com action cards inline
│       └── items/
│           ├── ItemsTable.tsx       # tabela com badges de tipo A-F
│           └── ItemTypeBadge.tsx    # badge colorido por tipo
│
├── backend/                         # Python FastAPI
│   ├── app/
│   │   ├── api/
│   │   │   ├── projects.py
│   │   │   ├── items.py
│   │   │   ├── scenarios.py
│   │   │   ├── reports.py
│   │   │   ├── agent.py             # SSE endpoint para streaming do agente
│   │   │   └── library.py           # premissa rules, perfis, políticas
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   ├── auth.py
│   │   │   └── database.py
│   │   ├── models/                  # SQLAlchemy — uma classe por entidade
│   │   │   ├── project.py
│   │   │   ├── abc_item.py
│   │   │   ├── epd_factor.py
│   │   │   ├── scenario.py
│   │   │   ├── premissa_rule.py
│   │   │   ├── equipment_profile.py
│   │   │   ├── corporate_policy.py
│   │   │   └── agent_conversation.py
│   │   ├── schemas/                 # Pydantic — request/response
│   │   └── services/                # lógica de negócio por responsabilidade
│   │       ├── parser.py            # lê XLSX/XLSM → AbcItem[]
│   │       ├── classifier.py        # detecta tipo A-F
│   │       ├── epd_mapper.py        # mapeamento Tipo A
│   │       ├── calculator.py        # engine Scope 1/2/3
│   │       ├── reporter.py          # PDF/Excel
│   │       ├── double_count.py      # detector pares Tipo D
│   │       └── agent/
│   │           ├── agent.py         # orquestrador LLM → tools → resposta
│   │           ├── tools.py         # 10 ferramentas do agente
│   │           ├── prompts.py       # system prompts por tipo de item
│   │           └── rule_engine.py   # CRUD da Premissa Library + score
│   └── migrations/                  # Alembic
└── docs/
    └── premissa-library-spec.md     # ontologia e regras de matching
```

### 8.2 Estrutura de Navegação
```
/ (login)
/dashboard                → overview do portfólio de projetos
/projects/new             → criar projeto
/projects/{id}
  /overview               → dashboard do projeto (KPIs, Pareto, alertas)
  /import                 → upload e preview da Curva ABC
  /items                  → tabela de todos os itens com mapeamento
  /items/{item_id}        → detalhe e parametrização do item
  /scenarios              → lista de cenários
  /scenarios/{scenario_id} → detalhe do cenário com resultados
  /compare                → comparativo entre cenários
  /reports                → exportações e relatórios
/settings
  /team                   → gestão de usuários
  /branding               → logo e cores do cliente
/admin (ZNIT)
  /epd-factors            → gestão do banco de EPDs
  /companies              → gestão de clientes
```

### 8.2 Tela: Overview do Projeto
```
┌─────────────────────────────────────────────────────┐
│  Raízen VRO R8 — Cenário Base          [Novo Cenário]│
├────────┬───────────┬──────────────┬─────────────────┤
│ 2.847  │ 27,9      │ 87%          │ 3 cenários      │
│ tCO₂e  │ kgCO₂e/m² │ cobertura    │ gerados         │
├────────┴───────────┴──────────────┴─────────────────┤
│ [!] 18 itens sem EPD   [!] 5 itens agrupados        │
├─────────────────────────────────────────────────────┤
│ TOP EMISSORES (Pareto)                              │
│ Concreto Fck=30    ████████████████  847 tCO₂e 29% │
│ Aço CA50           ████████████      612 tCO₂e 21% │
│ Escavação          ████████          423 tCO₂e 14% │
│ ...                                                 │
├─────────────────────────────────────────────────────┤
│ BREAKDOWN POR SCOPE                                 │
│ ◉ Scope 3 Materiais  78%  ◉ Scope 3 Logística  22% │
└─────────────────────────────────────────────────────┘
```

### 8.3 Tela: Tabela de Itens
```
┌───────────┬──────────────────────────┬──────┬────────┬──────────┬────────────┬──────────┐
│ CostCode  │ Descrição                │ Und  │ Qtd    │ Classe   │ EPD Status │ tCO₂e    │
├───────────┼──────────────────────────┼──────┼────────┼──────────┼────────────┼──────────┤
│ 420301    │ Aço CA50 em Barras       │ kg   │ 1.2M   │ A        │ ✅ Auto    │ 612.4    │
│ 450201    │ SubTerrapl/Pav/Dren ⚠️  │ m³   │ 45.000 │ A        │ ⚠️ Agrup.  │ —        │
│ 430101    │ Concreto Bombeado Fck=30 │ m³   │ 8.200  │ A        │ ✅ Manual  │ 847.2    │
│ 410201    │ Forma Plana Madeira      │ m²   │ 62.000 │ A        │ ❌ Pend.   │ —        │
└───────────┴──────────────────────────┴──────┴────────┴──────────┴────────────┴──────────┘
```

### 8.4 Tela: Comparativo de Cenários
```
┌────────────────────────────────────────────────────────────┐
│ COMPARATIVO DE CENÁRIOS                                    │
├──────────────────┬───────────────┬────────────┬───────────┤
│                  │ BASE          │ CENÁRIO A  │ CENÁRIO B │
│                  │               │ Cinza Vulc.│ Geopolim. │
├──────────────────┼───────────────┼────────────┼───────────┤
│ Total tCO₂e      │ 2.847         │ 2.213      │ 1.891     │
│ tCO₂e/m²        │ 27,9          │ 21,7       │ 18,5      │
│ Redução (tCO₂e) │ —             │ -634 ✅    │ -956 ✅   │
│ Redução (%)      │ —             │ -22,3%     │ -33,6%    │
├──────────────────┴───────────────┴────────────┴───────────┤
│ [Gráfico de barras lado a lado por categoria]             │
│ [Download PDF Comparativo]                                │
└────────────────────────────────────────────────────────────┘
```

### 8.5 Tela: Parametrização de Item (varia por tipo)

**Tipo A — Material Direto:**
```
┌─ Aço CA50 em Barras (420301-ca50B) ──────────────── [Tipo A: Material] ─┐
│ Quantidade: 1.200.000 kg   Classe: A                                     │
│                                                                          │
│ Fator de Emissão:  [Aço em barras — CA50 convencional ▼]  ✅ Alta conf. │
│                    1,85 kgCO₂e/kg  |  Fonte: Ecoinvent 3.9  |  Scope 3 │
│                                                                          │
│ Scope 3 — Logística:                                                     │
│ Distância: [____] km   Modal: [Caminhão ▼]   Tonelagem: [1.200 t]       │
│                                                                          │
│ Emissão calculada:  2.220 tCO₂e (materiais) + [___] tCO₂e (logística)  │
└──────────────────────────────────────────────────────────────────────────┘
```

**Tipo B — Mão de Obra:**
```
┌─ Oficial Forma (400101-OfForma) ─────────────────── [Tipo B: Mão de Obra] ┐
│ Quantidade: 15.800 h   Classe: A                                          │
│                                                                           │
│ ⚠️ Mão de obra não possui fator de emissão direto.                       │
│    Defina a premissa para este item:                                      │
│                                                                           │
│ ○ Excluir do inventário (recomendado para Scope 3 embodied carbon)       │
│   → Justificativa: [_________________________________]                   │
│                                                                           │
│ ○ Incluir via fator indireto por hora trabalhada                         │
│   → Fator: [0,03] kgCO₂e/h-trabalhador  |  Fonte: [IPCC ▼]             │
│                                                                           │
│ ○ Incluir via Scope 3 deslocamento                                       │
│   → Nº trabalhadores: [___]  Distância média: [___] km  Modal: [▼]      │
│                                                                           │
│ [Aplicar premissa a todos os itens Tipo B do projeto]                    │
└───────────────────────────────────────────────────────────────────────────┘
```

**Tipo C — Item Agrupado:**
```
┌─ SubTerrapl-Pav-Dren (450201) ──────────────── [Tipo C: Agrupado ⛔] ───┐
│ Quantidade: 1 vb   Custo: R$ 8.980.000   Classe: A                      │
│                                                                          │
│ ⛔ Este item está BLOQUEADO para cálculo.                                │
│    Contém múltiplos serviços agrupados que precisam ser decompostos.     │
│                                                                          │
│ Sub-itens identificados:                                                 │
│ + Terraplenagem / Escavação                                              │
│ + Pavimentação                                                           │
│ + Drenagem                                                               │
│                                                                          │
│ [Inserir sub-itens manualmente]  [Solicitar suporte ZNIT]               │
│                                                                          │
│ Status: ● Aguardando decomposição                                        │
└──────────────────────────────────────────────────────────────────────────┘
```

**Tipo E — Equipamento:**
```
┌─ Retroescavadeira (440105-Retro) ──────────── [Tipo E: Equipamento] ────┐
│ Quantidade: 480 h   Classe: B                                           │
│                                                                         │
│ Dados operacionais para cálculo:                                        │
│ Combustível: [Diesel ▼]    Consumo: [15] L/h  (padrão editável)        │
│ Fator diesel: 2,68 kgCO₂e/L  (GHG Protocol BR — Scope 1)              │
│                                                                         │
│ Emissão = 480 h × 15 L/h × 2,68 kgCO₂/L = 19,3 tCO₂e                │
│                                                                         │
│ ℹ️ Valor padrão de consumo. Ajuste se tiver dado real do equipamento.  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Stack Tecnológico Detalhado

### Frontend — Next.js 14
```
next@14 (App Router)
typescript
tailwindcss
shadcn/ui           → componentes base (Table, Card, Dialog, Alert, Badge)
recharts            → gráficos (Pareto, barras, donut)
react-hook-form     → formulários
zod                 → validação de schemas
tanstack-query      → data fetching e cache
axios               → HTTP client
react-dropzone      → upload de arquivos
```

### Backend — Python FastAPI
```
fastapi
uvicorn             → servidor ASGI
pandas              → processamento de DataFrame
openpyxl            → leitura de XLSX e XLSM
python-multipart    → upload de arquivos
sqlalchemy          → ORM
alembic             → migrations
psycopg2            → driver PostgreSQL
pydantic v2         → validação e serialização
python-jose         → JWT
bcrypt              → hash de senhas
reportlab           → geração de PDF
thefuzz             → similarity matching para mapeamento automático
```

### Banco de Dados — PostgreSQL (Supabase)
```
PostgreSQL 15
Row Level Security para isolamento multi-tenant
Supabase Storage para arquivos XLSX/PDF
```

### Infraestrutura
```
Frontend:   Vercel (deploy automático via git)
Backend:    Railway (container Docker, free tier para piloto)
Banco:      Supabase (free tier: 500MB, suficiente para piloto)
```

---

## 10. Critérios de Sucesso do Piloto (90 dias)

### Técnicos
- [ ] Parser processa `Curva ABC_Raizen VRO_R8.xlsm` sem erro, retorna 100% dos itens
- [ ] ≥ 80% dos itens Classe A com EPD mapeado automaticamente
- [ ] Scope 3 calculado para todos os itens com distância informada
- [ ] Geração de cada cenário em < 5 segundos
- [ ] Exportação Excel compatível com Power BI sem ajustes manuais

### Produto
- [ ] ≥ 3 cenários gerados e comparados para o projeto Raízen
- [ ] Dashboard com Pareto de emissores exibido corretamente
- [ ] Memorando de cálculo PDF gerado com identidade HTB
- [ ] Alertas de itens sem EPD funcionando

### Negócio
- [ ] Resultado ZNIT calibrado e comparável ao CLIMAS dentro de margem acordada
- [ ] Equipe HTB consegue gerar novo cenário de forma autônoma após treinamento
- [ ] HTB decide pela continuidade e expansão para outros projetos

---

## 11. Milestones e Cronograma

| Semana | Milestone | Entregável |
|---|---|---|
| 1-2 | **M1 — Parser funcionando** | Script Python processa Raízen XLSM → JSON estruturado |
| 3-4 | **M2 — Mapeamento EPD** | 80% dos itens Classe A mapeados, interface de parametrização |
| 5-6 | **M3 — Cálculo completo** | Cenário Base com tCO₂e total e por item calculado |
| 7-8 | **M4 — Cenários** | 3 cenários gerados e comparados |
| 9-10 | **M5 — Dashboard + Relatórios** | Dashboard executivo, PDF com identidade HTB, export Excel |
| 11 | **M6 — UAT HTB** | Testes com equipe, ajustes, treinamento |
| 12 | **M7 — Go/No-Go** | Comparação ZNIT vs CLIMAS, relatório final, decisão |

---

## 12. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| **~34 itens agrupados (Tipo C) representam ~10% do orçamento** e não podem ser calculados sem decomposição | Alta | Alto | Workflow de decomposição nativo + ZNIT apoia a abertura dos itens Classe A prioritários na semana 1 do piloto |
| **~63 itens de mão de obra (Tipo B = ~25% do orçamento)** sem metodologia definida de carbono | Alta | Alto | Definir premissa com HTB antes de iniciar cálculos: recomendação é excluir do inventário v1 com justificativa registrada no memorando |
| **Risco de dupla contagem em Tipo D** (ex: "Corte e Dobra de Aço" contado junto com "Aço CA50 em Barras") | Média | Alto | Alerta automático ao mapear itens Tipo D + revisão manual obrigatória com checklist no sistema |
| **Equipamentos (Tipo E)** sem dados de horas de uso e consumo de combustível disponíveis na ABC | Média | Médio | Usar valores padrão editáveis (ex: 15 L/h para retroescavadeira) + registrar como premissa no memorando |
| **Diesel (460114-OléoDiesel)** classificado como Tipo F mas tem fator direto | Baixa | Baixo | Reclassificar como Tipo A no parser. Caso especial já mapeado. |
| EPDs não disponíveis para materiais específicos da construção BR | Média | Alto | Usar fatores genéricos GHG Protocol BR como fallback + alerta ao usuário + ZNIT completa via consultoria |
| Divergência entre ZNIT e CLIMAS após calibração | Média | Alto | Alinhamento metodológico pré-comparação: acordar escopo, tipos incluídos e fontes EPD |
| Equipe de orçamento HTB sem tempo para parametrização manual | Alta | Médio | ZNIT realiza parametrização inicial dos itens Classe A (incluso no piloto) |
| Performance com arquivos grandes (>1.000 itens) | Baixa | Médio | Processamento assíncrono com polling de status no frontend |

---

## 13. Próximo Passo Imediato

**Semana 1:** Setup do repositório monorepo + implementação do parser Python para `Curva ABC_Raizen VRO_R8.xlsm`.

Isso valida o fluxo de dados mais crítico antes de qualquer investimento em UI, e já gera o primeiro artefato demonstrável para a HTB.
