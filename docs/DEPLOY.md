# Deploy & operations

This document covers everything you need to ship ZNIT ESG to production:
hosting on Vercel, configuring Clerk for production, applying database
migrations, enabling backups, and wiring up Sentry.

Run through these sections **in order** the first time you deploy. Each
ends with a verification step you can re-run later.

---

## 1. Supabase — production database

**Status check:** all migrations are in [`/supabase`](../supabase).

1. In the Supabase dashboard, open **SQL Editor** for the production
   project.
2. Run each migration in order:
   - `supabase/migration.sql` (skip if already applied)
   - `supabase/migration-v2.sql`
   - `supabase/migration-v3-clerk.sql` — adds `clerk_user_id`,
     `clerk_org_id`, drops `NOT NULL` from `hashed_password`
3. **Do not** run `seed.sql` in production — it inserts demo rows
   (`company-htb`, `user-joao`, `proj-znit-demo`) that don't belong in a
   live tenant database.

**Verify:**
```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users'
  AND column_name IN ('clerk_user_id', 'clerk_org_id');
-- Expect 2 rows
```

### Backups

Supabase Pro+ tier includes daily PITR (point-in-time recovery). Free tier
only has nightly snapshots (7-day retention) and no PITR.

For a paying customer launch:

1. Upgrade the project to **Pro** (or higher) at the Supabase dashboard →
   Project Settings → Billing.
2. Project Settings → Database → **Backups** → enable **Point in time
   recovery** (PITR). Minimum recommended window: 7 days.
3. Document who has the Supabase service_role key. Rotate quarterly.

Optional belt-and-suspenders: weekly `pg_dump` cron to S3 via a Vercel cron
or a GitHub Action. Document the restore drill annually.

---

## 2. Clerk — production instance

The keys in `.env.local` (`pk_test_…`, `sk_test_…`) are **development keys**
and won't work in production.

1. In the Clerk dashboard, open the application → **Production** environment.
2. Set the production frontend URL (`https://<your-vercel-domain>` or
   `https://app.znit.ai` once DNS is wired).
3. Configure the same auth methods as dev (Email + Google).
4. Enable **Organizations** and verify the role names match dev
   (`org:admin`, `org:member`).
5. Copy:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (starts with `pk_live_…`)
   - `CLERK_SECRET_KEY` (starts with `sk_live_…`)
6. **Webhook**:
   - URL: `https://<your-vercel-domain>/api/webhooks/clerk`
   - Events: `user.created`, `user.updated`, `user.deleted`,
     `organization.created`, `organization.updated`, `organization.deleted`,
     `organizationMembership.created`, `organizationMembership.updated`,
     `organizationMembership.deleted`
   - Copy the **Signing Secret** into `CLERK_WEBHOOK_SECRET`.

---

## 3. Sentry (optional, recommended)

1. Create a Next.js project at https://sentry.io.
2. Copy the DSN.
3. Set both env vars on Vercel:
   - `SENTRY_DSN` (server-side errors)
   - `NEXT_PUBLIC_SENTRY_DSN` (browser errors + replay)
4. Source maps: run `npx @sentry/wizard@latest -i nextjs` locally once;
   the wizard updates `next.config.ts` to upload source maps on each build
   and adds `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` to the env
   var list — copy those to Vercel too. Skip if you can read raw stack
   traces just fine.

---

## 4. Vercel — first deploy

### One-time setup

1. Sign in at https://vercel.com with the GitHub account that owns
   [`jbpalermoznit/ZNIT-SIMULADOR-CARBONO`](https://github.com/jbpalermoznit/ZNIT-SIMULADOR-CARBONO).
2. **Add New… → Project** → import the repo. Vercel auto-detects Next.js
   16, no overrides needed.
3. Before the first deploy, add every **Environment Variable** below.
   Mark each as **Production** (and **Preview** if you want previews to
   work). Use Vercel's "Encrypted" type for everything except the
   `NEXT_PUBLIC_*` vars.

   | Variable | Source |
   |---|---|
   | `SUPABASE_URL` | Supabase dashboard → Project Settings → API |
   | `SUPABASE_SERVICE_ROLE_KEY` | Same page, "service_role" key (secret) |
   | `NEXT_PUBLIC_SUPABASE_URL` | Same as SUPABASE_URL |
   | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk → Production → API Keys |
   | `CLERK_SECRET_KEY` | Clerk → Production → API Keys |
   | `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` |
   | `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-up` |
   | `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | `/dashboard` |
   | `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | `/onboarding` |
   | `CLERK_WEBHOOK_SECRET` | Clerk → Webhooks → Signing Secret (set in step 2.6) |
   | `POWERBI_API_KEY` | Long random string (rotate quarterly) |
   | `N8N_WEBHOOK_URL` | Optional — only if AI agent is enabled |
   | `SENTRY_DSN` | Optional — from Sentry project settings |
   | `NEXT_PUBLIC_SENTRY_DSN` | Optional — same DSN |

4. **Deploy.** Vercel builds the `main` branch first; previews follow each
   PR.

### Custom domain

1. Vercel → Project → Settings → Domains → add `app.znit.ai` (or your
   chosen subdomain).
2. Update DNS at the registrar: `CNAME app → cname.vercel-dns.com`.
3. Wait for SSL provisioning (~1 minute).
4. Return to Clerk and update the production frontend URL to match.

### Verify

```bash
# Sign in / sign up flow works
open https://app.znit.ai/sign-up

# Webhook reaches the app (after a test signup)
# Clerk dashboard → Webhooks → Logs should show 200s

# A new user appears in Supabase
SELECT clerk_user_id, clerk_org_id, company_id, email
FROM public.users ORDER BY created_at DESC LIMIT 5;
```

---

## 5. Day-2 operations

### Rotating secrets

| Secret | Rotation cadence | Process |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Quarterly or on suspected leak | Supabase → Project Settings → API → Reset service_role |
| `CLERK_SECRET_KEY` | On suspected leak | Clerk → Production → API Keys → Rotate |
| `CLERK_WEBHOOK_SECRET` | When rotating webhook | Clerk → Webhooks → Roll Signing Secret |
| `POWERBI_API_KEY` | Quarterly | Generate new random string, update Vercel + PowerBI workspace |

Always update Vercel env vars in the **same deploy** that rotates the key,
or production briefly serves with a stale value.

### Health checks

- `GET /api/health` — public liveness probe, no auth required
- Vercel logs: Project → Logs (filter `error`)
- Clerk webhook logs: dashboard → Webhooks → recent attempts
- Sentry: alerts on new error fingerprints, performance regressions

### Common failure modes

- **Sign-in works but every API returns 401**: webhook isn't firing. Check
  Clerk → Webhooks → Logs. Most common cause: `CLERK_WEBHOOK_SECRET`
  mismatch between Clerk and Vercel.
- **Webhook returns 500**: usually a Supabase upsert error. Check Vercel
  function logs for the `webhook handler error` line, then look at the
  offending event payload.
- **User signs up but can't see anything**: the user has no Organization
  yet — they get redirected to `/onboarding`. If they refuse to create one,
  the app stays empty. Working as intended.
- **Cross-tenant leak suspected**: check [`docs/SECURITY.md`](./SECURITY.md)
  — every tenanted route must filter by `company_id` or call
  `assert*Ownership`.
