/**
 * Extração do fator de emissão (GWP A1-A3) de um EPD via IA (Claude, leitura
 * direta do PDF) — feedback Saint Gobain: "identificar automaticamente o
 * fator de emissão do EPD".
 *
 * SEGURANÇA / NÃO-REGRESSÃO (mesmo padrão do reranker em
 * lib/server/factor-search/claude-reranker.ts):
 *  - Desligado por padrão. Só roda com EPD_EXTRACTION_ENABLED=true E
 *    ANTHROPIC_API_KEY presente.
 *  - Qualquer erro (fetch do PDF, rede, parse, schema) → retorna null. O
 *    chamador NUNCA grava um valor não confirmado — toda extração cai em
 *    epd_ai_extractions com status=pending_review, e só entra em cálculo
 *    real depois de aprovada por um humano (ver app/api/emission-factors/
 *    mapping/[itemId]/route.ts, branch EPD).
 *  - Validação ao vivo (EPD Gerdau CA-60): a IA extraiu um valor plausível
 *    mas de uma variante de produto diferente da esperada — por isso a
 *    citação exata do trecho do PDF é obrigatória, para o revisor conferir
 *    contra o documento original antes de aprovar.
 */

import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/server/supabase";

export const EPD_EXTRACTION_MODEL = process.env.EPD_EXTRACTION_MODEL ?? "claude-sonnet-5";
const MODEL = EPD_EXTRACTION_MODEL;

export interface EpdExtractionResult {
  found: boolean;
  gwp_a1a3: number | null;
  declared_unit: string | null;
  declared_value: number | null;
  confidence: "alta" | "media" | "baixa";
  citation: string;
}

export function isEpdExtractionEnabled(): boolean {
  return (
    process.env.EPD_EXTRACTION_ENABLED === "true" &&
    !!process.env.ANTHROPIC_API_KEY
  );
}

const RESULT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    found: {
      type: "boolean",
      description: "true se o valor de GWP A1-A3 (ou A1-A3 total do ciclo de vida) está literalmente no documento.",
    },
    gwp_a1a3: {
      type: ["number", "null"],
      description: "Valor de GWP total A1-A3, em kgCO2e por unidade declarada. null se found=false.",
    },
    declared_unit: {
      type: ["string", "null"],
      description: "Unidade declarada do produto no EPD (ex.: \"1 kg\", \"1 m²\", \"1 un\", \"1 t\"). null se found=false.",
    },
    declared_value: {
      type: ["number", "null"],
      description: "Quantidade numérica da unidade declarada (ex.: 1, 1000). null se found=false.",
    },
    confidence: {
      type: "string",
      enum: ["alta", "media", "baixa"],
      description: "Confiança de que este é o valor A1-A3 correto e não o de uma variante/tabela diferente.",
    },
    citation: {
      type: "string",
      description: "Trecho ou tabela exata do documento onde o valor aparece (citação literal, em PT ou na língua original), para auditoria humana.",
    },
  },
  required: ["found", "gwp_a1a3", "declared_unit", "declared_value", "confidence", "citation"],
} as const;

const SYSTEM_PROMPT = `Você é um especialista em Análise de Ciclo de Vida (ACV) e EPDs (Environmental Product Declarations) conforme EN 15804.

Sua tarefa: ler o PDF de um EPD e extrair o valor de GWP (Global Warming Potential) total do módulo A1-A3 (aquisição de matéria-prima + transporte + fabricação) — às vezes chamado de "GWP-total A1-A3", "Climate change A1-A3" ou aparece como a soma de A1+A2+A3 numa tabela de indicadores ambientais.

Regras:
- Extraia SOMENTE o que está literalmente escrito no documento. NUNCA calcule, estime ou infira um valor que não esteja explícito.
- Se o documento cobre MÚLTIPLAS variantes/referências de produto (tabelas separadas por espessura, resistência, composição etc.) e não há uma única linha "resumo" A1-A3 aplicável ao produto genérico, marque confidence="baixa" e cite qual variante você usou — não escolha arbitrariamente a "principal".
- Se não encontrar um valor A1-A3 explícito no documento, responda found=false, todos os campos numéricos null, e explique em citation o que você encontrou (ex.: "documento não apresenta tabela de indicadores ambientais" ou "apresenta apenas cradle-to-gate sem módulos A1-A3 separados").
- A unidade declarada (declared_unit) é a unidade funcional/declarada do produto no EPD (ex.: "1 kg", "1 m²", "1 m³", "1 un", "1 t") — não confunda com a unidade do próprio indicador (kgCO2e).
- citation deve ser literal o suficiente para um humano localizar o trecho no PDF original (nome da tabela/seção + valor).
Responda apenas no formato estruturado.`;

async function fetchPdfBase64(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const buf = await resp.arrayBuffer();
    if (buf.byteLength === 0) return null;
    return Buffer.from(buf).toString("base64");
  } catch {
    return null;
  }
}

/**
 * Extrai o GWP A1-A3 de um EPD a partir da URL do PDF.
 * Retorna null em qualquer falha técnica (PDF indisponível, API, parse) —
 * o chamador trata isso como "não foi possível processar", nunca como
 * "valor não existe" (found=false é a resposta correta pra esse caso, vinda
 * de dentro do fluxo bem-sucedido).
 */
export async function extractEpdGwp(pdfSourceUrl: string): Promise<EpdExtractionResult | null> {
  if (!isEpdExtractionEnabled()) return null;
  if (!pdfSourceUrl) return null;

  const base64 = await fetchPdfBase64(pdfSourceUrl);
  if (!base64) return null;

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      output_config: { format: { type: "json_schema", schema: RESULT_SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: base64 },
            },
            {
              type: "text",
              text: "Extraia o GWP total A1-A3 deste EPD, seguindo as regras do prompt de sistema.",
            },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") return null;

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return null;

    const parsed = JSON.parse(textBlock.text) as EpdExtractionResult;
    if (typeof parsed.found !== "boolean") return null;

    return {
      found: parsed.found,
      gwp_a1a3: parsed.found ? parsed.gwp_a1a3 ?? null : null,
      declared_unit: parsed.found ? parsed.declared_unit ?? null : null,
      declared_value: parsed.found ? parsed.declared_value ?? null : null,
      confidence: parsed.confidence ?? "baixa",
      citation: parsed.citation ?? "",
    };
  } catch (e) {
    console.warn(`[epd-extraction] falhou: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

/** Resolve a melhor URL de PDF disponível para um EPD (old_link primeiro —
 *  bucket GCS público confirmado acessível sem auth; pdf_url do Drive como
 *  fallback, menos confiável sem autenticação). */
export function resolveEpdPdfUrl(row: Record<string, unknown>): string | null {
  const oldLink = (row.old_link as string) ?? null;
  if (oldLink) return oldLink;
  const pdfUrl = (row.pdf_url as string) ?? null;
  return pdfUrl || null;
}

// ---------------------------------------------------------------------------
// public.epd_ai_extractions — persistência (migration-v14). Degrada
// gracioso (retorna null/no-op) se a tabela ainda não existir na env atual.
// ---------------------------------------------------------------------------

export interface EpdAiExtractionRow {
  id: string;
  epd_id: number;
  found: boolean;
  gwp_a1a3: number | null;
  declared_unit: string | null;
  declared_value: number | null;
  confidence: string | null;
  citation: string;
  model: string;
  extracted_at: string;
  status: "pending_review" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
}

export async function getEpdExtraction(epdId: number): Promise<EpdAiExtractionRow | null> {
  const { data, error } = await supabase
    .from("epd_ai_extractions")
    .select("*")
    .eq("epd_id", epdId)
    .maybeSingle();
  if (error || !data) return null;
  return data as EpdAiExtractionRow;
}

export async function getEpdExtractionsByIds(epdIds: number[]): Promise<Map<number, EpdAiExtractionRow>> {
  const out = new Map<number, EpdAiExtractionRow>();
  if (epdIds.length === 0) return out;
  const { data, error } = await supabase
    .from("epd_ai_extractions")
    .select("*")
    .in("epd_id", epdIds);
  if (error || !data) return out;
  for (const row of data as EpdAiExtractionRow[]) out.set(row.epd_id, row);
  return out;
}

export async function getApprovedEpdExtraction(epdId: number): Promise<EpdAiExtractionRow | null> {
  const { data, error } = await supabase
    .from("epd_ai_extractions")
    .select("*")
    .eq("epd_id", epdId)
    .eq("status", "approved")
    .maybeSingle();
  if (error || !data) return null;
  return data as EpdAiExtractionRow;
}

/**
 * Grava uma extração nova, sempre em pending_review — reextração é
 * idempotente (delete + insert) e nunca herda uma aprovação/rejeição
 * anterior sobre um valor novo (mesmo padrão de item_mappings na rota PUT
 * de mapping).
 */
export async function upsertEpdExtraction(
  epdId: number,
  result: EpdExtractionResult,
  model: string
): Promise<{ ok: boolean; error?: string }> {
  await supabase.from("epd_ai_extractions").delete().eq("epd_id", epdId);
  const { error } = await supabase.from("epd_ai_extractions").insert({
    epd_id: epdId,
    found: result.found,
    gwp_a1a3: result.gwp_a1a3,
    declared_unit: result.declared_unit,
    declared_value: result.declared_value,
    confidence: result.confidence,
    citation: result.citation,
    model,
    status: "pending_review",
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function reviewEpdExtraction(
  epdId: number,
  approve: boolean,
  reviewedBy: string
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("epd_ai_extractions")
    .update({
      status: approve ? "approved" : "rejected",
      reviewed_by: reviewedBy,
      reviewed_at: new Date().toISOString(),
    })
    .eq("epd_id", epdId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
