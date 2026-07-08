import { describe, expect, it } from "vitest";
import { computeCo2e, GWP_AR5 } from "@/lib/server/gwp";

// ===========================================================================
// gwp.ts — única fonte de verdade do CO₂e derivado (AR5).
// Pina os valores AR5 e o caso real do diesel: a linha "Óleo Diesel
// (comercial)" 2025 de fatores_ghg_dev deve reproduzir os 2,643 kgCO₂e/L
// que o caminho de equipamentos usa desde sempre.
// ===========================================================================

describe("GWP_AR5", () => {
  it("usa CH4=28 e N2O=265 (AR5 GWP-100)", () => {
    expect(GWP_AR5.CH4).toBe(28);
    expect(GWP_AR5.N2O).toBe(265);
  });
});

describe("computeCo2e", () => {
  it("reproduz ~2,643 kgCO₂e/L para o Óleo Diesel (comercial) 2025", () => {
    // Valores reais da linha id=976 de backend.fatores_ghg_dev.
    // O valor derivado exato é 2,64359 — o 2,643 que estava hardcoded no
    // caminho de equipamentos era este número truncado.
    const co2e = computeCo2e({
      co2: 2.603,
      ch4: 0.0001385311637,
      n2o: 0.0001385311637,
    });
    expect(co2e).toBeCloseTo(2.64359, 4);
  });

  it("aceita strings (Supabase devolve numeric como string)", () => {
    expect(computeCo2e({ co2: "1.0", ch4: "0.1", n2o: "0.01" })).toBeCloseTo(
      1 + 0.1 * 28 + 0.01 * 265,
      6
    );
  });

  it("trata null/undefined/NaN como 0", () => {
    expect(computeCo2e({ co2: null, ch4: undefined, n2o: "abc" })).toBe(0);
  });

  it("arredonda a 6 casas", () => {
    const v = computeCo2e({ co2: 0.1234567891, ch4: 0, n2o: 0 });
    expect(v).toBe(0.123457);
  });
});
