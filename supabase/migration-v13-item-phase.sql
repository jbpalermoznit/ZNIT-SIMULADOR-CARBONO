-- ===========================================================================
-- migration-v13-item-phase.sql
-- ---------------------------------------------------------------------------
-- Agrupamento por fase de obra (etapa) em abc_items.
--
-- Não deriva automaticamente do cost_code: o prefixo já está totalmente
-- ocupado pela classificação de natureza do recurso (mão de
-- obra/material/equipamento/subcontrato — TYPE_BY_PREFIX/inferTypeFromCostCode)
-- e a estrutura do cost_code varia por cliente (iTwo padrão, SECAGEM Insumos,
-- 640-HT-Vale já usam esquemas de código diferentes). phase é um campo livre,
-- marcado manualmente (individual ou em lote) pelo analista na página de Itens.
-- ===========================================================================

ALTER TABLE public.abc_items
  ADD COLUMN IF NOT EXISTS phase TEXT;

CREATE INDEX IF NOT EXISTS idx_abc_items_phase ON public.abc_items(phase);

COMMENT ON COLUMN public.abc_items.phase IS
  'Fase/etapa de obra, texto livre marcado manualmente (ex.: "Fundação", "Estrutura", "Vedação"). NULL = não classificado.';
