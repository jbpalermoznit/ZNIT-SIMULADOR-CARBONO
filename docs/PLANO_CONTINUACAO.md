# Plano de Continuação — Simulador de Carbono (paridade + precisão)

Branch: `claude/wizardly-mccarthy-d5ykc3` · PR **#17**
Continue no **VS Code local** (lá Supabase e Voyage são alcançáveis; na sessão web
o egress é restrito a `api.anthropic.com`).

---

## 1. Onde estamos

**Objetivo:** fazer o simulador novo bater com o antigo e, além disso, elevar a
precisão do match de fator.

**3 ondas já commitadas (no PR #17):**
1. `fix-acento` — match insensível a acento + `CA-50/60/65` + combustível→diesel + UI (fator/fonte, agregação 3×, decimais).
2. `2ª onda` — unidade Ecoinvent (denominador real), concreto via CECarbon BR, serviços (acabamento/fabricação) como Tipo F.
3. `precisão` — Fase 0 (SQL de escala), Fase 1 (RAG pgvector + Voyage), Fase 2 (reranker Claude). **Tudo atrás de flag, off por padrão.**

**Resultados validados (offline + reranker ao vivo):**

| Cenário | Pré-fix | Determinístico | Reranker (ao vivo) | Antigo |
|---|---|---|---|---|
| Padrão | 697,8 | 1378 | 1502 | 1245,6 |
| Novo | 313,8 | 465,5 | **503,5** | **504,1** |

Problemas do Excel/anotações: **resolvidos** (aço, diesel/combustível, guarda-corpo
147→0,6, fator/fonte, 3×, decimais). Reranker corrigiu erros reais (ELETRODO de
bateria→aço; concreto por resistência) e cravou o cenário **Novo** (503,5 vs 504,1).

---

## 2. Estado das fases

| Fase | O quê | Status |
|---|---|---|
| 0 | `supabase/fix-factor-scale.sql` (óleos lubrif. 2758→2,758; alumínio 912→9,12; aço gerdau kg→t) | ✅ **aplicada** (verificado: id 6=2.758, 7=9.12, 119 unidade `t`) |
| 1 | `supabase/migration-pgvector-factor-embeddings.sql` | ✅ **aplicada** |
| 1 | backfill `scripts/backfill-factor-embeddings.mjs` (popula embeddings via Voyage) | ✅ **completo: 4491 embeddings**. Corrigido bug de paginação (PostgREST cap 1000 truncava o Ecoinvent em ~16%) |
| 1 | `FACTOR_VECTOR_SEARCH_ENABLED=true` | ⚠️ ligar **no Vercel** (env de runtime; local já está `true`) |
| 2 | reranker Claude (`FACTOR_RERANKER_ENABLED=true` + `ANTHROPIC_API_KEY`) | ✅ validado ao vivo — caso `PARABOLT`→`-1` (decisão #2). ⚠️ ligar a flag **no Vercel** |

> **Validação ao vivo (Fase 1+2):** recall semântico OK (concreto 40 MPa → CECarbon
> 274/m³; diesel → 2,64/L) e reranker rejeitando o `PARABOLT`→overflow. As **flags
> de runtime** (`FACTOR_VECTOR_SEARCH_ENABLED`, `FACTOR_RERANKER_ENABLED`) precisam
> estar setadas no **projeto do Vercel** — o `.env.local` só vale para rodar local.

---

## 3. Runbook no VS Code

### 3.1 Setup
```bash
git fetch origin && git checkout claude/wizardly-mccarthy-d5ykc3 && git pull
npm install
cp .env.local.example .env.local   # e preencha as chaves (NÃO commitar — é gitignored)
```
No `.env.local`, para a stack de precisão:
```
FACTOR_RERANKER_ENABLED=true
ANTHROPIC_API_KEY=sk-ant-...
FACTOR_RERANKER_MODEL=claude-opus-4-8
FACTOR_VECTOR_SEARCH_ENABLED=false   # só true DEPOIS do backfill
VOYAGE_API_KEY=pa-...
FACTOR_EMBEDDINGS_MODEL=voyage-3.5
```

### 3.2 Fase 0 — limpar a base (1x)
Aplique `supabase/fix-factor-scale.sql` no SQL Editor do Supabase (revise os
valores corrigidos antes — são hipótese de ÷100/÷1000/troca de unidade).

### 3.3 Fase 1 — popular embeddings (1x)
Migração já aplicada. Rode o backfill (precisa de Voyage + Supabase alcançáveis):
```bash
SUPABASE_URL='https://xyuqhpgjbrattreuvfzy.supabase.co' \
SUPABASE_SERVICE_ROLE_KEY='<service_role>' \
VOYAGE_API_KEY='<voyage>' \
node scripts/backfill-factor-embeddings.mjs
# deve imprimir upsert N/N
```
Depois: `FACTOR_VECTOR_SEARCH_ENABLED=true`.
> Se o upsert do `embedding` (vector) reclamar via PostgREST, formatar como
> string `'[...]'` no script; testar com poucas linhas primeiro.

### 3.4 Rodar / validar
```bash
npm test                 # 104 testes (inclui guardas do reranker)
npm run dev              # app: subir um cenário (Itens + Insumos) e conferir
```

---

## 4. Decisões em aberto (produto)

1. **Concreto/aço — correção × paridade.** ✅ **Decidido: (b) correção + Factor Rules.**
   Liga o reranker para a escolha mais correta (concreto 40MPa 274; reinforcing
   steel 2,21) e fixa os recorrentes como **Factor Rule** (prioridade 0 →
   determinístico, independente da não-determinância do reranker). O antigo tem
   erro conhecido no concreto (~218); priorizamos a correção.
   - **Bug corrigido no caminho:** a normalização do `match_keyword` (salvamento)
     divergia da normalização no match (runtime) — regras com hífen/pontuação
     (`ACO CA-50`) **nunca casavam**. Unificado em `lib/server/keyword.ts`
     (usado por `autoMatchItem`, `/api/factor-rules` e o `action-applier` do
     agente). Coberto por `tests/lib/server/factor-rules.test.ts`.
   - **Operacionalizar:** ligar o reranker (`FACTOR_RERANKER_ENABLED=true`) e
     aplicar `supabase/seed-factor-rules.sql` (revisar valores/company_id antes —
     é template para `company-htb`).

2. **Reranker — endurecer prompt.** ✅ *Feito em código.* O `SYSTEM_PROMPT` em
   `lib/server/factor-search/claude-reranker.ts` agora instrui explicitamente que
   compatibilidade de unidade NÃO basta e manda `-1` quando os únicos candidatos
   compatíveis forem equipamento/HVAC/não-fixadores. Além do prompt, há uma **guarda
   determinística pós-rerank**: para itens fixadores (parafuso/parabolt/chumbador/
   prego/porca/arruela/arame/grampo/rebite...), o fator escolhido tem de ser de metal,
   senão a escolha é rejeitada (mantém o determinístico). Pega o caso real
   `PARABOLT`→`room-connecting overflow` (un↔un passava na checagem de unidade).
   Coberto por testes offline; **ainda falta re-rodar o subconjunto-problema ao vivo**
   (`FACTOR_RERANKER_ENABLED=true` + `ANTHROPIC_API_KEY`) p/ confirmar end-to-end.

---

## 5. Cobertura ainda faltante (não é match, é dado/receita)

Mecanismo de **receitas geométricas/densidade** em `lib/server/coverage-rules.ts`
(`geometricRecipe`) + `resolveConversion` no calculator. Quando a unidade do item
não converte direto para a do fator (cross-family), a receita deriva massa/volume
e o item passa a contribuir em vez de zerar. Ligado em `calcItemEmission`,
`recalculateScenario` e na penalidade de unidade do matcher. Só dispara para
descrições reconhecidas (null caso contrário → zero impacto no resto).

- `CONCRETO PARA PISO ... 15CM` (m²) — ✅ **feito**: m²→m³ pela espessura **lida da
  descrição** (`15CM`). Sem palpite.
- `PONTALETE / SARRAFO` (m) — ✅ **feito**: m→kg pela **seção da descrição**
  (`7,5x7,5`) × densidade de madeira (`WOOD_DENSITY_KG_M3 = 600`, padrão de
  primeira-passada — revisar como a Fase 0).
- `TAMPA DE CANALETA EM FERRO FUNDIDO` (m²) — ✅ **feito**: m²→kg via
  `CAST_IRON_AREAL_MASS_KG_M2 = 85` (faixa real 50–120; **revisar**).
- `FORMA METALICA QUICKJET` (m²) — ✅ **feito**: m²→kg de aço **amortizado**
  (`STEEL_FORM_AREAL_MASS_KG_M2 = 40` ÷ `STEEL_FORM_REUSES = 50` = 0,8 kg/m²/uso;
  **revisar** ambos — são decisão de produto/contabilidade).

> Itens com **constante de produto** (`WOOD_DENSITY`, `CAST_IRON_AREAL_MASS`,
> `STEEL_FORM_*`) usam padrões de primeira-passada — ajuste com a ficha real,
> como a Fase 0. Concreto/madeira derivam o número da própria descrição
> (espessura/seção). Todos são nomeados e centralizados em `coverage-rules.ts`.

---

## 6. Validação de paridade (harness offline) ✅

Versionado como **teste vitest** em `tests/lib/server/parity.test.ts` (+ fixtures
em `tests/fixtures/parity/`), em vez de `scripts/parity-harness.mjs`: o
`autoMatchItem` é TS com alias `@/` e o vitest já resolve isso + tem a infra de
mock, então roda no `npm test`/CI **sem segredos**.

O que ele trava (regressão de **match**, não do total absoluto): roda o
`autoMatchItem` real offline contra um catálogo curado (`factors.json`) que
reproduz os fatores corretos **e as armadilhas documentadas** (air-compressor
794/un, Ecoinvent concreto 404/m³, CECarbon `*deprecated`). Os `search*` são
mockados espelhando o `ilike` real; reranker/vetorial ficam off → determinístico.
Cada item de `items.json` valida tier/fator escolhido e rejeição de armadilha
(`expected.json`).

**Total do cenário (§6) — ✅ adicionado.** Além do match, o harness agora trava o
**total absoluto do pipeline** (`scenario-total.json`): cada item tem fator
atribuído + quantidade, e o teste computa `qty × fator × resolveConversion`
(incluindo as receitas §5) e soma — espelhando `calcItemEmission`. Inclui os 4
itens de receita (concreto piso, pontalete, tampa FoFo, forma metálica) com uma
guarda explícita de que **contribuem > 0** (sem a conversão geométrica zerariam).
Âncora de regressão: trava emissão por item + total do cenário.

> **Por que não o total 1245,6/504,1 do antigo:** a base completa de fatores e as
> planilhas dos cenários reais não estão versionadas (e o antigo tem erros
> conhecidos). O harness ancora o total do pipeline **novo** contra um cenário
> curado — pega regressões em match, conversão e soma. Para bater o número
> literal do antigo, é preciso versionar os dados reais de produção (separado).

---

## 7. Segurança

⚠️ As chaves (Anthropic, Voyage, Supabase service_role) passaram pelo chat desta
sessão — **rotacione-as**. `.env.local` é gitignored (nunca commitar).

---

## 8. Sugestão de ordem

1. Aplicar Fase 0 SQL.
2. Rodar backfill (Fase 1) e ligar `FACTOR_VECTOR_SEARCH_ENABLED`.
3. Endurecer o prompt do reranker (decisão #2) e validar o subconjunto-problema.
4. Decidir política concreto/aço (decisão #1) + Factor Rules para recorrentes.
5. Atacar cobertura (seção 5) com RAG + regras de massa.
6. Versionar o harness de paridade (seção 6) para regressão contínua.
