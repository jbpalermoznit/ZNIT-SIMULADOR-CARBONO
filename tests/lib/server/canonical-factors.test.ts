import { describe, expect, it, vi, beforeEach } from "vitest";

// ===========================================================================
// canonical-factors — fatores de combustível/transporte resolvidos do banco.
// Mocka o cliente Supabase (schema backend) com um mini-Postgrest em memória
// que respeita eq/order/limit, e pina:
//   - diesel derivado da linha "Óleo Diesel (comercial)" → 2,643 kgCO₂e/L
//   - transporte lido das linhas de frete Ecoinvent (t·km)
//   - erro EXPLÍCITO quando a linha canônica não existe (sem fallback mudo)
// ===========================================================================

let ghgRows: Record<string, unknown>[] = [];
let ecoRows: Record<string, unknown>[] = [];

vi.mock("@/lib/server/supabase", () => {
  function builder(table: string) {
    const filters: Array<[string, unknown]> = [];
    let orderBy: { col: string; asc: boolean } | null = null;
    const api = {
      select: () => api,
      eq: (col: string, val: unknown) => {
        filters.push([col, val]);
        return api;
      },
      order: (col: string, opts?: { ascending?: boolean }) => {
        orderBy = { col, asc: opts?.ascending ?? true };
        return api;
      },
      limit: (n: number) => {
        const source = table === "fatores_ghg_dev" ? ghgRows : ecoRows;
        let rows = source.filter((r) =>
          filters.every(([c, v]) => r[c] === v)
        );
        if (orderBy) {
          const { col, asc } = orderBy;
          rows = [...rows].sort((a, b) => {
            const x = a[col] as number;
            const y = b[col] as number;
            return asc ? x - y : y - x;
          });
        }
        return Promise.resolve({ data: rows.slice(0, n), error: null });
      },
    };
    return api;
  }
  return {
    supabase: { from: builder },
    supabaseEmission: { from: builder },
  };
});

import {
  getFuelFactors,
  getDieselFactor,
  getTransportFactors,
  __resetCanonicalFactorCache,
} from "@/lib/server/canonical-factors";

const DIESEL_ROW = {
  produto: "Óleo Diesel (comercial)",
  ano: 2025,
  co2: 2.603,
  ch4: 0.0001385311637,
  n2o: 0.0001385311637,
  versao_ghg: "v2025.0.1",
};
const GASOLINE_ROW = {
  produto: "Gasolina Automotiva (comercial)",
  ano: 2025,
  co2: 2.212,
  ch4: 0.000807717456,
  n2o: 0.0002584695859,
  versao_ghg: "v2025.0.1",
};
const GLP_ROW = {
  produto: "Gás Liquefeito de Petróleo (GLP)",
  ano: 2025,
  co2: 2.930927472,
  ch4: 0.00288135576,
  n2o: 0.000009294696,
  versao_ghg: "v2025.0.1",
};

const TRUCK_BR = {
  product_id: "bab4f7a5-9db6-4c98-9765-b92db37a29fd",
  product_name: "transport, freight, lorry, 16-32 metric ton, diesel, EURO 5",
  product_unit: "metric ton*km",
  impact_score: "0.140",
  kind: "Market Activity",
  geography: "Brazil (BR)",
};
const TRUCK_GLO = {
  product_id: "049d56f1-d152-4298-ae1e-3c0626ff113b",
  product_name: "transport, freight, lorry, diesel, unspecified",
  product_unit: "metric ton*km",
  impact_score: "0.156",
  kind: "Market Group",
  geography: "Global (GLO)",
};
const RAIL = {
  product_id: "55c07484-a60d-4ed8-8353-e4d7bbd5ce46",
  product_name: "transport, freight, train, fleet average",
  product_unit: "metric ton*km",
  impact_score: "0.0472",
  kind: "Market Group",
  geography: "Europe (RER)",
};
const SHIP = {
  product_id: "ed2a3928-2427-4cf6-8094-bc771fe59b4f",
  product_name: "transport, freight, sea, container ship, heavy fuel oil",
  product_unit: "metric ton*km",
  impact_score: "0.0102",
  kind: "Market Activity",
  geography: "Global (GLO)",
};

beforeEach(() => {
  __resetCanonicalFactorCache();
  ghgRows = [DIESEL_ROW, GASOLINE_ROW, GLP_ROW];
  ecoRows = [TRUCK_BR, TRUCK_GLO, RAIL, SHIP];
});

describe("getFuelFactors / getDieselFactor", () => {
  it("deriva diesel ~2,643 kgCO₂e/L da linha do banco (AR5)", async () => {
    const diesel = await getDieselFactor();
    expect(diesel.value).toBeCloseTo(2.64359, 4);
    expect(diesel.unit).toBe("kgCO₂/L");
    expect(diesel.source).toContain("Óleo Diesel (comercial)");
  });

  it("deriva gasolina 2,303 kgCO₂e/L (mesmo valor que era hardcoded)", async () => {
    const fuels = await getFuelFactors();
    expect(fuels.gasoline.value).toBeCloseTo(2.303, 3);
  });

  it("prefere o ano mais recente quando há múltiplas linhas", async () => {
    ghgRows = [
      { ...DIESEL_ROW, ano: 2020, co2: 9.9 },
      DIESEL_ROW,
      GASOLINE_ROW,
      GLP_ROW,
    ];
    const diesel = await getDieselFactor();
    expect(diesel.value).toBeCloseTo(2.64359, 4);
  });

  it("erro explícito quando a linha canônica não existe", async () => {
    ghgRows = [GASOLINE_ROW, GLP_ROW];
    await expect(getFuelFactors()).rejects.toThrow(/diesel/);
  });
});

describe("getTransportFactors", () => {
  it("resolve truck/rail/ship das linhas de frete Ecoinvent", async () => {
    const t = await getTransportFactors();
    expect(t.truck.value).toBeCloseTo(0.14, 6);
    expect(t.rail.value).toBeCloseTo(0.0472, 6);
    expect(t.ship.value).toBeCloseTo(0.0102, 6);
    expect(t.truck.unit).toBe("kgCO₂e/t·km");
  });

  it("cai para o fallback GLO quando a linha BR não existe", async () => {
    ecoRows = [TRUCK_GLO, RAIL, SHIP];
    const t = await getTransportFactors();
    expect(t.truck.value).toBeCloseTo(0.156, 6);
    expect(t.truck.source).toContain("unspecified");
  });

  it("erro explícito quando nenhum candidato do modal existe", async () => {
    ecoRows = [TRUCK_BR, TRUCK_GLO, SHIP];
    await expect(getTransportFactors()).rejects.toThrow(/rail/);
  });
});
