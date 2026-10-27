import { describe, it, expect, vi, beforeEach } from "vitest";
import ExcelJS from "exceljs";

// ===========================================================================
// GET /api/projects/[projectId]/export-comparison — generalizado de
// exatamente 2 cenários (scenario_a/scenario_b) para N cenários
// (scenario_ids=id1,id2,...). Regressão: garante que N=3 produz uma aba
// "Indicadores" com 1 coluna de valor por cenário + 1 "Δ%" por cenário
// não-base, e uma aba de detalhe por cenário com nomes únicos.
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

import { GET } from "@/app/api/projects/[projectId]/export-comparison/route";

const ctx = { params: Promise.resolve({ projectId: "p1" }) };
function reqWithIds(ids: string[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { nextUrl: { searchParams: new URLSearchParams(`scenario_ids=${ids.join(",")}`) } } as any;
}

beforeEach(() => {
  h.tables = {
    projects: [{ id: "p1", company_id: "c1", name: "Proj" }],
    scenarios: [
      { id: "s1", project_id: "p1", is_base: true, name: "Base" },
      { id: "s2", project_id: "p1", is_base: false, name: "Alternativa A" },
      { id: "s3", project_id: "p1", is_base: false, name: "Alternativa B" },
    ],
    scenario_results: [
      { scenario_id: "s1", total_tco2e: 1000, scope3_materials_kgco2e: 900_000, scope3_logistics_kgco2e: 0, coverage_pct: 80, items_mapped: 8 },
      { scenario_id: "s2", total_tco2e: 800, scope3_materials_kgco2e: 700_000, scope3_logistics_kgco2e: 0, coverage_pct: 85, items_mapped: 9 },
      { scenario_id: "s3", total_tco2e: 1200, scope3_materials_kgco2e: 1_100_000, scope3_logistics_kgco2e: 0, coverage_pct: 75, items_mapped: 7 },
    ],
    abc_items: [
      { id: "a1", abc_curve_id: "cv1", parent_item_id: null, mapping_status: "mapped", description: "CONCRETO USINADO", unit: "m3", quantity: 10, cost_code: "C1", total_cost: 1000 },
    ],
    scenario_items: [
      { scenario_id: "s1", abc_item_id: "a1", emission_kgco2e: 900_000, factor_value: 240, factor_unit: "kgCO2e/t", source_tier: "cecarbon", is_excluded: false },
      { scenario_id: "s2", abc_item_id: "a1", emission_kgco2e: 700_000, factor_value: 200, factor_unit: "kgCO2e/t", source_tier: "cecarbon", is_excluded: false },
      { scenario_id: "s3", abc_item_id: "a1", emission_kgco2e: 1_100_000, factor_value: 260, factor_unit: "kgCO2e/t", source_tier: "cecarbon", is_excluded: false },
    ],
  };
});

describe("export-comparison — N cenários", () => {
  it("rejeita menos de 2 scenario_ids", async () => {
    const res = await GET(reqWithIds(["s1"]), ctx);
    expect(res.status).toBe(400);
  });

  it("404 quando algum cenário não existe", async () => {
    const res = await GET(reqWithIds(["s1", "does-not-exist"]), ctx);
    expect(res.status).toBe(404);
  });

  it("N=3: aba Indicadores tem 1 coluna de valor por cenário + Δ% por não-base", async () => {
    const res = await GET(reqWithIds(["s1", "s2", "s3"]), ctx);
    expect(res.status).toBe(200);

    const buffer = await res.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(Buffer.from(buffer) as any);

    const ind = wb.getWorksheet("Indicadores")!;
    expect(ind).toBeDefined();

    // Header row é a 4ª linha (título, projeto, linha em branco, header).
    const headerRow = ind.getRow(4).values as unknown[];
    // [empty, "Parâmetro", "Base (Base)", "Alternativa A", "Δ% vs Base", "Alternativa B", "Δ% vs Base"]
    const headerText = headerRow.slice(1).map(String);
    expect(headerText[0]).toBe("Parâmetro");
    expect(headerText).toContain("Base (Base)");
    expect(headerText.filter((h) => h.startsWith("Δ%")).length).toBe(2);

    // Linha "Emissões Totais" — valores batem com scenario_results, e a
    // primeira Δ% é calculada vs a base (1000 → 800 = 20% de redução).
    const totalsRow = ind.getRows(5, 15)!.find((r) => String(r.getCell(1).value) === "Emissões Totais (tCO₂e)")!;
    const vals = totalsRow.values as unknown[];
    expect(vals[2]).toBe(1000); // Base
    expect(vals[3]).toBe(800);  // Alternativa A
    expect(String(vals[4])).toBe("20.00%");
    expect(vals[5]).toBe(1200); // Alternativa B
  });

  it("N=3: uma aba de detalhe por cenário, com nomes únicos", async () => {
    const res = await GET(reqWithIds(["s1", "s2", "s3"]), ctx);
    const buffer = await res.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(Buffer.from(buffer) as any);

    const sheetNames = wb.worksheets.map((ws) => ws.name);
    expect(sheetNames).toContain("Indicadores");
    expect(sheetNames).toContain("Base");
    expect(sheetNames).toContain("Alternativa A");
    expect(sheetNames).toContain("Alternativa B");
    expect(new Set(sheetNames).size).toBe(sheetNames.length);
  });

  it("N=2 continua funcionando (regressão do comportamento antigo)", async () => {
    const res = await GET(reqWithIds(["s1", "s2"]), ctx);
    expect(res.status).toBe(200);
    const buffer = await res.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(Buffer.from(buffer) as any);
    expect(wb.worksheets.map((ws) => ws.name)).toEqual(["Indicadores", "Base", "Alternativa A"]);
  });
});
