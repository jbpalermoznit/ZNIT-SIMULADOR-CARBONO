import { describe, expect, it, vi, beforeEach } from "vitest";
import { extractKeywords } from "@/lib/server/emission-mapper";

// ===========================================================================
// Stub the emission-factor catalog calls so autoMatchItem stays a pure
// function over the in-memory inputs we control.
// ===========================================================================
//
// The mock must be hoisted before importing autoMatchItem; vi.mock takes
// care of that. Each catalog function returns an empty array by default,
// and individual tests override with mockResolvedValueOnce.
vi.mock("@/lib/server/supabase-emission", () => ({
  searchEcoinvent: vi.fn().mockResolvedValue([]),
  searchGhg: vi.fn().mockResolvedValue([]),
  searchCecarbon: vi.fn().mockResolvedValue([]),
}));

import { autoMatchItem } from "@/lib/server/emission-mapper";
import {
  searchEcoinvent,
  searchGhg,
  searchCecarbon,
} from "@/lib/server/supabase-emission";

const mockedEcoinvent = vi.mocked(searchEcoinvent);
const mockedGhg = vi.mocked(searchGhg);
const mockedCecarbon = vi.mocked(searchCecarbon);

beforeEach(() => {
  mockedEcoinvent.mockReset().mockResolvedValue([]);
  mockedGhg.mockReset().mockResolvedValue([]);
  mockedCecarbon.mockReset().mockResolvedValue([]);
});

// ===========================================================================
// extractKeywords
// ===========================================================================
//
// Pure tokenizer that drives the search query construction. Pin the
// transformations that the auto-mapper relies on so a regex tweak can't
// silently regress them.

describe("extractKeywords", () => {
  it("lowercases and trims", () => {
    const ks = extractKeywords("  CONCRETO ESTRUTURAL  ");
    expect(ks).toContain("concreto");
    expect(ks).toContain("estrutural");
  });

  it("drops stopwords (de, do, em, ...)", () => {
    const ks = extractKeywords("Concreto de Estaca em Fundação");
    expect(ks).not.toContain("de");
    expect(ks).not.toContain("em");
    expect(ks).toContain("concreto");
    expect(ks).toContain("estaca");
    expect(ks).toContain("fundação");
  });

  it("normalises fck=NN with optional spaces / equal sign", () => {
    expect(extractKeywords("Concreto fck=30")).toContain("fck=30");
    expect(extractKeywords("Concreto fck 30")).toContain("fck=30");
    expect(extractKeywords("Concreto fck30")).toContain("fck=30");
    expect(extractKeywords("Concreto FCK = 30")).toContain("fck=30");
  });

  it("collapses 'óleo diesel' and 'óleodiesel' to a stable form", () => {
    // Some ABCs join the two words; the auto-map needs the unified token
    // so the GHG catalog query lands on 'óleo diesel'.
    const a = extractKeywords("Aquisição de óleodiesel");
    const b = extractKeywords("Aquisição de óleo diesel");
    expect(a).toEqual(b);
    expect(a.some((k) => k.includes("diesel"))).toBe(true);
  });

  it("stems Portuguese plurals", () => {
    const ks = extractKeywords("Blocos cerâmicos");
    expect(ks).toContain("bloco");
    expect(ks).toContain("cerâmico");
  });

  it("splits on slashes, hyphens, parens, commas, semicolons", () => {
    const ks = extractKeywords("Aço CA-50 (vergalhão)/barra 12,5mm");
    // The hyphen splits "CA-50" into "ca" + "50" — that's intentional, the
    // matcher reassembles via SEARCH_QUERIES["ca50"] when 'ca' and '50'
    // both appear. We test the tokens that survive splitting.
    expect(ks).toContain("aço");
    expect(ks).toContain("vergalhão");
    expect(ks).toContain("barra");
    expect(ks).toContain("50"); // numeric tokens > 1 char are kept
  });

  // Documented gap: "CA-50" gets fragmented. Production-quality matcher
  // would coalesce common-pattern tokens like CA-50/CA-60/CA-25 before
  // splitting. Fix candidate for a follow-up.
  it.todo("recognises 'CA-50' as a single token (currently splits to ca+50)");

  it("drops single-character tokens", () => {
    const ks = extractKeywords("Aço A B C");
    expect(ks).not.toContain("a");
    expect(ks).not.toContain("b");
    expect(ks).not.toContain("c");
  });
});

// ===========================================================================
// autoMatchItem — invariants
// ===========================================================================
//
// We don't lock specific scores (the matcher tunes them often). We pin
// the *promises* the rest of the system depends on.

describe("autoMatchItem — invariants", () => {
  it("never returns source_tier='epd' (EPDs are out of auto-match)", async () => {
    // Even if the mocked catalogs returned EPD-like rows, the matcher
    // wouldn't gather them — the EPD search call was removed. Sanity-check
    // the contract by inspecting candidate tiers across a typical query.
    mockedCecarbon.mockResolvedValue([
      {
        id: 1,
        "Descrição fator de emissao": "Concreto C30",
        "fator de emissão (kgCO2)": 0.18,
        Unidade: "kg",
        densidade: 2400,
      },
    ]);
    mockedEcoinvent.mockResolvedValue([
      {
        product_id: "p1",
        activity_id: "a1",
        product_name: "concrete C30",
        activity_name: "concrete production",
        impact_score: "180",
        impact_unit: "kg CO2-Eq",
        product_unit: "m3",
        geography: "BR",
      },
    ]);
    const r = await autoMatchItem("Concreto fck=30");
    for (const c of r.results) {
      expect(c.source_tier).not.toBe("epd");
    }
  });

  it("returns best=null when every catalog is empty", async () => {
    const r = await autoMatchItem("Item desconhecido sem catálogo");
    expect(r.best).toBeNull();
    expect(r.confidence).toBeNull();
    expect(r.results).toEqual([]);
  });

  it("filters out candidates with factor_value <= 0", async () => {
    mockedCecarbon.mockResolvedValue([
      {
        id: 1,
        "Descrição fator de emissao": "Concreto C30",
        "fator de emissão (kgCO2)": 0,   // zero — must be filtered
        Unidade: "kg",
      },
      {
        id: 2,
        "Descrição fator de emissao": "Concreto C30 v2",
        "fator de emissão (kgCO2)": 0.18,
        Unidade: "kg",
      },
    ]);
    const r = await autoMatchItem("Concreto fck=30");
    for (const c of r.results) {
      expect(c.factor_value).toBeGreaterThan(0);
    }
  });

  it("filters out disabled CECarbon entries (factor_name starting with *)", async () => {
    // CECarbon flags deprecated entries with a leading * — they must
    // never appear as a best match. Regression guard from the launch
    // sprint where deprecated entries leaked.
    mockedCecarbon.mockResolvedValue([
      {
        id: 1,
        "Descrição fator de emissao": "*deprecated entry",
        "fator de emissão (kgCO2)": 0.30,
        Unidade: "kg",
      },
      {
        id: 2,
        "Descrição fator de emissao": "Concreto C30",
        "fator de emissão (kgCO2)": 0.18,
        Unidade: "kg",
      },
    ]);
    const r = await autoMatchItem("Concreto fck=30");
    for (const c of r.results) {
      expect(c.factor_name.startsWith("*")).toBe(false);
    }
  });

  it("triggers a GHG search when the description contains a fuel keyword", async () => {
    mockedGhg.mockResolvedValue([
      {
        id: 1,
        produto: "Óleo Diesel",
        co2: "2.681",
        ch4: "0",
        n2o: "0",
        versao_ghg: "v2024",
        pais: "Brasil",
      },
    ]);
    const r = await autoMatchItem("Óleo Diesel para caminhão", "L");
    expect(mockedGhg).toHaveBeenCalled();
    expect(r.results.some((c) => c.source_tier === "ghg_protocol")).toBe(true);
  });

  it("does NOT trigger GHG for non-fuel descriptions", async () => {
    await autoMatchItem("Concreto fck=30");
    expect(mockedGhg).not.toHaveBeenCalled();
  });
});
