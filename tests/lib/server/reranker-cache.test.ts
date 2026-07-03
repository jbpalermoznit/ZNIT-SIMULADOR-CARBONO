import { describe, it, expect } from "vitest";
import { candidateSig, rerankCacheKey } from "@/lib/server/factor-search/reranker-cache";

// MatchCandidate parcial — só os campos que a assinatura/chave usam.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cand = (o: Record<string, unknown>): any => ({
  source_tier: "cecarbon", score: 90, factor_value: 100, factor_unit: "kgCO2e/t",
  product_unit: "t", factor_name: "X", factor_source: "s", geography: "BR", ...o,
});

const A = cand({ cecarbon_id: 1, factor_name: "Cimento", factor_value: 654 });
const B = cand({ cecarbon_id: 2, factor_name: "Aço", factor_value: 2100 });
const C = cand({ ghg_factor_id: 9, factor_name: "Diesel", factor_value: 3.1 });

describe("candidateSig", () => {
  it("usa o id da fonte quando presente", () => {
    expect(candidateSig(A)).toBe("cecarbon|1|654|kgCO2e/t");
  });
  it("cai no factor_name quando não há id", () => {
    const noId = cand({ factor_name: "Genérico", factor_value: 5 });
    expect(candidateSig(noId)).toBe("cecarbon|Genérico|5|kgCO2e/t");
  });
});

describe("rerankCacheKey — determinístico e reprodutível", () => {
  it("mesma entrada → mesma chave", () => {
    const k1 = rerankCacheKey("m", "CIMENTO PORTLAND", "kg", [A, B, C]);
    const k2 = rerankCacheKey("m", "CIMENTO PORTLAND", "kg", [A, B, C]);
    expect(k1).toBe(k2);
  });

  it("independe da ORDEM dos candidatos (pool ordenado internamente)", () => {
    const k1 = rerankCacheKey("m", "CIMENTO PORTLAND", "kg", [A, B, C]);
    const k2 = rerankCacheKey("m", "CIMENTO PORTLAND", "kg", [C, B, A]);
    expect(k1).toBe(k2);
  });

  it("normaliza descrição (acento/caixa/espaços)", () => {
    const k1 = rerankCacheKey("m", "CIMENTO PORTLAND", "kg", [A]);
    const k2 = rerankCacheKey("m", "  cimento  pórtland ", "kg", [A]);
    expect(k1).toBe(k2);
  });

  it("muda quando o modelo, a unidade ou o conjunto de candidatos muda", () => {
    const base = rerankCacheKey("m", "CIMENTO", "kg", [A, B]);
    expect(rerankCacheKey("modelo-2", "CIMENTO", "kg", [A, B])).not.toBe(base);
    expect(rerankCacheKey("m", "CIMENTO", "t", [A, B])).not.toBe(base);
    expect(rerankCacheKey("m", "CIMENTO", "kg", [A, C])).not.toBe(base);
  });
});
