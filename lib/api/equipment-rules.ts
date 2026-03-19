import { api } from "./client";

export interface EquipmentRuleResponse {
  id: string;
  company_id: string;
  match_keyword: string;
  original_description: string;
  category: string;
  fuel_type: string;
  consumption_per_hour: number;
  consumption_unit: string;
  emission_factor_value: number;
  emission_factor_unit: string;
  emission_factor_source: string;
  emission_factor_tier: string;
  scope: number;
  notes: string | null;
  times_applied: number;
  is_active: boolean;
  created_by: string;
  created_at: string;
}

export interface EquipmentRuleCreate {
  original_description: string;
  category: string;
  fuel_type: string;
  consumption_per_hour: number;
  consumption_unit: string;
  emission_factor_value: number;
  emission_factor_unit: string;
  emission_factor_source: string;
  emission_factor_tier: string;
  scope?: number;
  notes?: string;
}

export interface EquipmentSuggestion {
  category: string;
  fuel_type: string;
  consumption_per_hour: number;
  consumption_unit: string;
  emission_factor_value: number;
  emission_factor_unit: string;
  emission_factor_source: string;
  emission_factor_tier: string;
  scope: number;
  total_kgco2e: number;
}

export interface DefaultProfiles {
  profiles: Record<string, { fuel: string; consumption: number; unit: string; scope: number }>;
  fuel_factors: Record<string, { value: number; unit: string; source: string; tier: string }>;
}

export function listEquipmentRules() {
  return api.get<EquipmentRuleResponse[]>("/api/equipment-rules");
}

export function createEquipmentRule(data: EquipmentRuleCreate) {
  return api.post<EquipmentRuleResponse>("/api/equipment-rules", data);
}

export function deleteEquipmentRule(ruleId: string) {
  return api.delete<{ message: string }>(`/api/equipment-rules/${ruleId}`);
}

export function suggestEquipment(itemId: string) {
  return api.get<EquipmentSuggestion>(`/api/equipment-rules/suggest/${itemId}`);
}

export function getEquipmentDefaults() {
  return api.get<DefaultProfiles>("/api/equipment-rules/defaults");
}
