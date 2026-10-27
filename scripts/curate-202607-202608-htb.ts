/**
 * Curadoria de cobertura — "RDL — EAP R07 Valor Meta" (proj-202607-rdl-eap-htb)
 * e "Vinícola Villa Santa Maria" (proj-202608-invino-vsm-htb) no Grupo HTB.
 * Rodar DEPOIS de copy-202607-202608-to-htb.ts (a cópia recria os projetos e
 * apaga esta curadoria).
 *
 * Etapas, na ordem em que um item é decidido (a primeira que casar vence):
 *   1. Exclusão com justificativa — serviços/custos indiretos, mão de obra,
 *      obras provisórias, combustível já contado no item Diesel, insumos de
 *      composição já listados, escopo opcional, preço de escopo já quantificado.
 *   2. Equipamentos (A5) — regra de equipamento do Grupo HTB + fator kgCO₂/mês.
 *   3. ESTIMATIVA com aviso (user_custom, editável): verbas de instalações
 *      (benchmark por m² de área construída), elevadores (EPDs), demolição
 *      (diesel pela participação no custo) e as linhas paramétricas do InVino
 *      (quantidade = área construída, não quantitativo físico).
 *   4. Fator explícito — terraplenagem (ecoinvent por m³) e peças de um só
 *      material com massa assumida por unidade (torneira, barra de apoio,
 *      rufo...), gravada como conversão manual editável do item.
 *   5. Regra de fator do Grupo HTB (CECarbon), criada/atualizada aqui e
 *      aplicada com a mesma lógica da prioridade 0 de autoMatchItem.
 *   6. Família da receita geométrica (coverage-rules) → fator CECarbon do
 *      mesmo material (códigos de esquadria, DW, louças, ...).
 * Depois: reverte sugestões low não revisadas que passariam a somar com as
 * receitas novas, grava a área do projeto e recria o cenário base.
 *
 * Só substitui mapeamentos ausentes, sugestões do auto-map não revisadas
 * (mapped_by = "auto" com confiança low/medium) e a própria curadoria
 * (mapped_by = "curadoria"); mapeamentos auto/high, edições humanas e
 * exclusões existentes são mantidos. Regras só cedem a uma ação explícita.
 *
 * Uso:
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/curate-202607-202608-htb.ts --dry-run   # só imprime
 *   npx tsx scripts/curate-202607-202608-htb.ts
 */
import { supabase, supabaseEmission } from "../lib/server/supabase";
import { createBaseScenario, getConversionFactor, resolveConversion } from "../lib/server/calculator";
import { geometricRecipe, type RecipeFamily } from "../lib/server/coverage-rules";
import { getFuelFactors, getTransportFactors } from "../lib/server/canonical-factors";
import { normalizeKeyword } from "../lib/server/keyword";
import { chunkArray } from "../lib/server/db-utils";

const DRY_RUN = process.argv.includes("--dry-run");
const COMPANY_ID = "d2afedd7-8332-4b8f-88a6-3b7069f6b73a"; // Grupo HTB
const USER_EMAIL = "jbpalermo@gmail.com";
const RDL = "proj-202607-rdl-eap-htb";
const INVINO = "proj-202608-invino-vsm-htb";
const TODAY = "2026-10-27";

// ---------------------------------------------------------------------------
// Premissas das estimativas — todas editáveis; o texto de cada uma vai junto
// do fator (custom_factor_source/notes) para o aviso aparecer no item.
// ---------------------------------------------------------------------------

// Instalações (elétrica, hidráulica/incêndio, climatização, eletrônicos):
// 75 kgCO₂e/m² de área construída. Faixa publicada: 40–75 (MEP de escritórios,
// Carbon Leadership Forum/UW) e 90–110 até a conclusão da obra (Atelier Ten,
// método CIBSE TM65). Não inclui vazamento de refrigerante (fase B).
const MEP_KGCO2E_PER_M2 = 75;
// Elevador de passageiros: 20 tCO₂e/unidade (A1–A3). EPDs: Otis Gen2 13,3–18,6 t;
// Schindler 6000 21,2 t; Schindler 2000 40,3 t.
const ELEVATOR_KGCO2E = 20000;
// Monta-carga e plataforma PNE: premissas ZNIT (fração de um elevador).
const GOODS_LIFT_KGCO2E = 10000;
const PLATFORM_LIFT_KGCO2E = 2500;
// Demolição: diesel dos equipamentos ≈ 10% do custo do serviço, a R$ 6,00/L.
const DEMOLITION_FUEL_COST_SHARE = 0.1;
const DIESEL_PRICE_BRL_PER_L = 6.0;
// Área construída do InVino (aba Resumo, "ESTIMATIVA TOTAL - EDIFICAÇÕES").
const INVINO_GFA_M2 = 11770.04;
// RDL não declara área: usa a área de "Limpeza Final Da Obra" (2.13.03.13.05.01).
const RDL_GFA_COST_CODE = "2.13.03.13.05.01";

// Equipamentos: horas por mês (8 h × 22 dias) e fator elétrico SIN — mesma
// constante de app/api/equipment-rules/suggest (não há tabela de grid no backend).
const EQUIPMENT_HOURS_PER_MONTH = 176;
const ELECTRIC_FACTOR = { value: 0.0293, unit: "kgCO₂/kWh", source: "SIN 2024" };

const DISCLAIMER =
  "ESTIMATIVA ZNIT — valor provisório, não é quantitativo do projeto. Substitua por quantitativo físico ou EPD assim que disponível (editável no fator do item).";

// ---------------------------------------------------------------------------
// Fatores (CECarbon por id; ecoinvent por atividade)
// ---------------------------------------------------------------------------

const CEC = {
  steel: 8,
  mortar: 10,
  tileAdhesive: 61,
  polymerMortar: 62,
  tile: 22,
  marble: 49,
  granite: 41,
  naturalStone: 72,
  drywall: 34,
  structuralSteel: 58,
  floatGlass: 55,
  temperedGlass: 56,
  aluminiumFrame: 37,
  woodDoor: 36,
  steelDoor: 38,
  asphaltMembrane: 44,
  concreteBlock: 31,
  ceramicBlock: 102,
  sanitaryWare: 52,
  plywood: 69,
  waterPaint: 53,
  solventPaint: 54,
  concreteGeneric: 27,
  concrete25: 28,
  mdf: 93,
  plantedTimber: 92,
  aluminiumSheet: 7,
  sand: 9,
  grout: 94,
  cementGeneric: 23,
  stoneWool: 45,
  gravel: 18,
  asphalt: 17,
} as const;
type CecKey = keyof typeof CEC;

const ECOINVENT = {
  excavation: { activity: "66534f5e-d542-423e-bb42-1d3d0aec495f", unit: "m3", note: "unidade ecoinvent: m³ (o campo product_unit do catálogo traz a categoria)" },
  aac: { activity: "c55810ce-30d1-4cc8-8f39-5fde0b57746e", unit: "kg", note: "dataset ecoinvent da Índia (único disponível para AAC)" },
  brass: { activity: "89756541-e3e1-4704-bcda-c0a294308d5f", unit: "kg", note: "latão (metais sanitários)" },
  stainless: { activity: "5917425e-123a-4134-b268-8b1fda957fe7", unit: "kg", note: "aço inox 18/8" },
  pvc: { activity: "bea7fd3f-d1c9-4c37-ab17-24a2345472b0", unit: "kg", note: "PVC" },
  hdpe: { activity: "2f5549b8-5f62-424f-85c6-6dd82fa33bd3", unit: "kg", note: "PEAD" },
  pmma: { activity: "b575b8a7-4a44-45f3-837e-1b9553de6fad", unit: "kg", note: "acrílico (PMMA)" },
  silicone: { activity: "b147a01e-7e1c-43e4-a160-e83f93d5a2f2", unit: "kg", note: "silicone" },
  nylon: { activity: "e0f4dc34-c133-42e9-92c5-87da42ad6c48", unit: "kg", note: "nylon 6" },
  phenolic: { activity: "0537b6ea-ea56-46da-a66c-ba95024ea97c", unit: "kg", note: "resina fenólica" },
  pp: { activity: "c7f79217-8cdf-41b8-a945-9e850fad93e4", unit: "kg", note: "polipropileno" },
  rubber: { activity: "582a2c1e-62ad-4ade-9ad4-5144cc99808c", unit: "kg", note: "borracha sintética" },
} as const;
type EcoKey = keyof typeof ECOINVENT;

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
  cecarbon_id?: number;
  perKg?: number; // kgCO₂ por kg (para estimativas por composição)
  perM3?: number; // kgCO₂ por m³
}

const cec = new Map<number, Factor>();
const eco = new Map<EcoKey, Factor>();

const UNIT_LABEL: Record<string, string> = { t: "t", kg: "kg", m3: "m³", m2: "m²", m: "m", L: "L" };

async function loadFactors() {
  const ids = Object.values(CEC);
  const { data, error } = await supabaseEmission.from("produtos_cecarbon_dev").select("*").in("id", ids);
  if (error) throw new Error(`cecarbon: ${error.message}`);
  for (const r of data ?? []) {
    const unit = String(r["Unidade"]);
    const value = Number(r["fator de emissão (kgCO2)"]);
    const ref = String(r["Referencia"] ?? "");
    cec.set(r.id as number, {
      source_tier: "cecarbon",
      factor_value: value,
      factor_unit: `kgCO₂/${UNIT_LABEL[unit] ?? unit}`,
      product_unit: unit,
      factor_name: String(r["Descrição fator de emissao"]),
      factor_source: ref,
      factor_version: ref.match(/\d{4}/)?.[0] ?? null,
      cecarbon_id: r.id as number,
      perKg: unit === "t" ? value / 1000 : unit === "kg" ? value : undefined,
      perM3: unit === "m3" ? value : undefined,
    });
  }
  for (const id of ids) if (!cec.has(id)) throw new Error(`CECarbon id ${id} não encontrado`);

  for (const [key, def] of Object.entries(ECOINVENT) as Array<[EcoKey, (typeof ECOINVENT)[EcoKey]]>) {
    const { data: rows } = await supabaseEmission.from("ecoinvent_dev").select("*").eq("activity_id", def.activity).limit(1);
    const r = rows?.[0];
    if (!r) throw new Error(`ecoinvent ${key} não encontrado`);
    const value = Number(r.impact_score);
    eco.set(key, {
      source_tier: "ecoinvent",
      factor_value: value,
      factor_unit: `kgCO2e/${def.unit}`,
      product_unit: def.unit,
      factor_name: String(r.product_name),
      factor_source: `Ecoinvent — ${r.activity_name} (${r.geography}); ${def.note}`,
      factor_version: r.year_start && r.year_end ? `${r.year_start}–${r.year_end}` : null,
      ecoinvent_product_id: r.product_id,
      ecoinvent_activity_id: r.activity_id,
      perKg: def.unit === "kg" ? value : undefined,
      perM3: def.unit === "m3" ? value : undefined,
    });
  }
}

const F = (k: CecKey) => cec.get(CEC[k])!;
const E = (k: EcoKey) => eco.get(k)!;
type FactorKey = CecKey | EcoKey;
const factorOf = (k: FactorKey): Factor => (k in CEC ? F(k as CecKey) : E(k as EcoKey));

/** kgCO₂e de uma composição: [fator, kg] ou [fator, m³]. */
function compose(parts: Array<[FactorKey, number, "kg" | "m3"]>): number {
  let total = 0;
  for (const [k, amount, unit] of parts) {
    const f = factorOf(k);
    const per = unit === "kg" ? f.perKg : f.perM3;
    if (per == null) throw new Error(`fator ${k} não tem base ${unit}`);
    total += amount * per;
  }
  return total;
}

function describe(parts: Array<[FactorKey, number, "kg" | "m3"]>): string {
  const fmt = (a: number) => Number(a.toPrecision(3)).toLocaleString("pt-BR");
  return parts.map(([k, a, u]) => `${fmt(a)} ${u === "kg" ? "kg" : "m³"} ${factorOf(k).factor_name}`).join(" + ");
}

// ---------------------------------------------------------------------------
// Ações por item
// ---------------------------------------------------------------------------

interface Item {
  id: string;
  cost_code: string;
  description: string;
  unit: string;
  quantity: number;
  total_cost: number;
  item_type: string;
  mapping_status: string;
}

type Action =
  | { kind: "skip"; reason: string }
  | { kind: "exclude"; reason: string }
  | { kind: "equipment"; name: string; fuel: "diesel" | "electric"; consumption: number }
  | { kind: "estimate"; label: string; kgPerUnit: number; basis: string }
  | { kind: "factor"; factor: Factor; note: string; massKg?: number }
  | { kind: "rule"; keyword: string }
  | { kind: "family"; family: RecipeFamily; factor: Factor };

interface Matcher {
  code?: string;
  desc?: RegExp;
  unit?: string;
  action: (item: Item, ctx: Ctx) => Action | null;
}

interface Ctx {
  gfa: number;
  mepPool: Item[];
  dieselFactor: number;
  truckFactor: number; // kgCO₂e/t·km
}

const SERVICE = "Serviço/custo indireto sem material incorporado — fora da fronteira A1–A3";
const LABOR = "Mão de obra — sem material incorporado (material contado no item próprio)";
const TEMPORARY = "Obra provisória/equipamento de apoio reutilizável — fora da fronteira A1–A3";

const exclude = (reason: string) => () => ({ kind: "exclude", reason }) as Action;


// Camadas 1 e 2 (cobertura residual) — premissas físicas, todas editáveis.
const SPOIL_DENSITY_T_M3 = 1.8; // solo escavado solto
const SPOIL_HAUL_KM = 20; // distância até o bota-fora (assumida)
const JET_GROUT_CEMENT_KG_M3 = 350; // cimento por m³ de coluna de jet grouting
const PLANTER_WALL_M = 0.05; // parede de jardineira pré-moldada
const WATER = "Água de amassamento/consumo — impacto desprezível; o banco só tem água dessalinizada (não representativa)";

const num = (s: string) => parseFloat(s.replace(",", "."));

/** Peça de um só material com massa assumida por unidade do item. */
function part(desc: RegExp, key: FactorKey, massKg: number, note: string, unit?: string): Matcher {
  return { desc, unit, action: () => ({ kind: "factor", factor: factorOf(key), massKg, note }) };
}

function transport(ctx: Ctx): Action {
  const tkm = SPOIL_DENSITY_T_M3 * SPOIL_HAUL_KM;
  return {
    kind: "estimate",
    label: "transporte de bota-fora",
    kgPerUnit: tkm * ctx.truckFactor,
    basis: `${SPOIL_DENSITY_T_M3} t/m³ × ${SPOIL_HAUL_KM} km × ${ctx.truckFactor} kgCO₂e/t·km (caminhão, fator canônico). Distância até o bota-fora assumida.`,
  };
}

function jetGrout(item: Item): Action | null {
  const d = item.description.match(/(\d+(?:[.,]\d+)?)\s*cm/i);
  if (!d) return null;
  const r = num(d[1]) / 200;
  const cementKg = Math.PI * r * r * JET_GROUT_CEMENT_KG_M3;
  return composite(`jet grouting Ø${d[1]} cm (${JET_GROUT_CEMENT_KG_M3} kg de cimento/m³ de coluna)`, [["cementGeneric", cementKg, "kg"]], "m de coluna");
}

function bikes(item: Item): Action | null {
  const n = Number(item.description.match(/(\d+)\s*Bikes/i)?.[1] ?? 0);
  return n > 0 ? composite(`suporte para ${n} bicicletas (3 kg de aço/vaga)`, [["steel", 3 * n, "kg"]], "peça") : null;
}

function planter(item: Item): Action | null {
  const m = item.description.match(/(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)\s*-\s*h\s*=\s*(\d+(?:[.,]\d+)?)/i);
  if (!m) return null;
  const [L, W, H] = [num(m[1]), num(m[2]), num(m[3])];
  const area = 2 * (L + W) * H + L * W;
  return composite(`jardineira ${L}×${W}×${H} m em concreto pré-moldado 5 cm (material não especificado)`, [["concreteGeneric", area * PLANTER_WALL_M, "m3"]], "peça");
}

function woodRail(item: Item): Action | null {
  const h = item.description.match(/H\s*=\s*(\d+(?:[.,]\d+)?)/i);
  if (!h) return null;
  const kg = 9 * num(h[1]);
  return composite(`guarda-corpo de madeira h=${h[1]} m (9 kg/m por m de altura, assumido)`, [["plantedTimber", kg, "kg"]], "m");
}

function jacuzzi(item: Item): Action | null {
  const n = Number(item.description.match(/capacidade para (\d+)/i)?.[1] ?? 0);
  if (!n) return null;
  const [pmma, steel] = n <= 2 ? [60, 20] : [200, 50];
  return composite(`jacuzzi ${n} pessoas: casco acrílico + bombas (assumido)`, [["pmma", pmma, "kg"], ["steel", steel, "kg"]], "unidade");
}

const RDL_MEP = /^(?:Sistema de climatiza[cç][aã]o - Verba|Interliga[cç][aã]o do Sistema de [aá]gua gelada|El[eé]trica - Verba|Lumin[aá]rias$|Hidr[aá]ulica e Combate a Inc[eê]ndio - Verba|Reservat[oó]rio Modular|Sistemas Eletr[oô]nicos - Verba|Entrada de Energia)/i;

const RDL_MATCHERS: Matcher[] = [
  // 1. Exclusões
  { desc: /\bM\.O\.?\s*$|^M[aã]o de Obra/i, action: exclude(LABOR) },
  {
    desc: /^(?:Seguran[cç]a e Vigil|Telefonia|Equipe De Topografia|Equipe Indireta|Acompanhamento do desenvolvimento|Opera[cç][aã]o de sistema|Materiais de Consumo|Limpeza Final|Gabarito para obra|Abertura de v[aã]o|Perfura[cç][aã]o da laje|Arrasamento|Chumbamento|Demoli[cç][aã]o e Abertura de lajes|Acabamento (?:la[jz]e|Laje)|Polimento de laje|Limpeza e Regulariza|Limpeza, Regulariza)/i,
    action: exclude(SERVICE),
  },
  {
    desc: /^(?:Contrata[cç][aã]o De Seguro|Documenta[cç][aã]o|Mobiliza[cç][aã]o|Desmobiliza[cç][aã]o|Diversos Esteira|Execu[cç][aã]o de Furo|Serventia|QSM$|Monitoramento|Controle Tecnol|Prova de Carga|C[oó]pias|As built|ATO -|Laudos|Consultorias|ART |Aprova[cç][aã]o|Taxas|Licen[cç]as|Apoio civil|Opera[cç][aã]o em locais|Execu[cç][aã]o de eventuais reparos|Prote[cç][oõ]es diversas|Remo[cç][aã]o Final De Entulho)/i,
    action: exclude(SERVICE),
  },
  {
    desc: /^(?:Tapume|Prote[cç][aã]o de Piso|Canteiro|Outros Custos Do Canteiro|Sinaliza[cç][aã]o|Rede Provis[oó]ria|Sistema de andaime|Escoramento met[aá]lico de lajes|Execu[cç][aã]o de Barreira Provis|Sistema de troca de ar|Instala[cç][aã]o de bomba submersa|Equipamentos para Execu[cç][aã]o de Fachada|Complemento de forma e cimbramento)/i,
    action: exclude(TEMPORARY),
  },
  ...["2.08.02.06.01.04", "2.08.02.06.01.05", "2.08.02.06.01.15"].map((code) => ({
    code,
    action: exclude("Combustível dos equipamentos da estaca raiz já contabilizado no item Diesel 2.08.02.06.01.20"),
  })),
  { code: "2.08.02.06.01.06", action: exclude("Volume da argamassa = cimento, areia e água já listados (2.08.02.06.01.07–.09)") },
  {
    code: "2.08.03.07.01.19",
    action: exclude(
      "Preço do escopo já quantificado em kg/m² (2.08.03.07.01.15–.18). Pendência: proteção passiva com argamassa projetada não tem quantitativo."
    ),
  },

  {
    desc: /^Fechamento superior caixilhos/i,
    action: () => ({ kind: "skip", reason: "material do fechamento não especificado — revisar" }),
  },

  // 2. Equipamentos (A5)
  { code: "2.13.03.13.03.01", action: () => ({ kind: "equipment", name: "Grua com lança móvel", fuel: "electric", consumption: 25 }) },
  { code: "2.13.03.13.03.02", action: () => ({ kind: "equipment", name: "Elevador de obra", fuel: "electric", consumption: 8 }) },
  { code: "2.13.03.13.03.03", action: () => ({ kind: "equipment", name: "Mini escavadeira", fuel: "diesel", consumption: 5 }) },
  { code: "2.08.02.02.01.01", action: () => ({ kind: "equipment", name: "Esteira transportadora", fuel: "electric", consumption: 11 }) },

  // 3. Estimativas
  {
    desc: RDL_MEP,
    unit: "vb",
    action: (item, ctx) => {
      if (!(item.total_cost > 0) || !(item.quantity > 0)) return null;
      const poolCost = ctx.mepPool.reduce((s, i) => s + i.total_cost, 0);
      const share = item.total_cost / poolCost;
      const kg = MEP_KGCO2E_PER_M2 * ctx.gfa * share;
      return {
        kind: "estimate",
        label: "instalações (benchmark por m²)",
        kgPerUnit: kg / item.quantity,
        basis:
          `${MEP_KGCO2E_PER_M2} kgCO₂e/m² × ${ctx.gfa.toLocaleString("pt-BR")} m² (área da Limpeza Final) × ${(share * 100).toFixed(1)}% ` +
          `do custo das verbas de instalações. Faixa publicada 40–110 kgCO₂e/m² (CLF/UW; Atelier Ten/CIBSE TM65).`,
      };
    },
  },
  {
    desc: /^Elevadores Torre Comercial - (\d+) unidades/i,
    action: (item) => {
      const n = Number(item.description.match(/(\d+) unidades/i)?.[1] ?? 0);
      if (!(n > 0) || !(item.total_cost > 0)) return null;
      return {
        kind: "estimate",
        label: `${n} elevadores`,
        kgPerUnit: (n * ELEVATOR_KGCO2E) / item.quantity,
        basis: `${n} × ${ELEVATOR_KGCO2E / 1000} tCO₂e/elevador (EPDs: Otis Gen2 13,3–18,6 t; Schindler 6000 21,2 t; Schindler 2000 40,3 t).`,
      };
    },
  },
  {
    desc: /^Plataforma PNE/i,
    unit: "vb",
    action: (item) =>
      item.total_cost > 0
        ? { kind: "estimate", label: "plataforma PNE", kgPerUnit: PLATFORM_LIFT_KGCO2E / item.quantity, basis: `${PLATFORM_LIFT_KGCO2E / 1000} tCO₂e/plataforma (premissa ZNIT: ~1 t de aço + acionamento).` }
        : null,
  },
  {
    desc: /^Demoli[cç][aã]o (?:do edif[ií]cio garagem$|da laje de subpress[aã]o|retrofit do shopping|\s*do contrapiso)/i,
    action: (item, ctx) => {
      if (!(item.total_cost > 0)) return null;
      const liters = (item.total_cost * DEMOLITION_FUEL_COST_SHARE) / DIESEL_PRICE_BRL_PER_L;
      return {
        kind: "estimate",
        label: "demolição (diesel pelo custo)",
        kgPerUnit: (liters * ctx.dieselFactor) / item.quantity,
        basis:
          `Diesel ≈ ${DEMOLITION_FUEL_COST_SHARE * 100}% do custo (R$ ${item.total_cost.toLocaleString("pt-BR")}) ÷ R$ ${DIESEL_PRICE_BRL_PER_L.toFixed(2)}/L = ` +
          `${Math.round(liters).toLocaleString("pt-BR")} L × ${ctx.dieselFactor} kgCO₂/L. Demolição pré-obra (A5.1); sem área/volume demolido no orçamento.`,
      };
    },
  },

  // Camada 1 — peças de um só material, massa assumida (conversão manual do item)
  { desc: /^Pergolado PUC - Excluso/i, action: exclude("Escopo excluso no próprio orçamento") },
  { desc: /^Execu[cç][aã]o de Ponteiras/i, action: exclude(TEMPORARY) },
  { desc: /^[AÁ]gua$/i, action: exclude(WATER) },
  part(/^ACM - Revestimento/i, "aluminiumSheet", 2.7, "ACM 4 mm: 2 chapas de alumínio de 0,5 mm = 2,7 kg/m² (núcleo de PE não incluído)"),
  { code: "2.08.03.14.04.02.44", action: () => ({ kind: "factor", factor: F("aluminiumFrame"), massKg: 86 * 8, note: "estrutura da cobertura do átrio: 86 m² × 8 kg/m² de alumínio (vidro contado em 2.08.03.07.02.01)" }) },
  part(/^Degrau Cimentado/i, "mortar", 18, "degrau cimentado: 0,30 m × 3 cm × 2.000 kg/m³ = 18 kg/m"),
  part(/^Rodap[eé] Cimentado/i, "mortar", 4, "rodapé cimentado h=10 cm × 2 cm × 2.000 kg/m³ = 4 kg/m"),
  part(/^Piso ladrilho hidr[aá]ulico/i, "mortar", 40, "ladrilho hidráulico 2 cm × 2.000 kg/m³ = 40 kg/m²"),
  part(/^Tabica met[aá]lica/i, "steel", 0.5, "perfil de aço galvanizado ~0,5 kg/m"),
  part(/^Rufo de arremate/i, "steel", 2, "chapa galvanizada 0,5 mm × ~50 cm de desenvolvimento ≈ 2 kg/m"),
  part(/^EM-\d+ - Escada Marinheiro/i, "steel", 12, "escada marinheiro 1,80 m: ~12 kg de aço"),
  part(/^Barra de apoio/i, "stainless", 1.5, "barra de apoio inox ~1,5 kg/peça"),
  part(/^Barra Antip[aâ]nico/i, "steel", 3, "barra antipânico ~3 kg/peça"),
  part(/^GLH\d+ - Grelha em ferro/i, "steel", 25, "grelha de ferro ~25 kg/m"),
  part(/^Ralo linear/i, "stainless", 2, "ralo linear inox ~2 kg/m (peça avulsa = 1 m)"),
  part(/^Ralo cromado/i, "brass", 0.5, "ralo cromado ~0,5 kg/peça"),
  part(/^Torneira de mesa com fechamento autom/i, "brass", 1.2, "torneira automática ~1,2 kg de latão"),
  part(/^Torneira/i, "brass", 1, "torneira ~1 kg de latão"),
  part(/^Sif[aã]o para (?:lavat|cubas)/i, "brass", 0.6, "sifão metálico cromado ~0,6 kg"),
  part(/^Sif[aã]o para Pia/i, "pvc", 0.3, "sifão de PVC ~0,3 kg"),
  part(/^V[aá]lvula/i, "brass", 0.3, "válvula ~0,3 kg de latão"),
  part(/^Flex[ií]vel$/i, "stainless", 0.15, "flexível trançado inox ~0,15 kg"),
  part(/^Acabamento para registros/i, "brass", 0.3, "acabamento de registro ~0,3 kg de latão"),
  part(/^Chuveiro PCD/i, "brass", 2, "chuveiro com tubo de parede ~2 kg"),
  part(/^Chuveiro/i, "brass", 1, "chuveiro ~1 kg"),
  part(/^Assento para chuveiro/i, "stainless", 3, "assento articulado inox ~3 kg"),
  part(/^Cuba Simples de Inox/i, "stainless", 5, "cuba inox simples ~5 kg"),
  part(/^Cuba Dupla de Inox/i, "stainless", 8, "cuba inox dupla ~8 kg"),
  part(/^Batente para elevador/i, "steel", 25, "batente de aço para porta de elevador ~25 kg"),
  part(/^Areia$/i, "sand", 1500, "areia: 1.500 kg/m³", "m³"),
  part(/^Bolsa PVC/i, "pvc", 0.1, "bolsa de ligação ~0,1 kg de PVC"),
  part(/^Parafuso de Fixa/i, "steel", 0.05, "par de parafusos ~50 g"),
  part(/^Silicone/i, "silicone", 0.3, "tubo de silicone ~300 g"),
  part(/^Demarca[cç][aã]o de vagas/i, "waterPaint", 0.03, "faixa de 10 cm × 0,3 kg/m² de tinta = 0,03 kg/m"),
  part(/^Esmalte S \/ Esq\. Ferro/i, "solventPaint", 0.045, "esmalte em esquadria: ~0,15 m²/m × 0,3 kg/m²", "m"),
  part(/^Fornecimento de Rolete/i, "pvc", 0.03, "espaçador plástico ~30 g"),
  part(/^Ferragens/i, "steel", 2, "kit de ferragens de porta ~2 kg (aço como proxy)"),
  part(/^DIV0[5-7] - Divis[oó]ria em granito/i, "granite", 97.2, "quantidade em unid. tratada como metro linear (como DIV01–04): 1,8 m × 2 cm × 2.700 kg/m³"),

  // Camada 2 — estimativas por composição
  { desc: /^Revestimento a DEFINIR HPL/i, action: () => composite("HPL 8 mm: resina fenólica + fibra (proxy MDF)", [["phenolic", 3.24, "kg"], ["mdf", 0.0101, "m3"]], "m² (HPL ~10,8 kg/m²)") },
  { desc: /^Retirada de material escavado/i, unit: "m³", action: (_i, ctx) => transport(ctx) },
  { desc: /^Revestimento Ripado/i, action: () => composite("ripado de madeira (assumido)", [["plantedTimber", 10, "kg"]], "m² (0,02 m³ × 500 kg/m³)") },
  { desc: /^Montante para fixa[cç][aã]o de batente/i, action: () => composite("montante de aço (assumido)", [["steel", 3, "kg"]], "peça") },
  { desc: /^Madeira tratada em autoclave/i, action: () => composite("reforço de madeira (assumido)", [["plantedTimber", 2, "kg"]], "peça") },
  { desc: /^Pintura Vagas \(Pictogramas\)/i, action: () => composite("pictograma ~1 m² de pintura", [["waterPaint", 0.3, "kg"]], "peça") },
  { desc: /^Execu[cç][aã]o de Canaleta Grouteada/i, action: () => composite("graute + 2 barras Ø10 mm", [["grout", 0.014, "m3"], ["steel", 1.23, "kg"]], "m") },
  { desc: /^Execu[cç][aã]o de JetGrounting/i, action: (item) => jetGrout(item) },
  { desc: /^DV01 - Divis[oó]ria Retr[aá]til/i, action: () => composite("divisória retrátil: aço + MDF (assumido)", [["steel", 15, "kg"], ["mdf", 0.04, "m3"]], "m²") },
  { desc: /^DV02 - Divis[oó]ria [AÁ]rea Manuten/i, action: () => composite("divisória 1+1 placas de gesso (assumido; unid. ≈ m²)", [["drywall", 17, "kg"]], "unidade") },
  { desc: /^BIC\.\d+ - Suporte Biciclet[aá]rio/i, action: (item) => bikes(item) },
  { desc: /^Caixa de embutir em parede/i, action: () => composite("caixa acoplada de embutir em PP (assumido)", [["pp", 5, "kg"]], "peça") },
  { desc: /^Po[cç]o de Elevador -\s+Cristaliza/i, action: () => composite("cristalizante cimentício 1,5 kg/m² (assumido)", [["polymerMortar", 1.5, "kg"]], "m²") },
  { desc: /^Piso t[aá]til/i, action: () => composite("piso tátil de borracha 6 kg/m² (assumido)", [["rubber", 6, "kg"]], "m²") },
  { desc: /^P028 - Capacho/i, action: () => composite("capacho: perfil de alumínio + borracha (assumido)", [["aluminiumSheet", 5, "kg"], ["rubber", 8, "kg"]], "m²") },
  { desc: /^JD\.\d+ - Jardineira/i, action: (item) => planter(item) },
  { desc: /^Stop Fire/i, action: () => composite("selagem corta-fogo: lã de rocha 50 mm (assumido)", [["stoneWool", 5, "kg"]], "m²") },
  { desc: /^Carpete em placa/i, action: () => composite("carpete em placa: nylon + base betuminosa (assumido)", [["nylon", 0.7, "kg"], ["asphalt", 3.5, "kg"]], "m²") },
];

// InVino: verbas de instalações sem preço (orçamento paramétrico) — divisão
// do benchmark por sistema (premissa ZNIT).
const INVINO_MEP_WEIGHTS: Array<[RegExp, number]> = [
  [/^Instala[cç][oõ]es El[eé]tricas/i, 0.25],
  [/^Sistema de Automa[cç][aã]o/i, 0.05],
  [/^Equipamentos de Ar Condicionado/i, 0.3],
  [/^Sistema de Calefa[cç][aã]o/i, 0.08],
  [/^Central de [AÁ]gua Quente/i, 0.07],
  [/^Instala[cç][oõ]es Hidr[aá]ulicas/i, 0.1],
  [/^Instala[cç][oõ]es de Hidrante/i, 0.06],
  [/^ETE$/i, 0.04],
  [/^ETA$/i, 0.03],
  [/^Sistema de [oó]leo Diesel/i, 0.02],
];

function composite(label: string, parts: Array<[FactorKey, number, "kg" | "m3"]>, perWhat: string): Action {
  return { kind: "estimate", label, kgPerUnit: compose(parts), basis: `Composição por ${perWhat}: ${describe(parts)}.` };
}

const GFA = "m² de área construída (a quantidade da linha é a área total, não quantitativo físico)";

const INVINO_MATCHERS: Matcher[] = [
  // 1. Exclusões
  {
    desc: /^(?:Limpeza e preparo do terreno|Gabarito de Obra|Limpeza final|Limpeza de fachada|Prote[cç][aã]o de piso|Equip de Apoio|Polimento do Concreto|Apoio civil para elevadores|Sondagem|Ensaio de solo)/i,
    action: exclude(SERVICE),
  },
  { desc: /^Reaterro manual/i, action: exclude(LABOR) },
  { desc: /^(?:Placas Fotovoltaicas|Sistema Wetland)/i, action: exclude("Escopo opcional (aba Resumo, ESCOPO OPCIONAL) — fora do cenário base") },

  // 3. Estimativas — instalações e transporte vertical
  ...INVINO_MEP_WEIGHTS.map(([desc, weight]) => ({
    desc,
    action: (item: Item, ctx: Ctx): Action => ({
      kind: "estimate",
      label: "instalações (benchmark por m²)",
      kgPerUnit: (MEP_KGCO2E_PER_M2 * ctx.gfa * weight) / item.quantity,
      basis:
        `${MEP_KGCO2E_PER_M2} kgCO₂e/m² × ${ctx.gfa.toLocaleString("pt-BR")} m² (aba Resumo) × ${(weight * 100).toFixed(0)}% ` +
        `(divisão por sistema, premissa ZNIT). Faixa publicada 40–110 kgCO₂e/m² (CLF/UW; Atelier Ten/CIBSE TM65).`,
    }),
  })),
  {
    desc: /^Elevadores e personaliza/i,
    action: () => ({ kind: "estimate", label: "elevador", kgPerUnit: ELEVATOR_KGCO2E, basis: `${ELEVATOR_KGCO2E / 1000} tCO₂e/elevador (EPDs: Otis Gen2 13,3–18,6 t; Schindler 6000 21,2 t; Schindler 2000 40,3 t).` }),
  },
  {
    desc: /^Monta carga/i,
    action: (item) => ({ kind: "estimate", label: "monta-carga", kgPerUnit: GOODS_LIFT_KGCO2E / item.quantity, basis: `${GOODS_LIFT_KGCO2E / 1000} tCO₂e/monta-carga (premissa ZNIT: metade de um elevador de passageiros).` }),
  },
  {
    desc: /^Plataforma PNE/i,
    action: () => ({ kind: "estimate", label: "plataforma PNE", kgPerUnit: PLATFORM_LIFT_KGCO2E, basis: `${PLATFORM_LIFT_KGCO2E / 1000} tCO₂e/plataforma (premissa ZNIT: ~1 t de aço + acionamento).` }),
  },

  // 3. Estimativas — linhas paramétricas por m² de área construída
  { desc: /^Funda[cç][aã]o Rasa - Sapatas/i, action: () => composite("sapatas (paramétrico)", [["concreteGeneric", 0.04, "m3"], ["steel", 3.2, "kg"]], GFA) },
  { desc: /^Estrutura de madeira$/i, action: () => composite("estrutura de madeira (paramétrico)", [["plantedTimber", 10, "kg"]], GFA) },
  { desc: /^Divis[oó]ria de m[aá]rmore/i, action: () => composite("divisória de mármore (paramétrico)", [["marble", 1.62, "kg"]], GFA) },
  { desc: /^Divis[oó]ria sanit[aá]ria/i, action: () => composite("divisória sanitária TS (paramétrico, proxy MDF)", [["mdf", 0.000254, "m3"]], GFA) },
  { desc: /^Revestimento de Teto/i, action: () => composite("forro de gesso + pintura (paramétrico)", [["drywall", 8.5, "kg"], ["waterPaint", 0.3, "kg"]], GFA) },
  { desc: /^Impermeabiliza[cç][aã]o de [AÁ]reas Molhadas/i, action: () => composite("impermeabilização de áreas molhadas (15% da área)", [["polymerMortar", 0.6, "kg"]], GFA) },
  { desc: /^Esquadrias Internas/i, action: () => composite("portas internas (0,05 porta/m²)", [["woodDoor", 1.425, "kg"]], GFA) },
  { desc: /^Serralheria$/i, action: () => composite("serralheria (2 kg aço/m²)", [["steel", 2, "kg"]], GFA) },
  { desc: /^Tampo em Granito/i, action: () => composite("tampos de granito (0,025 m²/m²)", [["granite", 1.35, "kg"]], GFA) },
  { desc: /^Lou[cç]as, Metais/i, action: () => composite("louças e metais (1 banheiro/35 m²)", [["sanitaryWare", 32 / 35, "kg"], ["steel", 5 / 35, "kg"]], GFA) },

  // 3. Estimativas — acabamentos genéricos (material não especificado)
  { desc: /^Revestimento de Piso$/i, action: () => composite("piso: porcelanato + colante + contrapiso (assumido)", [["tile", 23, "kg"], ["tileAdhesive", 5, "kg"], ["mortar", 80, "kg"]], "m² (material assumido)") },
  { desc: /^Revestimento de Paredes - Menor/i, action: () => composite("parede: emboço + pintura (assumido)", [["mortar", 50, "kg"], ["waterPaint", 0.3, "kg"]], "m² (material assumido)") },
  { desc: /^Revestimento de Paredes - Maior/i, action: () => composite("parede: emboço + cerâmica (assumido)", [["mortar", 50, "kg"], ["tile", 18.4, "kg"], ["tileAdhesive", 5, "kg"]], "m² (material assumido)") },
  { desc: /^Fechamento em alvenaria, vidro, drywall, etc - Menor/i, action: () => composite("vedação: drywall 2+2 placas + montantes (assumido)", [["drywall", 34, "kg"], ["steel", 3, "kg"]], "m² (material assumido)") },
  { desc: /^Fechamento em alvenaria, vidro, drywall, etc - Maior/i, action: () => composite("vedação: bloco de concreto 14 cm + emboço 2 faces (assumido)", [["concreteBlock", 126, "kg"], ["mortar", 100, "kg"]], "m² (material assumido)") },
  { desc: /^(?:Piso de Concreto 0,00|Laje de Piso - sem acabamento|Piso de concreto sobre solo)/i, action: () => composite("piso de concreto 10 cm + tela (assumido)", [["concrete25", 0.1, "m3"], ["steel", 2, "kg"]], "m² (espessura assumida)") },
  { desc: /^Cobertura em Estrutura Met[aá]lica/i, action: () => composite("estrutura metálica de cobertura 25 kg/m² (assumido)", [["structuralSteel", 25, "kg"]], "m² (taxa assumida)") },
  { desc: /^Marcenaria/i, unit: "m²", action: () => composite("marcenaria em MDF 8 mm/m² (assumido)", [["mdf", 0.008, "m3"]], "m² (taxa assumida)") },
  { desc: /^Marcenaria/i, unit: "un", action: () => composite("marcenaria por unidade 0,4 m³ MDF (assumido)", [["mdf", 0.4, "m3"]], "unidade (taxa assumida)") },
  { desc: /^Impermeabiliza[cç][aã]o de Piscina/i, action: () => composite("argamassa polimérica 4 kg/m² (assumido)", [["polymerMortar", 4, "kg"]], "m² (sistema assumido)") },
  { desc: /^Impermeabiliza[cç][aã]o$/i, action: () => composite("manta asfáltica 4 mm (assumido)", [["asphaltMembrane", 4.6, "kg"]], "m² (sistema assumido)") },

  // Camadas 1 e 2 — cobertura residual
  { desc: /^Fornecimento e plantio/i, action: exclude("Paisagismo vegetal (biogênico) — fora da fronteira A1–A3") },
  part(/^Equipamentos para limpeza de fachada - Olhal/i, "stainless", 1, "olhal de ancoragem inox ~1 kg"),
  { desc: /^Pergolado de Madeira/i, action: () => composite("pergolado de madeira 0,03 m³/m² (assumido)", [["plantedTimber", 15, "kg"]], "m²") },
  { desc: /^Guarda corpo de madeira - H=/i, action: (item) => woodRail(item) },
  { desc: /^Deck Suspenso/i, action: () => composite("deck de madeira + apoios de aço (assumido)", [["plantedTimber", 15, "kg"], ["steel", 5, "kg"]], "m²") },
  { desc: /^Revestimento Piso - Concreto Polido/i, action: () => composite("capa de concreto 5 cm (assumido)", [["concrete25", 0.05, "m3"]], "m²") },
  { desc: /^Estacionamento Hotel/i, action: () => composite("pavimento intertravado 8 cm (assumido, como as demais áreas externas)", [["concreteBlock", 184, "kg"]], "m²") },
  { desc: /^Remo[cç][aã]o para bota-fora/i, unit: "m³", action: (_i, ctx) => transport(ctx) },
  { desc: /^Divis[oó]ria retr[aá]til/i, action: () => composite("divisória retrátil: aço + MDF (assumido)", [["steel", 15, "kg"], ["mdf", 0.04, "m3"]], "m²") },
  { desc: /^Passarelas Elevadas Met[aá]lica/i, action: () => composite("passarela metálica 80 kg/m² (assumido)", [["structuralSteel", 80, "kg"]], "m²") },
  { desc: /^Jacuzzi com capacidade para/i, action: (item) => jacuzzi(item) },
  { desc: /^Guarda-corpo - H=0,90m e Guias/i, action: () => composite("guarda-corpo metálico 8 kg/m (assumido)", [["steel", 8, "kg"]], "m") },
  { desc: /^Sauna$/i, action: () => composite("sauna: cabine de madeira + aquecedor (assumido)", [["plantedTimber", 300, "kg"], ["steel", 20, "kg"]], "unidade") },
  { desc: /^Equipamento da piscina/i, action: () => composite("bombas e filtros (assumido)", [["steel", 100, "kg"], ["hdpe", 50, "kg"]], "conjunto") },
  { desc: /^Heliponto/i, action: () => composite("laje de concreto 15 cm + armadura (assumido)", [["concrete25", 0.15, "m3"], ["steel", 12, "kg"]], "m²") },
  { desc: /^Caixa elevador panor[aâ]mico/i, action: () => composite("vidro laminado 16 mm + estrutura de aço (assumido)", [["temperedGlass", 40, "kg"], ["steel", 15, "kg"]], "m²") },
  { desc: /^Telhado verde/i, action: () => composite("substrato 10 cm + drenagem PEAD (impermeabilização contada à parte)", [["gravel", 100, "kg"], ["hdpe", 1.5, "kg"]], "m²") },

  // 4. Terraplenagem → ecoinvent por m³
  { desc: /^(?:Escava[cç][aã]o de solo|Reaterro mec[aâ]nico)/i, unit: "m³", action: () => ({ kind: "factor", factor: eco.get("excavation")!, note: "Terraplenagem mecanizada (escavadeira hidráulica) por m³." }) },
];

// 5. Regras de fator do Grupo HTB — palavra-chave (sem acento) → fator.
const HTB_RULES: Array<[string, CecKey | EcoKey]> = [
  ["massa unica", "mortar"],
  ["emboco", "mortar"],
  ["reboco", "mortar"],
  ["chapisco", "mortar"],
  ["contrapiso", "mortar"],
  ["porcelanato", "tile"],
  ["revestimento ceramico", "tile"],
  ["piso ceramico", "tile"],
  ["marmore", "marble"],
  ["travertino", "marble"],
  ["granito", "granite"],
  // Sem "drywall": a palavra costuma vir depois do material real
  // ("Pintura ... sobre Gesso/Drywall"); paredes DW-xx caem na família.
  ["gesso acartonado", "drywall"],
  ["steel deck", "steel"],
  ["alvenaria de bloco", "concreteBlock"],
  ["bloco de concreto celular", "aac"],
  ["vidro", "floatGlass"],
  ["temperado", "temperedGlass"],
  ["pele de vidro", "aluminiumFrame"],
  ["caixilho de aluminio", "aluminiumFrame"],
  ["requadro", "aluminiumFrame"],
  ["brise", "aluminiumFrame"],
  ["manta asfaltica", "asphaltMembrane"],
  ["argamassa polimerica", "polymerMortar"],
  ["textura", "waterPaint"],
  ["massa texturizada", "waterPaint"],
  ["pintura", "waterPaint"],
  ["intertravado", "concreteBlock"],
  ["corrimao", "steel"],
];

function ruleFactor(key: CecKey | EcoKey): Factor {
  return key in CEC ? F(key as CecKey) : eco.get(key as EcoKey)!;
}

// 6. Família da receita → fator do mesmo material.
function familyFactor(family: RecipeFamily, desc: string): Factor | null {
  const d = normalizeKeyword(desc);
  switch (family) {
    case "aluminium_frame": return F("aluminiumFrame");
    case "wood_door": return F("woodDoor");
    case "steel_door": return F("steelDoor");
    case "masonry_concrete": return F("concreteBlock");
    case "masonry_ceramic": return F("ceramicBlock");
    case "masonry_aac": return eco.get("aac")!;
    case "stone": return /granito/.test(d) ? F("granite") : /marmore|travertino/.test(d) ? F("marble") : F("naturalStone");
    case "tile": return F("tile");
    case "mortar": return F("mortar");
    case "polymer_mortar": return F("polymerMortar");
    case "paint": return F("waterPaint");
    case "solvent_paint": return F("solventPaint");
    case "gypsum_board": return F("drywall");
    case "steel_deck":
    case "steel":
    case "steel_form": return F("steel");
    case "glass": return /temperad|laminad/.test(d) ? F("temperedGlass") : F("floatGlass");
    case "asphalt_membrane": return F("asphaltMembrane");
    case "concrete_paver": return F("concreteBlock");
    case "sanitary_ware": return F("sanitaryWare");
    case "plywood": return F("plywood");
    default: return null;
  }
}

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------

async function fetchItems(curveId: string): Promise<Item[]> {
  const { data, error } = await supabase
    .from("abc_items")
    .select("id, cost_code, description, unit, quantity, total_cost, item_type, mapping_status")
    .eq("abc_curve_id", curveId);
  if (error) throw new Error(`items: ${error.message}`);
  return (data ?? []) as Item[];
}

async function fetchMappings(itemIds: string[]): Promise<Map<string, Record<string, unknown>>> {
  const out = new Map<string, Record<string, unknown>>();
  for (const chunk of chunkArray(itemIds, 100)) {
    const { data, error } = await supabase.from("item_mappings").select("*").in("abc_item_id", chunk);
    if (error) throw new Error(`mappings: ${error.message}`);
    for (const m of data ?? []) out.set(m.abc_item_id as string, m);
  }
  return out;
}

/** Mapeamento pode ser substituído pela curadoria? (ausente ou sugestão não revisada) */
function replaceable(m: Record<string, unknown> | undefined): boolean {
  if (!m) return true;
  if (m.mapped_by === "curadoria") return true;
  // Curadoria anterior gravada com o id do usuário (antes do marcador "curadoria").
  if (typeof m.notes === "string" && m.notes.startsWith("Curadoria ZNIT") && !["auto", "rule", "user_custom", "excluded"].includes(String(m.mapped_by))) return true;
  return m.mapped_by === "auto" && (m.confidence === "low" || m.confidence === "medium");
}

function matchRule(desc: string, rules: Array<{ keyword: string }>): string | null {
  const d = normalizeKeyword(desc);
  const ordered = [...rules].sort((a, b) => b.keyword.length - a.keyword.length || a.keyword.localeCompare(b.keyword));
  return ordered.find((r) => d.includes(r.keyword))?.keyword ?? null;
}

function unitKey(unit: string): string {
  return unit.trim();
}

async function upsertFactorRules(userId: string) {
  for (const [keyword, key] of HTB_RULES) {
    const f = ruleFactor(key);
    const payload = {
      factor_value: f.factor_value,
      factor_unit: f.factor_unit,
      factor_name: f.factor_name,
      source_tier: f.source_tier,
      source_description: `${f.factor_source} — regra curada ZNIT para o Grupo HTB (${TODAY})`,
      ecoinvent_product_id: f.ecoinvent_product_id ?? null,
      cecarbon_id: f.cecarbon_id ?? null,
    };
    const { data: existing } = await supabase
      .from("factor_rules")
      .select("id")
      .eq("company_id", COMPANY_ID)
      .eq("match_keyword", keyword)
      .eq("is_active", true)
      .maybeSingle();
    if (existing) {
      const { error } = await supabase.from("factor_rules").update(payload).eq("id", existing.id);
      if (error) throw new Error(`rule ${keyword}: ${error.message}`);
    } else {
      const { error } = await supabase.from("factor_rules").insert({
        ...payload,
        company_id: COMPANY_ID,
        match_keyword: keyword,
        original_description: keyword,
        created_by: userId,
        is_active: true,
      });
      if (error) throw new Error(`rule ${keyword}: ${error.message}`);
    }
  }
}

async function upsertEquipmentRule(name: string, fuel: "diesel" | "electric", consumption: number, ef: { value: number; unit: string; source: string }) {
  const keyword = normalizeKeyword(name);
  const payload = {
    category: name.toLowerCase(),
    fuel_type: fuel,
    consumption_per_hour: consumption,
    consumption_unit: fuel === "electric" ? "kWh/h" : "L/h",
    emission_factor_value: ef.value,
    emission_factor_unit: ef.unit,
    emission_factor_source: ef.source,
    emission_factor_tier: "ghg_protocol",
    scope: fuel === "electric" ? 2 : 1,
    productivity_index: EQUIPMENT_HOURS_PER_MONTH,
    notes: `Curadoria ZNIT (${TODAY}): ${consumption} ${fuel === "electric" ? "kWh/h" : "L/h"} × ${EQUIPMENT_HOURS_PER_MONTH} h/mês (8 h × 22 dias). Revisar.`,
  };
  const { data: existing } = await supabase
    .from("equipment_rules")
    .select("id")
    .eq("company_id", COMPANY_ID)
    .eq("match_keyword", keyword)
    .eq("is_active", true)
    .maybeSingle();
  if (existing) {
    const { error } = await supabase.from("equipment_rules").update(payload).eq("id", existing.id);
    if (error) throw new Error(`equipment rule ${name}: ${error.message}`);
  } else {
    const { error } = await supabase
      .from("equipment_rules")
      .insert({ ...payload, company_id: COMPANY_ID, match_keyword: keyword, original_description: name, created_by: "system" });
    if (error) throw new Error(`equipment rule ${name}: ${error.message}`);
  }
}

interface Planned {
  item: Item;
  action: Action;
  mapping: Record<string, unknown> | null; // linha de item_mappings a gravar (null = exclusão)
  status: string;
}

function mappingFromFactor(itemId: string, f: Factor, mappedBy: string, confidence: string, notes: string): Record<string, unknown> {
  return {
    abc_item_id: itemId,
    source_tier: f.source_tier,
    ecoinvent_product_id: f.ecoinvent_product_id ?? null,
    ecoinvent_activity_id: f.ecoinvent_activity_id ?? null,
    factor_value: f.factor_value,
    factor_unit: f.factor_unit,
    product_unit: f.product_unit,
    factor_name: f.factor_name,
    factor_source: f.factor_source,
    factor_version: f.factor_version,
    confidence,
    mapped_by: mappedBy,
    notes,
  };
}

function plan(item: Item, action: Action, ctx: Ctx, userId: string): Planned {
  switch (action.kind) {
    case "skip":
      throw new Error(`plan() chamado para item ignorado: ${item.cost_code}`);
    case "exclude":
      return { item, action, mapping: null, status: "excluded" };
    case "equipment": {
      const ef = action.fuel === "electric" ? ELECTRIC_FACTOR.value : ctx.dieselFactor;
      const value = EQUIPMENT_HOURS_PER_MONTH * action.consumption * ef;
      const unit = action.fuel === "electric" ? "kWh/h" : "L/h";
      return {
        item,
        action,
        status: "manual",
        mapping: {
          abc_item_id: item.id,
          source_tier: "ghg_protocol",
          factor_value: value,
          factor_unit: `kgCO₂/${unitKey(item.unit)}`,
          product_unit: unitKey(item.unit),
          factor_name: `${action.name} (${action.consumption} ${unit} × ${EQUIPMENT_HOURS_PER_MONTH} h/mês × ${ef} kgCO₂/${action.fuel === "electric" ? "kWh" : "L"})`,
          factor_source: `Regra de equipamento Grupo HTB — ${action.fuel === "electric" ? ELECTRIC_FACTOR.source : "diesel (fator canônico)"}`,
          confidence: "medium",
          mapped_by: "curadoria",
          notes: `Curadoria ZNIT (${TODAY}): consumo e horas de operação assumidos — revisar com o plano de equipamentos.`,
        },
      };
    }
    case "estimate":
      return {
        item,
        action,
        status: "manual",
        mapping: {
          abc_item_id: item.id,
          source_tier: "user_custom",
          factor_value: action.kgPerUnit,
          factor_unit: `kgCO₂e/${unitKey(item.unit)}`,
          product_unit: unitKey(item.unit),
          factor_name: `ESTIMATIVA — ${action.label}`,
          factor_source: "Estimativa ZNIT (provisória)",
          custom_factor_source: `${DISCLAIMER} Método: ${action.basis}`,
          confidence: "low",
          mapped_by: "user_custom",
          notes: `${DISCLAIMER} Método: ${action.basis}`,
        },
      };
    case "factor": {
      const mapping = mappingFromFactor(item.id, action.factor, "curadoria", "medium", `Curadoria ZNIT (${TODAY}): ${action.note}`);
      if (action.massKg != null) {
        // Massa por unidade do item → conversão manual (editável no item).
        const toFactor = getConversionFactor("kg", action.factor.factor_unit);
        if (!(toFactor > 0)) throw new Error(`${item.cost_code}: fator ${action.factor.factor_unit} não é por massa`);
        mapping.manual_conversion_factor = action.massKg * toFactor;
        mapping.manual_conversion_note = `${action.note} (revisar)`;
      }
      return { item, action, status: "manual", mapping };
    }
    case "rule": {
      const key = HTB_RULES.find(([k]) => k === action.keyword)![1];
      const f = ruleFactor(key);
      return { item, action, status: "auto", mapping: mappingFromFactor(item.id, f, "rule", "high", `Regra do Grupo HTB "${action.keyword}"`) };
    }
    case "family":
      return {
        item,
        action,
        status: "manual",
        mapping: mappingFromFactor(item.id, action.factor, "curadoria", "medium", `Curadoria ZNIT (${TODAY}): fator pelo material da receita (${action.family}).`),
      };
  }
}

function expectedKg(p: Planned): number {
  if (!p.mapping) return 0;
  const conv = resolveConversion(
    p.item.description,
    p.item.unit,
    p.mapping.factor_unit as string,
    { conversionFactor: (p.mapping.manual_conversion_factor as number | undefined) ?? null },
    p.mapping.factor_name as string
  );
  return (p.item.quantity ?? 0) * (p.mapping.factor_value as number) * conv;
}

async function curate(projectId: string, matchers: Matcher[], userId: string, ctxBase: Omit<Ctx, "gfa" | "mepPool">) {
  const { data: curve } = await supabase.from("abc_curves").select("id").eq("project_id", projectId).single();
  if (!curve) throw new Error(`${projectId}: curva não encontrada — rode a cópia antes`);
  const items = await fetchItems(curve.id as string);
  const mappings = await fetchMappings(items.map((i) => i.id));

  let gfa = INVINO_GFA_M2;
  if (projectId === RDL) {
    const cleaning = items.find((i) => i.cost_code === RDL_GFA_COST_CODE);
    if (!cleaning) throw new Error("RDL: item de Limpeza Final (área) não encontrado");
    gfa = cleaning.quantity;
  }
  const ctx: Ctx = { ...ctxBase, gfa, mepPool: items.filter((i) => RDL_MEP.test(i.description) && i.unit === "vb" && i.total_cost > 0) };

  const { data: rules } = await supabase.from("factor_rules").select("match_keyword").eq("company_id", COMPANY_ID).eq("is_active", true);
  const ruleList = [...new Set([...(rules ?? []).map((r) => r.match_keyword as string), ...HTB_RULES.map(([k]) => k)])].map((keyword) => ({ keyword }));
  const curatedRule = new Set(HTB_RULES.map(([k]) => k));

  const planned: Planned[] = [];
  const warnings: string[] = [];
  for (const item of items) {
    const m = mappings.get(item.id);
    // Exclusão já existente (ex.: mão de obra de concreto da cópia) — mantida.
    if (item.mapping_status === "excluded") continue;
    let action: Action | null = null;
    for (const matcher of matchers) {
      if (matcher.code && matcher.code !== item.cost_code) continue;
      if (matcher.desc && !matcher.desc.test(item.description.trim())) continue;
      if (matcher.unit && unitKey(matcher.unit) !== unitKey(item.unit) && !(matcher.unit === "un" && /^un/.test(item.unit))) continue;
      action = matcher.action(item, ctx);
      if (action) break;
    }
    // Estimativa/exclusão/equipamento/fator explícito valem sobre qualquer
    // sugestão; regra e família só sobre mapeamento ausente ou não revisado.
    if (!action && item.mapping_status !== "blocked" && replaceable(m)) {
      const kw = matchRule(item.description, ruleList);
      if (kw && curatedRule.has(kw)) {
        action = { kind: "rule", keyword: kw };
        const recipe = geometricRecipe(item.description, item.unit);
        const fam = recipe?.family ? familyFactor(recipe.family, item.description) : null;
        const rf = ruleFactor(HTB_RULES.find(([k]) => k === kw)![1]);
        if (fam && fam.factor_name !== rf.factor_name) {
          warnings.push(`${item.cost_code} "${item.description.slice(0, 50)}": regra "${kw}" → ${rf.factor_name}, receita ${recipe?.family} → ${fam.factor_name}`);
        }
      } else {
        const recipe = geometricRecipe(item.description, item.unit);
        const f = recipe?.family ? familyFactor(recipe.family, item.description) : null;
        if (recipe?.family && f) action = { kind: "family", family: recipe.family, factor: f };
      }
    }
    if (!action || action.kind === "skip") continue;
    // Estimativa/equipamento/fator explícito não sobrescrevem mapeamento
    // revisado (re-execução: a estimativa anterior, user_custom, é refeita).
    const curatedKind = action.kind === "estimate" || action.kind === "equipment" || action.kind === "factor";
    if (curatedKind && !replaceable(m) && m?.mapped_by !== "user_custom" && m?.mapped_by !== "rule") continue;
    planned.push(plan(item, action, ctx, userId));
  }

  // Resumo
  console.log(`\n=== ${projectId} — área usada: ${gfa.toLocaleString("pt-BR")} m²`);
  const byKind: Record<string, { n: number; kg: number }> = {};
  for (const p of planned) {
    const k = p.action.kind;
    byKind[k] ??= { n: 0, kg: 0 };
    byKind[k].n++;
    byKind[k].kg += expectedKg(p);
  }
  for (const [k, v] of Object.entries(byKind)) console.log(`  ${k.padEnd(10)} ${String(v.n).padStart(4)} itens  ${(v.kg / 1000).toFixed(1).padStart(9)} tCO₂e`);
  for (const w of warnings) console.log(`  ⚠ ${w}`);
  if (DRY_RUN) {
    for (const p of planned.sort((a, b) => a.item.cost_code.localeCompare(b.item.cost_code))) {
      const a = p.action;
      const what =
        a.kind === "exclude" ? `EXCLUI: ${a.reason.slice(0, 70)}` :
        a.kind === "rule" ? `REGRA "${a.keyword}" → ${p.mapping!.factor_name}` :
        a.kind === "family" ? `FAMÍLIA ${a.family} → ${p.mapping!.factor_name}` :
        a.kind === "estimate" ? `ESTIMATIVA ${a.label}` :
        a.kind === "equipment" ? `EQUIPAMENTO ${a.name}` : `FATOR ${p.mapping!.factor_name}`;
      console.log(`    ${p.item.cost_code.padEnd(20)} ${p.item.description.slice(0, 48).padEnd(48)} ${String(Number(p.item.quantity.toFixed(1))).padStart(9)} ${p.item.unit.padEnd(5)} | ${what} | ${(expectedKg(p) / 1000).toFixed(2)} t`);
    }
    return;
  }

  // Grava: regras/equipamentos primeiro, depois os itens.
  const seenEquip = new Set<string>();
  for (const p of planned) {
    if (p.action.kind === "equipment" && !seenEquip.has(p.action.name)) {
      seenEquip.add(p.action.name);
      const ef = p.action.fuel === "electric" ? ELECTRIC_FACTOR : { value: ctx.dieselFactor, unit: "kgCO₂/L", source: "diesel (fator canônico)" };
      await upsertEquipmentRule(p.action.name, p.action.fuel, p.action.consumption, ef);
    }
  }
  for (const chunk of chunkArray(planned, 100)) {
    const { error } = await supabase.from("item_mappings").delete().in("abc_item_id", chunk.map((p) => p.item.id));
    if (error) throw new Error(`delete mappings: ${error.message}`);
  }
  const rows = planned.map((p) =>
    p.mapping ?? {
      abc_item_id: p.item.id,
      source_tier: "excluded",
      factor_value: 0.0,
      factor_unit: "kg CO2-Eq",
      factor_name: "Excluído",
      mapped_by: "excluded",
      exclusion_justification: (p.action as { reason: string }).reason,
    }
  );
  for (const chunk of chunkArray(rows, 50)) {
    const { error } = await supabase.from("item_mappings").insert(chunk);
    if (error) throw new Error(`insert mappings: ${error.message}`);
  }
  for (const status of ["excluded", "manual", "auto"]) {
    const ids = planned.filter((p) => p.status === status).map((p) => p.item.id);
    for (const chunk of chunkArray(ids, 100)) {
      const { error } = await supabase.from("abc_items").update({ mapping_status: status }).in("id", chunk);
      if (error) throw new Error(`update status: ${error.message}`);
    }
  }

  // Sugestões low não revisadas que as receitas novas fariam somar → pendentes.
  const after = await fetchMappings(items.map((i) => i.id));
  const byId = new Map(items.map((i) => [i.id, i]));
  const revert: string[] = [];
  for (const [itemId, m] of after) {
    if (m.mapped_by !== "auto" || m.confidence !== "low") continue;
    const it = byId.get(itemId)!;
    const conv = resolveConversion(it.description, it.unit, m.factor_unit as string, { unitOverride: m.unit_override as string | null, conversionFactor: m.manual_conversion_factor as number | null }, m.factor_name as string);
    if ((m.factor_value as number) > 0 && conv > 0) revert.push(itemId);
  }
  for (const chunk of chunkArray(revert, 100)) {
    await supabase.from("item_mappings").delete().in("abc_item_id", chunk);
    await supabase.from("abc_items").update({ mapping_status: "pending" }).in("id", chunk);
  }
  console.log(`  ${planned.length} itens curados; ${revert.length} sugestões low não revisadas revertidas`);

  const { error: areaErr } = await supabase.from("projects").update({ total_area_m2: gfa }).eq("id", projectId);
  if (areaErr) throw new Error(`area: ${areaErr.message}`);

  const { data: base } = await supabase.from("scenarios").select("id, name").eq("project_id", projectId).eq("is_base", true).maybeSingle();
  if (base) await supabase.from("scenarios").delete().eq("id", base.id);
  const { scenario } = await createBaseScenario(projectId, userId, {
    abcCurveId: curve.id as string,
    scenarioName: (base?.name as string) ?? "Cenário Base",
    isBase: true,
  });
  const { data: res } = await supabase
    .from("scenario_results")
    .select("total_tco2e, items_total, items_mapped, items_excluded, coverage_pct, intensity_per_m2")
    .eq("scenario_id", (scenario as { id: string }).id)
    .single();
  if (res) {
    console.log(
      `  RESULTADO: ${res.total_tco2e?.toFixed(1)} tCO₂e | cobertura ${res.coverage_pct}% (${res.items_mapped}/${res.items_total - res.items_excluded}) | ` +
      `${res.intensity_per_m2 ? (res.intensity_per_m2 * 1000).toFixed(0) : "–"} kgCO₂e/m²`
    );
  }
}

async function main() {
  const { data: user } = await supabase.from("users").select("id").eq("company_id", COMPANY_ID).eq("email", USER_EMAIL).single();
  if (!user) throw new Error(`Usuário ${USER_EMAIL} não encontrado no Grupo HTB`);
  for (const pid of [RDL, INVINO]) {
    const { data: p } = await supabase.from("projects").select("company_id").eq("id", pid).single();
    if (p?.company_id !== COMPANY_ID) throw new Error(`${pid} não pertence ao Grupo HTB`);
  }
  await loadFactors();
  const diesel = (await getFuelFactors()).diesel;
  const truck = (await getTransportFactors()).truck;
  console.log(`${DRY_RUN ? "[DRY-RUN] " : ""}Curadoria Grupo HTB — diesel ${diesel.value} ${diesel.unit}`);
  if (!DRY_RUN) await upsertFactorRules(user.id);
  await curate(RDL, RDL_MATCHERS, user.id, { dieselFactor: diesel.value, truckFactor: truck.value });
  await curate(INVINO, INVINO_MATCHERS, user.id, { dieselFactor: diesel.value, truckFactor: truck.value });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
