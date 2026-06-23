/**
 * Applies agent decisions to the database via Supabase.
 * Replaces backend/app/services/agent/action_applier.py
 */
import { supabase } from "../supabase";

function normalizeKeyword(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-záàâãéèêíïóôõúüç0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

interface Decision {
  item_id: string;
  action: string;
  justification?: string;
  save_as_rule?: boolean;
  factor_value?: number;
  factor_unit?: string;
  factor_name?: string;
  source_tier?: string;
  equipment_config?: Record<string, unknown>;
  decomposition?: Array<Record<string, unknown>>;
}

export async function applyDecisions(
  decisions: Decision[],
  projectId: string,
  userId = "agent",
  companyId: string,
): Promise<{ resolved: number; rules_saved: number; excluded: number; errors: string[] }> {
  let resolved = 0;
  let rulesSaved = 0;
  let excluded = 0;
  const errors: string[] = [];

  for (const decision of decisions) {
    const { item_id, action } = decision;
    if (!item_id || !action) {
      errors.push(`Decision missing item_id or action: ${JSON.stringify(decision)}`);
      continue;
    }

    const { data: item } = await supabase.from("abc_items").select("*").eq("id", item_id).single();
    if (!item) {
      errors.push(`Item not found: ${item_id}`);
      continue;
    }

    try {
      if (action === "exclude") {
        await applyExclude(item_id, decision);
        excluded++;
      } else if (action === "map_factor") {
        await applyMapFactor(item_id, decision);
        resolved++;
      } else if (action === "equipment_calc") {
        await applyEquipment(item_id, item, decision);
        resolved++;
      } else if (action === "decompose") {
        await applyExclude(item_id, { justification: "Item agrupado sem decomposição disponível — excluído temporariamente." });
        resolved++;
      } else {
        errors.push(`Unknown action '${action}' for item ${item_id}`);
        continue;
      }

      if (decision.save_as_rule) {
        await saveRule(item, decision, userId, companyId);
        rulesSaved++;
      }
    } catch (e: unknown) {
      errors.push(`Error applying decision for ${item_id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { resolved, rules_saved: rulesSaved, excluded, errors };
}

async function applyExclude(itemId: string, decision: Partial<Decision>) {
  // Upsert mapping
  const { data: existing } = await supabase.from("item_mappings").select("id").eq("abc_item_id", itemId).single();
  const mappingData = {
    abc_item_id: itemId,
    source_tier: "excluded",
    mapped_by: "agent",
    confidence: "high",
    factor_name: "Excluído",
    factor_value: 0,
    factor_unit: "",
    factor_source: decision.justification ?? "Excluído pelo agente",
    notes: decision.justification ?? "",
  };

  if (existing) {
    await supabase.from("item_mappings").update(mappingData).eq("id", existing.id);
  } else {
    await supabase.from("item_mappings").insert(mappingData);
  }

  await supabase.from("abc_items").update({ mapping_status: "excluded" }).eq("id", itemId);
}

async function applyMapFactor(itemId: string, decision: Decision) {
  const { data: existing } = await supabase.from("item_mappings").select("id").eq("abc_item_id", itemId).single();
  const mappingData = {
    abc_item_id: itemId,
    source_tier: decision.source_tier ?? "cecarbon",
    factor_value: decision.factor_value ?? 0,
    factor_unit: decision.factor_unit ?? "",
    factor_name: decision.factor_name ?? "",
    factor_source: decision.source_tier ?? "",
    confidence: "high",
    mapped_by: "agent",
  };

  if (existing) {
    await supabase.from("item_mappings").update(mappingData).eq("id", existing.id);
  } else {
    await supabase.from("item_mappings").insert(mappingData);
  }

  await supabase.from("abc_items").update({ mapping_status: "auto" }).eq("id", itemId);
}

async function applyEquipment(itemId: string, item: Record<string, unknown>, decision: Decision) {
  const config = decision.equipment_config ?? {};
  const fuelType = config.fuel_type as string ?? "diesel";
  const consumption = config.consumption_per_hour as number ?? 0;
  const emissionFactor = config.emission_factor as number ?? 2.643;
  const factorPerHour = consumption * emissionFactor;
  const consumptionUnit = config.consumption_unit as string ?? "L/h";

  const { data: existing } = await supabase.from("item_mappings").select("id").eq("abc_item_id", itemId).single();
  const mappingData = {
    abc_item_id: itemId,
    source_tier: "ghg_protocol",
    factor_value: factorPerHour,
    factor_unit: `kgCO₂e/h (${consumption} ${consumptionUnit} × ${emissionFactor} kgCO₂/${consumptionUnit.replace("/h", "")})`,
    factor_name: `${item.description} (${fuelType})`,
    factor_source: "GHG Protocol BR + perfil de equipamento",
    confidence: "high",
    mapped_by: "agent",
  };

  if (existing) {
    await supabase.from("item_mappings").update(mappingData).eq("id", existing.id);
  } else {
    await supabase.from("item_mappings").insert(mappingData);
  }

  await supabase.from("abc_items").update({ mapping_status: "auto" }).eq("id", itemId);
}

async function saveRule(item: Record<string, unknown>, decision: Decision, userId: string, companyId: string) {
  const keyword = normalizeKeyword(item.description as string);
  const action = decision.action;

  if (action === "equipment_calc") {
    const config = decision.equipment_config ?? {};
    const { data: existing } = await supabase
      .from("equipment_rules")
      .select("id, times_applied")
      .eq("match_keyword", keyword)
      .eq("is_active", true)
      .single();

    if (existing) {
      await supabase.from("equipment_rules").update({ times_applied: (existing.times_applied ?? 0) + 1 }).eq("id", existing.id);
    } else {
      const consumptionUnit = config.consumption_unit as string ?? "L/h";
      await supabase.from("equipment_rules").insert({
        company_id: companyId,
        match_keyword: keyword,
        original_description: item.description,
        category: config.fuel_type ?? "diesel",
        fuel_type: config.fuel_type ?? "diesel",
        consumption_per_hour: config.consumption_per_hour ?? 0,
        consumption_unit: consumptionUnit,
        emission_factor_value: config.emission_factor ?? 2.643,
        emission_factor_unit: `kgCO₂/${consumptionUnit.replace("/h", "")}`,
        emission_factor_source: "GHG Protocol BR",
        emission_factor_tier: "ghg_protocol",
        scope: 1,
        created_by: userId,
      });
    }
  } else if (action === "map_factor" || action === "exclude") {
    const { data: existing } = await supabase
      .from("factor_rules")
      .select("id, times_applied")
      .eq("match_keyword", keyword)
      .eq("is_active", true)
      .single();

    if (existing) {
      await supabase.from("factor_rules").update({ times_applied: (existing.times_applied ?? 0) + 1 }).eq("id", existing.id);
    } else {
      await supabase.from("factor_rules").insert({
        company_id: companyId,
        match_keyword: keyword,
        original_description: item.description,
        factor_value: decision.factor_value ?? 0,
        factor_unit: decision.factor_unit ?? "",
        factor_name: decision.factor_name ?? "excluído",
        source_tier: action !== "exclude" ? (decision.source_tier ?? "excluded") : "excluded",
        created_by: userId,
      });
    }
  }
}
