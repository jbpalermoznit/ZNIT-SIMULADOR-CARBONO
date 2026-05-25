/**
 * Heuristic: classify an ABC item type from its iTwo cost-code prefix.
 *
 * The iTwo cost-code namespace follows a stable family scheme:
 *   40xx  → labor (mão-de-obra) — emissions are indirect; route to type B
 *   41xx  → administrative / staff (indirect)               → F
 *   42xx  → materials                                        → A
 *   43xx  → finishes / openings (doors, windows, hardware)   → A
 *   44xx  → equipment / installations                         → E
 *   45xx  → subcontracts (lump-sum services)                  → F
 *   46xx  → temporary works / utilities                       → F
 *   47xx  → engineering services                              → F
 *   48xx  → site overheads                                    → F
 *
 * The function returns `null` when the code doesn't start with one of these
 * families — caller should keep whatever the spreadsheet parser produced.
 */
export type ItemType = "A" | "B" | "C" | "D" | "E" | "F";

export function inferTypeFromCostCode(costCode: string): ItemType | null {
  const trimmed = costCode.trim();
  if (!trimmed) return null;
  // Accept any number of digits in the leading prefix; we look at the first
  // two characters which encode the family.
  const family = trimmed.slice(0, 2);
  switch (family) {
    case "40": return "B";
    case "41": return "F";
    case "42": return "A";
    case "43": return "A";
    case "44": return "E";
    case "45": return "F";
    case "46": return "F";
    case "47": return "F";
    case "48": return "F";
    default:   return null;
  }
}

/**
 * For types where there's no direct Scope 3 material emission, the
 * auto-mapping flow should mark the item excluded with a stable
 * justification rather than leave it pending or — worse — let it match
 * via the wrong assembly description.
 *
 * - B (labor): no material; emissions are indirect.
 * - D (embedded material): the material is already counted in the parent
 *   item (e.g. "Bombeamento de Concreto" — the concrete itself sits in a
 *   different ABC line).
 * - E (equipment): emission depends on fuel × hours, not on an EPD. Use
 *   the "Parametrizar item" UI to set fuel type, consumption and hours.
 * - F (services / overheads / subcontracts).
 */
export function shouldAutoExcludeType(type: ItemType): boolean {
  return type === "B" || type === "D" || type === "E" || type === "F";
}

export function autoExclusionReason(type: ItemType): string {
  if (type === "B") return "Mão-de-obra — sem emissão direta de Scope 3 materiais (classificação automática por código de custo).";
  if (type === "D") return "Material embutido — emissão já contabilizada no item de material correspondente (evita dupla contagem).";
  if (type === "E") return "Equipamento — emissão deve ser parametrizada via consumo de combustível × horas de uso, não por fator EPD/GHG (use 'Parametrizar item').";
  if (type === "F") return "Serviço/Administrativo — sem emissão direta de Scope 3 materiais (classificação automática por código de custo).";
  return "";
}

/**
 * Heuristic: looks at the assembly descriptions from the iTwo Proof report
 * to decide whether a Tipo C subcontract is *labor-only* (material already
 * counted in another item line) or *material-bearing* (the material is
 * embedded in the subcontract price and emission should be calculated).
 *
 * Returns `true` only when EVERY assembly description matches a labor
 * pattern — a single material-looking assembly is enough to keep the item
 * eligible for enriched auto-matching.
 *
 * Examples that trigger labor-only:
 *   - "Armação CA-50 - corte, dobra e montagem" (labor on existing steel)
 *   - "Estacas tipo hélice contínua - Ø 40cm (sem armação e concreto)"
 *   - "M.O. de corte e dobra"
 *   - "Instalação de equipamento"
 */
export function assembliesLookLaborOnly(descriptions: string[]): boolean {
  if (descriptions.length === 0) return false;
  const laborPatterns: RegExp[] = [
    /sem\s+arma[çc][ãa]o/i,
    /sem\s+concreto/i,
    /sem\s+material/i,
    /corte\s*,?\s*dobra/i,
    /\bm\.?\s*o\.?\b/i,             // "M.O." — labor abbrev
    /^\s*instala[çc][ãa]o\s+de\b/i, // "Instalação de ..."
    /^\s*montagem\s+de\b/i,
    /^\s*aplica[çc][ãa]o\s+de\b/i,
  ];
  return descriptions.every((d) => laborPatterns.some((re) => re.test(d)));
}

/**
 * Labor-only exclusion has a different justification than a blanket
 * prefix-based one — it tells the auditor the material is counted in
 * another line, not that the whole category was discarded.
 */
export function laborOnlyExclusionReason(): string {
  return "Subcontrato de mão-de-obra — material já contabilizado em outro item (decomposto pelo Relatório Proof: corte e dobra / sem armação / sem concreto).";
}
