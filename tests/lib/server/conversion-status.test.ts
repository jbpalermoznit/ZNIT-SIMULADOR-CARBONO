import { describe, expect, it } from "vitest";
import { getConversionStatus } from "@/lib/server/calculator";

// ===========================================================================
// getConversionStatus — mesmo número que resolveConversion, mas com o COMO:
// "assumed" (1.0 permissivo, sem validação dimensional) e "incompatible"
// (contribuição 0) deixam de ser indistinguíveis de conversões reais.
// ===========================================================================

describe("getConversionStatus", () => {
  it("exact: unidades iguais → fator 1, status exact", () => {
    const r = getConversionStatus("AÇO CA-50", "kg", "kgCO₂/kg");
    expect(r).toEqual({ factor: 1.0, status: "exact" });
  });

  it("converted: mesma família com escala (t → kg)", () => {
    const r = getConversionStatus("AÇO CA-50", "t", "kgCO₂/kg");
    expect(r.status).toBe("converted");
    expect(r.factor).toBe(1000);
  });

  it("recipe: cross-family resolvida por receita geométrica (m² piso → m³)", () => {
    const r = getConversionStatus("CONCRETO PARA PISO 15CM", "m2", "kgCO2e/m3");
    expect(r.status).toBe("recipe");
    expect(r.factor).toBeCloseTo(0.15, 6);
  });

  it("assumed: unidade do item desconhecida → 1.0 permissivo, flagrado", () => {
    const r = getConversionStatus("ITEM SEM UNIDADE", "", "kgCO₂/kg");
    expect(r).toEqual({ factor: 1.0, status: "assumed" });
  });

  it("incompatible: cross-family sem receita → 0", () => {
    const r = getConversionStatus("CANTONEIRA DE ACO", "un", "kg CO2-Eq");
    expect(r.status).toBe("incompatible");
    expect(r.factor).toBe(0);
  });
});
