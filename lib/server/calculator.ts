/**
 * Emission calculation engine.
 * Port of backend/app/services/calculator.py
 */
import { supabase } from "./supabase";

// --------------------------------------------------------------------------
// Transport factors — kgCO2e per tonne-km (GHG Protocol BR)
// --------------------------------------------------------------------------
const TRANSPORT_FACTORS: Record<string, number> = {
  truck: 0.062,
  rail: 0.022,
  ship: 0.008,
};

// --------------------------------------------------------------------------
// Unit normalisation / conversion
// --------------------------------------------------------------------------

const UNIT_MAP: Record<string, string> = {
  t: "t",
  ton: "t",
  tonelada: "t",
  toneladas: "t",
  kg: "kg",
  quilograma: "kg",
  m3: "m3",
  "m³": "m3",
  m2: "m2",
  "m²": "m2",
  m: "m",
  ml: "m",
  l: "L",
  litro: "L",
  litros: "L",
  un: "un",
  unit: "un",
  unidade: "un",
  "pç": "un",
  "peça": "un",
};

export function normalizeUnit(unitStr: string | null | undefined): string {
  if (!unitStr) return "";
  let u = unitStr.toLowerCase().trim();
  // Remove "kgco2/" or "kgco₂/" prefix to get the denominator unit
  const prefixes = [
    "kgco₂/",
    "kgco₂e/",
    "kgco2/",
    "kgco2e/",
    "kg co2-eq/",
    "kg co2-eq",
  ];
  for (const prefix of prefixes) {
    if (u.startsWith(prefix)) {
      u = u.slice(prefix.length).trim();
      break;
    }
  }
  return UNIT_MAP[u] ?? u;
}

export function getConversionFactor(
  itemUnit: string | null | undefined,
  factorUnit: string | null | undefined
): number {
  const iu = normalizeUnit(itemUnit);
  const fu = normalizeUnit(factorUnit);

  if (!iu || !fu) return 1.0;
  if (iu === fu) return 1.0;

  const MASS_TO_KG: Record<string, number> = { kg: 1.0, t: 1000.0, g: 0.001 };
  const VOL_TO_M3: Record<string, number> = { m3: 1.0, L: 0.001 };
  const AREA = new Set(["m2"]);
  const LENGTH = new Set(["m"]);
  const COUNT = new Set(["un"]);

  // Mass conversions
  if (iu in MASS_TO_KG && fu in MASS_TO_KG) {
    return MASS_TO_KG[iu] / MASS_TO_KG[fu];
  }
  // Volume conversions
  if (iu in VOL_TO_M3 && fu in VOL_TO_M3) {
    return VOL_TO_M3[iu] / VOL_TO_M3[fu];
  }
  // Same family
  for (const family of [AREA, LENGTH, COUNT]) {
    if (family.has(iu) && family.has(fu)) return 1.0;
  }
  // Incompatible
  return 0.0;
}

// --------------------------------------------------------------------------
// Item-level emission helpers
// --------------------------------------------------------------------------

interface MappingRow {
  factor_value: number | null;
  factor_unit: string | null;
  factor_name: string | null;
  source_tier: string | null;
  exclusion_justification?: string | null;
  distance_km?: number | null;
  transport_modal?: string | null;
}

interface AbcItemRow {
  id: string;
  quantity: number | null;
  unit: string | null;
  mapping_status: string | null;
  [key: string]: unknown;
}

function calcItemEmission(item: AbcItemRow, mapping: MappingRow | null): number {
  if (!mapping || mapping.source_tier === "excluded") return 0.0;
  if (!mapping.factor_value || mapping.factor_value <= 0) return 0.0;
  const qty = item.quantity ?? 0;
  const conversion = getConversionFactor(item.unit, mapping.factor_unit);
  return qty * mapping.factor_value * conversion;
}

function calcLogisticsEmission(mapping: MappingRow | null): number {
  if (!mapping || !mapping.distance_km) return 0.0;
  const factor =
    TRANSPORT_FACTORS[mapping.transport_modal ?? "truck"] ?? 0.062;
  const tonnage = 1.0; // placeholder
  return mapping.distance_km * tonnage * factor;
}

// --------------------------------------------------------------------------
// Scenario result calculation
// --------------------------------------------------------------------------

interface ScenarioItemRow {
  id: string;
  is_excluded: boolean | null;
  emission_kgco2e: number | null;
  emission_scope3_logistics_kgco2e: number | null;
  [key: string]: unknown;
}

interface ProjectRow {
  id: string;
  total_area_m2: number | null;
  [key: string]: unknown;
}

async function calculateScenarioResult(
  scenarioId: string,
  project: ProjectRow
) {
  const { data: items } = await supabase
    .from("scenario_items")
    .select("*")
    .eq("scenario_id", scenarioId);

  const allItems = (items ?? []) as ScenarioItemRow[];

  let totalMaterials = 0;
  let totalLogistics = 0;
  let itemsMapped = 0;
  let itemsExcluded = 0;

  for (const si of allItems) {
    if (si.is_excluded) {
      itemsExcluded++;
      continue;
    }
    if (si.emission_kgco2e && si.emission_kgco2e > 0) {
      totalMaterials += si.emission_kgco2e;
      itemsMapped++;
    }
    if (si.emission_scope3_logistics_kgco2e) {
      totalLogistics += si.emission_scope3_logistics_kgco2e;
    }
  }

  const totalKg = totalMaterials + totalLogistics;
  const totalT = totalKg / 1000;

  let intensity: number | null = null;
  if (project.total_area_m2 && project.total_area_m2 > 0) {
    intensity = totalT / project.total_area_m2;
  }

  const eligible = allItems.length - itemsExcluded;
  const coverage = eligible > 0 ? (itemsMapped / eligible) * 100 : 0;

  // Remove old result
  await supabase
    .from("scenario_results")
    .delete()
    .eq("scenario_id", scenarioId);

  // Insert new result
  const resultRow = {
    scenario_id: scenarioId,
    total_kgco2e: Math.round(totalKg * 100) / 100,
    total_tco2e: Math.round(totalT * 10000) / 10000,
    intensity_per_m2: intensity
      ? Math.round(intensity * 1000000) / 1000000
      : null,
    scope1_kgco2e: 0,
    scope2_kgco2e: 0,
    scope3_materials_kgco2e: Math.round(totalMaterials * 100) / 100,
    scope3_logistics_kgco2e: Math.round(totalLogistics * 100) / 100,
    items_total: allItems.length,
    items_mapped: itemsMapped,
    items_excluded: itemsExcluded,
    coverage_pct: Math.round(coverage * 10) / 10,
  };

  const { data: inserted, error } = await supabase
    .from("scenario_results")
    .insert(resultRow)
    .select()
    .single();

  if (error) throw new Error(`Erro ao salvar resultado: ${error.message}`);
  return inserted;
}

// --------------------------------------------------------------------------
// Create base scenario
// --------------------------------------------------------------------------

export async function createBaseScenario(
  projectId: string,
  userId: string,
  options?: {
    abcCurveId?: string;
    scenarioName?: string;
    isBase?: boolean;
  }
) {
  // Get project
  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();

  if (!project) throw new Error("Projeto não encontrado");

  // Get ABC curve (specific or latest)
  let curve: Record<string, unknown> | null = null;
  if (options?.abcCurveId) {
    const { data } = await supabase
      .from("abc_curves")
      .select("*")
      .eq("id", options.abcCurveId)
      .single();
    curve = data;
  } else {
    const { data: curves } = await supabase
      .from("abc_curves")
      .select("*")
      .eq("project_id", projectId)
      .order("imported_at", { ascending: false })
      .limit(1);
    curve = curves?.[0] ?? null;
  }

  if (!curve) throw new Error("Nenhuma curva ABC importada");

  const isBase = options?.isBase ?? true;
  const scenarioName = options?.scenarioName ?? "Cenário Base";

  // Remove old base scenario (only if creating a base scenario)
  if (isBase) {
    const { data: oldBases } = await supabase
      .from("scenarios")
      .select("id")
      .eq("project_id", projectId)
      .eq("is_base", true);

    if (oldBases && oldBases.length > 0) {
      for (const ob of oldBases) {
        await supabase
          .from("scenario_items")
          .delete()
          .eq("scenario_id", ob.id);
        await supabase
          .from("scenario_results")
          .delete()
          .eq("scenario_id", ob.id);
        await supabase.from("scenarios").delete().eq("id", ob.id);
      }
    }
  }

  // Create scenario (try with abc_curve_id, fallback without)
  const scenarioInsert: Record<string, unknown> = {
    project_id: projectId,
    name: scenarioName,
    description:
      isBase
        ? "Cenário base gerado automaticamente a partir dos mapeamentos atuais."
        : `Cenário criado a partir da curva ${(curve as { file_name?: string }).file_name ?? ""}`,
    is_base: isBase,
    status: "draft",
    created_by: userId,
  };

  let scenario: Record<string, unknown> | null = null;
  let scErr: { message: string } | null = null;

  const scRes1 = await supabase
    .from("scenarios")
    .insert({ ...scenarioInsert, abc_curve_id: curve.id as string })
    .select()
    .single();

  if (scRes1.error?.message?.includes("abc_curve_id")) {
    const scRes2 = await supabase
      .from("scenarios")
      .insert(scenarioInsert)
      .select()
      .single();
    scenario = scRes2.data;
    scErr = scRes2.error;
  } else {
    scenario = scRes1.data;
    scErr = scRes1.error;
  }

  if (scErr || !scenario) throw new Error("Erro ao criar cenário");

  // Get all items from the curve — skip blocked items (composição-pai)
  const { data: items } = await supabase
    .from("abc_items")
    .select("*")
    .eq("abc_curve_id", curve.id as string)
    .neq("mapping_status", "blocked")
    .order("item_order");

  const allItems = (items ?? []) as AbcItemRow[];
  const itemIds = allItems.map((i) => i.id);

  // Pre-load mappings
  const mappingByItem: Record<string, MappingRow> = {};
  if (itemIds.length > 0) {
    const { data: mappings } = await supabase
      .from("item_mappings")
      .select("*")
      .in("abc_item_id", itemIds);

    for (const m of mappings ?? []) {
      mappingByItem[m.abc_item_id] = m as MappingRow;
    }
  }

  // Create scenario items
  const scenarioItems = allItems.map((item) => {
    const mapping = mappingByItem[item.id] ?? null;
    const isExcluded =
      item.mapping_status === "excluded" ||
      (mapping !== null && mapping.source_tier === "excluded");

    const emission = calcItemEmission(item, mapping);
    const logistics = calcLogisticsEmission(mapping);

    return {
      scenario_id: scenario.id,
      abc_item_id: item.id,
      factor_value: mapping?.factor_value ?? null,
      factor_unit: mapping?.factor_unit ?? null,
      factor_name: mapping?.factor_name ?? null,
      source_tier: mapping?.source_tier ?? null,
      emission_kgco2e: emission,
      emission_scope3_logistics_kgco2e: logistics,
      is_excluded: isExcluded,
      exclusion_reason:
        mapping && isExcluded ? mapping.exclusion_justification ?? null : null,
    };
  });

  if (scenarioItems.length > 0) {
    const { error: siErr } = await supabase
      .from("scenario_items")
      .insert(scenarioItems);
    if (siErr) throw new Error(`Erro ao criar itens: ${siErr.message}`);
  }

  // Calculate result
  const result = await calculateScenarioResult(scenario.id as string, project as ProjectRow);

  return { scenario, result };
}

// --------------------------------------------------------------------------
// Recalculate existing scenario
// --------------------------------------------------------------------------

export async function recalculateScenario(scenarioId: string) {
  const { data: scenario } = await supabase
    .from("scenarios")
    .select("*")
    .eq("id", scenarioId)
    .single();

  if (!scenario) throw new Error("Cenário não encontrado");

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", scenario.project_id)
    .single();

  if (!project) throw new Error("Projeto não encontrado");

  // Load scenario items
  const { data: scenarioItems } = await supabase
    .from("scenario_items")
    .select("*")
    .eq("scenario_id", scenarioId);

  for (const si of scenarioItems ?? []) {
    if (si.is_excluded) {
      await supabase
        .from("scenario_items")
        .update({ emission_kgco2e: 0 })
        .eq("id", si.id);
      continue;
    }

    const { data: abcItem } = await supabase
      .from("abc_items")
      .select("*")
      .eq("id", si.abc_item_id)
      .single();

    if (abcItem && si.factor_value) {
      const qty = si.quantity_override ?? abcItem.quantity ?? 0;
      const conversion = getConversionFactor(abcItem.unit, si.factor_unit);
      const emission = qty * si.factor_value * conversion;
      await supabase
        .from("scenario_items")
        .update({ emission_kgco2e: emission })
        .eq("id", si.id);
    }
  }

  const result = await calculateScenarioResult(scenarioId, project);
  return result;
}

// --------------------------------------------------------------------------
// Apply a factor change to a scenario item, then recalculate the scenario
// --------------------------------------------------------------------------

export interface ScenarioItemFactorPatch {
  factor_value: number | null;
  factor_unit: string | null;
  factor_name: string | null;
  source_tier: string | null;
  is_excluded?: boolean;
  exclusion_reason?: string | null;
  /** Optional new unit cost for this item in the scenario. null → no
   *  override (use abc_items.unit_cost); undefined → don't touch existing
   *  override. Persisted on scenario_items.unit_cost_override. */
  unit_cost_override?: number | null;
}

/**
 * Patch the scenario_items row for {scenarioId, abcItemId} with the new
 * factor data, then recalculate the whole scenario. Returns the recalculated
 * scenario_results row.
 */
export async function applyFactorToScenarioItem(
  scenarioId: string,
  abcItemId: string,
  patch: ScenarioItemFactorPatch
) {
  const update: Record<string, unknown> = {
    factor_value: patch.factor_value,
    factor_unit: patch.factor_unit,
    factor_name: patch.factor_name,
    source_tier: patch.source_tier,
  };
  if (patch.is_excluded !== undefined) update.is_excluded = patch.is_excluded;
  if (patch.exclusion_reason !== undefined) update.exclusion_reason = patch.exclusion_reason;
  // Only touch unit_cost_override when the patch explicitly carries it,
  // so unrelated updates don't clobber an existing override.
  if (patch.unit_cost_override !== undefined) {
    update.unit_cost_override = patch.unit_cost_override;
  }

  const { error } = await supabase
    .from("scenario_items")
    .update(update)
    .eq("scenario_id", scenarioId)
    .eq("abc_item_id", abcItemId);

  if (error) throw new Error(`Erro ao atualizar item do cenário: ${error.message}`);

  return recalculateScenario(scenarioId);
}
