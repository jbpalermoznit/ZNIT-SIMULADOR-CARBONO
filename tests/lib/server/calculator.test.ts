import { describe, expect, it } from "vitest";
import {
  normalizeUnit,
  getConversionFactor,
  resolveConversion,
} from "@/lib/server/calculator";

// ===========================================================================
// normalizeUnit
// ===========================================================================
//
// The normalizer is a tiny lookup but the calls happen on EVERY emission
// calculation. Pin the most-used shapes — Portuguese aliases, the kgCO₂/
// denominator stripping, casing, trim.

describe("normalizeUnit", () => {
  it.each([
    ["", "", "empty"],
    [null, "", "null guard"],
    [undefined, "", "undefined guard"],
    ["kg", "kg", "passthrough"],
    ["KG", "kg", "uppercase normalised"],
    ["  kg  ", "kg", "trims whitespace"],
    ["m³", "m3", "alias m³ → m3"],
    ["m²", "m2", "alias m² → m2"],
    ["litro", "L", "alias litro → L"],
    ["t", "t", "tonne passthrough"],
    ["un", "un", "count passthrough"],
    ["pç", "un", "alias pç → un"],
    ["unidade", "un", "alias unidade → un"],
  ] as const)("normalises %j → %j (%s)", (input, expected, _) => {
    void _;
    expect(normalizeUnit(input)).toBe(expected);
  });

  // The items page maps "unid" → "un" in its own client helper but the
  // server normaliser doesn't. Worth keeping the two in sync; flagged as
  // todo so a follow-up PR closes it.
  it.todo("UNIT_MAP should accept 'unid' as alias for 'un'");

  it.each([
    ["kgCO₂/m³", "m3"],
    ["kgCO₂e/m³", "m3"],
    ["kgco2/kg", "kg"],
    ["kgco2e/t", "t"],
    ["kg CO2-Eq/kg", "kg"],
  ])("strips the %j denominator prefix → %j", (input, expected) => {
    expect(normalizeUnit(input)).toBe(expected);
  });
});

// ===========================================================================
// getConversionFactor
// ===========================================================================
//
// The function that, when wrong, silently zeroes emissions. Every row in
// this table is a real or plausible (itemUnit, factorUnit) pair seen in
// production data.

describe("getConversionFactor", () => {
  // Same dimension family — must yield a finite, non-zero conversion.
  describe("same family conversions", () => {
    it.each([
      ["kg", "kg", 1.0],
      ["m³", "m³", 1.0],
      ["m³", "m3", 1.0], // alias collapse
      ["t", "t", 1.0],
      // Mass: 1 kg = 0.001 t  ← if you have qty in kg and the factor is per t,
      // emission = qty * factor * 0.001 (you needed 1000× less of the factor).
      ["kg", "t", 0.001],
      ["t", "kg", 1000.0],
      ["g", "kg", 0.001],
      ["kg", "g", 1000.0],
      // Volume
      ["m³", "L", 1000.0],
      ["L", "m³", 0.001],
    ])("%j × factor[%j] → conversion = %f", (item, factor, expected) => {
      expect(getConversionFactor(item, factor)).toBeCloseTo(expected, 10);
    });
  });

  // Incompatible dimensions — must return 0.0. This is what the auto-map
  // uses to refuse a match (factor would be meaningless). Regression guard
  // for the 'vb' / 'un' subcontracts bug.
  describe("incompatible dimensions return 0", () => {
    it.each([
      ["vb", "kg"],         // verba (lump-sum) vs mass
      ["vb", "m³"],
      ["un", "kg"],         // count vs mass
      ["un", "m³"],
      ["un", "t"],
      ["m²", "kg"],         // area vs mass — needs thickness × density, not a 1:1 conversion
      ["kg", "m³"],         // mass vs volume — would need density, not provided
      ["m", "kg"],          // length vs mass
    ])("%j → %j returns 0", (item, factor) => {
      expect(getConversionFactor(item, factor)).toBe(0);
    });
  });

  // Edge cases (null/undefined/empty) default to 1 — the calculator treats
  // these as "factor unit unknown, assume the integrator did the unit
  // matching upstream". That's a permissive fallback; it matters because
  // some legacy items have unit_factor=null.
  describe("missing unit information defaults to 1", () => {
    it.each([
      [null, "kg", 1.0],
      ["kg", null, 1.0],
      [undefined, undefined, 1.0],
      ["", "kg", 1.0],
      ["kg", "", 1.0],
    ])("(%j, %j) → %f", (item, factor, expected) => {
      expect(getConversionFactor(item, factor)).toBe(expected);
    });
  });

  // The factor unit often arrives in CECarbon's `kgCO₂/t` form. The
  // normalization must strip the kgCO₂ prefix and convert from the item's
  // unit to the denominator unit.
  describe("CECarbon-style factor units (kgCO₂/<denom>)", () => {
    it("kg item with kgCO₂/kg factor → 1", () => {
      expect(getConversionFactor("kg", "kgCO₂/kg")).toBe(1);
    });
    it("kg item with kgCO₂/t factor → 0.001 (qty × factor × 0.001)", () => {
      // 1 kg of steel × (X kgCO₂ per tonne) × 0.001 = X×0.001 kgCO₂
      expect(getConversionFactor("kg", "kgCO₂/t")).toBeCloseTo(0.001, 10);
    });
    it("m³ item with kgCO₂/m³ factor → 1", () => {
      expect(getConversionFactor("m³", "kgCO₂/m³")).toBe(1);
    });
  });

  // The pareto-blocking '35D34C1000248 - C35/45' bug surfaced as 'vb'
  // subcontracts couldn't be auto-mapped. This pins the actual production
  // unit pairs we have so a future tweak doesn't accidentally widen the
  // permissive fallback to swallow them.
  describe("regression — Raízen unit shapes", () => {
    it("vb subcontract vs CECarbon-style factor → 0 (auto-map must refuse)", () => {
      // CECarbon factors carry the per-unit denominator (kgCO₂/<denom>),
      // so the normaliser correctly compares vb (no denom) to kg → 0.
      expect(getConversionFactor("vb", "kgCO₂/kg")).toBe(0);
      expect(getConversionFactor("vb", "kgCO₂/m³")).toBe(0);
    });
    it("kg steel with Ecoinvent 'kg CO2-Eq' factor → 1 (permissive fallback)", () => {
      // Ecoinvent stores the unit denom in product_unit; the factor_unit
      // alone is just "kg CO2-Eq". The normaliser strips the whole string,
      // and the empty-fu fallback returns 1 — only correct when the caller
      // has already ensured product_unit matches the item.
      expect(getConversionFactor("kg", "kg CO2-Eq")).toBe(1);
    });
  });

  // ===========================================================================
  // KNOWN GAPS — todos documenting bugs surfaced by these tests
  // ===========================================================================
  //
  // The Ecoinvent factor_unit "kg CO2-Eq" (no per-denominator) is collapsed
  // to "" by the normaliser. Combined with the !fu → 1.0 fallback in
  // getConversionFactor, ANY item unit paired with "kg CO2-Eq" comes out
  // with conversion=1. That allows incompatible pairs (vb vs kg, m³ vs kg
  // without density) to slip through as if they were valid.
  //
  // The right behaviour: the unit-validation logic should consult the
  // factor's product_unit field instead of trusting factor_unit alone, OR
  // the empty-fu fallback should be tightened to return 0 (refuse) for
  // non-empty iu pairs.
  describe.todo("Ecoinvent 'kg CO2-Eq' unit-validation gap", () => {
    it.todo("vb item with bare 'kg CO2-Eq' factor → 0 (currently 1)");
    it.todo("m³ item with bare 'kg CO2-Eq' factor → 0 (currently 1)");
    it.todo("un item with bare 'kg CO2-Eq' factor → 0 (currently 1)");
  });
});

// ===========================================================================
// resolveConversion — conversão ciente da descrição (receitas §5)
// ===========================================================================
//
// Direta quando a unidade converte; senão tenta a receita geométrica e compõe
// a unidade-base (kg/m³) com a unidade do fator. Não altera nada para itens
// sem receita (mantém o comportamento de getConversionFactor).

describe("resolveConversion", () => {
  it("usa a conversão direta quando as unidades convertem (sem receita)", () => {
    // kg↔t = 0,001; ignora descrição.
    expect(resolveConversion("ACO CA-50", "kg", "kgCO₂/t")).toBeCloseTo(0.001, 6);
    expect(resolveConversion("ACO CA-50", "kg", "kgCO₂/kg")).toBe(1.0);
  });

  it("aplica a receita de concreto m²→m³ quando a unidade não converte direto", () => {
    // m² vs m³ = 0 direto; receita 15cm → 0,15; fator por m³ → compõe ×1.
    expect(
      resolveConversion("CONCRETO PARA PISO 15CM", "m2", "kgCO₂/m3")
    ).toBeCloseTo(0.15, 6);
  });

  it("compõe a unidade-base da receita com a do fator (m³→L)", () => {
    // receita dá m³ (0,15); fator por L → m³→L = 1000 → 150.
    expect(
      resolveConversion("CONCRETO PARA PISO 15CM", "m2", "kgCO2e/L")
    ).toBeCloseTo(150, 4);
  });

  it("aplica a receita de madeira m→kg compondo para t", () => {
    // pontalete 7,5×7,5 → 3,375 kg/m; fator por t → kg→t = 0,001 → 0,003375.
    expect(
      resolveConversion("PONTALETE 7,5X7,5", "m", "kgCO₂/t")
    ).toBeCloseTo(0.003375, 6);
  });

  it("retorna 0 quando não há conversão direta nem receita", () => {
    expect(resolveConversion("ACO CA-50", "m", "kgCO₂/kg")).toBe(0.0);
  });

  it("retorna 0 quando a receita existe mas o fator está em outra família física", () => {
    // receita de concreto dá m³; um fator por kg (sem densidade) não compõe.
    expect(resolveConversion("CONCRETO PARA PISO 15CM", "m2", "kgCO₂/kg")).toBe(0.0);
  });
});
