/**
 * POST /api/projects/[projectId]/reclassify-blocked
 *
 * Backfill: reverts items that were silently auto-excluded by the old
 * "45xx prefix → F" rule, even though the parser had classified them as
 * Tipo C (item agrupado / subcontrato com possível material embutido).
 *
 * Then re-runs the enriched auto-map on every curve of the project so
 * those items get a second chance — matching against the assemblies and
 * canonical descriptions persisted at upload time (migration v5 columns).
 *
 * Idempotent: safe to call multiple times. Only touches item_mappings
 * that were inserted with mapped_by='excluded' (auto-classification),
 * never user-edited rows.
 */
import { NextRequest } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/server/auth";
import { supabase } from "@/lib/server/supabase";
import { runEnrichedAutoMapForCurve } from "@/lib/server/auto-map";
import { recalculateScenario } from "@/lib/server/calculator";

export const maxDuration = 300;

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

  const { data: project } = await supabase
    .from("projects")
    .select("id, company_id")
    .eq("id", projectId)
    .eq("company_id", user.company_id)
    .single();

  if (!project) {
    return Response.json({ detail: "Projeto não encontrado" }, { status: 404 });
  }

  const { data: curves } = await supabase
    .from("abc_curves")
    .select("id")
    .eq("project_id", projectId);

  if (!curves || curves.length === 0) {
    return Response.json({ detail: "Nenhuma curva ABC encontrada" }, { status: 404 });
  }

  let revertedTotal = 0;
  let mappedTotal = 0;
  let suggestedTotal = 0;
  let stillBlockedTotal = 0;

  for (const curve of curves) {
    // 1. Find C items wrongly auto-excluded
    const { data: wrongly } = await supabase
      .from("abc_items")
      .select("id")
      .eq("abc_curve_id", curve.id)
      .eq("item_type", "C")
      .eq("mapping_status", "excluded");

    const ids = (wrongly ?? []).map((i) => i.id as string);
    if (ids.length === 0) continue;

    // 2. Delete the auto-classification mappings (never touches user-edited
    //    rows because we filter by mapped_by='excluded').
    await supabase
      .from("item_mappings")
      .delete()
      .in("abc_item_id", ids)
      .eq("mapped_by", "excluded");

    // 3. Revert status back to `blocked` so the main loop picks them up.
    await supabase
      .from("abc_items")
      .update({ mapping_status: "blocked" })
      .in("id", ids);

    revertedTotal += ids.length;

    // 4. Re-run enriched auto-map on this curve. Pass empty enrichment
    //    inputs — the v5 persisted columns (canonical_description,
    //    assemblies) already provide the hints for the main loop.
    const result = await runEnrichedAutoMapForCurve(
      curve.id as string,
      user.company_id,
      {}
    );
    mappedTotal += result.auto_mapped;
    suggestedTotal += result.suggested;
    stillBlockedTotal += result.pending;
  }

  // 5. Recalculate every scenario in the project so emission totals
  //    reflect the rescued items.
  const { data: scenarios } = await supabase
    .from("scenarios")
    .select("id")
    .eq("project_id", projectId);

  for (const s of scenarios ?? []) {
    try {
      await recalculateScenario(s.id as string);
    } catch (e) {
      console.warn("[reclassify-blocked] recalc failed for scenario", s.id, e);
    }
  }

  return Response.json({
    reverted: revertedTotal,
    auto_mapped: mappedTotal,
    suggested: suggestedTotal,
    still_blocked: stillBlockedTotal,
    scenarios_recalculated: scenarios?.length ?? 0,
  });
}
