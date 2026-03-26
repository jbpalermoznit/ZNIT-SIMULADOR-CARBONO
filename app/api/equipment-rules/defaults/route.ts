import { NextResponse } from "next/server";

// Default fuel emission factors (kgCO2 per unit)
const DEFAULT_FUEL_FACTORS = {
  diesel: {
    value: 2.643,
    unit: "kgCO\u2082/L",
    source: "BEN 2023",
    tier: "ghg_protocol",
  },
  gasoline: {
    value: 2.303,
    unit: "kgCO\u2082/L",
    source: "BEN 2023",
    tier: "ghg_protocol",
  },
  electric: {
    value: 0.0293,
    unit: "kgCO\u2082/kWh",
    source: "SIN 2024",
    tier: "ghg_protocol",
  },
  glp: {
    value: 1.536,
    unit: "kgCO\u2082/kg",
    source: "BEN 2023",
    tier: "ghg_protocol",
  },
  none: { value: 0, unit: "-", source: "-", tier: "none" },
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
// ---------------------------------------------------------------------------
export async function GET() {
  return NextResponse.json({
    profiles: DEFAULT_EQUIPMENT_PROFILES,
    fuel_factors: DEFAULT_FUEL_FACTORS,
  });
}
