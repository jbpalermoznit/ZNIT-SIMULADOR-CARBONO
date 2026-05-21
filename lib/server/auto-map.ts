/**
 * Run auto-mapping for all pending Type A items of an ABC curve.
 *
 * Two entry points:
 *   - runAutoMapForCurve: plain auto-map by description (used by the standalone
 *     /api/emission-factors/auto-map endpoint and by upload-abc when no
 *     enrichment files are attached).
 *   - runEnrichedAutoMapForCurve: same loop but using autoMatchEnriched,
 *     which considers canonical descriptions from the iTwo Cost Code catalog,
 *     assemblies from the Relatório Proof, and supplier boost. Also marks
 *     items as excluded when the cost-code prefix indicates labor or
 *     services (no Scope 3 material emission).
 */
import { supabase } from "./supabase";
import { autoMatchItem, autoMatchEnriched } from "./emission-mapper";
import type { CostCodeRecord } from "./parser-cost-codes";
import { lookupCostCode } from "./parser-cost-codes";
import type { ProofAssembly } from "./parser-proof";
import {
  inferTypeFromCostCode,
  shouldAutoExcludeType,
  autoExclusionReason,
} from "./cost-code-classifier";

export interface AutoMapResult {
  total_items: number;
  auto_mapped: number;
  suggested: number;
  pending: number;
  already_mapped: number;
  auto_excluded?: number;
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

// ---------------------------------------------------------------------------
// Enriched variant — uses the optional iTwo catalog + Relatório Proof
// ---------------------------------------------------------------------------

export interface EnrichmentInputs {
  /** Cost-code catalog from `Cost Code - itwo.xlsx`. */
  costCodes?: Map<string, CostCodeRecord> | null;
  /** Assemblies per cost code from `Relatório Proof.xlsx`. */
  proof?: Map<string, ProofAssembly[]> | null;
}

/**
 * Same loop as runAutoMapForCurve, but the per-item match also considers:
 *   - canonical_description from the iTwo Cost Code catalog
 *   - assemblies (from Relatório Proof) — each description tried as an
 *     independent query, the best score wins
 *   - supplier boost on EPD/factor candidates whose source/name contains
 *     the ABC supplier (e.g. "GERDAU", "POLIMIX")
 *
 * Also runs **before** the loop a one-time enrichment pass that writes
 * canonical_description, assemblies and inferred_type into the abc_items
 * rows, AND auto-excludes labor/service items based on cost-code prefix.
 */
export async function runEnrichedAutoMapForCurve(
  curveId: string,
  companyId: string,
  enrichment: EnrichmentInputs
): Promise<AutoMapResult> {
  // Probe whether migration v5 columns exist. If not, we degrade gracefully:
  // assemblies / canonical_description / inferred_type aren't persisted, but
  // the enrichment still applies in-memory for the main matching loop.
  const probe = await supabase
    .from("abc_items")
    .select("canonical_description")
    .eq("abc_curve_id", curveId)
    .limit(1);
  const enrichedColumnsAvailable = !probe.error;
  if (!enrichedColumnsAvailable) {
    console.warn(
      "[auto-map] migration-v5-coverage-enrichment.sql not applied; running with in-memory enrichment only"
    );
  }

  // 1. Pre-pass: enrich every item row with catalog + proof data,
  //    classify by cost-code prefix, and auto-exclude labor/services.
  const { data: allItems } = await supabase
    .from("abc_items")
    .select("id, cost_code, description, item_type, mapping_status")
    .eq("abc_curve_id", curveId);

  // In-memory enrichment per item id — used when persistence isn't available
  type EnrichedRow = {
    canonical_description: string | null;
    assemblies: Array<{ description: string }>;
  };
  const inMemoryEnrich: Map<string, EnrichedRow> = new Map();

  let autoExcluded = 0;
  if (allItems && (enrichment.costCodes || enrichment.proof)) {
    for (const item of allItems) {
      const code = String(item.cost_code ?? "");
      const catalog = enrichment.costCodes
        ? lookupCostCode(code, enrichment.costCodes)
        : null;
      const assemblies = enrichment.proof?.get(code) ?? [];
      const inferred = inferTypeFromCostCode(code);

      inMemoryEnrich.set(item.id as string, {
        canonical_description: catalog?.description ?? null,
        assemblies: assemblies.map((a) => ({ description: a.description })),
      });

      const update: Record<string, unknown> = {};
      if (enrichedColumnsAvailable) {
        if (catalog && catalog.description) update.canonical_description = catalog.description;
        if (assemblies.length > 0) {
          update.assemblies = assemblies.map((a) => ({
            code: a.code,
            description: a.description,
            uom: a.uom,
            rn_code: a.rn_code ?? null,
          }));
        }
        if (inferred) update.inferred_type = inferred;
      }

      // Auto-exclude labor/services so they don't sit forever as "pending"
      if (
        inferred &&
        shouldAutoExcludeType(inferred) &&
        item.mapping_status !== "excluded"
      ) {
        await supabase.from("item_mappings").insert({
          abc_item_id: item.id,
          source_tier: "excluded",
          factor_value: 0,
          factor_unit: "kg CO2-Eq",
          factor_name: "Excluído",
          mapped_by: "excluded",
          exclusion_justification: autoExclusionReason(inferred),
        });
        update.mapping_status = "excluded";
        autoExcluded++;
      }

      if (Object.keys(update).length > 0) {
        await supabase.from("abc_items").update(update).eq("id", item.id);
      }
    }
  }

  // 2. Main pass: still focus on Type A items (post-exclusions). Read either
  //    the v5 enriched columns or fall back to the in-memory map populated
  //    above.
  const { count: alreadyMapped } = await supabase
    .from("abc_items")
    .select("id", { count: "exact", head: true })
    .eq("abc_curve_id", curveId)
    .eq("item_type", "A")
    .in("mapping_status", ["auto", "manual"]);

  const selectCols = enrichedColumnsAvailable
    ? "id, cost_code, description, unit, item_order, supplier, canonical_description, assemblies"
    : "id, cost_code, description, unit, item_order, supplier";
  const { data: items } = await supabase
    .from("abc_items")
    .select(selectCols)
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
      auto_excluded: autoExcluded,
    };
  }

  let mapped = 0;
  let suggested = 0;
  let pending = 0;

  for (const itemRow of items as unknown as Array<Record<string, unknown>>) {
    const itemId = itemRow.id as string;
    const memEnrich = inMemoryEnrich.get(itemId);
    const persistedAssemblies = enrichedColumnsAvailable
      ? Array.isArray(itemRow.assemblies)
        ? (itemRow.assemblies as Array<{ description?: string }>)
        : []
      : [];
    const assemblyDescriptions = (
      persistedAssemblies.length > 0
        ? persistedAssemblies.map((a) => a.description ?? "")
        : (memEnrich?.assemblies ?? []).map((a) => a.description)
    ).filter((d) => d && d.length > 0);

    const canonicalDescription = enrichedColumnsAvailable
      ? (itemRow.canonical_description as string | null) ?? null
      : memEnrich?.canonical_description ?? null;

    const match = await autoMatchEnriched({
      description: itemRow.description as string,
      unit: itemRow.unit as string,
      companyId,
      canonicalDescription,
      assemblyDescriptions,
      supplier: (itemRow.supplier as string | null) ?? null,
    });

    const best = match.best;
    const confidence = match.confidence;

    if (best && (best.factor_value ?? 0) > 0) {
      const notesParts: string[] = [];
      if (match.matched_via === "canonical") notesParts.push("via catálogo");
      if (match.matched_via === "assembly" && match.matched_assembly_index != null) {
        const a = assemblyDescriptions[match.matched_assembly_index];
        notesParts.push(`via composição (${a.slice(0, 60)})`);
      }

      await supabase.from("item_mappings").insert({
        abc_item_id: itemId,
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
        notes: notesParts.length > 0 ? notesParts.join(" · ") : null,
      });

      const newStatus = confidence === "high" ? "auto" : "manual";
      await supabase
        .from("abc_items")
        .update({ mapping_status: newStatus })
        .eq("id", itemId);

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
    auto_excluded: autoExcluded,
  };
}
