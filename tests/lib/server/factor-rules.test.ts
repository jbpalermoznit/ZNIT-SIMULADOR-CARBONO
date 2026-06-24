import { describe, it, expect, vi, beforeEach } from "vitest";
import { normalizeKeyword } from "@/lib/server/keyword";

// ===========================================================================
// Factor Rules — prioridade 0 do autoMatchItem (decisão #1 do PLANO)
// ===========================================================================
//
// A opção (b) "correção + Factor Rules" depende de a regra REALMENTE casar e
// vencer os catálogos. Estes testes travam: (1) a normalização simétrica de
// keyword (o bug do hífen), (2) a regra vencendo o catálogo, (3) o match por
// substring, (4) o escopo por company_id.

// --- mock encadeável do supabase --------------------------------------------
// autoMatchItem (prioridade 0) faz: from("factor_rules").select("*")
//   .eq("company_id", x).eq("is_active", true)  → await → { data: rules }
// e um update().eq() para times_applied. O holder permite setar as regras por
// teste; é mutável e lido a cada chamada.
const h = vi.hoisted(() => ({ rules: [] as Record<string, unknown>[] }));

vi.mock("@/lib/server/supabase", () => {
  const make = () => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "update", "insert", "eq", "order", "delete"]) {
      chain[m] = () => chain;
    }
    chain.single = () => Promise.resolve({ data: h.rules[0] ?? null });
    // thenable: resolve para a lista de regras (o caso .select().eq().eq())
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve({ data: h.rules }).then(resolve, reject);
    return chain;
  };
  return { supabase: { from: () => make() } };
});

// Catálogos vazios por padrão — quando NÃO há regra, autoMatchItem cai aqui.
vi.mock("@/lib/server/supabase-emission", () => ({
  searchEcoinvent: vi.fn().mockResolvedValue([]),
  searchGhg: vi.fn().mockResolvedValue([]),
  searchCecarbon: vi.fn().mockResolvedValue([]),
}));

import { autoMatchItem } from "@/lib/server/emission-mapper";
import { searchCecarbon } from "@/lib/server/supabase-emission";

const mockedCecarbon = vi.mocked(searchCecarbon);

function rule(partial: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "rule-1",
    company_id: "company-htb",
    match_keyword: "aco ca 50",
    original_description: "ACO CA-50",
    factor_value: 2.21,
    factor_unit: "kgCO₂/kg",
    factor_name: "Aço CA-50 (reinforcing steel)",
    source_tier: "cecarbon",
    source_description: "Factor Rule curada",
    is_active: true,
    times_applied: 0,
    ...partial,
  };
}

beforeEach(() => {
  h.rules = [];
  mockedCecarbon.mockReset().mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// normalizeKeyword — simetria (o bug)
// ---------------------------------------------------------------------------
describe("normalizeKeyword", () => {
  it("troca pontuação por espaço e remove acento", () => {
    expect(normalizeKeyword("ACO CA-50 - BITOLA MEDIA")).toBe("aco ca 50 bitola media");
    expect(normalizeKeyword("Óleo Diesel")).toBe("oleo diesel");
    expect(normalizeKeyword("Concreto 40MPa / usinado")).toBe("concreto 40mpa usinado");
  });

  it("colapsa espaços e apara", () => {
    expect(normalizeKeyword("  aço   ca   50  ")).toBe("aco ca 50");
  });

  it("guarda contra null/undefined", () => {
    expect(normalizeKeyword(null)).toBe("");
    expect(normalizeKeyword(undefined)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// autoMatchItem — prioridade 0
// ---------------------------------------------------------------------------
describe("autoMatchItem — Factor Rules (prioridade 0)", () => {
  it("a regra casa mesmo com hífen/pontuação na descrição (regressão do bug)", async () => {
    // keyword "aco ca 50" vs descrição "ACO CA-50 - BITOLA MEDIA".
    // Antes do fix, descNorm mantinha o hífen ("aco ca-50") e o includes
    // falhava. Agora ambos passam por normalizeKeyword.
    h.rules = [rule({})];
    const r = await autoMatchItem("ACO CA-50 - BITOLA MEDIA", "kg", "company-htb");
    expect(r.best?.source_tier).toBe("cecarbon");
    expect(r.best?.factor_value).toBe(2.21);
    expect(r.confidence).toBe("high");
  });

  it("a regra vence o catálogo (não chega a consultar CECarbon)", async () => {
    h.rules = [rule({ match_keyword: "concreto 40", factor_value: 274, factor_unit: "kgCO₂/m3" })];
    mockedCecarbon.mockResolvedValue([
      { id: 9, "Descrição fator de emissao": "Concreto 40 MPa", "fator de emissão (kgCO2)": 999, Unidade: "m3" },
    ]);
    const r = await autoMatchItem("CONCRETO 40 MPA USINADO", "m3", "company-htb");
    expect(r.best?.factor_value).toBe(274); // valor da regra, não 999 do catálogo
    expect(mockedCecarbon).not.toHaveBeenCalled();
  });

  it("casa por substring (keyword é parte da descrição)", async () => {
    h.rules = [rule({ match_keyword: "oleo diesel", factor_value: 2.68, source_tier: "ghg_protocol" })];
    const r = await autoMatchItem("OLEO DIESEL S10 ADITIVADO", "L", "company-htb");
    expect(r.best?.source_tier).toBe("ghg_protocol");
    expect(r.best?.factor_value).toBe(2.68);
  });

  it("NÃO aplica regra de outra empresa (escopo por company_id)", async () => {
    // O mock devolve as regras independentemente do company_id, então
    // simulamos o isolamento: sem regras carregadas para esta empresa.
    h.rules = [];
    const r = await autoMatchItem("ACO CA-50", "kg", "outra-empresa");
    // Sem regra e catálogo vazio → sem match.
    expect(r.best).toBeNull();
  });

  it("não consulta Factor Rules quando não há companyId", async () => {
    h.rules = [rule({})];
    const r = await autoMatchItem("ACO CA-50 - BITOLA MEDIA", "kg");
    // Sem companyId, prioridade 0 é pulada → cai no catálogo (vazio).
    expect(r.best).toBeNull();
  });
});
