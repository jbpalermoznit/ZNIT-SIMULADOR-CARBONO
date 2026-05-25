export type ItemType = "A" | "B" | "C" | "D" | "E" | "F";
export type AbcClass = "P1" | "P2" | "P3";
export type MappingStatus = "auto" | "manual" | "pending" | "blocked" | "excluded";

export interface AbcItem {
  id: string;
  costCode: string;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
  totalCost: number;
  costPct: number;
  cumulativePct: number;
  abcClass: AbcClass;
  itemType: ItemType;
  mappingStatus: MappingStatus;
  epd?: string;
  emissionFactor?: number;
  emissionUnit?: string;
  emissionSource?: string;
  emissionKgco2e?: number;
  emissionTco2e?: number;
  confidence?: "high" | "medium" | "low";
  parentItemId?: string | null;
  classificationNote?: string | null;
  /** True when the exclusion came from the auto-classifier (not user). */
  autoExcluded?: boolean;
}

export interface Project {
  id: string;
  name: string;
  client: string;
  address: string;
  totalAreaM2: number;
  buildingType: string;
  status: "active" | "archived";
  createdAt: string;
  totalTco2e?: number;
  intensityTco2ePerM2?: number;
  coveragePct?: number;
  scenariosCount?: number;
  itemsCount?: number;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  totalTco2e: number;
  intensityTco2ePerM2: number;
  scope3Pct: number;
  coveragePct: number;
  createdAt: string;
  status: "draft" | "locked";
}

// Mock projects
export const mockProjects: Project[] = [
  {
    id: "proj-1",
    name: "Raízen VRO R8",
    client: "Raízen",
    address: "São Paulo, SP",
    totalAreaM2: 102000,
    buildingType: "Industrial",
    status: "active",
    createdAt: "2026-03-10",
    totalTco2e: 2847,
    intensityTco2ePerM2: 27.9,
    coveragePct: 87,
    scenariosCount: 3,
    itemsCount: 116,
  },
  {
    id: "proj-2",
    name: "Terminal Logístico Cubatão",
    client: "TLP",
    address: "Cubatão, SP",
    totalAreaM2: 45000,
    buildingType: "Logístico",
    status: "active",
    createdAt: "2026-03-01",
    totalTco2e: 1124,
    intensityTco2ePerM2: 24.9,
    coveragePct: 72,
    scenariosCount: 1,
    itemsCount: 84,
  },
  {
    id: "proj-3",
    name: "Galpão Jundiaí — Fase 2",
    client: "GLP",
    address: "Jundiaí, SP",
    totalAreaM2: 28000,
    buildingType: "Galpão",
    status: "active",
    createdAt: "2026-02-15",
    totalTco2e: 683,
    intensityTco2ePerM2: 24.4,
    coveragePct: 91,
    scenariosCount: 2,
    itemsCount: 67,
  },
];

// Mock items for Raízen VRO R8
export const mockItems: AbcItem[] = [
  {
    id: "item-1",
    costCode: "450201",
    description: "SubTerrapl-Pav-Dren",
    quantity: 1,
    unit: "vb",
    unitCost: 8980000,
    totalCost: 8980000,
    costPct: 8.81,
    cumulativePct: 8.81,
    abcClass: "P1",
    itemType: "C",
    mappingStatus: "blocked",
    emissionTco2e: undefined,
  },
  {
    id: "item-2",
    costCode: "420301",
    description: "Aço CA50 em Barras e Fios",
    quantity: 1200000,
    unit: "kg",
    unitCost: 6.63,
    totalCost: 7956000,
    costPct: 7.81,
    cumulativePct: 16.62,
    abcClass: "P1",
    itemType: "A",
    mappingStatus: "auto",
    epd: "Aço em barras CA50 — convencional",
    emissionFactor: 1.85,
    emissionUnit: "kgCO₂e/kg",
    emissionSource: "Ecoinvent 3.9",
    emissionKgco2e: 2220000,
    emissionTco2e: 2220,
    confidence: "high",
  },
  {
    id: "item-3",
    costCode: "400101",
    description: "Oficial Forma — Mão de Obra",
    quantity: 15800,
    unit: "h",
    unitCost: 45.0,
    totalCost: 711000,
    costPct: 6.98,
    cumulativePct: 23.60,
    abcClass: "P1",
    itemType: "B",
    mappingStatus: "excluded",
    emissionTco2e: 0,
  },
  {
    id: "item-4",
    costCode: "430101",
    description: "Concreto Bombeado Fck=30 MPa",
    quantity: 8200,
    unit: "m³",
    unitCost: 820.0,
    totalCost: 6724000,
    costPct: 6.60,
    cumulativePct: 30.20,
    abcClass: "P1",
    itemType: "A",
    mappingStatus: "manual",
    epd: "Concreto usinado Fck=30 — traço convencional",
    emissionFactor: 355,
    emissionUnit: "kgCO₂e/m³",
    emissionSource: "GHG Protocol BR",
    emissionKgco2e: 2911000,
    emissionTco2e: 2911,
    confidence: "medium",
  },
  {
    id: "item-5",
    costCode: "410201",
    description: "Forma Plana Madeira Compensada",
    quantity: 62000,
    unit: "m²",
    unitCost: 85.0,
    totalCost: 5270000,
    costPct: 5.17,
    cumulativePct: 35.37,
    abcClass: "P1",
    itemType: "A",
    mappingStatus: "pending",
    emissionTco2e: undefined,
    confidence: undefined,
  },
  {
    id: "item-6",
    costCode: "450503",
    description: "Corte e Dobra de Aço CA50",
    quantity: 1200000,
    unit: "kg",
    unitCost: 3.80,
    totalCost: 4560000,
    costPct: 4.48,
    cumulativePct: 39.85,
    abcClass: "P1",
    itemType: "D",
    mappingStatus: "pending",
    emissionTco2e: undefined,
  },
  {
    id: "item-7",
    costCode: "440105",
    description: "Retroescavadeira — Operação",
    quantity: 480,
    unit: "h",
    unitCost: 320.0,
    totalCost: 153600,
    costPct: 0.15,
    cumulativePct: 40.00,
    abcClass: "P2",
    itemType: "E",
    mappingStatus: "pending",
    emissionTco2e: undefined,
  },
  {
    id: "item-8",
    costCode: "460114",
    description: "Óleo Diesel — Abastecimento",
    quantity: 25000,
    unit: "L",
    unitCost: 6.80,
    totalCost: 170000,
    costPct: 0.17,
    cumulativePct: 40.17,
    abcClass: "P2",
    itemType: "F",
    mappingStatus: "auto",
    epd: "Diesel — combustão direta",
    emissionFactor: 2.68,
    emissionUnit: "kgCO₂e/L",
    emissionSource: "GHG Protocol BR",
    emissionKgco2e: 67000,
    emissionTco2e: 67,
    confidence: "high",
  },
  {
    id: "item-9",
    costCode: "430201",
    description: "Concreto Magro Fck=15 MPa",
    quantity: 1200,
    unit: "m³",
    unitCost: 680.0,
    totalCost: 816000,
    costPct: 0.80,
    cumulativePct: 40.97,
    abcClass: "P1",
    itemType: "A",
    mappingStatus: "auto",
    epd: "Concreto usinado Fck=15 — traço convencional",
    emissionFactor: 290,
    emissionUnit: "kgCO₂e/m³",
    emissionSource: "GHG Protocol BR",
    emissionKgco2e: 348000,
    emissionTco2e: 348,
    confidence: "high",
  },
  {
    id: "item-10",
    costCode: "420401",
    description: "Aço CA60 em Telas Soldadas",
    quantity: 85000,
    unit: "kg",
    unitCost: 8.50,
    totalCost: 722500,
    costPct: 0.71,
    cumulativePct: 41.68,
    abcClass: "P1",
    itemType: "A",
    mappingStatus: "auto",
    epd: "Aço CA60 — telas soldadas",
    emissionFactor: 1.95,
    emissionUnit: "kgCO₂e/kg",
    emissionSource: "Ecoinvent 3.9",
    emissionKgco2e: 165750,
    emissionTco2e: 166,
    confidence: "high",
  },
  {
    id: "item-11",
    costCode: "450801",
    description: "Impermeabilização — Manta EPDM",
    quantity: 18500,
    unit: "m²",
    unitCost: 95.0,
    totalCost: 1757500,
    costPct: 1.73,
    cumulativePct: 43.41,
    abcClass: "P1",
    itemType: "A",
    mappingStatus: "pending",
    emissionTco2e: undefined,
  },
  {
    id: "item-12",
    costCode: "400301",
    description: "Servente Concreto — Mão de Obra",
    quantity: 22400,
    unit: "h",
    unitCost: 32.0,
    totalCost: 716800,
    costPct: 0.70,
    cumulativePct: 44.11,
    abcClass: "P1",
    itemType: "B",
    mappingStatus: "excluded",
    emissionTco2e: 0,
  },
];

// Mock scenarios
export const mockScenarios: Scenario[] = [
  {
    id: "scen-0",
    name: "Cenário Base",
    description: "Importação direta da Curva ABC — materiais conforme especificado",
    totalTco2e: 2847,
    intensityTco2ePerM2: 27.9,
    scope3Pct: 78,
    coveragePct: 87,
    createdAt: "2026-03-10",
    status: "locked",
  },
  {
    id: "scen-1",
    name: "Cenário A — Cinza Volante",
    description: "Substituição do concreto convencional por traço com 30% de cinza volante",
    totalTco2e: 2213,
    intensityTco2ePerM2: 21.7,
    scope3Pct: 75,
    coveragePct: 87,
    createdAt: "2026-03-12",
    status: "draft",
  },
  {
    id: "scen-2",
    name: "Cenário B — Geopolímero",
    description: "Substituição parcial por concreto geopolímero (aglomerante alcalino)",
    totalTco2e: 1891,
    intensityTco2ePerM2: 18.5,
    scope3Pct: 71,
    coveragePct: 87,
    createdAt: "2026-03-14",
    status: "draft",
  },
];

// Pareto data for charts
export const mockParetoData = [
  { name: "Concreto Fck=30", tco2e: 2911, pct: 29.4, cumPct: 29.4, class: "A" },
  { name: "Aço CA50", tco2e: 2220, pct: 22.4, cumPct: 51.8, class: "A" },
  { name: "SubTerrapl.", tco2e: 0, pct: 0, cumPct: 51.8, class: "A", pending: true },
  { name: "Concreto Fck=15", tco2e: 348, pct: 3.5, cumPct: 55.3, class: "A" },
  { name: "Aço CA60", tco2e: 166, pct: 1.7, cumPct: 57.0, class: "A" },
  { name: "Diesel", tco2e: 67, pct: 0.7, cumPct: 57.7, class: "B" },
  { name: "Outros", tco2e: 4196, pct: 42.3, cumPct: 100, class: "C" },
];

// Scope breakdown
export const mockScopeData = [
  { name: "Scope 3 — Materiais", value: 78, color: "#56B7A5" },
  { name: "Scope 3 — Logística", value: 15, color: "#81C8B9" },
  { name: "Scope 1 — Combustão", value: 5, color: "#A9D7CD" },
  { name: "Scope 2 — Energia", value: 2, color: "#E6F3EE" },
];

// Scenario comparison data for chart
export const mockCompareData = [
  { category: "Concreto", base: 2911, scenA: 2100, scenB: 1450 },
  { category: "Aço", base: 2386, scenA: 2386, scenB: 2386 },
  { category: "Logística", base: 420, scenA: 390, scenB: 320 },
  { category: "Equipamentos", base: 87, scenA: 87, scenB: 87 },
  { category: "Outros", base: 390, scenA: 350, scenB: 290 },
];

// Scenario changes — what was modified in each non-base scenario
export interface ScenarioChange {
  itemId: string;
  costCode: string;
  description: string;
  baseEpd: string;
  newEpd: string;
  baseEmissionFactor: number;
  newEmissionFactor: number;
  emissionUnit: string;
  quantity: number;
  quantityUnit: string;
  deltaEmissionTco2e: number; // negative = reduction
  baseUnitCost: number;
  newUnitCost: number;
  deltaTotalCost: number;
}

export const mockScenarioChanges: Record<string, ScenarioChange[]> = {
  "scen-1": [
    {
      itemId: "item-4",
      costCode: "430101",
      description: "Concreto Bombeado Fck=30 MPa",
      baseEpd: "Concreto usinado Fck=30 — convencional",
      newEpd: "Concreto Fck=30 — 30% cinza volante",
      baseEmissionFactor: 355,
      newEmissionFactor: 248,
      emissionUnit: "kgCO₂e/m³",
      quantity: 8200,
      quantityUnit: "m³",
      deltaEmissionTco2e: -877,
      baseUnitCost: 820,
      newUnitCost: 778,
      deltaTotalCost: -344400,
    },
  ],
  "scen-2": [
    {
      itemId: "item-4",
      costCode: "430101",
      description: "Concreto Bombeado Fck=30 MPa",
      baseEpd: "Concreto usinado Fck=30 — convencional",
      newEpd: "Concreto Fck=30 — geopolimérico",
      baseEmissionFactor: 355,
      newEmissionFactor: 187,
      emissionUnit: "kgCO₂e/m³",
      quantity: 8200,
      quantityUnit: "m³",
      deltaEmissionTco2e: -1378,
      baseUnitCost: 820,
      newUnitCost: 1020,
      deltaTotalCost: 1640000,
    },
    {
      itemId: "item-2",
      costCode: "420301",
      description: "Aço CA50 em Barras e Fios",
      baseEpd: "Aço em barras CA50 — convencional",
      newEpd: "Aço em barras CA50 — aço reciclado",
      baseEmissionFactor: 1.85,
      newEmissionFactor: 0.92,
      emissionUnit: "kgCO₂e/kg",
      quantity: 1200000,
      quantityUnit: "kg",
      deltaEmissionTco2e: -1116,
      baseUnitCost: 6.63,
      newUnitCost: 7.85,
      deltaTotalCost: 1464000,
    },
  ],
};

// Agent messages for mock conversation
export interface AgentMessage {
  id: string;
  role: "agent" | "user";
  content: string;
  timestamp: string;
  itemId?: string;
  actions?: { label: string; value: string }[];
  resolved?: boolean;
}

export const mockAgentMessages: AgentMessage[] = [
  {
    id: "msg-1",
    role: "agent",
    content:
      "Terminei de processar a Curva ABC do projeto **Raízen VRO R8**.\n\n— 86 itens Tipo A mapeados automaticamente\n— 2 regras aplicadas pelo motor de regras\n— **4 itens** precisam da sua ajuda para serem parametrizados.\n\nVou começar pelo item de maior impacto no orçamento:",
    timestamp: "10:15",
  },
  {
    id: "msg-2",
    role: "agent",
    content:
      "**SubTerrapl-Pav-Dren (450201)**\nCusto: R$ 8,98M | Classe A | Tipo: Agrupado\n\nEste item engloba Terraplenagem, Pavimentação e Drenagem juntos — não consigo calcular o carbono sem separar.\n\nBaseado em 12 obras industriais similares na base ZNIT, a distribuição típica é:\n• Terraplenagem: **58%** → R$ 5,21M\n• Pavimentação: **27%** → R$ 2,42M\n• Drenagem: **15%** → R$ 1,35M\n\nPosso usar essa distribuição para o Raízen ou quer ajustar as proporções?",
    timestamp: "10:15",
    itemId: "item-1",
    actions: [
      { label: "Usar essa distribuição", value: "use_template" },
      { label: "Ajustar proporções", value: "adjust" },
    ],
  },
];

// Pending items for agent
export const pendingItems = mockItems.filter(
  (i) => i.itemType !== "A" && i.mappingStatus !== "excluded"
);

export const itemTypeMeta: Record<
  ItemType,
  { label: string; color: string; bg: string; description: string }
> = {
  A: {
    label: "Material",
    color: "#1d7a6b",
    bg: "#E6F3EE",
    description: "Material direto com EPD documentado",
  },
  B: {
    label: "Mão de Obra",
    color: "#92400e",
    bg: "#FEF3C7",
    description: "Serviço humano sem emissão direta",
  },
  C: {
    label: "Agrupado",
    color: "#7c3aed",
    bg: "#EDE9FE",
    description: "Múltiplos serviços em um código",
  },
  D: {
    label: "Mat. Embutido",
    color: "#b45309",
    bg: "#FFEDD5",
    description: "Risco de dupla contagem",
  },
  E: {
    label: "Equipamento",
    color: "#1e40af",
    bg: "#DBEAFE",
    description: "Emissão por horas de uso",
  },
  F: {
    label: "Administrativo",
    color: "#374151",
    bg: "#F3F4F6",
    description: "Sem emissão direta clara",
  },
};

export const mappingStatusMeta: Record<
  MappingStatus,
  { label: string; color: string; bg: string }
> = {
  auto: { label: "Auto", color: "#1d7a6b", bg: "#E6F3EE" },
  manual: { label: "Manual", color: "#1e40af", bg: "#DBEAFE" },
  pending: { label: "Pendente", color: "#b45309", bg: "#FEF3C7" },
  blocked: { label: "Bloqueado", color: "#7c3aed", bg: "#EDE9FE" },
  excluded: { label: "Excluído", color: "#6b7280", bg: "#F3F4F6" },
};
