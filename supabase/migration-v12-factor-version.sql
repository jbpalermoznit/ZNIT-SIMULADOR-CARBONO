-- ===========================================================================
-- migration-v12-factor-version.sql
-- ---------------------------------------------------------------------------
-- Versão/vintage do fator de emissão, persistida e exportável.
--
-- Cada fonte versiona de um jeito diferente (GHG Protocol tem versao_ghg/ano,
-- EPD tem valid_until/registration_date, Ecoinvent tem year_start/year_end,
-- CECarbon só tem texto livre em Referencia) — factor_version guarda a
-- string já formatada por tier (ver lib/server/factor-version.ts), pra não
-- reimplementar a lógica por consumidor.
--
-- item_mappings.factor_version é a fonte da verdade, preenchida no
-- auto-map e na confirmação manual. scenario_items.factor_version é uma
-- CÓPIA congelada no momento em que o cenário é criado/o fator é aplicado
-- — mesmo padrão de factor_value/factor_unit/factor_name/source_tier, que
-- já são fotografados por cenário em vez de sempre lidos ao vivo do mapping.
-- ===========================================================================

ALTER TABLE public.item_mappings
  ADD COLUMN IF NOT EXISTS factor_version TEXT;

ALTER TABLE public.scenario_items
  ADD COLUMN IF NOT EXISTS factor_version TEXT;

COMMENT ON COLUMN public.item_mappings.factor_version IS
  'Versão/vintage do fator, formatada por tier (ver lib/server/factor-version.ts). NULL quando a fonte não tem informação de versão confiável.';
COMMENT ON COLUMN public.scenario_items.factor_version IS
  'Cópia congelada de item_mappings.factor_version no momento em que o cenário foi criado ou o fator foi aplicado a este item.';
