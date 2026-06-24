/**
 * GET /api/debug/match-item/[itemId]
 * Debug endpoint: returns the full autoMatchEnriched decision for a given
 * abc_item, including all candidates, their scores and the unit conversion
 * check. Used to triage low-coverage uploads.
 */
import { NextRequest } from "next/server";
import { getCurrentUser, unauthorized, forbidden } from "@/lib/server/auth";
import { supabase } from "@/lib/server/supabase";
import { curveBelongsToCompany } from "@/lib/server/tenant";
import { autoMatchEnriched } from "@/lib/server/emission-mapper";
import { getConversionFactor } from "@/lib/server/calculator";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  let user;
  try {
    user = await getCurrentUser(req);
  } catch {
    return unauthorized();
  }

  // Diagnostic endpoint: admin-only.
  if (user.role !== "admin") return forbidden();

  const { itemId } = await params;

  const { data: item, error } = await supabase
    .from("abc_items")
    .select(
      "id, abc_curve_id, cost_code, description, unit, item_type, mapping_status, supplier, canonical_description, assemblies, inferred_type"
    )
    .eq("id", itemId)
    .single();

  if (error || !item) {
    return Response.json({ detail: "Item não encontrado", err: error?.message }, { status: 404 });
  }

  // Tenant scope: the item must belong to the caller's company
  // (abc_item → abc_curve → project → company).
  if (!(await curveBelongsToCompany(item.abc_curve_id as string, user.company_id))) {
    return Response.json({ detail: "Item não encontrado" }, { status: 404 });
  }

  const assemblyDescriptions = Array.isArray(item.assemblies)
    ? (item.assemblies as Array<{ description?: string }>)
        .map((a) => a.description ?? "")
        .filter((d) => d.length > 0)
    : [];

  const match = await autoMatchEnriched({
    description: item.description as string,
    unit: item.unit as string,
    companyId: user.company_id,
    canonicalDescription: (item.canonical_description as string | null) ?? null,
    assemblyDescriptions,
    supplier: (item.supplier as string | null) ?? null,
  });

  // Annotate each candidate with its unit conversion result for clarity
  const annotated = match.results.map((c) => ({
    ...c,
    _conversion: getConversionFactor(item.unit as string, c.factor_unit),
  }));

  const { data: existingMapping } = await supabase
    .from("item_mappings")
    .select("source_tier, factor_value, factor_unit, factor_name, confidence")
    .eq("abc_item_id", itemId)
    .maybeSingle();

  return Response.json({
    item: {
      id: item.id,
      cost_code: item.cost_code,
      description: item.description,
      unit: item.unit,
      item_type: item.item_type,
      inferred_type: item.inferred_type,
      supplier: item.supplier,
      mapping_status: item.mapping_status,
      canonical_description: item.canonical_description,
      assemblies_count: assemblyDescriptions.length,
    },
    match: {
      best: match.best,
      confidence: match.confidence,
      matched_via: match.matched_via,
      matched_assembly_index: match.matched_assembly_index,
      candidates: annotated,
    },
    persisted_mapping: existingMapping,
  });
}
