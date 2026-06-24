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
  baseUnit: "kg" | "m3";
  /** Multiplicador: qty_item (na unidade do item) × multiplier = qty em baseUnit. */
  multiplier: number;
  /** Explicação curta da derivação (auditoria/log). */
  note: string;
}

// Densidade de madeira serrada de construção (pinus/eucalipto). Padrão de
// primeira-passada — varia ~500 (pinus) a ~700 (eucalipto). Revisar.
const WOOD_DENSITY_KG_M3 = 600;

// Normalização mínima de unidade (local, para não acoplar ao calculator).
function normUnit(u: string | null | undefined): string {
  if (!u) return "";
  const s = u.toLowerCase().trim();
  if (s === "m²" || s === "m2") return "m2";
  if (s === "m³" || s === "m3") return "m3";
  if (s === "ml" || s === "m") return "m";
  return s;
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

  // --- Concreto medido por área → volume (espessura da descrição) -----------
  // "CONCRETO PARA PISO ... 15CM", contrapiso, lastro, regularização.
  if (
    u === "m2" &&
    /\b(concreto|contrapiso|lastro|regulariza|sub-?base|enchimento)\b/.test(d)
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

  // TODO (precisa de constante de produto — revisar como Fase 0):
  //  - TAMPA DE CANALETA EM FERRO FUNDIDO (m²) → massa/m² do ferro fundido.
  //  - FORMA METÁLICA QUICKJET (m²) → massa de aço/m² ÷ nº de reutilizações
  //    (emissão amortizada). Depende de política de amortização do produto.
  // Mecanismo pronto; basta adicionar a regra com o valor validado.

  return null;
}
