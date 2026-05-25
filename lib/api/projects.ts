import { api } from "./client";

export interface ProjectResponse {
  id: string;
  company_id: string;
  name: string;
  client_name: string | null;
  address: string | null;
  total_area_m2: number | null;
  building_type: string | null;
  status: string;
  created_at: string;
  total_tco2e: number | null;
  intensity_kgco2e_per_m2: number | null;
  coverage_pct: number | null;
  scenarios_count: number;
  items_count: number;
}

export interface UploadResult {
  abc_curve_id: string;
  file_name: string;
  total_items: number;
  total_cost: number;
  type_summary: Record<string, number>;
  class_summary: Record<string, number>;
  warnings: string[];
  auto_map: {
    total_items: number;
    auto_mapped: number;
    suggested: number;
    pending: number;
    already_mapped: number;
    auto_excluded?: number;
  } | null;
  base_scenario_id: string | null;
  base_scenario_error: string | null;
  enrichment?: {
    cost_codes_loaded: number;
    proof_cost_codes_loaded: number;
  };
}

export interface AbcItemResponse {
  id: string;
  abc_curve_id: string;
  cost_code: string;
  description: string;
  adf: number | null;
  quantity: number;
  unit: string;
  unit_cost: number;
  total_cost: number;
  supplier: string | null;
  cost_pct: number;
  cumulative_pct: number;
  abc_class: string;
  item_type: string;
  item_order: number;
  mapping_status: string;
  classification_note: string | null;
  parent_item_id: string | null;
  factor_name: string | null;
  factor_value: number | null;
  factor_unit: string | null;
  source_tier: string | null;
  confidence: string | null;
  /** True when the exclusion was made automatically by the classifier
   *  (mapped_by='auto_excluded' OR legacy auto-justification text).
   *  Distinguishes from the user's manual "Desconsiderar" action. */
  auto_excluded: boolean;
  /** True for rows written by the *old* classifier (pre-rescue-fix).
   *  The Items page silently fires reclassify-blocked once on load
   *  whenever any item carries this, so legacy projects self-heal. */
  legacy_auto_excluded: boolean;
}

export function listProjects() {
  return api.get<ProjectResponse[]>("/api/projects");
}

export function getProject(projectId: string) {
  return api.get<ProjectResponse>(`/api/projects/${projectId}`);
}

export function createProject(data: {
  name: string;
  client_name?: string;
  address?: string;
  total_area_m2?: number;
  building_type?: string;
}) {
  return api.post<ProjectResponse>("/api/projects", data);
}

export function uploadAbc(
  projectId: string,
  file: File,
  opts?: {
    scenarioName?: string;
    asScenario?: boolean;
    /** Optional iTwo Cost Code catalog for canonical descriptions. */
    costCodesFile?: File;
    /** Optional Relatório Proof for assemblies-per-cost-code. */
    proofFile?: File;
  }
) {
  const form = new FormData();
  form.append("file", file);
  if (opts?.scenarioName) form.append("scenario_name", opts.scenarioName);
  if (opts?.asScenario) form.append("as_scenario", "true");
  if (opts?.costCodesFile) form.append("cost_codes_file", opts.costCodesFile);
  if (opts?.proofFile) form.append("proof_file", opts.proofFile);
  return api.postForm<UploadResult>(`/api/projects/${projectId}/upload-abc`, form);
}

export interface ScenarioUploadResult {
  scenario_id: string;
  scenario_name: string;
  abc_curve_id: string;
  total_parent_items: number;
  total_child_items: number;
  total_items_for_calculation: number;
  auto_mapped: number;
  suggested: number;
  pending: number;
  recipes_used: {
    composicoes: number;
    insumosMaterial: number;
    uniqueMaterials: number;
  };
  result: {
    total_tco2e: number;
    total_kgco2e: number;
    items_mapped: number;
    items_total: number;
    coverage_pct: number;
  };
  warnings: string[];
}

export function uploadScenario(
  projectId: string,
  itemsFile: File,
  insumosFile: File,
  scenarioName: string
) {
  const form = new FormData();
  form.append("items_file", itemsFile);
  form.append("insumos_file", insumosFile);
  form.append("scenario_name", scenarioName);
  return api.postForm<ScenarioUploadResult>(
    `/api/projects/${projectId}/upload-scenario`,
    form
  );
}

export function listAbcItems(
  projectId: string,
  filters?: { item_type?: string; abc_class?: string; mapping_status?: string; curve_id?: string }
) {
  const params = new URLSearchParams();
  if (filters?.item_type) params.set("item_type", filters.item_type);
  if (filters?.abc_class) params.set("abc_class", filters.abc_class);
  if (filters?.mapping_status) params.set("mapping_status", filters.mapping_status);
  if (filters?.curve_id) params.set("curve_id", filters.curve_id);
  const qs = params.toString();
  return api.get<AbcItemResponse[]>(`/api/projects/${projectId}/abc-items${qs ? `?${qs}` : ""}`);
}

export interface ReclassifyResult {
  reverted: number;
  auto_mapped: number;
  suggested: number;
  still_blocked: number;
  scenarios_recalculated: number;
}

/**
 * Revisita itens Tipo C que foram silenciosamente auto-excluídos pela
 * regra antiga "prefixo 45xx → F". Reverte para `blocked`, tenta um
 * auto-match enriquecido (assemblies + canonical do upload) e
 * recalcula todos os cenários do projeto.
 */
export function reclassifyBlocked(projectId: string) {
  return api.post<ReclassifyResult>(
    `/api/projects/${projectId}/reclassify-blocked`,
    {}
  );
}
