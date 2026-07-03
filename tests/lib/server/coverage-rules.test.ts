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

  it("concreto em m³ retorna receita de densidade (só aplicada p/ fator por massa)", () => {
    // A receita existe, mas resolveConversion só a consulta quando a conversão
    // direta m³ falha (fator por massa). Para fator por m³, a direta vence.
    const r = geometricRecipe("CONCRETO USINADO 40MPA", "m3");
    expect(r?.baseUnit).toBe("kg");
    expect(r?.multiplier).toBe(2400);
  });

  it("não confunde resistência (40MPA) com espessura", () => {
    // 40MPA não tem 'cm' → sem espessura → null (não vira 0,40 m).
    expect(geometricRecipe("CONCRETO 40MPA PARA LAJE", "m2")).toBeNull();
  });

  it("deriva m²→m³ para taipa pela espessura (ESP 2,5CM)", () => {
    const r = geometricRecipe("TAIPA ESP 2,5CM X LARGURA", "m2");
    expect(r?.baseUnit).toBe("m3");
    expect(r?.multiplier).toBeCloseTo(0.025, 6);
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

describe("geometricRecipe — ferro fundido por área → massa", () => {
  it("deriva m²→kg para tampa de canaleta em ferro fundido", () => {
    const r = geometricRecipe("TAMPA DE CANALETA EM FERRO FUNDIDO", "m2");
    expect(r?.baseUnit).toBe("kg");
    expect(r?.multiplier).toBe(85); // CAST_IRON_AREAL_MASS_KG_M2
  });

  it("aceita o sinônimo 'fofo'", () => {
    expect(geometricRecipe("GRELHA FOFO", "m2")?.baseUnit).toBe("kg");
  });

  it("não dispara fora de m²", () => {
    expect(geometricRecipe("TAMPA EM FERRO FUNDIDO", "un")).toBeNull();
  });
});

describe("geometricRecipe — forma metálica amortizada", () => {
  it("deriva m²→kg de aço dividido pelas reutilizações", () => {
    const r = geometricRecipe("FORMA METALICA QUICKJET", "m2");
    expect(r?.baseUnit).toBe("kg");
    // 40 kg/m² ÷ 50 usos = 0,8 kg/m²
    expect(r?.multiplier).toBeCloseTo(0.8, 6);
  });

  it("casa 'painel metalico' e 'quickjet'", () => {
    expect(geometricRecipe("PAINEL METALICO DE FORMA", "m2")).not.toBeNull();
    expect(geometricRecipe("QUICKJET", "m2")).not.toBeNull();
  });

  it("não confunde forma de madeira/comum", () => {
    expect(geometricRecipe("FORMA DE MADEIRA PARA VIGA", "m2")).toBeNull();
  });
});

describe("geometricRecipe — concreto/pré-moldado por volume → massa", () => {
  it("deriva m³→kg para estrutura pré-moldada (densidade do concreto)", () => {
    const r = geometricRecipe("ESTRUTURA PRE-MOLDADA", "m³");
    expect(r?.baseUnit).toBe("kg");
    expect(r?.multiplier).toBe(2400); // CONCRETE_DENSITY_KG_M3
  });

  it("casa 'concreto' e variações de pré-moldado", () => {
    expect(geometricRecipe("CONCRETO ESTRUTURAL", "m3")?.multiplier).toBe(2400);
    expect(geometricRecipe("VIGA PREMOLDADA", "m3")?.multiplier).toBe(2400);
    expect(geometricRecipe("PILAR PRE MOLDADO", "m3")?.multiplier).toBe(2400);
  });

  it("não dispara fora de m³ (m² já tem regra de espessura própria)", () => {
    expect(geometricRecipe("ESTRUTURA PRE-MOLDADA", "m2")).toBeNull();
  });

  it("não dispara para outros materiais em m³ (escavação, areia)", () => {
    expect(geometricRecipe("ESCAVACAO MECANIZADA", "m3")).toBeNull();
    expect(geometricRecipe("AREIA MEDIA LAVADA", "m3")).toBeNull();
  });
});

describe("geometricRecipe — saco (sc) → massa", () => {
  it("usa a massa da descrição (EMB 50KG)", () => {
    const r = geometricRecipe("CIMENTO PORTLAND (EMB 50KG)", "sc");
    expect(r?.baseUnit).toBe("kg");
    expect(r?.multiplier).toBe(50);
  });

  it("respeita massa diferente na descrição (25 KG)", () => {
    expect(geometricRecipe("ARGAMASSA COLANTE SACO 25 KG", "sc")?.multiplier).toBe(25);
  });

  it("cai no saco-padrão 50kg para cimento sem massa explícita", () => {
    expect(geometricRecipe("CIMENTO PORTLAND CP-II", "sc")?.multiplier).toBe(50);
  });

  it("retorna null para sc não-cimento sem massa na descrição (não chuta)", () => {
    expect(geometricRecipe("ADITIVO EM SACO", "sc")).toBeNull();
  });
});

describe("geometricRecipe — peça (pç) de tubo → metros", () => {
  it("deriva pç→m pelo comprimento na descrição (6M)", () => {
    const r = geometricRecipe("TUBO DE PVC RIGIDO SOLDAVEL 20MM (6M)", "PC");
    expect(r?.baseUnit).toBe("m");
    expect(r?.multiplier).toBe(6);
  });

  it("aceita variações de unidade peça (pç, peca)", () => {
    expect(geometricRecipe("TUBO PVC ESGOTO 100MM (6M)", "pç")?.multiplier).toBe(6);
    expect(geometricRecipe("CANO PVC (0,5M)", "peca")?.baseUnit).toBe("m");
  });

  it("não dispara sem comprimento explícito (conexão/curva)", () => {
    expect(geometricRecipe("CURVA 90 LONGA DE PVC ESGOTO 100MM", "PC")).toBeNull();
  });

  it("não dispara fora de tubo/cano", () => {
    expect(geometricRecipe("PARAFUSO SEXTAVADO (6M)", "PC")).toBeNull();
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
