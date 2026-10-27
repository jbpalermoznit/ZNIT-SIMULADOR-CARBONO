/**
 * Receitas de cobertura — conversões geométricas / por densidade.
 *
 * Problema (PLANO_CONTINUACAO §5): alguns itens são medidos numa unidade que
 * NÃO converte diretamente para a unidade do fator de emissão — concreto de
 * piso em m² mas fator por m³; pontalete em m mas fator por t. O
 * `getConversionFactor` devolve 0 para esses pares cross-family e o item acaba
 * emitindo 0, subestimando o cenário.
 *
 * Isto NÃO é match: o fator correto já foi escolhido. Aqui derivamos QUANTO
 * material (massa ou volume) o item representa, para o fator poder ser
 * aplicado. A receita converte a quantidade do item para uma unidade-base
 * física (`kg` ou `m3`); o chamador (`resolveConversion` no calculator)
 * compõe com `getConversionFactor` para chegar à unidade exata do fator.
 *
 * Filosofia (igual à Fase 0 do plano — "revisar valores antes"):
 *  - Só dispara para descrições reconhecidas; caso contrário retorna null e
 *    NADA muda no resto do pipeline.
 *  - Onde possível, o número vem da PRÓPRIA descrição (espessura "15CM",
 *    seção "7,5x7,5") — não de palpite.
 *  - Constantes físicas (densidades) são padrões documentados e devem ser
 *    revistas antes de confiar no total absoluto.
 */

/** Material a que a massa/volume derivada se refere — o fator mapeado deve
 *  ser desse mesmo material (ver scripts de curadoria que mapeiam por família). */
export type RecipeFamily =
  | "concrete"
  | "wood"
  | "cast_iron"
  | "steel_form"
  | "steel"
  | "cement"
  | "masonry_concrete"
  | "masonry_ceramic"
  | "masonry_aac"
  | "stone"
  | "tile"
  | "mortar"
  | "polymer_mortar"
  | "paint"
  | "solvent_paint"
  | "gypsum_board"
  | "steel_deck"
  | "glass"
  | "aluminium_frame"
  | "wood_door"
  | "steel_door"
  | "asphalt_membrane"
  | "concrete_paver"
  | "sanitary_ware"
  | "plywood";

export interface GeometricRecipe {
  /** Unidade-base física para a qual a quantidade do item é convertida. */
  baseUnit: "kg" | "m3";
  /** Multiplicador: qty_item (na unidade do item) × multiplier = qty em baseUnit. */
  multiplier: number;
  /** Densidade (kg/m³) do material quando baseUnit = m3 — permite compor com
   *  fator por massa (kgCO₂/t ou /kg) além de fator por volume. */
  densityKgM3?: number;
  /** Material da massa/volume derivada. */
  family?: RecipeFamily;
  /** Receitas originais (concreto, madeira, FoFo, forma metálica, saco):
   *  compõem com a unidade-base sem checar o material do fator — mantém o
   *  comportamento anterior. As demais só se aplicam quando o nome do fator é
   *  do mesmo material (ver recipeMatchesFactor). */
  legacy?: boolean;
  /** Explicação curta da derivação (auditoria/log). */
  note: string;
}

// Termos (sem acento, minúsculos) que identificam o material no NOME do fator.
// Sem isto, uma sugestão errada que antes zerava por unidade (ex.: "caixilho
// de alumínio" × fator de lã de vidro) passaria a somar a massa de alumínio
// vezes o fator de outro material.
const FACTOR_TERMS: Record<RecipeFamily, RegExp> = {
  concrete: /concret|cimento|cement|graute|grout/,
  wood: /madeira|wood|timber|pinus|eucalipt/,
  cast_iron: /ferro fundido|cast iron|fofo/,
  steel_form: /\baco\b|steel|metal/,
  steel: /\baco\b|steel|ferro|iron|metal|inox|stainless/,
  cement: /cimento|cement|argamassa|mortar|\bcal\b|lime/,
  masonry_concrete: /concret|bloco|block|cement/,
  masonry_ceramic: /ceramic|bloco|brick|tijolo|clay/,
  masonry_aac: /aerated|celular|autoclav|aac|bloco|block/,
  stone: /marmore|granit|rocha|pedra|stone|marble|limestone|travertin|ardosia|slate|quartzit/,
  tile: /ceramic|porcelan|azulejo|\btile|gres/,
  mortar: /argamassa|mortar|reboco|emboco|chapisco|plaster|render|cimento|cement/,
  polymer_mortar: /argamassa|mortar|polimer/,
  paint: /tinta|paint|textur|esmalte|enamel|verniz|varnish|lacquer|coating/,
  solvent_paint: /tinta|paint|esmalte|enamel|verniz|varnish|lacquer|coating/,
  gypsum_board: /gesso|gypsum|dry ?wall|plasterboard/,
  steel_deck: /\baco\b|steel|metal/,
  glass: /vidro|glass/,
  aluminium_frame: /alumin/,
  wood_door: /madeira|wood|timber|mdf|compensad/,
  steel_door: /\baco\b|steel|ferro|iron|metal/,
  asphalt_membrane: /manta|asfalt|bitum|membrane/,
  concrete_paver: /concret|bloco|block|paver|intertravad|cement/,
  sanitary_ware: /louca|sanit|ceramic|porcelain|vitreous/,
  plywood: /compensad|plywood|madeira|wood/,
};

// Isolantes "de vidro/rocha" não são vidro/pedra.
const NOT_GLASS_FACTOR = /\b(?:la|fibra|feltro) de (?:vidro|rocha)\b|glass ?wool|glass fib|stone ?wool|rock ?wool/;

/** O fator mapeado é do mesmo material que a receita derivou? */
export function recipeMatchesFactor(
  recipe: GeometricRecipe,
  factorName: string | null | undefined
): boolean {
  if (!recipe.family || !factorName) return false;
  const name = norm(factorName);
  if ((recipe.family === "glass" || recipe.family === "stone") && NOT_GLASS_FACTOR.test(name)) return false;
  return FACTOR_TERMS[recipe.family].test(name);
}

// Densidade de madeira serrada de construção (pinus/eucalipto). Padrão de
// primeira-passada — varia ~500 (pinus) a ~700 (eucalipto). Revisar.
const WOOD_DENSITY_KG_M3 = 600;

// Densidade de concreto (estrutural/pré-moldado) para converter itens medidos
// em m³ que casaram um fator por massa (kgCO₂/t ou /kg). Concreto simples
// ~2400, armado ~2500 kg/m³; usamos 2400 (conservador). Revisar. Premissa: o
// fator casado é de concreto/massa — se um fator de aço for casado por engano,
// revisar (mesma filosofia das demais densidades deste módulo).
const CONCRETE_DENSITY_KG_M3 = 2400;

// Massa padrão do saco de cimento Portland no Brasil (NBR) = 50 kg. Usada
// quando o item está em "sc" e a descrição não traz a massa explícita.
const CEMENT_BAG_KG = 50;

// ⚠️ CONSTANTES DE PRODUTO — primeira-passada, REVISAR antes de confiar no
// total (igual à Fase 0). Valores típicos de mercado; ajuste com a ficha real.

// Massa por m² de tampa/grelha de canaleta em ferro fundido (uso leve/médio).
// Faixa real ~50–120 kg/m² conforme classe (B125/C250). Densidade do FoFo é
// ~7200 kg/m³, mas a peça é vazada (grelha), então a massa areal << placa cheia.
const CAST_IRON_AREAL_MASS_KG_M2 = 85;

// Forma metálica (ex.: QUICKJET): massa de aço por m² do painel. ~30–50 kg/m².
const STEEL_FORM_AREAL_MASS_KG_M2 = 40;
// Reutilizações da forma — a emissão embutida do aço é AMORTIZADA pelo nº de
// usos (a forma serve N vezes). Vida típica de forma metálica ~50–200 usos;
// 50 é conservador (mais emissão/uso). Política de produto — revisar.
const STEEL_FORM_REUSES = 50;

// Forma de chapa compensada (18 mm), amortizada pelos reaproveitamentos
// típicos em obra (~3–5 usos). Revisar.
const PLYWOOD_FORM_THICKNESS_M = 0.018;
const PLYWOOD_FORM_REUSES = 4;

// Alvenaria de bloco vazado: fração sólida do bloco × densidade do material.
// Concreto 14x19x39 (~10 kg, 12,5 un/m²) ≈ 0,45 × 2000 → ~126 kg/m² em 14 cm;
// cerâmico ≈ 0,40 × 1800; concreto celular (AAC) é maciço ≈ 550 kg/m³.
// Espessura-padrão quando a descrição não traz: 14 cm. Revisar.
const MASONRY = {
  masonry_concrete: { solidFraction: 0.45, densityKgM3: 2000 },
  masonry_ceramic: { solidFraction: 0.4, densityKgM3: 1800 },
  masonry_aac: { solidFraction: 1.0, densityKgM3: 550 },
} as const;
const MASONRY_DEFAULT_THICKNESS_M = 0.14;

// Rocha ornamental (mármore/granito ~2600–2800 kg/m³). Espessura-padrão:
// 2 cm em piso/parede/bancada, 3 cm em fachada. Revisar.
const STONE_DENSITY_KG_M3 = 2700;
const STONE_DEFAULT_THICKNESS_M = 0.02;
const STONE_FACADE_THICKNESS_M = 0.03;
const STONE_STEP_THICKNESS_M = 0.03;
// Largura/altura de peças lineares de pedra quando a descrição não traz.
const STONE_LINEAR_WIDTH_M = { rodape: 0.1, soleira: 0.15, peitoril: 0.15, degrau: 0.3, divisoria: 1.8 } as const;

// Porcelanato ~10 mm, cerâmica ~8 mm; densidade ~2300 kg/m³. Rodapé h=10 cm.
const TILE_DENSITY_KG_M3 = 2300;
const PORCELAIN_DEFAULT_THICKNESS_M = 0.01;
const CERAMIC_DEFAULT_THICKNESS_M = 0.008;
const TILE_SKIRTING_HEIGHT_M = 0.1;

// Argamassa de cimento/areia ~2000 kg/m³. Espessuras-padrão por serviço quando
// a descrição não traz. Revisar.
const MORTAR_DENSITY_KG_M3 = 2000;
const MORTAR_DEFAULT_THICKNESS_M: Array<[RegExp, number]> = [
  [/\bchapisco\b/, 0.005],
  [/\bcontrapiso\b/, 0.04],
  [/\bprotecao mecanica\b/, 0.03],
  [/\bcimentad[oa]\b/, 0.03],
  [/\bregularizacao\b/, 0.02],
  [/\b(emboco|reboco|massa unica|argamassad[oa])\b/, 0.025],
];

// Vidro ~2500 kg/m³. Monolítico 8 mm; laminado (guarda-corpo, cobertura) 8+8.
const GLASS_DENSITY_KG_M3 = 2500;
const GLASS_DEFAULT_THICKNESS_M = 0.008;
const GLASS_LAMINATED_DEFAULT_THICKNESS_M = 0.016;

// Massa de esquadria por m² de vão (perfis; vidro não incluído). Alumínio
// janela/porta/fixo ~8 kg/m²; brise/veneziana e pele de vidro ~10 kg/m²;
// porta de madeira (folha + batente) ~15 kg/m²; porta corta-fogo de aço
// ~35 kg/m²; porta de enrolar ~15 kg/m²; portão de aço ~25 kg/m². Revisar.
const ALUMINIUM_FRAME_KG_M2 = 8;
const ALUMINIUM_HEAVY_FRAME_KG_M2 = 10;
const WOOD_DOOR_KG_M2 = 15;
const STEEL_FIRE_DOOR_KG_M2 = 35;
const ROLLING_DOOR_KG_M2 = 15;
const STEEL_GATE_KG_M2 = 25;

// Chapa de gesso acartonado 12,5 mm ~8,5 kg/m² por placa. Parede sem
// contagem na descrição: 2 placas (1+1); forro: 1. Montantes de aço não
// incluídos. Revisar.
const GYPSUM_BOARD_KG_M2 = 8.5;

// Steel deck (MF-50/75, 0,80–0,95 mm) ~9–11 kg/m². Revisar.
const STEEL_DECK_KG_M2 = 10;

// Consumo de produto por m² pintado: tinta/esmalte (2 demãos) ~0,3 kg/m²;
// textura ~1,5 kg/m²; caiação ~0,2 kg/m². Revisar.
const PAINT_KG_M2 = 0.3;
const TEXTURE_KG_M2 = 1.5;
const LIMEWASH_KG_M2 = 0.2;

// Manta asfáltica ~1,15 kg/m² por mm de espessura; padrão 4 mm. Revisar.
const ASPHALT_MEMBRANE_KG_M2_PER_MM = 1.15;
const ASPHALT_MEMBRANE_DEFAULT_MM = 4;

// Piso intertravado de concreto (maciço) ~2300 kg/m³, padrão 8 cm; guia de
// concreto ~10×30 cm. Revisar.
const PAVER_DENSITY_KG_M3 = 2300;
const PAVER_DEFAULT_THICKNESS_M = 0.08;
const KERB_SECTION_M2 = 0.03;

// Louça sanitária, massa por peça. Revisar.
const SANITARY_WARE_KG: Array<[RegExp, number]> = [
  [/^bacia .*caixa acoplada/, 30],
  [/^bacia\b/, 20],
  [/^lavatorio com coluna/, 20],
  [/^lavatorio\b/, 12],
  [/^cuba\b/, 8],
  [/^mictorio\b/, 15],
  [/^tanque\b/, 25],
];

// Corrimão de tubo de aço 1.1/2" ~3 kg/m (duplo = 2 tubos). Revisar.
const HANDRAIL_KG_M = 3;

// Normalização mínima de unidade (local, para não acoplar ao calculator).
function normUnit(u: string | null | undefined): string {
  if (!u) return "";
  const s = u.toLowerCase().trim().replace(/\.$/, "");
  if (s === "m²" || s === "m2") return "m2";
  if (s === "m³" || s === "m3") return "m3";
  if (s === "ml" || s === "m") return "m";
  if (s === "un" || s === "unid" || s === "und" || s === "unidade" || s === "pç" || s === "pc") return "un";
  return s;
}

// Remove acento e baixa caixa para casar descrições do iTwo (CAIXA ALTA, sem acento).
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Espessura em metros a partir de "15CM", "10 cm", "7,5cm". Null se ausente. */
function parseThicknessM(desc: string): number | null {
  const m = desc.match(/(\d+(?:[.,]\d+)?)\s*cm\b/i);
  if (!m) return null;
  const cm = parseFloat(m[1].replace(",", "."));
  if (!Number.isFinite(cm) || cm <= 0) return null;
  return cm / 100;
}

/** Massa do saco (kg) a partir de "EMB 50KG", "50 KG", "SACO 25KG". Null se ausente. */
function parseBagMassKg(desc: string): number | null {
  const m = desc.match(/(\d+(?:[.,]\d+)?)\s*kg\b/i);
  if (!m) return null;
  const kg = parseFloat(m[1].replace(",", "."));
  if (!Number.isFinite(kg) || kg <= 0) return null;
  return kg;
}

/** Área de seção (m²) a partir de "7,5x7,5", "2,5 X 10", "5x10cm". Null se ausente. */
function parseSectionAreaM2(desc: string): number | null {
  const m = desc.match(/(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)/i);
  if (!m) return null;
  const a = parseFloat(m[1].replace(",", "."));
  const b = parseFloat(m[2].replace(",", "."));
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return null;
  // Seções de madeira de obra são dadas em cm.
  return (a / 100) * (b / 100);
}

function num(s: string): number {
  return parseFloat(s.replace(",", "."));
}

/** Cota de altura "h=1,10m" / "H=10cm" em metros. Null se ausente. */
function parseHeightM(d: string): number | null {
  const m = d.match(/\bh\s*=\s*(\d+(?:[.,]\d+)?)\s*(cm|mm|m)?\b/);
  if (!m) return null;
  const v = num(m[1]);
  if (!Number.isFinite(v) || v <= 0) return null;
  return m[2] === "cm" ? v / 100 : m[2] === "mm" ? v / 1000 : v;
}

/** Espessura de camada (m) a partir de "8mm", "L=10mm", "2cm" — ignorando
 *  cotas de altura ("ELEVADO H=20cm" não é espessura). Com `laminated`,
 *  "10+10" (mm) soma as lâminas. Null se ausente. */
function parseLayerThicknessM(d: string, laminated = false): number | null {
  const s = d.replace(/\bh\s*=\s*\d+(?:[.,]\d+)?\s*(?:cm|mm|m)?/g, " ");
  if (laminated) {
    const lam = s.match(/\b(\d+(?:[.,]\d+)?)\s*\+\s*(\d+(?:[.,]\d+)?)\s*(?:mm)?\b/);
    if (lam) {
      const mm = num(lam[1]) + num(lam[2]);
      if (Number.isFinite(mm) && mm > 0 && mm < 100) return mm / 1000;
    }
  }
  const m = s.match(/(\d+(?:[.,]\d+)?)\s*(mm|cm)\b/);
  if (!m) return null;
  const v = num(m[1]);
  if (!Number.isFinite(v) || v <= 0) return null;
  return m[2] === "mm" ? v / 1000 : v / 100;
}

/** Área (m²) de uma peça/vão: "Área 86m²" ou dimensões "29,71x2,6m",
 *  "(0,82x2,10)", "56x34cm". Sem sufixo, valores ≤ 60 são lidos em metros.
 *  Null se ausente. */
function parseUnitAreaM2(d: string): number | null {
  const area = d.match(/\barea\s*(?:de\s*)?(\d+(?:[.,]\d+)?)\s*m(?:²|2)/);
  if (area) {
    const a = num(area[1]);
    if (Number.isFinite(a) && a > 0) return a;
  }
  const m = d.match(/(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m)?\b/);
  if (!m) return null;
  const a = num(m[1]);
  const b = num(m[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return null;
  if (m[3] === "mm") return (a / 1000) * (b / 1000);
  if (m[3] === "cm") return (a / 100) * (b / 100);
  if (a > 60 || b > 60) return null;
  return a * b;
}

function areal(kgPerM2: number, family: RecipeFamily, note: string): GeometricRecipe {
  return { baseUnit: "kg", multiplier: kgPerM2, family, note };
}

function layer(thicknessM: number, densityKgM3: number, family: RecipeFamily, note: string): GeometricRecipe {
  return { baseUnit: "m3", multiplier: thicknessM, densityKgM3, family, note };
}

// Famílias novas, escolhidas pelo PRIMEIRO termo de material na descrição
// ("Contrapiso ... para pisos cerâmicos" é argamassa; "Pintura ... sobre
// Drywall" é tinta). A ordem da lista só desempata termos na mesma posição.
const FAMILY_TERMS: Array<[string, RegExp]> = [
  ["aluminium_frame", /^(?:al|br|pr|vep)\s?\d+\b|^prxx\b|\b(?:porta|janela|portao|fixo)s? (?:\w+ )?de aluminio\b|\bpele de vidro\b|\bcaixilhos?\b|\besquadrias? de aluminio\b|\brequadro\b|\bbrises?\b|\bvenezianas?\b/],
  ["wood_door", /^pm\s?\d+\b|^pshaft\b|\bportas? internas?\b|\bportas? de madeira\b/],
  ["steel_door", /^pcf\b|\bporta corta.?fogo\b|\bporta de enrolar\b|\bportao\b/],
  ["masonry", /\balvenaria\b|\bblocos? (?:de concreto|ceramicos?|de vedacao|estrutura(?:l|is)|celular(?:es)?)\b/],
  ["gypsum_board", /\b(?:drywall|dry wall|gesso acartonado|placa colada)\b|^dw-?\s?\d+|\bst\s*\/\s*\d+\s*\/\s*st\b/],
  ["steel_deck", /\bsteel deck\b/],
  ["paint", /\b(?:pintura|tinta|textura|texturizad[ao]|esmalte|caiacao|verniz|selador)\b/],
  ["glass", /\bvidros?\b|\bespelhos?\b|\bvitrines?\b/],
  ["stone", /\b(?:marmore|granito|travertino|pedras?|ardosia|rocha|quartzito|siena)\b/],
  ["tile", /\b(?:porcelanato|ceramic[oa]s?|azulejos?|pastilhas?|portobell?o)\b/],
  ["mortar", /\b(?:chapisco|emboco|reboco|massa unica|argamassad[oa]|regularizacao|contrapiso|protecao mecanica|cimentad[oa])\b/],
  ["asphalt_membrane", /\bmanta\b/],
  ["concrete_paver", /\b(?:intertravad[oa]|paver|bloquete)\b/],
  ["sanitary_ware", /^(?:bacia|lavatorio|cuba|mictorio|tanque)\b/],
  ["handrail", /\bcorrimao\b/],
  ["plywood", /\bforma (?:em|de) chapa\b|\bforma com escoramento\b|\bcompensad[oa]\b/],
];

// Isolantes "lã/fibra/feltro de vidro|rocha" não são vidro nem pedra.
const INSULATION_PHRASES = /\b(?:la|fibra|feltro) de (?:vidro|rocha)\b/g;

function firstFamily(desc: string): string | null {
  const d = desc.replace(INSULATION_PHRASES, " ");
  let best: string | null = null;
  let bestIdx = Infinity;
  for (const [family, re] of FAMILY_TERMS) {
    const m = d.match(re);
    if (m && m.index !== undefined && m.index < bestIdx) {
      best = family;
      bestIdx = m.index;
    }
  }
  return best;
}

function familyRecipe(family: string, d: string, u: string): GeometricRecipe | null {
  switch (family) {
    case "aluminium_frame": {
      const heavy = /\bpele de vidro\b|\bbrises?\b|\bvenezianas?\b|^(?:br|vep)\s?\d+\b/.test(d);
      const kg = heavy ? ALUMINIUM_HEAVY_FRAME_KG_M2 : ALUMINIUM_FRAME_KG_M2;
      if (u === "m2") return areal(kg, "aluminium_frame", `esquadria de alumínio: ${kg} kg/m² de vão, sem vidro (revisar)`);
      if (u === "un") {
        const a = parseUnitAreaM2(d);
        if (a) return areal(a * kg, "aluminium_frame", `vão ${a.toFixed(2)} m² × ${kg} kg/m² de alumínio, sem vidro (revisar)`);
      }
      return null;
    }
    case "wood_door":
    case "steel_door": {
      if (u !== "un") return null;
      const a = parseUnitAreaM2(d);
      if (!a) return null;
      if (family === "wood_door") {
        return areal(a * WOOD_DOOR_KG_M2, "wood_door", `porta ${a.toFixed(2)} m² × ${WOOD_DOOR_KG_M2} kg/m² (revisar)`);
      }
      const kg = /\bporta de enrolar\b/.test(d) ? ROLLING_DOOR_KG_M2 : /\bportao\b/.test(d) ? STEEL_GATE_KG_M2 : STEEL_FIRE_DOOR_KG_M2;
      return areal(a * kg, "steel_door", `porta/portão de aço ${a.toFixed(2)} m² × ${kg} kg/m² (revisar)`);
    }
    case "masonry": {
      if (u !== "m2") return null;
      const kind = /\bcelular\b|\baac\b/.test(d) ? "masonry_aac" : /\bceramic[oa]s?\b|\btijolo\b/.test(d) ? "masonry_ceramic" : "masonry_concrete";
      const t = parseThicknessM(d) ?? MASONRY_DEFAULT_THICKNESS_M;
      const { solidFraction, densityKgM3 } = MASONRY[kind];
      return layer(t * solidFraction, densityKgM3, kind, `alvenaria ${t * 100}cm × fração sólida ${solidFraction} (revisar)`);
    }
    case "gypsum_board": {
      if (u !== "m2") return null;
      let boards = 0;
      for (const m of d.matchAll(/\b(\d+)\s*(?:st|ru|rf)\b/g)) boards += parseInt(m[1], 10);
      if (boards === 0) boards = (d.match(/\b(?:st|ru|rf)\b/g) ?? []).length;
      if (boards === 0) boards = /\bforro\b|\bplaca colada\b|\blining\b|\brevestimento\b/.test(d) ? 1 : 2;
      const kg = boards * GYPSUM_BOARD_KG_M2;
      return areal(kg, "gypsum_board", `${boards} placa(s) × ${GYPSUM_BOARD_KG_M2} kg/m², sem montantes (revisar)`);
    }
    case "steel_deck":
      return u === "m2" ? areal(STEEL_DECK_KG_M2, "steel_deck", `steel deck: ${STEEL_DECK_KG_M2} kg/m² (revisar)`) : null;
    case "paint": {
      if (u !== "m2") return null;
      if (/\b(?:textura|texturizad[ao])\b/.test(d)) return areal(TEXTURE_KG_M2, "paint", `textura: ${TEXTURE_KG_M2} kg/m² (revisar)`);
      if (/\bcaiacao\b/.test(d)) return areal(LIMEWASH_KG_M2, "paint", `caiação: ${LIMEWASH_KG_M2} kg/m² (revisar)`);
      const solvent = /\besmalte\b|\bverniz\b/.test(d);
      return areal(PAINT_KG_M2, solvent ? "solvent_paint" : "paint", `tinta (2 demãos): ${PAINT_KG_M2} kg/m² (revisar)`);
    }
    case "glass": {
      const laminatedDefault = /\bguarda.?corpo\b|\bcobertura\b|\blaminad[oa]\b/.test(d);
      const t = parseLayerThicknessM(d, true) ?? (laminatedDefault ? GLASS_LAMINATED_DEFAULT_THICKNESS_M : GLASS_DEFAULT_THICKNESS_M);
      const tNote = `vidro ${(t * 1000).toFixed(0)} mm`;
      if (u === "m2") return layer(t, GLASS_DENSITY_KG_M3, "glass", `${tNote} (revisar)`);
      if (u === "un") {
        const a = parseUnitAreaM2(d);
        if (a) return layer(a * t, GLASS_DENSITY_KG_M3, "glass", `${a.toFixed(2)} m² × ${tNote} (revisar)`);
      }
      if (u === "m") {
        const h = parseHeightM(d);
        if (h) return layer(h * t, GLASS_DENSITY_KG_M3, "glass", `h=${h} m × ${tNote} (revisar)`);
      }
      return null;
    }
    case "stone": {
      if (u === "m2") {
        const t = parseLayerThicknessM(d) ?? (/\bfachada\b/.test(d) ? STONE_FACADE_THICKNESS_M : STONE_DEFAULT_THICKNESS_M);
        return layer(t, STONE_DENSITY_KG_M3, "stone", `pedra ${t * 100}cm (revisar)`);
      }
      if (u === "m") {
        const piece = (Object.keys(STONE_LINEAR_WIDTH_M) as Array<keyof typeof STONE_LINEAR_WIDTH_M>).find((k) => d.includes(k));
        if (!piece) return null;
        const w = (piece === "rodape" ? parseHeightM(d) : null) ?? STONE_LINEAR_WIDTH_M[piece];
        const t = piece === "degrau" ? STONE_STEP_THICKNESS_M : STONE_DEFAULT_THICKNESS_M;
        return layer(w * t, STONE_DENSITY_KG_M3, "stone", `${piece} ${w} m × ${t * 100}cm (revisar)`);
      }
      if (u === "un" && /\b(?:bancada|tampo)\b/.test(d)) {
        const a = parseUnitAreaM2(d);
        if (a) return layer(a * STONE_DEFAULT_THICKNESS_M, STONE_DENSITY_KG_M3, "stone", `bancada ${a.toFixed(2)} m² × 2cm (revisar)`);
      }
      return null;
    }
    case "tile": {
      // "LAJE ... ENCHIMENTO EM LAJOTA CERÂMICA" não é revestimento.
      if (/\blaje\b|\blajotas?\b/.test(d)) return null;
      const t = parseLayerThicknessM(d) ?? (/\bporcelanato\b|\bportobell?o\b/.test(d) ? PORCELAIN_DEFAULT_THICKNESS_M : CERAMIC_DEFAULT_THICKNESS_M);
      if (u === "m2") return layer(t, TILE_DENSITY_KG_M3, "tile", `revestimento ${(t * 1000).toFixed(0)} mm (revisar)`);
      if (u === "m" && /\brodape\b/.test(d)) {
        const h = parseHeightM(d) ?? TILE_SKIRTING_HEIGHT_M;
        return layer(h * t, TILE_DENSITY_KG_M3, "tile", `rodapé h=${h} m × ${(t * 1000).toFixed(0)} mm (revisar)`);
      }
      return null;
    }
    case "mortar": {
      if (u !== "m2") return null;
      const t = parseLayerThicknessM(d) ?? MORTAR_DEFAULT_THICKNESS_M.find(([re]) => re.test(d))?.[1] ?? null;
      if (!t) return null;
      return layer(t, MORTAR_DENSITY_KG_M3, "mortar", `argamassa ${t * 100}cm (revisar)`);
    }
    case "asphalt_membrane": {
      // Manta geotêxtil (bidim) não é impermeabilização asfáltica.
      if (u !== "m2" || /\bgeotext|\bbidi[mn]\b/.test(d)) return null;
      const s = d.replace(/\bh\s*=\s*\d+(?:[.,]\d+)?\s*(?:cm|mm|m)?/g, " ");
      const mmMatch = s.match(/(\d+(?:[.,]\d+)?)\s*mm\b/);
      const mm = mmMatch ? num(mmMatch[1]) : ASPHALT_MEMBRANE_DEFAULT_MM;
      const layers = /\bdupla\b/.test(d) ? 2 : 1;
      const kg = mm * ASPHALT_MEMBRANE_KG_M2_PER_MM * layers;
      return areal(kg, "asphalt_membrane", `manta ${mm} mm × ${layers} camada(s) = ${kg.toFixed(1)} kg/m² (revisar)`);
    }
    case "concrete_paver": {
      if (u === "m2") {
        const t = parseLayerThicknessM(d) ?? PAVER_DEFAULT_THICKNESS_M;
        return layer(t, PAVER_DENSITY_KG_M3, "concrete_paver", `intertravado ${t * 100}cm (revisar)`);
      }
      if (u === "m" && /\b(?:guia|meio.?fio)\b/.test(d)) {
        return layer(KERB_SECTION_M2, PAVER_DENSITY_KG_M3, "concrete_paver", `guia ${KERB_SECTION_M2} m²/m (revisar)`);
      }
      return null;
    }
    case "sanitary_ware": {
      if (u !== "un" || /\binox\b/.test(d)) return null;
      const kg = SANITARY_WARE_KG.find(([re]) => re.test(d))?.[1];
      return kg ? areal(kg, "sanitary_ware", `louça: ${kg} kg/peça (revisar)`) : null;
    }
    case "handrail": {
      if (u !== "m") return null;
      const kg = HANDRAIL_KG_M * (/\bduplo\b/.test(d) ? 2 : 1);
      return areal(kg, "steel", `corrimão de aço: ${kg} kg/m (revisar)`);
    }
    case "plywood": {
      if (u !== "m2") return null;
      const m3 = PLYWOOD_FORM_THICKNESS_M / PLYWOOD_FORM_REUSES;
      return { baseUnit: "m3", multiplier: m3, family: "plywood", note: `compensado ${PLYWOOD_FORM_THICKNESS_M * 1000} mm ÷ ${PLYWOOD_FORM_REUSES} usos (revisar)` };
    }
  }
  return null;
}

/**
 * Deriva a receita geométrica para um item, ou null se nenhuma se aplica.
 * `itemUnit` é a unidade do item no orçamento (m², m, ...).
 */
export function geometricRecipe(
  description: string | null | undefined,
  itemUnit: string | null | undefined
): GeometricRecipe | null {
  if (!description) return null;
  const d = norm(description);
  const u = normUnit(itemUnit);

  // --- Alvenaria de bloco (vazado) — antes da regra de concreto ---------------
  // "ALVENARIA DE BLOCO DE CONCRETO 14CM" não é concreto maciço: a parede tem
  // ~45% de material sólido. Sem isto a regra de espessura abaixo dobrava a massa.
  if (u === "m2" && firstFamily(d) === "masonry") {
    return familyRecipe("masonry", d, u);
  }

  // --- Material medido por área → volume (espessura da descrição) -----------
  // "CONCRETO PARA PISO ... 15CM", contrapiso, lastro, regularização, e camadas
  // como taipa ("TAIPA ESP 2,5CM") cujo fator é por m³ — sem isto o par m²↔m³
  // é cross-family e zera.
  if (
    u === "m2" &&
    /\b(concreto|contrapiso|lastro|regulariza|sub-?base|enchimento|taipa)\b/.test(d)
  ) {
    const thickness = parseThicknessM(d);
    if (thickness) {
      const concrete = /\b(concreto|lastro|sub-?base)\b/.test(d);
      return {
        baseUnit: "m3",
        multiplier: thickness,
        densityKgM3: concrete ? CONCRETE_DENSITY_KG_M3 : MORTAR_DENSITY_KG_M3,
        family: concrete ? "concrete" : "mortar",
        legacy: true,
        note: `área × espessura ${thickness * 100}cm = m³`,
      };
    }
  }

  // --- Madeira linear → massa (seção da descrição × densidade) --------------
  // Pontalete, sarrafo, ripa, caibro, tábua, prancha medidos em metro linear.
  if (
    u === "m" &&
    /\b(pontalete|sarrafo|ripa|caibro|tabua|prancha|gravata|escora)\b/.test(d)
  ) {
    const sectionM2 = parseSectionAreaM2(d);
    if (sectionM2) {
      const kgPerM = sectionM2 * WOOD_DENSITY_KG_M3;
      return {
        baseUnit: "kg",
        multiplier: kgPerM,
        family: "wood",
        legacy: true,
        note: `seção ${(sectionM2 * 1e4).toFixed(1)}cm² × ${WOOD_DENSITY_KG_M3}kg/m³ = ${kgPerM.toFixed(3)}kg/m`,
      };
    }
  }

  // --- Ferro fundido por área → massa (tampa/grelha de canaleta) ------------
  // "TAMPA DE CANALETA EM FERRO FUNDIDO" (m²) — fator do FoFo é por kg.
  if (u === "m2" && /\b(ferro fundido|fofo)\b/.test(d)) {
    return {
      baseUnit: "kg",
      multiplier: CAST_IRON_AREAL_MASS_KG_M2,
      family: "cast_iron",
      legacy: true,
      note: `tampa FoFo: ${CAST_IRON_AREAL_MASS_KG_M2} kg/m² (revisar)`,
    };
  }

  // --- Forma metálica por área → massa de aço AMORTIZADA --------------------
  // "FORMA METALICA QUICKJET" (m²): a forma é reutilizável; a emissão do aço
  // é dividida pelo nº de usos. Fator do aço é por kg. Cimbramento metálico
  // segue a mesma lógica (escoramento reutilizável).
  if (
    u === "m2" &&
    /\b(forma metalica|forma de aco|quickjet|escoramento metalico|cimbramento metalico|painel metalico)\b/.test(d)
  ) {
    const kgPerM2 = STEEL_FORM_AREAL_MASS_KG_M2 / STEEL_FORM_REUSES;
    return {
      baseUnit: "kg",
      multiplier: kgPerM2,
      family: "steel_form",
      legacy: true,
      note: `forma de aço amortizada: ${STEEL_FORM_AREAL_MASS_KG_M2} kg/m² ÷ ${STEEL_FORM_REUSES} usos = ${kgPerM2.toFixed(3)} kg/m² (revisar)`,
    };
  }

  // --- Concreto/pré-moldado por VOLUME → massa (densidade) -------------------
  // Item em m³ que casou um fator por massa (kgCO₂/t ou /kg) — ex.: "ESTRUTURA
  // PRE-MOLDADA" 301 m³ contra fator por tonelada. Sem isto o par m³↔t é
  // cross-family e zera. Só dispara para concreto/pré-moldado (premissa: o
  // material é concreto). Itens já em m³ com fator por m³ não chegam aqui
  // (getConversionFactor direto já devolve 1 — recipe não é chamada).
  if (u === "m3" && /\bconcreto\b|pre[\s-]?moldad/.test(d)) {
    return {
      baseUnit: "kg",
      multiplier: CONCRETE_DENSITY_KG_M3,
      family: "concrete",
      legacy: true,
      note: `concreto: ${CONCRETE_DENSITY_KG_M3} kg/m³ (revisar)`,
    };
  }

  // --- Saco (sc) → massa -----------------------------------------------------
  // Cimento/argamassa/cal em "sc" contra fator por massa. A massa vem da
  // descrição ("EMB 50KG"); se ausente e for cimento, usa o saco-padrão 50kg.
  if (u === "sc") {
    const kg = parseBagMassKg(d) ?? (/\bcimento\b/.test(d) ? CEMENT_BAG_KG : null);
    if (kg) {
      return {
        baseUnit: "kg",
        multiplier: kg,
        family: "cement",
        legacy: true,
        note: `saco = ${kg} kg`,
      };
    }
  }

  // --- Massa por área explícita na descrição ---------------------------------
  // "ARGAMASSA POLIMÉRICA ... 3,6 kg/m²" — o consumo vem do próprio orçamento.
  if (u === "m2") {
    const explicit = d.match(/(\d+(?:[.,]\d+)?)\s*kg\s*\/\s*m(?:²|2)(?![0-9])/);
    if (explicit && /\bargamassa polimerica\b/.test(d)) {
      const kg = num(explicit[1]);
      if (Number.isFinite(kg) && kg > 0) {
        return { baseUnit: "kg", multiplier: kg, family: "polymer_mortar", note: `consumo da descrição: ${kg} kg/m²` };
      }
    }
  }

  // --- Acabamentos, esquadrias, vedações e louças ----------------------------
  // Família pelo primeiro termo de material da descrição; espessura/dimensão
  // da descrição quando houver, senão padrão documentado (revisar).
  const family = firstFamily(d);
  return family ? familyRecipe(family, d, u) : null;
}
