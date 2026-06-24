import { describe, expect, it } from "vitest";
import { geometricRecipe } from "@/lib/server/coverage-rules";

// ===========================================================================
// geometricRecipe — receitas de cobertura (PLANO §5)
// ===========================================================================
//
// Função pura. Deriva massa/volume para itens cuja unidade não converte
// direto para a do fator. Só dispara para descrições reconhecidas; null caso
// contrário (zero impacto no resto do pipeline).

describe("geometricRecipe — concreto por área → volume", () => {
  it("deriva m²→m³ pela espessura em cm da descrição", () => {
    const r = geometricRecipe("CONCRETO PARA PISO ACABADO 15CM", "m2");
    expect(r).not.toBeNull();
    expect(r?.baseUnit).toBe("m3");
    expect(r?.multiplier).toBeCloseTo(0.15, 6);
  });

  it("aceita espessura com vírgula e espaço (7,5 cm)", () => {
    const r = geometricRecipe("CONTRAPISO REGULARIZACAO 7,5 cm", "m2");
    expect(r?.multiplier).toBeCloseTo(0.075, 6);
  });

  it("retorna null se não houver espessura em cm", () => {
    expect(geometricRecipe("CONCRETO PARA PISO ACABADO", "m2")).toBeNull();
  });

  it("não dispara para concreto já em m³ (não precisa de receita)", () => {
    expect(geometricRecipe("CONCRETO USINADO 40MPA", "m3")).toBeNull();
  });

  it("não confunde resistência (40MPA) com espessura", () => {
    // 40MPA não tem 'cm' → sem espessura → null (não vira 0,40 m).
    expect(geometricRecipe("CONCRETO 40MPA PARA LAJE", "m2")).toBeNull();
  });
});

describe("geometricRecipe — madeira linear → massa", () => {
  it("deriva m→kg pela seção (cm) × densidade", () => {
    const r = geometricRecipe("PONTALETE 7,5X7,5", "m");
    expect(r?.baseUnit).toBe("kg");
    // 0,075 × 0,075 × 600 = 3,375 kg/m
    expect(r?.multiplier).toBeCloseTo(3.375, 4);
  });

  it("aceita seção com espaços e vírgula (2,5 x 10)", () => {
    const r = geometricRecipe("SARRAFO 2,5 x 10", "m");
    // 0,025 × 0,10 × 600 = 1,5 kg/m
    expect(r?.multiplier).toBeCloseTo(1.5, 4);
  });

  it("retorna null para madeira sem seção na descrição", () => {
    expect(geometricRecipe("SARRAFO DE MADEIRA", "m")).toBeNull();
  });
});

describe("geometricRecipe — sem aplicação", () => {
  it("retorna null para descrição/unidade não reconhecidas", () => {
    expect(geometricRecipe("ACO CA-50", "kg")).toBeNull();
    expect(geometricRecipe("TINTA ACRILICA", "L")).toBeNull();
    expect(geometricRecipe("", "m2")).toBeNull();
    expect(geometricRecipe(null, "m2")).toBeNull();
  });
});
