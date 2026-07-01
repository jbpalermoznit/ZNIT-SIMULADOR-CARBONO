import { NextRequest } from "next/server";
import { supabase } from "@/lib/server/supabase";
import { getCurrentUser, unauthorized } from "@/lib/server/auth";
import type { AuthUser } from "@/lib/server/auth";
import { assertScenarioOwnership, ForbiddenError, forbidden } from "@/lib/server/access";

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

  try {
    await assertScenarioOwnership(scenarioId, user);
  } catch (e) {
    if (e instanceof ForbiddenError) return forbidden(e.message);
    throw e;
  }

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
  const abcItemsMap: Record<string, Record<string, unknown>> = {};

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
        parent_item_id: ai.parent_item_id ?? null,
        classification_note: ai.classification_note ?? null,
        mapping_status: ai.mapping_status ?? null,
      };
    })
    .sort(
      (a, b) =>
        ((a.item_order as number) ?? 0) - ((b.item_order as number) ?? 0)
    );

  // Load parent (blocked) items for composition hierarchy
  // Try abc_curve_id first, fallback to finding curve from child items
  let curveId = scenario.abc_curve_id;
  if (!curveId && abcItemIds.length > 0) {
    const firstItem = Object.values(abcItemsMap)[0];
    if (firstItem) curveId = firstItem.abc_curve_id;
  }
  let parentItems: Array<Record<string, unknown>> = [];
  if (curveId) {
    const { data: blockedItems } = await supabase
      .from("abc_items")
      .select("id, cost_code, description, quantity, unit, total_cost, item_type, item_order, mapping_status, classification_note")
      .eq("abc_curve_id", curveId)
      .eq("mapping_status", "blocked")
      .order("item_order");
    parentItems = (blockedItems ?? []).map((bi) => ({
      id: bi.id,
      abc_item_id: bi.id,
      cost_code: bi.cost_code,
      description: bi.description,
      quantity: bi.quantity,
      unit: bi.unit,
      total_cost: bi.total_cost,
      item_type: bi.item_type,
      item_order: bi.item_order,
      mapping_status: bi.mapping_status,
      classification_note: bi.classification_note,
      parent_item_id: null,
      is_parent: true,
      // Sum child emissions
      emission_tco2e: itemsResponse
        .filter((i) => i.parent_item_id === bi.id && (i.emission_tco2e ?? 0) > 0)
        .reduce((sum, i) => sum + (i.emission_tco2e ?? 0), 0),
      emission_kgco2e: itemsResponse
        .filter((i) => i.parent_item_id === bi.id && (i.emission_kgco2e ?? 0) > 0)
        .reduce((sum, i) => sum + (i.emission_kgco2e ?? 0), 0),
      children_count: itemsResponse.filter((i) => i.parent_item_id === bi.id).length,
    }));
  }

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
    abc_curve_id: curveId ?? null,
    result: result ?? null,
    items: itemsResponse,
    parent_items: parentItems,
  });
}

// ---------------------------------------------------------------------------
// DELETE /api/scenarios/[scenarioId] — remove scenario + children
// ---------------------------------------------------------------------------
export async function DELETE(
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

  try {
    await assertScenarioOwnership(scenarioId, user);
  } catch (e) {
    if (e instanceof ForbiddenError) return forbidden(e.message);
    throw e;
  }

  // The base scenario is the reference for every comparison — refuse to delete
  // it so users can't accidentally orphan their project. They must promote
  // another scenario to Base first.
  const { data: scen } = await supabase
    .from("scenarios")
    .select("is_base")
    .eq("id", scenarioId)
    .single();
  if (scen?.is_base) {
    return Response.json(
      { detail: "O cenário Base não pode ser excluído. Defina outro cenário como Base antes de excluí-lo." },
      { status: 400 }
    );
  }

  // Foreign keys aren't ON DELETE CASCADE everywhere, so clean children
  // first to keep the operation safe regardless of schema state.
  await supabase.from("scenario_results").delete().eq("scenario_id", scenarioId);
  await supabase.from("scenario_items").delete().eq("scenario_id", scenarioId);
  const { error } = await supabase.from("scenarios").delete().eq("id", scenarioId);
  if (error) {
    return Response.json({ detail: error.message }, { status: 500 });
  }
  return new Response(null, { status: 204 });
}
