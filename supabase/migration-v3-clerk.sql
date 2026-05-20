-- ==========================================================================
-- ZNIT ESG — Migration v3: Clerk integration
--
-- Adds clerk_user_id (users) and clerk_org_id (companies + users) so the
-- webhook /api/webhooks/clerk can keep public.users and public.companies in
-- sync with Clerk's identity database.
--
-- hashed_password is kept nullable (legacy column — removed once all users
-- migrate to Clerk).
-- ==========================================================================

-- 1. companies: track Clerk Organization
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS clerk_org_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_clerk_org_id
  ON public.companies(clerk_org_id)
  WHERE clerk_org_id IS NOT NULL;

-- 2. users: track Clerk user + active org
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS clerk_user_id TEXT,
  ADD COLUMN IF NOT EXISTS clerk_org_id TEXT,
  ALTER COLUMN hashed_password DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_clerk_user_org
  ON public.users(clerk_user_id, clerk_org_id)
  WHERE clerk_user_id IS NOT NULL AND clerk_org_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_clerk_user_id
  ON public.users(clerk_user_id)
  WHERE clerk_user_id IS NOT NULL;
