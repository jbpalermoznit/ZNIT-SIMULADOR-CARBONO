# ZNIT ESG — Carbon Calculator

Plataforma SaaS para calcular a pegada de carbono de projetos de construção civil.
Recebe a **Curva ABC** exportada do iTwo, mapeia cada item para um **fator de
emissão**, calcula as emissões nos Scopes 1/2/3 e gera **cenários comparativos**
para value engineering sustentável.

**Status:** Piloto — Grupo HTB (Raízen VRO R8), em preparação para lançamento aberto.

> Novo no projeto? Comece por **[Decisões de tech stack](#decisões-de-tech-stack-e-por-quê)**
> e **[O pipeline de match de fatores](#o-pipeline-de-match-de-fatores-o-coração-do-produto)** —
> é onde está 80% da complexidade e das decisões não-óbvias.

---

## Decisões de tech stack (e por quê)

Esta seção é para quem está entrando: **o que escolhemos e o motivo**, não só a lista.

| Camada | Escolha | Por quê (e o trade-off) |
|---|---|---|
| **Framework** | **Next.js 16 (App Router) + TypeScript** | Frontend e API num só deploy. Route handlers (`app/api/**`) evitam um backend separado; o piloto não justifica a complexidade de dois serviços. App Router (não Pages) pela colocação de server components + layouts aninhados por projeto. |
| **Estilo** | **Tailwind CSS + componentes shadcn-style** | Tokens de design centralizados (cores ZNIT em `CLAUDE.md`/`DESIGN_SYSTEM.md`), sem CSS-in-JS em runtime. Componentes copiados para `components/ui/` (não dependência) → controle total. |
| **Banco** | **Supabase Postgres, 2 schemas** | `public` = dados da app (multi-tenant); `backend` = catálogos de fator de emissão (CECarbon/GHG/Ecoinvent/EPD), grandes e read-mostly. Separar evita misturar dados de cliente com base de referência e permite políticas/escala distintas. Acesso via **service_role, só no servidor** (`lib/server/supabase.ts`) — nunca expor ao cliente. |
| **Auth / tenant** | **Clerk com Organizations** | Cada **Organization do Clerk = um tenant (`company_id`)**. Não reinventamos auth/SSO/convites. O `clerk_org_id`/`clerk_user_id` é gravado em `public.users`; toda tabela transacional carrega `company_id` e o isolamento é reforçado no app layer (ver `docs/SECURITY.md`). |
| **Deploy** | **Vercel** | Deploy automático do GitHub, edge/CDN e env vars por ambiente. As **flags da stack de precisão vivem no env do Vercel** — ver [como verificar](#como-saber-se-a-stack-de-precisão-está-ligada). |
| **Match determinístico** | **keyword + fuzzy (`fuzzball`)** | Rápido, barato, auditável e **sem segredos** — é o piso que sempre roda. Dicionários PT→EN e guardas de unidade/escala em `lib/server/emission-mapper.ts`. |
| **Embeddings (RAG)** | **Voyage `voyage-3.5` (1024d)** | A Anthropic não tem API de embeddings; Voyage é a recomendação oficial. Usada só para **recall semântico** (pgvector), **opt-in**. |
| **Reranker / agente** | **Claude (Opus 4.8)** p/ rerank; **Gemini via n8n** p/ chat | O reranker usa Claude por raciocinar bem sobre material + unidade e por saída estruturada (`json_schema`). O chat do agente (n8n + Gemini) é um fluxo separado, legado do piloto. **Default da stack de precisão: tudo Claude/Voyage desligado** — liga por flag. |
| **Testes** | **Vitest** (módulos puros de `lib/server/`) | Sem DOM/JSX no escopo; foco no que quebra silenciosamente (cálculo, conversão, match). 154 testes, rodam **sem segredos** (catálogos mockados). Ver [Testes](#testes). |

### Princípios que valem mais que a lista

- **Determinístico primeiro; LLM/RAG só enriquecem.** O pipeline correto roda sem
  Voyage/Claude. As camadas de IA são **opt-in por flag** e **falham para o
  determinístico** (nunca quebram o cálculo). Aprendizado caro: ver
  ["vetor enriquece, não resgata"](#o-pipeline-de-match-de-fatores-o-coração-do-produto).
- **Flag + chave, sempre.** Uma feature de IA só está ativa se a flag **e** a chave
  estiverem presentes (`isVectorSearchEnabled = flag && VOYAGE_API_KEY`). Flag sem
  chave = silenciosamente desligado.
- **Valores de produto são revisáveis e nomeados.** Constantes físicas (densidade,
  massa/m², amortização) ficam no topo do arquivo, marcadas "revisar" — nunca
  espalhadas como números mágicos. Ver `lib/server/coverage-rules.ts`.
- **Tenant em tudo.** `company_id` em toda query transacional; isolamento reforçado
  no app layer, não só por RLS.

---

## Estrutura do repositório

```
app/
  api/              # Route handlers (projects, scenarios, emission-factors, factor-rules, webhooks, debug…)
  dashboard/        # Visão geral do portfólio
  projects/[id]/    # Páginas por projeto: overview, items, scenarios
  onboarding/       # Criação de empresa nova (Clerk Organization)
  settings/         # Configurações da empresa
components/
  ui/               # Botão, card, badge, kpi-card (shadcn-style)
  charts/           # Pareto, comparação de cenários, donut de escopos
  items/            # Tela de itens (mapping, parametrização, editor de fator)
  agent/            # Chat do agente IA (n8n + Gemini)
  layout/           # Sidebar e seletor de projetos
lib/
  api/              # Client HTTP por domínio (sempre via lib/api/client.ts)
  server/           # auth, calculator, parser, emission-mapper, coverage-rules, keyword
    factor-search/  # embeddings (Voyage), vector-search (pgvector), claude-reranker
    agent/          # gemini-client, action-applier
supabase/           # migrations versionadas + seeds + migrações da stack de precisão
tests/              # Vitest — módulos puros de lib/server + fixtures de paridade
docs/               # PRD, SPEC, IMPL, DESIGN_SYSTEM, PARIDADE_*, SECURITY, DEPLOY
```

---

## O pipeline de match de fatores (o coração do produto)

Mapear `item da Curva ABC → fator de emissão` é onde está a maior parte da lógica
não-óbvia. Roda em camadas, em [lib/server/emission-mapper.ts](lib/server/emission-mapper.ts)
e [lib/server/factor-search/](lib/server/factor-search/):

1. **Factor Rules** (sempre ativo) — cache curado **por empresa**, prioridade 0,
   determinístico. Itens recorrentes são fixados como regra (UI "Salvar como
   regra") e nunca mais dependem de heurística. Keyword normalizada por
   `lib/server/keyword.ts` (a MESMA função no salvar e no match — divergir aqui
   já causou bug de regra que nunca casava).
2. **Determinístico** (sempre ativo) — keyword + fuzzy sobre **GHG Protocol →
   CECarbon → Ecoinvent**, com guardas: insensível a acento, normalização de
   unidade, penalidade/rejeição por incompatibilidade de unidade, filtro de fator
   por-peça absurdo (`>100/un`), descarte de entradas `*deprecated`.
3. **RAG / pgvector** (opt-in: `FACTOR_VECTOR_SEARCH_ENABLED` + `VOYAGE_API_KEY`) —
   recall semântico via embeddings. **O vetor ENRIQUECE, não RESGATA:** só entra no
   pool se o determinístico já achou algum candidato. Sem essa guarda, itens de
   serviço/mão-de-obra (ANDAIME, PINTURA) casavam por similaridade um fator absurdo
   e, multiplicados por quantidades enormes, inflavam o total em centenas de t.
4. **Reranker (Claude)** (opt-in: `FACTOR_RERANKER_ENABLED` + `ANTHROPIC_API_KEY`) —
   escolhe/valida o melhor candidato e checa unidade; guarda determinística extra
   para fixadores (parafuso/parabolt → tem de ser metal). Qualquer falha →
   mantém o determinístico.

**Regras de negócio importantes:**
- **EPDs NÃO entram no auto-match.** São específicas de fornecedor e só entram por
  **substituição explícita** do analista (editor de fator) ou via Factor Rule curada.
- **Conversão de unidade** sempre via `getConversionFactor` / `resolveConversion`
  (`lib/server/calculator.ts`). Para itens cuja unidade não converte direto (concreto
  de piso em m², pontalete em m), há **receitas geométricas/densidade**
  (`lib/server/coverage-rules.ts`) que derivam massa/volume — a partir da própria
  descrição (espessura "15CM", seção "7,5x7,5") quando possível.

Metodologia, validação de paridade com o simulador antigo e o diagnóstico das
divergências: [docs/PARIDADE_SIMULADOR.md](docs/PARIDADE_SIMULADOR.md). Passo a
passo de ativação (migrações + backfill + flags): [docs/PARIDADE_RUNBOOK.md](docs/PARIDADE_RUNBOOK.md).
Plano de continuação e decisões: [docs/PLANO_CONTINUACAO.md](docs/PLANO_CONTINUACAO.md).

---

## Setup local

Pré-requisitos: **Node.js 20+** e acesso ao projeto Supabase.

```bash
git clone https://github.com/jbpalermoznit/ZNIT-SIMULADOR-CARBONO.git
cd ZNIT-SIMULADOR-CARBONO
cp .env.local.example .env.local   # preencha (ver tabela abaixo) — é gitignored
npm install
npm run dev                         # http://localhost:3000
```

### Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `SUPABASE_URL` | sim | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | sim | Service role key (**server-only**, nunca no cliente) |
| `NEXT_PUBLIC_SUPABASE_URL` | sim | Mesma URL, exposta ao cliente |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | sim | Publishable key do Clerk |
| `CLERK_SECRET_KEY` | sim | Secret key do Clerk |
| `CLERK_WEBHOOK_SECRET` | sim | Signing secret do webhook (sync Supabase ↔ Clerk) |
| `FACTOR_VECTOR_SEARCH_ENABLED` | opcional | Liga o RAG/pgvector. Default `false`. **Só vale com `VOYAGE_API_KEY`.** |
| `VOYAGE_API_KEY` | se RAG on | Voyage AI (embeddings `voyage-3.5`) |
| `FACTOR_EMBEDDINGS_MODEL` | opcional | Default `voyage-3.5` |
| `FACTOR_RERANKER_ENABLED` | opcional | Liga o reranker Claude. Default `false`. **Só vale com `ANTHROPIC_API_KEY`.** |
| `ANTHROPIC_API_KEY` | se reranker on | Anthropic (reranker) |
| `FACTOR_RERANKER_MODEL` | opcional | Default `claude-opus-4-8` |
| `N8N_WEBHOOK_URL` | opcional | Endpoint do agente IA (Gemini via n8n) |
| `POWERBI_API_KEY` | opcional | Export ao Power BI |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | opcional | Captura de erros (server/client) |

> ⚠️ **No Vercel:** replique as variáveis nas Environment Variables do projeto e
> **faça redeploy** — env novo não vale para deployments existentes. Ligar `*_ENABLED`
> sem a chave correspondente deixa a feature silenciosamente desligada.

### Comandos

```bash
npm run dev        # dev server (Turbopack)
npm run build      # build de produção
npm start          # serve o build
npm run lint       # eslint
npm test           # vitest (154 testes)
npm run test:watch # vitest em watch
npx tsc --noEmit   # type check
```

---

## Banco de dados

- **Schema `public`** — dados da app: `companies`, `users`, `projects`, `abc_curves`,
  `abc_items`, `scenarios`, `scenario_items`, `scenario_results`, `item_mappings`,
  `factor_rules`. Schema base em [supabase/migration.sql](supabase/migration.sql),
  incrementos versionados (`migration-v2.sql` … `migration-v8-…`), exemplo em
  [supabase/seed.sql](supabase/seed.sql).
- **Schema `backend`** — catálogos de fator (`produtos_cecarbon_dev`, `fatores_ghg_dev`,
  `ecoinvent_dev`, `epd_dev`, `factor_embeddings`). Populado por importação manual,
  fora deste repo.
- **Multi-tenant:** `company_id` em toda tabela transacional → `public.companies`,
  e cada `company_id` ↔ uma Organization do Clerk.

**Migrações da stack de precisão** (opt-in, aplicar no SQL Editor do Supabase):
[fix-factor-scale.sql](supabase/fix-factor-scale.sql) (corrige fatores com escala
errada), [migration-pgvector-factor-embeddings.sql](supabase/migration-pgvector-factor-embeddings.sql)
(tabela de embeddings + função de busca por cosseno) — populada por
[scripts/backfill-factor-embeddings.mjs](scripts/backfill-factor-embeddings.mjs).
Seed opcional de Factor Rules recorrentes: [seed-factor-rules.sql](supabase/seed-factor-rules.sql).

---

## Testes

[Vitest](https://vitest.dev) cobrindo os módulos puros de `lib/server/` (cálculo,
conversão, classificador, matcher, reranker, receitas de cobertura, factor rules) e
um **harness de paridade** (`tests/lib/server/parity.test.ts` + `tests/fixtures/parity/`)
que trava o comportamento de match e o total do cenário contra um catálogo curado —
**sem segredos**, roda em CI.

```bash
npm test        # 154 testes
```

Os catálogos do Supabase são mockados espelhando o `ilike` real; reranker/vetor ficam
off nos testes → determinístico. Tests que precisam de DB/IA real devem sobrescrever
o env (ver `tests/setup.ts`).

---

## Como saber se a stack de precisão está ligada

A flag no painel do Vercel não basta (precisa da chave + redeploy). Endpoint de
verdade de runtime (admin-only):

```
GET /api/debug/precision-status
```

Retorna `enabled_flag`, `*_key_present` e **`effective`** para vector-search e
reranker. `effective` é exatamente o que o `autoMatchItem` consulta — se `true` para
ambos, a stack está ligada **neste deployment**.

---

## Status do lançamento

**Pronto:** Auth com Clerk + Organizations (multi-tenant) · onboarding · middleware
protegendo as rotas · sync Supabase ↔ Clerk via webhook · cross-tenant isolation no
app layer ([docs/SECURITY.md](docs/SECURITY.md)) · security headers + Sentry · stack
de precisão (Fase 0/1/2) aplicada e validada · guia de deploy ([docs/DEPLOY.md](docs/DEPLOY.md)).

**Falta antes do go-live:** instância de produção do Clerk (`pk_live_…`) · webhook
em URL pública · PITR/backups no Supabase Pro · DNS custom (`app.znit.ai`) ·
rate limiting (login/upload) · testes E2E do fluxo crítico · termos/LGPD ·
PowerBI API key escopada por empresa.

---

## Contribuindo

Convenções completas em [CLAUDE.md](CLAUDE.md). Resumo:
- Branches `feat/`, `fix/`, `docs/`; conventional commits.
- **Toda commit** assinada como `jbpalermoznit <jbpalermo@znit.ai>`:
  ```bash
  git -c user.name="jbpalermoznit" -c user.email="jbpalermo@znit.ai" commit -m "feat: ..."
  ```
- Antes de abrir PR: `npm test` verde, `npm run lint` e `npx tsc --noEmit` limpos.
- Texto de usuário em **PT-BR**. UI usa os tokens de `docs/specs/DESIGN_SYSTEM.md`.

## Licença

Privado — uso restrito ao Grupo HTB durante o piloto.
