-- ===========================================================================
-- migration-v11-manual-conversion.sql
-- ---------------------------------------------------------------------------
-- Manual unit correction + conversion override on item_mappings.
--
-- resolveConversion() (lib/server/calculator.ts) only resolves a unit
-- mismatch two ways: direct unit-family match, or a hardcoded "geometric
-- recipe" keyed off keywords in the item description. When neither applies
-- (e.g. item parsed as m² but the EPD factor is per kg, no recipe covers the
-- material), the conversion returns 0 and the item's emission is silently
-- zeroed. These columns let an analyst either correct the unit used at calc
-- time, or supply an explicit multiplier — without touching the originally
-- imported abc_items.unit.
--
-- NULL means "no override; use abc_items.unit / the automatic cascade".
-- ===========================================================================

ALTER TABLE public.item_mappings
  ADD COLUMN IF NOT EXISTS unit_override TEXT,
  ADD COLUMN IF NOT EXISTS manual_conversion_factor DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS manual_conversion_note TEXT;

COMMENT ON COLUMN public.item_mappings.unit_override IS
  'Corrects the unit used for this item at calc time (e.g. item was parsed as "un" but should be "kg" to match the factor). NULL means use abc_items.unit as-is.';
COMMENT ON COLUMN public.item_mappings.manual_conversion_factor IS
  'Explicit multiplier: qty_item (in the effective unit) × this = qty in the factor''s unit. Used when the effective unit still does not share a family with the factor unit and no geometric recipe applies. NULL means use the automatic conversion cascade.';
COMMENT ON COLUMN public.item_mappings.manual_conversion_note IS
  'Free-text justification for manual_conversion_factor (e.g. "densidade 1850 kg/m³ informada pelo engenheiro").';
