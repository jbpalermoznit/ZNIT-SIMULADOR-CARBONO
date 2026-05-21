-- ==========================================================================
-- ZNIT ESG — Migration v5: ABC enrichment from iTwo cost-code catalog
-- and Relatório Proof
--
-- Three new optional fields on abc_items that the new upload path
-- populates when the matching files are attached:
--   * canonical_description — clean description from the iTwo Cost Code
--     catalog (replaces truncated/abbreviated descriptions in the ABC for
--     matching purposes; UI keeps the original).
--   * assemblies            — JSON array of { code, description, uom }
--     pulled from the Relatório Proof. Each cost code may be consumed by
--     multiple assemblies/compositions; matching now iterates over them.
--   * inferred_type         — A/B/C/D/E/F guess from the cost-code prefix
--     (40xx → MO, 42xx → material, …). Used when item_type is still the
--     parser-derived default.
-- ==========================================================================

ALTER TABLE public.abc_items
  ADD COLUMN IF NOT EXISTS canonical_description TEXT,
  ADD COLUMN IF NOT EXISTS assemblies JSONB,
  ADD COLUMN IF NOT EXISTS inferred_type TEXT;

-- Sparse lookup index for the cost-code prefix queries used by reports
CREATE INDEX IF NOT EXISTS idx_abc_items_inferred_type
  ON public.abc_items(inferred_type)
  WHERE inferred_type IS NOT NULL;
