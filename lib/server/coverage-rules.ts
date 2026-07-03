/**
 * Receitas de cobertura — conversões geométricas / por densidade.
 *
 * Problema (PLANO_CONTINUACAO §5): alguns itens são medidos numa unidade que
 * NÃO converte diretamente para a unidade do fator de emissão — concreto de
 * piso em m² mas fator por m³; pontalete em m mas fator por t. O
 * `getConversionFactor` devolve 0 para esses pares cross-family e o item acaba
 * emitindo 0, subestimando o cenário.
 *
 * Isto NÃO é match: o fator correto já foi escolhido. Aqui derivamos QUANTO
 * material (massa ou volume) o item representa, para o fator poder ser
 * aplicado. A receita converte a quantidade do item para uma unidade-base
 * física (`kg` ou `m3`); o chamador (`resolveConversion` no calculator)
 * compõe com `getConversionFactor` para chegar à unidade exata do fator.
 *
 * Filosofia (igual à Fase 0 do plano — "revisar valores antes"):
 *  - Só dispara para descrições reconhecidas; caso contrário retorna null e
 *    NADA muda no resto do pipeline.
 *  - Onde possível, o número vem da PRÓPRIA descrição (espessura "15CM",
 *    seção "7,5x7,5") — não de palpite.
 *  - Constantes físicas (densidades) são padrões documentados e devem ser
 *    revistas antes de confiar no total absoluto.
 */

export interface GeometricRecipe {
  /** Unidade-base física para a qual a quantidade do item é convertida. */
  baseUnit: "kg" | "m3" | "m";
  /** Multiplicador: qty_item (na unidade do item) × multiplier = qty em baseUnit. */
  multiplier: number;
  /** Explicação curta da derivação (auditoria/log). */
  note: string;
}

// Densidade de madeira serrada de construção (pinus/eucalipto). Padrão de
// primeira-passada — varia ~500 (pinus) a ~700 (eucalipto). Revisar.
const WOOD_DENSITY_KG_M3 = 600;

// Densidade de concreto (estrutural/pré-moldado) para converter itens medidos
// em m³ que casaram um fator por massa (kgCO₂/t ou /kg). Concreto simples
// ~2400, armado ~2500 kg/m³; usamos 2400 (conservador). Revisar. Premissa: o
// fator casado é de concreto/massa — se um fator de aço for casado por engano,
// revisar (mesma filosofia das demais densidades deste módulo).
const CONCRETE_DENSITY_KG_M3 = 2400;

// Massa padrão do saco de cimento Portland no Brasil (NBR) = 50 kg. Usada
// quando o item está em "sc" e a descrição não traz a massa explícita.
const CEMENT_BAG_KG = 50;

// ⚠️ CONSTANTES DE PRODUTO — primeira-passada, REVISAR antes de confiar no
// total (igual à Fase 0). Valores típicos de mercado; ajuste com a ficha real.

// Massa por m² de tampa/grelha de canaleta em ferro fundido (uso leve/médio).
// Faixa real ~50–120 kg/m² conforme classe (B125/C250). Densidade do FoFo é
// ~7200 kg/m³, mas a peça é vazada (grelha), então a massa areal << placa cheia.
const CAST_IRON_AREAL_MASS_KG_M2 = 85;

// Forma metálica (ex.: QUICKJET): massa de aço por m² do painel. ~30–50 kg/m².
const STEEL_FORM_AREAL_MASS_KG_M2 = 40;
// Reutilizações da forma — a emissão embutida do aço é AMORTIZADA pelo nº de
// usos (a forma serve N vezes). Vida típica de forma metálica ~50–200 usos;
// 50 é conservador (mais emissão/uso). Política de produto — revisar.
const STEEL_FORM_REUSES = 50;

// Normalização mínima de unidade (local, para não acoplar ao calculator).
function normUnit(u: string | null | undefined): string {
  if (!u) return "";
  const s = u.toLowerCase().trim();
  if (s === "m²" || s === "m2") return "m2";
  if (s === "m³" || s === "m3") return "m3";
  if (s === "ml" || s === "m") return "m";
  if (s === "pç" || s === "pc" || s === "pca" || s === "peca" || s === "peça") return "pc";
  return s;
}

/** Comprimento em metros a partir de "(6M)", "(6 M)", "(0,5M)". Null se ausente. */
function parseParenLengthM(desc: string): number | null {
  const m = desc.match(/\((\d+(?:[.,]\d+)?)\s*m\)/i);
  if (!m) return null;
  const len = parseFloat(m[1].replace(",", "."));
  if (!Number.isFinite(len) || len <= 0) return null;
  return len;
}

// Remove acento e baixa caixa para casar descrições do iTwo (CAIXA ALTA, sem acento).
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Espessura em metros a partir de "15CM", "10 cm", "7,5cm". Null se ausente. */
function parseThicknessM(desc: string): number | null {
  const m = desc.match(/(\d+(?:[.,]\d+)?)\s*cm\b/i);
  if (!m) return null;
  const cm = parseFloat(m[1].replace(",", "."));
  if (!Number.isFinite(cm) || cm <= 0) return null;
  return cm / 100;
}

/** Massa do saco (kg) a partir de "EMB 50KG", "50 KG", "SACO 25KG". Null se ausente. */
function parseBagMassKg(desc: string): number | null {
  const m = desc.match(/(\d+(?:[.,]\d+)?)\s*kg\b/i);
  if (!m) return null;
  const kg = parseFloat(m[1].replace(",", "."));
  if (!Number.isFinite(kg) || kg <= 0) return null;
  return kg;
}

/** Área de seção (m²) a partir de "7,5x7,5", "2,5 X 10", "5x10cm". Null se ausente. */
function parseSectionAreaM2(desc: string): number | null {
  const m = desc.match(/(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)/i);
  if (!m) return null;
  const a = parseFloat(m[1].replace(",", "."));
  const b = parseFloat(m[2].replace(",", "."));
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return null;
  // Seções de madeira de obra são dadas em cm.
  return (a / 100) * (b / 100);
}

/**
 * Deriva a receita geométrica para um item, ou null se nenhuma se aplica.
 * `itemUnit` é a unidade do item no orçamento (m², m, ...).
 */
export function geometricRecipe(
  description: string | null | undefined,
  itemUnit: string | null | undefined
): GeometricRecipe | null {
  if (!description) return null;
  const d = norm(description);
  const u = normUnit(itemUnit);

  // --- Material medido por área → volume (espessura da descrição) -----------
  // "CONCRETO PARA PISO ... 15CM", contrapiso, lastro, regularização, e camadas
  // como taipa ("TAIPA ESP 2,5CM") cujo fator é por m³ — sem isto o par m²↔m³
  // é cross-family e zera.
  if (
    u === "m2" &&
    /\b(concreto|contrapiso|lastro|regulariza|sub-?base|enchimento|taipa)\b/.test(d)
  ) {
    const thickness = parseThicknessM(d);
    if (thickness) {
      return {
        baseUnit: "m3",
        multiplier: thickness,
        note: `área × espessura ${thickness * 100}cm = m³`,
      };
    }
  }

  // --- Madeira linear → massa (seção da descrição × densidade) --------------
  // Pontalete, sarrafo, ripa, caibro, tábua, prancha medidos em metro linear.
  if (
    u === "m" &&
    /\b(pontalete|sarrafo|ripa|caibro|tabua|prancha|gravata|escora)\b/.test(d)
  ) {
    const sectionM2 = parseSectionAreaM2(d);
    if (sectionM2) {
      const kgPerM = sectionM2 * WOOD_DENSITY_KG_M3;
      return {
        baseUnit: "kg",
        multiplier: kgPerM,
        note: `seção ${(sectionM2 * 1e4).toFixed(1)}cm² × ${WOOD_DENSITY_KG_M3}kg/m³ = ${kgPerM.toFixed(3)}kg/m`,
      };
    }
  }

  // --- Ferro fundido por área → massa (tampa/grelha de canaleta) ------------
  // "TAMPA DE CANALETA EM FERRO FUNDIDO" (m²) — fator do FoFo é por kg.
  if (u === "m2" && /\b(ferro fundido|fofo)\b/.test(d)) {
    return {
      baseUnit: "kg",
      multiplier: CAST_IRON_AREAL_MASS_KG_M2,
      note: `tampa FoFo: ${CAST_IRON_AREAL_MASS_KG_M2} kg/m² (revisar)`,
    };
  }

  // --- Forma metálica por área → massa de aço AMORTIZADA --------------------
  // "FORMA METALICA QUICKJET" (m²): a forma é reutilizável; a emissão do aço
  // é dividida pelo nº de usos. Fator do aço é por kg.
  if (
    u === "m2" &&
    /\b(forma metalica|forma de aco|quickjet|escoramento metalico|painel metalico)\b/.test(d)
  ) {
    const kgPerM2 = STEEL_FORM_AREAL_MASS_KG_M2 / STEEL_FORM_REUSES;
    return {
      baseUnit: "kg",
      multiplier: kgPerM2,
      note: `forma de aço amortizada: ${STEEL_FORM_AREAL_MASS_KG_M2} kg/m² ÷ ${STEEL_FORM_REUSES} usos = ${kgPerM2.toFixed(3)} kg/m² (revisar)`,
    };
  }

  // --- Concreto/pré-moldado por VOLUME → massa (densidade) -------------------
  // Item em m³ que casou um fator por massa (kgCO₂/t ou /kg) — ex.: "ESTRUTURA
  // PRE-MOLDADA" 301 m³ contra fator por tonelada. Sem isto o par m³↔t é
  // cross-family e zera. Só dispara para concreto/pré-moldado (premissa: o
  // material é concreto). Itens já em m³ com fator por m³ não chegam aqui
  // (getConversionFactor direto já devolve 1 — recipe não é chamada).
  if (u === "m3" && /\bconcreto\b|pre[\s-]?moldad/.test(d)) {
    return {
      baseUnit: "kg",
      multiplier: CONCRETE_DENSITY_KG_M3,
      note: `concreto: ${CONCRETE_DENSITY_KG_M3} kg/m³ (revisar)`,
    };
  }

  // --- Peça (pç) de tubo/cano com comprimento → metros ----------------------
  // Tubos/canos vendidos por PEÇA mas com o comprimento explícito na descrição
  // ("TUBO DE PVC 20MM (6M)") e fator por metro (kgCO₂/m). Sem isto o par pç↔m
  // é cross-family e zera. Só dispara com o comprimento explícito — não chuta
  // conexões (curva, joelho, luva) nem barras sem medida.
  if (u === "pc" && /\b(tubo|cano|eletroduto|pbv)\b/.test(d)) {
    const lengthM = parseParenLengthM(d);
    if (lengthM) {
      return {
        baseUnit: "m",
        multiplier: lengthM,
        note: `peça = ${lengthM} m (comprimento da descrição)`,
      };
    }
  }

  // --- Saco (sc) → massa -----------------------------------------------------
  // Cimento/argamassa/cal em "sc" contra fator por massa. A massa vem da
  // descrição ("EMB 50KG"); se ausente e for cimento, usa o saco-padrão 50kg.
  if (u === "sc") {
    const kg = parseBagMassKg(d) ?? (/\bcimento\b/.test(d) ? CEMENT_BAG_KG : null);
    if (kg) {
      return {
        baseUnit: "kg",
        multiplier: kg,
        note: `saco = ${kg} kg`,
      };
    }
  }

  return null;
}
