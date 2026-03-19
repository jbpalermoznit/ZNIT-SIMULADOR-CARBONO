import { api } from "./client";

export interface FactorRuleResponse {
  id: string;
  company_id: string;
  match_keyword: string;
  original_description: string;
  factor_value: number;
  factor_unit: string;
  factor_name: string;
  source_tier: string;
  source_description: string | null;
  times_applied: number;
  times_overridden: number;
  is_active: boolean;
  created_by: string;
  created_at: string;
}

export interface FactorRuleCreate {
  original_description: string;
  factor_value: number;
  factor_unit: string;
  factor_name: string;
  source_tier: string;
  source_description?: string;
  ecoinvent_product_id?: string;
  ghg_factor_id?: number;
  cecarbon_id?: number;
}

export function listFactorRules() {
  return api.get<FactorRuleResponse[]>("/api/factor-rules");
}

export function createFactorRule(data: FactorRuleCreate) {
  return api.post<FactorRuleResponse>("/api/factor-rules", data);
}

export function deleteFactorRule(ruleId: string) {
  return api.delete<{ message: string }>(`/api/factor-rules/${ruleId}`);
}
