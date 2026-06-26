import { api } from "./client";

export interface PriceEstimateMeta {
  value: number;
  unit: string;
  source_name: string | null;
  source_url: string | null;
  as_of: string | null;
  confidence: "high" | "medium" | "low";
  /** true = estimativa de mercado (IA); false = preço cadastrado no EPD. */
  is_estimate: boolean;
}

export interface MaccBar {
  id: string;
  item_id: string;
  item_description: string;
  item_cost_code: string;
  item_unit: string;
  item_unit_cost: number;
  item_quantity: number;
  baseline_factor: number;
  baseline_source: string;
  baseline_emission_kg: number;
  alternative_factor: number;
  alternative_name: string;
  alternative_source: string;
  alternative_emission_kg: number;
  supplier: string;
  source_tier: string;
  epd_id: number | null;
  declared_unit: string;
  abatement_tco2e: number;
  abatement_unit: string;
  /** Δ custo do projeto (R$); null quando não há preço. */
  delta_cost_r: number | null;
  /** Custo de abatimento (R$/tCO₂e); null = "custo a confirmar". */
  cost_per_tco2e: number | null;
  category: "saving" | "low" | "medium" | "high" | "unknown";
  price_estimate: PriceEstimateMeta | null;
  reason: string;
  score: number;
  country?: string;
}

export interface MaccKpis {
  total_abatement: number;
  savings_abatement: number;
  savings_count: number;
  avg_cost: number;
  total_alternatives: number;
  priced_count: number;
  unpriced_count: number;
}

export interface EpdRecommendation {
  epd_id: number;
  titulo: string;
  company_name: string;
  country: string;
  declared_unit: string;
  declared_value: number | null;
  registration_number: string;
  pdf_url?: string;
  has_gwp: boolean;
  score: number;
  item_id: string;
  item_description: string;
  item_cost_code: string;
  item_quantity: number;
  item_unit: string;
  item_unit_cost: number;
  baseline_factor: number;
  baseline_emission_kg: number;
}

export interface MaccResponse {
  bars: MaccBar[];
  kpis: MaccKpis;
  epd_recommendations?: EpdRecommendation[];
}

export async function getMaccData(projectId: string): Promise<MaccResponse> {
  return api.get<MaccResponse>(`/api/macc/${projectId}`);
}
