/**
 * GET /api/debug/match-curve/[curveId]
 * Debug endpoint: runs autoMatchEnriched against every pending item of a
 * curve and returns a compact per-item diagnostic. Used to investigate why
 * specific items stay pending after the upload-abc auto-map ran.
 */
import { NextRequest } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/server/auth";
import { supabase } from "@/lib/server/supabase";
import { autoMatchEnriched } from "@/lib/server/emission-mapper";
import { getConversionFactor } from "@/lib/server/calculator";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ curveId: string }> }
) {
  let user;
  try {
    user = await getCurrentUser(req);
  } catch {
    return unauthorized();
  }

  const { curveId } = await params;

  const { data: items, error } = await supabase
    .from("abc_items")
    .select(
      "id, cost_code, description, unit, item_type, mapping_status, supplier, canonical_description, assemblies, inferred_type, total_cost"
    )
    .eq("abc_curve_id", curveId)
    .eq("mapping_status", "pending")
    .order("total_cost", { ascending: false });

  if (error) {
    return Response.json({ detail: error.message }, { status: 500 });
  }

  const report = [];
  for (const item of items ?? []) {
    const assemblyDescriptions = Array.isArray(item.assemblies)
      ? (item.assemblies as Array<{ description?: string }>)
          .map((a) => a.description ?? "")
          .filter((d) => d.length > 0)
      : [];

    try {
      const match = await autoMatchEnriched({
        description: item.description as string,
        unit: item.unit as string,
        companyId: user.company_id,
        canonicalDescription: (item.canonical_description as string | null) ?? null,
        assemblyDescriptions,
        supplier: (item.supplier as string | null) ?? null,
      });

      const best = match.best;
      const conversion = best
        ? getConversionFactor(item.unit as string, best.factor_unit)
        : null;

      report.push({
        cost_code: item.cost_code,
        description: item.description,
        unit: item.unit,
        item_type: item.item_type,
        supplier: item.supplier,
        canonical: item.canonical_description,
        n_assemblies: assemblyDescriptions.length,
        best_tier: best?.source_tier ?? null,
        best_score: best?.score ?? null,
        best_factor: best?.factor_value ?? null,
        best_factor_unit: best?.factor_unit ?? null,
        best_factor_name: best?.factor_name ?? null,
        conversion,
        confidence: match.confidence,
        n_candidates: match.results.length,
        matched_via: match.matched_via,
      });
    } catch (e) {
      report.push({
        cost_code: item.cost_code,
        description: item.description,
        error: e instanceof Error ? e.message : "erro",
      });
    }
  }

  return Response.json({
    curve_id: curveId,
    pending_count: report.length,
    items: report,
  });
}
