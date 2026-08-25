"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Plus, Lock, TrendingDown, Copy, Edit3, Upload, Trash2,
  GitCompare, ChevronDown, Loader2,
  BarChart3, Zap, Leaf,
} from "lucide-react";
import {
  listScenarios, createBaseScenario, createScenario, getScenario, deleteScenario,
  type ScenarioResponse, type ScenarioDetailResponse, type ScenarioItemResponse,
} from "@/lib/api/scenarios";
import { getProject } from "@/lib/api/projects";
import { NewScenarioFromUploadDialog } from "@/components/scenarios/new-scenario-from-upload-dialog";


// ─── Scenario card ────────────────────────────────────────────────────────────

function ScenarioCard({
  scen,
  baseScen,
  selected,
  onSelect,
  onSetBase,
  onDelete,
}: {
  scen: ScenarioResponse;
  baseScen: ScenarioResponse | null;
  selected: boolean;
  onSelect: () => void;
  onSetBase?: () => void;
  onDelete?: () => void;
}) {
  const isBase = scen.is_base;
  const totalTco2e = scen.result?.total_tco2e ?? 0;
  const baseTco2e = baseScen?.result?.total_tco2e ?? 0;
  const delta = baseTco2e - totalTco2e;
  const deltaPct = baseTco2e > 0 ? ((delta / baseTco2e) * 100).toFixed(1) : "0";
  const coverage = scen.result?.coverage_pct ?? 0;
  const intensity = scen.result?.intensity_per_m2
    ? (scen.result.intensity_per_m2 * 1000).toFixed(1)
    : "—";

  return (
    <div
      className={cn(
        "bg-white rounded-xl border p-5 relative transition-all cursor-pointer",
        selected
          ? "border-[#56B7A5] shadow-[0_0_0_2px_rgba(86,183,165,0.2),0_4px_16px_rgba(86,183,165,0.12)]"
          : isBase
          ? "border-[#56B7A5]/40 shadow-[0_1px_3px_rgba(3,3,4,0.06)]"
          : "border-[#E0E4E3] shadow-[0_1px_3px_rgba(3,3,4,0.06)] hover:border-[#A9D7CD]"
      )}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            {isBase && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#E6F3EE] text-[#56B7A5]">
                BASE
              </span>
            )}
            {selected && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#56B7A5] text-white">
                Selecionado
              </span>
            )}
          </div>
          <h3 className="font-bold text-[#030304] text-sm leading-snug">{scen.name}</h3>
          {scen.description && (
            <p className="text-[11px] text-[#808181] mt-0.5 leading-relaxed line-clamp-2">{scen.description}</p>
          )}
        </div>
        {onDelete && !isBase && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Excluir cenário "${scen.name}"? Esta ação não pode ser desfeita.`)) {
                onDelete();
              }
            }}
            title="Excluir cenário"
            className="text-[#BDBDBC] hover:text-[#DC2626] p-1 -m-1 rounded transition-colors shrink-0"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      <div className="text-2xl font-bold text-[#030304] mb-0.5">
        {totalTco2e.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
        <span className="text-sm font-normal text-[#808181] ml-1">tCO₂e</span>
      </div>
      <p className="text-xs text-[#808181] mb-1">
        {intensity} kgCO₂e/m² · {coverage.toFixed(0)}% cobertura
        {scen.items_count != null && ` · ${scen.items_count} itens`}
      </p>
      <p className="text-[10px] text-[#BDBDBC] mb-3">
        Criado em {new Date(scen.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
      </p>

      {!isBase && baseTco2e > 0 && delta > 0 && (
        <div className="flex items-center gap-1.5 bg-[#E6F3EE] rounded-lg px-2.5 py-1.5 mb-3">
          <TrendingDown size={13} className="text-[#56B7A5]" />
          <span className="text-xs font-bold text-[#1d7a6b]">
            -{delta.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} tCO₂e ({deltaPct}%)
          </span>
        </div>
      )}

      {isBase ? (
        <p className="text-[10px] text-[#BDBDBC]">Cenário de referência para comparação</p>
      ) : onSetBase ? (
        <button
          onClick={(e) => { e.stopPropagation(); onSetBase(); }}
          className="text-[10px] font-semibold text-[#56B7A5] hover:text-[#1d7a6b] hover:underline transition-colors"
        >
          Definir como Base
        </button>
      ) : null}
    </div>
  );
}

// ─── Impact Analysis (scenario detail) ────────────────────────────────────────

interface ParentItem {
  id: string;
  description: string;
  cost_code: string;
  quantity: number;
  unit: string;
  emission_tco2e: number;
  children_count: number;
}

function ImpactAnalysis({ scenarioId, projectId }: { scenarioId: string; projectId: string }) {
  const [detail, setDetail] = useState<ScenarioDetailResponse | null>(null);
  const [parentItems, setParentItems] = useState<ParentItem[]>([]);
  const [curveId, setCurveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedParent, setExpandedParent] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getScenario(scenarioId)
      .then((data) => {
        setDetail(data);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = data as any;
        setParentItems((raw.parent_items ?? []) as ParentItem[]);
        setCurveId(raw.abc_curve_id ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [scenarioId]);

  if (loading) {
    return <div className="py-12 text-center"><Loader2 size={20} className="text-[#56B7A5] animate-spin mx-auto" /></div>;
  }
  if (!detail) {
    return <p className="text-sm text-[#808181] text-center py-8">Erro ao carregar cenário.</p>;
  }

  const r = detail.result;
  const hasHierarchy = parentItems.length > 0;

  // Build composition view: parents with their children
  const compositionsWithEmission = parentItems
    .filter((p) => p.emission_tco2e > 0)
    .sort((a, b) => b.emission_tco2e - a.emission_tco2e);

  // Direct items (no parent) with emission — aggregated by material so the
  // same material used in different parts of the budget (e.g. CONCRETO 40MPA
  // em 3 trechos) shows as a SINGLE row with the summed emission, matching the
  // legacy report (que agrupa por ID_PAI/material) em vez de "aparecer 3x".
  const directRaw = detail.items.filter(
    (i) =>
      !((i as unknown as Record<string, unknown>).parent_item_id) &&
      (i.emission_tco2e ?? 0) > 0 &&
      !i.is_excluded
  );
  const directAggMap = new Map<
    string,
    {
      id: string;
      description: string;
      cost_code: string;
      quantity: number;
      unit: string;
      emission_tco2e: number;
      factor_value: number | null;
      factor_unit: string | null;
      source_tier: string | null;
      occurrences: number;
    }
  >();
  for (const i of directRaw) {
    const key = `${i.cost_code ?? ""}|${i.description ?? ""}|${i.unit ?? ""}`;
    const prev = directAggMap.get(key);
    if (prev) {
      prev.quantity += i.quantity ?? 0;
      prev.emission_tco2e += i.emission_tco2e ?? 0;
      prev.occurrences += 1;
    } else {
      directAggMap.set(key, {
        id: i.id,
        description: i.description ?? "",
        cost_code: i.cost_code ?? "",
        quantity: i.quantity ?? 0,
        unit: i.unit ?? "",
        emission_tco2e: i.emission_tco2e ?? 0,
        factor_value: i.factor_value ?? null,
        factor_unit: i.factor_unit ?? null,
        source_tier: i.source_tier ?? null,
        occurrences: 1,
      });
    }
  }
  const directItems = [...directAggMap.values()].sort(
    (a, b) => b.emission_tco2e - a.emission_tco2e
  );

  // All items with emission (flat view)
  const allEmitters = [...compositionsWithEmission.map((p) => ({
    id: p.id,
    description: p.description,
    cost_code: p.cost_code,
    quantity: p.quantity,
    unit: p.unit,
    emission_tco2e: p.emission_tco2e,
    isComposition: true,
    children_count: p.children_count,
    factor_value: null as number | null,
    factor_unit: null as string | null,
    source_tier: null as string | null,
    occurrences: 1,
  })), ...directItems.map((i) => ({
    id: i.id,
    description: i.description,
    cost_code: i.cost_code,
    quantity: i.quantity,
    unit: i.unit,
    emission_tco2e: i.emission_tco2e,
    isComposition: false,
    children_count: 0,
    factor_value: i.factor_value,
    factor_unit: i.factor_unit,
    source_tier: i.source_tier,
    occurrences: i.occurrences,
  }))].sort((a, b) => b.emission_tco2e - a.emission_tco2e);

  const getChildItems = (parentId: string) =>
    detail.items
      .filter((i) => ((i as unknown as Record<string, unknown>).parent_item_id) === parentId)
      .sort((a, b) => (b.emission_tco2e ?? 0) - (a.emission_tco2e ?? 0));

  const tierLabel = (tier: string | null | undefined) =>
    tier === "ecoinvent" ? "Ecoinvent" :
    tier === "ghg_protocol" ? "GHG Protocol" :
    tier === "cecarbon" ? "CECarbon" :
    tier === "epd" ? "EPD" : tier ?? "";

  const tierColor = (tier: string | null | undefined) =>
    tier === "ecoinvent" ? "bg-[#DBEAFE] text-[#1e40af]" :
    tier === "ghg_protocol" ? "bg-[#E6F3EE] text-[#1d7a6b]" :
    tier === "cecarbon" ? "bg-[#FEF3C7] text-[#92400e]" :
    tier === "epd" ? "bg-[#EDE9FE] text-[#7c3aed]" :
    "bg-[#F3F4F6] text-[#808181]";

  return (
    <div>
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="bg-[#E6F3EE] rounded-xl p-4">
          <p className="text-[10px] font-semibold text-[#808181] uppercase tracking-wide mb-1">Total emissões</p>
          <p className="text-2xl font-bold text-[#1d7a6b]">
            {(r?.total_tco2e ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
            <span className="text-sm font-normal ml-1">tCO₂e</span>
          </p>
        </div>
        <div className="bg-[#F8FAF9] rounded-xl p-4">
          <p className="text-[10px] font-semibold text-[#808181] uppercase tracking-wide mb-1">Cobertura</p>
          <p className="text-2xl font-bold text-[#030304]">
            {(r?.coverage_pct ?? 0).toFixed(0)}%
          </p>
          <p className="text-xs text-[#808181] mt-0.5">{r?.items_mapped ?? 0} de {r?.items_total ?? 0} itens</p>
        </div>
        <div className="bg-[#F8FAF9] rounded-xl p-4">
          <p className="text-[10px] font-semibold text-[#808181] uppercase tracking-wide mb-1">
            {hasHierarchy ? "Composições" : "Itens com emissão"}
          </p>
          <p className="text-2xl font-bold text-[#030304]">
            {hasHierarchy ? compositionsWithEmission.length : allEmitters.length}
          </p>
          <p className="text-xs text-[#808181] mt-0.5">
            {hasHierarchy
              ? `+ ${directItems.length} itens diretos`
              : `${r?.items_excluded ?? 0} excluídos`}
          </p>
        </div>
      </div>

      {/* Hierarchical emitters table */}
      <div className="bg-white rounded-xl border border-[#E0E4E3] overflow-hidden">
        <div className="px-5 py-3 border-b border-[#E0E4E3] bg-[#F8FAF9]">
          <p className="text-xs font-bold text-[#030304]">
            {hasHierarchy ? "Emissões por Composição" : "Top emissores do cenário"}
          </p>
          {hasHierarchy && (
            <p className="text-[10px] text-[#808181] mt-0.5">Clique na composição para ver os insumos e seus fatores de emissão</p>
          )}
        </div>
        {allEmitters.length === 0 ? (
          <p className="text-sm text-[#BDBDBC] px-5 py-6 text-center">Nenhum item com emissão calculada.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#F0F4F3]">
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-[#808181] uppercase tracking-wide">Item</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-[#808181] uppercase tracking-wide">Qtd</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-[#808181] uppercase tracking-wide">Fator</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-[#808181] uppercase tracking-wide">Fonte</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-[#808181] uppercase tracking-wide">tCO₂e</th>
              </tr>
            </thead>
            <tbody>
              {allEmitters.slice(0, 25).map((item) => (
                <React.Fragment key={item.id}>
                  <tr
                    className={cn(
                      "border-b border-[#F0F4F3] transition-colors",
                      item.isComposition
                        ? "bg-[#F8FAF9] hover:bg-[#EDF5F3] cursor-pointer"
                        : "hover:bg-[#F8FAF9]"
                    )}
                    onClick={() => {
                      if (item.isComposition) {
                        setExpandedParent(expandedParent === item.id ? null : item.id);
                      }
                    }}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {item.isComposition && (
                          <ChevronDown
                            size={14}
                            className={cn(
                              "text-[#808181] transition-transform shrink-0",
                              expandedParent === item.id && "rotate-180"
                            )}
                          />
                        )}
                        <div>
                          <p className={cn("font-semibold text-[#030304] leading-snug", item.isComposition && "text-[#1d7a6b]")}>
                            {item.description}
                          </p>
                          <p className="text-[10px] text-[#808181]">
                            {item.cost_code}
                            {item.isComposition && ` · ${item.children_count} insumos`}
                            {!item.isComposition && item.occurrences > 1 && ` · ${item.occurrences}× no orçamento`}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap text-[#808181]">
                      {item.quantity?.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} {item.unit}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-[#808181]">
                      {item.isComposition
                        ? "Σ insumos"
                        : item.factor_value != null
                        ? `${item.factor_value.toLocaleString("pt-BR", { maximumFractionDigits: 4 })} ${item.factor_unit ?? ""}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {item.isComposition ? (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#E6F3EE] text-[#1d7a6b]">
                          Composição
                        </span>
                      ) : item.source_tier ? (
                        <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded", tierColor(item.source_tier))}>
                          {tierLabel(item.source_tier)}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <span className="font-bold text-[#030304]">
                        {item.emission_tco2e.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                      </span>
                    </td>
                  </tr>
                  {/* Expanded children (insumos) */}
                  {item.isComposition && expandedParent === item.id && (
                    getChildItems(item.id).map((child) => (
                      <tr key={child.id} className="border-b border-[#F0F4F3] bg-white hover:bg-[#F8FAF9]">
                        <td className="pl-12 pr-4 py-2.5">
                          <p className="text-[#030304] leading-snug">{child.description}</p>
                          <p className="text-[10px] text-[#BDBDBC]">{child.cost_code}</p>
                        </td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap text-[#808181]">
                          {child.quantity?.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} {child.unit}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-[#030304]">
                          {child.factor_value != null
                            ? `${child.factor_value.toLocaleString("pt-BR", { maximumFractionDigits: 4 })} ${child.factor_unit ?? ""}`
                            : "—"}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          {child.source_tier && (
                            <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded", tierColor(child.source_tier))}>
                              {tierLabel(child.source_tier)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            <span className={cn("font-semibold", (child.emission_tco2e ?? 0) > 0 ? "text-[#030304]" : "text-[#BDBDBC]")}>
                              {(child.emission_tco2e ?? 0) > 0
                                ? (child.emission_tco2e ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 })
                                : "—"}
                            </span>
                            <Link
                              href={`/projects/${projectId}/items?item=${child.abc_item_id}${curveId ? `&curve_id=${curveId}` : ""}`}
                              className="text-[#56B7A5] hover:text-[#1d7a6b] p-0.5 rounded hover:bg-[#E6F3EE] transition-colors"
                              title="Editar fator de emissão"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Edit3 size={12} />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Scenario Comparison ─────────────────────────────────────────────────────

function ScenarioComparison({ scenarios }: { scenarios: ScenarioResponse[] }) {
  const [details, setDetails] = useState<Record<string, ScenarioDetailResponse>>({});
  const [loading, setLoading] = useState(true);
  const [compareIds, setCompareIds] = useState<string[]>([]);

  // Auto-select first two scenarios (Base first, when present)
  useEffect(() => {
    if (scenarios.length >= 2) {
      const sorted = [...scenarios].sort((a, b) => (b.is_base ? 1 : 0) - (a.is_base ? 1 : 0));
      setCompareIds(sorted.slice(0, 2).map((s) => s.id));
    }
  }, [scenarios]);

  useEffect(() => {
    if (compareIds.length < 2) return;
    setLoading(true);
    Promise.all(compareIds.map((id) => getScenario(id)))
      .then((results) => {
        const byId: Record<string, ScenarioDetailResponse> = {};
        compareIds.forEach((id, i) => { byId[id] = results[i]; });
        setDetails(byId);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [compareIds]);

  if (scenarios.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-center bg-[#F8FAF9] rounded-xl border border-dashed border-[#E0E4E3]">
        <GitCompare size={28} className="text-[#BDBDBC] mb-3" />
        <p className="text-sm font-semibold text-[#808181]">Mínimo 2 cenários para comparar</p>
        <p className="text-xs text-[#BDBDBC] mt-1">Importe outro cenário na página de importação.</p>
      </div>
    );
  }

  const toggleCompare = (id: string) => {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // Selector — chips de multi-seleção em vez de 2 dropdowns fixos.
  const selector = (
    <div className="bg-white rounded-xl border border-[#E0E4E3] p-4">
      <label className="text-[10px] font-semibold text-[#808181] uppercase tracking-wide mb-2 block">
        Cenários selecionados para comparação ({compareIds.length})
      </label>
      <div className="flex flex-wrap gap-2">
        {scenarios.map((s) => {
          const active = compareIds.includes(s.id);
          return (
            <button
              key={s.id}
              onClick={() => toggleCompare(s.id)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all",
                active
                  ? "bg-[#56B7A5] border-[#56B7A5] text-white"
                  : "bg-white border-[#E0E4E3] text-[#808181] hover:border-[#81C8B9]"
              )}
            >
              {s.name}{s.is_base ? " (Base)" : ""} · {(s.result?.total_tco2e ?? 0).toFixed(1)} tCO₂e
            </button>
          );
        })}
      </div>
      {compareIds.length < 2 && (
        <p className="text-xs text-[#b45309] mt-2">Selecione pelo menos 2 cenários.</p>
      )}
    </div>
  );

  if (compareIds.length < 2) {
    return <div className="space-y-6">{selector}</div>;
  }

  if (loading) {
    return (
      <div className="space-y-6">
        {selector}
        <div className="py-12 text-center"><Loader2 size={20} className="text-[#56B7A5] animate-spin mx-auto" /></div>
      </div>
    );
  }

  const selected = compareIds
    .map((id) => ({ scen: scenarios.find((s) => s.id === id), detail: details[id] }))
    .filter((x): x is { scen: ScenarioResponse; detail: ScenarioDetailResponse } => !!x.scen && !!x.detail);

  if (selected.length < 2) return <div className="space-y-6">{selector}</div>;

  // Ancora as diferenças % no cenário Base do projeto (mesmo critério do
  // export Excel) — se nenhum dos selecionados for o Base, usa o primeiro.
  const baseIdxFound = selected.findIndex((s) => s.scen.is_base);
  const baseIdx = baseIdxFound >= 0 ? baseIdxFound : 0;

  // Group items by material description for side-by-side
  const groupItems = (items: ScenarioItemResponse[]) => {
    const groups: Record<string, { tco2e: number; qty: number; unit: string }> = {};
    for (const item of items) {
      if (!item.emission_tco2e || item.emission_tco2e <= 0 || item.is_excluded) continue;
      const key = item.description;
      if (!groups[key]) groups[key] = { tco2e: 0, qty: 0, unit: item.unit };
      groups[key].tco2e += item.emission_tco2e;
      groups[key].qty += item.quantity;
    }
    return groups;
  };

  const groupsPerScenario = selected.map((s) => groupItems(s.detail.items));
  const allMaterials = [...new Set(groupsPerScenario.flatMap((g) => Object.keys(g)))];
  const materialRows = allMaterials
    .map((name) => ({
      name,
      values: groupsPerScenario.map((g) => g[name]?.tco2e ?? 0),
    }))
    .sort((x, y) => Math.max(...y.values) - Math.max(...x.values))
    .slice(0, 15);

  // Calculate report-style indicators
  const calcIndicators = (items: ScenarioItemResponse[], parentItems: Record<string, unknown>[]) => {
    let concretoM3 = 0, concretoTco2e = 0;
    let acoKg = 0, acoTco2e = 0;
    // Project cost = parents (compositions) + direct items (no parent)
    const parentsCost = parentItems.reduce((s, p) => s + ((p.total_cost as number) ?? 0), 0);
    const directItemsCost = items
      .filter((i) => !((i as unknown as Record<string, unknown>).parent_item_id))
      .reduce((s, i) => s + (i.total_cost ?? 0), 0);
    const totalCostR$ = parentsCost + directItemsCost;

    for (const item of items) {
      if (item.is_excluded) continue;
      const desc = (item.description ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      const tco2e = item.emission_tco2e ?? 0;
      const qty = item.quantity ?? 0;
      const unit = (item.unit ?? "").toLowerCase();

      if (desc.includes("concreto") && (unit === "m³" || unit === "m3")) {
        concretoM3 += qty;
        concretoTco2e += tco2e;
      }
      if ((desc.includes("aco") || desc.includes("armadura") || desc.includes("ca-50") || desc.includes("ca-25") || desc.includes("ca-60") || desc.includes("tela soldada") || desc.includes("arame")) && (unit === "kg" || unit === "t")) {
        acoKg += unit === "t" ? qty * 1000 : qty;
        acoTco2e += tco2e;
      }
    }

    return {
      totalCostR$,
      concretoM3: Math.round(concretoM3 * 10) / 10,
      concretoTco2e: Math.round(concretoTco2e * 100) / 100,
      indicadorConcreto: concretoM3 > 0 ? Math.round((concretoTco2e / concretoM3) * 100) / 100 : 0,
      acoTon: Math.round(acoKg / 100) / 10,
      acoTco2e: Math.round(acoTco2e * 100) / 100,
      indicadorAco: acoKg > 0 ? Math.round((acoTco2e / (acoKg / 1000)) * 100) / 100 : 0,
    };
  };

  const perScenario = selected.map((s) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parents = ((s.detail as any).parent_items ?? []) as Record<string, unknown>[];
    return {
      scen: s.scen,
      result: s.scen.result,
      ind: calcIndicators(s.detail.items, parents),
    };
  });

  const fmtNum = (v: number, d = 2) => v.toLocaleString("pt-BR", { maximumFractionDigits: d });
  const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const pctDiff = (base: number, v: number) => base > 0 ? ((base - v) / base * 100) : 0;
  const shortName = (n: string) => n.split(" - ").pop() ?? n;

  const baseTotal = perScenario[baseIdx].result?.total_tco2e ?? 0;

  type MetricRow = { label: string; fmt: (v: number) => string; highlight?: boolean; values: number[] };
  const metricRows: MetricRow[] = [
    { label: "Emissões Totais (tCO₂e)", fmt: (v) => fmtNum(v, 2), highlight: true, values: perScenario.map((p) => p.result?.total_tco2e ?? 0) },
    { label: "Valor (R$)", fmt: fmtBRL, values: perScenario.map((p) => p.ind.totalCostR$) },
    { label: "Quantidade de concreto (m³)", fmt: (v) => fmtNum(v, 1), values: perScenario.map((p) => p.ind.concretoM3) },
    { label: "Indicador de Concreto tCO₂/m³", fmt: (v) => fmtNum(v, 2), values: perScenario.map((p) => p.ind.indicadorConcreto) },
    { label: "Quantidade de aço (ton)", fmt: (v) => fmtNum(v, 1), values: perScenario.map((p) => p.ind.acoTon) },
    { label: "Indicador de Aço tCO₂/ton", fmt: (v) => fmtNum(v, 2), values: perScenario.map((p) => p.ind.indicadorAco) },
    { label: "Emissões de Materiais (tCO₂e)", fmt: (v) => fmtNum(v, 2), values: perScenario.map((p) => (p.result?.scope3_materials_kgco2e ?? 0) / 1000) },
    { label: "Emissões de Transporte (tCO₂e)", fmt: (v) => fmtNum(v, 2), values: perScenario.map((p) => (p.result?.scope3_logistics_kgco2e ?? 0) / 1000) },
    { label: "Cobertura", fmt: (v) => `${fmtNum(v, 1)}%`, values: perScenario.map((p) => p.result?.coverage_pct ?? 0) },
    { label: "Itens mapeados", fmt: (v) => String(Math.round(v)), values: perScenario.map((p) => p.result?.items_mapped ?? 0) },
  ];

  return (
    <div className="space-y-6">
      {selector}

      {/* Summary KPIs — 1 card por cenário + Delta% vs Base pros nao-base */}
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${selected.length}, minmax(0, 1fr))` }}>
        {perScenario.map((p, i) => {
          const total = p.result?.total_tco2e ?? 0;
          const isBase = i === baseIdx;
          const diff = baseTotal - total;
          const diffPct = pctDiff(baseTotal, total);
          return (
            <div key={p.scen.id} className={cn(
              "rounded-xl border p-5 text-center",
              isBase ? "bg-white border-[#E0E4E3]"
                : diff > 0 ? "bg-[#E6F3EE] border-[#56B7A5]"
                : diff < 0 ? "bg-[#FEF3C7] border-[#F59E0B]" : "bg-[#F3F4F6] border-[#E0E4E3]"
            )}>
              <p className="text-[10px] font-semibold text-[#808181] uppercase tracking-wide mb-2">
                {p.scen.name}{isBase ? " (Base)" : ""}
              </p>
              <p className="text-3xl font-bold text-[#030304]">{total.toFixed(1)}</p>
              <p className="text-xs text-[#808181]">tCO₂e</p>
              {!isBase && (
                <p className={cn("text-xs font-bold mt-1", diff > 0 ? "text-[#1d7a6b]" : diff < 0 ? "text-[#b45309]" : "text-[#808181]")}>
                  {diff > 0 ? "-" : diff < 0 ? "+" : ""}{Math.abs(diffPct).toFixed(1)}% vs Base
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Report-style indicators table */}
      <div className="bg-white rounded-xl border border-[#E0E4E3] overflow-hidden">
        <div className="px-5 py-3 border-b border-[#E0E4E3] bg-[#F8FAF9]">
          <p className="text-xs font-bold text-[#030304]">Indicadores Comparativos</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#E0E4E3]">
                <th className="text-left px-5 py-3 text-[10px] font-semibold text-[#808181] uppercase tracking-wide whitespace-nowrap">Parâmetro</th>
                {perScenario.map((p, i) => (
                  <th key={p.scen.id} className="text-right px-5 py-3 text-[10px] font-semibold text-[#808181] uppercase tracking-wide whitespace-nowrap">
                    {shortName(p.scen.name)}{i === baseIdx ? " (Base)" : ""}
                    {i !== baseIdx && <span className="block normal-case font-normal">Δ% vs Base</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metricRows.map((row) => (
                <tr key={row.label} className={cn("border-b border-[#F0F4F3]", row.highlight ? "bg-[#F8FAF9]" : "")}>
                  <td className={cn("px-5 py-2.5 text-[#030304] whitespace-nowrap", row.highlight ? "font-bold" : "font-semibold")}>{row.label}</td>
                  {row.values.map((v, i) => {
                    const d = i !== baseIdx ? pctDiff(row.values[baseIdx], v) : null;
                    return (
                      <td key={i} className="px-5 py-2.5 text-right whitespace-nowrap">
                        <span className="text-[#030304] font-semibold">{row.fmt(v)}</span>
                        {d !== null && (
                          <span className={cn("block font-bold", d > 0 ? "text-[#1d7a6b]" : d < 0 ? "text-[#b45309]" : "text-[#808181]")}>
                            {d !== 0 ? `${Math.abs(d).toFixed(2)}%` : "0.00%"}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Material-by-material comparison */}
      <div className="bg-white rounded-xl border border-[#E0E4E3] overflow-hidden">
        <div className="px-5 py-3 border-b border-[#E0E4E3] bg-[#F8FAF9]">
          <p className="text-xs font-bold text-[#030304]">Top Emissores por Material (tCO₂e)</p>
        </div>
        <div className="max-h-[400px] overflow-y-auto overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-[#F0F4F3]">
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-[#808181] uppercase whitespace-nowrap">Material</th>
                {selected.map((s) => (
                  <th key={s.scen.id} className="text-right px-3 py-2.5 text-[10px] font-semibold text-[#808181] uppercase whitespace-nowrap">
                    {shortName(s.scen.name)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {materialRows.map((row) => (
                <tr key={row.name} className="border-b border-[#F0F4F3]">
                  <td className="px-4 py-2 text-[#030304] leading-snug max-w-[200px] truncate" title={row.name}>
                    {row.name.length > 35 ? row.name.slice(0, 32) + "…" : row.name}
                  </td>
                  {row.values.map((v, i) => (
                    <td key={i} className="px-3 py-2 text-right text-[#030304] whitespace-nowrap">{v.toFixed(1)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
// ─── Page ────────────────────────────────────────────────────────────────────

type BottomTab = "impact" | "compare";

export default function ScenariosPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [scenarios, setScenarios] = useState<ScenarioResponse[]>([]);
  const [selectedScenId, setSelectedScenId] = useState<string | null>(null);
  const [bottomTab, setBottomTab] = useState<BottomTab>("impact");
  const [loading, setLoading] = useState(true);
  const [creatingBase, setCreatingBase] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [showUploadDialog, setShowUploadDialog] = useState(false);

  const loadScenarios = async () => {
    try {
      const [data, proj] = await Promise.all([
        listScenarios(projectId),
        getProject(projectId),
      ]);
      setProjectName(proj.name);
      setScenarios(data);
    } catch {
      console.error("Erro ao carregar cenários");
    }
    setLoading(false);
  };

  useEffect(() => { loadScenarios(); }, []);

  const baseScen = scenarios.find((s) => s.is_base) ?? null;
  const selectedScen = scenarios.find((s) => s.id === selectedScenId);

  const handleSetBase = async (scenarioId: string) => {
    try {
      const res = await fetch(`/api/scenarios/${scenarioId}/set-base`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Erro");
      await loadScenarios();
    } catch {
      alert("Erro ao definir cenário base");
    }
  };

  const handleCreateBase = async () => {
    setCreatingBase(true);
    try {
      await createBaseScenario(projectId);
      await loadScenarios();
    } catch {
      alert("Erro ao criar cenário base");
    }
    setCreatingBase(false);
  };

  const handleDelete = async (scenarioId: string) => {
    try {
      await deleteScenario(scenarioId);
      if (selectedScenId === scenarioId) setSelectedScenId(null);
      // Clear the active scenario pointer if we just deleted it
      const key = `znit_active_scenario_${projectId}`;
      if (typeof window !== "undefined" && localStorage.getItem(key) === scenarioId) {
        localStorage.removeItem(key);
        window.dispatchEvent(new CustomEvent("znit:active-scenario-changed", { detail: { id: null } }));
      }
      await loadScenarios();
    } catch (e) {
      alert("Erro ao excluir cenário: " + (e instanceof Error ? e.message : "erro"));
    }
  };

  if (loading) {
    return (
      <div className="p-7 flex items-center justify-center min-h-[400px]">
        <Loader2 size={24} className="text-[#56B7A5] animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-7">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-xs font-semibold text-[#808181] uppercase tracking-widest mb-1">
            {projectName}
          </p>
          <h1 className="text-2xl font-bold text-[#030304]">Cenários</h1>
          <p className="text-sm text-[#808181] mt-0.5">
            {scenarios.length === 0
              ? "Nenhum cenário calculado"
              : `${scenarios.length} cenário${scenarios.length > 1 ? "s" : ""} · Selecione para analisar`}
          </p>
        </div>
        <div className="flex gap-2">
          {!baseScen && (
            <Button onClick={handleCreateBase} disabled={creatingBase}>
              {creatingBase ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
              {creatingBase ? "Calculando..." : "Gerar Cenário Base"}
            </Button>
          )}
          {baseScen && (
            <Button variant="secondary" onClick={handleCreateBase} disabled={creatingBase}>
              {creatingBase ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
              Recalcular Base
            </Button>
          )}
        </div>
      </div>

      {/* No scenarios */}
      {scenarios.length === 0 && (
        <div className="flex flex-col items-center justify-center py-14 text-center bg-[#F8FAF9] rounded-xl border border-dashed border-[#E0E4E3]">
          <Leaf size={28} className="text-[#BDBDBC] mb-3" />
          <p className="text-sm font-semibold text-[#808181]">Nenhum cenário calculado</p>
          <p className="text-xs text-[#BDBDBC] mt-1">
            Importe a Curva ABC, execute o Auto-Map e clique em &quot;Gerar Cenário Base&quot;.
          </p>
        </div>
      )}

      {/* Scenario cards */}
      {scenarios.length > 0 && (
        <>
          <div className="grid grid-cols-4 gap-4 mb-7">
            {scenarios.map((scen) => (
              <ScenarioCard
                key={scen.id}
                scen={scen}
                baseScen={baseScen}
                selected={selectedScenId === scen.id}
                onSelect={() =>
                  setSelectedScenId(selectedScenId === scen.id ? null : scen.id)
                }
                onSetBase={scen.is_base ? undefined : () => handleSetBase(scen.id)}
                onDelete={() => handleDelete(scen.id)}
              />
            ))}

            {/* Add new — upload-based scenario */}
            <button
              onClick={() => setShowUploadDialog(true)}
              className="border-2 border-dashed border-[#BDBDBC] rounded-xl p-5 text-center hover:border-[#56B7A5] hover:bg-[#E6F3EE] transition-all group"
            >
              <div className="w-10 h-10 bg-[#F3F4F6] rounded-xl flex items-center justify-center mx-auto mb-3 group-hover:bg-[#C8E6DE] transition-all">
                <Upload size={18} className="text-[#BDBDBC] group-hover:text-[#56B7A5]" />
              </div>
              <p className="text-sm font-semibold text-[#808181] group-hover:text-[#56B7A5]">
                Novo cenário a partir de arquivo
              </p>
              <p className="text-xs text-[#BDBDBC] mt-1 leading-relaxed">
                Suba uma nova Curva ABC (ou items + insumos)
              </p>
            </button>
          </div>

          {/* Analysis section */}
          <div>
            <div className="flex gap-0 border-b border-[#E0E4E3] mb-6">
              <button
                onClick={() => setBottomTab("impact")}
                className={cn(
                  "flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all -mb-px",
                  bottomTab === "impact"
                    ? "border-[#56B7A5] text-[#1d7a6b]"
                    : "border-transparent text-[#808181] hover:text-[#404040]"
                )}
              >
                <Edit3 size={14} />
                Análise do cenário
              </button>
              <button
                onClick={() => setBottomTab("compare")}
                className={cn(
                  "flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all -mb-px",
                  bottomTab === "compare"
                    ? "border-[#56B7A5] text-[#1d7a6b]"
                    : "border-transparent text-[#808181] hover:text-[#404040]"
                )}
              >
                <GitCompare size={14} />
                Comparar cenários
              </button>
            </div>

            {bottomTab === "impact" && (
              <>
                {!selectedScen ? (
                  <div className="flex flex-col items-center justify-center py-14 text-center bg-[#F8FAF9] rounded-xl border border-dashed border-[#E0E4E3]">
                    <BarChart3 size={28} className="text-[#BDBDBC] mb-3" />
                    <p className="text-sm font-semibold text-[#808181]">
                      Selecione um cenário acima para ver o detalhe
                    </p>
                    <p className="text-xs text-[#BDBDBC] mt-1">
                      Clique em um cenário para ver os top emissores, cobertura e breakdown.
                    </p>
                  </div>
                ) : (
                  <ImpactAnalysis scenarioId={selectedScen.id} projectId={projectId} />
                )}
              </>
            )}

            {bottomTab === "compare" && (
              <ScenarioComparison scenarios={scenarios} />
            )}
          </div>
        </>
      )}

      <NewScenarioFromUploadDialog
        projectId={projectId}
        open={showUploadDialog}
        onClose={() => setShowUploadDialog(false)}
        onCreated={() => {
          setShowUploadDialog(false);
          loadScenarios();
        }}
      />
    </div>
  );
}
