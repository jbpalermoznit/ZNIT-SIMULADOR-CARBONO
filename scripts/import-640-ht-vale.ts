/**
 * Importação pontual — projeto "Planta de Silicato" (cliente VALE, Vitória-ES).
 *
 * As duas planilhas de origem (input/640_HT In loco.xlsx, input/640_HT Pmold.xlsx)
 * vêm de um orçamentista diferente do padrão iTwo (abas: planilha / cpu / insumos)
 * e não seguem o template de Curva ABC (parseAbcFile) nem o de Insumos/Receita
 * (parseInsumoFile) usados em produção. Caso isolado, sem generalização de parser.
 *
 * CORREÇÃO (v2): a aba "insumos" é só um agregado de compras do projeto 640
 * inteiro (inclui itens indiretos de outras etapas, não só o escopo "HT" —
 * ver aba "planilha") — usá-la direto superestimava/desalinhava o consumo.
 * A fonte correta é:
 *   - "planilha" = os SERVIÇOS do escopo HT (código EAP tipo "02.18...",
 *     com Un./Qtde./Total) — equivalente à Curva ABC/Planilha de Itens.
 *   - "cpu"      = a composição de cada serviço ("Serviço: <código> - ..."),
 *     com o coeficiente (Coef.) de cada insumo por unidade do serviço —
 *     equivalente à Planilha de Insumos/Receita.
 * O vínculo é o código do serviço (idêntico nas duas abas: 51/53 e 103/105
 * itens da planilha batem com uma composição no cpu). Reusa a MESMA lógica
 * de expansão 1:N da produção (lib/server/scenario-expansion.ts) — só os
 * parsers de entrada são deste formato específico. Segue o mesmo recorte já
 * usado pelo parser SECAGEM (parser-insumos.ts): só insumos tipo MATERIAL
 * entram na receita — mão de obra/equipamento do cpu não geram emissão de
 * Scope 3 materiais neste modelo.
 *
 * "In loco" (moldado no local) vira o cenário base; "Pmold" (pré-moldado) vira
 * o cenário alternativo, para comparação.
 *
 * Uso:
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/import-640-ht-vale.ts
 *
 * Re-execução é idempotente: o projeto (id fixo) é removido e reimportado.
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import * as XLSX from "xlsx";
import { supabase } from "../lib/server/supabase";
import { runAutoMapForCurve } from "../lib/server/auto-map";
import { createBaseScenario } from "../lib/server/calculator";
import { expandScenarioItems, type ExpandedItem } from "../lib/server/scenario-expansion";
import type { ParsedItem } from "../lib/server/parser";
import type { RecipeMap, MaterialInsumo } from "../lib/server/parser-insumos";

const COMPANY_ID = "efb2ccda-4024-44fa-aee7-5889b316be26"; // ZNIT TECNOLOGIA LTDA
const USER_EMAIL = "jbpalermo@gmail.com";
const PROJECT_ID = "proj-640-ht-vale";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INPUT_DIR = join(ROOT, "input");

const FILES = [
  {
    path: "640_HT In loco.xlsx",
    scenarioName: "HT In Loco",
    isBase: true,
  },
  {
    path: "640_HT Pmold.xlsx",
    scenarioName: "HT Pmold",
    isBase: false,
  },
];

// ---------------------------------------------------------------------------
// Unit normalization (subset of lib/server/parser.ts UNIT_NORMALIZE)
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

// ---------------------------------------------------------------------------
// Parser — aba "planilha" (Serviços e Quantidades — equivalente à Curva ABC)
// ---------------------------------------------------------------------------

interface PlanilhaLeaf {
  code: string;
  description: string;
  unit: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
}

// Códigos de item são hierárquicos tipo EAP: "02.18.01.01.01.01". Linhas de
// grupo (sem Un./Qtde.) e linhas "Total do Item...:" (subtotal) são ignoradas
// — só as linhas-folha (com unidade e quantidade numérica) são itens reais.
const LEAF_CODE_RE = /^\d+(\.\d+)*$/;

function parsePlanilhaItems(buffer: Buffer, fileName: string): PlanilhaLeaf[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  if (!wb.SheetNames.includes("planilha")) {
    throw new Error(`${fileName}: aba 'planilha' não encontrada`);
  }
  const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets["planilha"], {
    header: 1,
    defval: null,
  });

  const leaves: PlanilhaLeaf[] = [];
  for (const row of rows) {
    if (!row || row[0] == null) continue;
    const code = String(row[0]).trim();
    if (!LEAF_CODE_RE.test(code)) continue;
    if (row[2] == null || typeof row[3] !== "number") continue; // grupo, não folha

    const description = String(row[1] ?? "").trim();
    if (!description) continue;

    leaves.push({
      code,
      description,
      unit: normalizeUnit(String(row[2])),
      quantity: Number(row[3]) || 0,
      unit_cost: Number(row[4]) || 0,
      total_cost: Math.abs(Number(row[5]) || 0),
    });
  }

  if (leaves.length === 0) {
    throw new Error(`${fileName}: nenhum item-folha extraído da aba 'planilha'`);
  }
  return leaves;
}

/** Constrói o ParsedItem[] (formato parser.ts) a partir das folhas da
 *  planilha, com cost_pct/cumulative_pct/abc_class calculados igual ao
 *  parseAbcFile — para reusar expandScenarioItems sem alterá-la. */
function buildParsedItems(leaves: PlanilhaLeaf[]): { items: ParsedItem[]; totalCost: number } {
  const sorted = [...leaves].sort((a, b) => b.total_cost - a.total_cost);
  let totalCostSum = sorted.reduce((s, l) => s + l.total_cost, 0);
  if (totalCostSum === 0) totalCostSum = 1;

  let cumulative = 0;
  const items: ParsedItem[] = sorted.map((l, order) => {
    const costPct = (l.total_cost / totalCostSum) * 100;
    cumulative += costPct;
    const abcClass = cumulative <= 80 ? "P1" : cumulative <= 95 ? "P2" : "P3";
    return {
      order,
      cost_code: l.code,
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
      // Não usados por expandScenarioItems (ela reclassifica via
      // classifyType/serviceExclusion internamente) — placeholders.
      item_type: "A",
      mapping_status: "pending",
      classification_note: null,
    };
  });

  return { items, totalCost: totalCostSum };
}

// ---------------------------------------------------------------------------
// Parser — aba "cpu" (Composição de Preços Unitários — equivalente à receita)
// ---------------------------------------------------------------------------

const SERVICE_HEADER_RE = /^Serviço:\s*(.+)$/;
const CATEGORY_HEADERS = new Set(["MÃO DE OBRA", "EQUIPAMENTO", "RESUMO"]);

/** Só insumos tipo MATERIAL entram na receita — mesmo recorte do parser
 *  SECAGEM (parser-insumos.ts: `if (tipoInsumo !== "Material") continue`).
 *  Mão de obra/equipamento do cpu não geram emissão de Scope 3 materiais
 *  neste modelo (ver docs do parser-insumos.ts). */
function parseCpuMaterialRecipes(buffer: Buffer, fileName: string): Map<string, MaterialInsumo[]> {
  const wb = XLSX.read(buffer, { type: "buffer" });
  if (!wb.SheetNames.includes("cpu")) {
    throw new Error(`${fileName}: aba 'cpu' não encontrada`);
  }
  const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets["cpu"], {
    header: 1,
    defval: null,
  });

  const recipes = new Map<string, MaterialInsumo[]>();
  let currentCode: string | null = null;
  let inMaterial = false;

  for (const row of rows) {
    if (!row || row[0] == null) continue;
    const first = row[0];
    if (typeof first !== "string") continue;
    const trimmed = first.trim();
    if (!trimmed) continue;

    const svcMatch = SERVICE_HEADER_RE.exec(trimmed);
    if (svcMatch) {
      currentCode = svcMatch[1].split(" - ")[0].trim();
      inMaterial = false;
      if (currentCode && !recipes.has(currentCode)) recipes.set(currentCode, []);
      continue;
    }
    if (trimmed.startsWith("Etapas:")) {
      inMaterial = false;
      continue;
    }
    if (trimmed === "MATERIAL") {
      inMaterial = true;
      continue;
    }
    if (CATEGORY_HEADERS.has(trimmed)) {
      inMaterial = false;
      continue;
    }

    if (inMaterial && currentCode) {
      const unidade = row[4] != null ? String(row[4]).trim() : "";
      const coef = Number(row[5]);
      if (!unidade || !Number.isFinite(coef) || coef <= 0) continue;

      const list = recipes.get(currentCode);
      if (list && !list.some((m) => m.descricao === trimmed)) {
        list.push({
          codigo: trimmed,
          descricao: trimmed,
          unidade: normalizeUnit(unidade),
          indice: coef,
        });
      }
    }
  }

  for (const [code, list] of recipes) {
    if (list.length === 0) recipes.delete(code);
  }
  return recipes;
}

function buildRecipeMap(recipes: Map<string, MaterialInsumo[]>, fileName: string): RecipeMap {
  let insumosMaterialCount = 0;
  const uniqueMaterials = new Set<string>();
  for (const list of recipes.values()) {
    insumosMaterialCount += list.length;
    for (const m of list) uniqueMaterials.add(`${m.descricao}|${m.unidade}`);
  }
  return {
    recipes,
    fileName,
    stats: {
      composicoes: recipes.size,
      insumosMaterial: insumosMaterialCount,
      uniqueMaterials: uniqueMaterials.size,
    },
    warnings: [],
  };
}

// ---------------------------------------------------------------------------
// Cleanup (idempotência)
// ---------------------------------------------------------------------------

async function cleanupProject(projectId: string) {
  const { data: curves } = await supabase
    .from("abc_curves")
    .select("id")
    .eq("project_id", projectId);
  const curveIds = (curves ?? []).map((c) => c.id);

  for (const curveId of curveIds) {
    const { data: items } = await supabase
      .from("abc_items")
      .select("id")
      .eq("abc_curve_id", curveId);
    const itemIds = (items ?? []).map((i) => i.id);
    for (let i = 0; i < itemIds.length; i += 100) {
      const { error } = await supabase
        .from("item_mappings")
        .delete()
        .in("abc_item_id", itemIds.slice(i, i + 100));
      if (error) throw new Error(`cleanup item_mappings: ${error.message}`);
    }
  }

  const { error: scenErr } = await supabase.from("scenarios").delete().eq("project_id", projectId);
  if (scenErr) throw new Error(`cleanup scenarios: ${scenErr.message}`);

  for (const curveId of curveIds) {
    const { error } = await supabase.from("abc_curves").delete().eq("id", curveId);
    if (error) throw new Error(`cleanup abc_curves ${curveId}: ${error.message}`);
  }

  const { error: projErr } = await supabase.from("projects").delete().eq("id", projectId);
  if (projErr) throw new Error(`cleanup project: ${projErr.message}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { data: company } = await supabase
    .from("companies")
    .select("id, name")
    .eq("id", COMPANY_ID)
    .single();
  if (!company) throw new Error(`Empresa não encontrada: ${COMPANY_ID}`);

  const { data: user } = await supabase
    .from("users")
    .select("id, email")
    .eq("company_id", COMPANY_ID)
    .eq("email", USER_EMAIL)
    .single();
  if (!user) throw new Error(`Usuário ${USER_EMAIL} não encontrado na empresa ${company.name}`);

  console.log(`Importando "Planta de Silicato" (VALE) em "${company.name}" (${COMPANY_ID})\n`);

  await cleanupProject(PROJECT_ID);

  const { error: projErr } = await supabase.from("projects").insert({
    id: PROJECT_ID,
    company_id: COMPANY_ID,
    name: "Planta de Silicato — VALE (Vitória/ES)",
    client_name: "VALE",
    address: "Vitória - ES",
    building_type: "industrial",
    status: "active",
  });
  if (projErr) throw new Error(`insert project: ${projErr.message}`);

  for (const f of FILES) {
    console.log(`=== ${f.path} → cenário "${f.scenarioName}" ===`);
    const buffer = readFileSync(join(INPUT_DIR, f.path));

    const leaves = parsePlanilhaItems(buffer, f.path);
    const { items: parsedItems, totalCost } = buildParsedItems(leaves);
    const cpuRecipes = parseCpuMaterialRecipes(buffer, f.path);
    const recipeMap = buildRecipeMap(cpuRecipes, f.path);

    const unmatched = parsedItems.filter((it) => !cpuRecipes.has(it.cost_code));
    console.log(
      `  itens (planilha): ${parsedItems.length} | custo total: R$ ${totalCost.toFixed(2)} | ` +
      `composições (cpu): ${recipeMap.stats.composicoes} | sem composição: ${unmatched.length}`
    );
    if (unmatched.length > 0) {
      for (const u of unmatched) {
        console.log(`    sem composição CPU: ${u.cost_code} — ${u.description} (R$ ${u.total_cost.toFixed(2)})`);
      }
    }

    const { parents, children } = expandScenarioItems(parsedItems, recipeMap);
    console.log(`  expandido: ${parents.length} pais + ${children.length} filhos (insumos materiais)`);

    const byType = children.reduce<Record<string, number>>((acc, it) => {
      acc[it.item_type] = (acc[it.item_type] ?? 0) + 1;
      return acc;
    }, {});
    console.log(`  filhos por tipo: ${JSON.stringify(byType)}`);

    const curveInsert = {
      project_id: PROJECT_ID,
      file_name: f.path,
      imported_by_user_id: user.id,
      total_items: parsedItems.length,
      total_cost: totalCost,
    };
    let curve: { id: string } | null = null;
    const curveRes1 = await supabase
      .from("abc_curves")
      .insert({ ...curveInsert, curve_type: "scenario" })
      .select("id")
      .single();
    if (curveRes1.error?.message?.includes("curve_type")) {
      const curveRes2 = await supabase
        .from("abc_curves")
        .insert(curveInsert)
        .select("id")
        .single();
      if (curveRes2.error || !curveRes2.data) throw new Error(`insert curve: ${curveRes2.error?.message}`);
      curve = curveRes2.data;
    } else {
      if (curveRes1.error || !curveRes1.data) throw new Error(`insert curve: ${curveRes1.error?.message}`);
      curve = curveRes1.data;
    }

    const toDbRow = (it: ExpandedItem) => ({
      id: `${curve!.id}-${it.key}`,
      abc_curve_id: curve!.id,
      cost_code: it.cost_code,
      description: it.description,
      quantity: it.quantity,
      unit: it.unit,
      unit_cost: it.unit_cost,
      total_cost: it.total_cost,
      cost_pct: it.cost_pct,
      cumulative_pct: it.cumulative_pct,
      abc_class: it.abc_class,
      item_type: it.item_type,
      item_order: it.item_order,
      mapping_status: it.mapping_status,
      classification_note: it.classification_note,
      ...(it.parent_key ? { parent_item_id: `${curve!.id}-${it.parent_key}` } : {}),
    });

    const allDbItems = [...parents.map(toDbRow), ...children.map(toDbRow)];
    for (let i = 0; i < allDbItems.length; i += 50) {
      const { error } = await supabase.from("abc_items").insert(allDbItems.slice(i, i + 50));
      if (error) throw new Error(`insert items: ${error.message}`);
    }

    const autoMap = await runAutoMapForCurve(curve.id, COMPANY_ID);
    console.log(`  auto-map: ${JSON.stringify(autoMap)}`);

    const { scenario } = await createBaseScenario(PROJECT_ID, user.id, {
      abcCurveId: curve.id,
      scenarioName: f.scenarioName,
      isBase: f.isBase,
    });
    const scenarioId = (scenario as { id: string }).id;

    const { data: result } = await supabase
      .from("scenario_results")
      .select("total_tco2e, items_total, items_mapped, coverage_pct")
      .eq("scenario_id", scenarioId)
      .single();

    if (result) {
      console.log(
        `  RESULTADO: ${result.total_tco2e?.toFixed(1)} tCO2e | cobertura ${result.coverage_pct}% (${result.items_mapped}/${result.items_total})`
      );
    } else {
      console.log("  AVISO: scenario_results não encontrado");
    }
    console.log();
  }

  console.log(`Importação concluída. Projeto: ${PROJECT_ID}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
