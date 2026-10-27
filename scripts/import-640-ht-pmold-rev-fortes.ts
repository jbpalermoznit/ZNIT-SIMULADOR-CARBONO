/**
 * Comparativo "Planta de Silicato — HT: In Loco × Pré-moldado (revisão)" na
 * Fortes Engenharia: In Loco antigo (input/640_HT In loco.xlsx) como cenário
 * base e o pré-moldado revisado com BDI e FI (input/640_HT Pmold-comBDIeFI.xlsx)
 * como alternativo. Projeto novo, independente de proj-640-ht-vale-fortes
 * (que fica intacto).
 *
 * Os dois orçamentos passam pelo MESMO parser e pela MESMA curadoria, para a
 * diferença entre cenários refletir a solução estrutural e não o tratamento:
 *   - planilha (serviços, qtde > 0) × cpu (composições). Diferente de
 *     import-640-ht-vale.ts, entram todas as seções da cpu menos MÃO DE OBRA
 *     (MATERIAL, EQUIPAMENTO, VERBA, TRANSPORTE) — no Pmold há material real
 *     em VERBA (perfil H do travamento do fosso) e os guindastes só aparecem
 *     em EQUIPAMENTO.
 *   - Toda linha-folha recebe uma decisão explícita (fator, regra, equipamento,
 *     estimativa ou exclusão justificada). Não roda o auto-map: sugestões não
 *     revisadas não entram no total.
 *
 * Premissas da Fortes (regras da organização), aplicadas como estão:
 *   - corte e dobra 0,0277 kgCO₂e/kg (factor_rule) — linhas CORTE E DOBRA DE ACO
 *     do In Loco e, no Pmold, a armação da estrutura (MAO DE OBRA PARA ARMACAO,
 *     que é o serviço de corte/dobra/montagem) e a armação de pré-moldado;
 *   - bombeamento 0,7 L/m³ (equipment_rule) — linhas BOMBEAMENTO DE CONCRETO;
 *   - guindaste 40 L/h (equipment_rule) — sobre as horas de guindaste da cpu.
 *     O índice de 2,35 h/m³ da regra só seria usado sem horas no orçamento;
 *     a alternativa fica impressa no resumo (GUINDASTE_INDEX_M3).
 * Fatores que a Fortes já viu no In Loco revisado: aço 1,820 kgCO₂/kg (v29),
 * concreto C40+ 274 kgCO₂/m³ (CECarbon). Os fatores que a auditoria do cliente
 * reverteu por implausíveis (etiqueta, protetor, pontalete, compensado,
 * fechadura...) recebem fator do material com massa assumida e editável.
 *
 * Equipamentos: linha de equipamento em composição que já tem óleo diesel é
 * excluída (combustível já contado). Sem diesel na composição, horas × consumo:
 * guindaste pela regra; manipulador telescópico pelo consumo implícito no
 * próprio Pmold (0,1361 L/m² ÷ 0,0373 h/m²); munck/carreta pelo perfil padrão
 * "caminhão" da plataforma (12 L/h). Escavação manual e mecanizada do In Loco
 * têm as mesmas horas de equipamento do Pmold, mas com combustível embutido no
 * preço-hora: recebem a linha de diesel do Pmold (mesmo serviço).
 *
 * Uso:
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/import-640-ht-pmold-rev-fortes.ts --dry-run   # só imprime
 *   npx tsx scripts/import-640-ht-pmold-rev-fortes.ts
 *
 * Re-execução é idempotente: o projeto (id fixo) é removido e reimportado.
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import * as XLSX from "xlsx";
import { supabase, supabaseEmission } from "../lib/server/supabase";
import { createBaseScenario, getConversionFactor, normalizeUnit as calcUnit, resolveConversion } from "../lib/server/calculator";
import { expandScenarioItems, type ExpandedItem } from "../lib/server/scenario-expansion";
import { getFuelFactors } from "../lib/server/canonical-factors";
import { extractYearFromText } from "../lib/server/factor-version";
import { chunkArray } from "../lib/server/db-utils";
import type { ParsedItem } from "../lib/server/parser";
import type { RecipeMap, MaterialInsumo } from "../lib/server/parser-insumos";

const DRY_RUN = process.argv.includes("--dry-run");
const COMPANY_ID = "8a01df4d-f215-4155-9b1f-2dacbe6fd931"; // Fortes Engenharia
const USER_EMAIL = "jbpalermo@gmail.com";
const PROJECT_ID = "proj-640-ht-pmold-rev-fortes";
const TODAY = "2026-10-27";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INPUT_DIR = join(ROOT, "input");

type ScenarioKey = "inLoco" | "pmold";

// Relatório de comparativo e metodologia enviado à Fortes (PDF por email).
const METHODOLOGY_REF = "relatório PDF ZNIT de 27/10/2026, enviado por email";

const FILES: Record<ScenarioKey, { path: string; scenarioName: string; isBase: boolean; description: string }> = {
  inLoco: {
    path: "640_HT In loco.xlsx",
    scenarioName: "HT In Loco",
    isBase: true,
    description: `Base do comparativo. Orçamento 640_HT In loco (BDI 38,71%), mesma metodologia do pré-moldado, 100% das linhas classificadas. Metodologia e premissas no ${METHODOLOGY_REF}.`,
  },
  pmold: {
    path: "640_HT Pmold-comBDIeFI.xlsx",
    scenarioName: "HT Pré-moldado (revisão)",
    isBase: false,
    description: `Orçamento 640_HT Pmold com BDI e FI. Guindastes pela premissa Fortes (40 L/h × 1.480 h da cpu). Metodologia e premissas no ${METHODOLOGY_REF}.`,
  },
};

// ---------------------------------------------------------------------------
// Premissas — todas editáveis no fator/conversão do item
// ---------------------------------------------------------------------------

// Guindaste: só para o resumo (alternativa ao uso das horas da cpu).
const GUINDASTE_INDEX_M3 = 2.35;
// Perfil padrão "caminhão" de /api/equipment-rules/defaults (munck, carreta).
const TRUCK_L_H = 12;
// Manipulador telescópico: consumo implícito nas formas do Pmold.
const TELEHANDLER_L_H = 0.1361 / 0.0373;
// Máquina de solda: perfil padrão da plataforma + fator SIN (mesma constante
// de app/api/equipment-rules/defaults).
const WELDER_KWH_H = 8;
const ELECTRIC_FACTOR = { value: 0.0293, source: "SIN 2024" };
// Madeira plantada (pinus/eucalipto) para pontalete, caibro e tábua.
const WOOD_KG_M3 = 500;
// Chapa de compensado 2,20 × 1,10 m.
const PLYWOOD_SHEET_M2 = 2.2 * 1.1;
// Argamassa industrializada para reboco — saco de 20 kg.
const MORTAR_BAG_KG = 20;

const DISCLAIMER =
  "ESTIMATIVA ZNIT — composição assumida, não é quantitativo do projeto. Substitua por EPD/ficha técnica assim que disponível (editável no fator do item).";

// ---------------------------------------------------------------------------
// Unidades e normalização de texto
// ---------------------------------------------------------------------------

const UNIT_NORMALIZE: Record<string, string> = {
  h: "h", hr: "h", hrs: "h", hora: "h", horas: "h",
  m3: "m³", m2: "m²",
  un: "un", und: "un", unid: "un", unidade: "un",
  kg: "kg", kgs: "kg",
  l: "L", litro: "L", litros: "L",
  t: "t", tn: "t", ton: "t",
  vb: "vb",
};

function normalizeUnit(unit: string): string {
  const key = unit.trim().toLowerCase();
  return UNIT_NORMALIZE[key] ?? unit.trim();
}

function norm(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Parser — planilha (serviços) e cpu (composições por seção)
// ---------------------------------------------------------------------------

function sheet(wb: XLSX.WorkBook, name: string, fileName: string): unknown[][] {
  const found = wb.SheetNames.find((s) => s.trim().toLowerCase() === name);
  if (!found) throw new Error(`${fileName}: aba '${name}' não encontrada`);
  return XLSX.utils.sheet_to_json(wb.Sheets[found], { header: 1, defval: null });
}

const LEAF_CODE_RE = /^\d+(\.\d+)*$/;

interface PlanilhaLeaf {
  code: string;
  description: string;
  unit: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
}

/** Linhas-folha com quantidade > 0 (linhas zeradas são escopo descartado
 *  pelo orçamentista — "não considerar"). */
function parsePlanilha(wb: XLSX.WorkBook, fileName: string): { leaves: PlanilhaLeaf[]; zeroed: number } {
  const leaves: PlanilhaLeaf[] = [];
  let zeroed = 0;
  for (const row of sheet(wb, "planilha", fileName)) {
    if (!row || row[0] == null) continue;
    const code = String(row[0]).trim();
    if (!LEAF_CODE_RE.test(code)) continue;
    if (row[2] == null || typeof row[3] !== "number") continue;
    const description = String(row[1] ?? "").trim();
    if (!description) continue;
    if (!(row[3] > 0)) {
      zeroed++;
      continue;
    }
    leaves.push({
      code,
      description,
      unit: normalizeUnit(String(row[2])),
      quantity: row[3],
      unit_cost: Number(row[4]) || 0,
      total_cost: Math.abs(Number(row[5]) || 0),
    });
  }
  if (leaves.length === 0) throw new Error(`${fileName}: nenhum item-folha na planilha`);
  return { leaves, zeroed };
}

function buildParsedItems(leaves: PlanilhaLeaf[]): { items: ParsedItem[]; totalCost: number } {
  const sorted = [...leaves].sort((a, b) => b.total_cost - a.total_cost);
  const totalCost = sorted.reduce((s, l) => s + l.total_cost, 0) || 1;
  let cumulative = 0;
  const items: ParsedItem[] = sorted.map((l, order) => {
    const costPct = (l.total_cost / totalCost) * 100;
    cumulative += costPct;
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
      abc_class: cumulative <= 80 ? "P1" : cumulative <= 95 ? "P2" : "P3",
      item_type: "A",
      mapping_status: "pending",
      classification_note: null,
    };
  });
  return { items, totalCost };
}

interface CpuLine {
  section: string;
  descricao: string;
  unidade: string;
  indice: number;
}

interface CpuComp {
  /** Descrição do serviço no cabeçalho, normalizada e sem observações entre parênteses. */
  service: string;
  lines: CpuLine[];
}

const SERVICE_HEADER_RE = /^Servi[cç]o:\s*(.+)$/;
const SKIPPED_SECTIONS = new Set(["MÃO DE OBRA", "MAO DE OBRA"]);
const FUEL_RE = /^(OLEO DIESEL|COMBUSTIVEL)/;

/** "02.18.01.01.01.01 - ESCAVACAO MANUAL ... - FUNDACOES  -  M3" → código e serviço. */
function parseServiceHeader(header: string): { code: string; service: string } {
  const flat = header.replace(/\u00a0/g, " ").trim();
  const [code, ...rest] = flat.split(" - ");
  const service = rest.join(" - ").replace(/\s+-\s+\S+$/, "");
  return { code: code.trim(), service: norm(service.replace(/\([^)]*\)/g, " ")) };
}

/** Composições da cpu: cabeçalho de seção é a linha com "Unid." na coluna E. */
function parseCpu(wb: XLSX.WorkBook, fileName: string): Map<string, CpuComp> {
  const out = new Map<string, CpuComp>();
  let code: string | null = null;
  let section: string | null = null;
  for (const row of sheet(wb, "cpu", fileName)) {
    if (!row || typeof row[0] !== "string") continue;
    const text = row[0].trim();
    if (!text) continue;
    const svc = SERVICE_HEADER_RE.exec(text);
    if (svc) {
      const header = parseServiceHeader(svc[1]);
      code = header.code;
      section = null;
      if (!out.has(code)) out.set(code, { service: header.service, lines: [] });
      continue;
    }
    if (text.startsWith("Etapas:") || text === "RESUMO") {
      section = null;
      continue;
    }
    if (String(row[4] ?? "").trim() === "Unid.") {
      section = text;
      continue;
    }
    if (!code || !section || SKIPPED_SECTIONS.has(section)) continue;
    const unidade = row[4] != null ? String(row[4]).trim() : "";
    const indice = Number(row[5]);
    if (!unidade || !Number.isFinite(indice) || indice <= 0) continue;
    const list = out.get(code)!.lines;
    if (!list.some((l) => l.descricao === text)) {
      list.push({ section, descricao: text, unidade: normalizeUnit(unidade), indice });
    }
  }
  for (const [c, comp] of out) if (comp.lines.length === 0) out.delete(c);
  return out;
}

const hasFuel = (lines: CpuLine[]) => lines.some((l) => FUEL_RE.test(norm(l.descricao)));

const equipKey = (lines: CpuLine[]) =>
  lines
    .filter((l) => l.section === "EQUIPAMENTO")
    .map((l) => `${norm(l.descricao)}@${l.indice}`)
    .sort()
    .join("|");

const sameService = (a: string, b: string) => a.startsWith(b) || b.startsWith(a);

/**
 * Composições do In Loco com equipamento e sem linha de combustível. O In
 * Loco precifica o equipamento com combustível embutido no preço-hora, o
 * Pmold lista o diesel à parte. Recebem a linha de diesel de uma composição
 * com as mesmas horas de equipamento:
 *   1. o mesmo serviço no Pmold (mesmo código e descrição);
 *   2. senão, uma composição irmã do próprio In Loco (mesmo serviço, outro
 *      diâmetro — ex.: estaca Ø300 × Ø400/500/600).
 * Devolve chave "código|insumo" → nota de origem.
 */
function portFuelLines(inLoco: Map<string, CpuComp>, pmold: Map<string, CpuComp>, usedCodes: Set<string>): Map<string, string> {
  const ported = new Map<string, string>();
  const withoutDigits = (s: string) => s.replace(/\d+/g, "#");
  for (const [code, comp] of inLoco) {
    if (!usedCodes.has(code)) continue;
    const key = equipKey(comp.lines);
    if (!key || hasFuel(comp.lines)) continue;
    const twin = pmold.get(code);
    let source: CpuComp | undefined;
    let note: string;
    if (twin && sameService(twin.service, comp.service) && equipKey(twin.lines) === key && hasFuel(twin.lines)) {
      source = twin;
      note = "diesel do mesmo serviço no orçamento Pmold (no In Loco o combustível está no preço-hora do equipamento)";
    } else {
      const sibling = [...inLoco].find(
        ([c, other]) => c !== code && withoutDigits(other.service) === withoutDigits(comp.service) && equipKey(other.lines) === key && hasFuel(other.lines)
      );
      if (!sibling) continue;
      source = sibling[1];
      note = `diesel da composição irmã ${sibling[0]} do próprio In Loco (mesmo serviço e mesmas horas de equipamento por unidade)`;
    }
    for (const fuel of source.lines.filter((l) => FUEL_RE.test(norm(l.descricao)))) {
      comp.lines.push({ ...fuel });
      ported.set(`${code}|${fuel.descricao}`, note);
    }
  }
  return ported;
}

function buildRecipeMap(cpu: Map<string, CpuComp>, fileName: string): RecipeMap {
  const recipes = new Map<string, MaterialInsumo[]>();
  let count = 0;
  const unique = new Set<string>();
  for (const [code, { lines }] of cpu) {
    recipes.set(
      code,
      lines.map((l) => ({ codigo: l.descricao, descricao: l.descricao, unidade: l.unidade, indice: l.indice }))
    );
    count += lines.length;
    for (const l of lines) unique.add(`${l.descricao}|${l.unidade}`);
  }
  return { recipes, fileName, stats: { composicoes: recipes.size, insumosMaterial: count, uniqueMaterials: unique.size }, warnings: [] };
}

// ---------------------------------------------------------------------------
// Fatores
// ---------------------------------------------------------------------------

interface Factor {
  source_tier: string;
  factor_value: number;
  factor_unit: string;
  product_unit: string;
  factor_name: string;
  factor_source: string;
  factor_version: string | null;
  ecoinvent_product_id?: string | null;
  ecoinvent_activity_id?: string | null;
  perKg?: number;
  perM3?: number;
}

const CEC = {
  sand: 9,
  mortar128: 11,
  gravel: 18,
  lime: 19,
  cement: 23,
  concrete25: 28,
  concrete30: 29,
  concrete40: 64,
  nail: 59,
  wire: 60,
  plywood: 69,
  plantedTimber: 89,
  concreteBlock: 82,
  structuralBlock: 83,
  waterPaint: 53,
  steelDoor: 38,
  aluminiumFrame: 37,
  aluminium: 7,
  temperedGlass: 56,
} as const;
type CecKey = keyof typeof CEC;

const ECOINVENT = {
  pp: { activity: "c7f79217-8cdf-41b8-a945-9e850fad93e4", note: "polipropileno (peças plásticas)" },
  polyester: { activity: "a7dfe4d0-e3bc-485d-8039-c2f75f66a96d", note: "fibra de poliéster (geotêxtil não tecido)" },
  lubOil: { activity: "6634c23c-d3a7-46c6-afe7-37793a13a62b", note: "óleo mineral (desmoldante)" },
  bitumenCold: { activity: "7bad45b0-9e85-418f-998b-735c644738f6", note: "emulsão asfáltica aplicada a frio" },
} as const;
type EcoKey = keyof typeof ECOINVENT;

const UNIT_LABEL: Record<string, string> = { t: "t", kg: "kg", m3: "m³", m2: "m²", m: "m", L: "L" };

const cec = new Map<CecKey, Factor>();
const eco = new Map<EcoKey, Factor>();
let STEEL: Factor;
let DIESEL: Factor;
let dieselValue = 0;

interface FortesRules {
  corteDobra: { value: number; unit: string; name: string; source: string; tier: string };
  bombeamento: { litersPerM3: number; ef: number; source: string; notes: string };
  guindaste: { litersPerHour: number; ef: number; source: string; notes: string };
}
let RULES: FortesRules;

async function loadFactors() {
  const ids = Object.values(CEC);
  const { data, error } = await supabaseEmission.from("produtos_cecarbon_dev").select("*").in("id", ids);
  if (error) throw new Error(`cecarbon: ${error.message}`);
  for (const [key, id] of Object.entries(CEC) as Array<[CecKey, number]>) {
    const r = (data ?? []).find((row) => row.id === id);
    if (!r) throw new Error(`CECarbon id ${id} não encontrado`);
    const unit = String(r["Unidade"]);
    const value = Number(r["fator de emissão (kgCO2)"]);
    const ref = String(r["Referencia"] ?? "");
    cec.set(key, {
      source_tier: "cecarbon",
      factor_value: value,
      factor_unit: `kgCO₂/${UNIT_LABEL[unit] ?? unit}`,
      product_unit: unit,
      factor_name: String(r["Descrição fator de emissao"]),
      factor_source: ref,
      factor_version: ref.match(/\d{4}/)?.[0] ?? null,
      perKg: unit === "t" ? value / 1000 : unit === "kg" ? value : undefined,
      perM3: unit === "m3" ? value : undefined,
    });
  }

  for (const [key, def] of Object.entries(ECOINVENT) as Array<[EcoKey, (typeof ECOINVENT)[EcoKey]]>) {
    const { data: rows } = await supabaseEmission.from("ecoinvent_dev").select("*").eq("activity_id", def.activity).limit(1);
    const r = rows?.[0];
    if (!r) throw new Error(`ecoinvent ${key} não encontrado`);
    const value = Number(r.impact_score);
    eco.set(key, {
      source_tier: "ecoinvent",
      factor_value: value,
      factor_unit: "kgCO2e/kg",
      product_unit: "kg",
      factor_name: String(r.product_name),
      factor_source: `Ecoinvent — ${r.activity_name} (${r.geography}); ${def.note}`,
      factor_version: r.year_start && r.year_end ? `${r.year_start}–${r.year_end}` : null,
      ecoinvent_product_id: r.product_id,
      ecoinvent_activity_id: r.activity_id,
      perKg: value,
    });
  }

  // Aço: o mesmo fator do In Loco já revisado pela Fortes (v29, Ecoinvent 3.11).
  STEEL = {
    source_tier: "ecoinvent",
    factor_value: 1.820002,
    factor_unit: "kgCO₂/kg",
    product_unit: "kg",
    factor_name: "Aço (vergalhão, tela, perfil e acessórios)",
    factor_source: "v29 (relatório pulper pit) — Ecoinvent 3.11; mesmo fator do aço CA-50 no In Loco revisado pela Fortes",
    factor_version: null,
    perKg: 1.820002,
  };

  const diesel = (await getFuelFactors()).diesel;
  dieselValue = diesel.value;
  DIESEL = {
    source_tier: "ghg_protocol",
    factor_value: diesel.value,
    factor_unit: diesel.unit,
    product_unit: "L",
    factor_name: "Óleo diesel (combustão)",
    factor_source: diesel.source,
    factor_version: extractYearFromText(diesel.source),
  };

  const { data: fr } = await supabase
    .from("factor_rules")
    .select("*")
    .eq("company_id", COMPANY_ID)
    .eq("match_keyword", "corte e dobra de aco")
    .eq("is_active", true)
    .single();
  if (!fr) throw new Error("Regra de corte e dobra da Fortes não encontrada");
  const { data: er } = await supabase.from("equipment_rules").select("*").eq("company_id", COMPANY_ID).eq("is_active", true);
  const eq = (kw: string) => {
    const r = (er ?? []).find((x) => x.match_keyword === kw);
    if (!r) throw new Error(`Regra de equipamento "${kw}" da Fortes não encontrada`);
    return r;
  };
  const bomb = eq("bombeamento de concreto");
  const crane = eq("guindaste");
  RULES = {
    corteDobra: {
      value: Number(fr.factor_value),
      unit: String(fr.factor_unit),
      name: String(fr.factor_name),
      source: String(fr.source_description),
      tier: String(fr.source_tier),
    },
    bombeamento: {
      litersPerM3: Number(bomb.consumption_per_hour),
      ef: Number(bomb.emission_factor_value),
      source: String(bomb.emission_factor_source),
      notes: String(bomb.notes),
    },
    guindaste: {
      litersPerHour: Number(crane.consumption_per_hour),
      ef: Number(crane.emission_factor_value),
      source: String(crane.emission_factor_source),
      notes: String(crane.notes),
    },
  };
}

const F = (k: CecKey) => cec.get(k)!;
const E = (k: EcoKey) => eco.get(k)!;

// ---------------------------------------------------------------------------
// Decisões por linha
// ---------------------------------------------------------------------------

interface Leaf {
  item: ExpandedItem;
  scenario: ScenarioKey;
  parent: ExpandedItem | null;
  section: string;
  compHasFuel: boolean;
  /** Origem da linha de diesel copiada (portFuelLines), ou null. */
  ported: string | null;
}

type Decision =
  | { kind: "exclude"; reason: string; type: string }
  | { kind: "factor"; factor: Factor; note: string; per?: { amount: number; unit: "kg" | "m3" } }
  | { kind: "estimate"; label: string; kgPerUnit: number; basis: string }
  | { kind: "equipment"; name: string; fuel: "diesel" | "electric"; consumption: number; basis: string }
  | { kind: "rule"; rule: "corteDobra" | "bombeamento" | "guindaste"; note?: string };

const SERVICE = "Serviço/custo indireto sem material incorporado — fora da fronteira A1–A3";
const PEOPLE = "Despesa de pessoal (alimentação, alojamento, transporte da equipe) — fora da fronteira de materiais e equipamentos";
const TEMPORARY = "Obra provisória/equipamento de apoio reutilizável (locação) — fora da fronteira A1–A3";
const FREIGHT = "Frete (A4) — transporte não é modelado em nenhum dos dois cenários";
const LABOR = "Mão de obra — sem material incorporado";
const FUEL_COVERED = "Combustível do equipamento já contabilizado na linha de óleo diesel da mesma composição";
const SMALL_ELECTRIC = "Equipamento elétrico portátil (vibrador de imersão/prensa) — consumo de energia desprezível";
const RISK = "Provisão de risco/contingência (35% da montagem) — sem quantidade física";
const TOOL = "Ferramenta/consumível de aplicação (lixa, rolo) — não incorporado à obra";
const DRILL = "Serviço de perfuração subcontratado — diesel da perfuratriz já contabilizado na linha de óleo diesel da composição";
const APPLICATION = "Serviço de execução/acabamento — material contado nas linhas próprias da composição";

const exclude = (reason: string, type = "F"): Decision => ({ kind: "exclude", reason, type });

/** Fator do material com massa (ou volume) assumida por unidade do item. */
const perUnit = (factor: Factor, amount: number, unit: "kg" | "m3", note: string): Decision => ({
  kind: "factor",
  factor,
  note,
  per: { amount, unit },
});

function composite(label: string, parts: Array<[Factor, number, "kg" | "m3"]>, perWhat: string): Decision {
  let total = 0;
  for (const [f, amount, unit] of parts) {
    const per = unit === "kg" ? f.perKg : f.perM3;
    if (per == null) throw new Error(`fator ${f.factor_name} não tem base ${unit}`);
    total += amount * per;
  }
  const fmt = (a: number) => Number(a.toPrecision(3)).toLocaleString("pt-BR");
  const describe = parts.map(([f, a, u]) => `${fmt(a)} ${u === "kg" ? "kg" : "m³"} ${f.factor_name}`).join(" + ");
  return { kind: "estimate", label, kgPerUnit: total, basis: `Composição por ${perWhat}: ${describe}.` };
}

function concreteFactor(desc: string): Factor {
  const fck = Number(desc.match(/(\d{2})\s*MPA/)?.[1] ?? desc.match(/\bC\s?(\d{2})\b/)?.[1] ?? 0);
  if (!fck) throw new Error(`fck não identificado: ${desc}`);
  if (fck <= 25) return F("concrete25");
  if (fck <= 32) return F("concrete30");
  return F("concrete40");
}

interface Matcher {
  desc: RegExp;
  unit?: string; // unidade normalizada do calculador (kg, m3, m2, m, un, t, h, ...)
  sections?: string[];
  direct?: boolean; // só item direto (sem composição)
  action: (leaf: Leaf) => Decision;
}

const EQUIPMENT_SECTIONS = ["EQUIPAMENTO"];

const MATCHERS: Matcher[] = [
  // --- Regras da Fortes -----------------------------------------------------
  { desc: /^CORTE E DOBRA DE ACO/, action: () => ({ kind: "rule", rule: "corteDobra" }) },
  {
    desc: /^MAO DE OBRA PARA ARMACAO$/,
    action: (l) =>
      /^ARMADURA EM ACO/.test(norm(l.parent?.description ?? ""))
        ? { kind: "rule", rule: "corteDobra", note: "Serviço de armação (corte, dobra e montagem) da estrutura: premissa de corte e dobra por kg de aço, como a linha CORTE E DOBRA DE ACO do In Loco." }
        : exclude(`${LABOR} (armação de estacas: o In Loco também não tem corte e dobra nas estacas)`, "B"),
  },
  { desc: /^BOMBEAMENTO DE CONCRETO/, action: () => ({ kind: "rule", rule: "bombeamento" }) },
  { desc: /^GUINDASTE/, unit: "h", action: () => ({ kind: "rule", rule: "guindaste", note: "Horas de guindaste da própria composição (cpu)." }) },

  // --- Equipamentos -------------------------------------------------------
  { desc: /^(MANGOTE VIBRADOR|MOTOR P\/VIBRADOR|PRENSA PARA LUVA)/, sections: EQUIPMENT_SECTIONS, action: () => exclude(SMALL_ELECTRIC, "E") },
  { desc: /./, sections: EQUIPMENT_SECTIONS, action: (l) => (l.compHasFuel ? exclude(FUEL_COVERED, "E") : equipmentWithoutFuel(l)) },
  { desc: /^CAMINHAO MUNCK/, unit: "h", action: (l) => equipmentWithoutFuel(l) },

  // --- Exclusões ----------------------------------------------------------
  { desc: /^(ALOJAMENTO|CAFE DA MANHA|REFEICAO|VALE TRANSPORTE|ALUGUEL DE ONIBUS|ALUGUEL DE CASA)/, action: () => exclude(PEOPLE) },
  {
    desc: /^(MOBILIZACAO|MUDANCA DE PATAMAR|INTEGRACAO DE PESSOAL|PROJETO GEOTECNICO|PROVA DE CARGA|ENSAIO DE PIT|DIARIA DE ENSAIO)/,
    action: () => exclude(SERVICE),
  },
  { desc: /^CRAVACAO DE ESTACA/, action: () => exclude(DRILL) },
  { desc: /^(ACABAMENTO LAPIDADO|ACABAMENTO MECANICO|PROJECAO DO CONCRETO|ARRASAMENTO DE ESTACA|ROSQUEAMENTO)/, action: () => exclude(APPLICATION) },
  {
    desc: /^(FORMA METALICA COM ESCORAMENTO|FORMA METALICA PARA PILARES|CIMBRAMENTO METALICO|ESCORAMENTO METALICO|ANDAIME|MATERIAL PARA ICAMENTO)/,
    action: () => exclude(TEMPORARY, "E"),
  },
  { desc: /^FRETE/, action: () => exclude(FREIGHT) },
  { desc: /^MAO DE OBRA/, action: () => exclude(LABOR, "B") },
  { desc: /^MONTAGEM DE PRE-MOLDADOS \(RISCO/, action: () => exclude(RISK) },
  { desc: /^(LIXA|ROLO DE LA)/, action: () => exclude(TOOL) },

  // --- Combustível --------------------------------------------------------
  {
    desc: FUEL_RE,
    unit: "L",
    action: (l) => ({
      kind: "factor",
      factor: DIESEL,
      note: l.ported ? `Diesel dos equipamentos: ${l.ported}.` : "Óleo diesel da composição.",
    }),
  },

  // --- Concreto -----------------------------------------------------------
  {
    desc: /^FABRICACAO E TRANSPORTE DE ESTRUTURA PRE-MOLDADA/,
    unit: "m3",
    action: () => ({
      kind: "factor",
      factor: F("concrete40"),
      note: "Concreto do pré-moldado (classe ≥ C40): mesmo fator do concreto estrutural C45 do In Loco. Armadura contada nas linhas próprias; transporte (A4) fora da fronteira, como no In Loco.",
    }),
  },
  {
    desc: /^LAJE PRE-MOLDADA ALVEOLAR 20CM/,
    unit: "m2",
    action: () => composite("laje alveolar 20 cm: concreto + cordoalha", [[F("concrete40"), 0.12, "m3"], [STEEL, 3.5, "kg"]], "m² (0,12 m³ de concreto e 3,5 kg de aço de protensão, assumidos)"),
  },
  {
    desc: /^CONCRETO/,
    unit: "m3",
    action: (l) => {
      const f = concreteFactor(norm(l.item.description));
      return { kind: "factor", factor: f, note: `Concreto pela classe de resistência (${f.factor_name}; C45 usa o fator de 40 MPa, maior classe do CECarbon; C20 usa o de 25 MPa).` };
    },
  },

  // --- Aço ----------------------------------------------------------------
  {
    desc: /^FORNECIMENTO E MONTAGEM DE ARMACAO PARA PRE-MOLDADO/,
    unit: "kg",
    action: () => ({
      kind: "factor",
      factor: {
        ...STEEL,
        source_tier: "user_custom",
        factor_value: STEEL.factor_value + RULES.corteDobra.value,
        factor_unit: "kgCO₂e/kg",
        factor_name: `Aço CA-50 (${STEEL.factor_value.toFixed(3)}) + corte e dobra (${RULES.corteDobra.value}) — armação de pré-moldado`,
        factor_source: `${STEEL.factor_source} + regra de corte e dobra da Fortes (${RULES.corteDobra.source})`,
      },
      note: "Armação fornecida e montada: aço + premissa de corte e dobra da Fortes, como a armação da estrutura do In Loco.",
    }),
  },
  { desc: /^(ACO CA|TELA SOLDADA|INSERTOS METALICOS|ESTR EM PERFIL|GRADE METALICA)/, unit: "kg", action: () => ({ kind: "factor", factor: STEEL, note: "Aço pelo fator único do projeto." }) },
  { desc: /^TRELICA ESPACADORA H=10CM/, unit: "m", action: () => perUnit(STEEL, 0.768, "kg", "treliça H=10 cm: 0,768 kg/m de aço (mesma massa do relatório v29)") },
  { desc: /^(ARAME|ELETRODO)/, unit: "kg", action: () => ({ kind: "factor", factor: F("wire"), note: "Arame/eletrodo de aço." }) },
  { desc: /^PREGO/, unit: "kg", action: () => ({ kind: "factor", factor: F("nail"), note: "Prego de aço." }) },
  { desc: /^LUVA RUDLOF/, unit: "un", action: () => perUnit(STEEL, 0.35, "kg", "luva Rudloff para barra Ø20 mm: ~0,35 kg de aço") },
  { desc: /^TIRANTES TEP-44 TREJOR/, action: () => perUnit(STEEL, 90, "kg", "conjunto Trejor TEP-44 por pilar: 4 tirantes Ø44 mm × 1,5 m (~72 kg) + shims e cartola (~18 kg)") },
  { desc: /^FORMA METALICA QUICKJET/, unit: "m2", action: () => perUnit(STEEL, 2, "kg", "forma incorporada (fica no concreto): tela de aço expandido galvanizada ~2 kg/m²") },
  { desc: /^BARRA ANTI-PANICO/, unit: "un", action: () => perUnit(STEEL, 3, "kg", "barra antipânico ~3 kg de aço") },
  { desc: /^FECHADURA/, unit: "un", action: () => perUnit(STEEL, 1.5, "kg", "fechadura de porta corta-fogo ~1,5 kg de aço") },
  { desc: /^MOLA SUPERIOR/, unit: "un", action: () => perUnit(F("aluminium"), 2.5, "kg", "mola aérea ~2,5 kg (corpo de alumínio fundido)") },

  // --- Madeira e formas ---------------------------------------------------
  { desc: /^CHAPA COMPENSADA/, action: () => perUnit(F("plywood"), PLYWOOD_SHEET_M2 * 0.014, "m3", "chapa 2,20 × 1,10 m × 14 mm = 0,0339 m³") },
  { desc: /^PONTALETE 8X8/, unit: "m", action: () => perUnit(F("plantedTimber"), 0.08 * 0.08 * WOOD_KG_M3, "kg", `pontalete 8×8 cm: 0,0064 m³/m × ${WOOD_KG_M3} kg/m³`) },
  { desc: /^CAIBRO \(7X5\)/, unit: "m", action: () => perUnit(F("plantedTimber"), 0.07 * 0.05 * WOOD_KG_M3, "kg", `caibro 7×5 cm: 0,0035 m³/m × ${WOOD_KG_M3} kg/m³`) },
  {
    desc: /^TAIPA \(2,5X30/,
    unit: "m2",
    action: () => perUnit(F("plantedTimber"), 0.025 * WOOD_KG_M3, "kg", `tábua (taipa) de 2,5 cm usada na forma: 0,025 m³/m² × ${WOOD_KG_M3} kg/m³ — não é taipa de pilão`),
  },
  { desc: /^DESMOLDANTE/, action: () => perUnit(E("lubOil"), 18 * 0.85, "kg", "balde de 18 L × 0,85 kg/L de desmoldante à base de óleo") },

  // --- Agregados, cimento e argamassa ---------------------------------------
  { desc: /^AREIA$/, unit: "t", action: () => ({ kind: "factor", factor: F("sand"), note: "Areia." }) },
  { desc: /^AREIA$/, unit: "m3", action: () => perUnit(F("sand"), 1500, "kg", "areia: 1.500 kg/m³") },
  { desc: /^BRITA/, unit: "t", action: () => ({ kind: "factor", factor: F("gravel"), note: "Brita." }) },
  { desc: /^BRITA/, unit: "m3", action: () => perUnit(F("gravel"), 1450, "kg", "brita 1: 1.450 kg/m³") },
  { desc: /^ARGILA PARA ATERRO/, unit: "m3", action: () => perUnit(F("sand"), 1600, "kg", "argila para aterro (mineral sem processamento, fator da areia): 1.600 kg/m³") },
  { desc: /^BARRO ENSACADO \(EMB\. 40KG\)/, action: () => perUnit(F("sand"), 40, "kg", "saco de 40 kg de barro (mineral sem processamento, fator da areia)") },
  { desc: /^CIMENTO PORTLAND \(SACO=50KG\)/, action: () => perUnit(F("cement"), 50, "kg", "saco de 50 kg") },
  { desc: /^CAL HIDRATADA \(EMB\. 20KG\)/, action: () => perUnit(F("lime"), 20, "kg", "saco de 20 kg") },
  { desc: /^PENETRON ADMIX 18KG/, action: () => perUnit(F("cement"), 18, "kg", "aditivo cristalizante cimentício, saco de 18 kg (fator do cimento)") },
  { desc: /^ARGAMASSA PARA REBOCO/, action: () => perUnit(F("mortar128"), MORTAR_BAG_KG, "kg", `argamassa industrializada, saco de ${MORTAR_BAG_KG} kg (traço 1:2:8 do serviço)`) },
  {
    desc: /^REBOCO, EM PAREDE/,
    unit: "m2",
    direct: true,
    action: () => perUnit(F("mortar128"), 1.35 * MORTAR_BAG_KG, "kg", `mesmo consumo da composição do Pmold para este serviço: 1,35 sc/m² × ${MORTAR_BAG_KG} kg`),
  },
  {
    desc: /^CHAPISCO COMUM/,
    unit: "m2",
    direct: true,
    action: () => perUnit(F("mortar128"), 0.08 * MORTAR_BAG_KG, "kg", `mesmo consumo da composição do Pmold para este serviço: 0,08 sc/m² × ${MORTAR_BAG_KG} kg`),
  },

  // --- Alvenaria ----------------------------------------------------------
  { desc: /^BLOCO DE CONCRETO CANALETA 19X19X39CM - VEDACAO/, unit: "un", action: () => perUnit(F("concreteBlock"), 12, "kg", "canaleta de concreto 19×19×39 cm ~12 kg") },
  { desc: /^BLOCO DE CONCRETO 19X19X39CM - VEDACAO/, unit: "un", action: () => perUnit(F("concreteBlock"), 13, "kg", "bloco de concreto de vedação 19×19×39 cm ~13 kg") },
  { desc: /^BLOCO DE CONCRETO (CANALETA )?19X19X39CM - ESTRUTURAL/, unit: "un", action: () => perUnit(F("structuralBlock"), 15, "kg", "bloco estrutural 19×19×39 cm ~15 kg") },

  // --- Acabamentos e impermeabilização -----------------------------------
  { desc: /^TINTA ACRILICA/, action: () => perUnit(F("waterPaint"), 18 * 1.3, "kg", "lata de 18 L × 1,3 kg/L") },
  { desc: /^SELADOR ACRILICO/, action: () => perUnit(F("waterPaint"), 18 * 1.1, "kg", "lata de 18 L × 1,1 kg/L") },
  { desc: /^IGOL-2/, action: () => perUnit(E("bitumenCold"), 18, "kg", "balde de 18 L de pintura asfáltica (~1 kg/L)") },
  { desc: /^MANTA GEOTEXTIL TIPO BIDIN 200G\/M2/, unit: "m2", action: () => perUnit(E("polyester"), 0.2, "kg", "geotêxtil 200 g/m²") },
  {
    desc: /^ENDURECEDOR DE SUPERFICIE/,
    unit: "m2",
    action: () => composite("endurecedor de superfície (aspersão a seco)", [[F("cement"), 1.67, "kg"], [F("sand"), 3.33, "kg"]], "m² (5 kg/m²: 1/3 cimento + 2/3 agregado de quartzo, assumido)"),
  },

  // --- Peças plásticas da armação ----------------------------------------
  { desc: /^ESPACADOR \(MAXIPLAC\)/, unit: "un", action: () => perUnit(E("pp"), 0.01, "kg", "espaçador plástico ~10 g") },
  { desc: /^ESPACADOR TIPO ROLETE 75MM/, unit: "un", action: () => perUnit(E("pp"), 0.04, "kg", "espaçador rolete Ø75 mm ~40 g") },
  { desc: /^ETIQUETA PARA IDENTIFICACAO DE ACO/, unit: "un", action: () => perUnit(E("pp"), 0.005, "kg", "etiqueta plástica ~5 g") },
  { desc: /^PROTETOR PARA PONTA DE FERRO/, unit: "un", action: () => perUnit(E("pp"), 0.015, "kg", "protetor plástico de ponta de barra ~15 g") },

  // --- Esquadrias ---------------------------------------------------------
  { desc: /^PORTA CORTA-FOGO/, unit: "m2", action: () => perUnit(F("steelDoor"), 45, "kg", "porta corta-fogo de aço ~45 kg/m²") },
  { desc: /^PORTA DUPLA DE ABRIR EM CHAPA DOBRADA/, unit: "m2", action: () => perUnit(F("steelDoor"), 30, "kg", "porta de chapa de aço dobrada ~30 kg/m²") },
  {
    desc: /^PORTA DUPLA DE ALUMINIO COM VIDRO LAMINADO 6 MM/,
    unit: "m2",
    action: () => composite("porta de alumínio com vidro laminado 6 mm", [[F("aluminiumFrame"), 7, "kg"], [F("temperedGlass"), 10.5, "kg"]], "m² (7 kg de perfil de alumínio + 70% de vidro 6 mm × 15 kg/m², assumidos)"),
  },
];

function equipmentWithoutFuel(l: Leaf): Decision {
  const d = norm(l.item.description);
  if (/^(CAMINHAO MUNCK|CARRETA)/.test(d)) {
    return { kind: "equipment", name: d.startsWith("CARRETA") ? "Carreta" : "Caminhão munck", fuel: "diesel", consumption: TRUCK_L_H, basis: `perfil padrão "caminhão" da plataforma (${TRUCK_L_H} L/h)` };
  }
  if (/^MANIPULADOR TELESCOPICO/.test(d)) {
    return {
      kind: "equipment",
      name: "Manipulador telescópico",
      fuel: "diesel",
      consumption: TELEHANDLER_L_H,
      basis: `consumo implícito nas formas do orçamento Pmold da Fortes (0,1361 L/m² ÷ 0,0373 h/m² = ${TELEHANDLER_L_H.toFixed(2)} L/h)`,
    };
  }
  if (/^MAQUINA DE SOLDA/.test(d)) {
    return { kind: "equipment", name: "Máquina de solda", fuel: "electric", consumption: WELDER_KWH_H, basis: `perfil padrão da plataforma (${WELDER_KWH_H} kWh/h)` };
  }
  throw new UnmatchedError();
}

class UnmatchedError extends Error {}

function decide(leaf: Leaf): Decision | null {
  const d = norm(leaf.item.description);
  const unit = calcUnit(leaf.item.unit);
  for (const m of MATCHERS) {
    if (!m.desc.test(d)) continue;
    if (m.unit && m.unit !== unit) continue;
    if (m.sections && !m.sections.includes(leaf.section)) continue;
    if (m.direct && leaf.parent) continue;
    try {
      return m.action(leaf);
    } catch (e) {
      if (e instanceof UnmatchedError) return null;
      throw e;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Decisão → linha de item_mappings
// ---------------------------------------------------------------------------

interface Planned {
  leaf: Leaf;
  decision: Decision;
  status: "excluded" | "manual" | "auto";
  itemType: string;
  mapping: Record<string, unknown>;
}

function fmtNum(n: number, digits = 4): string {
  return Number(n.toPrecision(digits)).toLocaleString("pt-BR");
}

function plan(leaf: Leaf, decision: Decision): Planned {
  const base = { abc_item_id: "" };
  switch (decision.kind) {
    case "exclude":
      return {
        leaf,
        decision,
        status: "excluded",
        itemType: decision.type,
        mapping: { ...base, source_tier: "excluded", factor_value: 0.0, factor_unit: "kg CO2-Eq", factor_name: "Excluído", mapped_by: "excluded", exclusion_justification: decision.reason },
      };
    case "factor": {
      const f = decision.factor;
      const mapping: Record<string, unknown> = {
        ...base,
        source_tier: f.source_tier,
        ecoinvent_product_id: f.ecoinvent_product_id ?? null,
        ecoinvent_activity_id: f.ecoinvent_activity_id ?? null,
        factor_value: f.factor_value,
        factor_unit: f.factor_unit,
        product_unit: f.product_unit,
        factor_name: f.factor_name,
        factor_source: f.factor_source,
        factor_version: f.factor_version,
        confidence: "medium",
        mapped_by: "curadoria",
        notes: `Curadoria ZNIT (${TODAY}): ${decision.note}`,
      };
      if (decision.per) {
        const toFactor = getConversionFactor(decision.per.unit, f.factor_unit);
        if (!(toFactor > 0)) throw new Error(`${leaf.item.description}: fator ${f.factor_unit} não é por ${decision.per.unit}`);
        mapping.manual_conversion_factor = decision.per.amount * toFactor;
        mapping.manual_conversion_note = `${decision.note} (premissa editável)`;
      }
      return { leaf, decision, status: "manual", itemType: "A", mapping };
    }
    case "estimate":
      return {
        leaf,
        decision,
        status: "manual",
        itemType: "A",
        mapping: {
          ...base,
          source_tier: "user_custom",
          factor_value: decision.kgPerUnit,
          factor_unit: `kgCO₂e/${leaf.item.unit}`,
          product_unit: leaf.item.unit,
          factor_name: `ESTIMATIVA — ${decision.label}`,
          factor_source: "Estimativa ZNIT (provisória)",
          custom_factor_source: `${DISCLAIMER} Método: ${decision.basis}`,
          confidence: "low",
          mapped_by: "user_custom",
          notes: `${DISCLAIMER} Método: ${decision.basis}`,
        },
      };
    case "equipment": {
      const electric = decision.fuel === "electric";
      const ef = electric ? ELECTRIC_FACTOR.value : dieselValue;
      const unit = electric ? "kWh/h" : "L/h";
      return {
        leaf,
        decision,
        status: "manual",
        itemType: "E",
        mapping: {
          ...base,
          source_tier: "ghg_protocol",
          factor_value: decision.consumption * ef,
          factor_unit: `kgCO₂/${leaf.item.unit}`,
          product_unit: leaf.item.unit,
          factor_name: `${decision.name} (${fmtNum(decision.consumption)} ${unit} × ${ef} kgCO₂/${electric ? "kWh" : "L"})`,
          factor_source: electric ? ELECTRIC_FACTOR.source : DIESEL.factor_source,
          factor_version: electric ? "2024" : DIESEL.factor_version,
          confidence: "medium",
          mapped_by: "curadoria",
          notes: `Curadoria ZNIT (${TODAY}): horas da composição × ${decision.basis}.`,
        },
      };
    }
    case "rule": {
      if (decision.rule === "corteDobra") {
        const r = RULES.corteDobra;
        return {
          leaf,
          decision,
          status: "auto",
          itemType: "D",
          mapping: {
            ...base,
            source_tier: r.tier,
            factor_value: r.value,
            factor_unit: r.unit,
            factor_name: r.name,
            factor_source: r.source,
            custom_factor_source: r.source,
            factor_version: extractYearFromText(r.source),
            confidence: "high",
            mapped_by: "rule",
            notes: decision.note ?? "Regra de corte e dobra da Fortes (processo, A3 do vergalhão fabricado; o aço é contado na linha própria).",
          },
        };
      }
      const r = decision.rule === "bombeamento" ? RULES.bombeamento : RULES.guindaste;
      const consumption = decision.rule === "bombeamento" ? RULES.bombeamento.litersPerM3 : RULES.guindaste.litersPerHour;
      const label = decision.rule === "bombeamento" ? `Bombeamento de concreto (${consumption} L/m³ × ${r.ef} kgCO₂/L)` : `Guindaste (${consumption} L/h × ${r.ef} kgCO₂/L)`;
      return {
        leaf,
        decision,
        status: "auto",
        itemType: decision.rule === "bombeamento" ? "D" : "E",
        mapping: {
          ...base,
          source_tier: "ghg_protocol",
          factor_value: consumption * r.ef,
          factor_unit: decision.rule === "bombeamento" ? "kgCO₂/m³" : "kgCO₂/h",
          factor_name: label,
          factor_source: r.source,
          factor_version: extractYearFromText(r.source),
          confidence: "high",
          mapped_by: "rule",
          notes: decision.note ? `${r.notes} ${decision.note}` : r.notes,
        },
      };
    }
  }
}

function expectedKg(p: Planned): number {
  if (p.status === "excluded") return 0;
  const m = p.mapping;
  const conv = resolveConversion(
    p.leaf.item.description,
    p.leaf.item.unit,
    m.factor_unit as string,
    { conversionFactor: (m.manual_conversion_factor as number | undefined) ?? null },
    m.factor_name as string
  );
  return p.leaf.item.quantity * (m.factor_value as number) * conv;
}

// ---------------------------------------------------------------------------
// Cleanup (idempotência)
// ---------------------------------------------------------------------------

async function cleanupProject(projectId: string) {
  const { data: curves } = await supabase.from("abc_curves").select("id").eq("project_id", projectId);
  const curveIds = (curves ?? []).map((c) => c.id as string);
  for (const curveId of curveIds) {
    const { data: items } = await supabase.from("abc_items").select("id").eq("abc_curve_id", curveId);
    for (const chunk of chunkArray((items ?? []).map((i) => i.id as string), 100)) {
      const { error } = await supabase.from("item_mappings").delete().in("abc_item_id", chunk);
      if (error) throw new Error(`cleanup item_mappings: ${error.message}`);
    }
  }
  const { data: scenarios } = await supabase.from("scenarios").select("id").eq("project_id", projectId);
  for (const s of scenarios ?? []) {
    await supabase.from("scenario_items").delete().eq("scenario_id", s.id);
    await supabase.from("scenario_results").delete().eq("scenario_id", s.id);
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

interface Prepared {
  key: ScenarioKey;
  totalCost: number;
  itemCount: number;
  zeroed: number;
  parents: ExpandedItem[];
  children: ExpandedItem[];
  planned: Planned[];
  unmatched: Leaf[];
}

function prepare(
  key: ScenarioKey,
  { leaves, zeroed }: { leaves: PlanilhaLeaf[]; zeroed: number },
  cpu: Map<string, CpuComp>,
  ported: Map<string, string>
): Prepared {
  const file = FILES[key];
  const { items, totalCost } = buildParsedItems(leaves);
  const { parents, children } = expandScenarioItems(items, buildRecipeMap(cpu, file.path));
  const parentByKey = new Map(parents.map((p) => [p.key, p]));

  const planned: Planned[] = [];
  const unmatched: Leaf[] = [];
  const leavesToDecide = [...parents.filter((p) => p.mapping_status !== "blocked"), ...children];
  for (const item of leavesToDecide) {
    const parent = item.parent_key ? parentByKey.get(item.parent_key)! : null;
    const lines = parent ? cpu.get(parent.cost_code)?.lines ?? [] : [];
    const line = lines.find((l) => l.descricao === item.description);
    const leaf: Leaf = {
      item,
      scenario: key,
      parent,
      section: line?.section ?? "DIRETO",
      compHasFuel: hasFuel(lines),
      ported: parent ? ported.get(`${parent.cost_code}|${item.description}`) ?? null : null,
    };
    if (parent) {
      const idx = item.quantity / parent.quantity;
      item.classification_note =
        `Insumo (${leaf.section}) de ${parent.description} (${parent.quantity} ${parent.unit} × ${Number(idx.toPrecision(4))} ${item.unit})` +
        (leaf.ported ? ` — ${leaf.ported}` : "");
    }
    const decision = decide(leaf);
    if (!decision) {
      unmatched.push(leaf);
      continue;
    }
    planned.push(plan(leaf, decision));
  }
  return { key, totalCost, itemCount: items.length, zeroed, parents, children, planned, unmatched };
}

function report(p: Prepared) {
  const file = FILES[p.key];
  console.log(`\n=== ${file.scenarioName} (${file.path})`);
  console.log(
    `  serviços: ${p.itemCount} (+${p.zeroed} zerados ignorados) | R$ ${p.totalCost.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} | ` +
      `${p.parents.length} pais + ${p.children.length} filhos`
  );
  const byKind: Record<string, { n: number; kg: number }> = {};
  for (const x of p.planned) {
    const k = x.decision.kind === "rule" ? `regra:${x.decision.rule}` : x.decision.kind;
    byKind[k] ??= { n: 0, kg: 0 };
    byKind[k].n++;
    byKind[k].kg += expectedKg(x);
  }
  for (const [k, v] of Object.entries(byKind).sort()) console.log(`  ${k.padEnd(22)} ${String(v.n).padStart(4)} itens ${(v.kg / 1000).toFixed(1).padStart(9)} tCO₂e`);
  const total = p.planned.reduce((s, x) => s + expectedKg(x), 0);
  const est = p.planned.filter((x) => x.decision.kind === "estimate").reduce((s, x) => s + expectedKg(x), 0);
  console.log(`  TOTAL ESPERADO: ${(total / 1000).toFixed(1)} tCO₂e (estimativas: ${(est / 1000).toFixed(1)} t)`);
  for (const x of p.planned) {
    if (x.status !== "excluded" && !(expectedKg(x) > 0)) console.log(`  ⚠ ZERO: ${x.leaf.item.description} (${x.leaf.item.unit}) → ${x.mapping.factor_name}`);
  }
  for (const u of p.unmatched) console.log(`  ✗ SEM DECISÃO [${u.section}] ${u.item.description} (${u.item.quantity} ${u.item.unit}) ← ${u.parent?.description.slice(0, 50) ?? "item direto"}`);

  if (DRY_RUN) {
    const order = [...p.planned].sort((a, b) => expectedKg(b) - expectedKg(a));
    for (const x of order) {
      const d = x.decision;
      const what =
        d.kind === "exclude" ? `EXCLUI: ${d.reason.slice(0, 60)}` :
        d.kind === "rule" ? `REGRA ${d.rule}` :
        d.kind === "estimate" ? `ESTIMATIVA ${d.label}` :
        d.kind === "equipment" ? `EQUIP ${d.name}` : `FATOR ${x.mapping.factor_name}`;
      console.log(
        `    ${(expectedKg(x) / 1000).toFixed(2).padStart(8)} t | ${x.leaf.item.description.slice(0, 48).padEnd(48)} ${String(Number(x.leaf.item.quantity.toFixed(2))).padStart(10)} ${x.leaf.item.unit.padEnd(4)} | ${what}`
      );
    }
  }
}

async function persist(p: Prepared, userId: string): Promise<{ scenarioId: string }> {
  const file = FILES[p.key];
  const curveInsert = { project_id: PROJECT_ID, file_name: file.path, imported_by_user_id: userId, total_items: p.itemCount, total_cost: p.totalCost };
  let res = await supabase.from("abc_curves").insert({ ...curveInsert, curve_type: "scenario" }).select("id").single();
  if (res.error?.message?.includes("curve_type")) res = await supabase.from("abc_curves").insert(curveInsert).select("id").single();
  if (res.error || !res.data) throw new Error(`insert curve: ${res.error?.message}`);
  const curveId = res.data.id as string;

  const decided = new Map(p.planned.map((x) => [x.leaf.item.key, x]));
  const toDbRow = (it: ExpandedItem) => {
    const x = decided.get(it.key);
    return {
      id: `${curveId}-${it.key}`,
      abc_curve_id: curveId,
      cost_code: it.cost_code,
      description: it.description,
      quantity: it.quantity,
      unit: it.unit,
      unit_cost: it.unit_cost,
      total_cost: it.total_cost,
      cost_pct: it.cost_pct,
      cumulative_pct: it.cumulative_pct,
      abc_class: it.abc_class,
      item_type: x ? x.itemType : it.item_type,
      item_order: it.item_order,
      mapping_status: x ? x.status : it.mapping_status === "blocked" ? "blocked" : "pending",
      classification_note: it.classification_note,
      ...(it.parent_key ? { parent_item_id: `${curveId}-${it.parent_key}` } : {}),
    };
  };
  const rows = [...p.parents.map(toDbRow), ...p.children.map(toDbRow)];
  for (const chunk of chunkArray(rows, 50)) {
    const { error } = await supabase.from("abc_items").insert(chunk);
    if (error) throw new Error(`insert items: ${error.message}`);
  }
  const mappings = p.planned.map((x) => ({ ...x.mapping, abc_item_id: `${curveId}-${x.leaf.item.key}` }));
  for (const chunk of chunkArray(mappings, 50)) {
    const { error } = await supabase.from("item_mappings").insert(chunk);
    if (error) throw new Error(`insert mappings: ${error.message}`);
  }

  const { scenario } = await createBaseScenario(PROJECT_ID, userId, { abcCurveId: curveId, scenarioName: file.scenarioName, isBase: file.isBase });
  const scenarioId = (scenario as { id: string }).id;
  const { error: descErr } = await supabase.from("scenarios").update({ description: file.description }).eq("id", scenarioId);
  if (descErr) throw new Error(`scenario description: ${descErr.message}`);
  return { scenarioId };
}

async function main() {
  const { data: company } = await supabase.from("companies").select("id, name").eq("id", COMPANY_ID).single();
  if (!company) throw new Error(`Empresa não encontrada: ${COMPANY_ID}`);
  const { data: user } = await supabase.from("users").select("id").eq("company_id", COMPANY_ID).eq("email", USER_EMAIL).single();
  if (!user) throw new Error(`Usuário ${USER_EMAIL} não encontrado em ${company.name}`);

  await loadFactors();
  console.log(`${DRY_RUN ? "[DRY-RUN] " : ""}Comparativo In Loco × Pré-moldado (revisão) em "${company.name}" — diesel ${dieselValue} kgCO₂/L`);

  const wbs = {
    inLoco: XLSX.read(readFileSync(join(INPUT_DIR, FILES.inLoco.path)), { type: "buffer" }),
    pmold: XLSX.read(readFileSync(join(INPUT_DIR, FILES.pmold.path)), { type: "buffer" }),
  };
  const planilha = { inLoco: parsePlanilha(wbs.inLoco, FILES.inLoco.path), pmold: parsePlanilha(wbs.pmold, FILES.pmold.path) };
  const cpu = { inLoco: parseCpu(wbs.inLoco, FILES.inLoco.path), pmold: parseCpu(wbs.pmold, FILES.pmold.path) };
  const ported = portFuelLines(cpu.inLoco, cpu.pmold, new Set(planilha.inLoco.leaves.map((l) => l.code)));
  for (const [key, note] of ported) console.log(`Diesel copiado para o In Loco ${key.split("|")[0]}: ${note}`);

  const prepared = [prepare("inLoco", planilha.inLoco, cpu.inLoco, ported), prepare("pmold", planilha.pmold, cpu.pmold, new Map())];
  for (const p of prepared) report(p);

  const pmold = prepared[1];
  const precastM3 = pmold.parents.filter((x) => /^FABRICACAO E MONTAGEM DE PRE-MOLDADO/.test(norm(x.description))).reduce((s, x) => s + x.quantity, 0);
  const craneHours = pmold.planned.filter((x) => x.decision.kind === "rule" && x.decision.rule === "guindaste").reduce((s, x) => s + x.leaf.item.quantity, 0);
  const perHour = RULES.guindaste.litersPerHour * RULES.guindaste.ef;
  console.log(
    `\nGuindaste: ${craneHours} h da cpu × ${RULES.guindaste.litersPerHour} L/h = ${((craneHours * perHour) / 1000).toFixed(1)} tCO₂e. ` +
      `Pelo índice da regra (${GUINDASTE_INDEX_M3} h/m³ × ${precastM3.toFixed(2)} m³ de pré-moldado) seriam ` +
      `${(GUINDASTE_INDEX_M3 * precastM3).toFixed(0)} h = ${((GUINDASTE_INDEX_M3 * precastM3 * perHour) / 1000).toFixed(1)} tCO₂e.`
  );

  const unmatched = prepared.reduce((s, p) => s + p.unmatched.length, 0);
  if (DRY_RUN) return;
  if (unmatched > 0) throw new Error(`${unmatched} linhas sem decisão — rode --dry-run e complete os matchers`);

  await cleanupProject(PROJECT_ID);
  const { error: projErr } = await supabase.from("projects").insert({
    id: PROJECT_ID,
    company_id: COMPANY_ID,
    name: "Planta de Silicato — HT: In Loco × Pré-moldado (revisão)",
    client_name: "VALE",
    address: "Vitória - ES",
    building_type: "industrial",
    status: "active",
  });
  if (projErr) throw new Error(`insert project: ${projErr.message}`);

  for (const p of prepared) {
    const { scenarioId } = await persist(p, user.id as string);
    const { data: r } = await supabase
      .from("scenario_results")
      .select("total_tco2e, items_total, items_mapped, items_excluded, coverage_pct")
      .eq("scenario_id", scenarioId)
      .single();
    if (r) {
      console.log(
        `\n${FILES[p.key].scenarioName}: ${Number(r.total_tco2e).toFixed(1)} tCO₂e | cobertura ${r.coverage_pct}% ` +
          `(${r.items_mapped}/${r.items_total - r.items_excluded} elegíveis; ${r.items_excluded} excluídos com justificativa)`
      );
    }
  }
  console.log(`\nConcluído. Projeto: ${PROJECT_ID} em "${company.name}"`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
