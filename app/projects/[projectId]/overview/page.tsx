"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { KpiCard } from "@/components/ui/kpi-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ParetoChart } from "@/components/charts/pareto-chart";
import { ScopeDonut } from "@/components/charts/scope-donut";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import Link from "next/link";
import { Leaf, TrendingDown, BarChart2, AlertTriangle, Loader2, Zap, Upload } from "lucide-react";
import { createBaseScenario, getScenario, type ScenarioResponse, type ScenarioItemResponse } from "@/lib/api/scenarios";
import { listAbcItems, getProject, type ProjectResponse } from "@/lib/api/projects";
import { useActiveScenario } from "@/lib/hooks/use-active-scenario";
import { NewScenarioFromUploadDialog } from "@/components/scenarios/new-scenario-from-upload-dialog";
import type { ParetoDataPoint } from "@/components/charts/pareto-chart";
import type { ScopeDataPoint } from "@/components/charts/scope-donut";

export default function OverviewPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { scenarios, activeScenarioId, activeScenario, reload: reloadScenarios } =
    useActiveScenario(projectId);
  const allScenarios = scenarios.filter((s) => s.result);
  const baseScenario = scenarios.find((s) => s.is_base) ?? null;
  const scenarioCount = scenarios.length;
  const [pendingCount, setPendingCount] = useState(0);
  const [autoCount, setAutoCount] = useState(0);
  const [manualCount, setManualCount] = useState(0);
  const [excludedCount, setExcludedCount] = useState(0);
  const [blockedCount, setBlockedCount] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [paretoData, setParetoData] = useState<ParetoDataPoint[]>([]);
  const [scopeData, setScopeData] = useState<ScopeDataPoint[]>([]);
  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [showUploadDialog, setShowUploadDialog] = useState(false);

  const buildChartsFromItems = useCallback((items: ScenarioItemResponse[], result: ScenarioResponse["result"] | null) => {
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
      } else {
        setScopeData([]);
      }
    } else {
      setScopeData([]);
    }
  }, []);

  // Load project + item counts once
  useEffect(() => {
    async function load() {
      try {
        const [items, proj] = await Promise.all([
          listAbcItems(projectId),
          getProject(projectId),
        ]);
        setProject(proj);
        setTotalItems(items.length);
        setPendingCount(items.filter((i) => i.mapping_status === "pending").length);
        setAutoCount(items.filter((i) => i.mapping_status === "auto").length);
        setManualCount(items.filter((i) => i.mapping_status === "manual").length);
        setExcludedCount(items.filter((i) => i.mapping_status === "excluded").length);
        setBlockedCount(items.filter((i) => i.mapping_status === "blocked").length);
      } catch {
        console.error("Erro ao carregar overview");
      }
      setLoading(false);
    }
    load();
  }, [projectId]);

  // Reload charts whenever the user switches scenarios
  useEffect(() => {
    if (!activeScenarioId) {
      setParetoData([]);
      setScopeData([]);
      return;
    }
    let cancelled = false;
    getScenario(activeScenarioId)
      .then((detail) => {
        if (cancelled) return;
        const scen = scenarios.find((s) => s.id === activeScenarioId);
        if (detail.items) {
          buildChartsFromItems(detail.items, scen?.result ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setParetoData([]);
          setScopeData([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeScenarioId, scenarios, buildChartsFromItems]);

  const handleCreateBase = async () => {
    setCreating(true);
    try {
      await createBaseScenario(projectId);
      await reloadScenarios();
    } catch {
      alert("Erro ao criar cenário base. Verifique se há itens importados e mapeados.");
    }
    setCreating(false);
  };

  // KPIs/charts reflect the scenario the user is currently editing, not
  // necessarily the base one. Falls back to base if no active scenario is
  // selected yet.
  const viewScenario = activeScenario ?? baseScenario;
  const r = viewScenario?.result;
  const totalTco2e = r?.total_tco2e ?? 0;
  const intensityKg = r?.intensity_per_m2 ? r.intensity_per_m2 * 1000 : 0;
  const coveragePct = r?.coverage_pct ?? 0;
  const itemsMapped = r?.items_mapped ?? 0;
  const itemsTotal = r?.items_total ?? totalItems;
  const itemsExcluded = r?.items_excluded ?? 0;
  // Coverage is computed over the eligible base (total minus intentionally
  // excluded items). Spell it out in the UI so 83 % doesn't read as
  // "17 % missing" — it really means "9 of 53 eligible items still need a
  // factor; the other 60 are out of scope by design".
  const itemsEligible = itemsTotal - itemsExcluded;
  const itemsStillMissing = itemsEligible - itemsMapped;

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
          <h1 className="text-2xl font-bold text-[#030304]">Visão Geral</h1>
          <p className="text-sm text-[#808181] mt-0.5">
            {viewScenario
              ? `Cenário: ${viewScenario.name} · ${itemsMapped} de ${itemsEligible} itens elegíveis calculados (${coveragePct.toFixed(0)}%) · ${itemsExcluded} desconsiderados fora da base`
              : `${totalItems} itens importados`}
          </p>
        </div>
        <div className="flex gap-2">
          {!viewScenario && (
            <Button onClick={handleCreateBase} disabled={creating}>
              {creating ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
              {creating ? "Calculando..." : "Gerar Cenário Base"}
            </Button>
          )}
          {viewScenario && (
            <Button onClick={() => setShowUploadDialog(true)}>
              <Upload size={15} />
              Importar novo cenário
            </Button>
          )}
        </div>
      </div>

      {/* No scenarios yet */}
      {!viewScenario && (
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

      {/* With an active scenario */}
      {viewScenario && r && (
        <>
          {/* Alerts */}
          <div className="space-y-2 mb-6">
            {pendingCount > 0 && (
              <Alert variant="warning">
                <span className="font-semibold">{pendingCount} {pendingCount === 1 ? "item aguarda" : "itens aguardam"} mapeamento</span>
                {" "}— sem fator em nenhum catálogo. Mapeie manualmente ou desconsidere com justificativa em{" "}
                <Link href={`/projects/${projectId}/items?status=pending`} className="underline font-semibold">Itens →</Link>
              </Alert>
            )}
            {blockedCount > 0 && (
              <Alert variant="info">
                <span className="font-semibold">{blockedCount} {blockedCount === 1 ? "composição aguarda" : "composições aguardam"} decomposição</span>
                {" "}— item agrupado sem insumos no Relatório Proof ou Planilha de Insumos. Veja em{" "}
                <Link href={`/projects/${projectId}/items?type=compositions`} className="underline font-semibold">Composições →</Link>
              </Alert>
            )}
            {manualCount > 0 && (
              <Alert variant="info">
                <span className="font-semibold">{manualCount} {manualCount === 1 ? "item sugerido" : "itens sugeridos"} para revisão</span>
                {" "}— match com confiança média ou baixa. Confirme ou ajuste em{" "}
                <Link href={`/projects/${projectId}/items?status=suggested`} className="underline font-semibold">Itens →</Link>
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
              label="Cobertura do escopo"
              value={`${coveragePct.toFixed(0)}%`}
              sub={`${itemsMapped} de ${itemsEligible} elegíveis · ${itemsStillMissing > 0 ? `${itemsStillMissing} ainda sem fator` : "tudo calculado"}`}
              icon={<BarChart2 size={20} />}
            />
            <KpiCard
              label="Cenários"
              value={String(scenarioCount)}
              sub={scenarioCount <= 1 ? "apenas o Base" : `Base + ${scenarioCount - 1} alternativa${scenarioCount > 2 ? "s" : ""}`}
            />
          </div>

          {/* AI audit — transparency about what the auto-mapper decided */}
          <div className="bg-white rounded-xl border border-[#E0E4E3] p-5 mb-6">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h2 className="text-sm font-bold text-[#030304]">Auditoria da IA</h2>
                <p className="text-xs text-[#808181] mt-0.5">
                  O que o mapeamento automático fez com cada item da Curva ABC.
                </p>
              </div>
              <Link
                href={`/projects/${projectId}/items`}
                className="text-xs font-semibold text-[#56B7A5] hover:text-[#1d7a6b]"
              >
                Ver detalhes →
              </Link>
            </div>
            <div className="grid grid-cols-5 gap-3">
              <Link
                href={`/projects/${projectId}/items?status=auto`}
                className="bg-[#E6F3EE] rounded-lg p-3 border border-[#A9D7CD] hover:border-[#56B7A5] transition-all"
              >
                <p className="text-[10px] font-bold text-[#1d7a6b] uppercase tracking-wider">Auto-mapeado</p>
                <p className="text-2xl font-bold text-[#1d7a6b] mt-1">{autoCount}</p>
                <p className="text-[10px] text-[#1d7a6b] mt-0.5">IA assumiu o fator (alta confiança)</p>
              </Link>
              <Link
                href={`/projects/${projectId}/items?status=suggested`}
                className="bg-[#DBEAFE] rounded-lg p-3 border border-[#93C5FD] hover:border-[#1e40af] transition-all"
              >
                <p className="text-[10px] font-bold text-[#1e40af] uppercase tracking-wider">Sugerido</p>
                <p className="text-2xl font-bold text-[#1e40af] mt-1">{manualCount}</p>
                <p className="text-[10px] text-[#1e40af] mt-0.5">Match incerto · revisar</p>
              </Link>
              <Link
                href={`/projects/${projectId}/items?status=excluded`}
                className="bg-[#F3F4F6] rounded-lg p-3 border border-[#D1D5DB] hover:border-[#6b7280] transition-all"
              >
                <p className="text-[10px] font-bold text-[#374151] uppercase tracking-wider">Desconsiderado</p>
                <p className="text-2xl font-bold text-[#374151] mt-1">{excludedCount}</p>
                <p className="text-[10px] text-[#374151] mt-0.5">Mão-de-obra, equipamento, serviços</p>
              </Link>
              <Link
                href={`/projects/${projectId}/items?status=pending`}
                className="bg-[#FEF3C7] rounded-lg p-3 border border-[#FCD34D] hover:border-[#b45309] transition-all"
              >
                <p className="text-[10px] font-bold text-[#92400e] uppercase tracking-wider">Pendente</p>
                <p className="text-2xl font-bold text-[#92400e] mt-1">{pendingCount}</p>
                <p className="text-[10px] text-[#92400e] mt-0.5">Sem match · mapear manual</p>
              </Link>
              <Link
                href={`/projects/${projectId}/items?type=compositions`}
                className="bg-[#F3E8FF] rounded-lg p-3 border border-[#D8B4FE] hover:border-[#9333EA] transition-all"
              >
                <p className="text-[10px] font-bold text-[#7E22CE] uppercase tracking-wider">Composições</p>
                <p className="text-2xl font-bold text-[#7E22CE] mt-1">{blockedCount}</p>
                <p className="text-[10px] text-[#7E22CE] mt-0.5">Aguardam decomposição</p>
              </Link>
            </div>
          </div>

          {/* Scenarios comparison */}
          {allScenarios.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-bold text-[#030304] mb-3">Cenários</h2>
              <div className="grid grid-cols-2 gap-4">
                {allScenarios
                  .sort((a, b) => (b.result?.total_tco2e ?? 0) - (a.result?.total_tco2e ?? 0))
                  .map((scen) => {
                    const t = scen.result?.total_tco2e ?? 0;
                    const baseT = baseScenario?.result?.total_tco2e ?? 0;
                    const isBase = scen.is_base;
                    const delta = baseT > 0 && !isBase ? ((baseT - t) / baseT * 100) : 0;
                    const coverage = scen.result?.coverage_pct ?? 0;
                    const mapped = scen.result?.items_mapped ?? 0;
                    const total = scen.result?.items_total ?? 0;

                    return (
                      <Link key={scen.id} href={`/projects/${projectId}/scenarios`}>
                        <div className={`bg-white rounded-xl border p-4 hover:border-[#56B7A5] transition-all cursor-pointer ${
                          isBase ? "border-[#56B7A5]/40" : "border-[#E0E4E3]"
                        }`}>
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                {isBase && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#E6F3EE] text-[#56B7A5]">BASE</span>
                                )}
                                <h3 className="text-sm font-bold text-[#030304]">{scen.name}</h3>
                              </div>
                              <p className="text-xs text-[#808181]">{mapped}/{total} itens · {coverage.toFixed(0)}% cobertura</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xl font-bold text-[#030304]">
                                {t.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
                              </p>
                              <p className="text-[10px] text-[#808181]">tCO₂e</p>
                            </div>
                          </div>
                          {!isBase && delta > 0 && (
                            <div className="flex items-center gap-1.5 bg-[#E6F3EE] rounded-lg px-2.5 py-1 mt-1">
                              <TrendingDown size={12} className="text-[#56B7A5]" />
                              <span className="text-xs font-bold text-[#1d7a6b]">
                                -{delta.toFixed(1)}% vs Base ({(baseT - t).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} tCO₂e)
                              </span>
                            </div>
                          )}
                        </div>
                      </Link>
                    );
                  })}
              </div>
            </div>
          )}

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

      <NewScenarioFromUploadDialog
        projectId={projectId}
        open={showUploadDialog}
        onClose={() => setShowUploadDialog(false)}
        onCreated={() => {
          setShowUploadDialog(false);
          reloadScenarios();
        }}
      />
    </div>
  );
}
