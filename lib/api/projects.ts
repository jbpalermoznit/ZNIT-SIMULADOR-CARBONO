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
  factor_name: string | null;
  factor_value: number | null;
  factor_unit: string | null;
  source_tier: string | null;
  confidence: string | null;
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

export function uploadAbc(projectId: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  return api.postForm<UploadResult>(`/api/projects/${projectId}/upload-abc`, form);
}

export function listAbcItems(
  projectId: string,
  filters?: { item_type?: string; abc_class?: string; mapping_status?: string }
) {
  const params = new URLSearchParams();
  if (filters?.item_type) params.set("item_type", filters.item_type);
  if (filters?.abc_class) params.set("abc_class", filters.abc_class);
  if (filters?.mapping_status) params.set("mapping_status", filters.mapping_status);
  const qs = params.toString();
  return api.get<AbcItemResponse[]>(`/api/projects/${projectId}/abc-items${qs ? `?${qs}` : ""}`);
}
