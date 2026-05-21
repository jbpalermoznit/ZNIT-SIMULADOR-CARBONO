/**
 * Parser for the iTwo "Relatório Proof" spreadsheet (04.02 Cost Codes por
 * item da EAP).
 *
 * The sheet uses a hierarchical layout in a flat table:
 *
 *   Cost Code: 400101-EncarrAlv/Acab — Encarregado Alvenaria/Acabamentos
 *     RN: 1.5.1.11 — Muro de contenção em alvenaria de bloco
 *       Assembly: 12.AL.05a — Alvenaria de Bloco de Concreto 19x19x39cm
 *       Assembly: 14.RP.01 — CHAPISCO INTERNO
 *       S-Item: 1
 *     Total: 400101-EncarrAlv/Acab
 *   Cost Code: …
 *
 * Output: a Map<costCode, AssemblyRecord[]> where each record carries the
 * assembly code, description and UoM. Callers feed those descriptions to
 * the emission mapper so a vague cost-code like "Encarregado Alv/Acab"
 * gets matched via the specific assemblies it consumes.
 */
import * as XLSX from "xlsx";

export interface ProofAssembly {
  code: string;
  description: string;
  uom: string | null;
  /** The RN (EAP item) that introduced this assembly, useful for traceability. */
  rn_code?: string;
  rn_description?: string;
}

export interface ProofParseResult {
  /** Map cost-code → list of assemblies it consumes. */
  byCostCode: Map<string, ProofAssembly[]>;
  /** Total cost codes seen. */
  totalCostCodes: number;
  /** Total assemblies seen across all cost codes (with duplicates). */
  totalAssemblies: number;
}

const KIND_COL = 0;
const CODE_COL = 1;
const DESC_COL = 2;
const UOM_COL = 3;

function asString(v: unknown): string {
  return String(v ?? "").trim();
}

function isKind(row: unknown[] | undefined, kind: string): boolean {
  return asString(row?.[KIND_COL]) === kind;
}

export function parseProofFile(
  buffer: Buffer,
  fileName: string
): ProofParseResult {
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

  const byCostCode = new Map<string, ProofAssembly[]>();
  let currentCostCode: string | null = null;
  let currentRn: { code: string; description: string } | null = null;
  let totalCostCodes = 0;
  let totalAssemblies = 0;

  for (const row of rows) {
    const r = row ?? [];
    const kind = asString(r[KIND_COL]);

    if (kind === "Cost Code:") {
      currentCostCode = asString(r[CODE_COL]) || null;
      currentRn = null;
      if (currentCostCode) {
        totalCostCodes++;
        if (!byCostCode.has(currentCostCode)) byCostCode.set(currentCostCode, []);
      }
      continue;
    }

    if (kind === "Total:") {
      currentCostCode = null;
      currentRn = null;
      continue;
    }

    if (kind === "RN:") {
      currentRn = {
        code: asString(r[CODE_COL]),
        description: asString(r[DESC_COL]),
      };
      continue;
    }

    if (kind === "Assembly:" && currentCostCode) {
      const code = asString(r[CODE_COL]);
      const description = asString(r[DESC_COL]);
      const uom = asString(r[UOM_COL]) || null;
      if (!code && !description) continue;
      const list = byCostCode.get(currentCostCode);
      if (list) {
        list.push({
          code,
          description,
          uom,
          rn_code: currentRn?.code,
          rn_description: currentRn?.description,
        });
        totalAssemblies++;
      }
      continue;
    }

    // S-Item, Grand Total, header rows, etc. — ignore
  }

  return { byCostCode, totalCostCodes, totalAssemblies };
}
