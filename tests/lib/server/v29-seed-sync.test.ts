import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseSeedRows } from "../../helpers/seed-parser";

// ===========================================================================
// Seed SQL ↔ fixture — mata o gap de falsa confiança.
// ===========================================================================
//
// O v29-parity.test.ts calcula os totais a partir de tests/fixtures/v29/
// lines.json, mas a PRODUÇÃO usa supabase/seed-factor-rules-v29-htb.sql.
// Eram duas cópias paralelas dos 51 fatores: se uma fosse editada sem a
// outra, a paridade continuaria verde enquanto a produção divergia.
// Este teste faz o parse do SQL e trava que os dois conjuntos são idênticos
// (keyword, factor_value e unidade).

interface Fixture {
  targets: Record<string, number>;
  factors: Record<string, { factor_value: number; unit: string }>;
  lines: Record<string, { desc: string; unit: string; qty: number; em_t: number }[]>;
}

const fx = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../fixtures/v29/lines.json", import.meta.url)), "utf8"),
) as Fixture;

const sql = readFileSync(
  fileURLToPath(new URL("../../../supabase/seed-factor-rules-v29-htb.sql", import.meta.url)),
  "utf8",
);

const seedRows = parseSeedRows(sql);

describe("seed v29 ↔ fixture lines.json", () => {
  it("o seed tem exatamente os mesmos keywords que o fixture", () => {
    const seedKeys = new Set(seedRows.map((r) => r.match_keyword));
    const fixtureKeys = new Set(Object.keys(fx.factors));
    const onlySeed = [...seedKeys].filter((k) => !fixtureKeys.has(k));
    const onlyFixture = [...fixtureKeys].filter((k) => !seedKeys.has(k));
    expect(onlySeed, `só no seed: ${onlySeed.join(", ")}`).toHaveLength(0);
    expect(onlyFixture, `só no fixture: ${onlyFixture.join(", ")}`).toHaveLength(0);
    expect(seedRows).toHaveLength(Object.keys(fx.factors).length);
  });

  it("factor_value idêntico nos dois lados, keyword a keyword", () => {
    for (const r of seedRows) {
      const f = fx.factors[r.match_keyword];
      expect(f, `keyword ausente no fixture: ${r.match_keyword}`).toBeDefined();
      expect(r.factor_value, r.match_keyword).toBe(f.factor_value);
    }
  });

  it("factor_unit do seed = kgCO₂/<unidade do item do fixture>", () => {
    for (const r of seedRows) {
      const f = fx.factors[r.match_keyword];
      expect(r.factor_unit, r.match_keyword).toBe(`kgCO₂/${f.unit}`);
    }
  });

  it("todas as regras estão ativas e escopadas à mesma empresa", () => {
    const companies = new Set(seedRows.map((r) => r.company_id));
    expect(companies.size).toBe(1);
    expect(seedRows.every((r) => r.is_active)).toBe(true);
  });

  it("nenhum factor_name truncado (regressão do ADITIVO EXPANSOR ... DR)", () => {
    for (const r of seedRows) {
      expect(r.factor_name, r.match_keyword).toBe(r.original_description);
    }
  });
});
