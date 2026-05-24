-- ==========================================================================
-- ZNIT ESG — Migration v4: email is unique per organization, not global
--
-- Original schema had public.users.email UNIQUE globally, which made sense
-- under the single-tenant JWT auth. With Clerk Organizations, the same human
-- can be a member of multiple orgs with the same email, and we mirror each
-- membership as its own row in public.users. So email must be unique only
-- within (clerk_org_id, email).
-- ==========================================================================

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_email_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_per_org
  ON public.users(clerk_org_id, email)
  WHERE clerk_org_id IS NOT NULL;
