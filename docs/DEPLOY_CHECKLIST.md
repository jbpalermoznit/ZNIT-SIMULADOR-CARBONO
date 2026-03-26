# ZNIT ESG — Deploy Checklist (Vercel + Supabase)

Migração concluída: FastAPI + SQLite + Render → Next.js API Routes + Supabase + Vercel.

Código pronto no branch `main` (commit `6791d3b`). Faltam apenas configurações de infraestrutura.

---

## 1. Supabase — Criar tabelas da aplicação

O Supabase já tem as tabelas de fatores de emissão (schema `backend`). Agora precisamos criar as tabelas da aplicação (schema `public`).

### 1.1 Executar migration

1. Acesse o **SQL Editor** do Supabase: https://supabase.com/dashboard/project/xyuqhpgjbrattreuvfzy/sql
2. Cole o conteúdo de [`supabase/migration.sql`](../supabase/migration.sql)
3. Execute — cria 11 tabelas + índices + RLS policies

### 1.2 Executar seed

1. No mesmo SQL Editor, cole o conteúdo de [`supabase/seed.sql`](../supabase/seed.sql)
2. **ANTES de executar**, gere o hash bcrypt da senha `demo1234`:
   ```bash
   node -e "console.log(require('bcryptjs').hashSync('demo1234', 10))"
   ```
3. Substitua o placeholder `$2b$10$LqR3x9VKo9N...` pelo hash gerado
4. Execute — cria empresa ZNIT + usuário demo + projeto demo

### 1.3 Copiar a Service Role Key

1. Vá em **Settings → API** no Supabase
2. Copie a `service_role` key (NÃO a `anon` key) — será usada na Vercel

---

## 2. Vercel — Deploy

### 2.1 Importar repositório

1. Acesse [vercel.com/new](https://vercel.com/new)
2. Importe o repositório **jbpalermoznit/znit-esg**
3. Framework: **Next.js** (detectado automaticamente)
4. Root directory: `.` (raiz)

### 2.2 Configurar Environment Variables

Na tela de deploy (ou Settings → Environment Variables), adicione:

| Variável | Valor |
|----------|-------|
| `SUPABASE_URL` | `https://xyuqhpgjbrattreuvfzy.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | (copiada do Supabase, passo 1.3) |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xyuqhpgjbrattreuvfzy.supabase.co` |
| `JWT_SECRET` | (gerar string aleatória: `openssl rand -hex 32`) |
| `JWT_EXPIRE_MINUTES` | `60` |
| `N8N_WEBHOOK_URL` | `https://orchestration.znit.ai/webhook/ocr-gemini` |
| `POWERBI_API_KEY` | `znit-htb-powerbi-2026` |

### 2.3 Deploy

- Clique **Deploy**
- Vercel faz `npm ci` + `next build` automaticamente
- Deploy automático em ~2 minutos

### 2.4 Verificar

- Acesse `https://znit-esg.vercel.app/api/health` — deve retornar `{"status":"ok","version":"1.0.0"}`
- Acesse `https://znit-esg.vercel.app/login` — tela de login
- Login: `joao@znit.io` / `demo1234`

---

## 3. Render — Desativar

1. Acesse o dashboard do Render
2. Pause ou delete o serviço `znit-esg` (não é mais necessário)
3. O Render vai continuar tentando build com Dockerfile que não existe mais

---

## 4. Domínio customizado (opcional)

Na Vercel → Settings → Domains:
- Adicione `esg.znit.ai` (ou outro subdomínio)
- Configure DNS: CNAME → `cname.vercel-dns.com`

---

## Arquitetura após migração

```
Browser → Vercel (Next.js)
              ├── app/       → páginas React (SSR/client)
              ├── app/api/   → API routes (serverless functions)
              └── lib/server/ → serviços (auth, parser, calculator, mapper)
                    └── Supabase PostgreSQL
                          ├── public schema  → dados da app (projetos, cenários, itens)
                          └── backend schema → fatores de emissão (Ecoinvent, GHG, CECarbon, EPD)
```

## Arquivos relevantes

| Arquivo | Descrição |
|---------|-----------|
| `supabase/migration.sql` | SQL para criar as 11 tabelas |
| `supabase/seed.sql` | Dados iniciais (empresa, usuário, projeto) |
| `.env.local.example` | Template de variáveis de ambiente |
| `lib/server/supabase.ts` | Cliente Supabase (server-side) |
| `lib/server/auth.ts` | JWT + bcrypt |
| `lib/server/calculator.ts` | Cálculo de emissões e cenários |
| `lib/server/parser.ts` | Parser de planilha Excel (ABC) |
| `lib/server/emission-mapper.ts` | Auto-matching de fatores de emissão |
