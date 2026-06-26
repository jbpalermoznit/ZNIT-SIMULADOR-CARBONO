-- =====================================================================
-- v9 — Preço de EPD (opcional) + cache de estimativas de preço (schema `backend`)
-- =====================================================================
-- Suporte ao motor de "Recomendações de redução" (ROI por custo de abatimento).
-- O EPD é um documento AMBIENTAL e não traz preço — então o custo da
-- alternativa vem em camadas:
--   1. override do cenário (scenario_items.unit_cost_override)
--   2. preço semeado/conhecido no próprio EPD (coluna abaixo)
--   3. estimativa de mercado por IA (cacheada em backend.price_estimates)
--   4. nada → "custo a confirmar"
--
-- Idempotente (IF NOT EXISTS). Aplicar no SQL Editor do Supabase.
-- =====================================================================

-- 1. Preço opcional, conhecido/semeado, na unidade declarada do EPD (R$/declared_unit).
ALTER TABLE backend.epd_dev
  ADD COLUMN IF NOT EXISTS price_per_declared_unit DOUBLE PRECISION;

-- 2. Cache de estimativas de preço de mercado por CATEGORIA de material.
--    Reusável entre projetos/itens; determinístico dentro do período.
--    O `material_key` é a descrição normalizada (minúsculo, sem acento) da
--    categoria; `region` opcional (UF ou 'BR'); `period` no formato 'YYYY-MM'.
CREATE TABLE IF NOT EXISTS backend.price_estimates (
  id           BIGSERIAL PRIMARY KEY,
  material_key TEXT NOT NULL,
  region       TEXT NOT NULL DEFAULT 'BR',
  unit         TEXT NOT NULL,
  period       TEXT NOT NULL,                 -- 'YYYY-MM'
  price        DOUBLE PRECISION NOT NULL,
  currency     TEXT NOT NULL DEFAULT 'BRL',
  source_name  TEXT,
  source_url   TEXT,
  as_of        TEXT,                          -- data de referência informada pela fonte
  confidence   TEXT NOT NULL DEFAULT 'low',   -- 'high' | 'medium' | 'low'
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (material_key, region, unit, period)
);

CREATE INDEX IF NOT EXISTS idx_price_estimates_lookup
  ON backend.price_estimates (material_key, region, unit, period);
