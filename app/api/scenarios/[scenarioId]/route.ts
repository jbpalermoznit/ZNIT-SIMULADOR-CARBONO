import { NextRequest } from "next/server";
import { supabase } from "@/lib/server/supabase";
import { getCurrentUser, unauthorized } from "@/lib/server/auth";
import type { AuthUser } from "@/lib/server/auth";

// ---------------------------------------------------------------------------
// GET /api/scenarios/[scenarioId] — scenario detail with items
// ---------------------------------------------------------------------------
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ scenarioId: string }> }
) {
  let user: AuthUser;
  try {
    user = await getCurrentUser(req);
  } catch {
    return unauthorized();
  }

  const { scenarioId } = await params;

  const { data: scenario } = await supabase
    .from("scenarios")
    .select("*")
    .eq("id", scenarioId)
    .single();

  if (!scenario) {
    return Response.json(
      { detail: "Cenário não encontrado" },
      { status: 404 }
    );
  }

  // Get result
  const { data: result } = await supabase
    .from("scenario_results")
    .select("*")
    .eq("scenario_id", scenarioId)
    .single();

  // Get scenario items with abc_item data
  const { data: scenarioItems } = await supabase
    .from("scenario_items")
    .select("*")
    .eq("scenario_id", scenarioId);

  // Load abc_items for enrichment
  const abcItemIds = (scenarioItems ?? []).map((si) => si.abc_item_id);
  let abcItemsMap: Record<string, Record<string, unknown>> = {};

  if (abcItemIds.length > 0) {
    const { data: abcItems } = await supabase
      .from("abc_items")
      .select("*")
      .in("id", abcItemIds);

    for (const ai of abcItems ?? []) {
      abcItemsMap[ai.id] = ai;
    }
  }

  // Build items response sorted by item_order
  const itemsResponse = (scenarioItems ?? [])
    .map((si) => {
      const ai = abcItemsMap[si.abc_item_id] ?? {};
      const emissionTco2e = si.emission_kgco2e
        ? si.emission_kgco2e / 1000
        : null;
      return {
        id: si.id,
        abc_item_id: si.abc_item_id,
        cost_code: ai.cost_code ?? null,
        description: ai.description ?? null,
        item_type: ai.item_type ?? null,
        abc_class: ai.abc_class ?? null,
        quantity: si.quantity_override ?? ai.quantity ?? null,
        unit: ai.unit ?? null,
        total_cost: ai.total_cost ?? null,
        factor_value: si.factor_value,
        factor_unit: si.factor_unit,
        factor_name: si.factor_name,
        source_tier: si.source_tier,
        emission_kgco2e: si.emission_kgco2e,
        emission_tco2e: emissionTco2e,
        emission_scope3_logistics_kgco2e:
          si.emission_scope3_logistics_kgco2e,
        is_excluded: si.is_excluded,
        exclusion_reason: si.exclusion_reason,
        item_order: ai.item_order ?? 0,
      };
    })
    .sort(
      (a, b) =>
        ((a.item_order as number) ?? 0) - ((b.item_order as number) ?? 0)
    );

  return Response.json({
    id: scenario.id,
    project_id: scenario.project_id,
    name: scenario.name,
    description: scenario.description,
    status: scenario.status,
    version: scenario.version,
    is_base: scenario.is_base,
    created_at: scenario.created_at,
    items_count: itemsResponse.length,
    result: result ?? null,
    items: itemsResponse,
  });
}
