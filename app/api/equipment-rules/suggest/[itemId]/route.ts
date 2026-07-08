import { NextRequest } from "next/server";
import { supabase } from "@/lib/server/supabase";
import { getCurrentUser, unauthorized } from "@/lib/server/auth";
import type { AuthUser } from "@/lib/server/auth";
import { getFuelFactors } from "@/lib/server/canonical-factors";

// ---------------------------------------------------------------------------
// Static data
// ---------------------------------------------------------------------------

// Combust\u00edveis v\u00eam das tabelas Supabase (canonical-factors). El\u00e9trico (SIN)
// n\u00e3o tem tabela de grid no schema backend \u2014 constante documentada.
const ELECTRIC_FACTOR = {
  value: 0.0293,
  unit: "kgCO\u2082/kWh",
  source: "SIN 2024",
  tier: "ghg_protocol",
};
const NONE_FACTOR = { value: 0, unit: "-", source: "-", tier: "none" };

async function loadFuelFactors(): Promise<
  Record<string, { value: number; unit: string; source: string; tier: string }>
> {
  const fuel = await getFuelFactors();
  return {
    diesel: { ...fuel.diesel, tier: "ghg_protocol" },
    gasoline: { ...fuel.gasoline, tier: "ghg_protocol" },
    glp: { ...fuel.glp, tier: "ghg_protocol" },
    electric: ELECTRIC_FACTOR,
    none: NONE_FACTOR,
  };
}

const DEFAULT_EQUIPMENT_PROFILES: Record<
  string,
  { fuel: string; consumption: number; unit: string; scope: number }
> = {
  retroescavadeira: { fuel: "diesel", consumption: 12.0, unit: "L/h", scope: 1 },
  escavadeira: { fuel: "diesel", consumption: 18.0, unit: "L/h", scope: 1 },
  "caminhão basculante": { fuel: "diesel", consumption: 15.0, unit: "L/h", scope: 1 },
  "caminhão": { fuel: "diesel", consumption: 12.0, unit: "L/h", scope: 1 },
  "pá carregadeira": { fuel: "diesel", consumption: 15.0, unit: "L/h", scope: 1 },
  "rolo compactador": { fuel: "diesel", consumption: 10.0, unit: "L/h", scope: 1 },
  betoneira: { fuel: "electric", consumption: 5.0, unit: "kWh/h", scope: 2 },
  "máquina de solda": { fuel: "electric", consumption: 8.0, unit: "kWh/h", scope: 2 },
  guindaste: { fuel: "diesel", consumption: 20.0, unit: "L/h", scope: 1 },
  "bomba de concreto": { fuel: "diesel", consumption: 25.0, unit: "L/h", scope: 1 },
  gerador: { fuel: "diesel", consumption: 10.0, unit: "L/h", scope: 1 },
  andaime: { fuel: "none", consumption: 0, unit: "-", scope: 0 },
  forma: { fuel: "none", consumption: 0, unit: "-", scope: 0 },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeKeyword(text: string): string {
  let t = text.toLowerCase().trim();
  t = t.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  t = t.replace(/[^a-z0-9\s]/g, " ");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

/**
 * Simple token-set-ratio-like scorer.
 * Computes Jaccard-ish overlap between token sets.
 */
function tokenSetScore(a: string, b: string): number {
  const tokensA = new Set(a.toLowerCase().split(/\s+/));
  const tokensB = new Set(b.toLowerCase().split(/\s+/));
  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }
  const union = tokensA.size + tokensB.size - intersection;
  return union > 0 ? Math.round((intersection / union) * 100) : 0;
}

function partialScore(needle: string, haystack: string): number {
  const n = needle.toLowerCase();
  const h = haystack.toLowerCase();
  if (h.includes(n)) return 100;
  // Check if any significant part matches
  const words = n.split(/\s+/);
  let matched = 0;
  for (const w of words) {
    if (w.length > 2 && h.includes(w)) matched++;
  }
  return words.length > 0 ? Math.round((matched / words.length) * 100) : 0;
}

// ---------------------------------------------------------------------------
// GET /api/equipment-rules/suggest/[itemId]
// ---------------------------------------------------------------------------
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  let user: AuthUser;
  try {
    user = await getCurrentUser(req);
  } catch {
    return unauthorized();
  }

  const { itemId } = await params;

  const { data: item } = await supabase
    .from("abc_items")
    .select("*")
    .eq("id", itemId)
    .single();

  if (!item) {
    return Response.json(
      { detail: "Item não encontrado" },
      { status: 404 }
    );
  }

  const desc = item.description as string;
  const qty = (item.quantity as number) ?? 0;
  const keyword = normalizeKeyword(desc);

  // 1. Check saved equipment rules
  const { data: rules } = await supabase
    .from("equipment_rules")
    .select("*")
    .eq("company_id", user.company_id)
    .eq("is_active", true);

  let bestRule: Record<string, unknown> | null = null;
  let bestScore = 0;

  for (const rule of rules ?? []) {
    if (rule.match_keyword === keyword) {
      bestRule = rule;
      bestScore = 100;
      break;
    }
    const score = tokenSetScore(keyword, rule.match_keyword);
    if (score > bestScore && score >= 75) {
      bestRule = rule;
      bestScore = score;
    }
  }

  if (bestRule) {
    const total =
      qty *
      (bestRule.consumption_per_hour as number) *
      (bestRule.emission_factor_value as number);
    return Response.json({
      category: bestRule.category,
      fuel_type: bestRule.fuel_type,
      consumption_per_hour: bestRule.consumption_per_hour,
      consumption_unit: bestRule.consumption_unit,
      emission_factor_value: bestRule.emission_factor_value,
      emission_factor_unit: bestRule.emission_factor_unit,
      emission_factor_source: bestRule.emission_factor_source,
      emission_factor_tier: bestRule.emission_factor_tier,
      scope: bestRule.scope,
      total_kgco2e: total,
    });
  }

  // 2. Fallback: match against default profiles
  const descLower = desc.toLowerCase();
  let matchedCat: string | null = null;

  for (const cat of Object.keys(DEFAULT_EQUIPMENT_PROFILES)) {
    if (descLower.includes(cat)) {
      matchedCat = cat;
      break;
    }
  }

  if (!matchedCat) {
    // Try fuzzy
    for (const cat of Object.keys(DEFAULT_EQUIPMENT_PROFILES)) {
      if (partialScore(descLower, cat) >= 80) {
        matchedCat = cat;
        break;
      }
    }
  }

  if (!matchedCat) {
    matchedCat = "caminhão"; // generic fallback
  }

  const profile = DEFAULT_EQUIPMENT_PROFILES[matchedCat];
  let fuelFactors: Awaited<ReturnType<typeof loadFuelFactors>>;
  try {
    fuelFactors = await loadFuelFactors();
  } catch (e) {
    console.error("equipment-rules/suggest: fatores canônicos indisponíveis:", e);
    return Response.json(
      { detail: e instanceof Error ? e.message : "Erro ao resolver fatores canônicos" },
      { status: 502 }
    );
  }
  const fuel = fuelFactors[profile.fuel] ?? fuelFactors.diesel;

  const consumption = profile.consumption;
  const factor = fuel.value;
  const total = qty * consumption * factor;

  return Response.json({
    category: matchedCat,
    fuel_type: profile.fuel,
    consumption_per_hour: consumption,
    consumption_unit: profile.unit,
    emission_factor_value: factor,
    emission_factor_unit: fuel.unit,
    emission_factor_source: fuel.source,
    emission_factor_tier: fuel.tier,
    scope: profile.scope,
    total_kgco2e: total,
  });
}
