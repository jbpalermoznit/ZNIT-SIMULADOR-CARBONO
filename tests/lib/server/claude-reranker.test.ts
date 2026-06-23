import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Anthropic SDK so no network call happens.
const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mockCreate };
  },
}));

// calculator imports supabase at module load → stub it so the import chain
// doesn't throw without env. getConversionFactor itself stays real.
vi.mock("@/lib/server/supabase", () => ({ supabase: {}, supabaseEmission: {} }));

import {
  rerankWithClaude,
  isRerankerEnabled,
} from "@/lib/server/factor-search/claude-reranker";
import type { MatchCandidate } from "@/lib/server/emission-mapper";

function cand(partial: Partial<MatchCandidate>): MatchCandidate {
  return {
    source_tier: "cecarbon",
    score: 80,
    factor_value: 1.9,
    factor_unit: "kgCO₂/t",
    product_unit: "t",
    factor_name: "aço",
    factor_source: "CECARBON 2024",
    geography: "Brasil",
    ...partial,
  };
}

function reply(obj: Record<string, unknown>) {
  return {
    stop_reason: "end_turn",
    content: [{ type: "text", text: JSON.stringify(obj) }],
  };
}

beforeEach(() => {
  mockCreate.mockReset();
  process.env.FACTOR_RERANKER_ENABLED = "true";
  process.env.ANTHROPIC_API_KEY = "test-key";
});

describe("isRerankerEnabled", () => {
  it("is false without the flag", () => {
    process.env.FACTOR_RERANKER_ENABLED = "false";
    expect(isRerankerEnabled()).toBe(false);
  });
  it("is false without an API key", () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(isRerankerEnabled()).toBe(false);
  });
  it("is true with both", () => {
    expect(isRerankerEnabled()).toBe(true);
  });
});

describe("rerankWithClaude", () => {
  it("returns null when disabled (no network call)", async () => {
    process.env.FACTOR_RERANKER_ENABLED = "false";
    const r = await rerankWithClaude("ACO CA-50", "kg", [cand({})]);
    expect(r).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns null with no candidates", async () => {
    const r = await rerankWithClaude("ACO CA-50", "kg", []);
    expect(r).toBeNull();
  });

  it("picks the chosen index when unit is compatible", async () => {
    mockCreate.mockResolvedValue(reply({ best_index: 1, confidence: "high", reason: "aço" }));
    const cands = [
      cand({ factor_name: "tinta", factor_unit: "kgCO₂/kg", product_unit: "kg" }),
      cand({ factor_name: "aço", factor_unit: "kgCO₂/t", product_unit: "t" }),
    ];
    const r = await rerankWithClaude("ACO CA-50 - BITOLA MEDIA", "kg", cands);
    expect(r?.bestIndex).toBe(1);
    expect(r?.confidence).toBe("high");
  });

  it("returns null bestIndex when the model says none (-1)", async () => {
    mockCreate.mockResolvedValue(reply({ best_index: -1, confidence: "low", reason: "nenhum" }));
    const r = await rerankWithClaude("ITEM DESCONHECIDO", "kg", [cand({})]);
    expect(r?.bestIndex).toBeNull();
  });

  it("rejects an LLM pick whose unit is incompatible (post-rerank guard)", async () => {
    // Item em 'un', fator de aço por 'kg' → conversão 0 → rejeitado.
    mockCreate.mockResolvedValue(reply({ best_index: 0, confidence: "high", reason: "x" }));
    const cands = [cand({ factor_unit: "kgCO₂/kg", product_unit: "kg" })];
    const r = await rerankWithClaude("PARAFUSO", "un", cands);
    expect(r?.bestIndex).toBeNull();
  });

  it("returns null on a model refusal", async () => {
    mockCreate.mockResolvedValue({ stop_reason: "refusal", content: [] });
    const r = await rerankWithClaude("ACO CA-50", "kg", [cand({})]);
    expect(r).toBeNull();
  });

  it("returns null on any SDK error (keeps deterministic match)", async () => {
    mockCreate.mockRejectedValue(new Error("network"));
    const r = await rerankWithClaude("ACO CA-50", "kg", [cand({})]);
    expect(r).toBeNull();
  });
});
