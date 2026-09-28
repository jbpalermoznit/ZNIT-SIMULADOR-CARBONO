/**
 * Parser genérico para planilhas EAP hierárquicas (Estrutura Analítica de
 * Projeto) — um terceiro formato de entrada, distinto da Curva ABC (lista
 * plana já precificada, parser.ts) e do Insumos (receita composição→insumo,
 * parser-insumos.ts). Aqui os itens vêm em árvore multi-nível: linhas de
 * grupo/subtotal (sem unidade) intercaladas com linhas-folha (unidade +
 * quantidade preenchidas). A detecção de folha usa presença de unidade — não
 * profundidade/coluna de nível/código — porque esse esquema varia entre
 * origens (coluna NIVEL numérica vs. coluna Tipo T/S).
 *
 * Itens sem base física para casar um fator de emissão (unidade 'vb'/verba,
 * ou quantidade ainda não definida) entram como `mapping_status: "blocked"`
 * — mesmo tratamento já dado a itens agrupados (Tipo C) em parser.ts — para
 * não serem auto-mapeados por engano e ficarem visíveis na lista de
 * pendências do projeto.
 */

import * as XLSX from "xlsx";
import { classifyType, type ParsedItem, type ParseResult } from "./parser";

// ---------------------------------------------------------------------------
// Unit normalization (mesmo recorte usado em import-640-ht-vale.ts)
// ---------------------------------------------------------------------------

const UNIT_NORMALIZE: Record<string, string> = {
  h: "h",
  hr: "h",
  hrs: "h",
  hora: "h",
  horas: "h",
  m3: "m³",
  m2: "m²",
  un: "un",
  und: "un",
  unid: "un",
  unidade: "un",
  kg: "kg",
  kgs: "kg",
  l: "L",
  litro: "L",
  litros: "L",
  t: "t",
  tn: "t",
  ton: "t",
  vb: "vb",
};

function normalizeUnit(unit: string): string {
  const key = unit.trim().toLowerCase();
  return UNIT_NORMALIZE[key] ?? unit.trim();
}

// Unidades sem base física unívoca para casar um fator de emissão (kgCO2e
// por unidade declarada) — verba/lump-sum não tem "quantidade" no sentido
// físico do termo.
const PENDING_UNITS = new Set(["vb"]);

// ---------------------------------------------------------------------------
// Header detection
// ---------------------------------------------------------------------------

function normalizeHeader(text: string): string {
  let t = String(text).toLowerCase().trim();
  const replacements: Record<string, string> = {
    ã: "a", â: "a", á: "a", à: "a",
    ê: "e", é: "e", è: "e",
    î: "i", í: "i",
    õ: "o", ô: "o", ó: "o",
    ú: "u", ü: "u",
    ç: "c",
  };
  for (const [orig, repl] of Object.entries(replacements)) {
    t = t.replaceAll(orig, repl);
  }
  return t.replace(/[.:]/g, "").replace(/\s+/g, " ").trim();
}

// Aliases de igualdade exata — evita que "ITEM ANTIGO" case como cost_code
// só porque contém a palavra "item" (ver 202607: colunas "ITEM ANTIGO" e
// "ITEM" coexistem, e a segunda é a correta).
const EXACT_ALIASES: Record<string, string[]> = {
  cost_code: ["item", "codigo", "cod"],
  description: ["descricao", "description"],
  unit: ["unid", "und", "unidade"],
  quantity: ["quantidade", "qtd", "qty"],
};

const SUBSTRING_ALIASES: Record<string, string[]> = {
  description: ["descricao", "description"],
  unit: ["unid", "und", "unidade"],
  quantity: ["quantidade", "qtd", "qty"],
  unit_cost: ["r$ unitario", "preco unitario", "valor unitario", "custo unitario"],
  total_cost: ["r$ total", "valor total", "custo total"],
  observation: ["observac", "obs"],
};

function detectColumns(headerRow: unknown[]): Record<string, number> {
  const mapping: Record<string, number> = {};

  for (let c = 0; c < headerRow.length; c++) {
    const cell = headerRow[c];
    if (cell == null) continue;
    const norm = normalizeHeader(String(cell));
    for (const [field, aliases] of Object.entries(EXACT_ALIASES)) {
      if (field in mapping) continue;
      if (aliases.includes(norm)) mapping[field] = c;
    }
  }

  for (let c = 0; c < headerRow.length; c++) {
    const cell = headerRow[c];
    if (cell == null) continue;
    const norm = normalizeHeader(String(cell));
    for (const [field, aliases] of Object.entries(SUBSTRING_ALIASES)) {
      if (field in mapping) continue;
      if (aliases.some((alias) => norm.includes(alias))) mapping[field] = c;
    }
  }

  return mapping;
}

function toFloat(v: unknown, def = 0): number {
  if (v == null) return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export interface EapParseOptions {
  /** Aba a ler — obrigatório: origens EAP costumam ter outras abas (rollup
   *  por categoria, resumo, quadro de áreas) que não são a árvore de itens,
   *  então a escolha não deve ser adivinhada. */
  sheetName: string;
  /** Quantas linhas iniciais escanear procurando o cabeçalho (default 40 —
   *  origens EAP costumam ter blocos de resumo antes da tabela de itens). */
  maxHeaderScanRows?: number;
}

export function parseEapFile(
  buffer: Buffer,
  fileName: string,
  opts: EapParseOptions
): ParseResult {
  const warnings: string[] = [];

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer" });
  } catch (e) {
    throw new Error(`Não foi possível abrir o arquivo: ${e instanceof Error ? e.message : e}`);
  }

  if (!workbook.SheetNames.includes(opts.sheetName)) {
    throw new Error(`${fileName}: aba '${opts.sheetName}' não encontrada`);
  }
  const sheet = workbook.Sheets[opts.sheetName];
  const allRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

  const maxScan = Math.min(opts.maxHeaderScanRows ?? 40, allRows.length);
  let headerIdx: number | null = null;
  let colMap: Record<string, number> = {};
  for (let i = 0; i < maxScan; i++) {
    const candidate = detectColumns(allRows[i] ?? []);
    if ("description" in candidate && "unit" in candidate && "quantity" in candidate) {
      headerIdx = i;
      colMap = candidate;
      break;
    }
  }
  if (headerIdx === null) {
    throw new Error(
      `${fileName} (${opts.sheetName}): cabeçalho não detectado nas primeiras ${maxScan} linhas. ` +
      `Colunas esperadas: Descrição, Unidade, Quantidade.`
    );
  }

  const dataRows = allRows.slice(headerIdx + 1);

  interface RawLeaf {
    cost_code: string;
    description: string;
    unit: string;
    quantity: number;
    unit_cost: number;
    total_cost: number;
    pending: boolean;
    pending_reason: string | null;
  }

  const leaves: RawLeaf[] = [];
  let seq = 0;

  for (const row of dataRows) {
    const get = (field: string): unknown => {
      const idx = colMap[field];
      if (idx == null || idx >= row.length) return null;
      return row[idx];
    };

    const description = String(get("description") ?? "").trim();
    const unitRaw = get("unit");
    // Linha de grupo/subtotal: sem unidade preenchida. Só linhas-folha têm
    // unidade — critério estável nos dois layouts observados (NIVEL
    // numérico e coluna Tipo T/S).
    if (!description || unitRaw == null || String(unitRaw).trim() === "") continue;

    seq += 1;
    const codeRaw = get("cost_code");
    const cost_code =
      codeRaw != null && String(codeRaw).trim() !== ""
        ? String(codeRaw).trim()
        : `EAP-${String(seq).padStart(4, "0")}`;

    const unit = normalizeUnit(String(unitRaw));
    const quantity = toFloat(get("quantity"), 0);
    const unit_cost = toFloat(get("unit_cost"), 0);
    const total_cost = Math.abs(toFloat(get("total_cost"), 0));

    let pending = false;
    let pendingReason: string | null = null;
    if (quantity <= 0) {
      pending = true;
      pendingReason = "Quantidade não definida (escopo pendente)";
    } else if (PENDING_UNITS.has(unit.toLowerCase())) {
      pending = true;
      pendingReason = "Unidade 'vb' (verba) — sem base física para fator de emissão";
    }

    leaves.push({ cost_code, description, unit, quantity, unit_cost, total_cost, pending, pending_reason: pendingReason });
  }

  if (leaves.length === 0) {
    throw new Error(`${fileName} (${opts.sheetName}): nenhum item-folha extraído.`);
  }

  let totalCostSum = leaves.reduce((s, l) => s + l.total_cost, 0);
  if (totalCostSum === 0) {
    warnings.push(
      "Custo total igual a zero — planilha sem precificação por item (ex.: orçamento paramétrico por R$/m²). " +
      "Cálculo segue só com carbono; indicador R$/tCO2e fica indisponível até haver preço por item."
    );
    totalCostSum = 1;
  }

  const sorted = [...leaves].sort((a, b) => b.total_cost - a.total_cost);
  let cumulative = 0;
  let pendingCount = 0;

  const items: ParsedItem[] = sorted.map((l, order) => {
    const costPct = (l.total_cost / totalCostSum) * 100;
    cumulative += costPct;
    const abcClass = cumulative <= 80 ? "P1" : cumulative <= 95 ? "P2" : "P3";
    const [itemType, note] = classifyType(l.cost_code, l.description, l.unit);

    let mappingStatus = itemType === "C" ? "blocked" : "pending";
    let classificationNote: string | null = note;
    if (l.pending) {
      mappingStatus = "blocked";
      classificationNote = l.pending_reason;
      pendingCount += 1;
    }

    return {
      order,
      cost_code: l.cost_code,
      description: l.description,
      adf: null,
      quantity: l.quantity,
      unit: l.unit,
      unit_cost: l.unit_cost,
      total_cost: l.total_cost,
      supplier: null,
      cost_pct: Math.round(costPct * 10000) / 10000,
      cumulative_pct: Math.round(cumulative * 10000) / 10000,
      abc_class: abcClass,
      item_type: itemType,
      mapping_status: mappingStatus,
      classification_note: classificationNote,
    };
  });

  warnings.push(
    `${pendingCount} de ${items.length} itens marcados como pendência (quantidade não definida ou verba/vb sem base física) — ` +
    `entram bloqueados na lista de itens, fora do auto-map, para revisão manual.`
  );

  return { items, total_cost: totalCostSum, file_name: fileName, warnings };
}
