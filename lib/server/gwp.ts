/**
 * GWP (Global Warming Potential) — única fonte de verdade para converter
 * gases individuais (CO₂, CH₄, N₂O) em CO₂e.
 *
 * Valores AR5 (IPCC Fifth Assessment Report, GWP-100, sem carbon-cycle
 * feedback): CH₄ fóssil = 28, N₂O = 265. São os mesmos usados pelo
 * GHG Protocol Brasil v2025. CO₂ biogênico (co2_bio) fica fora do CO₂e
 * fóssil por convenção do inventário BR (reportado à parte).
 */
export const GWP_AR5 = {
  CH4: 28,
  N2O: 265,
} as const;

export interface GhgGasRow {
  co2?: number | string | null;
  ch4?: number | string | null;
  n2o?: number | string | null;
}

const num = (v: number | string | null | undefined): number => {
  const n = parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};

/** CO₂e fóssil (kg) por unidade do fator, arredondado a 6 casas. */
export function computeCo2e(row: GhgGasRow): number {
  const co2e = num(row.co2) + num(row.ch4) * GWP_AR5.CH4 + num(row.n2o) * GWP_AR5.N2O;
  return Math.round(co2e * 1000000) / 1000000;
}
