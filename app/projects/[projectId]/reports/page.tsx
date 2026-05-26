"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import {
  FileText, Download, FileSpreadsheet, BarChart2,
  CheckCircle2, Loader2, Settings, AlertTriangle,
} from "lucide-react";
import { getProject } from "@/lib/api/projects";
import { listScenarios, getScenario, type ScenarioResponse } from "@/lib/api/scenarios";
import { loadSettings, type BrandingSettings } from "@/app/settings/page";
import { generateComparisonPDF } from "@/lib/report/pdf-generator";

export default function ReportsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [projectName, setProjectName] = useState("");
  const [scenarios, setScenarios] = useState<ScenarioResponse[]>([]);
  const [branding, setBranding] = useState<BrandingSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);

  useEffect(() => {
    setBranding(loadSettings());
    Promise.all([
      getProject(projectId),
      listScenarios(projectId),
    ]).then(([proj, scens]) => {
      setProjectName(proj.name);
      setScenarios(scens.filter((s) => s.result));
    }).catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  const handleExcelDownload = async () => {
    setGenerating("excel");
    try {
      const resp = await fetch(`/api/projects/${projectId}/export-items`, {
        credentials: "include",
      });
      const blob = await resp.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${projectName.replace(/\s+/g, "_")}_itens_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      alert("Erro ao exportar Excel");
    }
    setGenerating(null);
  };

  const handleCsvDownload = async () => {
    setGenerating("csv");
    try {
      const resp = await fetch(`/api/projects/${projectId}/export-items?format=csv`, {
        credentials: "include",
      });
      const blob = await resp.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${projectName.replace(/\s+/g, "_")}_itens_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      alert("Erro ao exportar CSV");
    }
    setGenerating(null);
  };

  const handlePdfDownload = async () => {
    if (scenarios.length < 2) {
      alert("Necessário pelo menos 2 cenários para o relatório comparativo");
      return;
    }
    setGenerating("pdf");
    try {
      // Load details for first two scenarios
      const [detailA, detailB] = await Promise.all([
        getScenario(scenarios[0].id),
        getScenario(scenarios[1].id),
      ]);

      // Also load parent items
      const loadParents = async (scenId: string) => {
        const res = await fetch(`/api/scenarios/${scenId}`, { credentials: "include" });
        return res.json();
      };

      const [rawA, rawB] = await Promise.all([
        loadParents(scenarios[0].id),
        loadParents(scenarios[1].id),
      ]);

      const buildScenario = (
        scen: ScenarioResponse,
        detail: typeof detailA,
        raw: Record<string, unknown>
      ) => {
        const items = detail.items;
        const parents = (raw.parent_items ?? []) as Record<string, unknown>[];
        let concretoM3 = 0, concretoTco2e = 0, acoKg = 0, acoTco2e = 0;
        // Project cost = parents (compositions) + direct items
        const parentsCost = parents.reduce((s, p) => s + ((p.total_cost as number) ?? 0), 0);
        const directItemsCost = items
          .filter((i) => !(i as unknown as Record<string, unknown>).parent_item_id)
          .reduce((s, i) => s + (i.total_cost ?? 0), 0);
        const totalCost = parentsCost + directItemsCost;

        for (const item of items) {
          const desc = (item.description ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          const tco2e = item.emission_tco2e ?? 0;
          const qty = item.quantity ?? 0;
          const unit = (item.unit ?? "").toLowerCase();
          if (desc.includes("concreto") && (unit === "m³" || unit === "m3")) {
            concretoM3 += qty; concretoTco2e += tco2e;
          }
          if ((desc.includes("aco") || desc.includes("armadura") || desc.includes("ca-50") || desc.includes("ca-25") || desc.includes("ca-60") || desc.includes("tela soldada")) && (unit === "kg" || unit === "t")) {
            acoKg += unit === "t" ? qty * 1000 : qty; acoTco2e += tco2e;
          }
        }

        // Build hierarchical items
        const reportItems = parents
          .filter((p) => (p.emission_tco2e as number) > 0)
          .sort((a, b) => (b.emission_tco2e as number) - (a.emission_tco2e as number))
          .map((p) => {
            const children = items
              .filter((i) => {
                const pi = (i as unknown as Record<string, unknown>).parent_item_id;
                return pi === p.id;
              })
              .filter((i) => (i.emission_tco2e ?? 0) > 0)
              .sort((a, b) => (b.emission_tco2e ?? 0) - (a.emission_tco2e ?? 0))
              .map((c) => ({
                description: c.description ?? "",
                costCode: c.cost_code ?? "",
                unit: c.unit ?? "",
                quantity: c.quantity ?? 0,
                emissionTco2e: c.emission_tco2e ?? 0,
                factorValue: c.factor_value ?? 0,
                factorSource: c.source_tier ?? "",
              }));

            return {
              description: (p.description as string) ?? "",
              costCode: (p.cost_code as string) ?? "",
              unit: (p.unit as string) ?? "",
              quantity: (p.quantity as number) ?? 0,
              emissionTco2e: (p.emission_tco2e as number) ?? 0,
              children,
            };
          });

        // Add direct items (no parent)
        const directItems = items
          .filter((i) => !(i as unknown as Record<string, unknown>).parent_item_id && (i.emission_tco2e ?? 0) > 0 && !i.is_excluded)
          .sort((a, b) => (b.emission_tco2e ?? 0) - (a.emission_tco2e ?? 0))
          .map((i) => ({
            description: i.description ?? "",
            costCode: i.cost_code ?? "",
            unit: i.unit ?? "",
            quantity: i.quantity ?? 0,
            emissionTco2e: i.emission_tco2e ?? 0,
          }));

        return {
          name: scen.name,
          totalTco2e: scen.result?.total_tco2e ?? 0,
          totalCostR$: totalCost,
          concretoM3: Math.round(concretoM3 * 10) / 10,
          concretoTco2e: Math.round(concretoTco2e * 100) / 100,
          acoTon: Math.round(acoKg / 100) / 10,
          acoTco2e: Math.round(acoTco2e * 100) / 100,
          materiaisTco2e: (scen.result?.scope3_materials_kgco2e ?? 0) / 1000,
          transporteTco2e: (scen.result?.scope3_logistics_kgco2e ?? 0) / 1000,
          items: [...reportItems, ...directItems],
        };
      };

      const scenarioA = buildScenario(scenarios[0], detailA, rawA);
      const scenarioB = buildScenario(scenarios[1], detailB, rawB);

      const pdf = generateComparisonPDF(
        {
          projectName,
          scenarioA,
          scenarioB,
          createdAt: new Date().toLocaleDateString("pt-BR"),
        },
        branding ?? loadSettings()
      );

      pdf.save(`${projectName.replace(/\s+/g, "_")}_relatorio_comparativo_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
      console.error("PDF error:", e);
      alert("Erro ao gerar PDF");
    }
    setGenerating(null);
  };

  const handleComparisonDownload = async () => {
    if (scenarios.length < 2) {
      alert("Necessário pelo menos 2 cenários");
      return;
    }
    setGenerating("comparison");
    try {
      const resp = await fetch(
        `/api/projects/${projectId}/export-comparison?scenario_a=${scenarios[0].id}&scenario_b=${scenarios[1].id}`,
        { credentials: "include" }
      );
      const blob = await resp.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${projectName.replace(/\s+/g, "_")}_conferencia_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      alert("Erro ao exportar conferência");
    }
    setGenerating(null);
  };

  const reports = [
    {
      id: "pdf",
      icon: BarChart2,
      title: "Relatório Comparativo de Cenários — PDF",
      desc: "Indicadores, composições e insumos com fatores de emissão · Identidade visual configurável",
      badge: "Recomendado",
      format: ".pdf",
      ready: scenarios.length >= 2,
      color: "#1d7a6b",
      bg: "#E6F3EE",
      onClick: handlePdfDownload,
    },
    {
      id: "comparison",
      icon: FileSpreadsheet,
      title: "Conferência — Input vs Emissões Calculadas",
      desc: "Comparativo dos dados de entrada (orçamento) com as emissões calculadas por composição e insumo",
      badge: "Conferência",
      format: ".xlsx",
      ready: scenarios.length >= 2,
      color: "#1e40af",
      bg: "#DBEAFE",
      onClick: handleComparisonDownload,
    },
    {
      id: "excel",
      icon: FileSpreadsheet,
      title: "Exportação Excel — Todos os Itens",
      desc: "Tabela completa com tCO₂e por item, compatível com Power BI",
      badge: "Essencial",
      format: ".xlsx",
      ready: true,
      color: "#1d7a6b",
      bg: "#E6F3EE",
      onClick: handleExcelDownload,
    },
    {
      id: "csv",
      icon: FileText,
      title: "Exportação CSV",
      desc: "Formato plano para integração com outros sistemas",
      badge: "Essencial",
      format: ".csv",
      ready: true,
      color: "#1d7a6b",
      bg: "#E6F3EE",
      onClick: handleCsvDownload,
    },
  ];

  if (loading) {
    return (
      <div className="p-7 flex items-center justify-center min-h-[400px]">
        <Loader2 size={24} className="text-[#56B7A5] animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-7 max-w-3xl">
      {/* Header */}
      <div className="mb-7">
        <p className="text-xs font-semibold text-[#808181] uppercase tracking-widest mb-1">
          {projectName}
        </p>
        <h1 className="text-2xl font-bold text-[#030304]">Relatórios e Exportações</h1>
        <p className="text-sm text-[#808181] mt-0.5">
          Gere e baixe relatórios do projeto · {scenarios.length} cenário{scenarios.length !== 1 ? "s" : ""} disponíve{scenarios.length !== 1 ? "is" : "l"}
        </p>
      </div>

      {/* Identity branding */}
      <div className="bg-[#E6F3EE] border border-[#81C8B9] rounded-xl p-5 mb-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center shadow-[0_2px_8px_rgba(86,183,165,0.15)] shrink-0 overflow-hidden">
            {branding?.companyLogo ? (
              <img src={branding.companyLogo} alt="Logo" className="w-full h-full object-contain p-1" />
            ) : (
              <span className="font-bold text-sm" style={{ color: branding?.primaryColor || "#56B7A5" }}>
                {(branding?.companyName || "ZNIT").slice(0, 4)}
              </span>
            )}
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-[#1d7a6b] mb-0.5">
              {branding?.companyLogo ? "Identidade visual configurada" : "Configure sua identidade visual"}
            </p>
            <p className="text-xs text-[#808181]">
              {branding?.companyLogo
                ? `PDFs gerados com logo e cores de ${branding.companyName}.`
                : "Adicione logo e cores da empresa para personalizar os relatórios."
              }
              {" "}
              <Link href="/settings" className="underline text-[#56B7A5] font-semibold">
                Configurações →
              </Link>
            </p>
          </div>
          {branding?.companyLogo ? (
            <CheckCircle2 size={18} className="text-[#56B7A5] shrink-0 mt-0.5" />
          ) : (
            <Link href="/settings">
              <Settings size={18} className="text-[#808181] shrink-0 mt-0.5 hover:text-[#56B7A5]" />
            </Link>
          )}
        </div>
      </div>

      {/* Warning if less than 2 scenarios */}
      {scenarios.length < 2 && (
        <div className="bg-[#FEF3C7] border border-[#FCD34D] rounded-xl p-4 mb-6 flex items-start gap-3">
          <AlertTriangle size={16} className="text-[#b45309] shrink-0 mt-0.5" />
          <p className="text-xs text-[#808181]">
            O relatório comparativo PDF requer pelo menos 2 cenários.{" "}
            <Link href={`/projects/${projectId}/import`} className="underline text-[#56B7A5] font-semibold">
              Importar cenário →
            </Link>
          </p>
        </div>
      )}

      {/* Reports list */}
      <div className="space-y-3">
        {reports.map((report) => {
          const Icon = report.icon;
          const isGenerating = generating === report.id;
          return (
            <Card key={report.id}>
              <CardBody className="!py-4">
                <div className="flex items-center gap-4">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: report.bg }}
                  >
                    <Icon size={18} style={{ color: report.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="text-sm font-bold text-[#030304]">{report.title}</h3>
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: report.bg, color: report.color }}
                      >
                        {report.badge}
                      </span>
                    </div>
                    <p className="text-xs text-[#808181]">{report.desc}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-mono text-[#808181] bg-[#F3F4F6] px-2 py-0.5 rounded">
                      {report.format}
                    </span>
                    <Button
                      size="sm"
                      variant={report.ready ? "primary" : "outline"}
                      disabled={!report.ready || isGenerating}
                      onClick={report.onClick}
                    >
                      {isGenerating ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Download size={13} />
                      )}
                      {isGenerating ? "Gerando..." : report.ready ? "Baixar" : "Sem cenários"}
                    </Button>
                  </div>
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
