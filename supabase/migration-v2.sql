-- ==========================================================================
-- ZNIT ESG — Migration v2: Support for scenario uploads with insumo recipes
-- Run after migration.sql
-- ==========================================================================

-- Tipo de curva: 'itens' (ABC simples) ou 'scenario' (itens + insumos expandidos)
ALTER TABLE public.abc_curves ADD COLUMN IF NOT EXISTS curve_type TEXT DEFAULT 'itens';

-- Vincular cenário à curva ABC específica (para multi-cenário)
ALTER TABLE public.scenarios ADD COLUMN IF NOT EXISTS abc_curve_id TEXT REFERENCES public.abc_curves(id);
