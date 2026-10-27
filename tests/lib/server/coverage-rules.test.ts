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

// ===========================================================================
// Acabamentos, esquadrias, vedações e louças — descrições reais (202607 RDL,
// 202608 InVino). Massa/volume da própria descrição quando houver.
// ===========================================================================

/** kg por unidade do item derivados da receita (volume × densidade quando m³). */
function kgPerUnit(desc: string, unit: string): number | null {
  const r = geometricRecipe(desc, unit);
  if (!r) return null;
  return r.baseUnit === "kg" ? r.multiplier : r.multiplier * (r.densityKgM3 ?? NaN);
}

describe("geometricRecipe — alvenaria de bloco (vazado)", () => {
  it("usa a espessura da descrição e a fração sólida do bloco de concreto", () => {
    // 0,14 × 0,45 × 2000 = 126 kg/m²
    expect(kgPerUnit("Execução de Alvenaria de Bloco 14cm", "m²")).toBeCloseTo(126, 4);
    expect(geometricRecipe("Execução de Alvenaria de Bloco 14cm", "m²")?.family).toBe("masonry_concrete");
  });

  it("bloco de concreto não vira concreto maciço (vence a regra de espessura)", () => {
    const r = geometricRecipe("Execução de Alvenaria de Bloco 15cm - Bloco de Concreto", "m²");
    expect(r?.family).toBe("masonry_concrete");
    expect(r?.multiplier).toBeCloseTo(0.15 * 0.45, 6);
  });

  it("distingue bloco cerâmico", () => {
    expect(geometricRecipe("ALVENARIA DE BLOCO CERAMICO 9CM", "m2")?.family).toBe("masonry_ceramic");
  });
});

describe("geometricRecipe — pedra", () => {
  it("piso de mármore sem espessura → 2cm", () => {
    expect(kgPerUnit("Piso a ser DEFINIDO  - Mármore Travertino Romado Levigado 02", "m²")).toBeCloseTo(54, 4);
  });

  it("ignora cota de elevação (H=20cm não é espessura)", () => {
    expect(kgPerUnit("Piso - Varanda PUC  - Pedra - ELEVADO H=20cm", "m²")).toBeCloseTo(54, 4);
  });

  it("fachada de pedra → 3cm", () => {
    expect(kgPerUnit("Revestimento de fachada com Pedra Natural", "m²")).toBeCloseTo(81, 4);
  });

  it("peças lineares: soleira 15cm, rodapé 10cm, degrau 30×3cm", () => {
    expect(kgPerUnit("Soleira em Granito yellow grumari levigado", "m")).toBeCloseTo(0.15 * 0.02 * 2700, 4);
    expect(kgPerUnit("Rodapé Mármore Travertino  Romado Levigado 02", "m")).toBeCloseTo(0.1 * 0.02 * 2700, 4);
    expect(kgPerUnit("Degraus Mármore Travertino  Romado Levigado 02", "m")).toBeCloseTo(0.3 * 0.03 * 2700, 4);
  });

  it("bancada por unidade usa as dimensões da descrição", () => {
    expect(kgPerUnit("BA04 - Bancada em granito branco para receber 01 cuba - 1,10x0,60m", "unid.")).toBeCloseTo(1.1 * 0.6 * 0.02 * 2700, 4);
  });
});

describe("geometricRecipe — revestimento cerâmico / porcelanato", () => {
  it("porcelanato sem espessura → 10 mm; cerâmica → 8 mm", () => {
    expect(kgPerUnit("Porcelanato Portobelo Via Durini Off White 90x90 Natural Retificado", "m²")).toBeCloseTo(23, 4);
    expect(kgPerUnit("Piso cerâmico - Portaria corporativo", "m²")).toBeCloseTo(18.4, 4);
  });

  it("rodapé linear de porcelanato (h=10cm padrão)", () => {
    expect(kgPerUnit("Rodapé Portobello Via Durini Fog 90x90 Natural Retificado (EXT)", "m")).toBeCloseTo(0.1 * 0.01 * 2300, 4);
  });
});

describe("geometricRecipe — argamassas", () => {
  it("espessura padrão por serviço", () => {
    expect(kgPerUnit("Emboço - Massa Única", "m²")).toBeCloseTo(50, 4);
    expect(kgPerUnit("Chapisco", "m²")).toBeCloseTo(10, 4);
    expect(kgPerUnit("Proteção mecânica com argamassa de cimento/areia 1:4", "m²")).toBeCloseTo(60, 4);
  });

  it("primeiro termo decide: contrapiso para pisos cerâmicos é argamassa", () => {
    const r = geometricRecipe("Contrapiso de regularização para pisos cerâmicos", "m²");
    expect(r?.family).toBe("mortar");
    expect(r?.multiplier).toBeCloseTo(0.04, 6);
  });

  it("consumo explícito de argamassa polimérica (kg/m²)", () => {
    const r = geometricRecipe("WC -  Argamassa Polimérica flexível com fibras 3,6 kg/m²", "m²");
    expect(r?.family).toBe("polymer_mortar");
    expect(r?.multiplier).toBeCloseTo(3.6, 6);
  });
});

describe("geometricRecipe — vidro", () => {
  it("espessura da descrição (L=8mm) e laminado (10+10)", () => {
    expect(kgPerUnit("Vidro G31 ou similar - L=8mm", "m²")).toBeCloseTo(20, 4);
    expect(kgPerUnit("Guarda-corpo com perfis e vidro L8m - Temperado Laminado 10+10", "m²")).toBeCloseTo(50, 4);
  });

  it("peça por unidade usa área declarada ou dimensões", () => {
    expect(kgPerUnit("COB.01 - Cobertura do Átrio c/ cobertura de vidro - Área 86m² - ver imagem", "unid.")).toBeCloseTo(86 * 0.016 * 2500, 3);
    expect(kgPerUnit("Espelho - 0,60x0,90m", "unid.")).toBeCloseTo(0.54 * 0.008 * 2500, 4);
  });

  it("guarda-corpo linear usa a altura (H=1,10m)", () => {
    expect(kgPerUnit("Guarda corpo de vidro encaixilhado - H=1,10m", "m")).toBeCloseTo(1.1 * 0.016 * 2500, 4);
  });

  it("requadro de cobertura com vidro é esquadria de alumínio, não vidro", () => {
    expect(geometricRecipe("COB02 - Requadro Cobertura c/ Vidro - Restaurantes / Flat - 33,8x3,2m", "unid.")?.family).toBe("aluminium_frame");
  });
});

describe("geometricRecipe — esquadrias e portas por vão", () => {
  it("código AL do quadro de esquadrias → alumínio por m² de vão", () => {
    expect(kgPerUnit("AL01 - PORTA CORRER - SALA COMERCIAL - 29,71x2,6m", "unid.")).toBeCloseTo(29.71 * 2.6 * 8, 3);
    expect(kgPerUnit("BR04 - BRISE - POSTERIOR - CONDENSADORA - 9,03x3,24m", "unid.")).toBeCloseTo(9.03 * 3.24 * 10, 3);
  });

  it("porta de madeira (PM) e corta-fogo (PCF)", () => {
    expect(geometricRecipe("PM03 (0,82x2,10) c/ Veneziana 15x20cm - Banho PNE - Tipo", "unid.")?.family).toBe("wood_door");
    expect(kgPerUnit("PM03 (0,82x2,10) c/ Veneziana 15x20cm - Banho PNE - Tipo", "unid.")).toBeCloseTo(0.82 * 2.1 * 15, 4);
    expect(kgPerUnit("PCF 1 - (0,90 x 2,16)", "unid.")).toBeCloseTo(0.9 * 2.16 * 35, 4);
  });

  it("pele de vidro por m² → alumínio 10 kg/m²", () => {
    expect(kgPerUnit("Caixilho de alumínio sistema pele de vidro", "m²")).toBe(10);
  });

  it("sem dimensões não chuta", () => {
    expect(geometricRecipe("Batente para elevador", "unid.")).toBeNull();
  });
});

describe("geometricRecipe — gesso acartonado, steel deck, tinta, manta", () => {
  it("conta as placas do código da parede", () => {
    expect(kgPerUnit("DW-01 - 2ST / 90 / SLM / 2ST (60 MS) - 14cm", "m²")).toBeCloseTo(4 * 8.5, 4);
    expect(kgPerUnit("DW-02 - 1RU + 1ST / 90 / SLM / 2ST (60 MS) - 14cm", "m²")).toBeCloseTo(4 * 8.5, 4);
    expect(kgPerUnit("Entre lojas - ST/90/ST - ESTIMADO", "m²")).toBeCloseTo(2 * 8.5, 4);
    expect(kgPerUnit("Forro em gesso acartonado tipo ST standard", "m²")).toBeCloseTo(8.5, 4);
    expect(kgPerUnit("Drywall Shafts – Wall Lining – Plasterboard 12mm no finish", "m2")).toBeCloseTo(8.5, 4);
  });

  it("steel deck por m²", () => {
    expect(kgPerUnit("Steel Deck", "m²")).toBe(10);
  });

  it("primeiro termo decide: pintura sobre drywall é tinta", () => {
    expect(geometricRecipe("Pintura Acrílica sobre Gesso/Drywall", "m²")?.family).toBe("paint");
    expect(kgPerUnit("Textura Rolada Branco Neve", "m²")).toBe(1.5);
  });

  it("manta asfáltica: mm da descrição; dupla = 2 camadas", () => {
    expect(kgPerUnit("Terraço Descoberto - Manta 4mm Tipo III, B, AA", "m²")).toBeCloseTo(4.6, 4);
    expect(kgPerUnit("Impermeabilização de Cobertura Verde - Manta dupla", "m²")).toBeCloseTo(9.2, 4);
  });
});

describe("geometricRecipe — intertravado, louças, corrimão, forma de chapa", () => {
  it("intertravado pela espessura (h- 8cm não é cota h=)", () => {
    expect(kgPerUnit("Pavimento Intertravado h- 8cm", "m²")).toBeCloseTo(0.08 * 2300, 4);
  });

  it("louça por peça; cuba inox fica de fora", () => {
    expect(kgPerUnit("Bacia com caixa acoplada - DECA  Vogue Plus P.505.17", "unid.")).toBe(30);
    expect(kgPerUnit("Lavatório sem coluna - IZY L.915.17", "unid.")).toBe(12);
    expect(geometricRecipe("Cuba Simples de Inox Strake 56x34cm Ref. 302", "unid.")).toBeNull();
  });

  it("corrimão duplo = 2 tubos", () => {
    expect(kgPerUnit("CRF 1  - Corrimão Duplo -  Escadaria Comercial 1.1/5\"", "m")).toBe(6);
  });

  it("forma em chapa amortizada", () => {
    expect(geometricRecipe("Forma em chapa para viga coroamento - Novos", "m²")?.multiplier).toBeCloseTo(0.018 / 4, 6);
  });
});

describe("geometricRecipe — falsos amigos", () => {
  it("lã de vidro não é vidro; manta geotêxtil não é manta asfáltica", () => {
    expect(geometricRecipe("LÃ DE VIDRO (Vedação Interna) – EPD WALLFELT POP 4+", "m2")).toBeNull();
    expect(geometricRecipe("MANTA GEOTEXTIL TIPO BIDIN 200G/M2", "m2")).toBeNull();
  });

  it("laje com enchimento de lajota cerâmica não é revestimento", () => {
    expect(geometricRecipe("LAJE PRÉ-MOLDADA UNIDIRECIONAL, ENCHIMENTO EM LAJOTA CERÂMICA", "m2")).toBeNull();
  });

  it("porta de alumínio com vidro é esquadria de alumínio", () => {
    expect(geometricRecipe("PORTA DUPLA DE ALUMINIO COM VIDRO LAMINADO 6 MM", "m2")?.family).toBe("aluminium_frame");
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
