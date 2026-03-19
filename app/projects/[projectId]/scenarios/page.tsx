"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Plus, Lock, TrendingDown, Copy, Edit3,
  GitCompare, ChevronDown, Loader2,
  BarChart3, Zap, Leaf,
} from "lucide-react";
import {
  listScenarios, createBaseScenario, createScenario, getScenario,
  type ScenarioResponse, type ScenarioDetailResponse, type ScenarioItemResponse,
} from "@/lib/api/scenarios";


// ─── Scenario card ────────────────────────────────────────────────────────────

function ScenarioCard({
  scen,
  baseScen,
  selected,
  onSelect,
}: {
  scen: ScenarioResponse;
  baseScen: ScenarioResponse | null;
  selected: boolean;
  onSelect: () => void;
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
          ? "border-[#E0E4E3] shadow-[0_1px_3px_rgba(3,3,4,0.06)]"
          : "border-[#E0E4E3] shadow-[0_1px_3px_rgba(3,3,4,0.06)] hover:border-[#A9D7CD]"
      )}
      onClick={isBase ? undefined : onSelect}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            {isBase && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#E6F3EE] text-[#56B7A5]">
                BASE
              </span>
            )}
            {scen.status === "locked" && !isBase && (
              <Lock size={11} className="text-[#BDBDBC]" />
            )}
            {selected && !isBase && (
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

      {!isBase && delta > 0 && (
        <div className="flex items-center gap-1.5 bg-[#E6F3EE] rounded-lg px-2.5 py-1.5 mb-3">
          <TrendingDown size={13} className="text-[#56B7A5]" />
          <span className="text-xs font-bold text-[#1d7a6b]">
            -{delta.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} tCO₂e ({deltaPct}%)
          </span>
        </div>
      )}

      {isBase && (
        <p className="text-[10px] text-[#BDBDBC]">Referência — gerado automaticamente</p>
      )}
    </div>
  );
}

// ─── Impact Analysis (scenario detail) ────────────────────────────────────────

function ImpactAnalysis({ scenarioId }: { scenarioId: string }) {
  const [detail, setDetail] = useState<ScenarioDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getScenario(scenarioId)
      .then(setDetail)
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
  const itemsWithEmission = detail.items
    .filter((i) => i.emission_kgco2e && i.emission_kgco2e > 0 && !i.is_excluded)
    .sort((a, b) => (b.emission_kgco2e ?? 0) - (a.emission_kgco2e ?? 0));

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
          <p className="text-[10px] font-semibold text-[#808181] uppercase tracking-wide mb-1">Itens com emissão</p>
          <p className="text-2xl font-bold text-[#030304]">{itemsWithEmission.length}</p>
          <p className="text-xs text-[#808181] mt-0.5">{r?.items_excluded ?? 0} excluídos</p>
        </div>
      </div>

      {/* Top emitters table */}
      <div className="bg-white rounded-xl border border-[#E0E4E3] overflow-hidden">
        <div className="px-5 py-3 border-b border-[#E0E4E3] bg-[#F8FAF9]">
          <p className="text-xs font-bold text-[#030304]">Top emissores do cenário</p>
        </div>
        {itemsWithEmission.length === 0 ? (
          <p className="text-sm text-[#BDBDBC] px-5 py-6 text-center">Nenhum item com emissão calculada.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#F0F4F3]">
                {["Item", "Tipo", "Fator", "Fonte", "tCO₂e"].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 text-[10px] font-semibold text-[#808181] uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {itemsWithEmission.slice(0, 20).map((item) => (
                <tr key={item.id} className="border-b border-[#F0F4F3] hover:bg-[#F8FAF9]">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-[#030304] leading-snug">{item.description}</p>
                    <p className="text-[10px] text-[#808181] font-mono">{item.cost_code}</p>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-[10px] font-bold text-[#808181]">{item.item_type}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-[#030304]">
                      {item.factor_value} {item.factor_unit}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {item.source_tier && (
                      <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded",
                        item.source_tier === "ecoinvent" ? "bg-[#DBEAFE] text-[#1e40af]" :
                        item.source_tier === "ghg_protocol" ? "bg-[#E6F3EE] text-[#1d7a6b]" :
                        "bg-[#F3F4F6] text-[#808181]"
                      )}>
                        {item.source_tier === "ecoinvent" ? "Ecoinvent" :
                         item.source_tier === "ghg_protocol" ? "GHG Protocol" :
                         item.source_tier}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <span className="font-bold text-[#030304]">
                      {(item.emission_tco2e ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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

  const loadScenarios = async () => {
    try {
      const data = await listScenarios(projectId);
      setScenarios(data);
    } catch {
      console.error("Erro ao carregar cenários");
    }
    setLoading(false);
  };

  useEffect(() => { loadScenarios(); }, []);

  const baseScen = scenarios.find((s) => s.is_base) ?? null;
  const selectedScen = scenarios.find((s) => s.id === selectedScenId);

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
            Raízen VRO R8
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
              />
            ))}

            {/* Add new placeholder */}
            <button className="border-2 border-dashed border-[#BDBDBC] rounded-xl p-5 text-center hover:border-[#56B7A5] hover:bg-[#E6F3EE] transition-all group">
              <div className="w-10 h-10 bg-[#F3F4F6] rounded-xl flex items-center justify-center mx-auto mb-3 group-hover:bg-[#C8E6DE] transition-all">
                <Plus size={18} className="text-[#BDBDBC] group-hover:text-[#56B7A5]" />
              </div>
              <p className="text-sm font-semibold text-[#808181] group-hover:text-[#56B7A5]">
                Novo Cenário
              </p>
              <p className="text-xs text-[#BDBDBC] mt-1 leading-relaxed">
                Duplique o Base e substitua materiais
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
                  <ImpactAnalysis scenarioId={selectedScen.id} />
                )}
              </>
            )}

            {bottomTab === "compare" && (
              <div className="flex flex-col items-center justify-center py-14 text-center bg-[#F8FAF9] rounded-xl border border-dashed border-[#E0E4E3]">
                <GitCompare size={28} className="text-[#BDBDBC] mb-3" />
                <p className="text-sm font-semibold text-[#808181]">
                  Comparação entre cenários
                </p>
                <p className="text-xs text-[#BDBDBC] mt-1">
                  Disponível quando houver cenários alternativos criados.
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
