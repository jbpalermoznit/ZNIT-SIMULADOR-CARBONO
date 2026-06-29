import { describe, expect, it } from "vitest";
import { classifyType } from "@/lib/server/parser";

// ===========================================================================
// classifyType — Tipo A-F a partir de CostCode + descrição + unidade.
// Foco: serviços de revestimento/aplicação caem em Tipo F e, portanto, ficam
// fora do loop de match de material (não recebem fator). Com a busca vetorial
// ligada, esses itens casavam fatores absurdos por similaridade
// ("PINTURA PROTETIVA" → "alkyd paint" → +1892t). Ver docs/PARIDADE_SIMULADOR.md.
// ===========================================================================

describe("classifyType — serviços de revestimento/aplicação → Tipo F", () => {
  it.each([
    "PINTURA PROTETIVA EPOXI",
    "PINTURA ANTICORROSIVA",
    "APLICACAO DE ENDURECEDOR DE SUPERFICIE",
    "APLICAÇÃO DE ARGAMASSA PROJETADA",
    "IMPERMEABILIZACAO DE LAJE",
    "IMPERMEABILIZAÇÃO COM MANTA ASFALTICA",
  ])("'%s' → F", (desc) => {
    const [type] = classifyType("420000", desc, "m2");
    expect(type).toBe("F");
  });
});

describe("classifyType — regressões (não reclassifica materiais/equipamentos)", () => {
  it("ANDAIME continua Tipo E (equipamento)", () => {
    const [type] = classifyType("440000", "ANDAIME TUBULAR", "m3");
    expect(type).toBe("E");
  });

  it("CONCRETO continua Tipo A (material direto)", () => {
    const [type] = classifyType("420000", "CONCRETO 40 MPA USINADO", "m3");
    expect(type).toBe("A");
  });

  it("ACO continua Tipo A (material direto)", () => {
    const [type] = classifyType("420000", "ACO CA-50 - BITOLA MEDIA", "kg");
    expect(type).toBe("A");
  });
});
