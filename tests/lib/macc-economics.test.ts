import { describe, it, expect } from "vitest";
import {
  abatementCostPerTco2e,
  costCategory,
  compareByAbatementCost,
} from "@/lib/macc-economics";

describe("abatementCostPerTco2e", () => {
  it("Δcusto / tCO₂e evitado", () => {
    expect(abatementCostPerTco2e(1000, 10)).toBe(100);
    expect(abatementCostPerTco2e(-1200, 10)).toBe(-120); // no-regret
  });
  it("null sem preço (custo a confirmar)", () => {
    expect(abatementCostPerTco2e(null, 10)).toBeNull();
    expect(abatementCostPerTco2e(undefined, 10)).toBeNull();
  });
  it("null quando não há redução (abatimento ≤ 0)", () => {
    expect(abatementCostPerTco2e(500, 0)).toBeNull();
    expect(abatementCostPerTco2e(500, -3)).toBeNull();
  });
});

describe("costCategory", () => {
  it("faixas e estados", () => {
    expect(costCategory(-10)).toBe("saving");
    expect(costCategory(0)).toBe("low");
    expect(costCategory(50)).toBe("low");
    expect(costCategory(120)).toBe("medium");
    expect(costCategory(200)).toBe("medium");
    expect(costCategory(201)).toBe("high");
    expect(costCategory(null)).toBe("unknown");
  });
});

describe("compareByAbatementCost (ranking)", () => {
  it("no-regret primeiro, unknown por último", () => {
    const rows = [
      { id: "caro", cost_per_tco2e: 180, abatement_tco2e: 5 },
      { id: "sem-preco", cost_per_tco2e: null, abatement_tco2e: 50 },
      { id: "no-regret", cost_per_tco2e: -90, abatement_tco2e: 3 },
      { id: "barato", cost_per_tco2e: 30, abatement_tco2e: 8 },
    ];
    const order = [...rows].sort(compareByAbatementCost).map((r) => r.id);
    expect(order).toEqual(["no-regret", "barato", "caro", "sem-preco"]);
  });

  it("empate de custo → maior abatimento primeiro", () => {
    const rows = [
      { id: "a", cost_per_tco2e: 50, abatement_tco2e: 2 },
      { id: "b", cost_per_tco2e: 50, abatement_tco2e: 9 },
    ];
    expect([...rows].sort(compareByAbatementCost).map((r) => r.id)).toEqual(["b", "a"]);
  });
});
