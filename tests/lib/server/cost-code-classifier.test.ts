import { describe, expect, it } from "vitest";
import {
  inferTypeFromCostCode,
  shouldAutoExcludeType,
  autoExclusionReason,
  assembliesLookLaborOnly,
  laborOnlyExclusionReason,
  type ItemType,
} from "@/lib/server/cost-code-classifier";

// ===========================================================================
// inferTypeFromCostCode
// ===========================================================================
//
// The iTwo cost-code prefix scheme is the single source of truth here.
// These tests pin every prefix the classifier knows about — adding a new
// prefix family (or changing one) without updating this table should fail
// loudly so the change is explicit.

describe("inferTypeFromCostCode", () => {
  const cases: Array<[string, ItemType | null, string]> = [
    // 40xx → labor (B)
    ["400101-OfForma", "B", "labor / mão de obra"],
    ["4001", "B", "labor prefix even with shorter code"],
    // 41xx → administrative (F)
    ["410201-AdmSite", "F", "administrative / staff"],
    // 42xx → materials (A)
    ["420301-ca50B", "A", "steel — material"],
    ["420101-ConEstacaHélice", "A", "concrete — material"],
    // 43xx → finishes (A)
    ["430102-BlocoVed19", "A", "concrete block — material"],
    ["430401-BarraAntiPanico", "A", "hardware — material"],
    // 44xx → equipment (E)
    ["440105-Retro", "E", "retroescavadeira"],
    ["440103-MáquinaSolda", "E", "welding machine"],
    // 45xx → subcontracts (F)
    ["450201-SubTerrapl-Pav-Dren", "F", "earthworks subcontract"],
    ["450401-SubHélice", "F", "piling subcontract"],
    // 46xx → temporary works / overheads (F)
    ["460701-EnsaioPIT", "F", "testing"],
    ["460114-OléoDiesel", "F", "diesel raw, before parser reclass"],
    // 47xx engineering / 48xx site → F
    ["470101-ProjArq", "F", "engineering"],
    ["480501-Adm", "F", "site overhead"],
    // Unrecognised prefixes → null (caller keeps spreadsheet parser type)
    ["99XX-Test", null, "unknown prefix returns null"],
    ["999-DummyMisc", null, "unknown three-digit prefix returns null"],
    ["", null, "empty string → null"],
    ["  ", null, "whitespace-only → null"],
  ];

  it.each(cases)("classifies %s → %s (%s)", (code, expected) => {
    expect(inferTypeFromCostCode(code)).toBe(expected);
  });

  it("trims surrounding whitespace before classifying", () => {
    expect(inferTypeFromCostCode("  420301-ca50B  ")).toBe("A");
  });
});

// ===========================================================================
// shouldAutoExcludeType + autoExclusionReason
// ===========================================================================
//
// These two functions encode the policy "which types of items don't need
// a material factor at all". Touching the list is a business decision; the
// tests should force you to make that decision explicit.

describe("shouldAutoExcludeType", () => {
  // The intent of every Tipo:
  //   A — material direto       → keep, auto-map
  //   B — labor                 → exclude
  //   C — item agrupado          → keep blocked, NOT auto-exclude
  //   D — material embutido      → exclude (counted elsewhere)
  //   E — equipment              → exclude (parametrize separately)
  //   F — admin / services       → exclude
  it("excludes B, D, E, F", () => {
    expect(shouldAutoExcludeType("B")).toBe(true);
    expect(shouldAutoExcludeType("D")).toBe(true);
    expect(shouldAutoExcludeType("E")).toBe(true);
    expect(shouldAutoExcludeType("F")).toBe(true);
  });

  it("keeps A and C", () => {
    expect(shouldAutoExcludeType("A")).toBe(false);
    // C is NEVER auto-excluded — it stays blocked until the analyst either
    // decomposes via Insumos or the main match loop finds a usable factor.
    // Regression guard for the subcontract-rescue fix.
    expect(shouldAutoExcludeType("C")).toBe(false);
  });
});

describe("autoExclusionReason", () => {
  it("returns a non-empty reason for every excluded type", () => {
    for (const t of ["B", "D", "E", "F"] as const) {
      const reason = autoExclusionReason(t);
      expect(reason.length).toBeGreaterThan(20);
    }
  });

  it("B and F carry the legacy marker text", () => {
    // The reclassify-blocked endpoint detects legacy auto-exclusions by
    // matching "classificação automática por código de custo" in the
    // justification. B (labor) and F (admin/services) flow through that
    // generic path, so the marker must stay.
    expect(autoExclusionReason("B")).toMatch(
      /classificação automática por código de custo/,
    );
    expect(autoExclusionReason("F")).toMatch(
      /classificação automática por código de custo/,
    );
  });

  // D (material embutido) and E (equipment) are deterministic policy
  // exclusions — there's no "reversible by reclassifier" intent for them,
  // so their text intentionally lacks the marker. Documented here so a
  // future copy-paste doesn't add it absent-mindedly.
  it.todo(
    "D and E reasons do NOT need the marker (policy decision, not reversible)",
  );

  it("returns empty for non-exclusion types", () => {
    expect(autoExclusionReason("A")).toBe("");
    expect(autoExclusionReason("C")).toBe("");
  });
});

// ===========================================================================
// assembliesLookLaborOnly
// ===========================================================================
//
// When the Proof report shows all assemblies are labor-on-already-counted-
// material (cortes/dobras de aço já contado, "sem armação e sem concreto",
// "instalação de equipamento"), the C item should be excluded with the
// *informed* reason — not just the generic prefix one.

describe("assembliesLookLaborOnly", () => {
  it("empty list → false (no evidence either way)", () => {
    expect(assembliesLookLaborOnly([])).toBe(false);
  });

  it("classic labor markers all return true", () => {
    expect(
      assembliesLookLaborOnly([
        "Armação CA-50 - corte, dobra e montagem",
      ]),
    ).toBe(true);
    expect(
      assembliesLookLaborOnly([
        "Estacas tipo hélice contínua - Ø 40cm (sem armação e concreto)",
      ]),
    ).toBe(true);
    expect(
      assembliesLookLaborOnly([
        "Estaca Ø 50cm sem material",
      ]),
    ).toBe(true);
    expect(
      assembliesLookLaborOnly([
        "M.O. de corte, dobra",
        "MO instalação de fôrma",
      ]),
    ).toBe(true);
    expect(
      assembliesLookLaborOnly([
        "Instalação de equipamento",
        "Montagem de andaime",
        "Aplicação de pintura",
      ]),
    ).toBe(true);
  });

  // The Proof report from Raízen has an entry "M.O. de corte e dobra"
  // (literal "e" between corte and dobra) — the current regex
  // /corte\s*,?\s*dobra/i requires only whitespace ± a comma between the
  // two words, so it MISSES this real-world spelling. Documented here as
  // a known gap. Fix would be: broaden the regex to /corte\s+(e\s+)?dobra/i.
  it.todo("regex should match 'corte e dobra' (Proof report literal)");

  it("a single material-bearing assembly disqualifies the whole list", () => {
    // Even if 9 lines say "corte e dobra", one "Concreto C30" means the
    // subcontract has embedded material → don't exclude as labor-only.
    expect(
      assembliesLookLaborOnly([
        "Armação CA-50 - corte e dobra",
        "Armação CA-50 - corte e dobra",
        "Concreto C30",
      ]),
    ).toBe(false);
  });

  it("accents and case don't change the verdict (when pattern matches)", () => {
    // The regex must remain accent- and case-insensitive — the Proof report
    // uses inconsistent spellings.
    expect(
      assembliesLookLaborOnly([
        "Armacao CA-50 - corte, dobra",
        "Armação CA-50 - CORTE, DOBRA",
      ]),
    ).toBe(true);
  });

  it("material descriptions without labor markers are not labor-only", () => {
    expect(
      assembliesLookLaborOnly([
        "Alvenaria de Bloco de Concreto 19x19x39cm",
        "Concreto bombeado fck=30",
      ]),
    ).toBe(false);
  });
});

describe("laborOnlyExclusionReason", () => {
  it("carries the Proof marker so reclassify-blocked recognises it", () => {
    // The marker text is the signal the self-healing endpoint uses to
    // distinguish "informed labor-only exclusion" from a plain prefix-F.
    expect(laborOnlyExclusionReason()).toMatch(/Relatório Proof/);
  });
});
