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
  let revertedEpdTotal = 0;
  let mappedTotal = 0;
  let suggestedTotal = 0;
  let stillBlockedTotal = 0;

  for (const curve of curves) {
    // === Pass A: legacy auto-excluded items =============================
    // Items currently in `excluded` whose mapping was written by the *old*
    // classifier (mapped_by='excluded' with a canonical auto-justification
    // text). Newer rows (mapped_by='auto_excluded') reflect the current
    // policy and must not be reverted — otherwise this endpoint would
    // oscillate on every page load.
    const { data: excludedItems } = await supabase
      .from("abc_items")
      .select("id, item_type")
      .eq("abc_curve_id", curve.id)
      .eq("mapping_status", "excluded");

    const excludedIds = (excludedItems ?? []).map((i) => i.id as string);
    const typeById = new Map<string, string>(
      (excludedItems ?? []).map((i) => [i.id as string, i.item_type as string]),
    );

    let autoExcludedIds: string[] = [];
    if (excludedIds.length > 0) {
      const { data: excludedMappings } = await supabase
        .from("item_mappings")
        .select("abc_item_id, mapped_by, exclusion_justification")
        .in("abc_item_id", excludedIds);
      const autoMarkers = [
        "classificação automática por código de custo",
        "decomposto pelo Relatório Proof",
      ];
      autoExcludedIds = (excludedMappings ?? [])
        .filter((m) => {
          if (m.mapped_by !== "excluded") return false;
          const j = String(m.exclusion_justification ?? "");
          return autoMarkers.some((marker) => j.includes(marker));
        })
        .map((m) => m.abc_item_id as string);
    }

    // === Pass B: legacy EPD auto-mappings ================================
    // Items mapped to an EPD by the *old* auto-matcher (mapped_by='auto'
    // AND source_tier='epd'). EPDs are no longer auto-selected — they're
    // only for explicit substitution. Items the user manually confirmed
    // (mapped_by=<user_id>) or curated via Factor Rules (mapped_by='rule')
    // are not touched.
    const { data: epdAutoMappings } = await supabase
      .from("item_mappings")
      .select("abc_item_id, abc_items!inner(abc_curve_id)")
      .eq("mapped_by", "auto")
      .eq("source_tier", "epd")
      .eq("abc_items.abc_curve_id", curve.id);
    const epdAutoIds = (epdAutoMappings ?? []).map((m) => m.abc_item_id as string);

    if (autoExcludedIds.length === 0 && epdAutoIds.length === 0) continue;

    // Revert Pass A: delete mappings, restore parser-C to `blocked` and
    // everything else to `pending` for the main match loop.
    if (autoExcludedIds.length > 0) {
      const cIds: string[] = [];
      const pendingIds: string[] = [];
      for (const id of autoExcludedIds) {
        if (typeById.get(id) === "C") cIds.push(id);
        else pendingIds.push(id);
      }
      await supabase
        .from("item_mappings")
        .delete()
        .in("abc_item_id", autoExcludedIds);
      if (cIds.length > 0) {
        await supabase
          .from("abc_items")
          .update({ mapping_status: "blocked" })
          .in("id", cIds);
      }
      if (pendingIds.length > 0) {
        await supabase
          .from("abc_items")
          .update({ mapping_status: "pending" })
          .in("id", pendingIds);
      }
      revertedTotal += autoExcludedIds.length;
    }

    // Revert Pass B: drop EPD auto-mapping rows, mark items pending.
    if (epdAutoIds.length > 0) {
      await supabase
        .from("item_mappings")
        .delete()
        .in("abc_item_id", epdAutoIds)
        .eq("mapped_by", "auto")
        .eq("source_tier", "epd");
      await supabase
        .from("abc_items")
        .update({ mapping_status: "pending" })
        .in("id", epdAutoIds);
      revertedEpdTotal += epdAutoIds.length;
    }

    // Re-run enriched auto-map on this curve. Empty enrichment inputs —
    // the v5 persisted columns (canonical_description, assemblies) feed
    // the main loop directly. EPDs are no longer in the candidate pool,
    // so the rescued items get GHG / CECarbon / Ecoinvent factors.
    const result = await runEnrichedAutoMapForCurve(
      curve.id as string,
      user.company_id,
      {}
    );
    mappedTotal += result.auto_mapped;
    suggestedTotal += result.suggested;
    stillBlockedTotal += result.pending;
  }

  // Recalculate every scenario so totals reflect the rescued items. Skip
  // entirely when nothing changed — keeps the endpoint cheap when called
  // as a no-op on page load.
  let scenariosRecalculated = 0;
  if (revertedTotal + revertedEpdTotal > 0) {
    const { data: scenarios } = await supabase
      .from("scenarios")
      .select("id")
      .eq("project_id", projectId);

    for (const s of scenarios ?? []) {
      try {
        await recalculateScenario(s.id as string);
        scenariosRecalculated++;
      } catch (e) {
        console.warn("[reclassify-blocked] recalc failed for scenario", s.id, e);
      }
    }
  }

  return Response.json({
    reverted: revertedTotal,
    reverted_epd_auto: revertedEpdTotal,
    auto_mapped: mappedTotal,
    suggested: suggestedTotal,
    still_blocked: stillBlockedTotal,
    scenarios_recalculated: scenariosRecalculated,
  });
}
