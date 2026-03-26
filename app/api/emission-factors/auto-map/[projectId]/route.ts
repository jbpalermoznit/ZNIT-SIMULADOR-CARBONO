/**
 * POST /api/emission-factors/auto-map/[projectId]
 * Auto-map all pending Type A items in a project.
 * Port of backend/app/api/emission_factors.py — auto_map_project
 */

import { NextRequest } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/server/auth";
import { supabase } from "@/lib/server/supabase";
import { autoMatchItem } from "@/lib/server/emission-mapper";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  let user;
  try {
    user = await getCurrentUser(req);
  } catch {
    return unauthorized();
  }

  const { projectId } = await params;

  // Fetch latest curve
  const { data: curves } = await supabase
    .from("abc_curves")
    .select("id")
    .eq("project_id", projectId)
    .order("imported_at", { ascending: false })
    .limit(1);

  const curve = curves?.[0];
  if (!curve) {
    return Response.json(
      { detail: "Nenhuma curva ABC encontrada" },
      { status: 404 }
    );
  }

  // Count already mapped items
  const { count: alreadyMapped } = await supabase
    .from("abc_items")
    .select("id", { count: "exact", head: true })
    .eq("abc_curve_id", curve.id)
    .eq("item_type", "A")
    .in("mapping_status", ["auto", "manual"]);

  // Fetch pending Type A items
  const { data: items } = await supabase
    .from("abc_items")
    .select("id, description, unit, item_order")
    .eq("abc_curve_id", curve.id)
    .eq("item_type", "A")
    .eq("mapping_status", "pending")
    .order("item_order");

  if (!items || items.length === 0) {
    return Response.json({
      total_items: 0,
      auto_mapped: 0,
      suggested: 0,
      pending: 0,
      already_mapped: alreadyMapped ?? 0,
      details: [],
    });
  }

  let mappedCount = 0;
  let suggestedCount = 0;
  let pendingCount = 0;
  const results: Array<{
    item_id: string;
    description: string;
    confidence: string | null;
    best_match: string | null;
    score: number;
  }> = [];

  for (const item of items) {
    const match = await autoMatchItem(
      item.description as string,
      item.unit as string,
      user.company_id
    );
    const best = match.best;
    const confidence = match.confidence;

    if (best && (best.factor_value ?? 0) > 0) {
      // Create mapping
      const mappingData: Record<string, unknown> = {
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
      };

      await supabase.from("item_mappings").insert(mappingData);

      if (confidence === "high") {
        await supabase
          .from("abc_items")
          .update({ mapping_status: "auto" })
          .eq("id", item.id);
        mappedCount++;
      } else {
        // medium or low — needs review
        await supabase
          .from("abc_items")
          .update({ mapping_status: "manual" })
          .eq("id", item.id);
        suggestedCount++;
      }
    } else {
      pendingCount++;
    }

    results.push({
      item_id: item.id as string,
      description: item.description as string,
      confidence,
      best_match: best?.factor_name ?? null,
      score: best?.score ?? 0,
    });
  }

  return Response.json({
    total_items: items.length,
    auto_mapped: mappedCount,
    suggested: suggestedCount,
    pending: pendingCount,
    already_mapped: alreadyMapped ?? 0,
    details: results,
  });
}
