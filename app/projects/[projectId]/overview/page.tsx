"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { KpiCard } from "@/components/ui/kpi-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ParetoChart } from "@/components/charts/pareto-chart";
import { ScopeDonut } from "@/components/charts/scope-donut";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import Link from "next/link";
import { Leaf, TrendingDown, BarChart2, AlertTriangle, Plus, Sparkles, Loader2, Zap } from "lucide-react";
import { listScenarios, createBaseScenario, getScenario, type ScenarioResponse, type ScenarioItemResponse } from "@/lib/api/scenarios";
import { listAbcItems, getProject, type ProjectResponse } from "@/lib/api/projects";
import type { ParetoDataPoint } from "@/components/charts/pareto-chart";
import type { ScopeDataPoint } from "@/components/charts/scope-donut";

export default function OverviewPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [baseScenario, setBaseScenario] = useState<ScenarioResponse | null>(null);
  const [scenarioCount, setScenariosCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [paretoData, setParetoData] = useState<ParetoDataPoint[]>([]);
  const [scopeData, setScopeData] = useState<ScopeDataPoint[]>([]);
  const [project, setProject] = useState<ProjectResponse | null>(null);

  const buildChartsFromItems = (items: ScenarioItemResponse[], result: ScenarioResponse["result"] | null) => {
    // Pareto: group by factor_name, sum tco2e, sort desc, top 10
    const grouped: Record<string, number> = {};
    for (const item of items) {
      if (item.is_excluded || !item.emission_tco2e) continue;
      const key = item.factor_name || item.description || "Outros";
      grouped[key] = (grouped[key] || 0) + item.emission_tco2e;
    }
    const sorted = Object.entries(grouped)
      .map(([name, tco2e]) => ({ name: name.length > 25 ? name.slice(0, 22) + "…" : name, tco2e: Math.round(tco2e * 100) / 100 }))
      .sort((a, b) => b.tco2e - a.tco2e)
      .slice(0, 10);
    const totalPareto = sorted.reduce((s, d) => s + d.tco2e, 0);
    let cum = 0;
    const pareto: ParetoDataPoint[] = sorted.map((d) => {
      cum += d.tco2e;
      return { ...d, pct: totalPareto > 0 ? (d.tco2e / totalPareto) * 100 : 0, cumPct: totalPareto > 0 ? (cum / totalPareto) * 100 : 0 };
    });
    setParetoData(pareto);

    // Scope donut from result
    if (result) {
      const s3m = result.scope3_materials_kgco2e ?? 0;
      const s3l = result.scope3_logistics_kgco2e ?? 0;
      const s1 = result.scope1_kgco2e ?? 0;
      const s2 = result.scope2_kgco2e ?? 0;
      const tot = s3m + s3l + s1 + s2;
      if (tot > 0) {
        setScopeData([
          { name: "Escopo 3 — Materiais", value: Math.round((s3m / tot) * 1000) / 10, color: "#56B7A5" },
          { name: "Escopo 3 — Logística", value: Math.round((s3l / tot) * 1000) / 10, color: "#A9D7CD" },
          { name: "Escopo 1 — Combustão", value: Math.round((s1 / tot) * 1000) / 10, color: "#2D8B78" },
          { name: "Escopo 2 — Energia", value: Math.round((s2 / tot) * 1000) / 10, color: "#D4EDE7" },
        ].filter((d) => d.value > 0));
      }
    }
  };

  useEffect(() => {
    async function load() {
      try {
        const [scenarios, items, proj] = await Promise.all([
          listScenarios(projectId),
          listAbcItems(projectId),
          getProject(projectId),
        ]);
        setProject(proj);
        const base = scenarios.find((s) => s.is_base);
        setBaseScenario(base ?? null);
        setScenariosCount(scenarios.length);
        setTotalItems(items.length);
        setPendingCount(items.filter((i) => i.mapping_status === "pending").length);

        // Load scenario detail for charts
        if (base) {
          try {
            const detail = await getScenario(base.id);
            if (detail.items) {
              buildChartsFromItems(detail.items, base.result ?? null);
            }
          } catch { /* charts stay empty */ }
        }
      } catch {
        console.error("Erro ao carregar overview");
      }
      setLoading(false);
    }
    load();
  }, []);

  const handleCreateBase = async () => {
    setCreating(true);
    try {
      const scenario = await createBaseScenario(projectId);
      setBaseScenario(scenario);
      // Refresh charts
      try {
        const detail = await getScenario(scenario.id);
        if (detail.items) {
          buildChartsFromItems(detail.items, scenario.result ?? null);
        }
      } catch { /* charts stay empty */ }
    } catch {
      alert("Erro ao criar cenário base. Verifique se há itens importados e mapeados.");
    }
    setCreating(false);
  };

  const r = baseScenario?.result;
  const totalTco2e = r?.total_tco2e ?? 0;
  const intensityKg = r?.intensity_per_m2 ? r.intensity_per_m2 * 1000 : 0;
  const coveragePct = r?.coverage_pct ?? 0;
  const itemsMapped = r?.items_mapped ?? 0;
  const itemsTotal = r?.items_total ?? totalItems;

  const scope3Mat = r?.scope3_materials_kgco2e ?? 0;
  const scope3Log = r?.scope3_logistics_kgco2e ?? 0;
  const scope1 = r?.scope1_kgco2e ?? 0;
  const scope2 = r?.scope2_kgco2e ?? 0;
  const totalKg = scope3Mat + scope3Log + scope1 + scope2;

  const scopeBreakdown = totalKg > 0
    ? [
        { scope: "Escopo 3 Materiais", pct: `${((scope3Mat / totalKg) * 100).toFixed(0)}%`, tco2e: `${(scope3Mat / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} tCO₂e` },
        { scope: "Escopo 3 Logística", pct: `${((scope3Log / totalKg) * 100).toFixed(0)}%`, tco2e: `${(scope3Log / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} tCO₂e` },
        { scope: "Escopo 1 Combustão", pct: `${((scope1 / totalKg) * 100).toFixed(0)}%`, tco2e: `${(scope1 / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} tCO₂e` },
        { scope: "Escopo 2 Energia", pct: `${((scope2 / totalKg) * 100).toFixed(0)}%`, tco2e: `${(scope2 / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} tCO₂e` },
      ]
    : [
        { scope: "Escopo 3 Materiais", pct: "—", tco2e: "—" },
        { scope: "Escopo 3 Logística", pct: "—", tco2e: "—" },
        { scope: "Escopo 1 Combustão", pct: "—", tco2e: "—" },
        { scope: "Escopo 2 Energia", pct: "—", tco2e: "—" },
      ];

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
      <div className="flex items-start justify-between mb-7">
        <div>
          <p className="text-xs font-semibold text-[#808181] uppercase tracking-widest mb-1">
            {[project?.name, project?.building_type, project?.address].filter(Boolean).join(" · ")}
          </p>
          <h1 className="text-2xl font-bold text-[#030304]">
            {baseScenario ? "Cenário Base" : "Visão Geral do Projeto"}
          </h1>
          <p className="text-sm text-[#808181] mt-0.5">
            {baseScenario
              ? `${itemsMapped} de ${itemsTotal} itens calculados · ${coveragePct.toFixed(1)}% cobertura`
              : `${totalItems} itens importados`}
          </p>
        </div>
        <div className="flex gap-2">
          {!baseScenario && (
            <Button onClick={handleCreateBase} disabled={creating}>
              {creating ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
              {creating ? "Calculando..." : "Gerar Cenário Base"}
            </Button>
          )}
          {baseScenario && (
            <>
              <Button variant="secondary" onClick={handleCreateBase} disabled={creating}>
                {creating ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
                Recalcular
              </Button>
              <Link href={`/projects/${projectId}/agent`}>
                <Button variant="secondary">
                  <Sparkles size={15} />
                  Agente IA
                </Button>
              </Link>
              <Link href={`/projects/${projectId}/scenarios`}>
                <Button>
                  <Plus size={15} />
                  Novo Cenário
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>

      {/* No base scenario yet */}
      {!baseScenario && (
        <div className="space-y-4">
          <Alert variant="info">
            Nenhum Cenário Base calculado ainda. Importe uma Curva ABC, execute o Auto-Map e clique em <strong>"Gerar Cenário Base"</strong> para calcular as emissões.
          </Alert>
          <div className="grid grid-cols-3 gap-4">
            <KpiCard label="Itens importados" value={String(totalItems)} sub="da Curva ABC" icon={<BarChart2 size={20} />} />
            <KpiCard label="Pendentes" value={String(pendingCount)} sub="itens sem fator mapeado" icon={<AlertTriangle size={20} />} />
            <KpiCard label="Cenários" value={String(scenarioCount)} sub={scenarioCount === 0 ? "nenhum calculado" : "calculados"} />
          </div>
        </div>
      )}

      {/* With base scenario */}
      {baseScenario && r && (
        <>
          {/* Alerts */}
          <div className="space-y-2 mb-6">
            {pendingCount > 0 && (
              <Alert variant="warning">
                <span className="font-semibold">{pendingCount} itens aguardam mapeamento</span> — revisar itens pendentes ou bloqueados em{" "}
                <Link href={`/projects/${projectId}/items`} className="underline font-semibold">Itens →</Link>
              </Alert>
            )}
            {coveragePct < 100 && (
              <Alert variant="info">
                <span className="font-semibold">{coveragePct.toFixed(1)}% de cobertura</span> — {itemsTotal - itemsMapped} itens sem emissão calculada.{" "}
                <Link href={`/projects/${projectId}/items`} className="underline font-semibold">Ver itens →</Link>
              </Alert>
            )}
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <KpiCard
              label="Total Emissões"
              value={totalTco2e.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
              unit="tCO₂e"
              sub="Escopo 1 + 2 + 3 combinados"
              highlight
              icon={<Leaf size={20} />}
            />
            <KpiCard
              label="Intensidade"
              value={intensityKg > 0 ? intensityKg.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : "—"}
              unit="kgCO₂e/m²"
              sub="102.000 m² de área total"
              icon={<TrendingDown size={20} />}
            />
            <KpiCard
              label="Cobertura"
              value={`${coveragePct.toFixed(0)}%`}
              sub={`${itemsMapped} de ${itemsTotal} itens calculados`}
              icon={<BarChart2 size={20} />}
            />
            <KpiCard
              label="Cenários"
              value={String(scenarioCount)}
              sub={scenarioCount <= 1 ? "apenas o Base" : `Base + ${scenarioCount - 1} alternativa${scenarioCount > 2 ? "s" : ""}`}
            />
          </div>

          {/* Charts grid */}
          <div className="grid grid-cols-3 gap-4">
            {/* Pareto — 2 cols */}
            <Card className="col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-bold text-[#030304]">Top Emissores</h2>
                    <p className="text-xs text-[#808181] mt-0.5">Pareto por categoria de material</p>
                  </div>
                  <span className="text-xs text-[#808181]">tCO₂e · % acumulado</span>
                </div>
              </CardHeader>
              <CardBody>
                <ParetoChart data={paretoData} />
              </CardBody>
            </Card>

            {/* Scope donut — 1 col */}
            <Card>
              <CardHeader>
                <h2 className="text-sm font-bold text-[#030304]">Distribuição por Escopo</h2>
                <p className="text-xs text-[#808181] mt-0.5">Distribuição de emissões</p>
              </CardHeader>
              <CardBody>
                <ScopeDonut data={scopeData} />
                <div className="mt-4 space-y-2">
                  {scopeBreakdown.map((row) => (
                    <div key={row.scope} className="flex items-center justify-between text-xs">
                      <span className="text-[#808181]">{row.scope}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[#030304]">{row.pct}</span>
                        <span className="text-[#BDBDBC]">{row.tco2e}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
