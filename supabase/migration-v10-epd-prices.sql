-- =====================================================================
-- v10 — Registro de EPD POR EMPRESA: preço + GWP manual (schema public)
-- =====================================================================
-- Cada empresa registra, para um EPD: o PREÇO (R$ por price_unit) e/ou o
-- GWP A1-A3 que a própria organização preencheu (do PDF do EPD). Ambos valem
-- só para a empresa (org). Ao substituir nas Recomendações, usa o preço/GWP
-- da empresa logada.
--
-- Multi-tenant: chave (company_id, epd_id). epd_id = id de backend.epd_dev.
--
-- Idempotente: CREATE IF NOT EXISTS + ALTERs IF NOT EXISTS (cobre quem já
-- aplicou a v10 anterior). Aplicar no SQL Editor do Supabase.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.epd_prices (
  id           BIGSERIAL PRIMARY KEY,
  company_id   TEXT NOT NULL REFERENCES public.companies(id),
  epd_id       BIGINT NOT NULL,
  price_per_declared_unit DOUBLE PRECISION,   -- R$ por price_unit (nullable: pode ter só GWP)
  price_unit   TEXT,                          -- unidade do preço (editável; default = declared_unit do EPD)
  declared_unit TEXT,                         -- snapshot da unidade declarada do EPD
  gwp_a1a3     DOUBLE PRECISION,              -- GWP A1-A3 manual da organização (nullable)
  note         TEXT,
  updated_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, epd_id)
);

-- Para quem já tinha a v10 antiga (só price NOT NULL): adiciona as colunas novas
-- e torna o preço opcional (linhas que têm só GWP).
ALTER TABLE public.epd_prices ADD COLUMN IF NOT EXISTS price_unit TEXT;
ALTER TABLE public.epd_prices ADD COLUMN IF NOT EXISTS gwp_a1a3 DOUBLE PRECISION;
ALTER TABLE public.epd_prices ALTER COLUMN price_per_declared_unit DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_epd_prices_company ON public.epd_prices (company_id);
