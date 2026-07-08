import { NextRequest } from "next/server";
import { supabase, supabaseEmission } from "@/lib/server/supabase";
import { getCurrentUser, unauthorized } from "@/lib/server/auth";
import { resolveConversion } from "@/lib/server/calculator";
import { getCompanyEpdRegistry } from "@/lib/server/epd-prices";
import { getEpdsByIds } from "@/lib/server/supabase-emission";
import {
  abatementCostPerTco2e,
  costCategory,
  compareByAbatementCost,
} from "@/lib/macc-economics";
import type { AuthUser } from "@/lib/server/auth";

export const maxDuration = 60;

/** Classe de resistência fck (MPa) a partir do texto ("fck 30", "C30", "fck=40"). */
function parseFckClass(text: string): number | null {
  const t = text.toLowerCase();
  const m =
    t.match(/fck\s*=?\s*(\d{2,3})/) ||
    t.match(/\bc[-\s]?(\d{2,3})\b/) ||
    t.match(/(\d{2,3})\s*mpa/);
  if (!m) return null;
  const v = parseInt(m[1], 10);
  return v >= 10 && v <= 100 ? v : null;
}

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

async function loadAllEpdsWithoutGwp(): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabaseEmission
    .from("epd_dev")
    .select("id, titulo, company_name, country, geographical_scopes, declared_unit, declared_value, registration_number, informacao_produto, pdf_url, source_url")
    .is("gwp_a1a3", null)
    .ilike("country", "%Brazil%")
    .order("company_name")
    .limit(500);

  if (error) {
    console.error("Error loading EPDs without GWP:", error.message);
    return [];
  }
  return data ?? [];
}

// PT→EN translations for EPD matching
const EPD_TRANSLATIONS: Record<string, string[]> = {
  concreto: ["concrete", "ready-mix", "ready mixed"],
  cimento: ["cement", "portland"],
  aco: ["steel", "reinforcing"],
  armadura: ["reinforcing steel", "rebar"],
  "ca-50": ["reinforcing steel", "rebar"],
  "ca-60": ["reinforcing steel", "welded mesh"],
  "ca-25": ["reinforcing steel"],
  tela: ["welded mesh", "mesh"],
  vergalhao: ["reinforcing steel", "rebar"],
  arame: ["wire", "steel wire"],
  diesel: ["diesel"],
  madeira: ["wood", "timber", "sawn"],
  forma: ["formwork", "plywood"],
  bloco: ["concrete block", "masonry"],
  argamassa: ["mortar"],
  brita: ["gravel", "aggregate"],
  areia: ["sand"],
};

function matchEpdsReferences(
  description: string,
  epds: Record<string, unknown>[]
): Record<string, unknown>[] {
  const keywords = extractKeywords(description);
  const descLower = description.toLowerCase();
  const matches: Record<string, unknown>[] = [];

  // Build translated search terms
  const searchTerms = [...keywords];
  for (const kw of keywords) {
    const translations = EPD_TRANSLATIONS[kw];
    if (translations) searchTerms.push(...translations);
  }

  for (const epd of epds) {
    const titulo = ((epd.titulo as string) ?? "").toLowerCase();
    const info = ((epd.informacao_produto as string) ?? "").toLowerCase();
    const company = ((epd.company_name as string) ?? "").toLowerCase();
    const combined = `${titulo} ${info} ${company}`;

    let relevant = false;
    let matchCount = 0;
    for (const term of searchTerms) {
      if (combined.includes(term)) {
        relevant = true;
        matchCount++;
      }
    }
    if (!relevant) continue;

    // Score based on match count and specificity
    let score = matchCount * 25;
    score = Math.max(score, tokenSetScore(descLower, titulo));
    score = Math.max(score, partialScore(descLower, titulo));

    if (score < 20) continue;

    matches.push({
      epd_id: epd.id,
      titulo: epd.titulo ?? "",
      company_name: epd.company_name ?? "",
      country: epd.country ?? epd.geographical_scopes ?? "",
      declared_unit: ((epd.declared_unit as string) ?? "").trim(),
      declared_value: epd.declared_value,
      registration_number: epd.registration_number ?? "",
      pdf_url: epd.pdf_url ?? epd.source_url ?? "",
      score,
      has_gwp: false,
    });
  }

  matches.sort((a, b) => (b.score as number) - (a.score as number));
  return matches.slice(0, 5);
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
  // Tradução PT→EN: os títulos dos EPDs estão em inglês ("concrete", "steel",
  // "reinforcing"), mas as descrições do orçamento vêm em PT ("concreto",
  // "aço"). Sem traduzir, os EPDs com GWP (poucos, em inglês) nunca casavam.
  // Mesma lógica do matchEpdsReferences (itens sem GWP).
  const searchTerms = [...keywords];
  for (const kw of keywords) {
    const tr = EPD_TRANSLATIONS[kw];
    if (tr) searchTerms.push(...tr);
  }
  const descLower = description.toLowerCase();
  // Equivalência de spec: se o item tem classe (fck), não recomendar EPD de
  // classe INFERIOR (perderia a especificação estrutural).
  const itemFck = parseFckClass(description);

  const matches: Record<string, unknown>[] = [];

  for (const epd of epds) {
    const gwp = epd.gwp_a1a3 as number | null;
    if (gwp == null || gwp <= 0) continue;

    const titulo = ((epd.titulo as string) ?? "").toLowerCase();
    const info = ((epd.informacao_produto as string) ?? "").toLowerCase();

    // Guarda de classe: rejeita EPD de fck conhecido e menor que o do item.
    if (itemFck != null) {
      const epdFck = parseFckClass(`${titulo} ${info}`);
      if (epdFck != null && epdFck < itemFck) continue;
    }

    // Quick relevance check (keywords PT + traduções EN)
    let relevant = false;
    for (const term of searchTerms) {
      if (titulo.includes(term) || info.includes(term)) {
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
      price_per_declared_unit: (epd.price_per_declared_unit as number | null) ?? null,
      score,
      country: epd.country ?? epd.geographical_scopes ?? "",
      reason: relevant
        ? `Casou "${epd.titulo ?? ""}" por descri\u00e7\u00e3o${itemFck != null ? ` (fck \u2265 ${itemFck})` : ""}`
        : `Similaridade textual com "${epd.titulo ?? ""}"`,
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
    priced_count: 0,
    unpriced_count: 0,
  };
}

function computeKpis(bars: Record<string, unknown>[]) {
  if (bars.length === 0) return emptyKpis();

  const totalAbatement = bars.reduce(
    (s, b) => s + (b.abatement_tco2e as number),
    0
  );
  // "no-regret": custo de abatimento negativo (reduz carbono E custo).
  const savingsBars = bars.filter(
    (b) => b.cost_per_tco2e != null && (b.cost_per_tco2e as number) < 0
  );
  const savingsAbatement = savingsBars.reduce(
    (s, b) => s + (b.abatement_tco2e as number),
    0
  );
  // Média só sobre alternativas com preço conhecido (ignora "custo a confirmar").
  const costs = bars
    .map((b) => b.cost_per_tco2e as number | null)
    .filter((c): c is number => c != null);
  const avgCost =
    costs.length > 0 ? costs.reduce((a, b) => a + b, 0) / costs.length : 0;
  const pricedCount = costs.length;

  return {
    total_abatement: Math.round(totalAbatement * 100) / 100,
    savings_abatement: Math.round(savingsAbatement * 100) / 100,
    savings_count: savingsBars.length,
    avg_cost: Math.round(avgCost * 100) / 100,
    total_alternatives: bars.length,
    priced_count: pricedCount,
    unpriced_count: bars.length - pricedCount,
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

  // Registro da empresa (preço + GWP manual por EPD).
  const registry = await getCompanyEpdRegistry(user.company_id);

  // Pool de EPDs com GWP: catálogo global + os que a EMPRESA preencheu o GWP.
  // O GWP da empresa sobrepõe o global (vale só para esta empresa).
  const globalEpds = await loadAllEpdsWithGwp();
  const globalIds = new Set(globalEpds.map((e) => Number(e.id)));
  const companyGwpIds = [...registry.values()]
    .filter((r) => r.gwp_a1a3 != null)
    .map((r) => r.epd_id);
  const missingIds = companyGwpIds.filter((id) => !globalIds.has(id));
  const extraEpds = missingIds.length > 0 ? await getEpdsByIds(missingIds) : [];
  const allEpds = [...globalEpds, ...extraEpds].map((e) => {
    const reg = registry.get(Number(e.id));
    return reg?.gwp_a1a3 != null ? { ...e, gwp_a1a3: reg.gwp_a1a3 } : e;
  });

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

    // Mesma máquina de conversão do calculador (inclui receitas geométricas)
    // — antes, itens dependentes de receita (m²→m³ etc.) zeravam aqui e o
    // baseline do MACC sub-reportava vs. o cenário persistido.
    const baselineConv = resolveConversion(
      item.description ?? "",
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

      const altConv = resolveConversion(
        item.description ?? "",
        item.unit ?? "",
        (candidate.declared_unit as string) ?? ""
      );
      // Guarda de unidade: conversão 0 = unidade do EPD incompatível com a do
      // item. Sem isto, altEmission=0 → abatimento "100%" espúrio.
      if (altConv === 0) continue;
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
        epd_id: candidate.epd_id ?? null,
        item_id: item.id,
        item_unit: item.unit ?? "",
        declared_unit: candidate.declared_unit ?? "",
        alt_conv: altConv,
        price_per_declared_unit: candidate.price_per_declared_unit ?? null,
        abatement_tco2e: Math.round(abatementTco2e * 100) / 100,
        abatement_unit: "tCO\u2082e",
        cost_per_tco2e: null,
        category: "unknown",
        price_estimate: null,
        reason: candidate.reason ?? "",
        score: candidate.score ?? 0,
        country: candidate.country ?? "",
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

  // -------------------------------------------------------------------------
  // Resolver o PREÇO da alternativa (CADASTRO MANUAL, sem IA) e computar o
  // custo de abatimento por bar. Ordem: preço cadastrado pela EMPRESA >
  // preço global no EPD > nenhum ("custo a confirmar"). O usuário cadastra os
  // preços em /epd-prices (public.epd_prices).
  // -------------------------------------------------------------------------
  for (const bar of uniqueBars) {
    const qty = Number(bar.item_quantity ?? 0);
    const baselineLineCost = Number(bar.item_unit_cost ?? 0) * qty;
    let altUnitPerItem: number | null = null;
    let priceMeta: Record<string, unknown> | null = null;

    // Preço cadastrado pela empresa (na price_unit escolhida) > preço global no
    // EPD (na declared_unit). Converte para a unidade do item via a unidade do
    // próprio preço (não necessariamente a declared_unit do EPD).
    const reg = registry.get(Number(bar.epd_id));
    if (reg?.price != null && reg.price > 0) {
      const priceUnit = reg.price_unit ?? String(bar.declared_unit ?? "");
      const conv = resolveConversion(String(bar.item_description ?? ""), String(bar.item_unit ?? ""), priceUnit);
      altUnitPerItem = reg.price * conv;
      priceMeta = {
        value: reg.price, unit: priceUnit, source_name: "Preço cadastrado",
        source_url: null, as_of: reg.updated_at ?? null,
        confidence: "high", is_estimate: false,
      };
    } else {
      const globalPrice = bar.price_per_declared_unit as number | null;
      if (globalPrice != null && globalPrice > 0) {
        altUnitPerItem = globalPrice * Number(bar.alt_conv ?? 0);
        priceMeta = {
          value: globalPrice, unit: bar.declared_unit, source_name: "EPD (global)",
          source_url: null, as_of: null, confidence: "high", is_estimate: false,
        };
      }
    }

    let deltaCost: number | null = null;
    if (altUnitPerItem != null) {
      deltaCost = Math.round((altUnitPerItem * qty - baselineLineCost) * 100) / 100;
    }
    const cpt = abatementCostPerTco2e(deltaCost, Number(bar.abatement_tco2e ?? 0));
    bar.delta_cost_r = deltaCost;
    bar.cost_per_tco2e = cpt;
    bar.category = costCategory(cpt);
    bar.price_estimate = priceMeta;
  }

  // Ranquear por custo de abatimento crescente (no-regret primeiro; sem preço por último).
  uniqueBars.sort((a, b) =>
    compareByAbatementCost(
      { cost_per_tco2e: a.cost_per_tco2e as number | null, abatement_tco2e: a.abatement_tco2e as number },
      { cost_per_tco2e: b.cost_per_tco2e as number | null, abatement_tco2e: b.abatement_tco2e as number }
    )
  );

  const kpis = computeKpis(uniqueBars);

  // Load EPDs without GWP and match to items by description
  const allEpdsNoGwp = await loadAllEpdsWithoutGwp();
  const recommendations: Record<string, unknown>[] = [];
  const seenRec = new Set<string>();

  for (const item of items) {
    const mapping = mappingByItem[item.id];
    if (!mapping || !mapping.factor_value) continue;

    const baselineFactor = mapping.factor_value as number;
    // Mesma máquina de conversão do calculador (inclui receitas geométricas)
    // — antes, itens dependentes de receita (m²→m³ etc.) zeravam aqui e o
    // baseline do MACC sub-reportava vs. o cenário persistido.
    const baselineConv = resolveConversion(
      item.description ?? "",
      item.unit ?? "",
      (mapping.factor_unit as string) ?? ""
    );
    const baselineEmissionKg = baselineFactor * (item.quantity ?? 0) * baselineConv;
    if (baselineEmissionKg <= 0) continue;

    const refMatches = matchEpdsReferences(
      item.description ?? "",
      allEpdsNoGwp
    );

    for (const ref of refMatches) {
      const key = `${item.cost_code}|${ref.epd_id}`;
      if (seenRec.has(key)) continue;
      seenRec.add(key);
      recommendations.push({
        ...ref,
        item_id: item.id,
        item_description: item.description,
        item_cost_code: item.cost_code,
        item_quantity: item.quantity,
        item_unit: item.unit,
        item_unit_cost: item.unit_cost,
        baseline_factor: Math.round(baselineFactor * 10000) / 10000,
        baseline_emission_kg: Math.round(baselineEmissionKg * 100) / 100,
      });
    }
  }

  return Response.json({ bars: uniqueBars, kpis, epd_recommendations: recommendations });
}
