import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolveConversion } from "@/lib/server/calculator";
import { normalizeKeyword } from "@/lib/server/keyword";

// ===========================================================================
// Paridade com a versão funcional v29 (simulation/relatorio_pulperpit_v29.xlsx).
// ===========================================================================
//
// Critério de aceite (docs/VALIDACAO_V29.md): o simulador deve reproduzir
//   Padrão (helice)  = 1.245,56 tCO₂e
//   Novo   (prancha) =   504,12 tCO₂e
//
// Aqui travamos que os FATORES EFETIVOS do seed (supabase/seed-factor-rules-
// v29-htb.sql, gerados do v29) aplicados às quantidades do v29 via o
// resolveConversion REAL reproduzem os totais. O factor_unit do seed é a
// unidade do item ("kgCO₂/m³", "kgCO₂/SC", ...), então a conversão é direta (1)
// — o mesmo caminho que roda em produção quando a Factor Rule casa.

interface Fixture {
  targets: Record<string, number>;
  factors: Record<string, { factor_value: number; unit: string }>;
  lines: Record<string, { desc: string; unit: string; qty: number; em_t: number }[]>;
}

const fx = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../fixtures/v29/lines.json", import.meta.url)), "utf8"),
) as Fixture;

const emissionT = (line: { desc: string; unit: string; qty: number }): number => {
  const rule = fx.factors[normalizeKeyword(line.desc)];
  if (!rule) throw new Error(`sem fator no seed para "${line.desc}"`);
  const conv = resolveConversion(line.desc, line.unit, `kgCO₂/${line.unit}`);
  return (line.qty * rule.factor_value * conv) / 1000;
};

describe("paridade v29 — totais dos cenários", () => {
  for (const scenario of Object.keys(fx.targets)) {
    it(`"${scenario}" reproduz ${fx.targets[scenario]} tCO₂e`, () => {
      const total = fx.lines[scenario].reduce((s, l) => s + emissionT(l), 0);
      expect(total).toBeCloseTo(fx.targets[scenario], 1);
    });
  }

  it("todo insumo do v29 tem fator no seed (cobertura 100%)", () => {
    const missing: string[] = [];
    for (const ls of Object.values(fx.lines)) {
      for (const l of ls) {
        if (!fx.factors[normalizeKeyword(l.desc)]) missing.push(l.desc);
      }
    }
    expect(missing, `insumos sem fator: ${missing.slice(0, 5).join(", ")}`).toHaveLength(0);
  });
});

describe("paridade v29 — factor_unit = unidade do item → conversão direta", () => {
  it.each([
    ["CONCRETO USINADO DE 40MPA COM SILICA ATIVA", "m³"],
    ["CIMENTO PORTLAND (EMB 50KG)", "SC"],
    ["ACO CA-50 - BITOLA MEDIA", "KG"],
    ["PONTALETE 8X8CM", "M"],
    ["CHAPA COMPENSADA PLASTIFICADA 14MM", "FL"],
    ["TUBO DE PVC RIGIDO SOLDAVEL 20MM (6M)", "PC"],
  ])("resolveConversion(%s, %s) = 1", (desc, unit) => {
    expect(resolveConversion(desc, unit, `kgCO₂/${unit}`)).toBe(1);
  });
});
