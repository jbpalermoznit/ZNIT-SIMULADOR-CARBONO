-- ==========================================================================
-- ZNIT ESG — Migration v6: drop legacy seed and pre-Clerk password column
--
-- The original `supabase/seed.sql` injected hardcoded rows used during
-- single-tenant JWT development:
--   * company-htb     (ZNIT Engenharia)
--   * user-joao       (joao@znit.io)
--   * proj-znit-demo  (Projeto ZNIT)
--
-- These don't belong in a production database — every real company comes
-- in through the Clerk webhook. Also drops the `hashed_password` column
-- (legacy bcrypt path) now that Clerk is the only identity source.
--
-- Safe to run multiple times.
-- ==========================================================================

-- 1. Wipe legacy demo data, in FK dependency order
DELETE FROM public.scenario_results WHERE scenario_id IN (
  SELECT id FROM public.scenarios WHERE project_id = 'proj-znit-demo'
);
DELETE FROM public.scenario_items WHERE scenario_id IN (
  SELECT id FROM public.scenarios WHERE project_id = 'proj-znit-demo'
);
DELETE FROM public.scenarios WHERE project_id = 'proj-znit-demo';
DELETE FROM public.item_mappings WHERE abc_item_id IN (
  SELECT id FROM public.abc_items WHERE abc_curve_id IN (
    SELECT id FROM public.abc_curves WHERE project_id = 'proj-znit-demo'
  )
);
DELETE FROM public.abc_items WHERE abc_curve_id IN (
  SELECT id FROM public.abc_curves WHERE project_id = 'proj-znit-demo'
);
DELETE FROM public.abc_curves WHERE project_id = 'proj-znit-demo';
DELETE FROM public.projects WHERE id = 'proj-znit-demo';

DELETE FROM public.factor_rules WHERE company_id = 'company-htb';
DELETE FROM public.equipment_rules WHERE company_id = 'company-htb';
DELETE FROM public.users WHERE id = 'user-joao';
DELETE FROM public.companies WHERE id = 'company-htb';

-- 2. Drop the legacy bcrypt password column. Clerk owns auth now.
ALTER TABLE public.users DROP COLUMN IF EXISTS hashed_password;
