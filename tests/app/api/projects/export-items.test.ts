import { describe, it, expect, vi, beforeEach } from "vitest";

// ===========================================================================
// GET /api/projects/[projectId]/export-items — o export usa a emissão
// PERSISTIDA do cenário (scenario_items.emission_kgco2e/1000), não um
// qty×factor recomputado. Regressão do incidente onde o export mostrava
// 27.523 tCO₂e contra 3.393 calculados (faltava conversão + exclusão).
//
// Testamos o branch CSV (corpo em texto, inspecionável sem ExcelJS).
// ===========================================================================

const h = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
}));

vi.mock("@/lib/server/supabase", () => ({
  supabase: {
    from(table: string) {
      let rows = [...(h.tables[table] ?? [])];
      const b: Record<string, unknown> = {
        select: () => b,
        eq: (col: string, val: unknown) => { rows = rows.filter((r) => r[col] === val); return b; },
        in: (col: string, vals: unknown[]) => { rows = rows.filter((r) => vals.includes(r[col])); return b; },
        order: () => b,
        limit: (n: number) => { rows = rows.slice(0, n); return b; },
        single: async () => ({ data: rows[0] ?? null, error: rows[0] ? null : { message: "no rows" } }),
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => void) => resolve({ data: rows, error: null }),
      };
      return b;
    },
  },
}));

vi.mock("@/lib/server/auth", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "u1", company_id: "c1" })),
  unauthorized: () => Response.json({ detail: "auth" }, { status: 401 }),
}));

import { GET } from "@/app/api/projects/[projectId]/export-items/route";

const ctx = { params: Promise.resolve({ projectId: "p1" }) };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const csvReq = { nextUrl: { searchParams: new URLSearchParams("format=csv") } } as any;

beforeEach(() => {
  h.tables = {
    projects: [{ id: "p1", company_id: "c1", name: "Proj" }],
    scenarios: [{ id: "s1", project_id: "p1", is_base: true, name: "Base" }],
    abc_items: [
      // Direto: qty=10 m³, factor 240/t. qty×factor/1000 daria 2,4 — mas a
      // emissão persistida (com densidade) é 2400 tCO₂e.
      { id: "a1", abc_curve_id: "cv", parent_item_id: null, mapping_status: "mapped", description: "CONCRETO USINADO", unit: "m3", quantity: 10, cost_code: "C1", item_type: "A", abc_class: "P1", total_cost: 1000 },
      // Excluído: não deve contar como emissão.
      { id: "a3", abc_curve_id: "cv", parent_item_id: null, mapping_status: "mapped", description: "ADMINISTRATIVO", unit: "vb", quantity: 1, cost_code: "C3", item_type: "F", abc_class: "P3", total_cost: 90 },
    ],
    scenario_items: [
      { scenario_id: "s1", abc_item_id: "a1", emission_kgco2e: 2_400_000, factor_value: 240, factor_unit: "kgCO2e/t", source_tier: "cecarbon", is_excluded: false },
      { scenario_id: "s1", abc_item_id: "a3", emission_kgco2e: 0, factor_value: 5, factor_unit: "kgCO2e/vb", source_tier: "cecarbon", is_excluded: true },
    ],
  };
});

describe("export-items CSV — usa emissão persistida do cenário", () => {
  it("emite a emissão de scenario_items (2400), não qty×factor (2,4)", async () => {
    const res = await GET(csvReq, ctx);
    expect(res.status).toBe(200);
    const csv = await res.text();

    const line = csv.split("\r\n").find((l) => l.includes("CONCRETO USINADO"))!;
    expect(line).toBeDefined();
    // pt-BR: 2400 → "2.400"; jamais "2,4" (o qty×factor antigo).
    expect(line).toContain("2.400");
    expect(line).not.toMatch(/;2,4$/);
  });

  it("marca item excluído e zera sua emissão", async () => {
    const res = await GET(csvReq, ctx);
    const csv = await res.text();
    const line = csv.split("\r\n").find((l) => l.includes("ADMINISTRATIVO"))!;
    expect(line).toContain("excluído");
    expect(line.endsWith(";0")).toBe(true);
  });

  it("default sem scenario_id cai no cenário Base do projeto", async () => {
    const res = await GET(csvReq, ctx);
    const csv = await res.text();
    // Coluna Cenário = "Base" nas linhas de item.
    expect(csv).toContain("Base;");
  });
});
