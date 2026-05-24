# Plano de Lançamento — ZNIT Simulador de Carbono

Status atual: app funcional em dev local + ngrok, cobertura ~83% no projeto piloto (Raízen VRO R8), 22 commits prontos para produção na branch `feat/launch-prep`.

Este plano divide o que falta em três níveis: bloqueadores absolutos (sem isso o cliente não acessa), itens importantes (cobrança nos primeiros dias) e polimento.

---

## 🚨 Bloqueadores absolutos

### 1. Deploy efetivo no Vercel
**Por quê:** hoje o app só roda em `localhost:3000` exposto via ngrok efêmero. Cliente precisa de URL HTTPS estável.

**Passos:**
1. `vercel login` (interativo, autentica via GitHub)
2. Da raiz do repo: `vercel --prod` na primeira vez para criar o projeto + linkar
3. Adicionar todas as env vars listadas em [`docs/DEPLOY.md`](DEPLOY.md#42-vercel-env-vars) no dashboard Vercel (production scope)
4. Confirmar build limpo (`npm run build` local primeiro para detectar problemas)
5. Verificar `/api/health` responde 200 na URL `*.vercel.app`

**Owner:** João Palermo (precisa da conta GitHub)

---

### 2. Clerk em modo Production
**Por quê:** as keys atuais (`pk_test_*`, `sk_test_*`) têm limite ~100 usuários, mostram banner "Development", sem SLA.

**Passos:**
1. Dashboard Clerk → criar/promover ambiente **Production**
2. Configurar os mesmos auth methods (Email + Google)
3. Habilitar Organizations + roles `org:admin` / `org:member`
4. Copiar:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (começa com `pk_live_…`)
   - `CLERK_SECRET_KEY` (começa com `sk_live_…`)
5. Atualizar essas variáveis no Vercel (production scope)
6. Redeploy

**Owner:** João Palermo

---

### 3. Webhook Clerk em URL pública estável
**Por quê:** o webhook hoje aponta para `https://substance-simmering-sediment.ngrok-free.dev/api/webhooks/clerk` que morre quando o terminal local fecha. Sem webhook, novo usuário não é provisionado em `public.users` e cai em loop de "Usuário não encontrado".

**Passos:**
1. Após item 1, capturar URL Vercel definitiva (ex: `https://znit-simulador.vercel.app`)
2. No Clerk Production dashboard → Webhooks → editar endpoint para `https://<url-vercel>/api/webhooks/clerk`
3. Selecionar eventos: `user.created`, `user.updated`, `user.deleted`, `organization.created`, `organization.updated`, `organization.deleted`, `organizationMembership.created`, `organizationMembership.updated`, `organizationMembership.deleted`
4. Copiar **Signing Secret** novo (whsec_…) para `CLERK_WEBHOOK_SECRET` no Vercel
5. Disparar evento de teste pelo dashboard Clerk e confirmar `200` nos logs do Vercel

**Owner:** João Palermo

---

### 4. Domínio próprio com SSL
**Por quê:** `*.vercel.app` é OK para piloto interno mas não passa em compliance de cliente corporativo (Raízen, HTB etc.)

**Passos:**
1. Escolher subdomínio sob `znit.ai` (sugestão: `simulador.znit.ai` ou `carbono.znit.ai`)
2. Vercel → Project → Settings → Domains → adicionar o subdomínio
3. No registrar de `znit.ai`, criar registro DNS: `CNAME simulador → cname.vercel-dns.com`
4. Aguardar ~1 min — SSL provisionado automaticamente
5. **Atualizar Clerk** Production → Frontend URL para o novo domínio
6. **Atualizar webhook Clerk** para `https://simulador.znit.ai/api/webhooks/clerk`

**Owner:** João Palermo + admin DNS znit.ai

---

### 5. Backup Supabase com PITR
**Por quê:** Free tier só faz snapshot diário (7 dias retention) sem point-in-time recovery. Para cliente real, se uma migration ou bug zerar dados, não dá pra recuperar o último minuto antes do incidente.

**Passos:**
1. Supabase dashboard → Project Settings → Billing → upgrade para **Pro** (~$25/mês)
2. Project Settings → Database → Backups → habilitar **Point in time recovery**
3. Definir window: mínimo 7 dias
4. Documentar a senha do dashboard em gerenciador de senhas corporativo
5. Drill anual de restore (escrever em CLAUDE.md/CONTRIBUTING.md)

**Owner:** João Palermo (precisa cartão de crédito)

---

### 6. Limpar dados de demo do banco de produção
**Por quê:** `supabase/seed.sql` injeta `user-joao`, `company-htb`, `proj-znit-demo` que são artefatos de desenvolvimento. Não devem existir em produção.

**Passos:**
1. **Não rodar `seed.sql` no banco de produção em nenhum momento.**
2. Rodar `supabase/migration-v6-drop-legacy-seed.sql` (criada neste pacote) que:
   - Deleta as rows `user-joao`, `proj-znit-demo`, `company-htb` se existirem
   - Remove a coluna `hashed_password` da tabela `users` (Clerk é a única fonte de auth agora)
3. Verificar via `SELECT id, email FROM public.users` — só usuários reais via Clerk webhook

**Owner:** Claude executou — checklist em [supabase/migration-v6-drop-legacy-seed.sql](../supabase/migration-v6-drop-legacy-seed.sql)

---

### 7. Remover mockup `app/platform/`
**Por quê:** página estática institucional da plataforma ZNIT exposta sem auth — não faz parte do simulador de carbono e confunde quem chega.

**Passos concluídos por Claude:**
- `app/platform/` removido
- Sem refs no resto do código

---

## ⚠️ Importantes (cliente vai cobrar nas primeiras semanas)

### 8. Rate limiting nas APIs sensíveis
- `/api/projects/*/upload-abc` e `/api/projects/*/upload-scenario` aceitam arquivos grandes; protect contra abuse com Vercel `maxDuration` + middleware Upstash Redis ou similar.
- Login é coberto pelo Clerk.

### 9. Termos de Uso + Política de Privacidade + LGPD
- Páginas `/termos` e `/privacidade` com texto mínimo aprovado pelo jurídico
- Checkbox "Aceito os termos" no signup (Clerk permite custom field)
- Link no footer
- Inventário de dados pessoais coletados (email, nome) + período de retenção para LGPD

### 10. Decidir política de auto-exclusão dos subcontratos 45xx
A regra atual exclui automaticamente todo cost code que começa com 45xx como "Serviço". Mas no Raízen R8, **67% do orçamento (R$ 68M de R$ 102M)** caiu nessa categoria — incluindo turn-key com material embutido (Estaca Hélice R$ 5.6M, Estrutura Pré-Moldada R$ 4M, Estrutura Metálica R$ 3.1M, Esquadrias AL R$ 1.6M, etc.). O número 15.001 tCO₂e está subestimado em provavelmente ~3.600 tCO₂e.

**Caminhos:**
- (A) Sub-classificar 45xx por sub-família: `4501/4505` (estrutura, infra) vão para `pending` manual; `4503` (M.O. avulsa) auto-exclui
- (B) Banner explícito na Visão Geral: "67% do orçamento auto-excluído — revise os subcontratos"

### 11. Aplicar migrations v3/v4/v5/v6 no Supabase de produção
- `migration.sql` (idempotente)
- `migration-v2.sql`
- `migration-v3-clerk.sql` — `clerk_user_id`, `clerk_org_id`
- `migration-v4-email-per-org.sql` — email scoped per org
- `migration-v5-coverage-enrichment.sql` — `canonical_description`, `assemblies`, `inferred_type`
- `migration-v6-drop-legacy-seed.sql` — drop demo rows + `hashed_password`

### 12. Remover ou proteger endpoints de debug
- `/api/debug/match-curve/[curveId]` e `/api/debug/match-item/[itemId]` estão atrás do middleware Clerk mas qualquer usuário autenticado pode chamar. Restringir por role `admin` ou remover antes do go-live.

### 13. Reativar warnings de lint
- Vários `setState in useEffect` pré-existentes — fixar ou suprimir cirurgicamente em vez de ignorar batchwise.

---

## 💅 Polimento (pode ir ao ar sem)

### 14. Export PDF do memorando de cálculo com Auditoria da IA
Cliente vai querer levar o PDF pra auditor externo. O memorando deve listar: cada item, fator usado, fonte, justificativa quando excluído.

### 15. Onboarding in-app
Usuário novo entra, vê tela vazia, não sabe o próximo passo. Tutorial overlay ou empty state com CTA "Importe sua primeira Curva ABC".

### 16. Testes E2E críticos
Playwright cobrindo: signup → criar org → importar ABC → ver cenário → editar fator → exportar.

### 17. Logs estruturados (server-side)
Hoje é `console.log` cru. Sentry pega erros mas não eventos. Considerar [pino](https://github.com/pinojs/pino) ou logs nativos do Vercel.

### 18. Branding consistente
Logo, cores, favicon — já está OK mas vale revisão final antes do cliente bater na URL pela primeira vez.

---

## Ordem prática de execução

| Quando | Bloco | Tempo estimado |
|---|---|---|
| **Hoje** | 1 (Vercel) + 2 (Clerk prod) + 3 (Webhook) | 2h |
| **Amanhã** | 4 (Domínio) + 5 (Supabase Pro) | 1h + 24h espera DNS |
| **Esta semana** | 6 (Limpeza demo) + 7 (Remover mockup) — já feito por Claude | — |
| **Próxima semana** | 8 (Rate limit) + 9 (Termos/LGPD) + 10 (Política 45xx) | 6h |
| **Antes de cobrar** | 11 (Migrations prod) + 12 (Proteger debug) | 1h |
| **Pós go-live** | 14 (PDF) + 15 (Onboarding) + 16 (Testes) + outros | contínuo |

---

## Decisões pendentes do produto

1. **Subdomínio definitivo**: `simulador.znit.ai`, `carbono.znit.ai`, ou outro?
2. **Política de subcontratos 45xx**: caminho A ou B do item 10?
3. **Quem assina termos por uma Organization**: só admin? membros também?
4. **Política de retenção de dados**: quanto tempo guardar projetos arquivados? LGPD pede limite explícito.
