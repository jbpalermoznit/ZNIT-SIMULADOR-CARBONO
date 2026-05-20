"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Plus, Lock, TrendingDown, Copy, Edit3, Upload,
  GitCompare, ChevronDown, Loader2,
  BarChart3, Zap, Leaf,
} from "lucide-react";
import {
  listScenarios, createBaseScenario, createScenario, getScenario,
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
}: {
  scen: ScenarioResponse;
  baseScen: ScenarioResponse | null;
  selected: boolean;
  onSelect: () => void;
  onSetBase?: () => void;
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
      </div>

      <div className="text-2xl font-bold text-[#030304] mb-0.5">
        {totalTco2e.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
        <span className="text-sm font-normal text-[#808181] ml-1">tCO₂e</span>
      </div>
      <p className="text-xs text-[#808181] mb-3">
        {intensity} kgCO₂e/m² · {coverage.toFixed(0)}% cobertura
        {scen.items_count != null && ` · ${scen.items_count} itens`}
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

  // Direct items (no parent) with emission
  const directItems = detail.items
    .filter((i) => !((i as unknown as Record<string, unknown>).parent_item_id) && (i.emission_tco2e ?? 0) > 0 && !i.is_excluded)
    .sort((a, b) => (b.emission_tco2e ?? 0) - (a.emission_tco2e ?? 0));

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
  })), ...directItems.map((i) => ({
    id: i.id,
    description: i.description ?? "",
    cost_code: i.cost_code ?? "",
    quantity: i.quantity,
    unit: i.unit ?? "",
    emission_tco2e: i.emission_tco2e ?? 0,
    isComposition: false,
    children_count: 0,
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
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap text-[#808181]">
                      {item.quantity?.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} {item.unit}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-[#808181]">
                      {item.isComposition ? "Σ insumos" : "—"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {item.isComposition && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#E6F3EE] text-[#1d7a6b]">
                          Composição
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <span className="font-bold text-[#030304]">
                        {item.emission_tco2e.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
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
                          {child.factor_value} {child.factor_unit}
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
                                ? (child.emission_tco2e ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })
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
  const [compareIds, setCompareIds] = useState<[string, string] | null>(null);

  // Auto-select first two scenarios
  useEffect(() => {
    if (scenarios.length >= 2) {
      const ids = scenarios.slice(0, 2).map((s) => s.id) as [string, string];
      setCompareIds(ids);
    }
  }, [scenarios]);

  useEffect(() => {
    if (!compareIds) return;
    setLoading(true);
    Promise.all(compareIds.map((id) => getScenario(id)))
      .then(([a, b]) => {
        setDetails({ [compareIds[0]]: a, [compareIds[1]]: b });
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

  if (loading || !compareIds) {
    return <div className="py-12 text-center"><Loader2 size={20} className="text-[#56B7A5] animate-spin mx-auto" /></div>;
  }

  const scenA = scenarios.find((s) => s.id === compareIds[0]);
  const scenB = scenarios.find((s) => s.id === compareIds[1]);
  const detailA = details[compareIds[0]];
  const detailB = details[compareIds[1]];

  if (!scenA || !scenB || !detailA || !detailB) return null;

  const rA = scenA.result;
  const rB = scenB.result;
  const totalA = rA?.total_tco2e ?? 0;
  const totalB = rB?.total_tco2e ?? 0;
  const diff = totalA - totalB;
  const diffPct = totalA > 0 ? (diff / totalA) * 100 : 0;

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

  const groupsA = groupItems(detailA.items);
  const groupsB = groupItems(detailB.items);
  const allMaterials = [...new Set([...Object.keys(groupsA), ...Object.keys(groupsB)])];
  const materialRows = allMaterials
    .map((name) => ({
      name,
      a: groupsA[name]?.tco2e ?? 0,
      b: groupsB[name]?.tco2e ?? 0,
    }))
    .sort((x, y) => Math.max(y.a, y.b) - Math.max(x.a, x.b))
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
      const desc = (item.description ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const indA = calcIndicators(detailA.items, ((detailA as any).parent_items ?? []) as Record<string, unknown>[]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const indB = calcIndicators(detailB.items, ((detailB as any).parent_items ?? []) as Record<string, unknown>[]);

  const fmtNum = (v: number, d = 2) => v.toLocaleString("pt-BR", { maximumFractionDigits: d });
  const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const pctDiff = (a: number, b: number) => a > 0 ? ((a - b) / a * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Scenario selectors */}
      <div className="grid grid-cols-2 gap-4">
        {[0, 1].map((idx) => (
          <div key={idx}>
            <label className="text-[10px] font-semibold text-[#808181] uppercase tracking-wide mb-1 block">
              {idx === 0 ? "Cenário A (Referência)" : "Cenário B (Comparação)"}
            </label>
            <select
              className="w-full px-3 py-2 border border-[#E0E4E3] rounded-lg text-sm text-[#030304] focus:outline-none focus:ring-2 focus:ring-[#56B7A5]/30"
              value={compareIds[idx]}
              onChange={(e) => {
                const ids = [...compareIds] as [string, string];
                ids[idx] = e.target.value;
                setCompareIds(ids);
              }}
            >
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({(s.result?.total_tco2e ?? 0).toFixed(1)} tCO₂e)</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-[#E0E4E3] p-5 text-center">
          <p className="text-[10px] font-semibold text-[#808181] uppercase tracking-wide mb-2">{scenA.name}</p>
          <p className="text-3xl font-bold text-[#030304]">{totalA.toFixed(1)}</p>
          <p className="text-xs text-[#808181]">tCO₂e</p>
        </div>
        <div className="bg-white rounded-xl border border-[#E0E4E3] p-5 text-center">
          <p className="text-[10px] font-semibold text-[#808181] uppercase tracking-wide mb-2">{scenB.name}</p>
          <p className="text-3xl font-bold text-[#030304]">{totalB.toFixed(1)}</p>
          <p className="text-xs text-[#808181]">tCO₂e</p>
        </div>
        <div className={cn(
          "rounded-xl border p-5 text-center",
          diff > 0 ? "bg-[#E6F3EE] border-[#56B7A5]" : diff < 0 ? "bg-[#FEF3C7] border-[#F59E0B]" : "bg-[#F3F4F6] border-[#E0E4E3]"
        )}>
          <p className="text-[10px] font-semibold text-[#808181] uppercase tracking-wide mb-2">Redução</p>
          <p className={cn("text-3xl font-bold", diff > 0 ? "text-[#1d7a6b]" : "text-[#b45309]")}>
            {diff > 0 ? "-" : "+"}{Math.abs(diffPct).toFixed(1)}%
          </p>
          <p className="text-xs text-[#808181]">
            {diff > 0 ? "-" : "+"}{Math.abs(diff).toFixed(1)} tCO₂e
          </p>
        </div>
      </div>

      {/* Report-style indicators table */}
      <div className="bg-white rounded-xl border border-[#E0E4E3] overflow-hidden">
        <div className="px-5 py-3 border-b border-[#E0E4E3] bg-[#F8FAF9]">
          <p className="text-xs font-bold text-[#030304]">Indicadores Comparativos</p>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#E0E4E3]">
              <th className="text-left px-5 py-3 text-[10px] font-semibold text-[#808181] uppercase tracking-wide">Parâmetro</th>
              <th className="text-right px-5 py-3 text-[10px] font-semibold text-[#808181] uppercase tracking-wide">{scenA.name.split(" - ").pop()}</th>
              <th className="text-right px-5 py-3 text-[10px] font-semibold text-[#808181] uppercase tracking-wide">{scenB.name.split(" - ").pop()}</th>
              <th className="text-right px-5 py-3 text-[10px] font-semibold text-[#808181] uppercase tracking-wide">Diferença %</th>
            </tr>
          </thead>
          <tbody>
            {[
              { label: "Emissões Totais (tCO₂e)", a: totalA, b: totalB, fmt: (v: number) => fmtNum(v, 2), highlight: true },
              { label: "Valor (R$)", a: indA.totalCostR$, b: indB.totalCostR$, fmt: (v: number) => fmtBRL(v) },
              { label: "Quantidade de concreto (m³)", a: indA.concretoM3, b: indB.concretoM3, fmt: (v: number) => fmtNum(v, 1) },
              { label: "Indicador de Concreto tCO₂/m³", a: indA.indicadorConcreto, b: indB.indicadorConcreto, fmt: (v: number) => fmtNum(v, 2) },
              { label: "Quantidade de aço (ton)", a: indA.acoTon, b: indB.acoTon, fmt: (v: number) => fmtNum(v, 1) },
              { label: "Indicador de Aço tCO₂/ton", a: indA.indicadorAco, b: indB.indicadorAco, fmt: (v: number) => fmtNum(v, 2) },
              { label: "Emissões de Materiais (tCO₂e)", a: (rA?.scope3_materials_kgco2e ?? 0) / 1000, b: (rB?.scope3_materials_kgco2e ?? 0) / 1000, fmt: (v: number) => fmtNum(v, 2) },
              { label: "Emissões de Transporte (tCO₂e)", a: (rA?.scope3_logistics_kgco2e ?? 0) / 1000, b: (rB?.scope3_logistics_kgco2e ?? 0) / 1000, fmt: (v: number) => fmtNum(v, 2) },
              { label: "Cobertura", a: rA?.coverage_pct ?? 0, b: rB?.coverage_pct ?? 0, fmt: (v: number) => `${fmtNum(v, 1)}%` },
              { label: "Itens mapeados", a: rA?.items_mapped ?? 0, b: rB?.items_mapped ?? 0, fmt: (v: number) => String(Math.round(v)) },
            ].map((row) => {
              const d = pctDiff(row.a, row.b);
              return (
                <tr key={row.label} className={cn("border-b border-[#F0F4F3]", row.highlight ? "bg-[#F8FAF9]" : "")}>
                  <td className={cn("px-5 py-2.5 text-[#030304]", row.highlight ? "font-bold" : "font-semibold")}>{row.label}</td>
                  <td className="px-5 py-2.5 text-right text-[#030304] font-semibold">{row.fmt(row.a)}</td>
                  <td className="px-5 py-2.5 text-right text-[#030304] font-semibold">{row.fmt(row.b)}</td>
                  <td className={cn("px-5 py-2.5 text-right font-bold", d > 0 ? "text-[#1d7a6b]" : d < 0 ? "text-[#b45309]" : "text-[#808181]")}>
                    {d !== 0 ? `${Math.abs(d).toFixed(2)}%` : "0.00%"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Material-by-material comparison */}
      <div className="bg-white rounded-xl border border-[#E0E4E3] overflow-hidden">
        <div className="px-5 py-3 border-b border-[#E0E4E3] bg-[#F8FAF9]">
          <p className="text-xs font-bold text-[#030304]">Top Emissores por Material (tCO₂e)</p>
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-[#F0F4F3]">
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-[#808181] uppercase">Material</th>
                <th className="text-right px-3 py-2.5 text-[10px] font-semibold text-[#808181] uppercase">{scenA.name.split(" - ").pop()}</th>
                <th className="text-right px-3 py-2.5 text-[10px] font-semibold text-[#808181] uppercase">{scenB.name.split(" - ").pop()}</th>
                <th className="text-right px-3 py-2.5 text-[10px] font-semibold text-[#808181] uppercase">Dif.</th>
              </tr>
            </thead>
            <tbody>
              {materialRows.map((row) => {
                const d = row.a > 0 ? ((row.a - row.b) / row.a * 100) : 0;
                return (
                  <tr key={row.name} className="border-b border-[#F0F4F3]">
                    <td className="px-4 py-2 text-[#030304] leading-snug max-w-[200px] truncate" title={row.name}>
                      {row.name.length > 35 ? row.name.slice(0, 32) + "…" : row.name}
                    </td>
                    <td className="px-3 py-2 text-right text-[#030304] whitespace-nowrap">{row.a.toFixed(1)}</td>
                    <td className="px-3 py-2 text-right text-[#030304] whitespace-nowrap">{row.b.toFixed(1)}</td>
                    <td className={cn("px-3 py-2 text-right font-semibold whitespace-nowrap", d > 0 ? "text-[#1d7a6b]" : d < 0 ? "text-[#b45309]" : "text-[#808181]")}>
                      {row.a === 0 && row.b === 0 ? "—" : d > 0 ? `↓${d.toFixed(0)}%` : d < 0 ? `↑${Math.abs(d).toFixed(0)}%` : "="}
                    </td>
                  </tr>
                );
              })}
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
            Importe a Curva ABC, execute o Auto-Map e clique em "Gerar Cenário Base".
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
