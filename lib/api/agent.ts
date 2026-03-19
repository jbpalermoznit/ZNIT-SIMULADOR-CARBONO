import { api } from "./client";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PendingItem {
  id: string;
  cost_code: string;
  description: string;
  item_type: string;
  total_cost: number;
  unit: string;
  quantity: number;
}

export interface PendingSummary {
  total_pending: number;
  by_type: Record<string, number>;
  items: PendingItem[];
}

export interface AgentDecision {
  item_id: string;
  action: "exclude" | "map_factor" | "equipment_calc" | "decompose";
  factor_value?: number;
  factor_unit?: string;
  factor_name?: string;
  source_tier?: string;
  justification: string;
  save_as_rule: boolean;
  equipment_config?: {
    fuel_type: string;
    consumption_per_hour: number;
    consumption_unit: string;
    emission_factor: number;
    emission_factor_unit: string;
  };
  decomposition?: {
    description: string;
    cost_pct: number;
    item_type: string;
    factor_value?: number;
    factor_unit?: string;
    factor_name?: string;
  }[];
  // UI state
  accepted?: boolean;
  rejected?: boolean;
}

export interface ResolveResponse {
  agent_response: string;
  decisions: AgentDecision[];
  summary: {
    proposed: number;
    exclude: number;
    map_factor: number;
    equipment_calc: number;
    decompose: number;
  };
}

export interface ApplyResult {
  resolved: number;
  rules_saved: number;
  excluded: number;
  errors: string[];
}

// ── API calls ─────────────────────────────────────────────────────────────────

export async function getPendingSummary(projectId: string): Promise<PendingSummary> {
  return api.get(`/api/agent/projects/${projectId}/pending-summary`);
}

export async function resolveItems(
  projectId: string,
  message: string,
  itemType?: string,
  itemIds?: string[],
  conversationHistory?: { role: string; content: string }[]
): Promise<ResolveResponse> {
  return api.post(`/api/agent/projects/${projectId}/resolve`, {
    message,
    item_type: itemType,
    item_ids: itemIds,
    conversation_history: conversationHistory,
  });
}

export async function applyDecisions(
  projectId: string,
  decisions: AgentDecision[]
): Promise<ApplyResult> {
  return api.post(`/api/agent/projects/${projectId}/apply`, { decisions });
}
