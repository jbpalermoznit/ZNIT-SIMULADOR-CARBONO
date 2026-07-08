import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { normalizeKeyword } from "@/lib/server/keyword";

// ===========================================================================
// Live-match v29 — o pipeline REAL seleciona a regra certa para cada item.
// ===========================================================================
//
// O v29-parity.test.ts prova que "estes números somam 1245,56/504,12", mas
// não que o autoMatchItem vai ESCOLHER esses fatores para essas descrições.
// Aqui carregamos as 51 regras direto do seed SQL (o artefato de produção),
// mockamos o Supabase e passamos as 201 linhas reais do v29 pelo
// autoMatchItem, travando que cada item casa a regra esperada com o valor
// esperado — inclusive a precedência regra-vs-regra (keyword mais específica
// vence, independente da ordem das linhas no banco).

const h = vi.hoisted(() => ({ rules: [] as Record<string, unknown>[] }));

vi.mock("@/lib/server/supabase", () => {
  const make = () => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "update", "insert", "eq", "order", "delete"]) {
      chain[m] = () => chain;
    }
    chain.single = () => Promise.resolve({ data: null });
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve({ data: h.rules }).then(resolve, reject);
    return chain;
  };
  return { supabase: { from: () => make() }, supabaseEmission: { from: () => make() } };
});

vi.mock("@/lib/server/supabase-emission", () => ({
  searchEcoinvent: vi.fn().mockResolvedValue([]),
  searchGhg: vi.fn().mockResolvedValue([]),
  searchCecarbon: vi.fn().mockResolvedValue([]),
}));

import { autoMatchItem } from "@/lib/server/emission-mapper";
import { parseSeedRows } from "../../helpers/seed-parser";

interface Fixture {
  targets: Record<string, number>;
  factors: Record<string, { factor_value: number; unit: string }>;
  lines: Record<string, { desc: string; unit: string; qty: number; em_t: number }[]>;
}

const fx = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../fixtures/v29/lines.json", import.meta.url)), "utf8"),
) as Fixture;

const seedRows = parseSeedRows(
  readFileSync(
    fileURLToPath(new URL("../../../supabase/seed-factor-rules-v29-htb.sql", import.meta.url)),
    "utf8",
  ),
);

const COMPANY = "efb2ccda-4024-44fa-aee7-5889b316be26";

describe("live-match v29 — autoMatchItem seleciona a regra certa (201 linhas)", () => {
  it("cada insumo do v29 casa a regra esperada com o factor_value esperado", async () => {
    h.rules = seedRows.map((r, i) => ({ ...r, id: `seed-${i}`, times_applied: 0 }));

    const mismatches: string[] = [];
    for (const [scenario, lines] of Object.entries(fx.lines)) {
      for (const line of lines) {
        const expected = fx.factors[normalizeKeyword(line.desc)];
        const match = await autoMatchItem(line.desc, line.unit, COMPANY);
        if (!match.best) {
          mismatches.push(`[${scenario}] sem match: ${line.desc}`);
        } else if (match.best.factor_value !== expected.factor_value) {
          mismatches.push(
            `[${scenario}] ${line.desc}: esperado ${expected.factor_value}, veio ${match.best.factor_value} (${match.best.factor_name})`,
          );
        }
      }
    }
    expect(mismatches, mismatches.slice(0, 8).join("\n")).toHaveLength(0);
  }, 30000);

  it("precedência: keyword mais específica vence mesmo listada DEPOIS no banco", async () => {
    // Ordem adversarial: a genérica primeiro no retorno do banco.
    h.rules = [
      { id: "z-generic", match_keyword: "concreto usinado", factor_value: 111, factor_unit: "kgCO₂/m³", factor_name: "GENÉRICA", source_tier: "cecarbon", is_active: true, times_applied: 0 },
      { id: "a-specific", match_keyword: "concreto usinado de 40mpa com silica ativa", factor_value: 280.999963, factor_unit: "kgCO₂/m³", factor_name: "ESPECÍFICA", source_tier: "ecoinvent", is_active: true, times_applied: 0 },
    ];
    const r = await autoMatchItem("CONCRETO USINADO DE 40MPA COM SILICA ATIVA", "m³", COMPANY);
    expect(r.best?.factor_name).toBe("ESPECÍFICA");
    expect(r.best?.factor_value).toBe(280.999963);
  });

  it("desempate estável por id quando keywords têm o mesmo tamanho", async () => {
    h.rules = [
      { id: "b", match_keyword: "aco ca 50", factor_value: 2, factor_unit: "kgCO₂/kg", factor_name: "B", source_tier: "ecoinvent", is_active: true, times_applied: 0 },
      { id: "a", match_keyword: "aco ca 50", factor_value: 1, factor_unit: "kgCO₂/kg", factor_name: "A", source_tier: "ecoinvent", is_active: true, times_applied: 0 },
    ];
    const r = await autoMatchItem("ACO CA-50", "kg", COMPANY);
    expect(r.best?.factor_name).toBe("A");
  });
});
