-- ===========================================================================
-- migration-v14-epd-ai-extraction.sql
-- ---------------------------------------------------------------------------
-- Extração de fator de emissão (GWP A1-A3) de EPDs via IA, com revisão humana
-- obrigatória antes de qualquer uso em cálculo.
--
-- backend.epd_dev é gerenciada fora deste repositório (sincronizada por um
-- processo externo, sem CREATE TABLE aqui) — a extração NUNCA escreve nela.
-- Fica numa tabela nova, neste schema (public), referenciando epd_dev.id
-- só logicamente (sem FK cross-schema).
--
-- Toda extração nasce em pending_review. Só linhas status='approved' entram
-- na cascata de resolução de fator (ver app/api/emission-factors/mapping/
-- [itemId]/route.ts, branch EPD). Reextração é idempotente: delete + insert,
-- sempre reseta para pending_review — nunca herda aprovação antiga sobre um
-- valor novo.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.epd_ai_extractions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  epd_id INTEGER NOT NULL,
  found BOOLEAN NOT NULL,
  gwp_a1a3 DOUBLE PRECISION,
  declared_unit TEXT,
  declared_value DOUBLE PRECISION,
  confidence TEXT,
  citation TEXT NOT NULL,
  model TEXT NOT NULL,
  extracted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending_review',
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  UNIQUE(epd_id)
);

CREATE INDEX IF NOT EXISTS idx_epd_ai_extractions_status ON public.epd_ai_extractions(status);

COMMENT ON TABLE public.epd_ai_extractions IS
  'Extrações de GWP A1-A3 de EPDs via IA (Claude + PDF). Referencia backend.epd_dev.id logicamente (sem FK cross-schema). Só status=approved é usada na resolução de fator.';
COMMENT ON COLUMN public.epd_ai_extractions.found IS
  'false = a IA concluiu que o valor A1-A3 não está no documento (não é falha técnica).';
COMMENT ON COLUMN public.epd_ai_extractions.citation IS
  'Trecho/tabela exata citada pela IA como fonte do valor — para o revisor conferir contra o PDF original.';
COMMENT ON COLUMN public.epd_ai_extractions.status IS
  'pending_review | approved | rejected. Só approved é consumida na resolução de fator do mapping.';
