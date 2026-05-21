/**
 * Parser for the iTwo "Cost Code" catalog spreadsheet.
 *
 * Input: a single sheet with columns (case-insensitive headers):
 *   Structure | Code | Description | Cost Factor | Quantity Factor |
 *   Cost Rate | CUR | UoM | Hrs | With CR | Remarks
 *
 * Output: a Map keyed by Code (the literal cost-code identifier used in the
 * ABC) → canonical record. The Code may carry hierarchy ("40", "4001",
 * "400101", "400101-OfForma"). The parser keeps the leaf-level entries; the
 * caller looks them up by exact match first, then by best prefix.
 */
import * as XLSX from "xlsx";

export interface CostCodeRecord {
  code: string;
  description: string;
  uom: string | null;
  cost_rate: number | null;
  cost_factor: number | null;
  quantity_factor: number | null;
}

const HEADER_ALIASES: Record<keyof CostCodeRecord | "structure", string[]> = {
  structure: ["structure"],
  code: ["code", "código", "codigo", "cost code"],
  description: ["description", "descrição", "descricao"],
  uom: ["uom", "unit of measure", "unidade", "und", "unid"],
  cost_rate: ["cost rate", "custo unit", "custo unitário", "rate"],
  cost_factor: ["cost factor"],
  quantity_factor: ["quantity factor"],
};

function normalizeHeader(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function matchColumn(header: string, aliases: string[]): boolean {
  return aliases.some((a) => header === a || header.includes(a));
}

function detectColumns(headerRow: unknown[]): Record<string, number> {
  const map: Record<string, number> = {};
  headerRow.forEach((cell, idx) => {
    const norm = normalizeHeader(cell);
    if (!norm) return;
    for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
      if (matchColumn(norm, aliases)) {
        if (map[key] === undefined) map[key] = idx;
      }
    }
  });
  return map;
}

export interface CostCodeParseResult {
  records: CostCodeRecord[];
  /** Quick-access map by exact code. */
  byCode: Map<string, CostCodeRecord>;
}

export function parseCostCodeFile(
  buffer: Buffer,
  fileName: string
): CostCodeParseResult {
  if (!fileName.match(/\.(xlsx|xlsm|xls)$/i)) {
    throw new Error("Formato inválido. Use .xlsx, .xlsm ou .xls");
  }

  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("Arquivo sem abas");

  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
    header: 1,
    defval: null,
    blankrows: false,
  });

  // Find the header row by scanning the first ~10 rows for "Code" + "Description"
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i] ?? [];
    const headers = row.map(normalizeHeader);
    if (headers.some((h) => matchColumn(h, HEADER_ALIASES.code)) &&
        headers.some((h) => matchColumn(h, HEADER_ALIASES.description))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) {
    throw new Error("Cabeçalhos 'Code' e 'Description' não encontrados");
  }

  const cols = detectColumns(rows[headerIdx] ?? []);
  if (cols.code === undefined || cols.description === undefined) {
    throw new Error("Colunas obrigatórias ausentes (Code / Description)");
  }

  const records: CostCodeRecord[] = [];
  const byCode = new Map<string, CostCodeRecord>();

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const code = String(row[cols.code] ?? "").trim();
    const description = String(row[cols.description] ?? "").trim();
    if (!code || !description) continue;
    // Skip section dividers and totals
    if (/^cost codes?$/i.test(description)) continue;

    const record: CostCodeRecord = {
      code,
      description,
      uom: cols.uom != null ? toStringOrNull(row[cols.uom]) : null,
      cost_rate: cols.cost_rate != null ? toNumberOrNull(row[cols.cost_rate]) : null,
      cost_factor: cols.cost_factor != null ? toNumberOrNull(row[cols.cost_factor]) : null,
      quantity_factor: cols.quantity_factor != null ? toNumberOrNull(row[cols.quantity_factor]) : null,
    };
    records.push(record);
    byCode.set(code, record);
  }

  return { records, byCode };
}

function toStringOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function toNumberOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

/**
 * Resolve a cost code against the catalog. Tries exact match first, then
 * walks back through "-"-separated suffixes (so "400101-OfForma" can fall
 * back to "400101" if the leaf is missing).
 */
export function lookupCostCode(
  code: string,
  catalog: Map<string, CostCodeRecord>
): CostCodeRecord | null {
  if (catalog.has(code)) return catalog.get(code) ?? null;
  const parts = code.split("-");
  for (let n = parts.length - 1; n >= 1; n--) {
    const prefix = parts.slice(0, n).join("-");
    if (catalog.has(prefix)) return catalog.get(prefix) ?? null;
  }
  return null;
}
