/**
 * Fatores canônicos — combustíveis e transporte de carga — resolvidos em
 * runtime das tabelas Supabase (schema `backend`), nunca hardcoded.
 *
 * - Combustíveis: `fatores_ghg_dev` (GHG Protocol BR), CO₂e derivado via
 *   AR5 em gwp.ts. Ex.: "Óleo Diesel (comercial)" 2025 → 2,643 kgCO₂e/L.
 * - Transporte (kgCO₂e/t·km): `ecoinvent_dev`, linhas de frete em
 *   `metric ton*km`, com lista de preferência por modal (BR antes de GLO).
 *
 * Linha ausente ou valor não-positivo → erro explícito (sem fallback
 * silencioso para uma constante). Cache em memória com TTL de 1h.
 */
import { supabaseEmission } from "./supabase";
import { computeCo2e } from "./gwp";

export interface CanonicalFactor {
  value: number;
  unit: string;
  source: string;
}

export type FuelKey = "diesel" | "gasoline" | "glp";
export type TransportModal = "truck" | "rail" | "ship";

const TTL_MS = 60 * 60 * 1000;

const FUEL_ROWS: Record<FuelKey, { produto: string; unit: string }> = {
  diesel: { produto: "Óleo Diesel (comercial)", unit: "kgCO₂/L" },
  gasoline: { produto: "Gasolina Automotiva (comercial)", unit: "kgCO₂/L" },
  glp: { produto: "Gás Liquefeito de Petróleo (GLP)", unit: "kgCO₂/kg" },
};

// Ordem de preferência por modal: primeira linha encontrada vence.
const TRANSPORT_ROWS: Record<
  TransportModal,
  Array<{ product_id: string; kind: string; geography: string }>
> = {
  truck: [
    // BR: caminhão 16–32 t diesel EURO 5 (mercado Brasil)
    { product_id: "bab4f7a5-9db6-4c98-9765-b92db37a29fd", kind: "Market Activity", geography: "Brazil (BR)" },
    // Fallback: lorry diesel unspecified, market group global
    { product_id: "049d56f1-d152-4298-ae1e-3c0626ff113b", kind: "Market Group", geography: "Global (GLO)" },
  ],
  rail: [
    // train, fleet average — market group (RER é o único market group disponível)
    { product_id: "55c07484-a60d-4ed8-8353-e4d7bbd5ce46", kind: "Market Group", geography: "Europe (RER)" },
  ],
  ship: [
    // sea, container ship, heavy fuel oil — market global
    { product_id: "ed2a3928-2427-4cf6-8094-bc771fe59b4f", kind: "Market Activity", geography: "Global (GLO)" },
  ],
};

let fuelCache: { at: number; data: Record<FuelKey, CanonicalFactor> } | null = null;
let transportCache: { at: number; data: Record<TransportModal, CanonicalFactor> } | null = null;

export async function getFuelFactors(): Promise<Record<FuelKey, CanonicalFactor>> {
  if (fuelCache && Date.now() - fuelCache.at < TTL_MS) return fuelCache.data;

  const data = {} as Record<FuelKey, CanonicalFactor>;
  for (const [key, cfg] of Object.entries(FUEL_ROWS) as [FuelKey, (typeof FUEL_ROWS)[FuelKey]][]) {
    const { data: rows, error } = await supabaseEmission
      .from("fatores_ghg_dev")
      .select("produto, ano, co2, ch4, n2o, versao_ghg")
      .eq("produto", cfg.produto)
      .order("ano", { ascending: false })
      .limit(1);
    if (error) throw new Error(`Fator canônico '${key}': erro ao consultar fatores_ghg_dev — ${error.message}`);
    const row = rows?.[0];
    if (!row) throw new Error(`Fator canônico '${key}': linha '${cfg.produto}' não encontrada em fatores_ghg_dev`);
    const value = computeCo2e(row);
    if (!(value > 0)) throw new Error(`Fator canônico '${key}': CO₂e não-positivo para '${cfg.produto}' (ano ${row.ano})`);
    data[key] = {
      value,
      unit: cfg.unit,
      source: `GHG Protocol BR ${row.versao_ghg ?? ""} (${row.produto}, ${row.ano})`.trim(),
    };
  }
  fuelCache = { at: Date.now(), data };
  return data;
}

export async function getDieselFactor(): Promise<CanonicalFactor> {
  return (await getFuelFactors()).diesel;
}

export async function getTransportFactors(): Promise<Record<TransportModal, CanonicalFactor>> {
  if (transportCache && Date.now() - transportCache.at < TTL_MS) return transportCache.data;

  const data = {} as Record<TransportModal, CanonicalFactor>;
  for (const [modal, prefs] of Object.entries(TRANSPORT_ROWS) as [TransportModal, (typeof TRANSPORT_ROWS)[TransportModal]][]) {
    let found: CanonicalFactor | null = null;
    for (const pref of prefs) {
      const { data: rows, error } = await supabaseEmission
        .from("ecoinvent_dev")
        .select("product_name, product_unit, impact_score, kind, geography")
        .eq("product_id", pref.product_id)
        .eq("kind", pref.kind)
        .eq("geography", pref.geography)
        .limit(1);
      if (error) throw new Error(`Fator canônico transporte '${modal}': erro ao consultar ecoinvent_dev — ${error.message}`);
      const row = rows?.[0];
      if (!row) continue;
      const value = parseFloat(String(row.impact_score ?? 0));
      if (!(value > 0)) continue;
      found = {
        value,
        unit: "kgCO₂e/t·km",
        source: `Ecoinvent — ${row.product_name} (${row.geography})`,
      };
      break;
    }
    if (!found) {
      throw new Error(`Fator canônico transporte '${modal}': nenhuma linha de frete encontrada em ecoinvent_dev`);
    }
    data[modal] = found;
  }
  transportCache = { at: Date.now(), data };
  return data;
}

/** Somente para testes: limpa os caches em memória. */
export function __resetCanonicalFactorCache() {
  fuelCache = null;
  transportCache = null;
}
