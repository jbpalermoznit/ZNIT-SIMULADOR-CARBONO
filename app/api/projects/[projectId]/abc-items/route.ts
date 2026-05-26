import { NextRequest } from "next/server";
import { supabase } from "@/lib/server/supabase";
import { getCurrentUser, unauthorized } from "@/lib/server/auth";
import type { AuthUser } from "@/lib/server/auth";

interface AssemblyRow {
  code?: string;
  description?: string;
  uom?: string | null;
}

/**
 * Proof assemblies are persisted raw and can carry many duplicates
 * (the same composition repeats for every RN it appears in). We dedupe
 * by code+description and cap the list so the API payload stays bounded.
 */
function dedupeAssemblies(raw: unknown): AssemblyRow[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const seen = new Set<string>();
  const out: AssemblyRow[] = [];
  for (const r of raw as AssemblyRow[]) {
    const code = String(r?.code ?? "").trim();
    const desc = String(r?.description ?? "").trim();
    if (!code && !desc) continue;
    const key = `${code}|${desc.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ code, description: desc, uom: r?.uom ?? null });
    if (out.length >= 25) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// GET /api/projects/[projectId]/abc-items
// ---------------------------------------------------------------------------
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  let user: AuthUser;
  try {
    user = await getCurrentUser(req);
  } catch {
    return unauthorized();
  }

  const { projectId } = await params;

  // Verify project belongs to user's company
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("company_id", user.company_id)
    .single();

  if (!project) {
    return Response.json(
      { detail: "Projeto não encontrado" },
      { status: 404 }
    );
  }

  // Get curve: specific (via query param) or latest
  const searchParams = req.nextUrl.searchParams;
  const curveIdParam = searchParams.get("curve_id");

  let curve: { id: string } | null = null;
  if (curveIdParam) {
    const { data } = await supabase
      .from("abc_curves")
      .select("id")
      .eq("id", curveIdParam)
      .eq("project_id", projectId)
      .single();
    curve = data;
  } else {
    const { data: curves } = await supabase
      .from("abc_curves")
      .select("id")
      .eq("project_id", projectId)
      .order("imported_at", { ascending: false })
      .limit(1);
    curve = curves?.[0] ?? null;
  }

  if (!curve) {
    return Response.json([]);
  }

  // Build query with optional filters
  const itemType = searchParams.get("item_type");
  const abcClass = searchParams.get("abc_class");
  const mappingStatus = searchParams.get("mapping_status");

  let query = supabase
    .from("abc_items")
    .select("*")
    .eq("abc_curve_id", curve.id);

  if (itemType) query = query.eq("item_type", itemType);
  if (abcClass) query = query.eq("abc_class", abcClass);
  if (mappingStatus) query = query.eq("mapping_status", mappingStatus);

  const { data: items } = await query.order("item_order");
  const allItems = items ?? [];

  if (allItems.length === 0) {
    return Response.json([]);
  }

  // Load mappings for enrichment
  const itemIds = allItems.map((i) => i.id);
  const { data: mappings } = await supabase
    .from("item_mappings")
    .select("*")
    .in("abc_item_id", itemIds);

  const mappingByItem: Record<string, Record<string, unknown>> = {};
  for (const m of mappings ?? []) {
    mappingByItem[m.abc_item_id] = m;
  }

  // Two related signals:
  //   - isAutoExcluded:        any algorithmic exclusion (new + legacy)
  //   - isLegacyAutoExcluded:  rows written by the *old* classifier
  //                            (mapped_by='excluded' with a canonical
  //                            auto-justification text). The Items page
  //                            silently triggers reclassify-blocked once
  //                            on load whenever this is true anywhere in
  //                            the project, so the legacy state self-heals.
  const autoExcludedMarkers = [
    "classificação automática por código de custo",
    "decomposto pelo Relatório Proof",
  ];

  // Enrich items with mapping data
  const results = allItems.map((item) => {
    const m = mappingByItem[item.id];
    const justification = (m?.exclusion_justification as string | null) ?? "";
    const hasAutoMarker = autoExcludedMarkers.some((marker) =>
      justification.includes(marker),
    );
    const isAutoExcluded =
      m?.source_tier === "excluded" &&
      (m?.mapped_by === "auto_excluded" || hasAutoMarker);
    const isLegacyAutoExcluded =
      m?.source_tier === "excluded" &&
      m?.mapped_by === "excluded" &&
      hasAutoMarker;
    // EPDs auto-picked by an old version of the matcher (before EPDs were
    // removed from auto-map). Items the user manually confirmed (mapped_by
    // is a user id) or curated via Factor Rules (mapped_by='rule') are
    // never touched. The Items page silently reverts these on load.
    const isLegacyEpdAutoMapped =
      m?.source_tier === "epd" && m?.mapped_by === "auto";
    return {
      id: item.id,
      abc_curve_id: item.abc_curve_id,
      cost_code: item.cost_code,
      description: item.description,
      adf: item.adf,
      quantity: item.quantity,
      unit: item.unit,
      unit_cost: item.unit_cost,
      total_cost: item.total_cost,
      supplier: item.supplier,
      cost_pct: item.cost_pct,
      cumulative_pct: item.cumulative_pct,
      abc_class: item.abc_class,
      item_type: item.item_type,
      item_order: item.item_order,
      mapping_status: item.mapping_status,
      classification_note: item.classification_note,
      parent_item_id: item.parent_item_id,
      factor_name: m?.factor_name ?? null,
      factor_value: m?.factor_value ?? null,
      factor_unit: m?.factor_unit ?? null,
      source_tier: m?.source_tier ?? null,
      confidence: m?.confidence ?? null,
      auto_excluded: isAutoExcluded,
      legacy_auto_excluded: isLegacyAutoExcluded,
      legacy_epd_auto_mapped: isLegacyEpdAutoMapped,
      // Composições do Relatório Proof: array deduplicado para o front
      // renderizar como sub-linhas informativas ao expandir.
      assemblies: dedupeAssemblies(item.assemblies),
    };
  });

  return Response.json(results);
}
