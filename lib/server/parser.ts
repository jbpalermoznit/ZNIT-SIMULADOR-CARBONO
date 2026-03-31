/**
 * Parser da Curva ABC exportada do iTwo (.xlsx / .xlsm)
 * Port of backend/app/services/parser.py
 *
 * Estrutura real do arquivo Raízen VRO R8:
 *   Row 0: título ("CurvaABC-Insumos")
 *   Row 1: cabeçalho (CostCode | Descrição | ADF | Custo Unitário | Quantidade | Unidade | Custo Total | % Custo Total | ...)
 *   Row 2+: dados
 *   Última linha: TOTAL (filtrar)
 */

import * as XLSX from "xlsx";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedItem {
  order: number;
  cost_code: string;
  description: string;
  adf: number | null;
  quantity: number;
  unit: string;
  unit_cost: number;
  total_cost: number;
  supplier: string | null;
  cost_pct: number;
  cumulative_pct: number;
  abc_class: string; // P1 | P2 | P3
  item_type: string; // A | B | C | D | E | F
  mapping_status: string; // pending | blocked | excluded
  classification_note: string | null;
}

export interface ParseResult {
  items: ParsedItem[];
  total_cost: number;
  file_name: string;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Column alias mapping
// ---------------------------------------------------------------------------

const COLUMN_ALIASES: Record<string, string[]> = {
  cost_code: ["costcode", "cost code", "código", "codigo", "cod", "cód"],
  description: ["descrição", "descricao", "description", "desc"],
  adf: ["adf"],
  unit_cost: [
    "custo unitário",
    "custo unitario",
    "custo unit",
    "custo unit.",
    "preço unit",
    "unit cost",
    "valor unit",
    "valor unitario",
  ],
  quantity: ["quantidade", "qtd", "qty", "quant"],
  unit: ["unidade", "unid", "und"],
  total_cost: ["custo total", "total", "total cost"],
  cost_pct: ["% custo total", "% custo", "% total", "percentual"],
  supplier: ["fornecedor", "supplier", "fonte"],
};

function normalizeHeader(text: string): string {
  let t = String(text).toLowerCase().trim();
  const replacements: Record<string, string> = {
    ã: "a",
    â: "a",
    á: "a",
    à: "a",
    ê: "e",
    é: "e",
    è: "e",
    î: "i",
    í: "i",
    õ: "o",
    ô: "o",
    ó: "o",
    ú: "u",
    ü: "u",
    ç: "c",
  };
  for (const [orig, repl] of Object.entries(replacements)) {
    t = t.replaceAll(orig, repl);
  }
  return t.replace(/\s+/g, " ");
}

function detectColumns(headerRow: unknown[]): Record<string, number> {
  const mapping: Record<string, number> = {};
  for (let colIdx = 0; colIdx < headerRow.length; colIdx++) {
    const cell = headerRow[colIdx];
    if (cell == null) continue;
    const normalized = normalizeHeader(String(cell));
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (field in mapping) continue;
      if (aliases.some((alias) => normalized.includes(alias))) {
        mapping[field] = colIdx;
      }
    }
  }
  return mapping;
}

// ---------------------------------------------------------------------------
// Type classification A-F
// ---------------------------------------------------------------------------

const TYPE_BY_PREFIX: [string, string][] = [
  // Mão de obra — prefixo 400
  ["400", "B"],
  // Equipamentos — prefixo 440
  ["440", "E"],
  // Diesel e combustíveis — código exato
  ["460114", "F"],
  // Ensaios e controle de qualidade
  ["460701", "F"],
  // Administrativo/indireto — prefixo 46
  ["46", "F"],
];

const TYPE_BY_KEYWORD: [string, string][] = [
  // Mão de obra
  ["oficial", "B"],
  ["servente", "B"],
  ["mestre", "B"],
  ["encarregado", "B"],
  ["pedreiro", "B"],
  ["armador", "B"],
  ["soldador", "B"],
  ["salario", "B"],
  ["sal med", "B"],
  // Equipamentos
  ["retroescavadeira", "E"],
  ["basculante", "E"],
  ["maquina de solda", "E"],
  ["maquina solda", "E"],
  ["andaime", "E"],
  ["guindaste", "E"],
  // Serviços com material embutido
  ["corte e dobra", "D"],
  ["corte dobra", "D"],
  ["bombeamento", "D"],
  ["arrasamento", "D"],
  // Administrativo
  ["ensaio", "F"],
  ["controle de concreto", "F"],
  ["prova de carga", "F"],
  ["administracao", "F"],
];

const EQUIPMENT_UNITS = new Set(["h", "hora", "horas", "hrs", "hr"]);

function classifyType(
  costCode: string,
  description: string,
  unit: string
): [string, string] {
  const cc = costCode.toLowerCase();
  const desc = normalizeHeader(description);
  const unitNorm = unit.toLowerCase().trim();

  // --- Tipo C: item agrupado ---
  const ccParts = costCode.split("-", 2);
  const hasSub =
    ccParts.length > 1 && ccParts[1].toLowerCase().startsWith("sub");

  if (hasSub) {
    // Exceção: serviço com material embutido (Tipo D)
    const dKeywords = [
      "cortedob",
      "cortedobra",
      "corteedob",
      "modob",
      "mocort",
      "moarr",
      "arrasam",
      "bombea",
    ];
    const ccLower = costCode.toLowerCase().replace(/-/g, "");
    if (
      dKeywords.some((k) => desc.replace(/ /g, "").includes(k)) ||
      ["cortedob", "modob", "moarras"].some((k) => ccLower.includes(k))
    ) {
      return ["D", "Serviço com material embutido — risco de dupla contagem"];
    }

    // Exceção: controle de qualidade/ensaios (Tipo F)
    const fKeywords = [
      "controleconcreto",
      "controleconcret",
      "provacarga",
      "ensaio",
      "controle",
    ];
    if (
      fKeywords.some((k) => desc.replace(/ /g, "").toLowerCase().includes(k))
    ) {
      return ["F", "Controle/ensaio de qualidade → Tipo F"];
    }

    return ["C", "CostCode contém 'Sub' — item agrupado/subcontratado"];
  }

  // --- Tipo F especial: Diesel tem fator direto → reclassificar para A ---
  if (
    costCode.startsWith("460114") ||
    desc.includes("oleodisel") ||
    desc.includes("oleo diesel") ||
    desc.includes("diesel")
  ) {
    return [
      "A",
      "Diesel reclassificado para Tipo A — fator direto 2,68 kgCO₂e/L",
    ];
  }

  // --- Tipo por prefixo de CostCode ---
  for (const [prefix, itemType] of TYPE_BY_PREFIX) {
    if (cc.startsWith(prefix.toLowerCase())) {
      return [itemType, `Prefixo CostCode '${prefix}' → Tipo ${itemType}`];
    }
  }

  // --- Tipo E por unidade ---
  if (EQUIPMENT_UNITS.has(unitNorm)) {
    return ["E", `Unidade '${unit}' indica equipamento`];
  }

  // --- Tipo por keyword na descrição ---
  for (const [keyword, itemType] of TYPE_BY_KEYWORD) {
    if (desc.includes(keyword)) {
      return [
        itemType,
        `Keyword '${keyword}' na descrição → Tipo ${itemType}`,
      ];
    }
  }

  // --- Fallback: Tipo A — Material Direto ---
  return ["A", "Material direto — mapeamento EPD automático"];
}

// ---------------------------------------------------------------------------
// ABC classification
// ---------------------------------------------------------------------------

function classifyAbc(cumulativePct: number): string {
  if (cumulativePct <= 80.0) return "P1";
  if (cumulativePct <= 95.0) return "P2";
  return "P3";
}

// ---------------------------------------------------------------------------
// Unit normalization
// ---------------------------------------------------------------------------

const UNIT_NORMALIZE: Record<string, string> = {
  hrs: "h",
  hora: "h",
  horas: "h",
  hr: "h",
  m3: "m³",
  m2: "m²",
  unid: "un",
  unidade: "un",
  kg: "kg",
  kgs: "kg",
  m: "m",
  l: "L",
  litros: "L",
  litro: "L",
  t: "t",
  vb: "vb",
};

function normalizeUnit(unit: string): string {
  const u = unit.trim().toLowerCase();
  return UNIT_NORMALIZE[u] ?? unit.trim();
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

function toFloat(v: unknown, defaultVal: number | null = 0): number {
  if (v == null) return defaultVal ?? 0;
  const n = Number(v);
  if (isNaN(n)) return defaultVal ?? 0;
  return n;
}

export function parseAbcFile(buffer: Buffer, fileName: string): ParseResult {
  const warnings: string[] = [];

  // Load workbook
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer" });
  } catch (e) {
    throw new Error(
      `Não foi possível abrir o arquivo: ${e instanceof Error ? e.message : e}`
    );
  }

  // Select sheet
  let sheetName: string | undefined;
  for (const candidate of ["ABC", "Curva ABC", "CurvaABC", "Sheet1"]) {
    if (workbook.SheetNames.includes(candidate)) {
      sheetName = candidate;
      break;
    }
  }
  if (!sheetName) {
    sheetName = workbook.SheetNames[0];
    warnings.push(`Aba 'ABC' não encontrada. Usando '${sheetName}'.`);
  }

  const sheet = workbook.Sheets[sheetName];
  const allRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
  });

  if (allRows.length < 3) {
    throw new Error("Arquivo não contém dados suficientes.");
  }

  // Find header row (search first 6 rows)
  let headerIdx: number | null = null;
  let colMap: Record<string, number> = {};
  for (let i = 0; i < Math.min(6, allRows.length); i++) {
    const candidateMap = detectColumns(allRows[i]);
    if (
      "cost_code" in candidateMap &&
      "description" in candidateMap &&
      "total_cost" in candidateMap
    ) {
      headerIdx = i;
      colMap = candidateMap;
      break;
    }
  }

  if (headerIdx === null) {
    throw new Error(
      "Cabeçalho não detectado. Colunas esperadas: CostCode, Descrição, Custo Total."
    );
  }

  const dataRows = allRows.slice(headerIdx + 1);

  // Extract valid items
  interface RawItem {
    cost_code: string;
    description: string;
    adf: number | null;
    quantity: number;
    unit: string;
    unit_cost: number;
    total_cost: number;
    supplier: string | null;
  }

  const rawItems: RawItem[] = [];

  for (const row of dataRows) {
    const get = (field: string): unknown => {
      const idx = colMap[field];
      if (idx == null || idx >= row.length) return null;
      const val = row[idx];
      // Ignore formulas left as string
      if (typeof val === "string" && val.startsWith("=")) return null;
      return val;
    };

    const costCodeRaw = get("cost_code");
    if (costCodeRaw == null) continue;
    const costCode = String(costCodeRaw).trim();
    if (!costCode || costCode.toUpperCase() === "TOTAL") continue;

    const description = String(get("description") ?? "").trim();
    const adf = toFloat(get("adf"), null);
    const quantity = toFloat(get("quantity"), 0);
    const unit = normalizeUnit(String(get("unit") ?? "un"));
    const unitCost = toFloat(get("unit_cost"), 0);
    let totalCost = toFloat(get("total_cost"), 0);
    totalCost = Math.abs(totalCost);

    const supplierIdx = colMap["supplier"];
    let supplier: string | null = null;
    if (supplierIdx != null && supplierIdx < row.length && row[supplierIdx]) {
      supplier = String(row[supplierIdx]).trim();
    }

    rawItems.push({
      cost_code: costCode,
      description,
      adf,
      quantity,
      unit,
      unit_cost: unitCost,
      total_cost: totalCost,
      supplier,
    });
  }

  if (rawItems.length === 0) {
    throw new Error("Nenhum item de dados encontrado após o cabeçalho.");
  }

  // Calculate total cost
  let totalCostSum = rawItems.reduce((sum, r) => sum + r.total_cost, 0);
  if (totalCostSum === 0) {
    warnings.push("Custo total igual a zero. Verifique o arquivo.");
    totalCostSum = 1.0;
  }

  // Sort by cost descending (Pareto)
  rawItems.sort((a, b) => b.total_cost - a.total_cost);

  // Calculate percentages and classify
  const items: ParsedItem[] = [];
  let cumulative = 0;

  for (let order = 0; order < rawItems.length; order++) {
    const r = rawItems[order];
    const costPct = (r.total_cost / totalCostSum) * 100;
    cumulative += costPct;
    const abcClass = classifyAbc(cumulative);
    const [itemType, note] = classifyType(r.cost_code, r.description, r.unit);

    // Initial mapping status
    let mappingStatus: string;
    if (itemType === "C") {
      mappingStatus = "blocked";
    } else {
      mappingStatus = "pending";
    }

    items.push({
      order,
      cost_code: r.cost_code,
      description: r.description,
      adf: r.adf,
      quantity: r.quantity,
      unit: r.unit,
      unit_cost: r.unit_cost,
      total_cost: r.total_cost,
      supplier: r.supplier,
      cost_pct: Math.round(costPct * 10000) / 10000,
      cumulative_pct: Math.round(cumulative * 10000) / 10000,
      abc_class: abcClass,
      item_type: itemType,
      mapping_status: mappingStatus,
      classification_note: note,
    });
  }

  return {
    items,
    total_cost: totalCostSum,
    file_name: fileName,
    warnings,
  };
}
