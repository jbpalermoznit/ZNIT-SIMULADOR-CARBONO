-- ===========================================================================
-- migration-v8-unit-cost-override.sql
-- ---------------------------------------------------------------------------
-- Per-scenario cost override on scenario_items.
--
-- When the analyst substitutes a factor with a specific EPD (or any other
-- source) the price of the substituted product is usually different from the
-- one in the ABC. We capture the *new unit cost* at substitution time so
-- the scenario reflects both the emission change AND the cost change — and
-- the MACC curve can later use it for R$/tCO₂e evitada.
--
-- NULL means "no override; use abc_items.unit_cost".
-- ===========================================================================

ALTER TABLE public.scenario_items
  ADD COLUMN IF NOT EXISTS unit_cost_override DOUBLE PRECISION;

COMMENT ON COLUMN public.scenario_items.unit_cost_override IS
  'Optional override of abc_items.unit_cost for this scenario. Set when the analyst substitutes a factor with an EPD whose product has a different price. NULL means use the original ABC unit cost.';
