import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { FileText, Download, FileSpreadsheet, BarChart2, CheckCircle2 } from "lucide-react";

const reports = [
  {
    id: "excel",
    icon: FileSpreadsheet,
    title: "Exportação Excel — Todos os Itens",
    desc: "Tabela completa com tCO₂e por item, compatível com Power BI",
    badge: "Must Have",
    format: ".xlsx",
    ready: true,
    color: "#1d7a6b",
    bg: "#E6F3EE",
  },
  {
    id: "csv",
    icon: FileText,
    title: "Exportação CSV",
    desc: "Formato plano para integração com outros sistemas",
    badge: "Must Have",
    format: ".csv",
    ready: true,
    color: "#1d7a6b",
    bg: "#E6F3EE",
  },
  {
    id: "memo",
    icon: FileText,
    title: "Memorando de Cálculo — PDF",
    desc: "Premissas, metodologia, fontes EPD, lista de itens parametrizados · Identidade visual HTB",
    badge: "Must Have",
    format: ".pdf",
    ready: true,
    color: "#1d7a6b",
    bg: "#E6F3EE",
  },
  {
    id: "compare",
    icon: BarChart2,
    title: "Relatório Comparativo de Cenários",
    desc: "PDF com Cenário Base vs A vs B · Delta em tCO₂e e %",
    badge: "Should Have",
    format: ".pdf",
    ready: false,
    color: "#92400e",
    bg: "#FEF3C7",
  },
];

export default function ReportsPage() {
  return (
    <div className="p-7 max-w-3xl">
      {/* Header */}
      <div className="mb-7">
        <p className="text-xs font-semibold text-[#808181] uppercase tracking-widest mb-1">
          Raízen VRO R8 · Cenário Base
        </p>
        <h1 className="text-2xl font-bold text-[#030304]">Relatórios e Exportações</h1>
        <p className="text-sm text-[#808181] mt-0.5">
          Gere e baixe relatórios do projeto em diferentes formatos
        </p>
      </div>

      {/* Identity branding */}
      <div className="bg-[#E6F3EE] border border-[#81C8B9] rounded-xl p-5 mb-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center shadow-[0_2px_8px_rgba(86,183,165,0.15)] shrink-0">
            <span className="font-bold text-[#030304] text-sm">HTB</span>
          </div>
          <div>
            <p className="text-sm font-bold text-[#1d7a6b] mb-0.5">
              Identidade visual configurada
            </p>
            <p className="text-xs text-[#808181]">
              Todos os PDFs gerados incluem logo e cores do Grupo HTB.
              Altere em{" "}
              <button className="underline text-[#56B7A5] font-semibold">
                Configurações → Branding
              </button>
            </p>
          </div>
          <CheckCircle2 size={18} className="text-[#56B7A5] shrink-0 mt-0.5 ml-auto" />
        </div>
      </div>

      {/* Reports list */}
      <div className="space-y-3">
        {reports.map((report) => {
          const Icon = report.icon;
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
                      disabled={!report.ready}
                    >
                      <Download size={13} />
                      {report.ready ? "Baixar" : "Em breve"}
                    </Button>
                  </div>
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>

      {/* Memo preview */}
      <div className="mt-7 bg-white rounded-xl border border-[#E0E4E3] overflow-hidden shadow-[0_1px_3px_rgba(3,3,4,0.06)]">
        <div className="px-5 py-4 border-b border-[#E0E4E3] flex items-center justify-between">
          <h3 className="text-sm font-bold text-[#030304]">Preview — Memorando de Cálculo</h3>
          <Button size="sm" variant="secondary">
            <Download size={13} />
            Baixar PDF
          </Button>
        </div>
        <div className="p-7 font-mono text-xs text-[#404040] space-y-4 bg-[#FAFAFA]">
          <div className="flex items-start justify-between border-b border-[#E0E4E3] pb-4 mb-4">
            <div>
              <p className="text-lg font-bold text-[#030304] not-italic mb-0.5" style={{ fontFamily: "sans-serif" }}>
                MEMORANDO DE CÁLCULO DE CARBONO
              </p>
              <p style={{ fontFamily: "sans-serif" }} className="text-xs text-[#808181]">
                Projeto: Raízen VRO R8 · Emitido em: 15/03/2026 · ZNIT Carbon Calculator v1.0
              </p>
            </div>
            <div className="text-right">
              <div className="font-bold text-[#030304] text-sm" style={{ fontFamily: "sans-serif" }}>HTB</div>
              <div className="text-[10px] text-[#808181]" style={{ fontFamily: "sans-serif" }}>Grupo HTB</div>
            </div>
          </div>

          <div>
            <p className="font-bold mb-2">1. PREMISSAS METODOLÓGICAS</p>
            <p className="text-[#808181] leading-relaxed">
              1.1 Escopo: Embodied Carbon — Scope 3 materiais e logística<br />
              1.2 Mão de obra (Tipo B): Excluída conforme política HTB v1 (2026-03)<br />
              1.3 Diesel: Incluído como Scope 1 — 2,68 kgCO₂e/L (GHG Protocol BR)<br />
              1.4 Itens agrupados (Tipo C): Bloqueados — aguardam decomposição
            </p>
          </div>

          <div>
            <p className="font-bold mb-2">2. FONTES EPD UTILIZADAS</p>
            <p className="text-[#808181] leading-relaxed">
              — Ecoinvent 3.9 (aço, produtos metálicos)<br />
              — GHG Protocol BR 2023 (concreto, combustíveis)<br />
              — IPCC AR6 (fatores de conversão)
            </p>
          </div>

          <div>
            <p className="font-bold mb-2">3. RESULTADO CENÁRIO BASE</p>
            <p className="text-[#808181] leading-relaxed">
              Total: 2.847 tCO₂e | Intensidade: 27,9 kgCO₂e/m² | Cobertura: 87%<br />
              Scope 3 Materiais: 78% | Scope 3 Logística: 15% | Scope 1: 7%
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
