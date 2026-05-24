#!/bin/bash
# ZNIT Simulador — first-time Vercel deploy helper.
#
# Walks through: CLI install → login → project link → env var hint → deploy.
# Subsequent deploys: just `vercel --prod` (or push to main via the GitHub
# integration once you've linked it in the Vercel dashboard).

set -e

cd "$(dirname "$0")/.."

if ! command -v vercel &> /dev/null; then
  echo "→ Vercel CLI não encontrado. Instalando globalmente…"
  npm install -g vercel
fi

if [ ! -f ".vercel/project.json" ]; then
  echo "→ Linkando este diretório a um projeto Vercel (escolha 'create new' na primeira vez):"
  vercel link
fi

echo ""
echo "→ Antes do deploy, confirme que as env vars abaixo estão definidas em"
echo "   https://vercel.com/<org>/<project>/settings/environment-variables"
echo "   (production scope, marcadas como 'Encrypted' onde indicado):"
echo ""
cat <<'EOF'
   SUPABASE_URL                              (não-secret)
   SUPABASE_SERVICE_ROLE_KEY                 (encrypted)
   NEXT_PUBLIC_SUPABASE_URL                  (não-secret)
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY         (não-secret; pk_live_…)
   CLERK_SECRET_KEY                          (encrypted; sk_live_…)
   NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
   NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
   NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
   NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/onboarding
   CLERK_WEBHOOK_SECRET                      (encrypted; whsec_…)
   POWERBI_API_KEY                           (encrypted)
   SENTRY_DSN                                (opcional)
   NEXT_PUBLIC_SENTRY_DSN                    (opcional)
EOF
echo ""
read -p "Env vars prontas? Apertar Enter para deployar pra production (Ctrl+C cancela)…"

echo ""
echo "→ Deploy production…"
vercel --prod
