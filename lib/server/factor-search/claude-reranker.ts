/**
 * Reranker de fatores de emissão via Claude (Anthropic).
 *
 * Recebe os candidatos que o matcher determinístico (fuzzball/keywords ou
 * busca vetorial) já recuperou e pede ao Claude para escolher o MELHOR para
 * a descrição do item — com raciocínio semântico e validação de unidade.
 * É a etapa de maior ganho de precisão: o LLM distingue, p.ex., que um
 * "parafuso" em "un" não casa com um fator de aço por kg, ou que
 * "concreto usinado 40MPA" deve preferir o fator BR de concreto 40.
 *
 * SEGURANÇA / NÃO-REGRESSÃO:
 *  - Desligado por padrão. Só roda com FACTOR_RERANKER_ENABLED=true E
 *    ANTHROPIC_API_KEY presente.
 *  - Qualquer erro (rede, parse, schema) → retorna null e o chamador mantém
 *    a escolha determinística. Nunca quebra o cálculo.
 *
 * Determinismo/auditoria: temperatura não é exposta nos modelos atuais; a
 * saída é estruturada (json_schema) e o racional é logado. Itens recorrentes
 * devem ser fixados como Factor Rule (camada 0) para virarem determinísticos.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { MatchCandidate } from "@/lib/server/emission-mapper";
import { getConversionFactor } from "@/lib/server/calculator";
import {
  candidateSig,
  rerankCacheKey,
  getCachedRerank,
  putCachedRerank,
} from "@/lib/server/factor-search/reranker-cache";

// Default Haiku (barato). Override por FACTOR_RERANKER_MODEL se quiser mais
// qualidade de julgamento (Sonnet/Opus) ao custo de mais $$.
const MODEL = process.env.FACTOR_RERANKER_MODEL ?? "claude-haiku-4-5-20251001";
const MAX_CANDIDATES = 12;

export interface RerankResult {
  /** Índice do candidato escolhido no array recebido, ou null se nenhum serve. */
  bestIndex: number | null;
  confidence: "high" | "medium" | "low";
  reason: string;
}

export function isRerankerEnabled(): boolean {
  return (
    process.env.FACTOR_RERANKER_ENABLED === "true" &&
    !!process.env.ANTHROPIC_API_KEY
  );
}

const RESULT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    best_index: {
      type: "integer",
      description:
        "Índice (0-based) do melhor fator na lista, ou -1 se nenhum candidato representa o material do item.",
    },
    confidence: {
      type: "string",
      enum: ["high", "medium", "low"],
    },
    reason: {
      type: "string",
      description: "Justificativa curta (1 frase) em PT-BR.",
    },
  },
  required: ["best_index", "confidence", "reason"],
} as const;

const SYSTEM_PROMPT = `Você é um especialista em fatores de emissão de carbono para construção civil (ACV / EN 15804).
Dada a descrição de um insumo/serviço de orçamento e uma lista de fatores candidatos, escolha o ÚNICO fator que melhor representa a pegada de carbono do material do item.

Regras:
- Prefira o fator do material em si (ex.: "ACO CA-50" → aço/vergalhão; "OLEO DIESEL"/"COMBUSTIVEL" → diesel; "CONCRETO 40MPA" → concreto da resistência correspondente).
- A unidade do fator deve ser compatível com a unidade do item (massa↔massa, volume↔volume, etc.). Rejeite candidatos cuja unidade não converte (ex.: fator de aço por kg para um item contado em "un" ou medido em "m").
- COMPATIBILIDADE DE UNIDADE NÃO BASTA: "un" casar com "un" não torna o match válido. Avalie o TIPO de produto, não só a unidade. Um item e um candidato podem ambos ser contados em "un" e ainda assim serem coisas completamente diferentes.
- Fixadores e conectores metálicos pequenos (PARAFUSO, PARABOLT, CHUMBADOR, PREGO, PORCA, ARRUELA, ARAME, GRAMPO, PINO, REBITE, ABRAÇADEIRA) só casam com fator do METAL (aço, aço inox, ferro). Se os ÚNICOS candidatos compatíveis por unidade forem equipamento, máquina, HVAC, peça hidráulica/sanitária, eletrodoméstico, mobiliário ou qualquer item NÃO relacionado a fixador metálico (ex.: "parabolt" → "room-connecting overflow"; "parafuso" → "air compressor, screw-type"), responda best_index = -1. NÃO escolha um match absurdo só porque a unidade bate.
- Rejeite casamentos absurdos por similaridade textual (ex.: "guarda-corpo" → fator industrial enorme).
- Prefira fontes nacionais (CECarbon/GHG Protocol BR) a genéricas (Ecoinvent) quando ambas representam o mesmo material.
- Se NENHUM candidato representa o material, responda best_index = -1.
Responda apenas no formato estruturado.`;

// Guarda determinística pós-rerank para fixadores/conectores metálicos.
// O problema observado ao vivo: PARABOLT (un) → "room-connecting overflow"
// (un) passava porque a unidade é compatível (un↔un). A checagem de unidade
// sozinha não pega isso; aqui exigimos que, para um item que é claramente um
// fixador metálico, o fator escolhido seja de fato de metal — senão rejeita
// (best_index = -1 efetivo), mantendo o determinístico.
const FASTENER_ITEM_RE =
  /\b(parafuso|parabolt|chumbador|prego|porca|arruela|arame|grampo|rebite|abracadeira|tirefond|tirefao|vergalhao|estribo)\b/;
const METAL_FACTOR_RE =
  /(aco|aço|steel|inox|stainless|ferro|iron|metal|metalic|zinco|zinc|galvaniz|aluminio|alumini|copper|cobre|lat[aã]o|brass|reinforc|vergalh|prego|arame|wire|nail|bolt|screw|anchor|fastener)/;

function norm(s: string | null | undefined): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function buildUserPrompt(
  description: string,
  unit: string | null | undefined,
  candidates: MatchCandidate[]
): string {
  const lines = candidates.map((c, i) => {
    const denom = c.product_unit || c.factor_unit || "";
    return `[${i}] fonte=${c.source_tier} | nome="${c.factor_name}" | fator=${c.factor_value} ${c.factor_unit} | unidade_base=${denom} | ref="${c.factor_source}"`;
  });
  return `Item do orçamento: "${description}" (unidade do item: ${unit ?? "?"})

Candidatos:
${lines.join("\n")}

Escolha o melhor índice.`;
}

/**
 * Reranqueia os candidatos com Claude. Retorna null quando desabilitado,
 * sem candidatos, ou em qualquer falha (o chamador mantém o determinístico).
 */
async function callRerankLLM(
  description: string,
  unit: string | null | undefined,
  candidates: MatchCandidate[]
): Promise<RerankResult | null> {
  if (!isRerankerEnabled()) return null;
  if (!candidates || candidates.length === 0) return null;

  const pool = candidates.slice(0, MAX_CANDIDATES);

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      output_config: { format: { type: "json_schema", schema: RESULT_SCHEMA } },
      messages: [{ role: "user", content: buildUserPrompt(description, unit, pool) }],
    });

    if (response.stop_reason === "refusal") return null;

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return null;

    const parsed = JSON.parse(textBlock.text) as {
      best_index: number;
      confidence: "high" | "medium" | "low";
      reason: string;
    };

    const idx = Number(parsed.best_index);
    if (!Number.isInteger(idx) || idx < 0 || idx >= pool.length) {
      // -1 (nenhum) ou índice inválido
      return { bestIndex: null, confidence: "low", reason: parsed.reason ?? "" };
    }

    // Guarda determinística pós-LLM: o fator escolhido tem de ser
    // convertível para a unidade do item. Se não for, descarta a escolha.
    const chosen = pool[idx];
    if (unit) {
      const conv = getConversionFactor(unit, chosen.factor_unit);
      if (conv === 0) {
        return { bestIndex: null, confidence: "low", reason: "unidade incompatível (rejeitado pós-rerank)" };
      }
    }

    // Guarda de fixador: un↔un (ou qualquer unidade compatível) não basta —
    // um fixador metálico só pode casar com fator de metal. Pega o caso real
    // PARABOLT → "room-connecting overflow" que a checagem de unidade deixava
    // passar. Mantém o determinístico (bestIndex null) quando o LLM escorrega.
    if (
      FASTENER_ITEM_RE.test(norm(description)) &&
      !METAL_FACTOR_RE.test(norm(chosen.factor_name))
    ) {
      return {
        bestIndex: null,
        confidence: "low",
        reason: `fixador metálico não casa com "${chosen.factor_name}" (rejeitado pós-rerank)`,
      };
    }

    return { bestIndex: idx, confidence: parsed.confidence ?? "medium", reason: parsed.reason ?? "" };
  } catch (e) {
    console.warn(`[factor-reranker] falhou, mantendo match determinístico: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

/**
 * Entrada pública: memoiza a decisão do LLM por (modelo + descrição + unidade +
 * candidatos) para que re-subir o mesmo arquivo dê SEMPRE o mesmo resultado.
 * Cache miss cai no LLM e grava; qualquer falha de cache é transparente.
 */
export async function rerankWithClaude(
  description: string,
  unit: string | null | undefined,
  candidates: MatchCandidate[]
): Promise<RerankResult | null> {
  if (!isRerankerEnabled()) return null;
  if (!candidates || candidates.length === 0) return null;

  const pool = candidates.slice(0, MAX_CANDIDATES);
  const key = rerankCacheKey(MODEL, description, unit, pool);

  // Cache hit → escolha reproduzível, sem chamar o LLM.
  const cached = await getCachedRerank(key);
  if (cached) {
    if (cached.chosenSig === null) {
      return { bestIndex: null, confidence: cached.confidence, reason: cached.reason };
    }
    const idx = pool.findIndex((c) => candidateSig(c) === cached.chosenSig);
    if (idx >= 0) {
      return { bestIndex: idx, confidence: cached.confidence, reason: cached.reason };
    }
    // Assinatura ausente no pool atual (não deveria acontecer, pois a chave
    // inclui o conjunto de candidatos) → trata como miss.
  }

  const result = await callRerankLLM(description, unit, pool);
  if (result) {
    const chosenSig =
      result.bestIndex !== null ? candidateSig(pool[result.bestIndex]) : null;
    await putCachedRerank(key, {
      chosenSig,
      confidence: result.confidence,
      reason: result.reason,
    });
  }
  return result;
}
