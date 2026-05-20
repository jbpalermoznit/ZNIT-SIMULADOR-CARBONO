/**
 * Run auto-mapping for all pending Type A items of an ABC curve.
 *
 * Used both by the explicit POST /api/emission-factors/auto-map/[projectId]
 * endpoint and by the upload-abc flow (where we auto-map + create the base
 * scenario in one shot, so the user lands on Itens with everything
 * calculated).
 */
import { supabase } from "./supabase";
import { autoMatchItem } from "./emission-mapper";

export interface AutoMapResult {
  total_items: number;
  auto_mapped: number;
  suggested: number;
  pending: number;
  already_mapped: number;
}

export async function runAutoMapForCurve(
  curveId: string,
  companyId: string
): Promise<AutoMapResult> {
  const { count: alreadyMapped } = await supabase
    .from("abc_items")
    .select("id", { count: "exact", head: true })
    .eq("abc_curve_id", curveId)
    .eq("item_type", "A")
    .in("mapping_status", ["auto", "manual"]);

  const { data: items } = await supabase
    .from("abc_items")
    .select("id, description, unit, item_order")
    .eq("abc_curve_id", curveId)
    .eq("item_type", "A")
    .eq("mapping_status", "pending")
    .order("item_order");

  if (!items || items.length === 0) {
    return {
      total_items: 0,
      auto_mapped: 0,
      suggested: 0,
      pending: 0,
      already_mapped: alreadyMapped ?? 0,
    };
  }

  let mapped = 0;
  let suggested = 0;
  let pending = 0;

  for (const item of items) {
    const match = await autoMatchItem(
      item.description as string,
      item.unit as string,
      companyId
    );
    const best = match.best;
    const confidence = match.confidence;

    if (best && (best.factor_value ?? 0) > 0) {
      await supabase.from("item_mappings").insert({
        abc_item_id: item.id,
        source_tier: best.source_tier,
        ecoinvent_product_id: best.ecoinvent_product_id ?? null,
        ecoinvent_activity_id: best.ecoinvent_activity_id ?? null,
        ghg_factor_id: best.ghg_factor_id ?? null,
        factor_value: best.factor_value,
        factor_unit: best.factor_unit,
        product_unit: best.product_unit ?? "",
        factor_name: best.factor_name,
        factor_source: best.factor_source ?? null,
        confidence,
        similarity_score: best.score / 100.0,
        mapped_by: best.source_tier === "rule" ? "rule" : "auto",
      });

      const newStatus = confidence === "high" ? "auto" : "manual";
      await supabase
        .from("abc_items")
        .update({ mapping_status: newStatus })
        .eq("id", item.id);

      if (confidence === "high") mapped++;
      else suggested++;
    } else {
      pending++;
    }
  }

  return {
    total_items: items.length,
    auto_mapped: mapped,
    suggested,
    pending,
    already_mapped: alreadyMapped ?? 0,
  };
}
