/**
 * Parser da Planilha de Insumos (SECAGEM) — extrai receitas de composição.
 *
 * Estrutura do arquivo SECAGEM:
 *   Rows 0-6: header do projeto (Obra, Bancos, B.D.I., etc.)
 *   Row 7+: dados intercalados:
 *     - "Composição" → item-pai com Código, Descrição, Und, Quant.
 *     - "Insumo"     → item-filho com Tipo (Material/Mão de Obra/Equipamento/Verba), Índice, Und, Quant.
 *
 * Colunas (posição fixa):
 *   [0] Tipo linha: "Composição" | "Insumo" | item number
 *   [1] Código
 *   [2] Banco
 *   [3] Descrição
 *   [4] Tipo insumo (Material, Mão de Obra, Equipamento, Verba) — só em Insumos
 *   [5] Índice (qty per unit of parent)
 *   [6] Und (unidade)
 *   [7] Quant. (quantidade absoluta = Índice × qty composição)
 *   [8] Porcent.
 *   [9] Valor Unit
 *   [10] Total
 *   [11] id_pai
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MaterialInsumo {
  codigo: string;
  descricao: string;
  unidade: string;
  indice: number; // qty per unit of parent composição
}

export interface RecipeMap {
  recipes: Map<string, MaterialInsumo[]>;
  fileName: string;
  stats: {
    composicoes: number;
    insumosMaterial: number;
    uniqueMaterials: number;
  };
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Unit normalization (reuse from parser.ts)
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
  ton: "t",
  vb: "vb",
  sc: "sc",
  di: "di",
};

function normalizeUnit(unit: string): string {
  const u = unit.trim().toLowerCase();
  return UNIT_NORMALIZE[u] ?? unit.trim();
}

// ---------------------------------------------------------------------------
// Filter: non-construction "Material" insumos to exclude
// Code prefixes 04.xx = indirect costs (food, housing, benefits)
// ---------------------------------------------------------------------------

const NON_CONSTRUCTION_KEYWORDS = [
  "refeicao",
  "cafe da manha",
  "alojamento",
  "aluguel de casa",
  "material de limpeza",
  "consumo de agua",
  "consumo de luz",
  "manutencao de veiculo",
  "etiqueta para identificacao",
  "protetor para ponta",
  "bombeamento de concreto",
  "bombeamento de concreto com bomba",
];

function isConstructionMaterial(codigo: string, descricao: string): boolean {
  // Code prefix filter: 04.xx = indirect costs
  if (codigo.startsWith("04.")) return false;

  const descNorm = descricao
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return !NON_CONSTRUCTION_KEYWORDS.some((kw) => descNorm.includes(kw));
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export function parseInsumoFile(
  buffer: Buffer,
  fileName: string
): RecipeMap {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require("xlsx") as typeof import("xlsx");
  const warnings: string[] = [];

  let workbook: ReturnType<typeof XLSX.read>;
  try {
    workbook = XLSX.read(buffer, { type: "buffer" });
  } catch (e) {
    throw new Error(
      `Não foi possível abrir o arquivo de insumos: ${e instanceof Error ? e.message : e}`
    );
  }

  // Select sheet — prefer REXPT2, fallback to first
  let sheetName: string | undefined;
  for (const candidate of workbook.SheetNames) {
    if (candidate.startsWith("REXPT2")) {
      sheetName = candidate;
      break;
    }
  }
  if (!sheetName) {
    sheetName = workbook.SheetNames[0];
    warnings.push(`Aba 'REXPT2' não encontrada. Usando '${sheetName}'.`);
  }

  const sheet = workbook.Sheets[sheetName];
  const allRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
  });

  if (allRows.length < 10) {
    throw new Error("Arquivo de insumos não contém dados suficientes.");
  }

  // Build recipe map: composição code → MaterialInsumo[]
  const recipes = new Map<string, MaterialInsumo[]>();
  let currentComposicaoCode: string | null = null;
  let composicoesCount = 0;
  let insumosMaterialCount = 0;
  const uniqueMaterials = new Set<string>();

  for (let i = 0; i < allRows.length; i++) {
    const row = allRows[i];
    if (!row || !row[0]) continue;

    const tipoLinha = String(row[0]).trim();

    if (tipoLinha === "Composição") {
      const codigo = String(row[1] || "").trim();
      if (!codigo) continue;
      currentComposicaoCode = codigo;
      composicoesCount++;

      // Only store first occurrence of each composição code (recipe is the same)
      if (!recipes.has(codigo)) {
        recipes.set(codigo, []);
      }
      continue;
    }

    if (tipoLinha === "Insumo" && currentComposicaoCode) {
      const tipoInsumo = String(row[4] || "").trim();

      // Only keep Material type insumos
      if (tipoInsumo !== "Material") continue;

      const indice = Number(row[5]) || 0;
      if (indice <= 0) continue;

      const codigo = String(row[1] || "").trim();
      const descricao = String(row[3] || "").trim();
      const unidade = normalizeUnit(String(row[6] || "un"));

      if (!descricao) continue;

      // Filter out non-construction materials (food, housing, etc.)
      if (!isConstructionMaterial(codigo, descricao)) continue;

      // Only add to first occurrence (avoid duplicates from repeated composições)
      const recipe = recipes.get(currentComposicaoCode);
      if (recipe && !recipe.some((m) => m.codigo === codigo && m.descricao === descricao)) {
        recipe.push({ codigo, descricao, unidade, indice });
        insumosMaterialCount++;
        uniqueMaterials.add(`${descricao}|${unidade}`);
      }
    }
  }

  // Remove composições with no material insumos
  for (const [code, insumos] of recipes) {
    if (insumos.length === 0) {
      recipes.delete(code);
    }
  }

  return {
    recipes,
    fileName,
    stats: {
      composicoes: composicoesCount,
      insumosMaterial: insumosMaterialCount,
      uniqueMaterials: uniqueMaterials.size,
    },
    warnings,
  };
}
