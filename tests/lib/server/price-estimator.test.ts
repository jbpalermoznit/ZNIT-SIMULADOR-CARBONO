import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mockCreate };
  },
}));

import {
  estimateMarketPrice,
  isPriceEstimationEnabled,
} from "@/lib/server/factor-search/price-estimator";

// Resposta com busca web usada (grounding) + bloco JSON no texto.
function grounded(json: Record<string, unknown>) {
  return {
    stop_reason: "end_turn",
    content: [
      { type: "server_tool_use", name: "web_search", input: {} },
      { type: "web_search_tool_result", content: [] },
      { type: "text", text: `Com base na busca:\n${JSON.stringify(json)}` },
    ],
  };
}

// Resposta SEM busca web (sem grounding).
function ungrounded(json: Record<string, unknown>) {
  return {
    stop_reason: "end_turn",
    content: [{ type: "text", text: JSON.stringify(json) }],
  };
}

const OK = {
  price: 410,
  currency: "BRL",
  unit: "m3",
  source_name: "SINAPI SP",
  source_url: "https://www.caixa.gov.br/sinapi",
  as_of: "2026-05",
  confidence: "high",
};

beforeEach(() => {
  mockCreate.mockReset();
  process.env.PRICE_ESTIMATION_ENABLED = "true";
  process.env.ANTHROPIC_API_KEY = "test-key";
});

describe("isPriceEstimationEnabled", () => {
  it("false sem a flag", () => {
    process.env.PRICE_ESTIMATION_ENABLED = "false";
    expect(isPriceEstimationEnabled()).toBe(false);
  });
  it("false sem chave", () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(isPriceEstimationEnabled()).toBe(false);
  });
  it("true com ambos", () => {
    expect(isPriceEstimationEnabled()).toBe(true);
  });
});

describe("estimateMarketPrice", () => {
  it("retorna null quando desabilitado (sem chamada)", async () => {
    process.env.PRICE_ESTIMATION_ENABLED = "false";
    const r = await estimateMarketPrice({ materialDesc: "concreto fck 30", unit: "m3" });
    expect(r).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("estima quando grounded + com fonte", async () => {
    mockCreate.mockResolvedValue(grounded(OK));
    const r = await estimateMarketPrice({ materialDesc: "concreto usinado fck 30", unit: "m3", region: "SP" });
    expect(r).not.toBeNull();
    expect(r?.price).toBe(410);
    expect(r?.source_url).toContain("caixa");
    expect(r?.confidence).toBe("high");
  });

  it("retorna null se a busca web NÃO foi usada (grounded-ou-nada)", async () => {
    mockCreate.mockResolvedValue(ungrounded(OK));
    const r = await estimateMarketPrice({ materialDesc: "concreto fck 30", unit: "m3" });
    expect(r).toBeNull();
  });

  it("retorna null sem source_url", async () => {
    mockCreate.mockResolvedValue(grounded({ ...OK, source_url: null }));
    const r = await estimateMarketPrice({ materialDesc: "concreto fck 30", unit: "m3" });
    expect(r).toBeNull();
  });

  it("retorna null com price nulo/inválido", async () => {
    mockCreate.mockResolvedValue(grounded({ ...OK, price: null }));
    const r = await estimateMarketPrice({ materialDesc: "concreto fck 30", unit: "m3" });
    expect(r).toBeNull();
  });

  it("retorna null em erro do SDK (fail-safe)", async () => {
    mockCreate.mockRejectedValue(new Error("network"));
    const r = await estimateMarketPrice({ materialDesc: "concreto fck 30", unit: "m3" });
    expect(r).toBeNull();
  });

  it("normaliza confidence inválida para low", async () => {
    mockCreate.mockResolvedValue(grounded({ ...OK, confidence: "altíssima" }));
    const r = await estimateMarketPrice({ materialDesc: "concreto fck 30", unit: "m3" });
    expect(r?.confidence).toBe("low");
  });
});
