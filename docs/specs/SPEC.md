# SPEC Técnica — ZNIT Carbon Calculator
**Versão:** 1.1 | **Data:** 2026-03-17 | **Referência:** PRD v1.1
**Escopo:** Piloto Grupo HTB — Raízen VRO R8

---

## 1. Visão Geral da Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│  CLIENTE (Browser)                                              │
│  Next.js 14 — App Router — TypeScript — Tailwind + shadcn/ui   │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTPS / REST + SSE
┌───────────────────────────▼─────────────────────────────────────┐
│  BACKEND                                                        │
│  Python 3.12 — FastAPI — Uvicorn (ASGI)                        │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐   │
│  │  API Routes  │  │   Services   │  │   Agent Service    │   │
│  │  (FastAPI)   │  │  (domínios)  │  │  (Claude API)      │   │
│  └──────┬───────┘  └──────┬───────┘  └─────────┬──────────┘   │
│         └─────────────────┴──────────────────────┘             │
│                            │ SQLAlchemy ORM                     │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│  BANCO DE DADOS                                                 │
│  PostgreSQL 15 (Supabase)                                       │
│  Row Level Security — isolamento por company_id                 │
│  Supabase Storage — arquivos XLSX/PDF                           │
└─────────────────────────────────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│  SERVIÇOS EXTERNOS                                              │
│  Anthropic API (Claude Sonnet) — Agent LLM                      │
│  Supabase Auth — JWT + refresh tokens                           │
│  Resend — emails transacionais (convite, reset senha)           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Stack Definitivo

### 2.1 Frontend

| Pacote | Versão | Uso |
|---|---|---|
| `next` | 14.x (App Router) | Framework principal |
| `typescript` | 5.x | Tipagem estática |
| `tailwindcss` | 3.x | Utilitários CSS |
| `@shadcn/ui` | latest | Componentes base (Radix UI) |
| `recharts` | 2.x | Gráficos (Pareto, barras, donut) |
| `@tanstack/react-query` | 5.x | Data fetching, cache, mutations |
| `axios` | 1.x | HTTP client |
| `react-dropzone` | 14.x | Upload de arquivos |
| `react-hook-form` | 7.x | Gerenciamento de formulários |
| `zod` | 3.x | Validação de schemas |
| `date-fns` | 3.x | Formatação de datas |
| `lucide-react` | latest | Ícones |
| `@supabase/supabase-js` | 2.x | Auth client |

### 2.2 Backend

| Pacote | Versão | Uso |
|---|---|---|
| `fastapi` | 0.111.x | Framework API |
| `uvicorn[standard]` | 0.29.x | Servidor ASGI |
| `pydantic` | 2.x | Validação e serialização |
| `sqlalchemy` | 2.x | ORM (async) |
| `alembic` | 1.x | Migrations |
| `asyncpg` | 0.29.x | Driver PostgreSQL async |
| `pandas` | 2.x | Processamento de DataFrames |
| `openpyxl` | 3.x | Leitura de XLSX/XLSM |
| `anthropic` | 0.26.x | Claude API com tool use |
| `python-jose[cryptography]` | 3.x | JWT |
| `passlib[bcrypt]` | 1.x | Hash de senhas |
| `reportlab` | 4.x | Geração de PDF |
| `thefuzz` | 0.22.x | Similarity matching (EPD mapper) |
| `python-multipart` | 0.0.x | Upload de arquivos |
| `httpx` | 0.27.x | HTTP async client |
| `python-dotenv` | 1.x | Variáveis de ambiente |

---

## 3. Estrutura de Pastas

```
znit-carbon/
│
├── frontend/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── layout.tsx
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx                    # shell com sidebar
│   │   │   ├── page.tsx                      # /dashboard — portfólio
│   │   │   ├── projects/
│   │   │   │   ├── new/page.tsx
│   │   │   │   └── [id]/
│   │   │   │       ├── layout.tsx            # tabs de navegação do projeto
│   │   │   │       ├── overview/page.tsx     # KPIs + Pareto + alertas
│   │   │   │       ├── import/page.tsx       # upload + preview ABC
│   │   │   │       ├── items/page.tsx        # tabela completa de itens
│   │   │   │       ├── agent/page.tsx        # painel chat com agente
│   │   │   │       ├── scenarios/
│   │   │   │       │   ├── page.tsx          # lista de cenários
│   │   │   │       │   └── compare/page.tsx  # comparativo
│   │   │   │       └── reports/page.tsx      # exportações
│   │   │   └── library/
│   │   │       ├── page.tsx                  # premissa library
│   │   │       ├── equipment/page.tsx        # perfis de equipamento
│   │   │       └── policies/page.tsx         # políticas corporativas
│   │   └── api/                              # Next.js API routes (proxy)
│   │       └── [...path]/route.ts
│   │
│   ├── components/
│   │   ├── ui/                               # shadcn/ui gerados
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── TopBar.tsx
│   │   │   └── ProjectTabs.tsx
│   │   ├── dashboard/
│   │   │   ├── ProjectCard.tsx
│   │   │   └── PortfolioStats.tsx
│   │   ├── import/
│   │   │   ├── FileDropzone.tsx
│   │   │   ├── ImportPreviewTable.tsx
│   │   │   └── ImportResultCard.tsx
│   │   ├── items/
│   │   │   ├── ItemsTable.tsx
│   │   │   ├── ItemTypeBadge.tsx             # A-F com cor
│   │   │   ├── MappingStatusBadge.tsx        # auto/manual/pending/blocked
│   │   │   └── AlertsPanel.tsx
│   │   ├── agent/
│   │   │   ├── AgentPanel.tsx                # layout 2 colunas
│   │   │   ├── PendingItemsList.tsx          # coluna esquerda
│   │   │   ├── AgentChat.tsx                 # coluna direita
│   │   │   ├── AgentMessage.tsx              # bolha com action cards
│   │   │   └── AgentActionCard.tsx           # card de decisão inline
│   │   ├── scenarios/
│   │   │   ├── ScenarioCard.tsx
│   │   │   └── ScenarioCompareTable.tsx
│   │   ├── charts/
│   │   │   ├── ParetoChart.tsx
│   │   │   ├── ScopeDonutChart.tsx
│   │   │   └── ScenarioBarChart.tsx
│   │   └── reports/
│   │       └── ExportButtons.tsx
│   │
│   ├── lib/
│   │   ├── api.ts                            # axios instance + interceptors
│   │   ├── auth.ts                           # supabase auth helpers
│   │   └── utils.ts                          # cn(), formatters
│   │
│   ├── hooks/
│   │   ├── useProject.ts
│   │   ├── useItems.ts
│   │   ├── useAgentStream.ts                 # SSE streaming do agente
│   │   └── useScenarios.ts
│   │
│   ├── types/
│   │   └── index.ts                          # todos os tipos TypeScript
│   │
│   └── .env.local
│
├── backend/
│   ├── app/
│   │   ├── main.py                           # FastAPI app, routers, CORS
│   │   ├── core/
│   │   │   ├── config.py                     # Settings (pydantic-settings)
│   │   │   ├── database.py                   # async engine + session
│   │   │   ├── auth.py                       # JWT decode, get_current_user
│   │   │   └── deps.py                       # FastAPI dependencies
│   │   │
│   │   ├── models/                           # SQLAlchemy declarative models
│   │   │   ├── base.py                       # Base, TimestampMixin
│   │   │   ├── company.py
│   │   │   ├── user.py
│   │   │   ├── project.py
│   │   │   ├── abc_curve.py
│   │   │   ├── abc_item.py
│   │   │   ├── emission_factor.py            # antes: epd_factor.py
│   │   │   ├── item_mapping.py
│   │   │   ├── item_premissa.py
│   │   │   ├── premissa_rule.py
│   │   │   ├── decomposition_template.py
│   │   │   ├── equipment_profile.py
│   │   │   ├── corporate_policy.py
│   │   │   ├── scenario.py
│   │   │   ├── scenario_item.py
│   │   │   ├── scenario_result.py
│   │   │   └── agent_conversation.py
│   │   │
│   │   ├── schemas/                          # Pydantic request/response
│   │   │   ├── project.py
│   │   │   ├── abc_item.py
│   │   │   ├── emission_factor.py            # antes: epd_factor.py
│   │   │   ├── scenario.py
│   │   │   ├── agent.py
│   │   │   └── library.py
│   │   │
│   │   ├── api/                              # FastAPI routers
│   │   │   ├── __init__.py
│   │   │   ├── auth.py
│   │   │   ├── projects.py
│   │   │   ├── items.py
│   │   │   ├── scenarios.py
│   │   │   ├── reports.py
│   │   │   ├── agent.py                      # SSE endpoint
│   │   │   ├── library.py                    # rules, profiles, policies
│   │   │   └── admin.py
│   │   │
│   │   └── services/
│   │       ├── parser.py                     # XLSX/XLSM → AbcItem[]
│   │       ├── classifier.py                 # detecta tipo A-F
│   │       ├── epd_mapper.py                 # auto-mapping Tipo A
│   │       ├── calculator.py                 # engine Scope 1/2/3
│   │       ├── reporter.py                   # PDF + Excel
│   │       ├── double_count.py               # detector pares Tipo D
│   │       └── agent/
│   │           ├── agent.py                  # orquestrador LLM
│   │           ├── tools.py                  # 10 ferramentas Claude tool use
│   │           ├── prompts.py                # system prompts por tipo
│   │           └── rule_engine.py            # rule matching + score update
│   │
│   ├── migrations/
│   │   ├── env.py
│   │   └── versions/
│   │
│   ├── tests/
│   │   ├── test_parser.py
│   │   ├── test_classifier.py
│   │   ├── test_rule_engine.py
│   │   └── test_calculator.py
│   │
│   └── .env
│
└── docs/
    ├── PRD — ZNIT Carbon Calculator.md
    ├── SPEC — ZNIT Carbon Calculator.md     ← este arquivo
    └── premissa-library-spec.md
```

---

## 4. Schema do Banco de Dados (DDL Completo)

```sql
-- ============================================================
-- MULTI-TENANT BASE
-- ============================================================

CREATE TABLE companies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  logo_url    TEXT,
  color_primary    TEXT DEFAULT '#16a34a',
  color_secondary  TEXT DEFAULT '#064e3b',
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  role        TEXT NOT NULL CHECK (role IN ('admin','analyst','viewer','znit_superadmin')),
  password_hash TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- PROJETOS E IMPORTAÇÃO
-- ============================================================

CREATE TABLE projects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  name            TEXT NOT NULL,
  client_name     TEXT,
  address         TEXT,
  total_area_m2   NUMERIC,
  building_type   TEXT,
  status          TEXT DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE abc_curves (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_name       TEXT NOT NULL,
  file_url        TEXT,                          -- Supabase Storage URL
  imported_by     UUID REFERENCES users(id),
  imported_at     TIMESTAMPTZ DEFAULT now(),
  version         INT DEFAULT 1,
  total_cost      NUMERIC,
  item_count      INT
);

CREATE TYPE item_type_enum AS ENUM ('A','B','C','D','E','F');
CREATE TYPE mapping_status_enum AS ENUM ('auto','manual','pending','blocked','excluded','agent_applied');

CREATE TABLE abc_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  abc_curve_id      UUID NOT NULL REFERENCES abc_curves(id) ON DELETE CASCADE,
  cost_code         TEXT NOT NULL,
  description       TEXT NOT NULL,
  quantity          NUMERIC,
  unit              TEXT,
  unit_cost         NUMERIC,
  total_cost        NUMERIC,
  cost_pct          NUMERIC,                     -- % do total
  cumulative_pct    NUMERIC,                     -- % acumulado (Pareto)
  abc_class         TEXT CHECK (abc_class IN ('P1','P2','P3')),
  item_type         item_type_enum NOT NULL DEFAULT 'A',
  mapping_status    mapping_status_enum DEFAULT 'pending',
  type_overridden_by   UUID REFERENCES users(id),
  type_override_reason TEXT,
  sort_order        INT,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- BANCO DE EPDs / FATORES DE EMISSÃO
-- ============================================================

CREATE TABLE emission_factors (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_tier           TEXT NOT NULL CHECK (source_tier IN ('rule','epd','ghg_protocol','cecarbon','ecoinvent')),
  material_name         TEXT NOT NULL,
  category              TEXT NOT NULL,           -- 'Concreto','Aço','Solo','Madeira',...
  variant_name          TEXT,                    -- 'com 30% cinza volante'
  factor_kgco2e_per_unit NUMERIC NOT NULL,
  unit                  TEXT NOT NULL,           -- 'm³','kg','m²','L','un'
  scope                 TEXT NOT NULL CHECK (scope IN ('1','2','3')),
  system_boundary       TEXT,                    -- 'A1-A3','A1-A4','cradle-to-gate' (obrig. p/ Ecoinvent)
  source                TEXT NOT NULL,           -- ex: 'GHG Protocol BR 2023','Ecoinvent 3.10'
  source_url            TEXT,
  valid_from            DATE,
  valid_until           DATE,
  keywords              TEXT[],                  -- aliases PT-BR para fuzzy matching
  region                TEXT,                    -- 'BR','EU','Global' (obrig. p/ Ecoinvent)
  is_active             BOOLEAN DEFAULT true,
  created_at            TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE item_mappings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  abc_item_id           UUID NOT NULL REFERENCES abc_items(id) ON DELETE CASCADE,
  emission_factor_id    UUID REFERENCES emission_factors(id),
  source_tier_used      TEXT CHECK (source_tier_used IN ('rule','epd','ghg_protocol','cecarbon','ecoinvent','user_custom','excluded')),
  confidence            TEXT CHECK (confidence IN ('high','medium','low')),
  similarity_score      NUMERIC,                 -- 0.0-1.0 do thefuzz
  mapped_by             TEXT DEFAULT 'auto',     -- 'auto' | user_id | 'user_custom' | 'excluded'
  -- campos para fallback manual (Nível 4)
  custom_factor_value   NUMERIC,                 -- kgCO₂e/unidade inserido pelo analista
  custom_factor_unit    TEXT,
  custom_factor_source  TEXT,                    -- fonte declarada pelo analista
  -- campos para exclusão com justificativa (Nível 5)
  exclusion_justification TEXT,
  -- Scope 3 logística
  distance_km           NUMERIC,
  transport_modal       TEXT,                    -- 'truck','rail','ship'
  tonnage               NUMERIC,
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- PREMISSAS (decisões por item × projeto)
-- ============================================================

CREATE TYPE premissa_type_enum AS ENUM (
  'exclude',
  'include_indirect',
  'include_scope3_transport',
  'decompose',
  'equipment_calc',
  'reclassify'
);

CREATE TYPE automation_level_enum AS ENUM ('autonomous','suggested','agent_chat','manual');

CREATE TABLE item_premissas (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  abc_item_id         UUID NOT NULL REFERENCES abc_items(id) ON DELETE CASCADE,
  project_id          UUID NOT NULL REFERENCES projects(id),
  premissa_type       premissa_type_enum NOT NULL,
  justification       TEXT,
  memo_text           TEXT,                      -- texto que vai no memorando PDF
  automation_level    automation_level_enum,
  rule_id             UUID,                      -- FK → premissa_rules (pode ser null)
  defined_by          UUID REFERENCES users(id),
  defined_at          TIMESTAMPTZ DEFAULT now(),
  -- campos Tipo B
  labor_workers_count     INT,
  labor_duration_months   NUMERIC,
  labor_transport_km      NUMERIC,
  labor_transport_modal   TEXT,
  -- campos Tipo E
  equipment_profile_id    UUID,                  -- FK → equipment_profiles
  -- campos Tipo C
  decomposition_status    TEXT DEFAULT 'pending'
);

-- ============================================================
-- PREMISSA LIBRARY — REGRAS REUTILIZÁVEIS
-- ============================================================

CREATE TABLE premissa_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES companies(id),  -- NULL = plataforma ZNIT
  item_type       item_type_enum NOT NULL,
  match_type      TEXT NOT NULL CHECK (match_type IN (
                    'exact_cost_code','cost_code_prefix',
                    'keyword','category','pair','item_type'
                  )),
  match_value     JSONB NOT NULL,                -- string ou array de strings
  action_type     TEXT NOT NULL,                 -- ver tabela de action types
  action_config   JSONB NOT NULL,                -- payload específico da ação
  confidence      NUMERIC DEFAULT 0.70 CHECK (confidence BETWEEN 0 AND 1),
  times_applied   INT DEFAULT 0,
  times_overridden INT DEFAULT 0,
  visibility      TEXT DEFAULT 'company' CHECK (visibility IN ('company','platform')),
  is_active       BOOLEAN DEFAULT true,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE premissa_rule_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id     UUID NOT NULL REFERENCES premissa_rules(id),
  project_id  UUID REFERENCES projects(id),
  event_type  TEXT CHECK (event_type IN ('applied','accepted','overridden','suggested')),
  old_confidence NUMERIC,
  new_confidence NUMERIC,
  user_id     UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- DECOMPOSIÇÃO (Tipo C)
-- ============================================================

CREATE TABLE decomposition_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES companies(id),  -- NULL = ZNIT
  name            TEXT NOT NULL,
  source_cost_code TEXT,
  version         INT DEFAULT 1,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE decomposition_sub_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     UUID NOT NULL REFERENCES decomposition_templates(id) ON DELETE CASCADE,
  description     TEXT NOT NULL,
  unit            TEXT,
  cost_pct        NUMERIC,                       -- % do custo total do item pai
  qty_factor      NUMERIC,                       -- quantidade relativa (opcional)
  item_type       item_type_enum DEFAULT 'A',
  sort_order      INT
);

-- ============================================================
-- PERFIS DE EQUIPAMENTO (Tipo E)
-- ============================================================

CREATE TABLE equipment_profiles (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                  UUID REFERENCES companies(id),  -- NULL = ZNIT padrão
  name                        TEXT NOT NULL,
  equipment_type              TEXT,
  fuel_type                   TEXT CHECK (fuel_type IN ('diesel','electric','gasoline','flex')),
  consumption_per_hour        NUMERIC NOT NULL,
  consumption_unit            TEXT NOT NULL,     -- 'L_h' ou 'kWh_h'
  emission_factor_kgco2_per_unit NUMERIC,        -- calculado ou manual
  factor_source               TEXT,
  is_platform_default         BOOLEAN DEFAULT false,
  created_by                  UUID REFERENCES users(id),
  created_at                  TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- POLÍTICAS CORPORATIVAS (Tipo B / F)
-- ============================================================

CREATE TABLE corporate_policies (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              UUID NOT NULL REFERENCES companies(id),
  policy_type             TEXT NOT NULL,         -- 'labor_scope','admin_scope'
  decision                TEXT NOT NULL,         -- 'exclude','include_indirect','include_scope3'
  config                  JSONB,                 -- parâmetros adicionais
  applies_to_all_projects BOOLEAN DEFAULT true,
  created_by              UUID REFERENCES users(id),
  created_at              TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- CENÁRIOS
-- ============================================================

CREATE TABLE scenarios (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  abc_curve_id    UUID REFERENCES abc_curves(id),
  name            TEXT NOT NULL,
  description     TEXT,
  status          TEXT DEFAULT 'draft' CHECK (status IN ('draft','locked')),
  version         INT DEFAULT 1,
  is_base         BOOLEAN DEFAULT false,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE scenario_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id           UUID NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  abc_item_id           UUID NOT NULL REFERENCES abc_items(id),
  emission_factor_id    UUID REFERENCES emission_factors(id), -- pode diferir do mapeamento base
  quantity_override     NUMERIC,
  emission_kgco2e       NUMERIC,
  emission_scope3_kgco2e NUMERIC,
  is_excluded           BOOLEAN DEFAULT false,
  exclusion_reason      TEXT
);

CREATE TABLE scenario_results (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id           UUID NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  total_kgco2e          NUMERIC,
  total_tco2e           NUMERIC,
  intensity_per_m2      NUMERIC,                -- tCO2e/m²
  scope1_kgco2e         NUMERIC,
  scope2_kgco2e         NUMERIC,
  scope3_materials_kgco2e NUMERIC,
  scope3_logistics_kgco2e NUMERIC,
  coverage_pct          NUMERIC,                -- % itens com emissão calculada
  calculated_at         TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- AGENTE — CONVERSAS
-- ============================================================

CREATE TABLE agent_conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id),
  user_id     UUID REFERENCES users(id),
  started_at  TIMESTAMPTZ DEFAULT now(),
  ended_at    TIMESTAMPTZ,
  items_resolved INT DEFAULT 0,
  rules_created  INT DEFAULT 0
);

CREATE TABLE agent_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
  role            TEXT CHECK (role IN ('user','assistant','tool')),
  content         TEXT NOT NULL,
  tool_name       TEXT,                          -- se role = 'tool'
  tool_input      JSONB,
  tool_output     JSONB,
  abc_item_id     UUID REFERENCES abc_items(id), -- item sendo tratado
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- AUDIT LOG
-- ============================================================

CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID REFERENCES companies(id),
  project_id  UUID REFERENCES projects(id),
  user_id     UUID REFERENCES users(id),
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   UUID,
  detail      JSONB,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_abc_items_curve ON abc_items(abc_curve_id);
CREATE INDEX idx_abc_items_type ON abc_items(item_type);
CREATE INDEX idx_abc_items_status ON abc_items(mapping_status);
CREATE INDEX idx_premissa_rules_company ON premissa_rules(company_id);
CREATE INDEX idx_premissa_rules_match ON premissa_rules(match_type, match_value);
CREATE INDEX idx_scenario_items_scenario ON scenario_items(scenario_id);
CREATE INDEX idx_audit_logs_project ON audit_logs(project_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON projects
  USING (company_id = current_setting('app.company_id')::UUID);

-- (mesmo padrão para todas as tabelas com company_id)
```

---

## 5. Contratos de API

### Convenções

- Base URL: `https://api.znit.app/v1` (produção) / `http://localhost:8000/v1` (dev)
- Autenticação: `Authorization: Bearer <jwt>`
- Paginação: `?page=1&limit=50`
- Erros: `{ "detail": "mensagem", "code": "ERROR_CODE" }`
- Datas: ISO 8601 UTC

---

### 5.1 Auth

```
POST /v1/auth/login
Body:    { "email": string, "password": string }
200:     { "access_token": string, "refresh_token": string, "user": User }

POST /v1/auth/refresh
Body:    { "refresh_token": string }
200:     { "access_token": string }

POST /v1/auth/invite
Body:    { "email": string, "role": "admin"|"analyst"|"viewer", "name": string }
201:     { "id": uuid, "email": string, "status": "invited" }

POST /v1/auth/reset-password
Body:    { "email": string }
200:     { "message": "email enviado" }
```

### 5.2 Projetos

```
GET  /v1/projects
200: { "items": Project[], "total": int }

POST /v1/projects
Body: { "name": string, "client_name"?: string, "total_area_m2"?: number,
        "address"?: string, "building_type"?: string }
201:  Project

GET  /v1/projects/{id}
200:  Project (com abc_curve e scenario counts)

PUT  /v1/projects/{id}
Body: Partial<Project>
200:  Project
```

### 5.3 Importação

```
POST /v1/projects/{id}/upload-abc
Content-Type: multipart/form-data
Body: { "file": File }
202: { "task_id": uuid, "status": "processing" }

GET  /v1/projects/{id}/upload-abc/status/{task_id}
200: { "status": "done"|"processing"|"error",
       "result": { "abc_curve_id": uuid, "item_count": int,
                   "type_breakdown": { "A":86, "B":63, "C":34, "D":9, "E":4, "F":13 } } }

GET  /v1/projects/{id}/abc-items
Query: ?type=A,B&status=pending&abc_class=P1&page=1&limit=100
200:  { "items": AbcItem[], "total": int }

GET  /v1/projects/{id}/abc-items/summary
200:  { "by_type": {...}, "by_status": {...}, "by_class": {...},
        "autonomous_applied": int, "pending_agent": int }
```

### 5.4 Mapeamento EPD (Tipo A)

```
POST /v1/projects/{id}/map-factors
Body: {}   (dispara mapeamento automático em background)
202: { "task_id": uuid }

GET  /v1/emission-factors
Query: ?tier=epd,ghg_protocol&category=Concreto&scope=3&q=fck30
200:  { "items": EmissionFactor[], "total": int }

PUT  /v1/abc-items/{id}/mapping
-- Mapeamento automático / manual → fator encontrado
Body: { "emission_factor_id": uuid, "source_tier_used": string,
        "distance_km"?: number, "transport_modal"?: string,
        "tonnage"?: number, "notes"?: string }
-- Fallback Nível 4 — fator manual inserido pelo analista
Body: { "mapped_by": "user_custom", "source_tier_used": "user_custom",
        "custom_factor_value": number, "custom_factor_unit": string,
        "custom_factor_source": string, "scope": "1"|"2"|"3" }
-- Nível 5 — exclusão com justificativa
Body: { "mapped_by": "excluded", "source_tier_used": "excluded",
        "exclusion_justification": string }
200:  ItemMapping
```

### 5.5 Agente

```
POST /v1/agent/sessions
Body: { "project_id": uuid }
201:  { "session_id": uuid, "pending_items": AbcItem[], "autonomous_applied": int }

GET  /v1/agent/sessions/{id}/stream          ← Server-Sent Events
Accept: text/event-stream
Eventos:
  data: { "type": "message", "role": "assistant", "content": string, "item_id"?: uuid }
  data: { "type": "action_card", "item_id": uuid, "suggestion": AgentSuggestion }
  data: { "type": "item_resolved", "item_id": uuid, "premissa": ItemPremissa }
  data: { "type": "rule_saved", "rule": PremissaRule }
  data: { "type": "session_complete", "summary": SessionSummary }

POST /v1/agent/sessions/{id}/message
Body: { "content": string, "item_id"?: uuid }
202: {}   (resposta chega via SSE)

POST /v1/agent/sessions/{id}/accept-suggestion
Body: { "item_id": uuid, "suggestion_id": uuid, "modifications"?: object }
200:  { "premissa": ItemPremissa, "rule_updated": PremissaRule }

POST /v1/agent/sessions/{id}/run-autonomous
Body: {}
200:  { "applied": int, "suggested": int, "pending": int }
```

### 5.6 Cenários

```
POST /v1/projects/{id}/scenarios
Body: { "name": string, "description"?: string, "source_scenario_id"?: uuid }
201:  Scenario

GET  /v1/projects/{id}/scenarios
200:  Scenario[]

GET  /v1/scenarios/{id}
200:  Scenario (com items e result)

PUT  /v1/scenarios/{id}/items/{item_id}
Body: { "emission_factor_id"?: uuid, "quantity_override"?: number,
        "is_excluded"?: boolean, "exclusion_reason"?: string }
200:  ScenarioItem

POST /v1/scenarios/{id}/calculate
Body: {}
200:  ScenarioResult

GET  /v1/projects/{id}/scenarios/compare?ids=uuid1,uuid2,uuid3
200:  { "scenarios": ScenarioWithResult[], "delta": DeltaMatrix }
```

### 5.7 Relatórios

```
GET /v1/scenarios/{id}/export/excel
200: application/vnd.openxmlformats (.xlsx)

GET /v1/scenarios/{id}/export/csv
200: text/csv

GET /v1/scenarios/{id}/export/memo
200: application/pdf

GET /v1/projects/{id}/export/comparison?scenario_ids=uuid1,uuid2
200: application/pdf
```

### 5.8 Biblioteca (Rules, Profiles, Policies)

```
GET  /v1/library/premissa-rules
GET  /v1/library/premissa-rules/match?cost_code=450201&type=C
POST /v1/library/premissa-rules
PUT  /v1/library/premissa-rules/{id}
POST /v1/library/premissa-rules/{id}/feedback
Body: { "event": "accepted"|"overridden", "project_id": uuid }

GET  /v1/library/equipment-profiles
POST /v1/library/equipment-profiles
PUT  /v1/library/equipment-profiles/{id}

GET  /v1/library/policies
PUT  /v1/library/policies
Body: { "labor_scope": {...}, "admin_scope": {...} }

GET  /v1/library/decomposition-templates
POST /v1/library/decomposition-templates
POST /v1/library/decomposition-templates/{id}/apply
Body: { "abc_item_id": uuid, "cost_adjustments"?: { [sub_item_id]: number } }
```

---

## 6. Schemas TypeScript (Frontend Types)

```typescript
// types/index.ts

export type UserRole = 'admin' | 'analyst' | 'viewer' | 'znit_superadmin'
export type ItemType = 'A' | 'B' | 'C' | 'D' | 'E' | 'F'
export type MappingStatus = 'auto' | 'manual' | 'pending' | 'blocked' | 'excluded' | 'agent_applied'
export type AbcClass = 'P1' | 'P2' | 'P3'
export type Scope = 1 | 2 | 3
export type AutomationLevel = 'autonomous' | 'suggested' | 'agent_chat' | 'manual'

export interface User {
  id: string
  company_id: string
  name: string
  email: string
  role: UserRole
}

export interface Project {
  id: string
  company_id: string
  name: string
  client_name?: string
  address?: string
  total_area_m2?: number
  building_type?: string
  status: 'active' | 'archived'
  created_at: string
  scenario_count?: number
  latest_result?: ScenarioResult
}

export interface AbcItem {
  id: string
  abc_curve_id: string
  cost_code: string
  description: string
  quantity?: number
  unit?: string
  unit_cost?: number
  total_cost?: number
  cost_pct?: number
  cumulative_pct?: number
  abc_class?: AbcClass
  item_type: ItemType
  mapping_status: MappingStatus
  emission_factor?: EmissionFactor
  emission_kgco2e?: number
}

export interface AbcItemSummary {
  by_type: Record<ItemType, number>
  by_status: Record<MappingStatus, number>
  by_class: Record<AbcClass, number>
  autonomous_applied: number
  pending_agent: number
}

export interface EmissionFactor {
  id: string
  source_tier: 'epd' | 'ghg_protocol' | 'ecoinvent'
  material_name: string
  category: string
  variant_name?: string
  factor_kgco2e_per_unit: number
  unit: string
  scope: '1' | '2' | '3'
  system_boundary?: string          // ex: 'A1-A3' — obrigatório para Ecoinvent
  source: string
  source_url?: string
  valid_until?: string
  keywords?: string[]
  region?: string                   // 'BR' | 'EU' | 'Global'
}

export interface ItemMapping {
  id: string
  abc_item_id: string
  emission_factor_id?: string
  source_tier_used?: 'epd' | 'ghg_protocol' | 'ecoinvent' | 'user_custom' | 'excluded'
  confidence?: 'high' | 'medium' | 'low'
  similarity_score?: number
  mapped_by: string                 // 'auto' | user_id | 'user_custom' | 'excluded'
  custom_factor_value?: number
  custom_factor_unit?: string
  custom_factor_source?: string
  exclusion_justification?: string
  distance_km?: number
  transport_modal?: string
  tonnage?: number
  notes?: string
}

export interface Scenario {
  id: string
  project_id: string
  name: string
  description?: string
  status: 'draft' | 'locked'
  version: number
  is_base: boolean
  created_at: string
  result?: ScenarioResult
  items?: ScenarioItem[]
}

export interface ScenarioResult {
  id: string
  scenario_id: string
  total_tco2e: number
  intensity_per_m2?: number
  scope3_materials_kgco2e: number
  scope3_logistics_kgco2e: number
  coverage_pct: number
  calculated_at: string
}

export interface PremissaRule {
  id: string
  company_id?: string
  item_type: ItemType
  match_type: string
  match_value: string | string[]
  action_type: string
  action_config: Record<string, unknown>
  confidence: number
  times_applied: number
  times_overridden: number
  visibility: 'company' | 'platform'
}

export interface AgentMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  item_id?: string
  created_at: string
}

export interface AgentSuggestion {
  id: string
  item_id: string
  action_type: string
  description: string
  rationale: string
  confidence: number
  details: Record<string, unknown>
}

export interface AgentSessionSummary {
  items_resolved: number
  rules_saved: number
  autonomous_applied: number
  duration_seconds: number
}
```

---

## 7. Especificação do Agente (Claude tool use)

### 7.1 System Prompt Base

```
Você é o Agente ZNIT, especialista em inventários de carbono para projetos de
construção civil brasileira. Sua função é ajudar analistas a parametrizar itens
de orçamento (Curva ABC do iTwo) que não podem ser mapeados automaticamente.

Você age de forma proativa: propõe soluções baseadas em projetos anteriores,
explica seu raciocínio de forma simples, e pede confirmação antes de salvar
qualquer decisão. Fala em português do Brasil.

Regras de comportamento:
- Resolva um item por vez, do maior impacto financeiro para o menor
- Agrupe itens similares (mesmo tipo + mesmo padrão) e resolva em lote
- Sempre cite a fonte da sua sugestão (regra salva, projeto similar, padrão ZNIT)
- Seja direto: máximo 3 parágrafos por mensagem
- Quando propuser uma decisão, apresente como action card estruturado
- Sempre pergunte se quer salvar como regra antes de encerrar o item
```

### 7.2 Ferramentas do Agente

```python
tools = [
  {
    "name": "get_item_details",
    "description": "Retorna dados completos de um item da Curva ABC",
    "input_schema": {
      "type": "object",
      "properties": { "item_id": {"type": "string"} },
      "required": ["item_id"]
    }
  },
  {
    "name": "get_pending_items",
    "description": "Lista todos os itens pendentes do projeto, ordenados por impacto",
    "input_schema": {
      "type": "object",
      "properties": {
        "project_id": {"type": "string"},
        "item_type": {"type": "string", "enum": ["B","C","D","E","F"]}
      },
      "required": ["project_id"]
    }
  },
  {
    "name": "search_premissa_library",
    "description": "Busca regras salvas que possam se aplicar a um item",
    "input_schema": {
      "type": "object",
      "properties": {
        "cost_code": {"type": "string"},
        "keywords": {"type": "array", "items": {"type": "string"}},
        "item_type": {"type": "string"},
        "company_id": {"type": "string"}
      }
    }
  },
  {
    "name": "check_double_count_risk",
    "description": "Verifica se um item Tipo D tem risco de dupla contagem com outro item do projeto",
    "input_schema": {
      "type": "object",
      "properties": {
        "item_id": {"type": "string"},
        "project_id": {"type": "string"}
      },
      "required": ["item_id", "project_id"]
    }
  },
  {
    "name": "get_equipment_profiles",
    "description": "Lista perfis de equipamento disponíveis (empresa + ZNIT padrão)",
    "input_schema": {
      "type": "object",
      "properties": { "company_id": {"type": "string"} }
    }
  },
  {
    "name": "get_corporate_policies",
    "description": "Retorna políticas de escopo já definidas pela empresa",
    "input_schema": {
      "type": "object",
      "properties": { "company_id": {"type": "string"} },
      "required": ["company_id"]
    }
  },
  {
    "name": "get_decomposition_templates",
    "description": "Busca templates de decomposição para um item agrupado",
    "input_schema": {
      "type": "object",
      "properties": {
        "cost_code": {"type": "string"},
        "company_id": {"type": "string"}
      }
    }
  },
  {
    "name": "apply_premissa",
    "description": "Grava a decisão de premissa para um item. Só chamar após confirmação do usuário.",
    "input_schema": {
      "type": "object",
      "properties": {
        "item_id": {"type": "string"},
        "premissa_type": {"type": "string"},
        "config": {"type": "object"},
        "memo_text": {"type": "string"}
      },
      "required": ["item_id", "premissa_type", "config"]
    }
  },
  {
    "name": "save_rule",
    "description": "Salva uma regra na Premissa Library para uso futuro",
    "input_schema": {
      "type": "object",
      "properties": {
        "item_type": {"type": "string"},
        "match_type": {"type": "string"},
        "match_value": {},
        "action_type": {"type": "string"},
        "action_config": {"type": "object"},
        "visibility": {"type": "string", "enum": ["company","platform"]},
        "company_id": {"type": "string"}
      },
      "required": ["item_type","match_type","match_value","action_type","action_config"]
    }
  },
  {
    "name": "apply_corporate_policy",
    "description": "Aplica uma política corporativa a todos os itens elegíveis do projeto de uma vez",
    "input_schema": {
      "type": "object",
      "properties": {
        "project_id": {"type": "string"},
        "policy_type": {"type": "string"},
        "decision": {"type": "string"},
        "config": {"type": "object"},
        "save_as_policy": {"type": "boolean"}
      },
      "required": ["project_id","policy_type","decision"]
    }
  }
]
```

---

## 8. Rule Engine — Algoritmo de Match

```python
# services/agent/rule_engine.py

CONFIDENCE_THRESHOLD_AUTO   = 0.85
CONFIDENCE_THRESHOLD_SUGGEST = 0.50

async def match_rules(item: AbcItem, company_id: str) -> MatchResult:
    """
    Cascata de matching em ordem de especificidade.
    Retorna a regra com maior confiança aplicável.
    """
    candidates = []

    # 1. Política corporativa → confiança máxima
    policy = await get_corporate_policy(company_id, item.item_type)
    if policy:
        return MatchResult(rule=policy, confidence=1.0, level='autonomous')

    # 2. CostCode exato
    rule = await find_rule(company_id, 'exact_cost_code', item.cost_code)
    if rule: candidates.append(rule)

    # 3. CostCode prefix (primeiros 6 chars)
    prefix = item.cost_code[:6]
    rule = await find_rule(company_id, 'cost_code_prefix', prefix)
    if rule: candidates.append(rule)

    # 4. Keywords na descrição
    rules = await find_rules_by_keyword(company_id, item.description)
    candidates.extend(rules)

    # 5. Categoria (ex: 'equipment:escavadeira')
    category = classify_category(item)
    rule = await find_rule(company_id, 'category', category)
    if rule: candidates.append(rule)

    # 6. Par (Tipo D) — verifica co-ocorrência no projeto
    if item.item_type == 'D':
        pair_rules = await find_pair_rules(company_id, item)
        candidates.extend(pair_rules)

    # 7. Regras de plataforma ZNIT (visibilidade global)
    platform_rules = await find_platform_rules(item)
    candidates.extend(platform_rules)

    if not candidates:
        return MatchResult(rule=None, confidence=0, level='agent_chat')

    best = max(candidates, key=lambda r: r.confidence)

    if best.confidence >= CONFIDENCE_THRESHOLD_AUTO:
        return MatchResult(rule=best, confidence=best.confidence, level='autonomous')
    elif best.confidence >= CONFIDENCE_THRESHOLD_SUGGEST:
        return MatchResult(rule=best, confidence=best.confidence, level='suggested')
    else:
        return MatchResult(rule=best, confidence=best.confidence, level='agent_chat')


async def update_confidence(rule_id: str, event: str):
    """Atualiza score após feedback do usuário."""
    deltas = {
        'accepted':           +0.05,
        'accepted_modified':  +0.01,
        'applied_other_company': +0.03,
        'overridden':         -0.10,
        'overridden_different': -0.15,
    }
    delta = deltas.get(event, 0)
    await db.execute(
        "UPDATE premissa_rules SET confidence = LEAST(1.0, GREATEST(0, confidence + $1)) WHERE id = $2",
        delta, rule_id
    )
```

---

## 9. Cálculo de Emissões

### 9.1 Fórmulas

```python
# services/calculator.py

def calc_item_emission(item: AbcItem, mapping: ItemMapping) -> float:
    """Scope 3 — embodied carbon do material"""
    if not mapping or not mapping.emission_factor:
        return 0.0
    return item.quantity * mapping.emission_factor.factor_kgco2e_per_unit  # kgCO2e

def calc_scope3_logistics(item: AbcItem, mapping: ItemMapping) -> float:
    """Scope 3 — transporte (t·km).

    Fatores de modal (kgCO2e/t·km) NÃO são hardcoded: são resolvidos em
    runtime das linhas de frete do Ecoinvent (`backend.ecoinvent_dev`,
    product_unit 'metric ton*km') via lib/server/canonical-factors.ts —
    caminhão: lorry 16-32t diesel EURO 5 (BR); trem: train fleet average;
    navio: sea container ship heavy fuel oil.

    A tonelagem é derivada da massa real do item: qty × conversão da
    unidade do item para kg (resolveConversion, incluindo receitas
    geométricas). Massa não derivável → contribuição 0 (nunca fabricar).
    """
    factor = canonical_transport_factors()[mapping.transport_modal or 'truck']
    tonnage = item.quantity * resolve_conversion(item.description, item.unit, 'kg') / 1000
    return mapping.distance_km * tonnage * factor  # kgCO2e

def calc_equipment_emission(item: AbcItem, profile: EquipmentProfile) -> float:
    """Scope 1 — combustão direta de combustível.

    Fatores de combustível NÃO são hardcoded: derivados de
    `backend.fatores_ghg_dev` (GHG Protocol BR) com GWP AR5
    (CH4×28, N2O×265) via lib/server/gwp.ts + canonical-factors.ts.
    Ex.: Óleo Diesel (comercial) 2025 → 2,643 kgCO2e/L.
    Exceção: grid elétrico (SIN) não tem tabela no banco — constante
    documentada (0,0293 kgCO2e/kWh, SIN 2024).
    """
    factor = profile.emission_factor_kgco2e or canonical_fuel_factors()[profile.fuel_type]
    return item.quantity * profile.consumption_per_hour * factor  # kgCO2e

def calc_scenario_totals(items: list[ScenarioItem]) -> ScenarioResult:
    total_materials = sum(i.emission_kgco2e or 0 for i in items if not i.is_excluded)
    total_logistics = sum(i.emission_scope3_kgco2e or 0 for i in items if not i.is_excluded)
    total_kgco2e = total_materials + total_logistics
    return ScenarioResult(
        total_kgco2e=total_kgco2e,
        total_tco2e=total_kgco2e / 1000,
        scope3_materials_kgco2e=total_materials,
        scope3_logistics_kgco2e=total_logistics,
        coverage_pct=calc_coverage(items),
    )
```

### 9.2 Fatores Padrão ZNIT (seed data)

```sql
-- Tier: ghg_protocol
INSERT INTO emission_factors (source_tier, material_name, category, variant_name, factor_kgco2e_per_unit, unit, scope, source, region, keywords) VALUES
('ghg_protocol', 'Concreto usinado Fck=30', 'Concreto', 'convencional',         355, 'm³', '3', 'GHG Protocol BR 2023', 'BR', ARRAY['concreto bombeado','fck30']),
('ghg_protocol', 'Concreto usinado Fck=30', 'Concreto', '30% cinza volante',    248, 'm³', '3', 'GHG Protocol BR 2023', 'BR', ARRAY['cinza volante','fck30']),
('ghg_protocol', 'Concreto usinado Fck=25', 'Concreto', 'convencional',         320, 'm³', '3', 'GHG Protocol BR 2023', 'BR', ARRAY['concreto','fck25']),
('ghg_protocol', 'Aço em barras CA50',      'Aço',      'convencional',        1.85, 'kg',  '3', 'GHG Protocol BR 2023', 'BR', ARRAY['ca50','vergalhão','barra']),
('ghg_protocol', 'Aço em barras CA50',      'Aço',      'aço reciclado (EAF)', 0.92, 'kg',  '3', 'GHG Protocol BR 2023', 'BR', ARRAY['ca50','reciclado','eaf']),
('ghg_protocol', 'Aço em barras CA60',      'Aço',      'convencional',        1.90, 'kg',  '3', 'GHG Protocol BR 2023', 'BR', ARRAY['ca60','vergalhão']),
('ghg_protocol', 'Diesel',                  'Combustível', 'S10',              2.68, 'L',   '1', 'GHG Protocol BR 2023', 'BR', ARRAY['diesel','s10','óleo diesel']),

-- Tier: ecoinvent
('ecoinvent', 'Concreto usinado Fck=30',    'Concreto', 'Ecoinvent 3.10 EU mix', 290, 'm³', '3', 'Ecoinvent 3.10', 'EU', ARRAY['concrete','fck30']),
('ecoinvent', 'Concreto usinado Fck=30',    'Concreto', 'geopolimérico',         160, 'm³', '3', 'Ecoinvent 3.9',  'EU', ARRAY['geopolymer','concreto']),
('ecoinvent', 'Aço em barras CA50',         'Aço',      'Ecoinvent 3.10 global', 1.70, 'kg', '3', 'Ecoinvent 3.10', 'Global', ARRAY['steel bar','rebar','ca50']),
('ecoinvent', 'Escavação/Terraplenagem',    'Solo',     'convencional',          15.0, 'm³', '3', 'IPCC 2023',      'Global', ARRAY['excavation','terraplenagem']),
('ecoinvent', 'Chapa Compensada Plastificada', 'Madeira', '18mm',                0.6, 'm²', '3', 'Ecoinvent 3.9',  'EU', ARRAY['plywood','compensado','madeira']),

-- Tier: epd (certificadas — exemplos)
('epd', 'Concreto usinado Fck=30',          'Concreto', 'EPD Votorantim 2024',  312, 'm³', '3', 'EPD Votorantim 2024', 'BR', ARRAY['votorantim','fck30','concreto']),
('epd', 'Bloco de Concreto Vedação',        'Alvenaria', '19x19x39cm',          135, 'm³', '3', 'ECI 2022',           'BR', ARRAY['bloco','vedação','alvenaria']);
```

---

## 10. Autenticação e Autorização

### 10.1 Fluxo JWT

```
Login → backend valida email/password → gera access_token (15min) + refresh_token (7d)
Frontend armazena no httpOnly cookie (SSR) ou localStorage (SPA)
Cada request: Authorization: Bearer <access_token>
Expirado: frontend chama POST /auth/refresh automaticamente
```

### 10.2 Middleware FastAPI

```python
# core/auth.py

async def get_current_user(token: str = Depends(oauth2_scheme), db = Depends(get_db)):
    payload = jose.decode(token, SECRET_KEY, algorithms=["HS256"])
    user = await db.get(User, payload["sub"])
    if not user:
        raise HTTPException(401)
    return user

async def require_role(*roles: str):
    async def check(user = Depends(get_current_user)):
        if user.role not in roles:
            raise HTTPException(403)
        return user
    return check
```

### 10.3 Permissões por Endpoint

| Endpoint | admin | analyst | viewer |
|---|---|---|---|
| POST /projects | ✅ | ✅ | ❌ |
| POST /upload-abc | ✅ | ✅ | ❌ |
| PUT /abc-items/{id}/mapping | ✅ | ✅ | ❌ |
| POST /agent/sessions | ✅ | ✅ | ❌ |
| POST /scenarios | ✅ | ✅ | ❌ |
| GET /* (leitura) | ✅ | ✅ | ✅ |
| PUT /library/* | ✅ | ❌ | ❌ |
| GET /admin/* | znit_superadmin only | | |

---

## 11. Variáveis de Ambiente

### Backend `.env`

```env
# Database
DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/znit_carbon

# Auth
SECRET_KEY=<random-256-bit>
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-6

# Supabase Storage
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=...
SUPABASE_BUCKET=znit-files

# Email
RESEND_API_KEY=re_...
FROM_EMAIL=noreply@znit.app

# App
APP_ENV=development   # development | production
CORS_ORIGINS=http://localhost:3000
```

### Frontend `.env.local`

```env
NEXT_PUBLIC_API_URL=http://localhost:8000/v1
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

---

## 12. Fluxo de Dados — Importação Completa

```
1. Usuário faz upload do XLSM
   POST /projects/{id}/upload-abc → task_id

2. Backend (background task):
   a. parser.py lê XLSM com openpyxl + pandas
   b. Detecta colunas automaticamente (CostCode, Descrição, Qtd, Un, Custo)
   c. classifier.py atribui item_type A-F a cada linha:
      - Prefixo "400101" ou keyword ["Oficial","Servente","Salário"] → B
      - Prefixo "450" + keyword ["Sub","Cimbr","Esquadr","Pintur"] → C
      - Keyword ["Corte e Dobra","Bombeamento","Arrasamento"] → D
      - Prefixo "440" ou keyword ["Retro","Caminhão","Andaime"] → E
      - Keyword ["Mensalista","HPlan","Ensaio","Prova de Carga"] → F
      - Demais → A
   d. Calcula cumulative_pct e abc_class
   e. Persiste AbcItems no banco

3. rule_engine.py executa matching para todos os itens B/C/D/E/F:
   a. Para cada item: cascata de match (seção 8)
   b. confidence ≥ 0.85 → aplica ItemPremissa automaticamente
      + registra audit_log com rule_id e confidence
   c. confidence 0.50-0.84 → status = 'suggested'
   d. sem match → status = 'pending'

4. Para itens Tipo A:
   epd_mapper.py executa similarity matching (thefuzz) em ordem de tier:
   epd → ghg_protocol → ecoinvent → fallback manual/exclusão
   vs todos os emission_factors → atribui com confidence high/medium/low

5. Task concluída → webhook/polling atualiza frontend

6. Frontend exibe tela de resultado com contagens por nível
```

---

## 13. SSE — Streaming do Agente

```python
# api/agent.py

@router.get("/sessions/{session_id}/stream")
async def agent_stream(session_id: str, user = Depends(get_current_user)):
    async def event_generator():
        session = await get_session(session_id)
        pending = await get_pending_items(session.project_id)

        for item in pending:
            # Notifica frontend qual item está sendo tratado
            yield format_sse({"type": "item_start", "item_id": str(item.id)})

            # Chama Claude com tool use (streaming)
            async with anthropic.messages.stream(
                model=settings.ANTHROPIC_MODEL,
                max_tokens=1024,
                system=build_system_prompt(item),
                messages=build_messages(session, item),
                tools=AGENT_TOOLS,
            ) as stream:
                async for event in stream:
                    if event.type == "content_block_delta":
                        yield format_sse({
                            "type": "message",
                            "role": "assistant",
                            "content": event.delta.text,
                            "item_id": str(item.id)
                        })
                    elif event.type == "tool_use":
                        result = await execute_tool(event.name, event.input)
                        yield format_sse({
                            "type": "tool_result",
                            "tool": event.name,
                            "result": result
                        })

        yield format_sse({"type": "session_complete", "summary": await get_summary(session_id)})

    return StreamingResponse(event_generator(), media_type="text/event-stream")
```

---

## 14. Testes

### 14.1 Backend

```
tests/
├── test_parser.py           # processa Curva ABC_Raizen VRO_R8.xlsm → 116 itens
├── test_classifier.py       # cada tipo A-F com exemplos reais do Raízen
├── test_rule_engine.py      # match por exact, prefix, keyword, pair
├── test_calculator.py       # fórmulas de emissão por tipo
└── test_epd_mapper.py       # similarity matching com banco de EPDs
```

**Arquivo de teste crítico:**
```python
# tests/test_parser.py
def test_parse_raizen_xlsm():
    items = parse_abc_curve("tests/fixtures/Curva ABC_Raizen VRO_R8.xlsm")
    assert len(items) >= 100
    assert all(i.cost_code for i in items)
    assert all(i.item_type in ['A','B','C','D','E','F'] for i in items)
    type_counts = Counter(i.item_type for i in items)
    assert type_counts['A'] > 50     # maioria são materiais
    assert type_counts['B'] > 40     # muita mão de obra
    assert type_counts['C'] > 10     # vários agrupados
```

### 14.2 Frontend

- Storybook para componentes isolados (AgentMessage, ItemTypeBadge, ParetoChart)
- Cypress e2e para fluxo principal: upload → agente → cenário → export

---

## 15. Deploy

### Piloto (gratuito)

| Serviço | Plano | Limite |
|---|---|---|
| Vercel | Hobby (free) | 100GB bandwidth |
| Railway | Starter ($5/mês) | 512MB RAM, 1 vCPU |
| Supabase | Free | 500MB DB, 1GB Storage |
| Anthropic | Pay-as-you-go | ~$3 por sessão completa do agente |

### CI/CD

```yaml
# .github/workflows/deploy.yml
on:
  push:
    branches: [main]
jobs:
  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: cd frontend && npm ci && npm run build
      - uses: vercel/action@v1
  backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: cd backend && pip install -r requirements.txt && pytest
      - uses: railway/action@v1
```

---

## 16. Próximos Passos de Implementação

### Sprint 1 — Fundação (Semana 1-2)
1. Setup monorepo: `znit-carbon/frontend` + `znit-carbon/backend`
2. Schema DB + migrations Alembic
3. `parser.py` — lê `Curva ABC_Raizen VRO_R8.xlsm` → AbcItem[]
4. `classifier.py` — detecta tipos A-F com regras do Raízen
5. Auth básico (login, JWT)
6. Frontend: login + dashboard + upload com preview

### Sprint 2 — Mapeamento e Agente (Semana 3-4)
7. Seed EPDs iniciais (concreto, aço, solo, diesel)
8. `epd_mapper.py` — similarity matching Tipo A
9. `rule_engine.py` — matching autônomo + score
10. `agent/` — integração Claude API com 10 ferramentas
11. Frontend: tabela de itens com badges + painel do agente (SSE)

### Sprint 3 — Cenários e Dashboard (Semana 5-6)
12. `calculator.py` — engine de emissões completo
13. Cenários: criar, duplicar, calcular, comparar
14. Dashboard: Pareto, KPIs, breakdown por scope
15. Frontend: comparativo de cenários

### Sprint 4 — Relatórios e Polimento (Semana 7-8)
16. `reporter.py` — Excel (Power BI) + PDF com identidade HTB
17. Multi-usuário: convite, papéis, RLS
18. UAT com equipe HTB
19. Ajustes e treinamento
