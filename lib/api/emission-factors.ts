import { api } from "./client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EcoinventResult {
  product_id: string;
  activity_id: string;
  product_name: string;
  product_name_pt?: string;
  activity_name: string;
  activity_name_pt?: string;
  product_unit: string;
  geography?: string;
  impact_score: number;
  impact_unit: string;
  year_start?: number;
  year_end?: number;
  source_tier: "ecoinvent";
}

export interface GhgResult {
  id: number;
  produto: string;
  categoria?: string;
  pais?: string;
  ano?: number;
  co2: number;
  ch4: number;
  n2o: number;
  co2_bio: number;
  co2e_total: number;
  versao_ghg?: string;
  source_tier: "ghg_protocol";
}

export interface EpdCatalogResult {
  id: number;
  epd_id?: string;
  titulo: string;
  informacao_produto?: string;
  registration_number?: string;
  status?: string;
  company_name?: string;
  country?: string;
  geographical_scopes?: string;
  registration_date?: string;
  valid_until?: string;
  pdf_url?: string;
  source_url?: string;
  en15804_compliant?: string;
  source_tier: "epd_catalog";
}

export interface CecarbonResult {
  id: number;
  description: string;
  unit: string;
  factor_value: number;
  factor_unit: string;
  reference: string;
  density: number;
  source_tier: "cecarbon";
}

export interface EmissionSearchResponse {
  ecoinvent: EcoinventResult[];
  ghg_protocol: GhgResult[];
  cecarbon: CecarbonResult[];
  epd_catalog: EpdCatalogResult[];
}

export interface AutoMatchResult {
  results: AutoMatchCandidate[];
  best: AutoMatchCandidate | null;
  confidence: "high" | "medium" | "low" | null;
}

export interface AutoMatchCandidate {
  source_tier: "ecoinvent" | "ghg_protocol" | "cecarbon";
  score: number;
  factor_value: number;
  factor_unit: string;
  product_unit?: string;
  factor_name: string;
  factor_source?: string;
  geography?: string;
  ecoinvent_product_id?: string;
  ecoinvent_activity_id?: string;
  ghg_factor_id?: number;
  cecarbon_id?: number;
  density?: number;
}

export interface MappingConfirmRequest {
  source_tier: "ecoinvent" | "ghg_protocol" | "cecarbon" | "epd" | "user_custom" | "excluded";
  ecoinvent_product_id?: string;
  ecoinvent_activity_id?: string;
  ghg_factor_id?: number;
  cecarbon_id?: number;
  epd_id?: number;
  factor_value?: number;
  factor_unit?: string;
  factor_name?: string;
  custom_factor_source?: string;
  exclusion_justification?: string;
  distance_km?: number;
  transport_modal?: string;
  notes?: string;
  // Scenario-aware save (optional). When provided, the server also propagates
  // the change to scenario_items and recalculates the scenario. With
  // mode="fork", the response includes `new_scenario_id`.
  scenario_id?: string;
  mode?: "update" | "fork";
  new_scenario_name?: string;
  new_scenario_description?: string;
  /** When substituting a factor (typically EPD), the analyst may declare a
   *  new unit cost for the product. Persisted on scenario_items.unit_cost_override.
   *  Null/undefined → keep the original abc_items.unit_cost. */
  unit_cost_override?: number | null;
}

export interface MappingResponse {
  id: string;
  abc_item_id: string;
  source_tier: string;
  factor_value: number;
  factor_unit: string;
  factor_name: string;
  factor_source?: string;
  confidence?: string;
  similarity_score?: number;
  mapped_by: string;
  notes?: string;
  /** Justification text written by the auto-exclusion pass (B/D/E/F). */
  exclusion_justification?: string | null;
  /** Set when the server forked a new scenario (mode=fork). */
  new_scenario_id?: string | null;
  scenario_apply_error?: string | null;
  /** Cenários que referenciam o item e NÃO foram atualizados (edição sem
   *  scenario_id/mode) — mantêm o fator congelado até um recálculo. */
  stale_scenarios?: Array<{ id: string; name: string | null }>;
}

export interface AutoMapResult {
  total_items: number;
  auto_mapped: number;
  suggested: number;
  pending: number;
  already_mapped: number;
  details: {
    item_id: string;
    description: string;
    confidence: string | null;
    best_match: string | null;
    score: number;
  }[];
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

export function searchEmissionFactors(
  q: string,
  tier?: string,
  limit = 10
): Promise<EmissionSearchResponse> {
  const params = new URLSearchParams({ q, limit: String(limit) });
  if (tier) params.set("tier", tier);
  return api.get(`/api/emission-factors/search?${params}`);
}

export function autoMatchItem(itemId: string): Promise<AutoMatchResult> {
  return api.get(`/api/emission-factors/auto-match/${itemId}`);
}

export function autoMapProject(projectId: string): Promise<AutoMapResult> {
  return api.post(`/api/emission-factors/auto-map/${projectId}`, {});
}

export function confirmMapping(
  itemId: string,
  data: MappingConfirmRequest
): Promise<MappingResponse> {
  return api.put(`/api/emission-factors/mapping/${itemId}`, data);
}

export function getMapping(itemId: string): Promise<MappingResponse | null> {
  return api.get(`/api/emission-factors/mapping/${itemId}`);
}
