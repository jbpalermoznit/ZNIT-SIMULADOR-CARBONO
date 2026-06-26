-- =====================================================================
-- v10 — Cadastro de preços de EPD POR EMPRESA (schema public)
-- =====================================================================
-- Substitui a estimativa de preço por IA por um cadastro manual: cada
-- empresa preenche o preço dos EPDs que usa. Quando um EPD é usado numa
-- substituição (Recomendações), a rota usa o preço cadastrado pela empresa.
--
-- Multi-tenant: chave (company_id, epd_id). epd_id é o id de backend.epd_dev
-- (sem FK cross-schema). Preço na UNIDADE DECLARADA do EPD (R$/declared_unit).
--
-- Idempotente (IF NOT EXISTS). Aplicar no SQL Editor do Supabase.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.epd_prices (
  id           BIGSERIAL PRIMARY KEY,
  company_id   TEXT NOT NULL REFERENCES public.companies(id),
  epd_id       BIGINT NOT NULL,
  price_per_declared_unit DOUBLE PRECISION NOT NULL,
  declared_unit TEXT,                 -- snapshot para exibição
  note         TEXT,
  updated_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, epd_id)
);

CREATE INDEX IF NOT EXISTS idx_epd_prices_company ON public.epd_prices (company_id);
