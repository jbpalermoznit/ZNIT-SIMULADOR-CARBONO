import { describe, expect, it } from "vitest";
import { buildFactorVersion, extractYearFromText } from "@/lib/server/factor-version";

// ===========================================================================
// buildFactorVersion — best-effort por tier, nunca inventa versão.
// ===========================================================================

describe("buildFactorVersion", () => {
  it("ghg_protocol: usa versao_ghg quando presente", () => {
    expect(buildFactorVersion("ghg_protocol", { versao_ghg: "v2025.0.1", ano: 2024 })).toBe(
      "v2025.0.1"
    );
  });

  it("ghg_protocol: cai pra ano quando não há versao_ghg", () => {
    expect(buildFactorVersion("ghg_protocol", { versao_ghg: null, ano: 2024 })).toBe("2024");
  });

  it("ghg_protocol: null quando não há nem versão nem ano", () => {
    expect(buildFactorVersion("ghg_protocol", { versao_ghg: null, ano: null })).toBeNull();
  });

  it("epd: prioriza valid_until sobre registration_date", () => {
    expect(
      buildFactorVersion("epd", {
        valid_until: "2027-01-01",
        registration_date: "2022-01-01",
      })
    ).toBe("válido até 2027-01-01");
  });

  it("epd: usa registration_date quando não há valid_until", () => {
    expect(
      buildFactorVersion("epd", { valid_until: null, registration_date: "2022-01-01" })
    ).toBe("registrado em 2022-01-01");
  });

  it("ecoinvent: intervalo quando start e end diferem", () => {
    expect(buildFactorVersion("ecoinvent", { year_start: 2018, year_end: 2023 })).toBe(
      "2018–2023"
    );
  });

  it("ecoinvent: valor único quando start === end", () => {
    expect(buildFactorVersion("ecoinvent", { year_start: 2020, year_end: 2020 })).toBe("2020");
  });

  it("cecarbon: extrai ano de 4 dígitos da Referencia", () => {
    expect(buildFactorVersion("cecarbon", { Referencia: "CECARBON 2024" })).toBe("2024");
  });

  it("cecarbon: null quando a Referencia não tem ano reconhecível", () => {
    expect(buildFactorVersion("cecarbon", { Referencia: "CECARBON" })).toBeNull();
  });

  it("tier desconhecido ou row nulo → null", () => {
    expect(buildFactorVersion("user_custom", { anything: 1 })).toBeNull();
    expect(buildFactorVersion("ghg_protocol", null)).toBeNull();
  });
});

describe("extractYearFromText", () => {
  it("extrai o primeiro ano plausível (2000-2099)", () => {
    expect(extractYearFromText("Fonte: relatório 2023, revisão 2024")).toBe("2023");
  });

  it("ignora números que não parecem ano", () => {
    expect(extractYearFromText("Norma ISO 14025")).toBeNull();
  });

  it("null/undefined/vazio → null", () => {
    expect(extractYearFromText(null)).toBeNull();
    expect(extractYearFromText(undefined)).toBeNull();
    expect(extractYearFromText("")).toBeNull();
  });
});
