import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// ===========================================================================
// Harness de paridade — regressão de MATCH (não de total).
// ===========================================================================
//
// Roda o autoMatchItem REAL offline contra um catálogo de fatores curado e
// versionado (tests/fixtures/parity/factors.json) que reproduz os fatores
// corretos E as armadilhas documentadas em docs/PARIDADE_SIMULADOR.md
// (air-compressor 794/un, Ecoinvent concreto 404/m³, CECarbon *deprecated).
//
// Os três search* do Supabase são mockados para espelhar o `ilike` real
// (substring case-insensitive, accent-sensitive — como o Postgres), então o
// pipeline de score/dedup/guardas/penalidade de unidade decide o vencedor
// exatamente como em produção. Reranker e busca vetorial ficam OFF (flags não
// setadas) → determinístico, sem segredos, roda em CI.
//
// Por que isto e não o total 1245,6/504,1: a base completa de fatores e as
// planilhas dos cenários não estão versionadas. Este harness trava o
// COMPORTAMENTO de match (tier/fator certo, armadilhas rejeitadas), que é onde
// estavam todas as divergências de paridade. Quando os exports reais forem
// versionados, dá para estender para o total absoluto.

// ---------------------------------------------------------------------------
// Mock dos catálogos. Precisa ser hoisted antes de importar autoMatchItem.
// A implementação real é injetada no beforeEach (os fixtures são carregados
// abaixo, fora do factory hoisted).
// ---------------------------------------------------------------------------
vi.mock("@/lib/server/supabase-emission", () => ({
  searchEcoinvent: vi.fn().mockResolvedValue([]),
  searchGhg: vi.fn().mockResolvedValue([]),
  searchCecarbon: vi.fn().mockResolvedValue([]),
}));

import { autoMatchItem } from "@/lib/server/emission-mapper";
import {
  searchEcoinvent,
  searchGhg,
  searchCecarbon,
} from "@/lib/server/supabase-emission";
import { resolveConversion } from "@/lib/server/calculator";

type FactorRow = Record<string, unknown>;
interface Catalog {
  ghg: FactorRow[];
  cecarbon: FactorRow[];
  ecoinvent: FactorRow[];
}
interface ScenarioItem {
  id: string;
  description: string;
  unit: string;
  quantity: number;
}
interface Expectation {
  why?: string;
  expectTier?: string;
  expectNameIncludes?: string;
  expectValue?: number;
  rejectValue?: number;
}

function loadFixture<T>(name: string): T {
  const url = new URL(`../../fixtures/parity/${name}`, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), "utf8")) as T;
}

const catalog = loadFixture<Catalog>("factors.json");
const { items } = loadFixture<{ items: ScenarioItem[] }>("items.json");
const expected = loadFixture<Record<string, Expectation>>("expected.json");

// Espelha o `ilike '%q%'` do Postgres: case-insensitive, accent-sensitive.
const ilike = (hay: unknown, needle: string) =>
  String(hay ?? "")
    .toLowerCase()
    .includes(needle.toLowerCase());

const mockedEcoinvent = vi.mocked(searchEcoinvent);
const mockedGhg = vi.mocked(searchGhg);
const mockedCecarbon = vi.mocked(searchCecarbon);

beforeEach(() => {
  // searchGhg → ilike("produto")
  mockedGhg
    .mockReset()
    .mockImplementation(async (q: string) =>
      catalog.ghg.filter((r) => ilike(r.produto, q))
    );
  // searchCecarbon → ilike("Descrição fator de emissao")
  mockedCecarbon
    .mockReset()
    .mockImplementation(async (q: string) =>
      catalog.cecarbon.filter((r) => ilike(r["Descrição fator de emissao"], q))
    );
  // searchEcoinvent → or(product_name, product_name_pt, activity_name, activity_name_pt)
  mockedEcoinvent
    .mockReset()
    .mockImplementation(async (q: string) =>
      catalog.ecoinvent.filter((r) =>
        ["product_name", "product_name_pt", "activity_name", "activity_name_pt"].some(
          (f) => ilike(r[f], q)
        )
      )
    );
});

describe("paridade — regressão de match (autoMatchItem vs catálogo curado)", () => {
  for (const item of items) {
    const exp = expected[item.id];

    it(`${item.id}: ${item.description}${exp?.why ? ` — ${exp.why}` : ""}`, async () => {
      expect(exp, `sem expectativa para "${item.id}" em expected.json`).toBeDefined();

      const { best, results } = await autoMatchItem(item.description, item.unit);

      // Guarda contra match espúrio: o fator-armadilha não pode sobreviver no pool.
      if (exp.rejectValue != null) {
        const survived = results.find((c) => c.factor_value === exp.rejectValue);
        expect(
          survived,
          `fator espúrio ${exp.rejectValue} não deveria estar no pool (best=${best?.factor_name} ${best?.factor_value})`
        ).toBeUndefined();
      }

      // Match positivo: tier/nome/valor do melhor candidato.
      const needsPositive =
        exp.expectTier != null ||
        exp.expectNameIncludes != null ||
        exp.expectValue != null;

      if (needsPositive) {
        expect(best, `nenhum match para "${item.description}"`).not.toBeNull();
      }
      if (exp.expectTier != null) {
        expect(best?.source_tier).toBe(exp.expectTier);
      }
      if (exp.expectNameIncludes != null) {
        expect(best?.factor_name).toContain(exp.expectNameIncludes);
      }
      if (exp.expectValue != null) {
        expect(best?.factor_value).toBeCloseTo(exp.expectValue, 4);
      }
    });
  }
});

// ===========================================================================
// Paridade do TOTAL (PLANO §6) — pipeline completo: fator atribuído →
// resolveConversion (inclui receitas §5) → emissão → soma do cenário.
// ===========================================================================
//
// Não reproduz o total do simulador antigo (1245,6 — exige os dados reais de
// produção, não versionados). É um ÂNCORA de regressão do pipeline NOVO:
// trava a emissão por item e o total do cenário, incluindo os 4 itens de
// receita (que sem a conversão geométrica zerariam).

interface ScenarioTotalItem {
  id: string;
  description: string;
  unit: string;
  quantity: number;
  factor_value: number;
  factor_unit: string;
  recipe?: boolean;
  expected_kg: number;
}
const scenario = loadFixture<{
  items: ScenarioTotalItem[];
  expected_total_kg: number;
  expected_total_t: number;
}>("scenario-total.json");

// Mesma fórmula de calcItemEmission (calculator.ts), via resolveConversion.
function emissionKg(row: ScenarioTotalItem): number {
  const conv = resolveConversion(row.description, row.unit, row.factor_unit);
  return row.quantity * row.factor_value * conv;
}

describe("paridade — total do cenário (pipeline completo)", () => {
  for (const row of scenario.items) {
    it(`${row.id}: emissão = qty × fator × conversão${row.recipe ? " (receita §5)" : ""}`, () => {
      const kg = emissionKg(row);
      expect(kg).toBeCloseTo(row.expected_kg, 3);
      // Itens de receita: sem a conversão geométrica cairiam para 0.
      if (row.recipe) expect(kg).toBeGreaterThan(0);
    });
  }

  it("soma do cenário bate o total esperado (âncora de regressão)", () => {
    const totalKg = scenario.items.reduce((s, row) => s + emissionKg(row), 0);
    expect(totalKg).toBeCloseTo(scenario.expected_total_kg, 2);
    expect(totalKg / 1000).toBeCloseTo(scenario.expected_total_t, 4);
  });

  it("os 4 itens de receita (§5) contribuem com emissão > 0", () => {
    // Guarda explícita: prova que m²/m com fator de massa/volume NÃO zeram.
    const recipeItems = scenario.items.filter((i) => i.recipe);
    expect(recipeItems).toHaveLength(4);
    for (const row of recipeItems) {
      expect(emissionKg(row), `${row.id} zerou — receita não aplicou`).toBeGreaterThan(0);
    }
  });
});
