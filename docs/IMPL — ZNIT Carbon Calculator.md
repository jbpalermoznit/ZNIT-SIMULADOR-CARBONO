# IMPL — ZNIT Carbon Calculator
**Versão:** 1.7 | **Data:** 2026-03-19 | **Autor:** João Palermo (ZNIT)
**Status:** Partes 1, 2, 3 concluídas · Deploy Render (Docker) · Power BI endpoints live

---

## Situação atual — o que está feito

### Frontend — Next.js 14 (`znit-carbon/`)

| Tela | Arquivo | Status |
|---|---|---|
| Dashboard (portfólio) | `app/dashboard/page.tsx` | ✅ Projetos reais da API, modal novo projeto, KPIs portfólio |
| Importar Curva ABC | `app/projects/[projectId]/import/page.tsx` | ✅ Upload XLSM conectado ao backend |
| Itens da Curva ABC | `app/projects/[projectId]/items/page.tsx` | ✅ 113 itens, auto-map, drawer Ecoinvent/CECarbon/GHG/EPD/manual, export Excel |
| Cenários | `app/projects/[projectId]/scenarios/page.tsx` | ✅ Cards reais, análise top emissores |
| Overview do projeto | `app/projects/[projectId]/overview/page.tsx` | ✅ KPIs, cobertura, breakdown scope, Gerar/Recalcular Base |
| Agente IA | `app/projects/[projectId]/agent/page.tsx` | ✅ **Gemini via n8n** — chat real, action cards, aceitar/rejeitar, aplicar |
| Relatórios | `app/projects/[projectId]/reports/page.tsx` | ⚠️ Mockado — botões sem backend (export Excel funciona via Itens) |
| Regras Salvas | `app/projects/[projectId]/rules/page.tsx` | ✅ Tabela factor_rules + equipment_rules com delete |
| Configurações | `app/settings/page.tsx` | ✅ Completo — persiste em localStorage |
| Sidebar | `components/layout/sidebar.tsx` | ✅ **Projetos reais da API**, links dinâmicos, navega ao trocar projeto |
| Layout / Favicon | `app/layout.tsx` | ✅ ZNIT_favicon.png, metadata correto |

#### Detalhes do drawer de itens (`items/page.tsx`)
O drawer abre com duplo-clique em qualquer linha. Tem três sub-views:
- **DetailView** — orçamento (qty, custo, %, cumulativo), EPD + confiança, emissões calculadas com fórmula, logística Scope 3 (placeholder)
- **EditEpdView** — ✅ **conectado ao backend real** com 3 abas:
  - **Ecoinvent** — busca em tempo real no Supabase (`ecoinvent_dev`), auto-match com sugestão automática + badge de confiança
  - **EPD Catalog** — busca no catálogo (`epd_dev`), exibe título/empresa/país/validade, botão "Ver PDF" (abre PDF original), botão "Inserir fator manualmente"
  - **Manual** — formulário para inserir fator manual (nome, valor kgCO₂e, unidade, fonte/referência), cálculo estimado em tempo real
  - Botão "Confirmar EPD" chama `PUT /api/emission-factors/mapping/{id}` e salva no banco
- **ParametrizeView** — formulário por tipo de item (UI-only, sem salvar no backend ainda):
  - Tipo A: distância km + modal de transporte + preview de emissão logística
  - Tipo B: radio excluir/indireto/scope3 + "aplicar a todos Tipo B"
  - Tipo C: tabela de sub-itens editável com percentuais + adicionar sub-item
  - Tipo D: alerta de dupla contagem + radio excluir par/incluir energia do processo
  - Tipo E: combustível + consumo L/h ou kWh/h + cálculo ao vivo + "salvar como perfil"
  - Tipo F: radio excluir/incluir com fator genérico + "aplicar a todos Tipo F"
  - Todos os tipos: textarea de notas/justificativa para o memorando

#### Detalhes de cenários (`scenarios/page.tsx`)
- **Cards** — grid 4 colunas; clique seleciona cenário não-base; badge "BASE" no cenário 0; mostra nº de materiais alterados
- **Tab 1 — Análise de alterações** — requer seleção de um cenário; mostra: 3 KPIs (Δ tCO₂e, Δ custo, nº alterações), tabela de mudanças item a item com EPD base vs alternativo, gráfico comparativo
- **Tab 2 — Comparar com outro projeto** — dropdown de outros projetos; quando selecionado: cards de identificação dos dois projetos + tabela de métricas lado a lado com coluna de diferença

#### Classificação de classes renomeada
Pareto A/B/C renomeado para **P1/P2/P3** em todo o sistema (parser, mock data, frontend) para evitar confusão com os tipos de item A–F.

---

### Backend — Python FastAPI (`backend/`)

| Componente | Arquivo | Status |
|---|---|---|
| App principal + seed | `app/main.py` | ✅ Roda em `localhost:8000`; seed: Company HTB, User admin, Project Raízen VRO R8 |
| Parser XLSM | `app/services/parser.py` | ✅ Funciona com arquivo real — classifica tipo A–F e P1/P2/P3 |
| Upload endpoint | `app/api/projects.py` | ✅ `POST /api/projects/{id}/upload-abc` + listagem de itens + curvas |
| Banco de dados | SQLite (dev) | ✅ Tabelas: Company, User, Project, AbcCurve, AbcItem, ItemMapping, Scenario, ScenarioItem, ScenarioResult |
| Autenticação JWT | `app/core/auth.py` | ✅ Login, token (8h), middleware |
| Supabase client | `app/core/supabase_client.py` | ✅ Conexão ao Supabase externo (schema `backend`) — lê ecoinvent_dev, fatores_ghg_dev, epd_dev |
| Emission mapper | `app/services/emission_mapper.py` | ✅ Fuzzy match PT→EN com thefuzz, filtro de infrastructure/waste |
| Emission factors API | `app/api/emission_factors.py` | ✅ 5 endpoints: search, auto-match, auto-map, confirm mapping, get mapping |
| Calculator | `app/services/calculator.py` | ✅ Fórmulas Scope 3 materiais + logística, criação de Cenário Base, recálculo |
| Scenarios API | `app/api/scenarios.py` | ✅ 5 endpoints: listar, criar base, criar alternativo, detalhe, recalcular |
| Schemas Pydantic | `app/schemas/` | ✅ emission_factor.py, scenario.py, abc_item.py, project.py, auth.py |
| Agente IA (Gemini) | `app/services/agent/` + `app/api/agent.py` | ✅ Gemini via n8n webhook, context builder, action applier, rule-based fallback |
| Gemini client | `app/core/gemini_client.py` | ✅ POST .txt ao webhook OCR, parse JSON resposta |
| Factor Rules API | `app/api/factor_rules.py` | ✅ CRUD regras de fator (premissa library) |
| Equipment Rules API | `app/api/equipment_rules.py` | ✅ CRUD regras de equipamento, perfis padrão |
| Export Excel | `app/api/projects.py` (export-items) | ✅ Excel com abas por tipo, fator sugerido, parametrização |
| Relatórios PDF | — | ❌ Não implementado |

**Como iniciar o backend:**
```bash
cd backend
uvicorn app.main:app --reload --port 8000
# Seed automático na primeira inicialização (sem dados no banco)
```

**Projeto seed:**
```
id: "proj-raizen-r8"
name: "Raízen VRO R8"
company_id: "company-htb"
total_area_m2: 102000
```

---

## Parte 1 — Parser e Banco de Dados ✅ IMPLEMENTADA

**Status:** Parser, upload, listagem de itens e integração frontend concluídos.

### O que está feito

- ✅ Parser XLSM (`services/parser.py`) classifica tipo A–F e P1/P2/P3
- ✅ Upload endpoint `POST /api/projects/{id}/upload-abc`
- ✅ Listagem `GET /api/projects/{id}/abc-items` com filtros (item_type, abc_class, mapping_status)
- ✅ Listagem `GET /api/projects/{id}/abc-curves` (histórico de importações)
- ✅ `GET /api/projects` e `POST /api/projects`
- ✅ Tabela de itens no frontend conectada à API real (113 itens do banco)
- ✅ Seed automático com empresa HTB, usuário demo e projeto Raízen VRO R8

### Pendências Parte 1 (resolvidas na Parte 3)

- ✅ Sidebar com projetos reais da API (resolvido v1.6)
- ✅ Dashboard com projetos reais + modal novo projeto (resolvido v1.5)
- ✅ Rotas dinâmicas `[projectId]` (resolvido v1.6)

---

## Parte 2 — Banco de EPDs e Mapeamento Automático ✅ COMPLETA

**Objetivo:** Mapear automaticamente os itens Tipo A da Curva ABC a fatores de emissão e calcular o Cenário Base.

### 2.1 Fonte de dados — Supabase externo ✅ IMPLEMENTADO

Os fatores de emissão vêm do Supabase existente (schema `backend`), consultados em tempo real via REST API:

| Tabela Supabase | Uso | Registros |
|---|---|---|
| `ecoinvent_dev` | Fatores Ecoinvent 3.11 — materiais (concreto, aço, cimento, etc.) | ~milhares |
| `fatores_ghg_dev` | GHG Protocol BR — combustíveis e transporte | ~200+ |
| `epd_dev` | Catálogo de EPDs certificados — metadados + PDF links | ~1200+ |

**Decisão de arquitetura:** Não há tabela `emission_factors` local. Os dados são consultados diretamente no Supabase externo. O `ItemMapping` local armazena referências (IDs) e o valor desnormalizado do fator usado.

**Conexão:**
```
SUPABASE_URL=https://xyuqhpgjbrattreuvfzy.supabase.co
SUPABASE_SCHEMA=backend
RLS policies: SELECT habilitado para anon em todas as 3 tabelas
```

### 2.2 Motor de mapeamento automático ✅ IMPLEMENTADO

**Arquivo:** `backend/app/services/emission_mapper.py`

Estratégia: traduz keywords PT→EN via dicionário de ~100 termos de construção civil brasileira, gera queries compostas para o Ecoinvent (ex: "fck=30" → "concrete 30MPa"), e aplica fuzzy matching com `thefuzz`.

**Fluxo:**
1. Extrai keywords da descrição do item (normaliza fck=30, remove stopwords PT, trata compound words como "OléoDiesel" → "óleo diesel", "Cimentcola" → "cimento cola")
2. Traduz para queries EN via `SEARCH_QUERIES` dict (ex: "aço" → ["reinforcing steel", "steel"], "chumbador" → ["steel anchor", "anchor bolt"], "bidim" → ["geotextile", "polypropylene"])
3. Busca no Ecoinvent via ilike no Supabase
4. Se item contém trigger words de combustível (diesel, gasolina, glp, etc.) → busca também no GHG Protocol
5. Scoring: `fuzz.token_set_ratio` + `fuzz.partial_ratio` + boost de 82 para match direto no product_name
6. GHG Protocol recebe boost de +5 para itens de combustível (prioridade para fator brasileiro)
7. Penaliza resultados waste/MSWI quando item não é resíduo (-30 no score)
8. Filtra fatores com valor zero e infrastructure-scale (>10.000 kgCO₂e com product_unit="unit")

**Thresholds:**
- Score ≥ 80 → `high` confidence → mapping_status = `auto`
- Score 60–79 → `medium` confidence → mapping_status = `manual` (sugerido, precisa review)
- Score < 60 → `low` / sem match → pendente

**Dicionário de termos cobre ~100 palavras-chave incluindo:**
- Concreto, aço (CA25/CA50/CA60), cimento, argamassa, madeira, bloco, tijolo
- Metais: treliça, chapa metálica, arame, prego, eletrodo, chumbador, ancoragem, parafuso, porca, luva, tampão (ferro fundido)
- Aço protendido: DW, Dywidag, barra protensão, estaca
- Cerâmica: porcelanato, rodapé, chapim pré-moldado
- Plásticos/isolantes: PVC, polietileno, bidim (geotêxtil), isopor (EPS), lona
- Selantes/químicos: sikaflex, silicone, sika1, fugenband, hidro expansivo
- Acabamentos: tinta, neutrol, batente/batentaço, cimentcola, rejunte, colante AC I
- Combustíveis: diesel, óleodiesel, gasolina (trigger para GHG Protocol)

**Resultado com Raízen VRO R8 (61 itens Tipo A):**
- ~32 mapeados automaticamente com confiança high/medium (aço, concreto, bloco, cimento, treliça, bidim, isopor, selante, tampão FoFo, etc.)
- ~29 pendentes (itens muito específicos: marcas comerciais sem tradução, códigos técnicos)
- Itens pendentes são ideais para mapeamento manual pelo analista no drawer (aba Manual ou via EPD PDF)

**Observações sobre hierarquia de fontes:**
- **Ecoinvent** é a fonte primária para materiais de construção (concreto, aço, cimento, etc.)
- **GHG Protocol BR** é a fonte preferencial para combustíveis/transporte (diesel, gasolina, GLP) — recebe boost no score
- **EPD Catalog** serve como referência: analista consulta PDF e insere fator manualmente
- A tabela `fatores_ghg_dev` do Supabase **não contém materiais de construção**, apenas combustíveis e transporte

### 2.3 Tabela ItemMapping ✅ IMPLEMENTADO

**Arquivo:** `backend/app/models/item_mapping.py`

Armazena referências ao fator usado (IDs do Supabase) + valor desnormalizado:
- `source_tier`: ecoinvent | ghg_protocol | epd | user_custom | excluded
- `ecoinvent_product_id` + `ecoinvent_activity_id` (UUIDs do Ecoinvent)
- `ghg_factor_id` (int do GHG Protocol)
- `epd_id` (int do catálogo EPD)
- `factor_value`, `factor_unit`, `factor_name` (desnormalizados)
- `confidence`, `similarity_score`, `mapped_by`
- `custom_factor_source`, `exclusion_justification`

### 2.4 Calculator + Cenário Base ✅ IMPLEMENTADO

**Arquivos:**
- `backend/app/services/calculator.py` — fórmulas de emissão
- `backend/app/models/scenario.py` — Scenario, ScenarioItem, ScenarioResult
- `backend/app/api/scenarios.py` — 5 endpoints
- `backend/app/schemas/scenario.py` — Pydantic schemas

**Fórmulas implementadas:**
```python
# Scope 3 — Materiais
emission_kgco2e = quantity * mapping.factor_value

# Scope 3 — Logística
emission_log = distance_km * tonnage * transport_factor  # kgCO₂e/t·km

# Fatores de transporte (GHG Protocol BR):
# truck: 0.062, rail: 0.022, ship: 0.008 kgCO₂e/t·km
```

**Resultado testado com Raízen VRO R8:**
- **Total: ~7.100 tCO₂e** (com ~32 itens mapeados de 113 — varia conforme versão do mapper)
- **Intensidade: ~0,07 tCO₂e/m²** (102.000 m² de área)
- **Cobertura: ~28%** — sobe com mapeamento manual dos pendentes
- **Top emissores:** Aço CA50 (3.588 tCO₂e), Concreto Estacas (2.497 tCO₂e), Tela Eletrosoldada (632 tCO₂e)

**Nota sobre fontes:**
- Ecoinvent é a fonte principal para materiais (fatores em kg CO₂-Eq por unidade)
- GHG Protocol BR tem fatores de combustíveis/transporte (diesel, gasolina, GLP) — priorizado para essas categorias via boost no score
- A tabela `fatores_ghg_dev` do Supabase não contém materiais de construção civil, apenas combustíveis e veículos

### 2.5 Todos os endpoints — status

**Emission Factors (`app/api/emission_factors.py`):**

| Endpoint | Status |
|---|---|
| `GET /api/emission-factors/search?q=&tier=&limit=` | ✅ Busca unificada (Ecoinvent + GHG + EPD catalog), traduz PT→EN |
| `GET /api/emission-factors/auto-match/{item_id}` | ✅ Auto-match para 1 item com ranking de candidatos |
| `POST /api/emission-factors/auto-map/{project_id}` | ✅ Auto-map em lote para itens Tipo A pendentes; retorna `already_mapped` + novos |
| `PUT /api/emission-factors/mapping/{item_id}` | ✅ Confirmar/editar mapeamento (auto, manual, EPD, user_custom, excluded) |
| `GET /api/emission-factors/mapping/{item_id}` | ✅ Consultar mapeamento atual de um item |

**Scenarios (`app/api/scenarios.py`):**

| Endpoint | Status |
|---|---|
| `GET /api/projects/{id}/scenarios` | ✅ Listar cenários do projeto |
| `POST /api/projects/{id}/scenarios/base` | ✅ Criar/recriar Cenário Base a partir dos mapeamentos atuais |
| `POST /api/projects/{id}/scenarios` | ✅ Criar cenário alternativo (pode duplicar de outro) |
| `GET /api/scenarios/{id}` | ✅ Detalhe com itens + resultado calculado |
| `POST /api/scenarios/{id}/calculate` | ✅ Recalcular emissões de um cenário |

### 2.6 Integração frontend — status

| Componente | Status | Detalhe |
|---|---|---|
| Tabela de itens ← API real | ✅ | 113 itens do banco, loading state, contagem dinâmica |
| EditEpdView — aba Ecoinvent | ✅ | Busca em tempo real, auto-match com sugestão + badge confiança |
| EditEpdView — aba EPD Catalog | ✅ | Busca no catálogo, botão "Ver PDF" (abre original), "Fonte" (link registro) |
| EditEpdView — aba Manual | ✅ | Formulário fator manual (nome, valor, unidade, fonte), cálculo estimado ao vivo |
| Confirmar EPD → backend | ✅ | Chama `PUT /api/emission-factors/mapping/{id}` e salva |
| Botão Auto-Map | ✅ | Executa `POST /api/emission-factors/auto-map/{project_id}`, recarrega itens |
| Banner resultado Auto-Map | ✅ | Exibe: já mapeados / novos alta confiança / sugeridos (revisar) / pendentes (manual) |
| Frontend API client cenários | ✅ | `lib/api/scenarios.ts` — types + funções para os 5 endpoints |
| Overview ← Cenário Base | ✅ | KPIs reais (tCO₂e, intensidade, cobertura), breakdown scope, botão Gerar/Recalcular Base |
| Scenarios ← API real | ✅ | Cards dinâmicos, tab análise com top 20 emissores + badge fonte (Ecoinvent/GHG), placeholder comparação |

### 2.7 Parte 2 — COMPLETA ✅

Todos os componentes da Parte 2 estão implementados e conectados:

**Overview (`overview/page.tsx`):**
- KPIs reais: total tCO₂e, intensidade kgCO₂e/m², cobertura %, nº cenários
- Breakdown por scope (Materiais, Logística, Combustão, Energia) com % e tCO₂e
- Alertas dinâmicos: itens pendentes e cobertura < 100%
- Botão "Gerar Cenário Base" (se não existe) / "Recalcular" (se existe)
- Gráficos Pareto e Scope Donut (ainda com dados mock internos — futuro: alimentar com dados reais)

**Scenarios (`scenarios/page.tsx`):**
- Cards dinâmicos com dados do banco: tCO₂e, intensidade, cobertura, nº itens
- Badge "BASE" no cenário base, delta tCO₂e nos alternativos
- Botão "Gerar Cenário Base" / "Recalcular Base"
- Tab "Análise do cenário": top 20 emissores com fator, badge fonte (Ecoinvent/GHG Protocol), tCO₂e
- Tab "Comparar cenários": placeholder para quando houver alternativos
- Botão "Novo Cenário" placeholder

**Nota sobre reimportação:** ao reimportar a curva ABC, os mappings antigos ficam órfãos (IDs de itens mudam). Solução atual: deletar `znit_carbon.db` e reimportar. Futuro: migração automática de mapeamentos

---

## Parte 3 — Agente IA + Regras + Export Excel ✅ COMPLETA

**Objetivo:** Agente IA que resolve itens pendentes (B/C/D/E/F) via Gemini, salva regras reutilizáveis, e export Excel com dados completos.

### 3.1 Rotas dinâmicas ✅

Migração de `app/projects/proj-1/` → `app/projects/[projectId]/` (Next.js dynamic route):
- Todas as pages usam `useParams().projectId` em vez de constante hardcoded
- Sidebar com links dinâmicos baseados no projeto ativo
- Dropdown de projetos navega automaticamente ao trocar

### 3.2 Agente IA via Gemini/n8n ✅

**Decisão de AI provider:** Gemini 2.5 Pro via webhook n8n (`orchestration.znit.ai/webhook/ocr-gemini`). O prompt é enviado como arquivo `.txt` (o webhook OCR exige binário), e o Gemini responde em JSON estruturado.

**Arquivos backend:**
- `app/core/gemini_client.py` — POST do prompt como `.txt` ao webhook, parse JSON resposta
- `app/core/config.py` — `N8N_WEBHOOK_URL` configurável
- `app/services/agent/Skill_CarbonAgent.md` — Skill file com taxonomia A-F, regras por tipo, formato JSON
- `app/services/agent/context_builder.py` — monta prompt completo: skill + itens pendentes + regras salvas + dupla contagem + histórico conversa
- `app/services/agent/action_applier.py` — aplica decisões: exclude, map_factor, equipment_calc, decompose (cria sub-itens reais)
- `app/services/agent/rule_based_resolver.py` — fallback local quando Gemini indisponível
- `app/api/agent.py` — 3 endpoints: `/pending-summary`, `/resolve`, `/apply`

**Fluxo:**
1. Usuário clica botão rápido ou digita mensagem
2. `context_builder` monta prompt com Skill + itens + regras + histórico
3. `gemini_client` envia `.txt` ao n8n → Gemini responde JSON
4. Backend corrige IDs inválidos (Gemini às vezes inventa UUIDs)
5. Frontend exibe action cards com aceitar/rejeitar individual
6. Usuário clica "Aceitar e aplicar todos" → `action_applier` persiste no banco
7. Lateral atualiza (itens resolvidos somem, contagem diminui)

**Regras de decisão por tipo:**
- **Tipo B** (Mão de obra) → excluir com justificativa GHG Protocol
- **Tipo C** (Agrupado) → decompor em sub-itens reais (`parent_item_id` no AbcItem)
- **Tipo D** (Embutido) → verificar dupla contagem com Tipo A
- **Tipo E** (Equipamento) → cadeia consumo/hora × fator combustível
- **Tipo F** (Administrativo) → excluir com justificativa

**Decomposição Tipo C — sub-itens reais:**
O `action_applier` cria novos `AbcItem` com `parent_item_id` vinculado ao pai. Cada sub-item recebe seu próprio `ItemMapping` e tipo (A, B ou E). O item pai é marcado como "excluído" (emissões nos sub-itens).

**Histórico de conversa:**
O frontend envia `conversation_history` com as últimas 6 mensagens. O context builder inclui no prompt para que o Gemini possa "corrigir" decisões anteriores.

### 3.3 Factor Rules + Equipment Rules ✅

**Tabelas:**
- `FactorRule` — keyword normalizado, fator, fonte, `times_applied`
- `EquipmentRule` — keyword, combustível, consumo/h, fator emissão

**Endpoints:**
- `GET/POST/DELETE /api/factor-rules`
- `GET/POST/DELETE /api/equipment-rules`
- `GET /api/equipment-rules/suggest/{item_id}` — sugere perfil
- `GET /api/equipment-rules/defaults` — perfis padrão

**Auto-map usa regras salvas primeiro** (prioridade 0 antes de GHG/CECarbon/Ecoinvent).

### 3.4 Frontend do Agente ✅

**Arquivos:**
- `lib/api/agent.ts` — API client TypeScript
- `components/agent/agent-chat.tsx` — chat real com:
  - Painel esquerdo: itens pendentes agrupados por tipo, clicáveis individualmente
  - Botões rápidos: "Resolver Tipo A/B/C/D/E/F" (envia `item_type` para filtrar)
  - Action cards: aceitar ✓ / rejeitar ✗ individual + "Aceitar e aplicar todos"
  - Loading com "Analisando itens com Gemini AI..."
  - Contagem atualiza após aplicar decisões

### 3.5 Export Excel ✅

**Endpoint:** `GET /api/projects/{id}/export-items`

**Excel gerado com:**
- **Aba "Todos os Itens"** — 113 itens completos
- **Aba por tipo** (A, B, C, D, E, F) — com cor de tab diferente, só itens do tipo
- **Aba "Legenda"** — tipos, status, fontes de fatores
- **Colunas:** código, descrição, qtd, un, custo, % pareto, classe, tipo, status, fator sugerido (nome/valor/unidade/fonte/confiança/score), sugestão de parametrização, colunas para preenchimento manual
- **Filename:** `ZNIT_{NomeProjeto}_{data}.xlsx`

### 3.6 Fontes de emissão adicionais ✅

**CECarbon** (`produtos_cecarbon_dev` no Supabase) — 120 materiais brasileiros com fatores em kgCO₂/unidade.

**Hierarquia atualizada:**
1. Regras salvas (FactorRule/EquipmentRule)
2. GHG Protocol BR (combustíveis)
3. CECarbon (materiais BR)
4. Ecoinvent (global)
5. Manual / Exclusão

### 3.7 Endpoints da Parte 3

```
GET  /api/agent/projects/{id}/pending-summary    → resumo itens pendentes por tipo
POST /api/agent/projects/{id}/resolve            → envia prompt ao Gemini, retorna decisões
POST /api/agent/projects/{id}/apply              → aplica decisões aceitas

GET/POST/DELETE /api/factor-rules
GET/POST/DELETE /api/equipment-rules
GET /api/equipment-rules/suggest/{item_id}
GET /api/equipment-rules/defaults

GET /api/projects/{id}/export-items              → download Excel
```

---

## Parte 4 — Relatórios e Exportações ❌ NÃO INICIADA

**Objetivo:** Excel compatível com Power BI + memorando de cálculo PDF com identidade visual HTB.

**Critério de aceite:** Download do PDF com logo HTB, metodologia, premissas e emissões por item. Excel abre no Power BI sem ajuste.

### 4.1 Exportação Excel (`openpyxl`)

```python
# services/reporter.py
# Aba 1 "Emissões por Item": CostCode | Descrição | Tipo | Qtd | Unid | EPD |
#   Fator kgCO₂e/unid | Scope | Emissão kgCO₂e | Emissão tCO₂e |
#   Emissão Logística | Total tCO₂e | % Total | Classe P1/P2/P3
# Aba 2 "Resumo": KPIs, breakdown por scope, breakdown por categoria
# Sem merged cells; tipos de coluna corretos para Power BI
```

### 4.2 Memorando PDF (`reportlab`)

Seções obrigatórias:
1. Capa: projeto, empresa, data, versão, logo do cliente
2. Premissas metodológicas (todas as ItemPremissa do projeto)
3. Fontes de fatores utilizadas — separadas por tier:
   - Fatores EPD: lista com nome, fabricante, programa e URL
   - Fatores GHG Protocol: publicação e ano
   - Fatores Ecoinvent: versão, `system_boundary`, `region` + aviso de origem europeia
   - Fatores manuais: fonte e justificativa fornecida pelo analista
4. Itens excluídos do inventário: lista com justificativa por item
5. Resultado por cenário: KPIs, breakdown scope
6. Top 20 emissores
7. Lista completa de itens com emissão calculada e tier do fator
8. Glossário e referências

### 4.3 Endpoints da Parte 4

```
GET    /api/scenarios/{id}/export/excel
GET    /api/scenarios/{id}/export/csv
GET    /api/scenarios/{id}/export/memo
GET    /api/projects/{id}/export/comparison
```

### 4.4 Branding por empresa

`Company` precisa de `logo_url` (Supabase Storage), `color_primary`, `color_secondary`.
Tela `/settings/branding` no frontend ainda não implementada.

---

## Parte 5 — Multi-tenant e Produção ❌ NÃO INICIADA

**Objetivo:** Preparar para múltiplos clientes além da HTB.

### 5.1 Auth completa
- Reset de senha por email
- Convite por email (`POST /api/auth/invite`)
- Tela `/settings/team`: listar usuários, alterar papel, revogar acesso

### 5.2 Row Level Security
Verificar que todas as queries filtram por `company_id` do usuário autenticado. Nenhum endpoint pode vazar dados entre empresas.

### 5.3 Deploy

| Serviço | Plataforma | Plano |
|---|---|---|
| Frontend | Vercel | Free (hobby) |
| Backend | Railway | Starter (~$5/mês) |
| Banco | Supabase PostgreSQL | Free (500MB) |
| Storage | Supabase | Free (1GB) |
| LLM | Anthropic API | Pay-as-you-go |

Estimativa de custo API para o piloto (90 dias):
~20 sessões × ~5k tokens = ~100k tokens → Claude Sonnet 4.6: ~$0,30 total.

---

## Resumo — status por parte

| Parte | Entregável | Status |
|---|---|---|
| **1** | Parser + banco + upload + tabela de itens | ✅ Completa |
| **2** | EPDs + mapeamento + cenário base + calculator | ✅ Completa |
| **3** | Agente IA (Gemini) + regras + export Excel | ✅ Completa |
| **3.5** | Deploy Render (Docker) + Power BI endpoints | ✅ Completa |
| **4** | PDF memorando + cenários alternativos | 🔴 Não iniciada |
| **5** | Multi-tenant + deploy produção | 🔴 Não iniciada |

---

## Parte 3.5 — Deploy + Power BI ✅ COMPLETA

### Deploy no Render (Docker)
- **URL:** `https://znit-carbon.onrender.com`
- **Arquitetura:** Docker container único com Next.js (porta $PORT) + FastAPI (porta 8000 interna)
- **Dockerfile:** Node 20 + Python 3, build Next.js, roda ambos com `CMD bash -c "uvicorn ... & npm start"`
- **Next.js rewrites:** `/api/*` → `http://127.0.0.1:8000/api/*` (proxy interno)
- **API client:** usa caminhos relativos (`/api/...`), sem `NEXT_PUBLIC_API_URL` hardcoded
- **Free tier:** serviço dorme após 15min sem tráfego, acorda em ~30s

### Power BI Endpoints (API key auth)
Endpoints JSON tabulares para consumo direto por Power BI Desktop:

| Endpoint | Dados |
|---|---|
| `GET /api/projects/{id}/powerbi/items?api_key=...` | 113 itens com emissão, fator, tipo, classe, score |
| `GET /api/projects/{id}/powerbi/scenarios?api_key=...` | Cenários com KPIs (tCO₂e, intensidade, cobertura) |
| `GET /api/projects/{id}/powerbi/emissoes-por-categoria?api_key=...` | Emissões por material + % Pareto |

**API key:** `znit-htb-powerbi-2026` (configurável via env `POWERBI_API_KEY`)

**Uso no Power BI Desktop:**
1. Get Data → Web → colar URL com api_key
2. Power BI importa tabela JSON
3. Criar gráficos customizados
4. Refresh → dados atualizados da API
5. Publicar no Power BI Service → dashboard online

### Environment Variables (Render)
```
DATABASE_URL=sqlite:///./znit_carbon.db
JWT_SECRET=znit-htb-secret-2026-prod
FRONTEND_URL=*
SUPABASE_URL=https://xyuqhpgjbrattreuvfzy.supabase.co
SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SCHEMA=backend
N8N_WEBHOOK_URL=https://orchestration.znit.ai/webhook/ocr-gemini
POWERBI_API_KEY=znit-htb-powerbi-2026
```

---

## Próximo passo — Parte 4 ou polish do piloto

**Pré-requisitos concluídos:** Partes 1, 2, 3 e deploy completos.

**Pendências menores (não bloqueiam):**
- Cenários alternativos: criar, editar fatores, comparar com base
- Gráficos Pareto e Scope Donut: alimentar com dados reais (atualmente mock interno)

**Parte 4 — o que implementar:**
1. Memorando PDF com identidade HTB (capa, premissas, fontes, resultados)
2. Cenários alternativos (criar a partir do base, trocar fatores, comparar)
3. Endpoint `/api/scenarios/{id}/export/memo` (PDF)

### Conhecimentos técnicos importantes para continuidade

**Arquitetura do Agente IA:**
- Backend Python envia prompt como `.txt` ao webhook n8n OCR
- n8n passa para Gemini 2.5 Pro que responde em JSON
- Se Gemini falha → fallback `rule_based_resolver.py` resolve localmente
- Gemini pode inventar UUIDs falsos → backend corrige automaticamente
- Histórico de conversa enviado no prompt (últimas 6 mensagens)

**Decomposição Tipo C:**
- `AbcItem.parent_item_id` vincula sub-itens ao pai
- Cada sub-item é um `AbcItem` real com seu próprio `ItemMapping`
- Item pai marcado como "excluído" (emissões nos sub-itens)

**Cuidado com reimportação:** Ao reimportar a curva ABC: `rm znit_carbon.db` e reimportar.

**Fluxo completo testado (tudo no browser):**
```
1. Login (joao@znit.io / demo1234)
2. Importar XLSM → 113 itens (61 Tipo A, 18 B, 25 C, 2 D, 4 E, 2 F, 1 inclassificável)
3. Itens → Auto-Map Tipo A → ~40+ sugeridos, ~20 pendentes
4. Filtro Status: Mapeados | Sugeridos | Pendentes
5. Duplo-clique item → drawer → Editar Fator de Emissão → busca GHG/CECarbon/Ecoinvent/EPD + manual
6. Fator atual aparece no topo se já mapeado
7. Confirmar fator → salva no banco → tabela atualiza
8. Overview → Gerar Cenário Base → KPIs reais
9. Agente IA → botões rápidos "Resolver Tipo B/C/D/E/F" → action cards → aceitar e aplicar
10. Agente IA → clicar item individual na lateral → resolver 1 item
11. Exportar Excel → ZNIT_{projeto}_{data}.xlsx com abas por tipo + legenda
```

**Portas:**
- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000`

**Variáveis de ambiente:**
```
N8N_WEBHOOK_URL=https://orchestration.znit.ai/webhook/ocr-gemini
SUPABASE_URL=https://xyuqhpgjbrattreuvfzy.supabase.co
SUPABASE_ANON_KEY=eyJhbGci...
```
