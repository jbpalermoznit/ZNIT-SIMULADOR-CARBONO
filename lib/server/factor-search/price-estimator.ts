/**
 * Estimador de preço de mercado por IA (Anthropic + web search), grounded.
 *
 * EPD é documento AMBIENTAL e NÃO traz preço. Para o ROI por custo de
 * abatimento, estimamos o preço de mercado da CATEGORIA do material (não do
 * EPD específico) via Claude com a ferramenta de busca web — sempre com FONTE,
 * DATA e CONFIANÇA, para ser apresentado como "estimativa — confirmar" e
 * editável. Nunca é um número cravado.
 *
 * SEGURANÇA / NÃO-REGRESSÃO (igual ao reranker):
 *  - Desligado por padrão. Só roda com PRICE_ESTIMATION_ENABLED=true E
 *    ANTHROPIC_API_KEY presente.
 *  - GROUNDED-OU-NADA: se o modelo não usou a busca web (sem citação) ou não
 *    retornou fonte, devolve null → o chamador mostra "custo a confirmar".
 *  - Qualquer erro (rede, parse) → null. Nunca quebra a recomendação.
 *
 * O cache (backend.price_estimates) fica fora daqui (supabase-emission) para
 * manter este módulo testável sem DB.
 */

import Anthropic from "@anthropic-ai/sdk";

// Modelo do estimador é INDEPENDENTE do reranker (FACTOR_PRICE_MODEL) e
// defaulta para o Haiku — estimar preço com busca web é tarefa simples e o
// Haiku é muito mais barato que o Opus. Override por env quando quiser.
const MODEL = process.env.FACTOR_PRICE_MODEL ?? "claude-haiku-4-5-20251001";

export interface PriceEstimate {
  /** Preço na `unit` informada. */
  price: number;
  currency: string;
  unit: string;
  source_name: string | null;
  source_url: string | null;
  /** Data de referência informada pela fonte (texto livre). */
  as_of: string | null;
  confidence: "high" | "medium" | "low";
}

export interface EstimateInput {
  materialDesc: string;
  unit: string;
  /** UF (ex.: "SP") ou "BR". */
  region?: string;
}

export function isPriceEstimationEnabled(): boolean {
  return (
    process.env.PRICE_ESTIMATION_ENABLED === "true" &&
    !!process.env.ANTHROPIC_API_KEY
  );
}

const SYSTEM_PROMPT = `Você é um especialista em custos de construção civil no Brasil.
Estime o PREÇO DE MERCADO de referência de um material/insumo, na unidade pedida, em BRL.
Use a ferramenta de busca web para ancorar em fontes reais (SINAPI/CAIXA, SICRO, catálogos, publicações de mercado) — preferencialmente recentes e da região indicada.

Regras:
- É a estimativa da CATEGORIA do material (ex.: "concreto usinado fck 30"), não de um produto/fornecedor específico.
- SEMPRE baseie em uma fonte encontrada na busca. Se não encontrar fonte confiável, retorne price = null.
- confidence: "high" só com fonte oficial/recente (SINAPI do mês/UF); "medium" com fonte de mercado razoável; "low" caso contrário.
- Responda APENAS com um bloco JSON no formato:
{"price": number|null, "currency": "BRL", "unit": "<unidade>", "source_name": "<fonte>", "source_url": "<url>", "as_of": "<data/competência>", "confidence": "high|medium|low"}`;

function extractJson(text: string): Record<string, unknown> | null {
  // Pega o último objeto JSON do texto (o modelo pode comentar antes).
  const matches = text.match(/\{[\s\S]*\}/g);
  if (!matches) return null;
  for (let i = matches.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(matches[i]) as Record<string, unknown>;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Estima o preço de mercado. Retorna null quando desabilitado, sem
 * grounding (sem busca/fonte), ou em qualquer falha.
 */
export async function estimateMarketPrice(
  input: EstimateInput
): Promise<PriceEstimate | null> {
  if (!isPriceEstimationEnabled()) return null;
  if (!input.materialDesc?.trim() || !input.unit?.trim()) return null;

  const region = input.region?.trim() || "BR";

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 4,
        } as unknown as Anthropic.Tool,
      ],
      messages: [
        {
          role: "user",
          content: `Material: "${input.materialDesc}"\nUnidade: ${input.unit}\nRegião: ${region}\n\nEstime o preço de mercado (BRL por ${input.unit}) com fonte.`,
        },
      ],
    });

    if (response.stop_reason === "refusal") return null;

    // GROUNDING: exigir que a busca web tenha sido usada.
    const usedSearch = response.content.some(
      (b) =>
        b.type === "server_tool_use" ||
        (b.type as string) === "web_search_tool_result"
    );
    if (!usedSearch) return null;

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return null;

    const parsed = extractJson(textBlock.text);
    if (!parsed) return null;

    const price = Number(parsed.price);
    const sourceUrl = (parsed.source_url as string) ?? null;
    // Grounded-ou-nada: preço válido E uma fonte.
    if (!Number.isFinite(price) || price <= 0 || !sourceUrl) return null;

    const conf = String(parsed.confidence ?? "low");
    const confidence: PriceEstimate["confidence"] =
      conf === "high" || conf === "medium" ? conf : "low";

    return {
      price: Math.round(price * 100) / 100,
      currency: String(parsed.currency ?? "BRL"),
      unit: String(parsed.unit ?? input.unit),
      source_name: (parsed.source_name as string) ?? null,
      source_url: sourceUrl,
      as_of: (parsed.as_of as string) ?? null,
      confidence,
    };
  } catch (e) {
    console.warn(
      `[price-estimator] falhou, sem estimativa: ${e instanceof Error ? e.message : e}`
    );
    return null;
  }
}
