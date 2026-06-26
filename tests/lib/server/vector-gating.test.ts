import { describe, it, expect, vi, beforeEach } from "vitest";

// "Vetor enriquece, não resgata" — guarda contra o overshoot de paridade:
// itens de serviço/sem-material (ANDAIME, PINTURA) que o determinístico deixa
// sem fator NÃO podem ser resgatados por um candidato puramente vetorial.

vi.mock("@/lib/server/supabase-emission", () => ({
  searchEcoinvent: vi.fn().mockResolvedValue([]),
  searchGhg: vi.fn().mockResolvedValue([]),
  searchCecarbon: vi.fn().mockResolvedValue([]),
}));

// Vetor habilitado + um candidato de alto valor (o "resgate" perigoso).
vi.mock("@/lib/server/factor-search/vector-search", () => ({
  isVectorSearchEnabled: () => true,
  vectorSearchCandidates: vi.fn().mockResolvedValue([
    {
      source_tier: "ecoinvent",
      score: 60,
      factor_value: 183.6,
      factor_unit: "kgCO2e/m3",
      product_unit: "m3",
      factor_name: "madeira laminada colada",
      factor_source: "Ecoinvent (RAG)",
      geography: "",
      ecoinvent_product_id: "rag-glulam",
    },
  ]),
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

describe("vetor enriquece, não resgata", () => {
  it("NÃO resgata quando o determinístico não achou nada (caso ANDAIME)", async () => {
    // Catálogos vazios → determinístico sem candidato. O vetor traria o
    // glulam 183/m³, mas a guarda impede que ele entre no pool sozinho.
    const r = await autoMatchItem("ANDAIME TUBULAR PARA PAREDES", "m3");
    expect(r.best).toBeNull();
    expect(r.results).toHaveLength(0);
  });

  it("enriquece quando o determinístico já tem candidato", async () => {
    // CECarbon casa concreto → há sinal de material → o vetor entra no pool
    // e pode competir/enriquecer.
    mockedCecarbon.mockResolvedValue([
      {
        id: 1,
        "Descrição fator de emissao": "Concreto 40 MPa",
        "fator de emissão (kgCO2)": 274,
        Unidade: "m3",
      },
    ]);
    const r = await autoMatchItem("CONCRETO 40 MPA USINADO", "m3");
    expect(r.best).not.toBeNull();
    // O candidato do vetor (glulam) está presente no pool enriquecido.
    expect(r.results.some((c) => c.factor_name === "madeira laminada colada")).toBe(true);
  });
});
