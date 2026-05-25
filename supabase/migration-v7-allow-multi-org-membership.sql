-- ==========================================================================
-- ZNIT ESG — Migration v7: allow a user to belong to multiple organizations
--
-- A residual UNIQUE constraint on users.clerk_user_id (originally added when
-- the table was single-tenant JWT) blocks the Clerk Organizations contract:
-- the same human can be a member of N orgs simultaneously, with N rows in
-- public.users keyed by (clerk_user_id, clerk_org_id).
--
-- migration-v3-clerk.sql already added the correct partial UNIQUE INDEX on
-- (clerk_user_id, clerk_org_id) — this migration just removes the leftover
-- single-column UNIQUE so the webhook can insert rows for additional org
-- memberships without "duplicate key value" errors.
--
-- Safe to run multiple times.
-- ==========================================================================

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_clerk_user_id_key;

-- Also drop any auto-generated UNIQUE that may have been added on the
-- column via Supabase Studio (idempotent if absent).
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    JOIN pg_class ON pg_class.oid = conrelid
    JOIN pg_namespace ON pg_namespace.oid = relnamespace
    WHERE nspname = 'public'
      AND relname = 'users'
      AND contype = 'u'
      AND (
        SELECT array_agg(attname)
        FROM pg_attribute
        WHERE attrelid = conrelid
          AND attnum = ANY (conkey)
      ) = ARRAY['clerk_user_id']::text[]
  LOOP
    EXECUTE format('ALTER TABLE public.users DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
