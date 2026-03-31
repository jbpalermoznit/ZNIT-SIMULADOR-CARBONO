import { api } from "./client";

export interface MaccBar {
  id: string;
  item_description: string;
  item_cost_code: string;
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
  abatement_tco2e: number;
  abatement_unit: string;
  cost_per_tco2e: number;
  score: number;
  category: "saving" | "low" | "medium" | "high";
  country?: string;
}

export interface MaccKpis {
  total_abatement: number;
  savings_abatement: number;
  savings_count: number;
  avg_cost: number;
  total_alternatives: number;
}

export interface EpdRecommendation {
  epd_id: number;
  titulo: string;
  company_name: string;
  country: string;
  declared_unit: string;
  declared_value: number | null;
  registration_number: string;
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
