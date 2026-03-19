import { api } from "./client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScenarioResultResponse {
  id: string;
  total_kgco2e: number;
  total_tco2e: number;
  intensity_per_m2: number | null;
  scope1_kgco2e: number;
  scope2_kgco2e: number;
  scope3_materials_kgco2e: number;
  scope3_logistics_kgco2e: number;
  items_total: number;
  items_mapped: number;
  items_excluded: number;
  coverage_pct: number;
  calculated_at: string;
}

export interface ScenarioResponse {
  id: string;
  project_id: string;
  name: string;
  description?: string;
  status: string;
  version: number;
  is_base: boolean;
  created_at: string;
  result?: ScenarioResultResponse;
  items_count?: number;
}

export interface ScenarioItemResponse {
  id: string;
  abc_item_id: string;
  cost_code: string;
  description: string;
  item_type: string;
  abc_class: string;
  quantity: number;
  unit: string;
  total_cost: number;
  factor_value?: number;
  factor_unit?: string;
  factor_name?: string;
  source_tier?: string;
  emission_kgco2e?: number;
  emission_tco2e?: number;
  emission_scope3_logistics_kgco2e?: number;
  is_excluded: boolean;
  exclusion_reason?: string;
}

export interface ScenarioDetailResponse extends ScenarioResponse {
  items: ScenarioItemResponse[];
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

export function listScenarios(projectId: string): Promise<ScenarioResponse[]> {
  return api.get(`/api/projects/${projectId}/scenarios`);
}

export function createBaseScenario(projectId: string): Promise<ScenarioResponse> {
  return api.post(`/api/projects/${projectId}/scenarios/base`, {});
}

export function createScenario(
  projectId: string,
  data: { name: string; description?: string; source_scenario_id?: string }
): Promise<ScenarioResponse> {
  return api.post(`/api/projects/${projectId}/scenarios`, data);
}

export function getScenario(scenarioId: string): Promise<ScenarioDetailResponse> {
  return api.get(`/api/scenarios/${scenarioId}`);
}

export function calculateScenario(scenarioId: string): Promise<ScenarioResultResponse> {
  return api.post(`/api/scenarios/${scenarioId}/calculate`, {});
}
