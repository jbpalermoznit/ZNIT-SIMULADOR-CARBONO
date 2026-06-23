/**
 * Serviço de mapeamento automático de itens ABC → fatores de emissão.
 *
 * Hierarquia de auto-match: Factor Rules → GHG Protocol → CECarbon → Ecoinvent.
 *
 * EPDs **não entram no auto-match**. EPDs são específicas de
 * fornecedor/produto e devem ser escolhidas explicitamente pelo analista
 * como **substituição** do fator genérico inicial — via busca manual no
 * editor de fator (searchEmissionFactors) ou através de uma Factor Rule
 * curada pela empresa.
 *
 * Busca via Supabase externo. Usa fuzzball para ranking de similaridade.
 */

import * as fuzz from "fuzzball";
import {
  searchEcoinvent,
  searchGhg,
  searchCecarbon,
} from "@/lib/server/supabase-emission";
import { getConversionFactor } from "@/lib/server/calculator";

// ---------------------------------------------------------------------------
// Acentuação
// ---------------------------------------------------------------------------
// As descrições do orçamento iTwo vêm em CAIXA ALTA e SEM acento
// ("ACO CA-50", "OLEO DIESEL", "COMBUSTIVEL PARA VEICULOS"), enquanto as
// chaves dos dicionários de busca abaixo usam a grafia acentuada ("aço",
// "óleo", "combustível", "alumínio", "escavação"). Sem normalizar acentos
// no lado da BUSCA, esses materiais nunca casavam e ficavam "não
// encontrados" — derrubando o total para ~60% do simulador antigo.
//
// A normalização é feita apenas no LOOKUP (chaves dos dicionários e
// comparação de keywords); os tokens retornados por extractKeywords
// preservam a grafia original para não quebrar contratos existentes.

export function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// ---------------------------------------------------------------------------
// Tradução PT→EN e queries compostas para Ecoinvent
// ---------------------------------------------------------------------------

const SEARCH_QUERIES: Record<string, string[]> = {
  // Concreto
  concreto: ["concrete"],
  "fck=25": ["concrete 25MPa", "25MPa"],
  "fck=30": ["concrete 30MPa", "30MPa"],
  "fck=35": ["concrete 35MPa", "35MPa"],
  "fck=40": ["concrete 40MPa", "40MPa"],
  "fck=45": ["concrete 45MPa", "45MPa"],
  fck25: ["concrete 25MPa"],
  fck30: ["concrete 30MPa"],
  fck35: ["concrete 35MPa"],
  fck40: ["concrete 40MPa"],
  bombeado: ["concrete"],
  usinado: ["concrete"],
  mrtf: ["concrete"],
  // Aço e metais ferrosos
  "aço": ["reinforcing steel", "steel"],
  "vergalhão": ["reinforcing steel"],
  armadura: ["reinforcing steel"],
  ca50: ["reinforcing steel"],
  ca60: ["reinforcing steel"],
  ca25: ["reinforcing steel"],
  "tela soldada": ["welded mesh"],
  "treliça": ["steel", "reinforcing steel"],
  barra: ["steel bar", "reinforcing steel"],
  "chapa metálica": ["steel sheet", "steel plate"],
  xadrez: ["steel plate"],
  arame: ["steel wire", "wire"],
  prego: ["steel nail", "nail"],
  eletrodo: ["welding electrode", "electrode"],
  chumbador: ["steel anchor", "anchor bolt"],
  ancoragem: ["anchor", "chemical anchor"],
  parafuso: ["bolt", "screw"],
  porca: ["steel nut"],
  luva: ["steel coupling"],
  "tampão": ["cast iron", "manhole cover"],
  fofo: ["cast iron"],
  distanciador: ["spacer", "reinforcing steel"],
  // Aço protendido / Dywidag
  dw: ["prestressing steel"],
  dywidag: ["prestressing steel"],
  "protensão": ["prestressing steel"],
  estaca: ["concrete pile", "steel pile"],
  // Cimento e argamassa
  cimento: ["cement", "portland cement"],
  cimentcola: ["tile adhesive", "cement"],
  argamassa: ["morite", "cement morite"],
  chapisco: ["mortar", "rendering mortar"],
  rejunte: ["grout", "tile grout"],
  sikagrout: ["grout"],
  grout: ["grout"],
  // Madeira
  madeira: ["sawn wood", "wood"],
  compensado: ["plywood"],
  "chapa compensada": ["plywood"],
  "tábua": ["sawn timber", "sawn wood"],
  sarrafo: ["sawn timber", "sawn wood"],
  batente: ["wood door frame", "sawn wood"],
  "batentaço": ["wood door frame", "sawn wood"],
  // Alvenaria e cerâmica
  bloco: ["concrete block"],
  tijolo: ["brick"],
  telha: ["roof tile"],
  porcelanato: ["ceramic tile", "porcelain tile"],
  "cerâmica": ["ceramic tile"],
  "rodapé": ["ceramic tile"],
  chapim: ["precast concrete"],
  // Agregados
  areia: ["sand"],
  brita: ["gravel"],
  pedra: ["gravel", "crusite stone"],
  // Metais não ferrosos
  "alumínio": ["aluminium"],
  cobre: ["copper"],
  zinco: ["zinc"],
  // Plásticos e isolantes
  pvc: ["pvc pipe", "polyvinyl chloride"],
  polietileno: ["polyethylene"],
  tubo: ["pipe"],
  lona: ["polyethylene film", "plastic film"],
  bidim: ["geotextile", "polypropylene"],
  "geotêxtil": ["geotextile"],
  isopor: ["polystyrene", "expanded polystyrene"],
  eps: ["expanded polystyrene"],
  // Selantes, adesivos e químicos
  selante: ["sealant", "silicone"],
  sikaflex: ["sealant", "polyurethane sealant"],
  silicone: ["silicone sealant"],
  aditivo: ["concrete admixture"],
  sika1: ["concrete admixture", "waterproofing admixture"],
  impermeabilizante: ["bitumen", "waterproofing"],
  fugenband: ["waterstop", "pvc waterstop"],
  "hidro expansivo": ["waterstop", "hydrophilic waterstop"],
  // Outros materiais
  tinta: ["paint", "alkyd paint"],
  neutrol: ["bitumen paint", "waterproofing paint"],
  desmol: ["release agent"],
  vidro: ["flat glass"],
  asfalto: ["asphalt"],
  isolamento: ["insulation"],
  gesso: ["gypsum", "plasterboard"],
  manta: ["bitumen sheet"],
  colante: ["tile adhesive"],
  // Solo / Movimentação
  "escavação": ["excavation"],
  terraplenagem: ["excavation"],
  // Combustíveis
  diesel: ["diesel"],
  "óleodiesel": ["diesel"],
  "combustível": ["diesel"],
  gasolina: ["gasoline"],
};

// Versão normalizada (sem acento) das chaves — usada no lookup porque as
// descrições do orçamento chegam sem acentuação. Ver nota em stripAccents.
const SEARCH_QUERIES_NORM: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(SEARCH_QUERIES)) {
    const nk = stripAccents(k);
    out[nk] = [...(out[nk] ?? []), ...v];
  }
  return out;
})();

// Normalização de nomes compostos escritos junto
const COMPOUND_FIXES: Record<string, string> = {
  "óleodiesel": "óleo diesel",
  cimentcola: "cimento cola",
  chapiscofix: "chapisco fix",
};

// Categorias GHG — se a descrição contém essas palavras, buscar no GHG
const GHG_TRIGGER_WORDS = new Set([
  "diesel",
  "gasolina",
  "combustível",
  "glp",
  "gás",
  "etanol",
  "biodiesel",
  "gnv",
  "carvão",
  "lenha",
  "biomassa",
  "óleodiesel",
  "óleo",
]);

// Versão sem acento — comparada contra keywords também sem acento.
const GHG_TRIGGER_WORDS_NORM = new Set(
  [...GHG_TRIGGER_WORDS].map((w) => stripAccents(w))
);

// Palavras ignoradas
const STOPWORDS = new Set([
  "de",
  "do",
  "da",
  "dos",
  "das",
  "em",
  "e",
  "para",
  "por",
  "com",
  "sem",
  "ou",
  "um",
  "uma",
  "no",
  "na",
  "ao",
  "à",
  "o",
  "a",
  "os",
  "as",
  "ser",
  "estar",
  "ter",
  "haver",
  "ir",
  "vir",
  "inclusive",
  "conforme",
  "segundo",
  "tipo",
  "ref",
  "und",
]);

// ---------------------------------------------------------------------------
// Simple Portuguese stemming
// ---------------------------------------------------------------------------

function stemPt(word: string): string {
  // Plural → singular
  if (word.endsWith("ões")) return word.slice(0, -3) + "ão";
  if (word.endsWith("ães")) return word.slice(0, -3) + "ão";
  if (word.endsWith("ais")) return word.slice(0, -2) + "al";
  if (word.endsWith("éis")) return word.slice(0, -3) + "el";
  if (word.endsWith("ores")) return word.slice(0, -2); // chumbadores → chumbador
  if (word.endsWith("es") && word.length > 4) {
    return "rszl".includes(word[word.length - 3])
      ? word.slice(0, -2)
      : word.slice(0, -1);
  }
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

// ---------------------------------------------------------------------------
// Keyword extraction
// ---------------------------------------------------------------------------

export function extractKeywords(description: string): string[] {
  let text = description.toLowerCase().trim();
  // Normalizar fck
  text = text.replace(/fck\s*=?\s*(\d+)/g, "fck=$1");
  text = text.replace(/mrtf\s*=?\s*[\d,]+/g, "mrtf");
  // Normalizar palavras escritas junto
  text = text.replace(/[oó]l[eé]o\s*diesel/g, "óleo diesel");
  // "COMBUSTIVEL PARA VEICULOS E EQUIPAMENTOS" não tem fator próprio na base;
  // o simulador antigo o trata como combustão de diesel. Injetamos o token
  // "diesel" para que a busca GHG (combustíveis) o alcance.
  text = text.replace(/combust[ií]vel/g, "combustível diesel");
  for (const [wrong, fixed] of Object.entries(COMPOUND_FIXES)) {
    text = text.replaceAll(wrong, fixed);
  }
  const words = text.split(/[\s/\-,;:()+]+/);
  const keywords: string[] = [];
  for (let w of words) {
    w = w.replace(/^[.,;:()]+|[.,;:()]+$/g, "");
    if (w.length < 2 || STOPWORDS.has(w)) continue;
    const stemmed = stemPt(w);
    keywords.push(stemmed);
    // Also keep original if different
    if (stemmed !== w && !keywords.includes(w)) {
      keywords.push(w);
    }
  }
  // Reagrupar a bitola do aço: o splitter fragmenta "CA-50" em "ca" + "50".
  // Emitimos também o token unido (ca50/ca60/ca25) que as tabelas de busca
  // reconhecem como aço/vergalhão — sem isso, armaduras, parabolts e
  // guarda-corpos em aço não casavam com nenhum fator.
  for (const m of text.matchAll(/\bca[\s-]?(\d{2})\b/g)) {
    const tok = "ca" + m[1];
    if (!keywords.includes(tok)) keywords.push(tok);
  }
  return keywords;
}

// ---------------------------------------------------------------------------
// Build search queries
// ---------------------------------------------------------------------------

function buildSearchQueries(
  keywords: string[]
): { queries: string[]; shouldGhg: boolean } {
  const queries: string[] = [];
  let shouldGhg = false;

  const joinedNorm = stripAccents(keywords.join(" "));
  for (const kw of keywords) {
    const nkw = stripAccents(kw);
    if (GHG_TRIGGER_WORDS_NORM.has(nkw)) shouldGhg = true;
    if (nkw in SEARCH_QUERIES_NORM) {
      queries.push(...SEARCH_QUERIES_NORM[nkw]);
    }
    // Check multi-word matches
    for (const [trigger, qList] of Object.entries(SEARCH_QUERIES_NORM)) {
      if (trigger.includes(" ") && joinedNorm.includes(trigger)) {
        queries.push(...qList);
      }
    }
  }

  // Deduplicate preserving order
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const q of queries) {
    if (!seen.has(q)) {
      seen.add(q);
      unique.push(q);
    }
  }

  // Fallback: raw keywords
  if (unique.length === 0) {
    unique.push(
      ...keywords
        .filter((kw) => kw.length > 3)
        .slice(0, 3)
    );
    shouldGhg = true;
  }

  return { queries: unique, shouldGhg };
}

// ---------------------------------------------------------------------------
// CECarbon queries
// ---------------------------------------------------------------------------

const CECARBON_QUERIES: Record<string, string[]> = {
  concreto: ["concreto"],
  "fck=25": ["concreto 25"],
  "fck=30": ["concreto 30"],
  "fck=35": ["concreto 35"],
  "fck=40": ["concreto 40"],
  fck25: ["concreto 25"],
  fck30: ["concreto 30"],
  fck35: ["concreto 35"],
  fck40: ["concreto 40"],
  bombeado: ["concreto"],
  usinado: ["concreto"],
  graute: ["graute"],
  "aço": ["aço"],
  "vergalhão": ["aço"],
  armadura: ["aço"],
  ca50: ["aço"],
  ca60: ["aço"],
  "treliça": ["estrutura metálica", "aço"],
  "chapa metálica": ["estrutura metálica"],
  xadrez: ["estrutura metálica"],
  arame: ["arame de aço"],
  prego: ["prego de aço"],
  eletrodo: ["aço"],
  chumbador: ["aço", "prego de aço"],
  ancoragem: ["aço"],
  parafuso: ["aço"],
  porca: ["aço"],
  distanciador: ["aço"],
  "tampão": ["aço"],
  luva: ["aço"],
  placa: ["aço"],
  barra: ["aço"],
  "alumínio": ["alumínio", "esquadrias de alumínio"],
  cimento: ["cimento"],
  cimentcola: ["argamassa colante"],
  argamassa: ["argamassa"],
  chapisco: ["argamassa"],
  rejunte: ["argamassa"],
  colante: ["argamassa colante"],
  grout: ["graute"],
  sikagrout: ["graute"],
  madeira: ["madeira"],
  compensado: ["compensado de madeira"],
  "chapa compensada": ["compensado de madeira"],
  "tábua": ["madeira bruta serrada"],
  sarrafo: ["madeira bruta serrada"],
  batente: ["esquadrias de madeira"],
  "batentaço": ["esquadrias de madeira"],
  mdf: ["mdf"],
  bloco: ["bloco de concreto", "bloco cerâmico"],
  tijolo: ["tijolo", "bloco cerâmico"],
  telha: ["telha"],
  porcelanato: ["revestimentos cerâmicos"],
  "cerâmica": ["revestimentos cerâmicos", "cerâmica"],
  chapim: ["concreto"],
  areia: ["areia"],
  brita: ["brita"],
  pedra: ["brita", "rocha natural"],
  isopor: ["placa de espuma de poliestireno"],
  eps: ["placa de espuma de poliestireno"],
  manta: ["manta asfáltica"],
  "lã": ["lã de rocha", "lã de vidro"],
  impermeabilizante: ["manta asfáltica"],
  vidro: ["vidro"],
  tinta: ["tinta"],
  gesso: ["gesso"],
  "dry wall": ["dry wall"],
  drywall: ["dry wall"],
  pvc: ["pvc", "esquadrias de pvc"],
  tubo: ["tubo"],
  eletroduto: ["eletroduto de pvc"],
  cal: ["cal"],
  asfalto: ["asfalto"],
  granito: ["granito"],
  "mármore": ["mármore"],
  selante: [],
  sikaflex: [],
  bidim: [],
  lona: [],
  diesel: ["óleo diesel"],
  "combustível": ["óleo diesel"],
  gasolina: ["gasolina"],
  "óleo": ["óleos lubrificantes"],
};

// Versão normalizada (sem acento) das chaves — ver nota em stripAccents.
const CECARBON_QUERIES_NORM: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(CECARBON_QUERIES)) {
    const nk = stripAccents(k);
    out[nk] = [...(out[nk] ?? []), ...v];
  }
  return out;
})();

function buildCecarbonQueries(keywords: string[]): string[] {
  const queries: string[] = [];
  for (const kw of keywords) {
    const nkw = stripAccents(kw);
    if (nkw in CECARBON_QUERIES_NORM) {
      queries.push(...CECARBON_QUERIES_NORM[nkw]);
    }
  }
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const q of queries) {
    if (!seen.has(q)) {
      seen.add(q);
      unique.push(q);
    }
  }
  if (unique.length === 0) {
    unique.push(
      ...keywords
        .filter((kw) => kw.length > 3)
        .slice(0, 3)
    );
  }
  return unique;
}

// ---------------------------------------------------------------------------
// Scoring functions
// ---------------------------------------------------------------------------

function scoreEcoinvent(
  itemDesc: string,
  row: Record<string, unknown>,
  searchQueries?: string[]
): number {
  const descLower = itemDesc.toLowerCase();
  const productName = ((row.product_name as string) ?? "").toLowerCase();
  const productNamePt = ((row.product_name_pt as string) ?? "").toLowerCase();
  const candidates = [
    productName,
    productNamePt,
    ((row.activity_name as string) ?? "").toLowerCase(),
    ((row.activity_name_pt as string) ?? "").toLowerCase(),
  ];

  let best = 0;
  for (const c of candidates) {
    if (!c) continue;
    const s1 = fuzz.token_set_ratio(descLower, c);
    const s2 = fuzz.partial_ratio(descLower, c);
    best = Math.max(best, s1, s2);
  }

  // Boost: if any search query is a direct substring of product_name
  if (searchQueries) {
    for (const q of searchQueries) {
      const qLower = q.toLowerCase();
      if (productName.includes(qLower) || productNamePt.includes(qLower)) {
        best = Math.max(best, 82);
        break;
      }
    }
  }

  return Math.min(best, 100);
}

function scoreGhg(
  itemDesc: string,
  row: Record<string, unknown>,
  searchQueries?: string[]
): number {
  const produto = ((row.produto as string) ?? "").toLowerCase();
  const descLower = itemDesc.toLowerCase();
  const s1 = fuzz.token_set_ratio(descLower, produto);
  const s2 = fuzz.partial_ratio(descLower, produto);
  let best = Math.max(s1, s2);

  if (searchQueries) {
    for (const q of searchQueries) {
      if (produto.includes(q.toLowerCase())) {
        best = Math.max(best, 85);
        break;
      }
    }
  }

  return Math.min(best, 100);
}

function scoreCecarbon(
  itemDesc: string,
  row: Record<string, unknown>,
  searchQueries?: string[]
): number {
  const descCecarbon = (
    (row["Descrição fator de emissao"] as string) ?? ""
  ).toLowerCase();
  const descLower = itemDesc.toLowerCase();

  const s1 = fuzz.token_set_ratio(descLower, descCecarbon);
  const s2 = fuzz.partial_ratio(descLower, descCecarbon);
  let best = Math.max(s1, s2);

  if (searchQueries) {
    for (const q of searchQueries) {
      if (descCecarbon.includes(q.toLowerCase())) {
        best = Math.max(best, 82);
        break;
      }
    }
  }

  // Extra boost for exact category matches
  const descWords = new Set(
    descLower.split(/[\s/\-,;:()+]+/).filter((w) => w.length > 0)
  );
  const cecarbonWords = new Set(
    descCecarbon.split(/[\s/\-,;:()+]+/).filter((w) => w.length > 0)
  );
  const overlap = new Set(
    [...descWords].filter((w) => cecarbonWords.has(w) && !STOPWORDS.has(w))
  );
  if (overlap.size >= 1) best = Math.max(best, 78);
  if (overlap.size >= 2) best = Math.max(best, 85);

  return Math.min(best, 100);
}

// ---------------------------------------------------------------------------
// Candidate interface
// ---------------------------------------------------------------------------

export interface MatchCandidate {
  source_tier: string;
  score: number;
  factor_value: number;
  factor_unit: string;
  product_unit: string;
  factor_name: string;
  factor_source: string;
  geography: string;
  ecoinvent_product_id?: string;
  ecoinvent_activity_id?: string;
  ghg_factor_id?: number;
  cecarbon_id?: number;
  epd_id?: number;
  epd_registration?: string;
  company_name?: string;
  density?: number;
  rule_id?: string;
  confidence?: string;
  _unit_incompatible?: boolean;
}

export interface AutoMatchResult {
  results: MatchCandidate[];
  best: MatchCandidate | null;
  confidence: "high" | "medium" | "low" | null;
}

// ---------------------------------------------------------------------------
// Auto-match item
// ---------------------------------------------------------------------------

export async function autoMatchItem(
  description: string,
  unit?: string | null,
  companyId?: string | null
): Promise<AutoMatchResult> {
  // Priority 0: Factor Rules — company-specific overrides
  if (companyId) {
    const { supabase } = await import("@/lib/server/supabase");
    const descNorm = description
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    const { data: rules } = await supabase
      .from("factor_rules")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_active", true);

    if (rules && rules.length > 0) {
      for (const rule of rules) {
        const keyword = String(rule.match_keyword ?? "").toLowerCase();
        if (keyword && descNorm.includes(keyword)) {
          // Direct match via rule — highest priority
          const candidate: MatchCandidate = {
            source_tier: rule.source_tier ?? "rule",
            score: 100,
            factor_value: rule.factor_value,
            factor_unit: rule.factor_unit,
            product_unit: rule.factor_unit?.replace(/^kgCO₂e?\//, "") ?? "",
            factor_name: rule.factor_name,
            factor_source: rule.source_description ?? "Factor Rule",
            geography: "Brasil",
          };
          // Increment times_applied
          await supabase
            .from("factor_rules")
            .update({ times_applied: (rule.times_applied ?? 0) + 1 })
            .eq("id", rule.id);

          return {
            results: [candidate],
            best: candidate,
            confidence: "high",
          };
        }
      }
    }
  }

  const keywords = extractKeywords(description);
  const { queries: ecoinventQueries, shouldGhg } =
    buildSearchQueries(keywords);
  const cecarbonQueries = buildCecarbonQueries(keywords);

  const allCandidates: MatchCandidate[] = [];

  // ---------------------------------------------------------------
  // Tier 1: GHG Protocol (combustíveis e transporte — fonte BR)
  // ---------------------------------------------------------------
  if (shouldGhg) {
    for (const kw of keywords.slice(0, 3)) {
      try {
        const rows = await searchGhg(kw, 5);
        for (const row of rows) {
          const score = scoreGhg(description, row, ecoinventQueries);
          const co2 = parseFloat(String(row.co2 ?? 0));
          const ch4 = parseFloat(String(row.ch4 ?? 0));
          const n2o = parseFloat(String(row.n2o ?? 0));
          const co2e = co2 + ch4 * 28 + n2o * 265;
          allCandidates.push({
            source_tier: "ghg_protocol",
            score,
            factor_value: Math.round(co2e * 1000000) / 1000000,
            factor_unit: "kgCO2e",
            product_unit: "",
            factor_name: (row.produto as string) ?? "",
            factor_source: `GHG Protocol BR ${row.versao_ghg ?? ""}`,
            geography: (row.pais as string) ?? "Brasil",
            ghg_factor_id: row.id as number,
          });
        }
      } catch {
        continue;
      }
    }
  }

  // ---------------------------------------------------------------
  // Tier 2: CECarbon (materiais de construção — fonte BR, PT-BR)
  // ---------------------------------------------------------------
  for (const q of cecarbonQueries.slice(0, 6)) {
    try {
      const rows = await searchCecarbon(q, 10);
      for (const row of rows) {
        const score = scoreCecarbon(description, row, cecarbonQueries);
        let factorValue = row["fator de emissão (kgCO2)"];
        if (factorValue == null) factorValue = 0;
        factorValue = parseFloat(String(factorValue));
        const unitCecarbon = ((row.Unidade as string) ?? "").trim();
        const descFactor =
          (row["Descrição fator de emissao"] as string) ?? "";
        const ref = (row.Referencia as string) ?? "CECARBON 2024";
        const density = row.densidade ?? 1;
        allCandidates.push({
          source_tier: "cecarbon",
          score,
          factor_value: factorValue,
          factor_unit: `kgCO₂/${unitCecarbon}`,
          product_unit: unitCecarbon,
          factor_name: descFactor,
          factor_source: ref,
          geography: "Brasil",
          cecarbon_id: row.id as number,
          density: density ? parseFloat(String(density)) : 1.0,
        });
      }
    } catch {
      continue;
    }
  }

  // ---------------------------------------------------------------
  // Tier 3: Ecoinvent (global, EN — fallback)
  // ---------------------------------------------------------------
  // Note: EPDs are intentionally NOT auto-selected (see file header).
  // The analyst picks an EPD via the manual factor editor to *substitute*
  // the generic factor when a specific supplier is known.
  // ---------------------------------------------------------------
  for (const q of ecoinventQueries.slice(0, 6)) {
    try {
      const rows = await searchEcoinvent(q, 15);
      for (const row of rows) {
        const score = scoreEcoinvent(description, row, ecoinventQueries);
        const impact = row.impact_score ?? "0";
        allCandidates.push({
          source_tier: "ecoinvent",
          score,
          factor_value: impact ? parseFloat(String(impact)) : 0.0,
          factor_unit: (row.impact_unit as string) ?? "kg CO2-Eq",
          product_unit: (row.product_unit as string) ?? "",
          factor_name: (row.product_name as string) ?? "",
          factor_source: `Ecoinvent — ${(row.activity_name as string) ?? ""}`,
          geography: (row.geography as string) ?? "",
          ecoinvent_product_id: row.product_id as string,
          ecoinvent_activity_id: row.activity_id as string,
        });
      }
    } catch {
      continue;
    }
  }

  // ---------------------------------------------------------------
  // Dedup, filter, rank
  // ---------------------------------------------------------------
  const seen = new Set<string>();
  let unique: MatchCandidate[] = [];
  for (const c of allCandidates) {
    const key = [
      c.source_tier,
      c.ecoinvent_product_id ??
        c.ghg_factor_id?.toString() ??
        c.cecarbon_id?.toString() ??
        c.epd_id?.toString() ??
        c.factor_name,
      c.ecoinvent_activity_id ?? "",
    ].join("|");
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(c);
    }
  }

  // Filter out zero-value factors
  unique = unique.filter((c) => c.factor_value > 0);

  // Filter out infrastructure-scale factors
  unique = unique.filter(
    (c) =>
      !(
        (c.product_unit ?? "").toLowerCase() === "unit" &&
        c.factor_value > 10000
      )
  );

  // Filter out disabled CECarbon entries (prefixed with *)
  unique = unique.filter(
    (c) =>
      !(c.source_tier === "cecarbon" && c.factor_name.startsWith("*"))
  );

  // Filter out zero-description / placeholder rows
  unique = unique.filter(
    (c) => c.factor_name && c.factor_name !== "0"
  );

  // Penalize waste/by-product results
  const wasteIndicators = [
    "waste",
    "bottom ash",
    "mswi",
    "wastewater",
    "sludge",
    "scrap",
  ];
  const descLower = description.toLowerCase();
  const hasWasteKeyword = ["resíduo", "lixo", "sucata", "efluente"].some(
    (w) => descLower.includes(w)
  );
  if (!hasWasteKeyword) {
    for (const c of unique) {
      const name = (c.factor_name ?? "").toLowerCase();
      if (wasteIndicators.some((w) => name.includes(w))) {
        c.score = Math.max(0, c.score - 30);
      }
    }
  }

  // Tier priority bonus — EPDs are not in the auto-match pool (see file
  // header); a Factor Rule may still return source_tier='epd' when the
  // analyst curated one, in which case we let it win.
  const TIER_BONUS: Record<string, number> = {
    rule: 10,
    epd: 5,
    ghg_protocol: 3,
    cecarbon: 2,
    ecoinvent: 0,
  };
  for (const c of unique) {
    c.score += TIER_BONUS[c.source_tier] ?? 0;
  }

  // For fuel/transport items, extra boost for GHG
  if (shouldGhg) {
    for (const c of unique) {
      if (c.source_tier === "ghg_protocol" && c.score >= 80) {
        c.score += 5;
      }
    }
  }

  // ---------------------------------------------------------------
  // Unit compatibility: penalize candidates with incompatible units
  // ---------------------------------------------------------------
  if (unit) {
    for (const c of unique) {
      const factorUnit = c.factor_unit ?? "";
      const conv = getConversionFactor(unit, factorUnit);
      if (conv === 0.0) {
        c.score = Math.max(0, c.score - 50);
        c._unit_incompatible = true;
      } else if (conv !== 1.0) {
        c.score += 1;
      }
    }
  }

  // Sort by score descending
  unique.sort((a, b) => b.score - a.score);

  // Determine best and confidence
  const best = unique.length > 0 ? unique[0] : null;
  let confidence: "high" | "medium" | "low" | null = null;
  if (best) {
    if (best.score >= 80) confidence = "high";
    else if (best.score >= 60) confidence = "medium";
    else confidence = "low";
  }

  return {
    results: unique.slice(0, 10),
    best,
    confidence,
  };
}

// ---------------------------------------------------------------------------
// Enriched auto-match — runs autoMatchItem against the primary description
// plus each assembly description, plus an optional canonical (catalog)
// description, and returns whichever attempt produced the strongest match.
// Optional supplier (e.g. "GERDAU", "POLIMIX") boosts EPD candidates whose
// company_name matches.
// ---------------------------------------------------------------------------

export interface EnrichedMatchInput {
  description: string;
  unit?: string | null;
  companyId?: string | null;
  /** Canonical description from the iTwo Cost Code catalog, if available. */
  canonicalDescription?: string | null;
  /** Assembly descriptions from the Relatório Proof. */
  assemblyDescriptions?: string[];
  /** Supplier name from the ABC (e.g. "GERDAU"). */
  supplier?: string | null;
}

export interface EnrichedMatchResult extends AutoMatchResult {
  /** Which query string produced the best match. */
  matched_via: "description" | "canonical" | "assembly" | null;
  /** Index into assemblyDescriptions when matched_via === "assembly". */
  matched_assembly_index?: number;
}

export async function autoMatchEnriched(
  input: EnrichedMatchInput
): Promise<EnrichedMatchResult> {
  const attempts: Array<{
    via: "description" | "canonical" | "assembly";
    text: string;
    assemblyIndex?: number;
  }> = [{ via: "description", text: input.description }];

  if (input.canonicalDescription && input.canonicalDescription !== input.description) {
    attempts.push({ via: "canonical", text: input.canonicalDescription });
  }

  for (let i = 0; i < (input.assemblyDescriptions ?? []).length; i++) {
    const desc = input.assemblyDescriptions![i];
    if (desc) attempts.push({ via: "assembly", text: desc, assemblyIndex: i });
  }

  let bestResult: AutoMatchResult | null = null;
  let bestVia: EnrichedMatchResult["matched_via"] = null;
  let bestAssemblyIndex: number | undefined;

  for (const attempt of attempts) {
    const result = await autoMatchItem(attempt.text, input.unit, input.companyId);
    if (!result.best) continue;

    // Supplier boost: when the supplier name appears in the candidate's
    // factor_source / factor_name (case-insensitive), bump its score so an
    // EPD/factor tied to that fabricator wins over a generic one. The boost
    // is conservative (+10) to avoid flipping low-quality matches.
    if (input.supplier && result.best) {
      const supplier = input.supplier.toLowerCase().trim();
      for (const cand of result.results) {
        const haystack = `${cand.factor_source ?? ""} ${cand.factor_name ?? ""}`.toLowerCase();
        if (supplier && supplier.length >= 3 && haystack.includes(supplier)) {
          cand.score = Math.min(100, cand.score + 10);
        }
      }
      result.results.sort((a, b) => b.score - a.score);
      result.best = result.results[0] ?? null;
      if (result.best) {
        if (result.best.score >= 80) result.confidence = "high";
        else if (result.best.score >= 60) result.confidence = "medium";
        else result.confidence = "low";
      }
    }

    if (!bestResult || (result.best && result.best.score > (bestResult.best?.score ?? 0))) {
      bestResult = result;
      bestVia = attempt.via;
      bestAssemblyIndex = attempt.assemblyIndex;
    }
  }

  if (!bestResult) {
    return { results: [], best: null, confidence: null, matched_via: null };
  }
  return {
    ...bestResult,
    matched_via: bestVia,
    matched_assembly_index: bestAssemblyIndex,
  };
}
