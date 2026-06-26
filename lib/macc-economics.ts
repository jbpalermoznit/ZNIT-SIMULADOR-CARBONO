/**
 * Economia das recomendações de redução (puro, client-safe).
 *
 * Custo de abatimento = Δ custo do projeto ÷ tCO₂e evitado. A categoria reusa
 * os limiares já usados na curva MACC. Quando não há preço para a alternativa,
 * o custo é desconhecido ("custo a confirmar") → categoria `unknown`.
 */

export type CostCategory = "saving" | "low" | "medium" | "high" | "unknown";

/**
 * Custo de abatimento em R$/tCO₂e. `null` quando não há preço (custo a
 * confirmar) ou quando o abatimento não é positivo (sem redução).
 */
export function abatementCostPerTco2e(
  deltaCostR: number | null | undefined,
  abatementTco2e: number
): number | null {
  if (deltaCostR == null || !Number.isFinite(deltaCostR)) return null;
  if (!(abatementTco2e > 0)) return null;
  return Math.round((deltaCostR / abatementTco2e) * 100) / 100;
}

/** Categoria pelo custo de abatimento. `null` → `unknown` ("custo a confirmar"). */
export function costCategory(costPerTco2e: number | null): CostCategory {
  if (costPerTco2e == null) return "unknown";
  if (costPerTco2e < 0) return "saving";
  if (costPerTco2e <= 50) return "low";
  if (costPerTco2e <= 200) return "medium";
  return "high";
}

/**
 * Ordena recomendações por custo de abatimento crescente: "no-regret"
 * (saving, mais negativo primeiro) → baratos → caros → `unknown` por último.
 * Em empate de custo, maior abatimento primeiro.
 */
export function compareByAbatementCost(
  a: { cost_per_tco2e: number | null; abatement_tco2e: number },
  b: { cost_per_tco2e: number | null; abatement_tco2e: number }
): number {
  const au = a.cost_per_tco2e == null;
  const bu = b.cost_per_tco2e == null;
  if (au && bu) return b.abatement_tco2e - a.abatement_tco2e;
  if (au) return 1; // desconhecido vai para o fim
  if (bu) return -1;
  if (a.cost_per_tco2e !== b.cost_per_tco2e) {
    return (a.cost_per_tco2e as number) - (b.cost_per_tco2e as number);
  }
  return b.abatement_tco2e - a.abatement_tco2e;
}
