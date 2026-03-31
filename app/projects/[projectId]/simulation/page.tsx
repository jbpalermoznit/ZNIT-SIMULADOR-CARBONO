"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { KpiCard } from "@/components/ui/kpi-card";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Leaf, DollarSign, TrendingDown, Scale, Loader2,
  ArrowRight, AlertTriangle, Info,
} from "lucide-react";
import { listScenarios, type ScenarioResponse } from "@/lib/api/scenarios";
import { getProject, type ProjectResponse } from "@/lib/api/projects";

const PRESET_PRICES = [30, 50, 100, 200, 500];

const fmt = (v: number, decimals = 1) =>
  v.toLocaleString("pt-BR", { maximumFractionDigits: decimals, minimumFractionDigits: decimals });

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export default function SimulationPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioResponse[]>([]);
  const [offsetPrice, setOffsetPrice] = useState(50);
  const [selectedAltId, setSelectedAltId] = useState<string | null>(null);
  const [showAltDropdown, setShowAltDropdown] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [scens, proj] = await Promise.all([
          listScenarios(projectId),
          getProject(projectId),
        ]);
        setScenarios(scens);
        setProject(proj);
        // Auto-select first non-base scenario with results
        const alt = scens.find((s) => !s.is_base && s.result);
        if (alt) setSelectedAltId(alt.id);
      } catch {
        console.error("Erro ao carregar dados");
      }
      setLoading(false);
    }
    load();
  }, [projectId]);

  const [selectedBaseId, setSelectedBaseId] = useState<string | null>(null);

  // Auto-select base and alt on load
  useEffect(() => {
    if (scenarios.length > 0 && !selectedBaseId) {
      const base = scenarios.find((s) => s.is_base && s.result);
      if (base) setSelectedBaseId(base.id);
      else if (scenarios[0]?.result) setSelectedBaseId(scenarios[0].id);
    }
  }, [scenarios, selectedBaseId]);

  const baseScenario = useMemo(() => scenarios.find((s) => s.id === selectedBaseId), [scenarios, selectedBaseId]);
  const altScenario = useMemo(() => scenarios.find((s) => s.id === selectedAltId), [scenarios, selectedAltId]);
  const scenariosWithResult = useMemo(() => scenarios.filter((s) => s.result), [scenarios]);

  const baseTco2e = baseScenario?.result?.total_tco2e ?? 0;
  const altTco2e = altScenario?.result?.total_tco2e ?? 0;

  // Project costs from scenario items total_cost
  const [projectCosts, setProjectCosts] = useState<Record<string, number>>({});

  useEffect(() => {
    // Fetch abc_curves total_cost for each scenario
    async function loadCosts() {
      const costs: Record<string, number> = {};
      for (const s of scenarios) {
        try {
          const token = localStorage.getItem("znit_token");
          const res = await fetch(`/api/scenarios/${s.id}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            // Cost = parents (compositions) + direct items (no parent)
            const parentsCost = (data.parent_items ?? []).reduce(
              (sum: number, i: { total_cost?: number }) => sum + (i.total_cost ?? 0),
              0
            );
            const directItemsCost = (data.items ?? [])
              .filter((i: { parent_item_id?: string }) => !i.parent_item_id)
              .reduce(
                (sum: number, i: { total_cost?: number }) => sum + (i.total_cost ?? 0),
                0
              );
            costs[s.id] = parentsCost + directItemsCost;
          }
        } catch { /* ignore */ }
      }
      setProjectCosts(costs);
    }
    if (scenarios.length > 0) loadCosts();
  }, [scenarios]);

  const baseCostProject = projectCosts[selectedBaseId ?? ""] ?? 0;
  const altCostProject = projectCosts[selectedAltId ?? ""] ?? 0;
  const deltaCostProject = altCostProject - baseCostProject;

  const custoCompensarTudo = baseTco2e * offsetPrice;
  const custoResidual = altTco2e * offsetPrice;
  const reducaoTco2e = baseTco2e - altTco2e;
  const reducaoPct = baseTco2e > 0 ? (reducaoTco2e / baseTco2e) * 100 : 0;
  const economia = custoCompensarTudo - custoResidual;
  const netSaving = economia - Math.max(0, deltaCostProject); // economia em compensação menos custo adicional do projeto

  // Chart dimensions
  const chartHeight = 280;
  const chartWidth = 480;
  const barWidth = 120;
  const maxVal = Math.max(custoCompensarTudo, custoResidual, 1);

  if (loading) {
    return (
      <div className="p-7 flex items-center justify-center min-h-[400px]">
        <Loader2 size={24} className="text-[#56B7A5] animate-spin" />
      </div>
    );
  }

  if (!baseScenario) {
    return (
      <div className="p-7">
        <div className="mb-7">
          <p className="text-xs font-semibold text-[#808181] uppercase tracking-widest mb-1">
            {project?.name}
          </p>
          <h1 className="text-2xl font-bold text-[#030304]">Simulacao de Compensacao</h1>
        </div>
        <div className="bg-[#FEF3C7] border border-[#FCD34D] rounded-xl p-5 flex items-start gap-3">
          <AlertTriangle size={18} className="text-[#b45309] shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-[#030304]">Cenario Base necessario</p>
            <p className="text-xs text-[#808181] mt-1">
              Para simular a compensacao, primeiro gere o Cenario Base na{" "}
              <Link href={`/projects/${projectId}/overview`} className="underline text-[#56B7A5] font-semibold">
                Visao Geral
              </Link>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-7">
      {/* Header */}
      <div className="mb-7">
        <p className="text-xs font-semibold text-[#808181] uppercase tracking-widest mb-1">
          {project?.name}
        </p>
        <h1 className="text-2xl font-bold text-[#030304]">Simulacao de Compensacao</h1>
        <p className="text-sm text-[#808181] mt-0.5">
          Compare o custo de compensar emissoes vs. reduzi-las com materiais alternativos
        </p>
      </div>

      {/* Scenario selectors */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-[#E0E4E3] p-4">
          <label className="text-[10px] font-semibold text-[#808181] uppercase tracking-wide block mb-2">
            Cenario Referencia (maior emissao)
          </label>
          <select
            value={selectedBaseId ?? ""}
            onChange={(e) => setSelectedBaseId(e.target.value)}
            className="w-full px-3 py-2 border border-[#E0E4E3] rounded-lg text-sm font-semibold text-[#030304] bg-[#F8FAF9] focus:outline-none focus:ring-2 focus:ring-[#56B7A5]/30"
          >
            <option value="" disabled>Selecionar cenario...</option>
            {scenariosWithResult.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({fmt(s.result?.total_tco2e ?? 0)} tCO2e)
              </option>
            ))}
          </select>
          {baseScenario && (
            <p className="text-xs text-[#808181] mt-2">
              {fmt(baseTco2e)} tCO2e · {baseScenario.result?.items_mapped ?? 0} itens mapeados
            </p>
          )}
        </div>
        <div className="bg-white rounded-xl border border-[#E0E4E3] p-4">
          <label className="text-[10px] font-semibold text-[#808181] uppercase tracking-wide block mb-2">
            Cenario Alternativo (menor emissao)
          </label>
          <select
            value={selectedAltId ?? ""}
            onChange={(e) => setSelectedAltId(e.target.value)}
            className="w-full px-3 py-2 border border-[#E0E4E3] rounded-lg text-sm font-semibold text-[#030304] bg-[#F8FAF9] focus:outline-none focus:ring-2 focus:ring-[#56B7A5]/30"
          >
            <option value="" disabled>Selecionar cenario...</option>
            {scenariosWithResult.filter((s) => s.id !== selectedBaseId).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({fmt(s.result?.total_tco2e ?? 0)} tCO2e)
              </option>
            ))}
          </select>
          {altScenario && (
            <p className="text-xs text-[#808181] mt-2">
              {fmt(altTco2e)} tCO2e · {altScenario.result?.items_mapped ?? 0} itens mapeados
            </p>
          )}
        </div>
      </div>

      {/* Offset price input */}
      <Card className="mb-6">
        <CardBody className="!p-5">
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-lg bg-[#E6F3EE] flex items-center justify-center shrink-0">
                <DollarSign size={20} className="text-[#1d7a6b]" />
              </div>
              <div>
                <p className="text-sm font-bold text-[#030304]">Preco do Credito de Carbono</p>
                <p className="text-xs text-[#808181] mt-0.5">Valor por tonelada de CO2 equivalente no mercado voluntario</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-sm font-semibold text-[#808181]">R$</span>
              <input
                type="number"
                value={offsetPrice}
                onChange={(e) => setOffsetPrice(Math.max(0, Number(e.target.value)))}
                className="w-24 h-10 px-3 rounded-lg border border-[#E0E4E3] text-lg font-bold text-[#030304] text-center bg-[#F8FAF9] focus:outline-none focus:border-[#56B7A5] focus:bg-white transition-all"
              />
              <span className="text-sm text-[#808181]">/ tCO2e</span>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4 pl-[60px]">
            <span className="text-[10px] text-[#808181] uppercase tracking-wide">Precos de referencia:</span>
            {PRESET_PRICES.map((p) => (
              <button
                key={p}
                onClick={() => setOffsetPrice(p)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                  offsetPrice === p
                    ? "bg-[#56B7A5] text-white"
                    : "bg-[#F8FAF9] text-[#808181] border border-[#E0E4E3] hover:border-[#56B7A5]"
                }`}
              >
                R$ {p}
              </button>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <KpiCard
          label="Emissoes Base"
          value={fmt(baseTco2e)}
          unit="tCO2e"
          sub={baseScenario.name}
          highlight
          icon={<Leaf size={20} />}
        />
        <KpiCard
          label="Custo Compensacao Total"
          value={fmtBRL(custoCompensarTudo)}
          sub={`${fmt(baseTco2e)} tCO2e x R$ ${offsetPrice}`}
          icon={<DollarSign size={20} />}
        />
        <KpiCard
          label={altScenario ? "Emissoes Cenario Reduzido" : "Cenario Alternativo"}
          value={altScenario ? fmt(altTco2e) : "—"}
          unit={altScenario ? "tCO2e" : ""}
          sub={altScenario ? altScenario.name : "Nenhum cenario alternativo"}
          icon={<TrendingDown size={20} />}
        />
        <KpiCard
          label="Economia com Reducao"
          value={altScenario ? fmtBRL(economia) : "—"}
          sub={altScenario ? `${fmt(reducaoPct, 0)}% menos emissoes` : "Crie um cenario alternativo"}
          icon={<Scale size={20} />}
        />
      </div>

      {/* Main comparison area */}
      <div className="grid grid-cols-3 gap-4">
        {/* Chart — 2 cols */}
        <Card className="col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-[#030304]">Comparativo de Estrategias</h2>
                <p className="text-xs text-[#808181] mt-0.5">
                  Custo total: compensar tudo vs. reduzir + compensar residual
                </p>
              </div>
            </div>
          </CardHeader>
          <CardBody>
            {!altScenario ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-12 h-12 rounded-full bg-[#F8FAF9] flex items-center justify-center mb-3">
                  <Info size={20} className="text-[#BDBDBC]" />
                </div>
                <p className="text-sm font-semibold text-[#030304]">Nenhum cenario alternativo</p>
                <p className="text-xs text-[#808181] mt-1 max-w-xs">
                  Crie um cenario com materiais alternativos em{" "}
                  <Link href={`/projects/${projectId}/scenarios`} className="underline text-[#56B7A5] font-semibold">
                    Cenarios
                  </Link>{" "}
                  para comparar estrategias.
                </p>
              </div>
            ) : (
              <div className="flex items-end justify-center gap-16 py-4">
                {/* Bar: Compensar Tudo */}
                <div className="flex flex-col items-center">
                  <p className="text-lg font-bold text-[#030304] mb-2">{fmtBRL(custoCompensarTudo)}</p>
                  <div className="relative" style={{ width: barWidth, height: chartHeight }}>
                    <div
                      className="absolute bottom-0 w-full rounded-t-lg bg-[#F59E0B] transition-all duration-500"
                      style={{ height: `${(custoCompensarTudo / maxVal) * 100}%` }}
                    >
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
                        <p className="text-xs font-bold">{fmt(baseTco2e)} tCO2e</p>
                        <p className="text-[10px] opacity-80">100% compensacao</p>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs font-bold text-[#030304] mt-3">Compensar Tudo</p>
                  <p className="text-[10px] text-[#808181]">Sem reducao de emissoes</p>
                </div>

                {/* Arrow */}
                <div className="flex flex-col items-center pb-20">
                  <div className="bg-[#E6F3EE] rounded-full px-3 py-1.5 mb-2">
                    <p className="text-xs font-bold text-[#1d7a6b]">
                      -{fmt(reducaoPct, 0)}%
                    </p>
                  </div>
                  <ArrowRight size={20} className="text-[#56B7A5]" />
                  <p className="text-[10px] text-[#808181] mt-1">{fmt(reducaoTco2e)} tCO2e</p>
                </div>

                {/* Bar: Reduzir + Compensar */}
                <div className="flex flex-col items-center">
                  <p className="text-lg font-bold text-[#1d7a6b] mb-2">{fmtBRL(custoResidual)}</p>
                  <div className="relative" style={{ width: barWidth, height: chartHeight }}>
                    <div
                      className="absolute bottom-0 w-full rounded-t-lg bg-[#56B7A5] transition-all duration-500"
                      style={{ height: `${(custoResidual / maxVal) * 100}%` }}
                    >
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
                        <p className="text-xs font-bold">{fmt(altTco2e)} tCO2e</p>
                        <p className="text-[10px] opacity-80">residual</p>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs font-bold text-[#030304] mt-3">Reduzir + Compensar</p>
                  <p className="text-[10px] text-[#808181]">{altScenario?.name}</p>
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Breakdown — 1 col */}
        <Card>
          <CardHeader>
            <h2 className="text-sm font-bold text-[#030304]">Detalhamento</h2>
            <p className="text-xs text-[#808181] mt-0.5">Analise comparativa</p>
          </CardHeader>
          <CardBody>
            <div className="space-y-0">
              {/* Compensar Tudo section */}
              <div className="pb-4 border-b border-[#E0E4E3]">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]" />
                  <p className="text-xs font-bold text-[#030304]">Compensar Tudo</p>
                </div>
                <div className="space-y-2">
                  <Row label="Emissoes totais" value={`${fmt(baseTco2e)} tCO2e`} />
                  <Row label="Creditos necessarios" value={`${fmt(baseTco2e)} tCO2e`} />
                  <Row label="Custo creditos" value={fmtBRL(custoCompensarTudo)} bold />
                </div>
              </div>

              {/* Reduzir section */}
              {altScenario && (
                <div className="py-4 border-b border-[#E0E4E3]">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#56B7A5]" />
                    <p className="text-xs font-bold text-[#030304]">Reduzir + Compensar</p>
                  </div>
                  <div className="space-y-2">
                    <Row label="Emissoes reduzidas" value={`${fmt(altTco2e)} tCO2e`} />
                    <Row label="Reducao vs. base" value={`-${fmt(reducaoTco2e)} tCO2e (${fmt(reducaoPct, 0)}%)`} highlight />
                    <Row label="Creditos residuais" value={`${fmt(altTco2e)} tCO2e`} />
                    <Row label="Custo creditos" value={fmtBRL(custoResidual)} bold />
                  </div>
                </div>
              )}

              {/* Resultado */}
              {altScenario && (
                <>
                  <div className="pt-4">
                    <div className="bg-[#E6F3EE] rounded-lg p-3">
                      <p className="text-[10px] text-[#1d7a6b] uppercase tracking-wide font-bold mb-1">
                        Economia em compensacao
                      </p>
                      <p className="text-xl font-bold text-[#1d7a6b]">{fmtBRL(economia)}</p>
                      <p className="text-xs text-[#808181] mt-1">
                        ao reduzir emissoes em vez de apenas compensar
                      </p>
                    </div>
                  </div>

                  {/* Project cost difference */}
                  <div className="pt-3">
                    <div className="bg-[#F8FAF9] rounded-lg p-3">
                      <p className="text-[10px] text-[#808181] uppercase tracking-wide font-bold mb-2">
                        Custo do Projeto
                      </p>
                      <div className="space-y-1.5">
                        <Row label={baseScenario?.name?.split(" - ")[1] ?? "Referencia"} value={fmtBRL(baseCostProject)} />
                        <Row label={altScenario?.name?.split(" - ")[1] ?? "Alternativo"} value={fmtBRL(altCostProject)} />
                        <div className="border-t border-[#E0E4E3] pt-1.5">
                          <Row
                            label="Diferenca do projeto"
                            value={`${deltaCostProject >= 0 ? "+" : ""}${fmtBRL(deltaCostProject)}`}
                            bold
                            highlight={deltaCostProject < 0}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Net result */}
                  <div className="pt-3">
                    <div className={`rounded-lg p-3 ${netSaving >= 0 ? "bg-[#E6F3EE]" : "bg-[#FEF3C7]"}`}>
                      <p className={`text-[10px] uppercase tracking-wide font-bold mb-1 ${netSaving >= 0 ? "text-[#1d7a6b]" : "text-[#92400E]"}`}>
                        Resultado Liquido
                      </p>
                      <p className={`text-xl font-bold ${netSaving >= 0 ? "text-[#1d7a6b]" : "text-[#b45309]"}`}>
                        {netSaving >= 0 ? "" : "+"}{fmtBRL(Math.abs(netSaving))}
                      </p>
                      <p className="text-xs text-[#808181] mt-1">
                        {netSaving >= 0
                          ? "economia total (compensacao + projeto)"
                          : "custo adicional do projeto supera a economia em compensacao"}
                      </p>
                    </div>
                  </div>
                </>
              )}

              {!altScenario && (
                <div className="py-4">
                  <div className="bg-[#F8FAF9] rounded-lg p-3 text-center">
                    <p className="text-xs text-[#808181]">
                      Crie um cenario alternativo para ver a comparacao completa
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Sensitivity table */}
      {altScenario && (
        <Card className="mt-6">
          <CardHeader>
            <h2 className="text-sm font-bold text-[#030304]">Sensibilidade ao Preco do Carbono</h2>
            <p className="text-xs text-[#808181] mt-0.5">
              Como a economia varia com diferentes precos de credito de carbono
            </p>
          </CardHeader>
          <CardBody>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[#808181] uppercase tracking-wide text-[10px] border-b border-[#E0E4E3]">
                  <th className="text-left py-2 font-semibold">Preco (R$/tCO2e)</th>
                  <th className="text-right py-2 font-semibold">Compensar Tudo</th>
                  <th className="text-right py-2 font-semibold">Reduzir + Compensar</th>
                  <th className="text-right py-2 font-semibold">Economia</th>
                  <th className="text-right py-2 font-semibold">% Economia</th>
                </tr>
              </thead>
              <tbody>
                {[20, 50, 100, 200, 500, 1000].map((price) => {
                  const compTotal = baseTco2e * price;
                  const compResid = altTco2e * price;
                  const econ = compTotal - compResid;
                  const isActive = price === offsetPrice;
                  return (
                    <tr
                      key={price}
                      className={`border-b border-[#F0F4F3] cursor-pointer hover:bg-[#F8FAF9] transition-colors ${
                        isActive ? "bg-[#E6F3EE]" : ""
                      }`}
                      onClick={() => setOffsetPrice(price)}
                    >
                      <td className="py-2.5 font-semibold text-[#030304]">
                        R$ {price}
                        {isActive && (
                          <span className="ml-2 text-[10px] font-bold text-[#1d7a6b] bg-[#D1F0E7] px-1.5 py-0.5 rounded">
                            Atual
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 text-right text-[#808181]">{fmtBRL(compTotal)}</td>
                      <td className="py-2.5 text-right text-[#030304] font-semibold">{fmtBRL(compResid)}</td>
                      <td className="py-2.5 text-right text-[#1d7a6b] font-bold">{fmtBRL(econ)}</td>
                      <td className="py-2.5 text-right text-[#1d7a6b] font-semibold">{fmt(reducaoPct, 0)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value, bold, highlight }: { label: string; value: string; bold?: boolean; highlight?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <span className="text-xs text-[#808181] shrink-0">{label}</span>
      <span className={`text-xs text-right ${bold ? "font-bold text-[#030304]" : highlight ? "font-semibold text-[#1d7a6b]" : "font-semibold text-[#030304]"}`}>
        {value}
      </span>
    </div>
  );
}
