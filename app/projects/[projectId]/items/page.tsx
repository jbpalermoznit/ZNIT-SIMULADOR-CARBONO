"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { itemTypeMeta, mappingStatusMeta, type ItemType, type AbcClass, type AbcItem } from "@/lib/mock/data";
import { listAbcItems, getProject, type AbcItemResponse, type ProjectResponse } from "@/lib/api/projects";
import { listScenarios, type ScenarioResponse } from "@/lib/api/scenarios";
import { getMapping, type MappingResponse } from "@/lib/api/emission-factors";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Search, Filter, Download, X, ChevronRight, AlertTriangle,
  CheckCircle, Edit3, ArrowLeft, ChevronDown, FileText, Database,
  Globe, Pencil, ExternalLink, Loader2, Zap, BookOpen,
} from "lucide-react";
import {
  searchEmissionFactors, autoMatchItem, autoMapProject, confirmMapping,
  type EmissionSearchResponse, type AutoMatchResult, type EcoinventResult,
  type EpdCatalogResult, type MappingConfirmRequest,
} from "@/lib/api/emission-factors";
import { createFactorRule } from "@/lib/api/factor-rules";

const allTypes: (ItemType | "all")[] = ["all", "A", "B", "C", "D", "E", "F"];
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

function DetailView({ item, onEditEpd, onParametrize }: {
  item: AbcItem; onEditEpd: () => void; onParametrize: () => void;
}) {
  const statusMeta = mappingStatusMeta[item.mappingStatus];
  const conf = item.confidence ? CONFIDENCE_LABEL[item.confidence] : null;

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

      <div className="px-5 py-4 border-t border-[#E0E4E3] flex gap-2">
        <Button variant="outline" size="sm" className="flex-1" onClick={onEditEpd}>
          <Edit3 size={13} /> Editar Fator de Emissão
        </Button>
        <Button size="sm" className="flex-1" onClick={onParametrize}>
          <ChevronRight size={13} /> Parametrizar item
        </Button>
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

function EditEpdView({ item, onBack, onSaved }: { item: AbcItem; onBack: () => void; onSaved?: () => void }) {
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
      await confirmMapping(item.id, body);

      // Save as rule for future imports
      if (saveAsRule) {
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
      }

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
              ...(tierFilter.ghg_protocol ? (results?.ghg_protocol || []).map((r: any) => ({ ...r, source_tier: "ghg_protocol", factor_name: r.produto, factor_value: r.co2e_total, factor_unit: "kgCO₂e", factor_source: r.versao_ghg || "GHG Protocol" })) : []),
              ...(tierFilter.cecarbon ? (results?.cecarbon || []).map((r: any) => ({ ...r, source_tier: "cecarbon", factor_name: r.description, factor_value: r.factor_value, factor_unit: r.factor_unit, factor_source: r.reference, product_unit: r.unit })) : []),
              ...(tierFilter.ecoinvent ? (results?.ecoinvent || []).map((r: any) => ({ ...r, source_tier: "ecoinvent", factor_name: r.product_name, factor_value: r.impact_score, factor_unit: r.impact_unit, factor_source: r.activity_name, product_unit: r.product_unit })) : []),
            ] : autoMatch?.results)?.map((r: any, i: number) => {
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
              <p className="text-xs text-[#BDBDBC] px-5 py-6 text-center">Nenhum EPD encontrado para "{search}"</p>
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

function ItemDrawer({ item, onClose, onSaved }: { item: AbcItem; onClose: () => void; onSaved?: () => void }) {
  const [view, setView] = useState<DrawerView>("detail");

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
        {view === "detail"     && <DetailView item={item} onEditEpd={() => setView("edit-epd")} onParametrize={() => setView("parametrize")} />}
        {view === "edit-epd"   && <EditEpdView item={item} onBack={() => setView("detail")} onSaved={onSaved} />}
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
  const [typeFilter, setTypeFilter] = useState<ItemType | "all">("all");
  const [classFilter, setClassFilter] = useState<AbcClass | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "auto" | "suggested" | "pending">("all");
  const [search, setSearch] = useState("");
  const [openItem, setOpenItem] = useState<AbcItem | null>(null);
  const [expandedComps, setExpandedComps] = useState<Set<string>>(new Set());
  const [autoMapping, setAutoMapping] = useState(false);
  const [autoMapResult, setAutoMapResult] = useState<{ auto_mapped: number; suggested: number; pending: number; already_mapped: number } | null>(null);
  const [items, setItems] = useState<AbcItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectName, setProjectName] = useState("");
  const [scenarios, setScenarios] = useState<ScenarioResponse[]>([]);
  const [selectedCurveId, setSelectedCurveId] = useState<string | null>(curveIdParam);
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);

  // Carregar cenários para o seletor
  useEffect(() => {
    listScenarios(projectId).then((scens) => {
      setScenarios(scens);
      // Auto-select curve from first scenario if not set via query param
      if (!selectedCurveId && scens.length > 0) {
        // Fetch scenario detail to get abc_curve_id
        const firstScen = scens.find((s) => s.is_base) ?? scens[0];
        if (firstScen) {
          setActiveScenarioId(firstScen.id);
          const token = localStorage.getItem("znit_token");
          fetch(`/api/scenarios/${firstScen.id}`, { headers: { Authorization: `Bearer ${token}` } })
            .then((r) => r.json())
            .then((data) => {
              if (data.abc_curve_id) setSelectedCurveId(data.abc_curve_id);
            })
            .catch(() => {});
        }
      }
    }).catch(() => {});
  }, [projectId]);

  // Carregar itens da API
  const loadItems = useCallback(async () => {
    try {
      const [data, proj] = await Promise.all([
        listAbcItems(projectId, selectedCurveId ? { curve_id: selectedCurveId } : undefined),
        getProject(projectId),
      ]);
      setProjectName(proj.name);
      const newItems = data.map(toAbcItem);
      setItems(newItems);
      // Atualizar o item aberto no drawer (se houver)
      setOpenItem((prev) => {
        if (!prev) return null;
        return newItems.find((i) => i.id === prev.id) ?? prev;
      });
    } catch {
      console.error("Erro ao carregar itens");
    }
    setLoading(false);
  }, [selectedCurveId]);

  useEffect(() => { loadItems(); }, [loadItems]);

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

  const filtered = items.filter((item) => {
    if (typeFilter !== "all" && item.itemType !== typeFilter) return false;
    if (classFilter !== "all" && item.abcClass !== classFilter) return false;
    if (statusFilter === "auto" && item.mappingStatus !== "auto") return false;
    if (statusFilter === "suggested" && item.mappingStatus !== "manual") return false;
    if (statusFilter === "pending" && !["pending", "blocked"].includes(item.mappingStatus)) return false;
    if (search && !item.description.toLowerCase().includes(search.toLowerCase()) && !item.costCode.includes(search))
      return false;
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
          <Button variant="outline" onClick={async () => {
            try {
              const token = localStorage.getItem("znit_token");
              const base = process.env.NEXT_PUBLIC_API_URL ?? "";
              // Get project name for filename
              const projResp = await fetch(`${base}/api/projects/${projectId}`, { headers: { Authorization: `Bearer ${token}` } });
              const projData = await projResp.json();
              const projName = (projData.name || "Projeto").replace(/\s+/g, "_").replace(/\//g, "-");
              const date = new Date().toISOString().slice(0, 10);
              // Download excel
              const resp = await fetch(`${base}/api/projects/${projectId}/export-items`, { headers: { Authorization: `Bearer ${token}` } });
              const blob = await resp.blob();
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `ZNIT_${projName}_${date}.xlsx`;
              a.click();
              URL.revokeObjectURL(a.href);
            } catch {}
          }}><Download size={15} /> Exportar Excel</Button>
        </div>
      </div>

      {/* Scenario selector */}
      {scenarios.length > 0 && (
        <div className="bg-white rounded-lg border border-[#E0E4E3] p-3 mb-4 flex items-center gap-3">
          <span className="text-xs font-semibold text-[#808181]">Cenário:</span>
          <div className="flex gap-1.5 flex-wrap">
            {scenarios.map((s) => {
              const isActive = activeScenarioId === s.id;
              return (
                <button
                  key={s.id}
                  onClick={async () => {
                    setActiveScenarioId(s.id);
                    const token = localStorage.getItem("znit_token");
                    try {
                      const res = await fetch(`/api/scenarios/${s.id}`, { headers: { Authorization: `Bearer ${token}` } });
                      const data = await res.json();
                      if (data.abc_curve_id) {
                        setSelectedCurveId(data.abc_curve_id);
                        setExpandedComps(new Set());
                      }
                    } catch {}
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border",
                    isActive
                      ? "border-[#56B7A5] bg-[#E6F3EE] text-[#1d7a6b]"
                      : "border-[#E0E4E3] text-[#404040] hover:border-[#56B7A5] hover:bg-[#F8FAF9]"
                  )}
                >
                  {s.name}
                  <span className={cn("font-normal ml-1", isActive ? "text-[#56B7A5]" : "text-[#808181]")}>
                    ({(s.result?.total_tco2e ?? 0).toFixed(0)} tCO₂e)
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

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
                typeFilter === t ? "bg-[#56B7A5] text-white" : "bg-[#F3F4F6] text-[#808181] hover:bg-[#E0E4E3]")}>
              {t === "all" ? "Todos" : `Tipo ${t}`}
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
                // Separate parents (blocked compositions) from children and direct items
                const parents = filtered.filter((i) => i.mappingStatus === "blocked" && !i.parentItemId);
                const childrenByParent = new Map<string, AbcItem[]>();
                const directItems: AbcItem[] = [];

                for (const item of filtered) {
                  if (item.parentItemId) {
                    const list = childrenByParent.get(item.parentItemId) ?? [];
                    list.push(item);
                    childrenByParent.set(item.parentItemId, list);
                  } else if (item.mappingStatus !== "blocked") {
                    directItems.push(item);
                  }
                }

                // Build render list: compositions with children first, then direct items
                const renderRows: Array<{ item: AbcItem; isParent: boolean; isChild: boolean; childCount: number }> = [];

                for (const parent of parents) {
                  const children = childrenByParent.get(parent.id) ?? [];
                  const childEmission = children.reduce((s, c) => s + (c.emissionTco2e ?? 0), 0);
                  // Override parent emission with sum of children
                  const parentWithEmission = { ...parent, emissionTco2e: childEmission > 0 ? childEmission : undefined };
                  renderRows.push({ item: parentWithEmission, isParent: true, isChild: false, childCount: children.length });
                  if (expandedComps.has(parent.id)) {
                    for (const child of children) {
                      renderRows.push({ item: child, isParent: false, isChild: true, childCount: 0 });
                    }
                  }
                }

                for (const item of directItems) {
                  renderRows.push({ item, isParent: false, isChild: false, childCount: 0 });
                }

                return renderRows.map(({ item, isParent, isChild, childCount }) => {
                  const typeMeta = itemTypeMeta[item.itemType];
                  const statusMeta = mappingStatusMeta[item.mappingStatus];
                  const isOpen = openItem?.id === item.id;
                  const isExpanded = expandedComps.has(item.id);

                  return (
                    <tr key={item.id}
                      onClick={() => {
                        if (isParent) {
                          setExpandedComps((prev) => {
                            const next = new Set(prev);
                            if (next.has(item.id)) next.delete(item.id);
                            else next.add(item.id);
                            return next;
                          });
                        }
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
                          <div className="min-w-0">
                            <div className={cn("truncate", isParent ? "font-bold text-[#1d7a6b]" : "text-[#030304]")}>
                              {item.description}
                            </div>
                            {isParent && (
                              <div className="text-[10px] text-[#808181] mt-0.5">{childCount} insumo{childCount !== 1 ? "s" : ""}</div>
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

      {openItem && <ItemDrawer item={openItem} onClose={() => setOpenItem(null)} onSaved={loadItems} />}
    </div>
  );
}
