import { NextRequest } from "next/server";
import { supabase, supabaseEmission } from "@/lib/server/supabase";
import { getCurrentUser, unauthorized } from "@/lib/server/auth";
import { getConversionFactor } from "@/lib/server/calculator";
import type { AuthUser } from "@/lib/server/auth";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadAllEpdsWithGwp(): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabaseEmission
    .from("epd_dev")
    .select("*")
    .not("gwp_a1a3", "is", null)
    .order("titulo")
    .limit(500);

  if (error) {
    console.error("Error loading EPDs:", error.message);
    return [];
  }
  return data ?? [];
}

function extractKeywords(description: string): string[] {
  const words = description
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
  return [...new Set(words)];
}

function tokenSetScore(a: string, b: string): number {
  const tokensA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const tokensB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  let intersection = 0;
  for (const t of tokensA) if (tokensB.has(t)) intersection++;
  const union = tokensA.size + tokensB.size - intersection;
  return union > 0 ? Math.round((intersection / union) * 100) : 0;
}

function partialScore(needle: string, haystack: string): number {
  if (haystack.includes(needle)) return 100;
  const words = needle.split(/\s+/);
  let matched = 0;
  for (const w of words) {
    if (w.length > 2 && haystack.includes(w)) matched++;
  }
  return words.length > 0 ? Math.round((matched / words.length) * 100) : 0;
}

function matchEpdsToItem(
  description: string,
  _unit: string,
  epds: Record<string, unknown>[]
): Record<string, unknown>[] {
  const keywords = extractKeywords(description);
  const descLower = description.toLowerCase();

  const matches: Record<string, unknown>[] = [];

  for (const epd of epds) {
    const gwp = epd.gwp_a1a3 as number | null;
    if (gwp == null || gwp <= 0) continue;

    const titulo = ((epd.titulo as string) ?? "").toLowerCase();
    const info = ((epd.informacao_produto as string) ?? "").toLowerCase();

    // Quick relevance check
    let relevant = false;
    for (const kw of keywords) {
      if (titulo.includes(kw) || info.includes(kw)) {
        relevant = true;
        break;
      }
    }

    let score: number;
    if (!relevant && keywords.length > 0) {
      const best = Math.max(
        partialScore(descLower, titulo),
        partialScore(descLower, info)
      );
      if (best < 55) continue;
      score = best;
    } else {
      score = Math.max(
        tokenSetScore(descLower, titulo),
        tokenSetScore(descLower, info),
        partialScore(descLower, titulo)
      );
      if (relevant) score = Math.max(score, 75);
    }

    if (score < 50) continue;

    const declaredValue = Number(epd.declared_value ?? 1) || 1;
    const factorPerUnit =
      declaredValue > 0 ? Number(gwp) / declaredValue : Number(gwp);

    matches.push({
      epd_id: epd.id,
      factor_value: Math.round(factorPerUnit * 1000000) / 1000000,
      factor_name: epd.titulo ?? "",
      factor_source: `EPD \u2014 ${epd.company_name ?? ""}`,
      supplier: epd.company_name ?? "",
      source_tier: "epd",
      declared_unit: ((epd.declared_unit as string) ?? "").trim(),
      score,
      country: epd.country ?? epd.geographical_scopes ?? "",
    });
  }

  matches.sort(
    (a, b) => (b.score as number) - (a.score as number)
  );
  return matches.slice(0, 5);
}

function emptyKpis() {
  return {
    total_abatement: 0,
    savings_abatement: 0,
    savings_count: 0,
    avg_cost: 0,
    total_alternatives: 0,
  };
}

function computeKpis(bars: Record<string, unknown>[]) {
  if (bars.length === 0) return emptyKpis();

  const totalAbatement = bars.reduce(
    (s, b) => s + (b.abatement_tco2e as number),
    0
  );
  const savingsBars = bars.filter(
    (b) => (b.cost_per_tco2e as number) < 0
  );
  const savingsAbatement = savingsBars.reduce(
    (s, b) => s + (b.abatement_tco2e as number),
    0
  );
  const costs = bars.map((b) => b.cost_per_tco2e as number);
  const avgCost =
    costs.length > 0 ? costs.reduce((a, b) => a + b, 0) / costs.length : 0;

  return {
    total_abatement: Math.round(totalAbatement * 100) / 100,
    savings_abatement: Math.round(savingsAbatement * 100) / 100,
    savings_count: savingsBars.length,
    avg_cost: Math.round(avgCost * 100) / 100,
    total_alternatives: bars.length,
  };
}

// ---------------------------------------------------------------------------
// GET /api/macc/[projectId]
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

  // Get latest ABC curve
  const { data: curves } = await supabase
    .from("abc_curves")
    .select("id")
    .eq("project_id", projectId)
    .order("imported_at", { ascending: false })
    .limit(1);

  const curve = curves?.[0];
  if (!curve) {
    return Response.json(
      { detail: "Nenhuma curva ABC encontrada para este projeto" },
      { status: 404 }
    );
  }

  // Get mapped Type A items
  const { data: items } = await supabase
    .from("abc_items")
    .select("*")
    .eq("abc_curve_id", curve.id)
    .eq("item_type", "A")
    .in("mapping_status", ["auto", "manual"])
    .order("item_order");

  if (!items || items.length === 0) {
    return Response.json({ bars: [], kpis: emptyKpis() });
  }

  // Load mappings
  const itemIds = items.map((i) => i.id);
  const { data: mappings } = await supabase
    .from("item_mappings")
    .select("*")
    .in("abc_item_id", itemIds);

  const mappingByItem: Record<string, Record<string, unknown>> = {};
  for (const m of mappings ?? []) {
    mappingByItem[m.abc_item_id] = m;
  }

  // Load all EPDs with GWP (single batch)
  const allEpds = await loadAllEpdsWithGwp();

  const bars: Record<string, unknown>[] = [];

  for (const item of items) {
    const mapping = mappingByItem[item.id];
    if (!mapping || !mapping.factor_value || (mapping.factor_value as number) <= 0) {
      continue;
    }

    const baselineFactor = mapping.factor_value as number;
    const baselineSource =
      (mapping.factor_name as string) ??
      (mapping.factor_source as string) ??
      "Baseline";

    const baselineConv = getConversionFactor(
      item.unit ?? "",
      (mapping.factor_unit as string) ?? ""
    );
    const baselineEmissionKg =
      baselineFactor * (item.quantity ?? 0) * baselineConv;

    if (baselineEmissionKg <= 0) continue;

    const epdMatches = matchEpdsToItem(
      item.description ?? "",
      item.unit ?? "",
      allEpds
    );

    for (const candidate of epdMatches) {
      const altFactor = candidate.factor_value as number;
      if (altFactor <= 0) continue;

      const altConv = getConversionFactor(
        item.unit ?? "",
        (candidate.declared_unit as string) ?? ""
      );
      const altEmissionKg = altFactor * (item.quantity ?? 0) * altConv;

      if (altEmissionKg >= baselineEmissionKg) continue;
      if (candidate.factor_name === mapping.factor_name) continue;

      const abatementKg = baselineEmissionKg - altEmissionKg;
      if (abatementKg <= 0) continue;

      const abatementTco2e = abatementKg / 1000;

      bars.push({
        id: `${item.id}_epd_${candidate.epd_id ?? "x"}`,
        item_description: item.description,
        item_cost_code: item.cost_code,
        item_unit_cost: item.unit_cost,
        item_quantity: item.quantity,
        baseline_factor: Math.round(baselineFactor * 10000) / 10000,
        baseline_source: baselineSource,
        baseline_emission_kg: Math.round(baselineEmissionKg * 100) / 100,
        alternative_factor: Math.round(altFactor * 10000) / 10000,
        alternative_name: candidate.factor_name ?? "",
        alternative_source: candidate.factor_source ?? "",
        alternative_emission_kg: Math.round(altEmissionKg * 100) / 100,
        supplier: candidate.supplier ?? "",
        source_tier: "epd",
        abatement_tco2e: Math.round(abatementTco2e * 100) / 100,
        abatement_unit: "tCO\u2082e",
        cost_per_tco2e: 0.0,
        score: candidate.score ?? 0,
        category: "low",
      });
    }
  }

  // Sort by abatement desc
  bars.sort(
    (a, b) =>
      (b.abatement_tco2e as number) - (a.abatement_tco2e as number)
  );

  // Deduplicate: best per (item, supplier)
  const seen = new Set<string>();
  const uniqueBars: Record<string, unknown>[] = [];
  for (const bar of bars) {
    const key = `${bar.item_cost_code}|${bar.supplier}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueBars.push(bar);
    }
  }

  const kpis = computeKpis(uniqueBars);

  return Response.json({ bars: uniqueBars, kpis });
}
