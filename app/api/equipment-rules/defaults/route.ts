import { NextResponse } from "next/server";
import { getFuelFactors, getTransportFactors } from "@/lib/server/canonical-factors";

// Fator de rede elétrica (SIN): não existe tabela de grid no schema backend,
// então permanece constante documentada até termos a fonte no banco.
const ELECTRIC_FACTOR = {
  value: 0.0293,
  unit: "kgCO₂/kWh",
  source: "SIN 2024",
  tier: "ghg_protocol",
};

// Default consumption per hour by equipment category
const DEFAULT_EQUIPMENT_PROFILES = {
  retroescavadeira: { fuel: "diesel", consumption: 12.0, unit: "L/h", scope: 1 },
  escavadeira: { fuel: "diesel", consumption: 18.0, unit: "L/h", scope: 1 },
  "caminhão basculante": { fuel: "diesel", consumption: 15.0, unit: "L/h", scope: 1 },
  "caminhão": { fuel: "diesel", consumption: 12.0, unit: "L/h", scope: 1 },
  "pá carregadeira": { fuel: "diesel", consumption: 15.0, unit: "L/h", scope: 1 },
  "rolo compactador": { fuel: "diesel", consumption: 10.0, unit: "L/h", scope: 1 },
  betoneira: { fuel: "electric", consumption: 5.0, unit: "kWh/h", scope: 2 },
  "máquina de solda": { fuel: "electric", consumption: 8.0, unit: "kWh/h", scope: 2 },
  guindaste: { fuel: "diesel", consumption: 20.0, unit: "L/h", scope: 1 },
  "bomba de concreto": { fuel: "diesel", consumption: 25.0, unit: "L/h", scope: 1 },
  gerador: { fuel: "diesel", consumption: 10.0, unit: "L/h", scope: 1 },
  andaime: { fuel: "none", consumption: 0, unit: "-", scope: 0 },
  forma: { fuel: "none", consumption: 0, unit: "-", scope: 0 },
};

// ---------------------------------------------------------------------------
// GET /api/equipment-rules/defaults
// Fatores de combustível resolvidos das tabelas Supabase (fatores_ghg_dev),
// não hardcoded — ver lib/server/canonical-factors.ts.
// ---------------------------------------------------------------------------
export async function GET() {
  try {
    const [fuel, transport] = await Promise.all([
      getFuelFactors(),
      getTransportFactors(),
    ]);
    return NextResponse.json({
      profiles: DEFAULT_EQUIPMENT_PROFILES,
      transport_factors: transport,
      fuel_factors: {
        diesel: { value: fuel.diesel.value, unit: fuel.diesel.unit, source: fuel.diesel.source, tier: "ghg_protocol" },
        gasoline: { value: fuel.gasoline.value, unit: fuel.gasoline.unit, source: fuel.gasoline.source, tier: "ghg_protocol" },
        glp: { value: fuel.glp.value, unit: fuel.glp.unit, source: fuel.glp.source, tier: "ghg_protocol" },
        electric: ELECTRIC_FACTOR,
        none: { value: 0, unit: "-", source: "-", tier: "none" },
      },
    });
  } catch (e) {
    console.error("equipment-rules/defaults:", e);
    return NextResponse.json(
      { detail: e instanceof Error ? e.message : "Erro ao resolver fatores canônicos" },
      { status: 502 }
    );
  }
}
