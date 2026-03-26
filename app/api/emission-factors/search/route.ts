/**
 * GET /api/emission-factors/search
 * Busca unificada em GHG Protocol, CECarbon, Ecoinvent e catálogo de EPDs.
 * Port of backend/app/api/emission_factors.py — search_factors
 */

import { NextRequest } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/server/auth";
import {
  searchEcoinvent,
  searchGhg,
  searchCecarbon,
  searchEpdCatalog,
} from "@/lib/server/supabase-emission";
import { extractKeywords } from "@/lib/server/emission-mapper";

// Build Ecoinvent search queries (inline simplified version)
function buildSearchQueries(keywords: string[]): string[] {
  const SEARCH_QUERIES: Record<string, string[]> = {
    concreto: ["concrete"],
    "aço": ["reinforcing steel", "steel"],
    "vergalhão": ["reinforcing steel"],
    ca50: ["reinforcing steel"],
    cimento: ["cement", "portland cement"],
    madeira: ["sawn wood", "wood"],
    bloco: ["concrete block"],
    areia: ["sand"],
    brita: ["gravel"],
    pvc: ["pvc pipe", "polyvinyl chloride"],
    diesel: ["diesel"],
    tinta: ["paint"],
    vidro: ["flat glass"],
    gesso: ["gypsum"],
  };

  const queries: string[] = [];
  for (const kw of keywords) {
    if (kw in SEARCH_QUERIES) queries.push(...SEARCH_QUERIES[kw]);
  }
  const seen = new Set<string>();
  return queries.filter((q) => {
    if (seen.has(q)) return false;
    seen.add(q);
    return true;
  });
}

export async function GET(req: NextRequest) {
  try {
    await getCurrentUser(req);
  } catch {
    return unauthorized();
  }

  const q = req.nextUrl.searchParams.get("q");
  if (!q || q.length < 2) {
    return Response.json(
      { detail: "Parâmetro 'q' obrigatório (mínimo 2 caracteres)" },
      { status: 400 }
    );
  }

  const tier = req.nextUrl.searchParams.get("tier");
  const limit = Math.min(
    parseInt(req.nextUrl.searchParams.get("limit") ?? "10", 10),
    50
  );

  const tiers = tier
    ? tier.split(",")
    : ["ghg_protocol", "cecarbon", "ecoinvent", "epd_catalog"];

  const ecoinventResults: Record<string, unknown>[] = [];
  const ghgResults: Record<string, unknown>[] = [];
  const cecarbonResults: Record<string, unknown>[] = [];
  const epdResults: Record<string, unknown>[] = [];

  if (tiers.includes("ghg_protocol")) {
    try {
      const rows = await searchGhg(q, limit);
      ghgResults.push(...rows);
    } catch (e) {
      console.error("GHG search error:", e);
    }
  }

  if (tiers.includes("cecarbon")) {
    try {
      const rows = await searchCecarbon(q, limit);
      for (const r of rows) {
        const factor = r["fator de emissão (kgCO2)"];
        const desc = r["Descrição fator de emissao"];
        if (factor && parseFloat(String(factor)) > 0 && desc !== "0") {
          cecarbonResults.push(r);
        }
      }
    } catch (e) {
      console.error("CECarbon search error:", e);
    }
  }

  if (tiers.includes("ecoinvent")) {
    try {
      const keywords = extractKeywords(q);
      const searchQueries = buildSearchQueries(keywords);
      const allQueries = [...new Set([q, ...searchQueries])];
      const seenIds = new Set<string>();
      for (const sq of allQueries.slice(0, 4)) {
        const rows = await searchEcoinvent(sq, limit);
        for (const r of rows) {
          const key = `${r.product_id}|${r.activity_id}`;
          if (!seenIds.has(key)) {
            seenIds.add(key);
            ecoinventResults.push(r);
          }
        }
      }
      ecoinventResults.splice(limit);
    } catch (e) {
      console.error("Ecoinvent search error:", e);
    }
  }

  if (tiers.includes("epd_catalog")) {
    try {
      const rows = await searchEpdCatalog(q, limit);
      epdResults.push(...rows);
    } catch (e) {
      console.error("EPD catalog search error:", e);
    }
  }

  return Response.json({
    ecoinvent: ecoinventResults,
    ghg_protocol: ghgResults,
    cecarbon: cecarbonResults,
    epd_catalog: epdResults,
  });
}
