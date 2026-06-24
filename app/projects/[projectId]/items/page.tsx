"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { itemTypeMeta, mappingStatusMeta, type ItemType, type AbcClass, type AbcItem } from "@/lib/mock/data";
import { listAbcItems, getProject, reclassifyBlocked, type AbcItemResponse, type ProjectResponse } from "@/lib/api/projects";
import { getMapping, type MappingResponse } from "@/lib/api/emission-factors";
import { useActiveScenario } from "@/lib/hooks/use-active-scenario";
import { SaveModeDialog, type SaveModeChoice } from "@/components/items/save-mode-dialog";
import { ExcludeItemDialog, type ExcludeChoice } from "@/components/items/exclude-item-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Search, Filter, Download, X, ChevronRight, AlertTriangle,
  CheckCircle, Edit3, ArrowLeft, ChevronDown, FileText, Database,
  Globe, Pencil, ExternalLink, Loader2, Zap, BookOpen, Ban,
} from "lucide-react";
import {
  searchEmissionFactors, autoMatchItem, autoMapProject, confirmMapping,
  type EmissionSearchResponse, type AutoMatchResult, type EcoinventResult,
  type EpdCatalogResult, type MappingConfirmRequest,
} from "@/lib/api/emission-factors";
import { createFactorRule } from "@/lib/api/factor-rules";

/** "compositions" é um pseudo-filtro: mostra itens com sub-composições do
 *  Relatório Proof OU itens-pai com filhos vindos de uma Planilha de Insumos. */
const allTypes: (ItemType | "all" | "compositions")[] = [
  "all", "A", "B", "C", "D", "E", "F", "compositions",
];
const allClasses: (AbcClass | "all")[] = ["all", "P1", "P2", "P3"];

const TYPE_NAMES: Record<string, string> = {
  A: "Material Direto", B: "Mão de Obra", C: "Item Agrupado",
  D: "Material Embutido", E: "Equipamento/Locação", F: "Administrativo/Indireto",
};

const CONFIDENCE_LABEL: Record<string, { label: string; color: string }> = {
  high:   { label: "Alta confiança",  color: "#1d7a6b" },
  medium: { label: "Média confiança", color: "#b45309" },
  low:    { label: "Baixa confiança", color: "#DC2626" },
};


/** Get conversion factor between item unit and factor unit denominator.
 *  Returns 0 when units are incompatible (e.g. "un" vs "t"). */
function getUnitConversion(itemUnit: string | null, factorUnit: string | null): number {
  if (!itemUnit || !factorUnit) return 1;
  // Extract denominator from factor unit (e.g., "kgCO₂/t" → "t", "kg CO2-Eq" → "kg")
  let fu = factorUnit.toLowerCase().trim();
  for (const prefix of ["kgco₂/", "kgco₂e/", "kgco2/", "kgco2e/", "kg co2-eq/", "kg co2-eq"]) {
    if (fu.startsWith(prefix)) { fu = fu.slice(prefix.length).trim(); break; }
  }
  const normalize: Record<string, string> = {
    kg: "kg", t: "t", ton: "t", g: "g",
    "m³": "m3", m3: "m3", l: "L", litro: "L",
    "m²": "m2", m2: "m2", m: "m",
    un: "un", unit: "un", "pç": "un", unid: "un",
  };
  const iu = normalize[itemUnit.toLowerCase().trim()] || itemUnit.toLowerCase().trim();
  const fuN = normalize[fu] || fu;
  if (iu === fuN) return 1;
  // Mass conversions
  const massToKg: Record<string, number> = { kg: 1, t: 1000, g: 0.001 };
  if (massToKg[iu] !== undefined && massToKg[fuN] !== undefined) return massToKg[iu] / massToKg[fuN];
  // Volume conversions
  const volToM3: Record<string, number> = { m3: 1, L: 0.001 };
  if (volToM3[iu] !== undefined && volToM3[fuN] !== undefined) return volToM3[iu] / volToM3[fuN];
  // Incompatible dimensions → cannot calculate
  return 0;
}

/** Convert snake_case API response to camelCase AbcItem for the UI */
function toAbcItem(r: AbcItemResponse): AbcItem {
  const conv = getUnitConversion(r.unit, r.factor_unit);
  const emissionKgco2e = r.factor_value && r.quantity ? r.quantity * r.factor_value * conv : undefined;
  return {
    id: r.id,
    costCode: r.cost_code,
    description: r.description,
    quantity: r.quantity,
    unit: r.unit,
    unitCost: r.unit_cost,
    totalCost: r.total_cost,
    costPct: r.cost_pct,
    cumulativePct: r.cumulative_pct,
    abcClass: r.abc_class as AbcClass,
    itemType: r.item_type as ItemType,
    mappingStatus: r.mapping_status as AbcItem["mappingStatus"],
    epd: r.factor_name ?? undefined,
    emissionFactor: r.factor_value ?? undefined,
    emissionUnit: r.factor_unit ?? undefined,
    emissionSource: r.source_tier ?? undefined,
    emissionKgco2e: emissionKgco2e,
    emissionTco2e: emissionKgco2e ? emissionKgco2e / 1000 : undefined,
    confidence: (r.confidence as "high" | "medium" | "low") ?? undefined,
    parentItemId: r.parent_item_id ?? null,
    classificationNote: r.classification_note ?? null,
    autoExcluded: r.auto_excluded,
    assemblies: r.assemblies ?? [],
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-[#F0F4F3] last:border-0">
      <span className="text-xs text-[#808181] shrink-0">{label}</span>
      <span className="text-xs font-semibold text-[#030304] text-right">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <p className="text-[10px] font-bold text-[#808181] uppercase tracking-widest mb-1 px-5">{title}</p>
      <div className="px-5">{children}</div>
    </div>
  );
}

function DrawerHeader({ item, onClose, back, backLabel }: {
  item: AbcItem; onClose: () => void; back?: () => void; backLabel?: string;
}) {
  const typeMeta = itemTypeMeta[item.itemType];
  return (
    <div className="px-5 py-4 border-b border-[#E0E4E3]">
      {back && (
        <button onClick={back} className="flex items-center gap-1 text-xs text-[#56B7A5] font-semibold mb-3 hover:opacity-80">
          <ArrowLeft size={12} /> {backLabel ?? "Voltar"}
        </button>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-mono text-[#808181]">{item.costCode}</p>
          <h2 className="text-sm font-bold text-[#030304] mt-0.5 leading-snug">{item.description}</h2>
          <div className="flex items-center gap-2 mt-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold"
              style={{ backgroundColor: typeMeta.bg, color: typeMeta.color }}>
              Tipo {item.itemType} — {TYPE_NAMES[item.itemType]}
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold"
              style={{
                backgroundColor: item.abcClass === "P1" ? "#E6F3EE" : item.abcClass === "P2" ? "#FEF3C7" : "#F3F4F6",
                color: item.abcClass === "P1" ? "#1d7a6b" : item.abcClass === "P2" ? "#92400e" : "#808181",
              }}>
              {item.abcClass}
            </span>
          </div>
        </div>
        <button onClick={onClose} className="text-[#808181] hover:text-[#030304] p-1 shrink-0 mt-0.5">
          <X size={18} />
        </button>
      </div>
    </div>
  );
}

// ─── View: Detail ────────────────────────────────────────────────────────────

function DetailView({ item, mapping, onEditEpd, onParametrize, onExclude }: {
  item: AbcItem;
  mapping: MappingResponse | null;
  onEditEpd: () => void;
  onParametrize: () => void;
  onExclude?: () => void;
}) {
  const statusMeta = mappingStatusMeta[item.mappingStatus];
  const conf = item.confidence ? CONFIDENCE_LABEL[item.confidence] : null;

  // Decision-of-the-AI block: one of four buckets, each with its own colour
  // and explanation. Falls back to a stable default when the mapping row is
  // still loading.
  const aiDecision = (() => {
    const status = item.mappingStatus;
    if (status === "excluded") {
      return {
        kind: "excluded" as const,
        title: "IA desconsiderou este item",
        body:
          mapping?.exclusion_justification ??
          "Excluído do inventário por premissa metodológica.",
        bg: "#F3F4F6",
        border: "#D1D5DB",
        color: "#374151",
      };
    }
    if (status === "auto") {
      const tier = (mapping?.source_tier ?? "").toLowerCase();
      const tierLabel =
        tier === "epd" ? "EPD certificada" :
        tier === "ghg_protocol" ? "GHG Protocol BR" :
        tier === "cecarbon" ? "CECarbon" :
        tier === "ecoinvent" ? "Ecoinvent" :
        tier === "rule" ? "Regra da empresa" :
        tier || "Fonte desconhecida";
      const score = mapping?.similarity_score
        ? Math.round(mapping.similarity_score * 100)
        : null;
      return {
        kind: "auto" as const,
        title: "IA mapeou automaticamente",
        body: `Fator obtido de ${tierLabel}${score ? ` · score ${score}/100` : ""}${mapping?.notes ? ` · ${mapping.notes}` : ""}${mapping?.factor_source ? ` · ${mapping.factor_source}` : ""}.`,
        bg: "#E6F3EE",
        border: "#A9D7CD",
        color: "#1d7a6b",
      };
    }
    if (status === "manual") {
      return {
        kind: "manual" as const,
        title: "IA sugeriu — revisar",
        body: mapping?.mapped_by === "user_custom"
          ? "Fator definido manualmente pelo analista."
          : `Match de confiança ${item.confidence ?? "média"}. Revise antes de assumir como definitivo${mapping?.factor_source ? ` · Fonte: ${mapping.factor_source}` : ""}.`,
        bg: "#DBEAFE",
        border: "#93C5FD",
        color: "#1e40af",
      };
    }
    if (status === "blocked") {
      return {
        kind: "blocked" as const,
        title: "Aguardando decomposição",
        body: "Item agrupado — precisa ser quebrado em componentes antes do mapeamento.",
        bg: "#EDE9FE",
        border: "#C4B5FD",
        color: "#5B21B6",
      };
    }
    return {
      kind: "pending" as const,
      title: "IA não encontrou fator",
      body: "Nenhuma fonte (EPD, GHG Protocol, CECarbon, Ecoinvent) trouxe candidato com fator > 0. Mapeie manualmente em \"Editar Fator de Emissão\" ou desconsidere com justificativa.",
      bg: "#FEF3C7",
      border: "#FCD34D",
      color: "#92400e",
    };
  })();

  return (
    <>
      <div className="flex-1 overflow-y-auto py-5">
        <Section title="Orçamento">
          <Row label="Quantidade" value={`${item.quantity.toLocaleString("pt-BR")} ${item.unit}`} />
          <Row label="Custo unitário" value={new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(item.unitCost)} />
          <Row label="Custo total" value={
            <span className="text-base font-bold">
              {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(item.totalCost)}
            </span>
          } />
          <Row label="% do orçamento" value={`${item.costPct.toFixed(2)}%`} />
          <Row label="% acumulado" value={`${item.cumulativePct.toFixed(2)}%`} />
        </Section>

        <Section title="Decisão da IA">
          <div
            className="rounded-lg border px-3 py-2.5 flex items-start gap-2"
            style={{
              backgroundColor: aiDecision.bg,
              borderColor: aiDecision.border,
              color: aiDecision.color,
            }}
          >
            <div className="text-xs leading-relaxed">
              <p className="font-bold mb-0.5">{aiDecision.title}</p>
              <p>{aiDecision.body}</p>
            </div>
          </div>
        </Section>

        <Section title="Fator de Emissão">
          <div className="mb-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold"
              style={{ backgroundColor: statusMeta.bg, color: statusMeta.color }}>
              {item.mappingStatus === "auto" && <CheckCircle size={11} />}
              {item.mappingStatus === "pending" && <AlertTriangle size={11} />}
              {statusMeta.label}
              {conf && <span style={{ color: conf.color }}> · {conf.label}</span>}
            </span>
          </div>
          {item.epd ? (
            <>
              <Row label="Fator" value={item.epd} />
              <Row label="Fator" value={item.emissionFactor !== undefined ? `${item.emissionFactor} ${item.emissionUnit}` : "—"} />
              <Row label="Fonte" value={item.emissionSource ?? "—"} />
              <Row label="Escopo" value="Escopo 3 — Materiais" />
            </>
          ) : (
            <div className="bg-[#FEF3C7] border border-[#FCD34D] rounded-lg px-3 py-2.5 flex items-start gap-2">
              <AlertTriangle size={13} className="text-[#b45309] shrink-0 mt-0.5" />
              <p className="text-xs text-[#92400e]">
                {item.mappingStatus === "blocked"
                  ? "Item agrupado — aguardando decomposição antes do mapeamento."
                  : item.mappingStatus === "excluded"
                  ? "Item excluído do inventário por premissa metodológica."
                  : "Nenhum fator de emissão mapeado. Clique em Editar Fator de Emissão para selecionar."}
              </p>
            </div>
          )}
        </Section>

        <Section title="Emissões Calculadas">
          {item.emissionTco2e !== undefined && item.emissionTco2e > 0 ? (
            <>
              <Row label="Total kgCO₂e" value={item.emissionKgco2e?.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) ?? "—"} />
              <Row label="Total tCO₂e" value={
                <span className="text-lg font-bold text-[#56B7A5]">
                  {item.emissionTco2e.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
                </span>
              } />
              {item.emissionFactor && (
                <div className="mt-2 bg-[#F8FAF9] rounded-lg px-3 py-2.5 text-xs text-[#808181] font-mono leading-relaxed">
                  {item.quantity.toLocaleString("pt-BR")} {item.unit} × {item.emissionFactor} {item.emissionUnit} = {item.emissionKgco2e?.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kgCO₂e
                </div>
              )}
            </>
          ) : item.mappingStatus === "excluded" ? (
            <p className="text-xs text-[#808181]">Excluído — emissão não calculada.</p>
          ) : (
            <p className="text-xs text-[#BDBDBC]">Aguardando mapeamento de EPD.</p>
          )}
        </Section>

        <Section title="Logística — Escopo 3">
          <div className="bg-[#F8FAF9] rounded-lg px-3 py-3 text-xs text-[#808181] space-y-2">
            <div className="flex justify-between"><span>Distância</span><span className="font-semibold text-[#404040]">— km</span></div>
            <div className="flex justify-between"><span>Modal</span><span className="font-semibold text-[#404040]">—</span></div>
            <div className="flex justify-between"><span>Emissão logística</span><span className="font-semibold text-[#404040]">— tCO₂e</span></div>
            <p className="text-[10px] text-[#BDBDBC] pt-1">Configure em Parametrizar item.</p>
          </div>
        </Section>
      </div>

      <div className="px-5 py-4 border-t border-[#E0E4E3] space-y-2">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={onEditEpd}>
            <Edit3 size={13} /> Editar Fator de Emissão
          </Button>
          <Button size="sm" className="flex-1" onClick={onParametrize}>
            <ChevronRight size={13} /> Parametrizar item
          </Button>
        </div>
        {onExclude && item.mappingStatus !== "excluded" && (
          <button
            onClick={onExclude}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-[#E0E4E3] text-xs font-semibold text-[#6b7280] hover:border-[#9ca3af] hover:text-[#374151] hover:bg-[#F3F4F6] transition-all"
          >
            <Ban size={13} />
            Desconsiderar este item do cálculo
          </button>
        )}
      </div>
    </>
  );
}

// ─── View: Editar EPD (real API) ──────────────────────────────────────────────

type EpdTab = "search" | "epd_catalog" | "manual";

interface SelectedFactor {
  source_tier: "ecoinvent" | "ghg_protocol" | "cecarbon" | "epd" | "user_custom";
  factor_value: number;
  factor_unit: string;
  factor_name: string;
  ecoinvent_product_id?: string;
  ecoinvent_activity_id?: string;
  cecarbon_id?: number;
  epd_id?: number;
  product_unit?: string;
  geography?: string;
}

const TIER_LABEL: Record<string, string> = {
  ghg_protocol: "GHG Protocol",
  cecarbon: "CECarbon",
  ecoinvent: "Ecoinvent",
  epd: "EPD",
  user_custom: "Manual",
  rule: "Regra Salva",
};

const TIER_COLOR: Record<string, string> = {
  ghg_protocol: "bg-blue-100 text-blue-700",
  cecarbon: "bg-emerald-100 text-emerald-700",
  ecoinvent: "bg-purple-100 text-purple-700",
  epd: "bg-amber-100 text-amber-700",
  user_custom: "bg-gray-100 text-gray-600",
  rule: "bg-teal-100 text-teal-700",
};

// Linhas de resultado de busca vêm de 3 tabelas externas (GHG / CECarbon /
// Ecoinvent) com chaves dinâmicas — incluindo chaves em português usadas em
// template literals e aritmética. Um tipo preciso não agrega valor aqui.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FactorSearchRow = Record<string, any>;

function EditEpdView({
  item,
  onBack,
  onSaved,
  onFactorSaveRequest,
  onClose,
}: {
  item: AbcItem;
  onBack: () => void;
  onSaved?: () => void;
  onFactorSaveRequest?: (body: MappingConfirmRequest, factorLabel: string, onFinish: () => void) => void;
  onClose?: () => void;
}) {
  const [tab, setTab] = useState<EpdTab>("search");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [autoLoading, setAutoLoading] = useState(false);
  const [results, setResults] = useState<EmissionSearchResponse | null>(null);
  const [autoMatch, setAutoMatch] = useState<AutoMatchResult | null>(null);
  const [selected, setSelected] = useState<SelectedFactor | null>(null);
  const [saving, setSaving] = useState(false);

  // Save as rule
  const [saveAsRule, setSaveAsRule] = useState(false);

  // Tier filters
  const [tierFilter, setTierFilter] = useState<Record<string, boolean>>({
    ghg_protocol: true,
    cecarbon: true,
    ecoinvent: true,
  });

  // Manual factor form
  const [manualValue, setManualValue] = useState("");
  const [manualUnit, setManualUnit] = useState("kgCO₂e/kg");
  const [manualSource, setManualSource] = useState("");
  const [manualName, setManualName] = useState("");

  // Current mapping (already saved)
  const [currentMapping, setCurrentMapping] = useState<MappingResponse | null>(null);

  // Load current mapping + auto-match on mount
  useEffect(() => {
    if (!item.id) return;
    // Load existing mapping
    getMapping(item.id).then(setCurrentMapping).catch(() => {});
    // Auto-match
    setAutoLoading(true);
    autoMatchItem(item.id)
      .then(setAutoMatch)
      .catch(() => {})
      .finally(() => setAutoLoading(false));
  }, [item.id]);

  // Search debounce
  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setResults(null); return; }
    setLoading(true);
    try {
      const activeTiers = Object.entries(tierFilter).filter(([, v]) => v).map(([k]) => k);
      const tierParam = activeTiers.length < 3 ? activeTiers.join(",") : undefined;
      const data = await searchEmissionFactors(q, tierParam, 15);
      setResults(data);
    } catch { setResults(null); }
    setLoading(false);
  }, [tierFilter]);

  useEffect(() => {
    const t = setTimeout(() => doSearch(search), 400);
    return () => clearTimeout(t);
  }, [search, doSearch]);

  const handleConfirm = async () => {
    if (!selected && tab !== "manual") return;
    setSaving(true);
    try {
      let body: MappingConfirmRequest;
      if (tab === "manual") {
        body = {
          source_tier: "user_custom",
          factor_value: parseFloat(manualValue),
          factor_unit: manualUnit,
          factor_name: manualName || item.description,
          custom_factor_source: manualSource,
        };
      } else {
        body = {
          source_tier: selected!.source_tier,
          factor_value: selected!.factor_value,
          factor_unit: selected!.factor_unit,
          factor_name: selected!.factor_name,
          ecoinvent_product_id: selected!.ecoinvent_product_id,
          ecoinvent_activity_id: selected!.ecoinvent_activity_id,
          cecarbon_id: selected!.cecarbon_id,
          epd_id: selected!.epd_id,
        };
      }

      // Save as rule for future imports (independent of the scenario flow)
      const saveRule = async () => {
        if (!saveAsRule) return;
        try {
          await createFactorRule({
            original_description: item.description,
            factor_value: body.factor_value ?? 0,
            factor_unit: body.factor_unit ?? "",
            factor_name: body.factor_name ?? item.description,
            source_tier: body.source_tier,
            source_description: body.custom_factor_source,
            ecoinvent_product_id: body.ecoinvent_product_id,
            cecarbon_id: body.cecarbon_id,
          });
        } catch {
          // Non-blocking — rule save failure shouldn't break the mapping
        }
      };

      if (onFactorSaveRequest) {
        // Delegate to the page-level SaveModeDialog. The page handles
        // confirmMapping with scenario_id + mode and decides what to refresh.
        await saveRule();
        onFactorSaveRequest(body, body.factor_name ?? "edição", () => {
          onSaved?.();
          onClose?.();
        });
        setSaving(false);
        return;
      }

      // Legacy path (no active scenario): plain confirmMapping
      await confirmMapping(item.id, body);
      await saveRule();
      onSaved?.();
      onBack();
    } catch (e) {
      alert("Erro ao salvar mapeamento: " + (e instanceof Error ? e.message : "erro desconhecido"));
    }
    setSaving(false);
  };

  const inputClass = "w-full h-9 px-3 rounded-lg border border-[#E0E4E3] text-sm text-[#030304] bg-white placeholder:text-[#BDBDBC] focus:outline-none focus:border-[#56B7A5] transition-all";
  const tabBtnClass = (active: boolean) => cn(
    "flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-all",
    active ? "bg-[#56B7A5] text-white" : "text-[#808181] hover:bg-[#F3F4F6]"
  );

  return (
    <>
      <div className="flex-1 overflow-y-auto">
        {/* Search bar */}
        <div className="px-5 py-4 border-b border-[#E0E4E3] bg-[#F8FAF9]">
          <div className="relative mb-3">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#BDBDBC]" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar fator de emissão..."
              className={cn(inputClass, "pl-8")}
            />
            {loading && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#56B7A5] animate-spin" />}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-2">
            <button className={tabBtnClass(tab === "search")} onClick={() => setTab("search")}>
              <Database size={12} /> Buscar Fatores
            </button>
            <button className={tabBtnClass(tab === "epd_catalog")} onClick={() => setTab("epd_catalog")}>
              <BookOpen size={12} /> EPD Catalog
            </button>
            <button className={tabBtnClass(tab === "manual")} onClick={() => setTab("manual")}>
              <Pencil size={12} /> Manual
            </button>
          </div>

          {/* Tier filters */}
          {tab === "search" && (
            <div className="flex gap-2">
              {([
                { key: "ghg_protocol", label: "GHG Protocol" },
                { key: "cecarbon", label: "CECarbon" },
                { key: "ecoinvent", label: "Ecoinvent" },
              ] as const).map(({ key, label }) => (
                <label key={key} className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={tierFilter[key]}
                    onChange={(e) => setTierFilter(prev => ({ ...prev, [key]: e.target.checked }))}
                    className="w-3 h-3 rounded accent-[#56B7A5]" />
                  <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded",
                    TIER_COLOR[key] || "bg-gray-100 text-gray-600",
                    !tierFilter[key] && "opacity-40"
                  )}>{label}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Current mapping (already saved) */}
        {tab === "search" && currentMapping && currentMapping.factor_value != null && currentMapping.factor_value > 0 && !search && (
          <div className="px-5 py-3 border-b border-[#E0E4E3] bg-[#E6F3EE]">
            <div className="flex items-center gap-1.5 mb-2">
              <CheckCircle size={12} className="text-[#1d7a6b]" />
              <span className="text-[10px] font-bold text-[#1d7a6b] uppercase tracking-wider">Fator atual</span>
              {currentMapping.source_tier && (
                <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded",
                  TIER_COLOR[currentMapping.source_tier] || "bg-gray-100 text-gray-600"
                )}>
                  {TIER_LABEL[currentMapping.source_tier] || currentMapping.source_tier}
                </span>
              )}
              {currentMapping.confidence && (
                <span className={cn("ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded",
                  currentMapping.confidence === "high" ? "bg-[#E6F3EE] text-[#1d7a6b]" :
                  currentMapping.confidence === "medium" ? "bg-[#FEF3C7] text-[#92400e]" : "bg-[#F3F4F6] text-[#808181]"
                )}>
                  {currentMapping.confidence === "high" ? "Alta" : currentMapping.confidence === "medium" ? "Média" : "Baixa"}
                </span>
              )}
            </div>
            <button
              onClick={() => setSelected({
                source_tier: currentMapping.source_tier as SelectedFactor["source_tier"],
                factor_value: currentMapping.factor_value!,
                factor_unit: currentMapping.factor_unit || "",
                factor_name: currentMapping.factor_name || "",
              })}
              className={cn("w-full text-left p-3 rounded-lg border transition-all",
                selected?.factor_name === currentMapping.factor_name ? "border-[#56B7A5] bg-white" : "border-[#56B7A5]/30 bg-white hover:border-[#56B7A5]"
              )}
            >
              <p className="text-xs font-semibold text-[#030304]">{currentMapping.factor_name}</p>
              <p className="text-[11px] text-[#808181] mt-0.5">Mapeado por: {currentMapping.mapped_by || "auto"}</p>
              <div className="flex items-center gap-3 mt-1.5">
                <span className="text-xs font-bold text-[#56B7A5]">{currentMapping.factor_value} {currentMapping.factor_unit}</span>
              </div>
            </button>
          </div>
        )}

        {/* Auto-match suggestion */}
        {tab === "search" && autoMatch?.best && !search && !(currentMapping && currentMapping.factor_value != null && currentMapping.factor_value > 0) && (
          <div className="px-5 py-3 border-b border-[#E0E4E3] bg-[#FEFCE8]">
            <div className="flex items-center gap-1.5 mb-2">
              <Zap size={12} className="text-[#b45309]" />
              <span className="text-[10px] font-bold text-[#92400e] uppercase tracking-wider">Sugestão automática</span>
              <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded",
                TIER_COLOR[autoMatch.best.source_tier] || "bg-gray-100 text-gray-600"
              )}>
                {TIER_LABEL[autoMatch.best.source_tier] || autoMatch.best.source_tier}
              </span>
              <span className={cn("ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded",
                autoMatch.confidence === "high" ? "bg-[#E6F3EE] text-[#1d7a6b]" :
                autoMatch.confidence === "medium" ? "bg-[#FEF3C7] text-[#92400e]" : "bg-[#F3F4F6] text-[#808181]"
              )}>
                {autoMatch.confidence === "high" ? "Alta confiança" : autoMatch.confidence === "medium" ? "Média confiança" : "Baixa confiança"}
              </span>
            </div>
            <button
              onClick={() => setSelected({
                source_tier: autoMatch.best!.source_tier as SelectedFactor["source_tier"],
                factor_value: autoMatch.best!.factor_value,
                factor_unit: autoMatch.best!.factor_unit,
                factor_name: autoMatch.best!.factor_name,
                ecoinvent_product_id: autoMatch.best!.ecoinvent_product_id,
                ecoinvent_activity_id: autoMatch.best!.ecoinvent_activity_id,
                cecarbon_id: autoMatch.best!.cecarbon_id,
                product_unit: autoMatch.best!.product_unit,
                geography: autoMatch.best!.geography,
              })}
              className={cn("w-full text-left p-3 rounded-lg border transition-all",
                selected?.factor_name === autoMatch.best.factor_name && selected?.source_tier === autoMatch.best.source_tier
                  ? "border-[#56B7A5] bg-[#E6F3EE]" : "border-[#FCD34D] bg-white hover:border-[#56B7A5]"
              )}
            >
              <p className="text-xs font-semibold text-[#030304]">{autoMatch.best.factor_name}</p>
              <p className="text-[11px] text-[#808181] mt-0.5">{autoMatch.best.factor_source}</p>
              <div className="flex items-center gap-3 mt-1.5">
                <span className="text-xs font-bold text-[#56B7A5]">{autoMatch.best.factor_value} {autoMatch.best.factor_unit}</span>
                {autoMatch.best.product_unit && <span className="text-[10px] text-[#808181]">/ {autoMatch.best.product_unit}</span>}
                {autoMatch.best.geography && <span className="text-[10px] text-[#BDBDBC]">{autoMatch.best.geography}</span>}
                <span className="text-[10px] text-[#808181] ml-auto">score {autoMatch.best.score}</span>
              </div>
            </button>
          </div>
        )}

        {/* Search results — all tiers */}
        {tab === "search" && (
          <div className="divide-y divide-[#F0F4F3]">
            {autoLoading && !search && (
              <div className="px-5 py-8 text-center"><Loader2 size={20} className="text-[#56B7A5] animate-spin mx-auto" /></div>
            )}
            {(search ? [
              ...(tierFilter.ghg_protocol ? (results?.ghg_protocol || []).map((r: FactorSearchRow) => ({ ...r, source_tier: "ghg_protocol", factor_name: r.produto, factor_value: r.co2e_total, factor_unit: "kgCO₂e", factor_source: r.versao_ghg || "GHG Protocol" })) : []),
              ...(tierFilter.cecarbon ? (results?.cecarbon || []).map((r: FactorSearchRow) => ({ ...r, source_tier: "cecarbon", factor_name: r["Descrição fator de emissao"] || r.description || "", factor_value: r["fator de emissão (kgCO2)"] || r.factor_value || 0, factor_unit: `kgCO₂/${r["Unidade"] || r.unit || "t"}`, factor_source: r["Referencia"] || r.reference || "CECarbon", product_unit: r["Unidade"] || r.unit || "", cecarbon_id: r.id })) : []),
              ...(tierFilter.ecoinvent ? (results?.ecoinvent || []).map((r: FactorSearchRow) => ({ ...r, source_tier: "ecoinvent", factor_name: r.product_name, factor_value: r.impact_score, factor_unit: r.impact_unit, factor_source: r.activity_name, product_unit: r.product_unit })) : []),
            ] : autoMatch?.results)?.map((r: FactorSearchRow, i: number) => {
              const tier = r.source_tier || "ecoinvent";
              const name = r.factor_name || r.product_name || "";
              const value = r.factor_value ?? r.impact_score ?? 0;
              const unit = r.factor_unit || r.impact_unit || "";
              const source = r.factor_source || r.activity_name || "";
              const geo = r.geography || "";
              const pUnit = r.product_unit || "";
              const score = r.score;
              const isSelected = selected?.factor_name === name && selected?.source_tier === tier;
              return (
                <button key={`${tier}-${name}-${i}`}
                  onClick={() => setSelected({
                    source_tier: tier,
                    factor_value: typeof value === "number" ? value : parseFloat(value) || 0,
                    factor_unit: unit,
                    factor_name: name,
                    ecoinvent_product_id: r.product_id || r.ecoinvent_product_id,
                    ecoinvent_activity_id: r.activity_id || r.ecoinvent_activity_id,
                    cecarbon_id: r.cecarbon_id,
                    product_unit: pUnit,
                    geography: geo,
                  })}
                  className={cn("w-full text-left px-5 py-3 transition-all hover:bg-[#F8FAF9]",
                    isSelected && "bg-[#E6F3EE] hover:bg-[#E6F3EE]")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider", TIER_COLOR[tier] || "bg-gray-100 text-gray-600")}>
                          {TIER_LABEL[tier] || tier}
                        </span>
                      </div>
                      <p className={cn("text-xs font-semibold leading-snug", isSelected ? "text-[#1d7a6b]" : "text-[#030304]")}>
                        {name}
                      </p>
                      <p className="text-[11px] text-[#808181] mt-0.5 truncate">{source}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {geo && <span className="text-[10px] text-[#BDBDBC]"><Globe size={9} className="inline mr-0.5" />{geo}</span>}
                        {pUnit && <span className="text-[10px] text-[#BDBDBC]">/ {pUnit}</span>}
                        {score != null && <span className="text-[10px] text-[#BDBDBC]">score {score}</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={cn("text-xs font-bold", isSelected ? "text-[#56B7A5]" : "text-[#030304]")}>
                        {value}
                      </p>
                      <p className="text-[10px] text-[#808181]">{unit}</p>
                    </div>
                  </div>
                  {isSelected && (
                    <div className="flex items-center gap-1 mt-1.5">
                      <CheckCircle size={11} className="text-[#56B7A5]" />
                      <span className="text-[10px] text-[#56B7A5] font-semibold">Selecionado</span>
                    </div>
                  )}
                </button>
              );
            })}
            {search && results && (results.ecoinvent.length + results.ghg_protocol.length + (results.cecarbon?.length || 0)) === 0 && (
              <p className="text-xs text-[#BDBDBC] px-5 py-6 text-center">Nenhum fator encontrado</p>
            )}
          </div>
        )}

        {/* EPD Catalog */}
        {tab === "epd_catalog" && (
          <div className="divide-y divide-[#F0F4F3]">
            {!search && (
              <div className="px-5 py-4 text-center">
                <BookOpen size={24} className="text-[#BDBDBC] mx-auto mb-2" />
                <p className="text-xs text-[#808181]">Busque por material para encontrar EPDs certificados</p>
                <p className="text-[10px] text-[#BDBDBC] mt-1">Os valores de emissão estão nos PDFs — consulte e insira manualmente</p>
              </div>
            )}
            {results?.epd_catalog.map((epd) => (
              <div key={epd.id} className="px-5 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#030304] leading-snug">{epd.titulo}</p>
                    <p className="text-[11px] text-[#808181] mt-0.5">{epd.company_name} · {epd.country}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {epd.status && (
                        <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded",
                          epd.status === "Valid" ? "bg-[#E6F3EE] text-[#1d7a6b]" : "bg-[#F3F4F6] text-[#808181]"
                        )}>{epd.status}</span>
                      )}
                      {epd.geographical_scopes && <span className="text-[10px] text-[#BDBDBC]">{epd.geographical_scopes}</span>}
                      {epd.valid_until && <span className="text-[10px] text-[#BDBDBC]">Válido até {epd.valid_until}</span>}
                    </div>
                  </div>
                </div>
                {epd.informacao_produto && (
                  <p className="text-[11px] text-[#808181] mt-2 leading-relaxed line-clamp-2">{epd.informacao_produto}</p>
                )}
                <div className="flex gap-2 mt-2.5">
                  {epd.pdf_url && (
                    <a href={epd.pdf_url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold bg-[#E6F3EE] text-[#1d7a6b] hover:bg-[#d0ebe1] transition-all">
                      <FileText size={11} /> Ver PDF
                    </a>
                  )}
                  {epd.source_url && (
                    <a href={epd.source_url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold bg-[#F3F4F6] text-[#808181] hover:bg-[#E0E4E3] transition-all">
                      <ExternalLink size={11} /> Fonte
                    </a>
                  )}
                  <button onClick={() => { setTab("manual"); setManualName(epd.titulo); }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold bg-[#FEF3C7] text-[#92400e] hover:bg-[#FDE68A] transition-all ml-auto">
                    <Pencil size={11} /> Inserir fator manualmente
                  </button>
                </div>
              </div>
            ))}
            {search && results?.epd_catalog.length === 0 && (
              <p className="text-xs text-[#BDBDBC] px-5 py-6 text-center">Nenhum EPD encontrado para &quot;{search}&quot;</p>
            )}
          </div>
        )}

        {/* Manual factor entry */}
        {tab === "manual" && (
          <div className="px-5 py-5 space-y-4">
            <div className="p-3 bg-[#F8FAF9] rounded-lg">
              <p className="text-xs text-[#808181]">
                Insira manualmente o fator de emissão — ideal para valores extraídos de EPDs ou fontes próprias.
              </p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#404040] mb-1.5">Nome do fator</label>
              <input value={manualName} onChange={(e) => setManualName(e.target.value)}
                placeholder="Ex: Concreto usinado Fck=30 — Votorantim" className={inputClass} />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-[#404040] mb-1.5">Valor (kgCO₂e)</label>
                <input type="number" value={manualValue} onChange={(e) => setManualValue(e.target.value)}
                  placeholder="Ex: 355" className={inputClass} />
              </div>
              <div className="w-36">
                <label className="block text-xs font-semibold text-[#404040] mb-1.5">Unidade</label>
                <select value={manualUnit} onChange={(e) => setManualUnit(e.target.value)} className={inputClass}>
                  <option>kgCO₂e/kg</option>
                  <option>kgCO₂e/m³</option>
                  <option>kgCO₂e/m²</option>
                  <option>kgCO₂e/L</option>
                  <option>kgCO₂e/un</option>
                  <option>kgCO₂e/kWh</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#404040] mb-1.5">Fonte / referência</label>
              <input value={manualSource} onChange={(e) => setManualSource(e.target.value)}
                placeholder="Ex: EPD Votorantim 2024, página 12" className={inputClass} />
            </div>
            {manualValue && (
              <div className="bg-[#E6F3EE] rounded-lg px-3 py-2.5 text-xs text-[#1d7a6b]">
                <p className="font-semibold mb-0.5">Emissão estimada</p>
                <p className="font-mono">
                  {item.quantity.toLocaleString("pt-BR")} {item.unit} × {manualValue} {manualUnit} ={" "}
                  {(item.quantity * parseFloat(manualValue || "0")).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kgCO₂e
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="px-5 py-4 border-t border-[#E0E4E3] space-y-3">
        <label className="flex items-center gap-2 cursor-pointer text-xs text-[#404040]">
          <input
            type="checkbox"
            checked={saveAsRule}
            onChange={(e) => setSaveAsRule(e.target.checked)}
            className="w-3.5 h-3.5 rounded border-[#E0E4E3] text-[#56B7A5] focus:ring-[#56B7A5]"
          />
          <BookOpen size={12} className="text-[#56B7A5]" />
          Salvar como regra para itens similares
        </label>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={onBack}>Cancelar</Button>
          <Button size="sm" className="flex-1" onClick={handleConfirm}
            disabled={saving || (tab !== "manual" ? !selected : !manualValue)}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
            {tab === "manual" ? "Salvar fator" : "Confirmar fator"}
          </Button>
        </div>
      </div>
    </>
  );
}

// ─── View: Parametrizar ──────────────────────────────────────────────────────

function ParametrizeView({ item, onBack, onSaved }: { item: AbcItem; onBack: () => void; onSaved?: () => void }) {
  const [distancia, setDistancia] = useState("");
  const [modal, setModal] = useState("caminhao");
  const [premissaB, setPremissaB] = useState("excluir");
  const [fuelType, setFuelType] = useState("diesel");
  const [consumo, setConsumo] = useState("15");
  const [premissaF, setPremissaF] = useState("excluir");
  const [eqCategory, setEqCategory] = useState("");
  const [eqFactor, setEqFactor] = useState("2.643");
  const [eqFactorUnit, setEqFactorUnit] = useState("kgCO₂/L");
  const [eqFactorSource, setEqFactorSource] = useState("BEN 2023");
  const [eqScope, setEqScope] = useState(1);
  const [eqSaving, setEqSaving] = useState(false);
  const [eqSaveAsRule, setEqSaveAsRule] = useState(true);
  const [eqLoading, setEqLoading] = useState(false);

  // Load equipment suggestion on mount for Tipo E
  useEffect(() => {
    if (item.itemType !== "E") return;
    setEqLoading(true);
    import("@/lib/api/equipment-rules").then(({ suggestEquipment }) => {
      suggestEquipment(item.id).then((s) => {
        setEqCategory(s.category);
        setFuelType(s.fuel_type);
        setConsumo(String(s.consumption_per_hour));
        setEqFactor(String(s.emission_factor_value));
        setEqFactorUnit(s.emission_factor_unit);
        setEqFactorSource(s.emission_factor_source);
        setEqScope(s.scope);
        if (s.fuel_type === "electric") {
          setEqFactorUnit("kgCO₂/kWh");
        }
      }).catch(() => {}).finally(() => setEqLoading(false));
    });
  }, [item.id, item.itemType]);

  // Update factor when fuel type changes
  const handleFuelChange = (fuel: string) => {
    setFuelType(fuel);
    const factors: Record<string, { value: string; unit: string; source: string; scope: number }> = {
      diesel: { value: "2.643", unit: "kgCO₂/L", source: "BEN 2023", scope: 1 },
      gasoline: { value: "2.303", unit: "kgCO₂/L", source: "BEN 2023", scope: 1 },
      electric: { value: "0.0293", unit: "kgCO₂/kWh", source: "SIN 2024", scope: 2 },
      glp: { value: "1.536", unit: "kgCO₂/kg", source: "BEN 2023", scope: 1 },
      none: { value: "0", unit: "-", source: "-", scope: 0 },
    };
    const f = factors[fuel] || factors.diesel;
    setEqFactor(f.value);
    setEqFactorUnit(f.unit);
    setEqFactorSource(f.source);
    setEqScope(f.scope);
  };

  const handleSaveEquipment = async () => {
    setEqSaving(true);
    try {
      // Save equipment rule
      const { createEquipmentRule } = await import("@/lib/api/equipment-rules");
      await createEquipmentRule({
        original_description: item.description,
        category: eqCategory || item.description.toLowerCase(),
        fuel_type: fuelType,
        consumption_per_hour: parseFloat(consumo),
        consumption_unit: fuelType === "electric" ? "kWh/h" : fuelType === "glp" ? "kg/h" : "L/h",
        emission_factor_value: parseFloat(eqFactor),
        emission_factor_unit: eqFactorUnit,
        emission_factor_source: eqFactorSource,
        emission_factor_tier: "ghg_protocol",
        scope: eqScope,
      });

      // Also save as item mapping so emission is calculated
      const totalFactor = parseFloat(consumo) * parseFloat(eqFactor);
      await confirmMapping(item.id, {
        source_tier: "ghg_protocol",
        factor_value: totalFactor,
        factor_unit: fuelType === "electric" ? "kgCO₂/kWh·h" : "kgCO₂/L·h",
        factor_name: `${eqCategory || item.description} (${consumo} ${fuelType === "electric" ? "kWh/h" : "L/h"} × ${eqFactor} ${eqFactorUnit})`,
      });

      onSaved?.();
      onBack();
    } catch (e) {
      alert("Erro ao salvar: " + (e instanceof Error ? e.message : "erro"));
    }
    setEqSaving(false);
  };

  const inputClass = "w-full h-9 px-3 rounded-lg border border-[#E0E4E3] text-sm text-[#030304] bg-[#F8FAF9] focus:outline-none focus:border-[#56B7A5] focus:bg-white transition-all";
  const selectClass = inputClass;

  return (
    <>
      <div className="flex-1 overflow-y-auto py-5 px-5 space-y-5">

        {/* Tipo A — Logística */}
        {item.itemType === "A" && (
          <>
            <div>
              <p className="text-xs font-bold text-[#030304] mb-3">Logística — Escopo 3</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-[#404040] mb-1.5">Distância (km)</label>
                  <input type="number" value={distancia} onChange={(e) => setDistancia(e.target.value)}
                    placeholder="Ex: 350" className={inputClass} />
                  <p className="text-[10px] text-[#808181] mt-1">Distância da fábrica/fornecedor até a obra.</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#404040] mb-1.5">Modal de transporte</label>
                  <select value={modal} onChange={(e) => setModal(e.target.value)} className={selectClass}>
                    <option value="caminhao">Caminhão (0,062 kgCO₂e/t·km)</option>
                    <option value="trem">Trem (0,011 kgCO₂e/t·km)</option>
                    <option value="navio">Navio (0,008 kgCO₂e/t·km)</option>
                  </select>
                </div>
                {distancia && (
                  <div className="bg-[#E6F3EE] rounded-lg px-3 py-2.5 text-xs text-[#1d7a6b]">
                    <p className="font-semibold mb-0.5">Emissão estimada de logística</p>
                    <p className="font-mono">
                      {item.quantity.toLocaleString("pt-BR")} {item.unit} × {distancia} km × fator modal
                    </p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Tipo B — Mão de Obra */}
        {item.itemType === "B" && (
          <div>
            <p className="text-xs font-bold text-[#030304] mb-1">Premissa metodológica</p>
            <p className="text-xs text-[#808181] mb-3">Como tratar este item no inventário de carbono?</p>
            <div className="space-y-2">
              {[
                { value: "excluir", label: "Excluir do inventário", desc: "Foco em carbono incorporado de materiais (recomendado para Escopo 3)." },
                { value: "indireto", label: "Incluir via fator indireto", desc: "0,03 kgCO₂e/h por trabalhador (referência IPCC)." },
                { value: "escopo3", label: "Incluir via deslocamento", desc: "Escopo 3 de transporte de trabalhadores até a obra." },
              ].map((opt) => (
                <label key={opt.value}
                  className={cn("flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                    premissaB === opt.value ? "border-[#56B7A5] bg-[#E6F3EE]" : "border-[#E0E4E3] hover:border-[#81C8B9]")}>
                  <input type="radio" value={opt.value} checked={premissaB === opt.value}
                    onChange={() => setPremissaB(opt.value)} className="mt-0.5 accent-[#56B7A5]" />
                  <div>
                    <p className="text-xs font-semibold text-[#030304]">{opt.label}</p>
                    <p className="text-[11px] text-[#808181] mt-0.5">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>
            {premissaB !== "excluir" && (
              <div className="mt-3 p-3 bg-[#FEF3C7] border border-[#FCD34D] rounded-lg text-xs text-[#92400e] flex gap-2">
                <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                Campos adicionais necessários. A equipe ZNIT entrará em contato para coleta dos dados.
              </div>
            )}
            <label className="flex items-center gap-2 mt-4 text-xs text-[#404040]">
              <input type="checkbox" className="accent-[#56B7A5]" />
              Aplicar esta premissa a todos os itens Tipo B do projeto
            </label>
          </div>
        )}

        {/* Tipo C — Agrupado */}
        {item.itemType === "C" && (
          <div>
            <p className="text-xs font-bold text-[#030304] mb-1">Decomposição do item agrupado</p>
            <p className="text-xs text-[#808181] mb-3">
              Este item engloba múltiplos serviços. Informe a distribuição do custo entre eles.
            </p>
            <div className="space-y-2">
              {[
                { label: "Terraplenagem / Escavação", pct: "58%" },
                { label: "Pavimentação", pct: "27%" },
                { label: "Drenagem", pct: "15%" },
              ].map((sub, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input defaultValue={sub.label}
                    className="flex-1 h-8 px-2.5 rounded-lg border border-[#E0E4E3] text-xs text-[#030304] bg-[#F8FAF9] focus:outline-none focus:border-[#56B7A5]" />
                  <input defaultValue={sub.pct}
                    className="w-14 h-8 px-2.5 rounded-lg border border-[#E0E4E3] text-xs text-center text-[#030304] bg-[#F8FAF9] focus:outline-none focus:border-[#56B7A5]" />
                </div>
              ))}
            </div>
            <button className="mt-2 text-xs text-[#56B7A5] font-semibold hover:underline">
              + Adicionar sub-item
            </button>
            <div className="mt-3 p-3 bg-[#F8FAF9] rounded-lg text-[11px] text-[#808181]">
              Distribuição estimada com base em obras industriais similares. Ajuste conforme os dados reais do projeto.
            </div>
          </div>
        )}

        {/* Tipo D — Material Embutido */}
        {item.itemType === "D" && (
          <div>
            <p className="text-xs font-bold text-[#030304] mb-1">Verificação de dupla contagem</p>
            <p className="text-xs text-[#808181] mb-3">
              Este item é um serviço aplicado sobre material que pode já ter sido contabilizado.
            </p>
            <div className="p-3 bg-[#FEF3C7] border border-[#FCD34D] rounded-lg flex gap-2 mb-4">
              <AlertTriangle size={13} className="text-[#b45309] shrink-0 mt-0.5" />
              <p className="text-xs text-[#92400e]">
                O material associado (ex: Aço CA50) já foi contabilizado como Tipo A. Incluir este serviço pode gerar dupla contagem.
              </p>
            </div>
            <div className="space-y-2">
              {[
                { value: "excluir", label: "Excluir — material já contabilizado", desc: "Recomendado quando o material base já tem EPD mapeado." },
                { value: "incluir", label: "Incluir energia do processo", desc: "Apenas a energia consumida no processo (ex: kWh de corte e dobra)." },
              ].map((opt) => (
                <label key={opt.value}
                  className={cn("flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                    premissaF === opt.value ? "border-[#56B7A5] bg-[#E6F3EE]" : "border-[#E0E4E3] hover:border-[#81C8B9]")}>
                  <input type="radio" value={opt.value} checked={premissaF === opt.value}
                    onChange={() => setPremissaF(opt.value)} className="mt-0.5 accent-[#56B7A5]" />
                  <div>
                    <p className="text-xs font-semibold text-[#030304]">{opt.label}</p>
                    <p className="text-[11px] text-[#808181] mt-0.5">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Tipo E — Equipamento */}
        {item.itemType === "E" && (
          <div>
            <p className="text-xs font-bold text-[#030304] mb-1">Configurar Equipamento</p>
            <p className="text-xs text-[#808181] mb-3">
              Defina a cadeia de conversão: horas → consumo/hora → fator de emissão
            </p>
            {eqLoading ? (
              <div className="flex items-center gap-2 py-4 text-xs text-[#808181]">
                <Loader2 size={14} className="animate-spin" /> Buscando sugestão...
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-[#404040] mb-1.5">Categoria</label>
                  <input type="text" value={eqCategory} onChange={(e) => setEqCategory(e.target.value)}
                    placeholder="Ex: retroescavadeira" className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#404040] mb-1.5">Tipo de combustível</label>
                  <select value={fuelType} onChange={(e) => handleFuelChange(e.target.value)} className={selectClass}>
                    <option value="diesel">Diesel</option>
                    <option value="gasoline">Gasolina</option>
                    <option value="electric">Elétrico (grid BR)</option>
                    <option value="glp">GLP</option>
                    <option value="none">Sem combustão (ex: andaime)</option>
                  </select>
                </div>
                {fuelType !== "none" && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-[#404040] mb-1.5">
                        Consumo por hora ({fuelType === "electric" ? "kWh/h" : fuelType === "glp" ? "kg/h" : "L/h"})
                      </label>
                      <input type="number" step="0.1" value={consumo} onChange={(e) => setConsumo(e.target.value)}
                        placeholder="Ex: 15" className={inputClass} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#404040] mb-1.5">
                        Fator de emissão ({eqFactorUnit})
                      </label>
                      <div className="flex gap-2">
                        <input type="number" step="0.001" value={eqFactor} onChange={(e) => setEqFactor(e.target.value)}
                          className={cn(inputClass, "flex-1")} />
                        <span className="text-[10px] text-[#808181] self-center whitespace-nowrap">{eqFactorSource}</span>
                      </div>
                    </div>
                    <div className="text-[10px] text-[#808181]">
                      Scope {eqScope} — {eqScope === 1 ? "Combustão direta" : "Energia elétrica"}
                    </div>
                  </>
                )}
                {consumo && eqFactor && fuelType !== "none" && (
                  <div className="bg-[#E6F3EE] rounded-lg px-3 py-2.5 text-xs text-[#1d7a6b]">
                    <p className="font-semibold mb-1">Cálculo de emissão</p>
                    <p className="font-mono text-[11px]">
                      {item.quantity.toLocaleString("pt-BR")} h × {consumo}{" "}
                      {fuelType === "electric" ? "kWh/h" : fuelType === "glp" ? "kg/h" : "L/h"} × {eqFactor} {eqFactorUnit}
                    </p>
                    <p className="font-bold mt-1">
                      = {(item.quantity * parseFloat(consumo || "0") * parseFloat(eqFactor || "0")).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kgCO₂e
                      {" "}({((item.quantity * parseFloat(consumo || "0") * parseFloat(eqFactor || "0")) / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} tCO₂e)
                    </p>
                  </div>
                )}
                {fuelType === "none" && (
                  <div className="bg-[#F3F4F6] rounded-lg px-3 py-2.5 text-xs text-[#808181]">
                    Equipamento sem combustão direta — emissão = 0. Pode ser excluído do inventário ou tratado como material (Tipo A).
                  </div>
                )}
                <label className="flex items-center gap-2 text-xs text-[#404040]">
                  <input type="checkbox" checked={eqSaveAsRule} onChange={(e) => setEqSaveAsRule(e.target.checked)}
                    className="w-3.5 h-3.5 accent-[#56B7A5]" />
                  <BookOpen size={12} className="text-[#56B7A5]" />
                  Salvar como regra para equipamentos similares
                </label>
              </div>
            )}
          </div>
        )}

        {/* Tipo F — Administrativo */}
        {item.itemType === "F" && (
          <div>
            <p className="text-xs font-bold text-[#030304] mb-1">Decisão de escopo</p>
            <p className="text-xs text-[#808181] mb-3">
              Itens administrativos não têm emissão direta. Defina se inclui no inventário.
            </p>
            <div className="space-y-2">
              {[
                { value: "excluir", label: "Excluir do inventário", desc: "Com justificativa registrada no memorando de cálculo." },
                { value: "incluir", label: "Incluir com fator genérico", desc: "Aplica fator estimado com base na categoria do item." },
              ].map((opt) => (
                <label key={opt.value}
                  className={cn("flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                    premissaF === opt.value ? "border-[#56B7A5] bg-[#E6F3EE]" : "border-[#E0E4E3] hover:border-[#81C8B9]")}>
                  <input type="radio" value={opt.value} checked={premissaF === opt.value}
                    onChange={() => setPremissaF(opt.value)} className="mt-0.5 accent-[#56B7A5]" />
                  <div>
                    <p className="text-xs font-semibold text-[#030304]">{opt.label}</p>
                    <p className="text-[11px] text-[#808181] mt-0.5">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>
            <label className="flex items-center gap-2 mt-4 text-xs text-[#404040]">
              <input type="checkbox" className="accent-[#56B7A5]" />
              Aplicar esta decisão a todos os itens Tipo F do projeto
            </label>
          </div>
        )}

        {/* Notas */}
        <div>
          <label className="block text-xs font-semibold text-[#404040] mb-1.5">Notas / justificativa</label>
          <textarea
            rows={3}
            placeholder="Registre observações que serão incluídas no memorando de cálculo..."
            className="w-full px-3 py-2 rounded-lg border border-[#E0E4E3] text-xs text-[#030304] bg-[#F8FAF9] placeholder:text-[#BDBDBC] focus:outline-none focus:border-[#56B7A5] focus:bg-white transition-all resize-none"
          />
        </div>
      </div>

      <div className="px-5 py-4 border-t border-[#E0E4E3] flex gap-2">
        <Button variant="outline" size="sm" className="flex-1" onClick={onBack}>Cancelar</Button>
        {item.itemType === "E" && fuelType !== "none" ? (
          <Button size="sm" className="flex-1" onClick={handleSaveEquipment} disabled={eqSaving || !consumo || !eqFactor}>
            {eqSaving ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
            Salvar equipamento
          </Button>
        ) : (
          <Button size="sm" className="flex-1" onClick={onBack}>
            <CheckCircle size={13} /> Salvar premissa
          </Button>
        )}
      </div>
    </>
  );
}

// ─── Drawer wrapper ──────────────────────────────────────────────────────────

type DrawerView = "detail" | "edit-epd" | "parametrize";

function ItemDrawer({
  item,
  onClose,
  onSaved,
  onFactorSaveRequest,
  onExcludeRequest,
}: {
  item: AbcItem;
  onClose: () => void;
  onSaved?: () => void;
  /** When provided, EditEpdView delegates the save to the page-level
   *  SaveModeDialog instead of calling confirmMapping itself. */
  onFactorSaveRequest?: (body: MappingConfirmRequest, factorLabel: string, onFinish: () => void) => void;
  /** When provided, the 'Desconsiderar' button opens the page-level
   *  exclusion dialog. */
  onExcludeRequest?: (item: AbcItem, onFinish: () => void) => void;
}) {
  const [view, setView] = useState<DrawerView>("detail");
  const [mapping, setMapping] = useState<MappingResponse | null>(null);

  useEffect(() => {
    getMapping(item.id).then(setMapping).catch(() => setMapping(null));
  }, [item.id]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-[420px] bg-white shadow-[0_0_40px_rgba(3,3,4,0.15)] flex flex-col">
        <DrawerHeader
          item={item}
          onClose={onClose}
          back={view !== "detail" ? () => setView("detail") : undefined}
          backLabel="Voltar ao detalhe"
        />
        {view === "detail"     && (
          <DetailView
            item={item}
            mapping={mapping}
            onEditEpd={() => setView("edit-epd")}
            onParametrize={() => setView("parametrize")}
            onExclude={
              onExcludeRequest
                ? () => onExcludeRequest(item, () => onClose())
                : undefined
            }
          />
        )}
        {view === "edit-epd"   && <EditEpdView item={item} onBack={() => setView("detail")} onSaved={onSaved} onFactorSaveRequest={onFactorSaveRequest} onClose={onClose} />}
        {view === "parametrize"&& <ParametrizeView item={item} onBack={() => setView("detail")} onSaved={onSaved} />}
      </div>
    </>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ItemsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const highlightItemId = searchParams.get("item");
  const curveIdParam = searchParams.get("curve_id");
  const statusParam = searchParams.get("status");
  const typeParam = searchParams.get("type");
  const factorParam = searchParams.get("factor");
  const initialStatus =
    statusParam === "auto" || statusParam === "suggested" || statusParam === "pending" || statusParam === "excluded"
      ? statusParam
      : "all";
  const initialType: ItemType | "all" | "compositions" =
    typeParam === "compositions" ? "compositions" : "all";
  const [typeFilter, setTypeFilter] = useState<ItemType | "all" | "compositions">(initialType);
  const classParam = searchParams.get("class");
  const initialClass: AbcClass | "all" =
    classParam === "P1" || classParam === "P2" || classParam === "P3" ? classParam : "all";
  const [classFilter, setClassFilter] = useState<AbcClass | "all">(initialClass);
  const [statusFilter, setStatusFilter] = useState<"all" | "auto" | "suggested" | "pending" | "excluded">(initialStatus);
  const [search, setSearch] = useState(factorParam ?? "");
  const [openItem, setOpenItem] = useState<AbcItem | null>(null);
  const [expandedComps, setExpandedComps] = useState<Set<string>>(new Set());
  const [autoMapping, setAutoMapping] = useState(false);
  const [autoMapResult, setAutoMapResult] = useState<{ auto_mapped: number; suggested: number; pending: number; already_mapped: number } | null>(null);
  const [items, setItems] = useState<AbcItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectName, setProjectName] = useState("");
  const { scenarios, activeScenarioId, activeScenario, setActiveScenarioId, reload: reloadScenarios } =
    useActiveScenario(projectId);
  const [selectedCurveId, setSelectedCurveId] = useState<string | null>(curveIdParam);
  const [pendingFactorSave, setPendingFactorSave] = useState<{
    body: MappingConfirmRequest;
    itemId: string;
    factorLabel: string;
    /** Set when the source_tier is "epd" — controls the cost-change UI in
     *  the SaveModeDialog. */
    askCostChange?: boolean;
    currentUnitCost?: number;
    itemUnit?: string;
    itemQuantity?: number;
    onFinish?: () => void;
  } | null>(null);
  const [saveModeBusy, setSaveModeBusy] = useState(false);
  const [pendingExclude, setPendingExclude] = useState<{
    item: AbcItem;
    onFinish?: () => void;
  } | null>(null);
  const [excludeBusy, setExcludeBusy] = useState(false);

  // Whenever the active scenario changes, resolve its abc_curve_id so the
  // items list filters to the right curve (cenários can in theory point at
  // different historical curves).
  useEffect(() => {
    if (!activeScenarioId) return;
    fetch(`/api/scenarios/${activeScenarioId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.abc_curve_id) {
          setSelectedCurveId(data.abc_curve_id);
          setExpandedComps(new Set());
        }
      })
      .catch(() => {});
  }, [activeScenarioId]);

  // Carregar itens da API. Se o projeto ainda tem linhas vindas do
  // classificador antigo (legacy_auto_excluded), dispara reclassify em
  // background uma única vez por carregamento e refaz a busca. Roda
  // silencioso — o usuário só vê os números corretos no fim.
  const loadItems = useCallback(async () => {
    // Overlay the active scenario so the Items page reflects scenario
    // substitutions (Pareto reads from scenario_items too, so this keeps
    // the two views in sync — clicking a Pareto bar finds its items).
    const filters = {
      ...(selectedCurveId ? { curve_id: selectedCurveId } : {}),
      ...(activeScenarioId ? { scenario_id: activeScenarioId } : {}),
    };
    try {
      const [data, proj] = await Promise.all([
        listAbcItems(projectId, filters),
        getProject(projectId),
      ]);
      setProjectName(proj.name);

      const needsLegacyHeal = data.some(
        (r) => r.legacy_auto_excluded || r.legacy_epd_auto_mapped,
      );
      if (needsLegacyHeal) {
        try {
          await reclassifyBlocked(projectId);
          const refreshed = await listAbcItems(projectId, filters);
          const refreshedItems = refreshed.map(toAbcItem);
          setItems(refreshedItems);
          setOpenItem((prev) => {
            if (!prev) return null;
            return refreshedItems.find((i) => i.id === prev.id) ?? prev;
          });
          setLoading(false);
          return;
        } catch (e) {
          console.warn("[items] reclassify auto-trigger failed", e);
          // fall through and just render the unrescued data
        }
      }

      const newItems = data.map(toAbcItem);
      setItems(newItems);
      setOpenItem((prev) => {
        if (!prev) return null;
        return newItems.find((i) => i.id === prev.id) ?? prev;
      });
    } catch {
      console.error("Erro ao carregar itens");
    }
    setLoading(false);
  }, [selectedCurveId, projectId, activeScenarioId]);

  useEffect(() => { loadItems(); }, [loadItems]);

  // Keep the search input in sync with ?factor= so coming back from
  // Visão Geral (Pareto click) with a different factor refreshes the
  // filter instead of keeping the previous one. Setting null clears.
  useEffect(() => {
    if (factorParam != null) setSearch(factorParam);
  }, [factorParam]);

  // Auto-open item from query param ?item=ID (linked from scenarios page)
  useEffect(() => {
    if (highlightItemId && items.length > 0 && !openItem) {
      const found = items.find((i) => i.id === highlightItemId);
      if (found) setOpenItem(found);
    }
  }, [highlightItemId, items]);

  const handleAutoMap = async () => {
    setAutoMapping(true);
    setAutoMapResult(null);
    try {
      const result = await autoMapProject(projectId);
      setAutoMapResult({ auto_mapped: result.auto_mapped, suggested: result.suggested, pending: result.pending, already_mapped: result.already_mapped });
      // Recarregar itens para atualizar status
      await loadItems();
    } catch (e) {
      alert("Erro ao executar auto-map");
    }
    setAutoMapping(false);
  };

  // Helper for the "Composições" filter — keep items that either have
  // sub-composições from the Relatório Proof OR are a Tipo C blocked
  // parent with real DB children from a Planilha de Insumos. Children
  // (parent_item_id set) are also kept so the parent expands naturally.
  const compositionParentIds = new Set<string>();
  if (typeFilter === "compositions") {
    for (const it of items) {
      if (it.parentItemId == null) {
        const hasAssemblies = (it.assemblies?.length ?? 0) > 0;
        const isBlockedC = it.mappingStatus === "blocked" && it.itemType === "C";
        if (hasAssemblies || isBlockedC) compositionParentIds.add(it.id);
      }
    }
  }

  const filtered = items.filter((item) => {
    if (typeFilter === "compositions") {
      const isComp = compositionParentIds.has(item.id);
      const isChildOfComp =
        item.parentItemId != null && compositionParentIds.has(item.parentItemId);
      if (!isComp && !isChildOfComp) return false;
    } else if (typeFilter !== "all" && item.itemType !== typeFilter) return false;
    if (classFilter !== "all" && item.abcClass !== classFilter) return false;
    if (statusFilter === "auto" && item.mappingStatus !== "auto") return false;
    if (statusFilter === "suggested" && item.mappingStatus !== "manual") return false;
    // Pending = só itens cujo auto-map não achou fator (Tipo A pending).
    // Composições (status 'blocked') vivem na aba própria — não devem
    // poluir o bucket de pendentes.
    if (statusFilter === "pending" && item.mappingStatus !== "pending") return false;
    if (statusFilter === "excluded" && item.mappingStatus !== "excluded") return false;
    if (search) {
      const q = search.toLowerCase();
      const inDesc = item.description.toLowerCase().includes(q);
      const inCost = item.costCode.toLowerCase().includes(q);
      const inFactor = (item.epd ?? "").toLowerCase().includes(q);
      if (!inDesc && !inCost && !inFactor) return false;
    }
    return true;
  });

  return (
    <div className="p-7">
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-xs font-semibold text-[#808181] uppercase tracking-widest mb-1">{projectName}</p>
          <h1 className="text-2xl font-bold text-[#030304]">Itens</h1>
          <p className="text-sm text-[#808181] mt-0.5">{items.length} itens</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleAutoMap} disabled={autoMapping}>
            {autoMapping ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
            {autoMapping ? "Mapeando..." : "Auto-Map Tipo A"}
          </Button>
          <Button variant="outline" size="sm" onClick={async () => {
            try {
              const base = process.env.NEXT_PUBLIC_API_URL ?? "";
              const projResp = await fetch(`${base}/api/projects/${projectId}`, { credentials: "include" });
              const projData = await projResp.json();
              const projName = (projData.name || "Projeto").replace(/\s+/g, "_").replace(/\//g, "-");
              const date = new Date().toISOString().slice(0, 10);
              const resp = await fetch(`${base}/api/projects/${projectId}/export-items`, { credentials: "include" });
              const blob = await resp.blob();
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `ZNIT_${projName}_${date}.xlsx`;
              a.click();
              URL.revokeObjectURL(a.href);
            } catch {}
          }}><Download size={14} /> Exportar Excel</Button>
        </div>
      </div>

      {autoMapResult && (
        <div className="bg-[#E6F3EE] border border-[#56B7A5]/30 rounded-lg px-4 py-3 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-4 text-xs flex-wrap">
            <CheckCircle size={16} className="text-[#56B7A5] shrink-0" />
            <span className="font-semibold text-[#1d7a6b]">Auto-Map concluído:</span>
            {autoMapResult.already_mapped > 0 && (
              <span className="text-[#56B7A5]"><strong>{autoMapResult.already_mapped}</strong> já mapeados</span>
            )}
            {autoMapResult.auto_mapped > 0 && (
              <span className="text-[#030304]"><strong>{autoMapResult.auto_mapped}</strong> novos (alta confiança)</span>
            )}
            {autoMapResult.suggested > 0 && (
              <span className="text-[#b45309]"><strong>{autoMapResult.suggested}</strong> sugeridos (revisar)</span>
            )}
            <span className="text-[#808181]"><strong>{autoMapResult.pending}</strong> pendentes (mapear manual)</span>
          </div>
          <button onClick={() => setAutoMapResult(null)} className="text-[#808181] hover:text-[#030304] shrink-0 ml-2"><X size={14} /></button>
        </div>
      )}

      <div className="bg-white rounded-lg border border-[#E0E4E3] p-4 mb-4 flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#BDBDBC]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por descrição ou CostCode..."
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-[#E0E4E3] text-sm text-[#030304] placeholder:text-[#BDBDBC] focus:outline-none focus:border-[#56B7A5] transition-all" />
        </div>
        <div className="flex items-center gap-1">
          <Filter size={13} className="text-[#808181]" />
          <span className="text-xs text-[#808181] mr-1">Tipo:</span>
          {allTypes.map((t) => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className={cn("px-2.5 py-1 rounded text-xs font-semibold transition-all",
                typeFilter === t
                  ? (t === "compositions" ? "bg-[#9333EA] text-white" : "bg-[#56B7A5] text-white")
                  : "bg-[#F3F4F6] text-[#808181] hover:bg-[#E0E4E3]")}>
              {t === "all" ? "Todos" : t === "compositions" ? "Composições" : `Tipo ${t}`}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-[#808181] mr-1">Classe:</span>
          {allClasses.map((c) => (
            <button key={c} onClick={() => setClassFilter(c)}
              className={cn("px-2.5 py-1 rounded text-xs font-semibold transition-all",
                classFilter === c ? "bg-[#030304] text-white" : "bg-[#F3F4F6] text-[#808181] hover:bg-[#E0E4E3]")}>
              {c === "all" ? "ABC" : c}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-[#808181] mr-1">Status:</span>
          {([
            { value: "all", label: "Todos", activeColor: "bg-[#030304]" },
            { value: "auto", label: "Mapeados", activeColor: "bg-[#56B7A5]" },
            { value: "suggested", label: "Sugeridos", activeColor: "bg-[#1e40af]" },
            { value: "excluded", label: "Excluídos", activeColor: "bg-[#6b7280]" },
            { value: "pending", label: "Pendentes", activeColor: "bg-[#b45309]" },
          ] as const).map((s) => (
            <button key={s.value} onClick={() => setStatusFilter(s.value)}
              className={cn("px-2.5 py-1 rounded text-xs font-semibold transition-all",
                statusFilter === s.value
                  ? `${s.activeColor} text-white`
                  : "bg-[#F3F4F6] text-[#808181] hover:bg-[#E0E4E3]")}>
              {s.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-[#808181] ml-auto">{filtered.length} itens · duplo clique para detalhes</span>
      </div>

      {loading && (
        <div className="bg-white rounded-xl border border-[#E0E4E3] p-12 text-center">
          <Loader2 size={24} className="text-[#56B7A5] animate-spin mx-auto mb-3" />
          <p className="text-sm text-[#808181]">Carregando itens...</p>
        </div>
      )}

      {!loading && filtered.length === 0 && search && (
        <div className="bg-[#F0F9FF] rounded-xl border border-[#bae6fd] p-5 mb-4 flex items-start gap-3">
          <Search size={16} className="text-[#0369a1] mt-0.5 shrink-0" />
          <div className="flex-1 text-xs leading-relaxed text-[#0c4a6e]">
            <p>
              Nenhum item bate com <span className="font-mono font-semibold">{search.slice(0, 80)}</span>.
            </p>
            <p className="text-[#0c4a6e]/70 mt-1">
              O item pode estar em outro cenário (a busca olha o mapeamento atual do projeto, não a versão por cenário).
              Limpe a busca pra ver a lista completa.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSearch("")}
            className="text-xs font-semibold text-[#0369a1] hover:text-[#0c4a6e]"
          >
            Limpar busca
          </button>
        </div>
      )}

      {!loading && <div className="bg-white rounded-xl border border-[#E0E4E3] overflow-hidden shadow-[0_1px_3px_rgba(3,3,4,0.06)]">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E0E4E3] bg-[#F8FAF9]">
                {["CostCode", "Descrição", "Tipo", "Qtd", "Unid", "Custo Total", "Classe", "Fator / Status", "tCO₂e"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-[#808181] font-semibold uppercase tracking-wide text-[10px] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(() => {
                // Group children rows under their parent_item_id (Insumos
                // decomposition). Items without parent_item_id are top-level.
                const childrenByParent = new Map<string, AbcItem[]>();
                const topLevel: AbcItem[] = [];
                for (const item of filtered) {
                  if (item.parentItemId) {
                    const list = childrenByParent.get(item.parentItemId) ?? [];
                    list.push(item);
                    childrenByParent.set(item.parentItemId, list);
                  } else {
                    topLevel.push(item);
                  }
                }

                // An item is "expandable" when it has either real DB children
                // (Insumos) OR Proof assemblies as reference. The classic
                // bold-green "Comp" row style is reserved for Tipo C blocked
                // parents — other expandable items just get a chevron.
                type Asm = NonNullable<AbcItem["assemblies"]>[number];
                type Row =
                  | { kind: "item"; item: AbcItem; isParent: boolean; isChild: boolean; childCount: number; expandable: boolean }
                  | { kind: "asm"; parentId: string; asm: Asm; index: number };
                const renderRows: Row[] = [];

                // Ordering rule:
                //   1. Compositions WITH content (DB children from Insumos
                //      or Proof assemblies) — useful, expand to something.
                //   2. The rest of the top-level items in their natural order.
                //   3. Empty compositions (no children, no assemblies) at
                //      the bottom — they exist because the parser saw "Sub"
                //      but the Proof/Insumos files don't cover them, so they
                //      clutter the top of the table without informing the
                //      analyst.
                const hasContent = (i: AbcItem) =>
                  (childrenByParent.get(i.id)?.length ?? 0) > 0 ||
                  (i.assemblies?.length ?? 0) > 0;
                const composiçõesComConteudo = topLevel.filter(
                  (i) => i.mappingStatus === "blocked" && hasContent(i),
                );
                const composiçõesVazias = topLevel.filter(
                  (i) => i.mappingStatus === "blocked" && !hasContent(i),
                );
                const others = topLevel.filter(
                  (i) => i.mappingStatus !== "blocked",
                );

                const pushItem = (item: AbcItem, isParent: boolean) => {
                  const children = childrenByParent.get(item.id) ?? [];
                  const assemblies = item.assemblies ?? [];
                  const expandable = children.length > 0 || assemblies.length > 0;
                  let display = item;
                  if (isParent && children.length > 0) {
                    const sum = children.reduce(
                      (s, c) => s + (c.emissionTco2e ?? 0),
                      0,
                    );
                    display = { ...item, emissionTco2e: sum > 0 ? sum : undefined };
                  }
                  renderRows.push({
                    kind: "item",
                    item: display,
                    isParent,
                    isChild: false,
                    childCount: children.length + assemblies.length,
                    expandable,
                  });
                  if (expandable && expandedComps.has(item.id)) {
                    for (const child of children) {
                      renderRows.push({
                        kind: "item",
                        item: child,
                        isParent: false,
                        isChild: true,
                        childCount: 0,
                        expandable: false,
                      });
                    }
                    assemblies.forEach((asm, index) => {
                      renderRows.push({ kind: "asm", parentId: item.id, asm, index });
                    });
                  }
                };

                for (const c of composiçõesComConteudo) pushItem(c, true);
                for (const o of others) pushItem(o, false);
                for (const c of composiçõesVazias) pushItem(c, true);

                return renderRows.map((row) => {
                  if (row.kind === "asm") {
                    return (
                      <tr
                        key={`${row.parentId}-asm-${row.index}`}
                        className="border-b border-[#F0F4F3] bg-white"
                      >
                        <td className="px-4 py-2 font-mono text-[10px] text-[#BDBDBC] whitespace-nowrap pl-8">
                          <span className="text-[#BDBDBC] mr-1">└</span>
                          {row.asm.code ?? "—"}
                        </td>
                        <td
                          colSpan={6}
                          className="px-4 py-2 text-xs italic text-[#808181]"
                        >
                          <span className="inline-flex items-center gap-1.5">
                            <span className="text-[9px] font-bold uppercase tracking-wide text-[#9333EA] bg-[#F3E8FF] px-1.5 py-0.5 rounded">
                              Proof
                            </span>
                            {row.asm.description ?? "Composição"}
                            {row.asm.uom && (
                              <span className="text-[10px] text-[#BDBDBC]">
                                · {row.asm.uom}
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-[10px] text-[#BDBDBC] text-right whitespace-nowrap">
                          ref
                        </td>
                        <td className="px-4 py-2 text-[10px] text-[#BDBDBC] text-right whitespace-nowrap">
                          —
                        </td>
                      </tr>
                    );
                  }
                  const { item, isParent, isChild, childCount, expandable } = row;
                  const typeMeta = itemTypeMeta[item.itemType];
                  const statusMeta = mappingStatusMeta[item.mappingStatus];
                  const isOpen = openItem?.id === item.id;
                  const isExpanded = expandedComps.has(item.id);

                  const toggleExpand = () => {
                    setExpandedComps((prev) => {
                      const next = new Set(prev);
                      if (next.has(item.id)) next.delete(item.id);
                      else next.add(item.id);
                      return next;
                    });
                  };

                  return (
                    <tr key={item.id}
                      onClick={() => {
                        // Compositions (parent / Tipo C blocked) toggle on
                        // single-click — same as before. Regular items with
                        // assemblies require the chevron to avoid stealing
                        // the row's natural click target.
                        if (isParent) toggleExpand();
                      }}
                      onDoubleClick={() => { if (!isParent) setOpenItem(isOpen ? null : item); }}
                      className={cn("border-b border-[#F0F4F3] text-sm transition-all select-none",
                        isParent ? "bg-[#F8FAF9] cursor-pointer hover:bg-[#EDF5F3]" :
                        isChild ? "bg-white hover:bg-[#F8FAF9] cursor-pointer" :
                        isOpen ? "bg-[#E6F3EE] cursor-pointer" : "hover:bg-[#F8FAF9] cursor-pointer")}>
                      <td className="px-4 py-3 font-mono text-xs text-[#808181] whitespace-nowrap">
                        {isChild && <span className="text-[#BDBDBC] mr-1">└</span>}
                        {item.costCode}
                      </td>
                      <td className={cn("px-4 py-3 font-medium max-w-[220px]", isChild ? "pl-8" : "")}>
                        <div className="flex items-center gap-1.5">
                          {isParent && (
                            <ChevronDown size={14} className={cn("text-[#808181] shrink-0 transition-transform", isExpanded && "rotate-180")} />
                          )}
                          {!isParent && expandable && (
                            <button
                              type="button"
                              title={isExpanded ? "Recolher composição" : "Ver composição (Relatório Proof)"}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleExpand();
                              }}
                              className="shrink-0 text-[#9333EA] hover:text-[#7E22CE]"
                            >
                              <ChevronDown size={14} className={cn("transition-transform", isExpanded && "rotate-180")} />
                            </button>
                          )}
                          <div className="min-w-0">
                            <div className={cn("truncate", isParent ? "font-bold text-[#1d7a6b]" : "text-[#030304]")}>
                              {item.description}
                            </div>
                            {isParent && (
                              <div className="text-[10px] text-[#808181] mt-0.5">{childCount} insumo{childCount !== 1 ? "s" : ""}</div>
                            )}
                            {!isParent && expandable && !item.epd && (
                              <div className="text-[10px] text-[#9333EA] mt-0.5">
                                {childCount} composição{childCount !== 1 ? "es" : ""} no Relatório Proof
                              </div>
                            )}
                            {!isParent && item.epd && <div className="text-[10px] text-[#808181] truncate mt-0.5">{item.epd}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold"
                          style={{ backgroundColor: typeMeta.bg, color: typeMeta.color }}>
                          {isParent ? "Comp" : item.itemType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-[#404040] whitespace-nowrap">{item.quantity.toLocaleString("pt-BR")}</td>
                      <td className="px-4 py-3 text-xs text-[#808181]">{item.unit}</td>
                      <td className="px-4 py-3 text-right text-xs font-semibold text-[#030304] whitespace-nowrap">
                        {item.totalCost > 0
                          ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(item.totalCost)
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("font-bold text-sm",
                          item.abcClass === "P1" ? "text-[#56B7A5]" : item.abcClass === "P2" ? "text-[#F59E0B]" : "text-[#BDBDBC]")}>
                          {item.abcClass}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {isParent ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#E6F3EE] text-[#1d7a6b]">Composição</span>
                        ) : (
                          <>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold"
                              style={{ backgroundColor: statusMeta.bg, color: statusMeta.color }}>{statusMeta.label}</span>
                            {item.confidence && (
                              <span className={cn("ml-1 text-[10px] font-medium",
                                item.confidence === "high" ? "text-[#56B7A5]" : item.confidence === "medium" ? "text-[#b45309]" : "text-[#DC2626]")}>
                                {item.confidence === "high" ? "alta" : item.confidence === "medium" ? "média" : "baixa"}
                              </span>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {item.emissionTco2e !== undefined && item.emissionTco2e > 0
                          ? <span className={cn("font-bold", isParent ? "text-[#1d7a6b]" : "text-[#030304]")}>
                              {item.emissionTco2e.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
                            </span>
                          : <span className="text-[#BDBDBC] text-xs">{isParent ? "Σ" : "pendente"}</span>}
                      </td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      </div>}

      {openItem && (
        <ItemDrawer
          item={openItem}
          onClose={() => setOpenItem(null)}
          onSaved={loadItems}
          onFactorSaveRequest={
            activeScenarioId
              ? (body, factorLabel, onFinish) => {
                  // Any factor substitution can come with a real price
                  // change — EPD products typically cost more or less than
                  // the generic baseline, manual factors come from quoted
                  // proposals, etc. We show the cost-change section as
                  // opt-in (checkbox default off) for every non-exclusion
                  // edit so the analyst can declare the ΔR$ when it matters.
                  const askCostChange = body.source_tier !== "excluded";
                  setPendingFactorSave({
                    body,
                    itemId: openItem.id,
                    factorLabel,
                    onFinish,
                    askCostChange,
                    currentUnitCost: askCostChange ? openItem.unitCost : undefined,
                    itemUnit: askCostChange ? openItem.unit : undefined,
                    itemQuantity: askCostChange ? openItem.quantity : undefined,
                  });
                }
              : undefined
          }
          onExcludeRequest={
            activeScenarioId
              ? (item, onFinish) => setPendingExclude({ item, onFinish })
              : undefined
          }
        />
      )}

      <SaveModeDialog
        key={pendingFactorSave?.itemId ?? "closed"}
        open={!!pendingFactorSave}
        saving={saveModeBusy}
        activeScenarioName={activeScenario?.name ?? "cenário atual"}
        changeLabel={pendingFactorSave?.factorLabel ?? "edição"}
        askCostChange={pendingFactorSave?.askCostChange}
        currentUnitCost={pendingFactorSave?.currentUnitCost}
        itemUnit={pendingFactorSave?.itemUnit}
        itemQuantity={pendingFactorSave?.itemQuantity}
        onCancel={() => {
          if (saveModeBusy) return;
          pendingFactorSave?.onFinish?.();
          setPendingFactorSave(null);
        }}
        onConfirm={async (choice: SaveModeChoice) => {
          if (!pendingFactorSave || !activeScenarioId) return;
          setSaveModeBusy(true);
          try {
            const body: MappingConfirmRequest = {
              ...pendingFactorSave.body,
              scenario_id: activeScenarioId,
              mode: choice.mode,
              ...(choice.mode === "fork" && choice.newScenarioName
                ? { new_scenario_name: choice.newScenarioName }
                : {}),
              // Forward the analyst-declared cost change (null = no override).
              // We only attach it when the dialog actually asked.
              ...(pendingFactorSave.askCostChange
                ? { unit_cost_override: choice.unitCostOverride ?? null }
                : {}),
            };
            const res = await confirmMapping(pendingFactorSave.itemId, body);
            if (res.new_scenario_id) {
              await reloadScenarios();
              setActiveScenarioId(res.new_scenario_id);
            } else {
              await reloadScenarios();
            }
            await loadItems();
            pendingFactorSave.onFinish?.();
            setPendingFactorSave(null);
          } catch (e) {
            alert("Erro ao salvar: " + (e instanceof Error ? e.message : "erro"));
          } finally {
            setSaveModeBusy(false);
          }
        }}
      />

      <ExcludeItemDialog
        key={pendingExclude?.item.id ?? "closed-exclude"}
        open={!!pendingExclude}
        saving={excludeBusy}
        itemDescription={pendingExclude?.item.description ?? ""}
        activeScenarioName={activeScenario?.name ?? "cenário atual"}
        onCancel={() => {
          if (excludeBusy) return;
          pendingExclude?.onFinish?.();
          setPendingExclude(null);
        }}
        onConfirm={async (choice: ExcludeChoice) => {
          if (!pendingExclude || !activeScenarioId) return;
          setExcludeBusy(true);
          try {
            const body: MappingConfirmRequest = {
              source_tier: "excluded",
              exclusion_justification: choice.justification,
              scenario_id: activeScenarioId,
              mode: choice.mode,
              ...(choice.mode === "fork" && choice.newScenarioName
                ? { new_scenario_name: choice.newScenarioName }
                : {}),
            };
            const res = await confirmMapping(pendingExclude.item.id, body);
            if (res.new_scenario_id) {
              await reloadScenarios();
              setActiveScenarioId(res.new_scenario_id);
            } else {
              await reloadScenarios();
            }
            await loadItems();
            pendingExclude.onFinish?.();
            setPendingExclude(null);
          } catch (e) {
            alert("Erro ao excluir: " + (e instanceof Error ? e.message : "erro"));
          } finally {
            setExcludeBusy(false);
          }
        }}
      />
    </div>
  );
}
