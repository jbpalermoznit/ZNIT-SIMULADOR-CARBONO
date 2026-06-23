# ZNIT ESG — Carbon Calculator

Plataforma SaaS para calcular pegada de carbono de projetos de construção civil. Recebe a Curva ABC exportada do iTwo, mapeia fatores de emissão (EPDs) por item, calcula emissões nos Scopes 1/2/3 e gera cenários comparativos para value engineering sustentável.

**Status:** Piloto — Grupo HTB (Raízen VRO R8). Em preparação para lançamento aberto.

## Stack

- **Frontend + API:** Next.js 16 (App Router) + TypeScript + Tailwind CSS
- **Banco:** Supabase Postgres (schema `public` para dados da app, `backend` para fatores de emissão)
- **Auth:** Clerk (em integração — substitui o JWT caseiro atual)
- **Deploy:** Vercel

## Estrutura

```
app/
  api/              # Route handlers (auth, projects, scenarios, emission-factors, …)
  dashboard/        # Visão geral do portfólio
  projects/         # Lista e páginas de cada projeto (overview, items, scenarios, …)
  platform/         # Mockup da plataforma ESG ampla (não-piloto)
  settings/         # Configurações da empresa
components/
  ui/               # Botão, card, badge, kpi-card (shadcn-style)
  charts/           # Pareto, comparação de cenários, donut de escopos
  items/            # Componentes da tela de itens (mapping, parametrização)
  agent/            # Chat do agente IA (n8n + Gemini)
  layout/           # Sidebar e seletor de projetos
lib/
  api/              # Client HTTP por domínio (projects, scenarios, emission-factors, …)
  server/           # Auth, calculator, parser, emission-mapper, agente
  mock/             # Dados de demo
  report/           # Geração de PDF do memorando
supabase/
  migration.sql     # Schema base (companies, users, projects, abc_items, scenarios, …)
  migration-v2.sql  # Alterações incrementais
  seed.sql          # Dados iniciais para desenvolvimento
docs/specs/
  PRD.md            # Product Requirements
  SPEC.md           # Especificação técnica (data models, APIs, regras)
  IMPL.md           # Guia de implementação
  DESIGN_SYSTEM.md  # Tokens, componentes, layout
  EPD_DATA_REQUIREMENTS.md
```

## Setup local

Pré-requisitos: Node.js 20+ e acesso ao projeto Supabase.

```bash
git clone https://github.com/jbpalermoznit/ZNIT-SIMULADOR-CARBONO.git
cd ZNIT-SIMULADOR-CARBONO
cp .env.local.example .env.local
# preencher SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET (temporário até Clerk), e as keys do Clerk
npm install
npm run dev
```

Abre em http://localhost:3000.

### Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `SUPABASE_URL` | sim | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | sim | Service role key (server-only) |
| `NEXT_PUBLIC_SUPABASE_URL` | sim | Mesma URL acima, exposta ao cliente |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | sim (em breve) | Publishable key do Clerk |
| `CLERK_SECRET_KEY` | sim (em breve) | Secret key do Clerk |
| `CLERK_WEBHOOK_SECRET` | sim (em breve) | Signing secret do webhook do Clerk |
| `JWT_SECRET` | (legado) | Será removido após migração pra Clerk |
| `N8N_WEBHOOK_URL` | opcional | Endpoint do agente IA (Gemini via n8n) |
| `POWERBI_API_KEY` | opcional | Chave para o endpoint de export ao Power BI |
| `SENTRY_DSN` | opcional | Em breve — captura de erros server-side |
| `NEXT_PUBLIC_SENTRY_DSN` | opcional | Em breve — captura de erros client-side |
| `FACTOR_VECTOR_SEARCH_ENABLED` | opcional | Liga a busca semântica de fatores (RAG/pgvector). Default `false` |
| `VOYAGE_API_KEY` | se RAG on | Chave da Voyage AI (embeddings `voyage-3.5`, 1024d) |
| `FACTOR_EMBEDDINGS_MODEL` | opcional | Modelo de embeddings. Default `voyage-3.5` |
| `FACTOR_RERANKER_ENABLED` | opcional | Liga o reranker LLM que valida/escolhe o fator. Default `false` |
| `ANTHROPIC_API_KEY` | se reranker on | Chave da Anthropic para o reranker |
| `FACTOR_RERANKER_MODEL` | opcional | Modelo do reranker. Default `claude-opus-4-8` |

## Comandos

```bash
npm run dev      # dev server (Turbopack)
npm run build    # build de produção
npm start        # serve o build
npm run lint     # eslint
npx tsc --noEmit # type check
```

## Banco de dados

Schema principal em [supabase/migration.sql](supabase/migration.sql), incrementos versionados (`migration-v2.sql` … `migration-v8-unit-cost-override.sql`) e dados de exemplo em [supabase/seed.sql](supabase/seed.sql). Os fatores de emissão (EPDs, GHG Protocol, Ecoinvent) ficam em um schema separado `backend`, populado via importação manual — fora deste repo por enquanto.

Para o match de alta precisão (ver abaixo), há duas migrações opcionais: [supabase/fix-factor-scale.sql](supabase/fix-factor-scale.sql) (corrige fatores com escala errada) e [supabase/migration-pgvector-factor-embeddings.sql](supabase/migration-pgvector-factor-embeddings.sql) (tabela de embeddings + função de busca por cosseno). Populadas pelo script [scripts/backfill-factor-embeddings.mjs](scripts/backfill-factor-embeddings.mjs).

Multi-tenant: toda tabela transacional tem `company_id` que liga em `public.companies`. Após o lançamento do Clerk, cada `company_id` corresponde a uma Organization no Clerk, e o `clerk_user_id` é gravado em `public.users`.

## Fluxo do produto

1. Usuário se cadastra (signup via Clerk) → cria Organization (empresa)
2. Cria projeto (nome, cliente, área, tipo)
3. Faz upload da Curva ABC (XLSX/XLSM do iTwo)
4. Sistema parseia, normaliza unidades e classifica itens em P1/P2/P3 (Pareto)
5. Mapeamento automático de fatores: EPD → GHG Protocol → Ecoinvent
6. Analista revisa itens com baixa confiança e parametriza manualmente
7. Sistema calcula emissões por item, escopo e total
8. Analista cria cenários alternativos (substituições de materiais)
9. Comparação de cenários (tCO₂e e tCO₂e/m²)
10. Exporta memorando em PDF e dados pro Power BI

Detalhes do escopo, regras de cálculo e contratos de API: [docs/specs/PRD.md](docs/specs/PRD.md), [docs/specs/SPEC.md](docs/specs/SPEC.md), [docs/specs/IMPL.md](docs/specs/IMPL.md).

## Match de fatores de alta precisão

O mapeamento item → fator de emissão (passo 5 acima) roda em camadas, todas em
[lib/server/emission-mapper.ts](lib/server/emission-mapper.ts) e
[lib/server/factor-search/](lib/server/factor-search/):

1. **Factor Rules** — cache curado por empresa (sempre ativo, determinístico).
2. **Determinístico** — keyword + fuzzy com guardas de unidade/escala/BR.
3. **RAG (pgvector)** — recall semântico via embeddings Voyage. *Opt-in:* `FACTOR_VECTOR_SEARCH_ENABLED=true` + `VOYAGE_API_KEY`.
4. **Reranker (Claude)** — escolhe/valida o melhor candidato (checa unidade). *Opt-in:* `FACTOR_RERANKER_ENABLED=true` + `ANTHROPIC_API_KEY`. Falha → mantém o determinístico.

As camadas 3 e 4 são **desligadas por padrão** — o pipeline determinístico segue
intacto sem elas. Metodologia, validação de paridade com o simulador antigo e
diagnóstico das divergências: [docs/PARIDADE_SIMULADOR.md](docs/PARIDADE_SIMULADOR.md).
Passo a passo de ativação (migrações + backfill + flags):
[docs/PARIDADE_RUNBOOK.md](docs/PARIDADE_RUNBOOK.md).

## Status do lançamento

**Pronto:**
- [x] Auth com Clerk + Organizations (multi-tenant)
- [x] Onboarding de empresa nova (`/onboarding`)
- [x] Middleware protege todas as rotas exceto sign-in/sign-up/webhooks/PowerBI
- [x] Sync Supabase ↔ Clerk via webhook em [/api/webhooks/clerk](app/api/webhooks/clerk/route.ts)
- [x] Cross-tenant isolation no app layer (ver [docs/SECURITY.md](docs/SECURITY.md))
- [x] Páginas de erro/404/loading padronizadas
- [x] Security headers (CSP, HSTS, X-Frame-Options, …) em [next.config.ts](next.config.ts)
- [x] Sentry SDK integrado (opt-in via DSN)
- [x] Guia de deploy completo em [docs/DEPLOY.md](docs/DEPLOY.md)

**Falta antes do go-live em produção:**
- [ ] Aplicar `supabase/migration-v3-clerk.sql` no banco de produção
- [ ] Criar instância de produção do Clerk (`pk_live_…`, `sk_live_…`)
- [ ] Configurar webhook no Clerk (URL pública após deploy)
- [ ] Habilitar PITR (backups) no Supabase Pro
- [ ] Deploy no Vercel + DNS custom (`app.znit.ai`)
- [ ] Rate limiting nas APIs sensíveis (login, upload)
- [ ] Testes E2E do fluxo crítico (login → upload → cenário)
- [ ] Termos de uso, política de privacidade, LGPD
- [ ] Validação rigorosa de uploads (tamanho/tipo)
- [ ] PowerBI API key escopada por empresa (hoje é compartilhada)

## Contribuindo

Convenções do projeto em [CLAUDE.md](CLAUDE.md). Resumindo:
- Branches `feat/`, `fix/`, `docs/`
- Conventional commits
- Todas as commits devem ser assinadas como `jbpalermoznit <jbpalermo@znit.ai>`:
  ```bash
  git -c user.name="jbpalermoznit" -c user.email="jbpalermo@znit.ai" commit -m "feat: ..."
  ```

## Licença

Privado — uso restrito ao Grupo HTB durante o piloto.
