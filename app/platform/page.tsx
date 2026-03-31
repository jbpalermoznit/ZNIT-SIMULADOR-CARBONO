"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Database, Leaf, Users, FileText, Bot,
  TrendingDown, BarChart3, Globe, Shield, ChevronRight,
  Zap, ArrowUpRight, Layers, Scale, Settings, Search,
  Building2, Factory, AlertTriangle, CheckCircle2, Clock,
} from "lucide-react";

// ─── Sidebar ──────────────────────────────────────────────────────────

const modules = [
  { id: "overview", label: "Visao Geral", icon: LayoutDashboard },
  { id: "data", label: "Dados ESG", icon: Database },
  { id: "carbon", label: "Pegada de Carbono", icon: Leaf },
  { id: "simulator", label: "Simulador", icon: TrendingDown },
  { id: "social", label: "Indicadores Sociais", icon: Users },
  { id: "governance", label: "Governanca", icon: Shield },
  { id: "reports", label: "Relatorios IA", icon: FileText },
  { id: "agent", label: "Agente IA", icon: Bot },
];

const frameworks = ["GRI", "CSRD", "CDP", "GHG Protocol", "SBTi", "EU Taxonomy", "TCFD", "ISO 14064"];

// ─── Stats ────────────────────────────────────────────────────────────

const platformStats = [
  { label: "Fatores de Emissao", value: "20.000+", icon: Leaf, color: "#56B7A5" },
  { label: "EPDs Globais", value: "17.000+", icon: Globe, color: "#1e40af" },
  { label: "Indicadores Sociais", value: "3.000+", icon: Users, color: "#7c3aed" },
  { label: "Frameworks", value: "9+", icon: FileText, color: "#b45309" },
];

// ─── Mock Data ────────────────────────────────────────────────────────

const entities = [
  { name: "Planta Sao Paulo", sector: "Industria", emissions: 12450, status: "completo", coverage: 94 },
  { name: "Obra Sucuriu", sector: "Construcao", emissions: 1546, status: "em andamento", coverage: 69 },
  { name: "Planta Curitiba", sector: "Industria", emissions: 8720, status: "completo", coverage: 88 },
  { name: "Obra Arauco", sector: "Construcao", emissions: 504, status: "em andamento", coverage: 65 },
  { name: "CD Logistico MG", sector: "Industria", emissions: 3200, status: "pendente", coverage: 12 },
];

const scopeData = [
  { scope: "Escopo 1 — Emissoes Diretas", tco2e: 4820, pct: 18, color: "#2D8B78" },
  { scope: "Escopo 2 — Energia", tco2e: 2150, pct: 8, color: "#56B7A5" },
  { scope: "Escopo 3 — Cadeia de Valor", tco2e: 19650, pct: 74, color: "#A9D7CD" },
];

const socialIndicators = [
  { category: "Diversidade & Inclusao", tracked: 142, compliant: 128, risk: 3 },
  { category: "Saude & Seguranca", tracked: 89, compliant: 85, risk: 1 },
  { category: "Comunidade & Stakeholders", tracked: 67, compliant: 58, risk: 5 },
  { category: "Cadeia de Fornecimento", tracked: 234, compliant: 198, risk: 12 },
];

const aiInsights = [
  { type: "anomalia", msg: "Escopo 1 da Planta SP aumentou 23% vs trimestre anterior", severity: "warning" },
  { type: "oportunidade", msg: "Substituicao de concreto por baixo carbono pode reduzir 340 tCO2e na Obra Sucuriu", severity: "success" },
  { type: "compliance", msg: "3 indicadores GRI pendentes para deadline CSRD Q2 2026", severity: "error" },
  { type: "benchmark", msg: "Intensidade de carbono 15% abaixo da media do setor de construcao", severity: "info" },
];

// ─── Page ─────────────────────────────────────────────────────────────

export default function PlatformMockup() {
  const [activeModule, setActiveModule] = useState("overview");

  return (
    <div className="flex h-screen bg-[#F8FAF9]">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-[#E0E4E3] flex flex-col h-screen shrink-0">
        {/* Logo */}
        <div className="px-5 py-4 border-b border-[#E0E4E3]">
          <div
            style={{
              width: 110, height: 30,
              backgroundImage: "url(/ZNIT_Logo.png)",
              backgroundSize: "150px 150px",
              backgroundPosition: "-20px -60px",
              backgroundRepeat: "no-repeat",
            }}
            aria-label="ZNIT"
          />
        </div>

        {/* Company */}
        <div className="px-5 py-3 border-b border-[#F0F4F3]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#E6F3EE] flex items-center justify-center">
              <Factory size={14} className="text-[#56B7A5]" />
            </div>
            <div>
              <p className="text-xs font-bold text-[#030304]">Grupo HTB</p>
              <p className="text-[10px] text-[#808181]">Industria & Construcao</p>
            </div>
          </div>
        </div>

        {/* Modules */}
        <nav className="flex-1 overflow-y-auto py-3 px-3">
          <p className="text-[10px] font-semibold text-[#808181] uppercase tracking-widest px-3 mb-2">
            Modulos
          </p>
          {modules.map((m) => {
            const Icon = m.icon;
            const active = activeModule === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setActiveModule(m.id)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 rounded text-sm font-medium transition-all text-left",
                  active
                    ? "bg-[#E6F3EE] text-[#1d7a6b]"
                    : "text-[#404040] hover:bg-[rgba(86,183,165,0.06)]"
                )}
              >
                <Icon size={15} className={active ? "text-[#56B7A5]" : "opacity-50"} />
                {m.label}
              </button>
            );
          })}

          <div className="mt-4 px-3">
            <p className="text-[10px] font-semibold text-[#808181] uppercase tracking-widest mb-2">Frameworks</p>
            <div className="flex flex-wrap gap-1">
              {frameworks.map((f) => (
                <span key={f} className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-[#F3F4F6] text-[#808181]">
                  {f}
                </span>
              ))}
            </div>
          </div>
        </nav>

        {/* Bottom */}
        <div className="px-3 py-3 border-t border-[#E0E4E3]">
          <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded text-sm font-medium text-[#808181] hover:bg-[rgba(86,183,165,0.06)] text-left">
            <Settings size={15} /> Configuracoes
          </button>
          <div className="flex items-center gap-2.5 px-3 py-2 mt-1">
            <div className="w-7 h-7 rounded-full bg-[#56B7A5] flex items-center justify-center text-white text-xs font-bold">JP</div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-[#030304]">Joao Palermo</p>
              <p className="text-[10px] text-[#808181]">Admin · Grupo HTB</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-7 max-w-[1200px]">

          {/* Header */}
          <div className="flex items-start justify-between mb-7">
            <div>
              <p className="text-xs font-semibold text-[#808181] uppercase tracking-widest mb-1">
                Plataforma ESG · Grupo HTB
              </p>
              <h1 className="text-2xl font-bold text-[#030304]">
                {modules.find((m) => m.id === activeModule)?.label ?? "Visao Geral"}
              </h1>
              <p className="text-sm text-[#808181] mt-0.5">
                Collect. Simulate. Decarbonize.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#BDBDBC]" />
                <input
                  placeholder="Buscar indicadores, entidades..."
                  className="pl-9 pr-3 py-2 w-64 border border-[#E0E4E3] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#56B7A5]/30"
                />
              </div>
              <button className="p-2 rounded-lg border border-[#E0E4E3] bg-white hover:border-[#56B7A5] transition-colors">
                <Bot size={16} className="text-[#56B7A5]" />
              </button>
            </div>
          </div>

          {/* Platform Stats */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {platformStats.map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="bg-white rounded-xl border border-[#E0E4E3] p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-semibold text-[#808181] uppercase tracking-wide">{stat.label}</p>
                    <Icon size={16} style={{ color: stat.color }} />
                  </div>
                  <p className="text-2xl font-bold text-[#030304]">{stat.value}</p>
                </div>
              );
            })}
          </div>

          {/* Main Grid */}
          <div className="grid grid-cols-3 gap-4 mb-6">

            {/* Entities / Sites — 2 cols */}
            <div className="col-span-2 bg-white rounded-xl border border-[#E0E4E3] overflow-hidden">
              <div className="px-5 py-3 border-b border-[#E0E4E3] flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-[#030304]">Entidades & Sites</h2>
                  <p className="text-[10px] text-[#808181] mt-0.5">Emissoes por unidade operacional</p>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] px-2 py-0.5 rounded bg-[#E6F3EE] text-[#1d7a6b] font-bold">
                    {entities.length} entidades
                  </span>
                </div>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#F0F4F3] bg-[#F8FAF9]">
                    {["Entidade", "Setor", "tCO2e", "Cobertura", "Status"].map((h) => (
                      <th key={h} className="text-left px-4 py-2.5 text-[10px] font-semibold text-[#808181] uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entities.map((e) => (
                    <tr key={e.name} className="border-b border-[#F0F4F3] hover:bg-[#F8FAF9] cursor-pointer">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {e.sector === "Industria"
                            ? <Factory size={14} className="text-[#1e40af]" />
                            : <Building2 size={14} className="text-[#56B7A5]" />}
                          <span className="font-semibold text-[#030304]">{e.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded",
                          e.sector === "Industria" ? "bg-[#DBEAFE] text-[#1e40af]" : "bg-[#E6F3EE] text-[#1d7a6b]"
                        )}>
                          {e.sector}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-bold text-[#030304]">{e.emissions.toLocaleString("pt-BR")}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-[#F0F4F3] rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-[#56B7A5]" style={{ width: `${e.coverage}%` }} />
                          </div>
                          <span className="text-[#808181]">{e.coverage}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded",
                          e.status === "completo" ? "bg-[#E6F3EE] text-[#1d7a6b]" :
                          e.status === "em andamento" ? "bg-[#FEF3C7] text-[#92400e]" :
                          "bg-[#F3F4F6] text-[#808181]"
                        )}>
                          {e.status === "completo" ? "Completo" : e.status === "em andamento" ? "Em andamento" : "Pendente"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Scope breakdown — 1 col */}
            <div className="bg-white rounded-xl border border-[#E0E4E3] overflow-hidden">
              <div className="px-5 py-3 border-b border-[#E0E4E3]">
                <h2 className="text-sm font-bold text-[#030304]">Emissoes por Escopo</h2>
                <p className="text-[10px] text-[#808181] mt-0.5">Consolidado todas as entidades</p>
              </div>
              <div className="p-5">
                <p className="text-3xl font-bold text-[#030304] mb-1">26.620</p>
                <p className="text-xs text-[#808181] mb-4">tCO2e total · Ano base 2025</p>
                <div className="space-y-3">
                  {scopeData.map((s) => (
                    <div key={s.scope}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-[#808181]">{s.scope}</span>
                        <span className="text-xs font-bold text-[#030304]">{s.pct}%</span>
                      </div>
                      <div className="w-full h-2 bg-[#F0F4F3] rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${s.pct}%`, backgroundColor: s.color }} />
                      </div>
                      <p className="text-[10px] text-[#808181] mt-0.5">{s.tco2e.toLocaleString("pt-BR")} tCO2e</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Second Row */}
          <div className="grid grid-cols-2 gap-4 mb-6">

            {/* AI Insights */}
            <div className="bg-white rounded-xl border border-[#E0E4E3] overflow-hidden">
              <div className="px-5 py-3 border-b border-[#E0E4E3] flex items-center gap-2">
                <Bot size={15} className="text-[#56B7A5]" />
                <h2 className="text-sm font-bold text-[#030304]">Insights do Agente IA</h2>
                <span className="ml-auto text-[10px] font-bold bg-[#E6F3EE] text-[#1d7a6b] px-2 py-0.5 rounded">
                  {aiInsights.length} alertas
                </span>
              </div>
              <div className="divide-y divide-[#F0F4F3]">
                {aiInsights.map((insight, i) => (
                  <div key={i} className="px-5 py-3 flex items-start gap-3 hover:bg-[#F8FAF9] cursor-pointer">
                    {insight.severity === "warning" && <AlertTriangle size={14} className="text-[#F59E0B] mt-0.5 shrink-0" />}
                    {insight.severity === "success" && <Zap size={14} className="text-[#56B7A5] mt-0.5 shrink-0" />}
                    {insight.severity === "error" && <Clock size={14} className="text-[#EF4444] mt-0.5 shrink-0" />}
                    {insight.severity === "info" && <CheckCircle2 size={14} className="text-[#1e40af] mt-0.5 shrink-0" />}
                    <div className="flex-1">
                      <p className="text-xs text-[#030304] leading-relaxed">{insight.msg}</p>
                      <p className="text-[10px] text-[#BDBDBC] mt-0.5">{insight.type}</p>
                    </div>
                    <ChevronRight size={12} className="text-[#BDBDBC] mt-1 shrink-0" />
                  </div>
                ))}
              </div>
            </div>

            {/* Social Indicators */}
            <div className="bg-white rounded-xl border border-[#E0E4E3] overflow-hidden">
              <div className="px-5 py-3 border-b border-[#E0E4E3] flex items-center gap-2">
                <Users size={15} className="text-[#7c3aed]" />
                <h2 className="text-sm font-bold text-[#030304]">Indicadores Sociais</h2>
                <span className="ml-auto text-[10px] font-bold bg-[#EDE9FE] text-[#7c3aed] px-2 py-0.5 rounded">
                  3.000+ indicadores
                </span>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#F0F4F3] bg-[#F8FAF9]">
                    {["Categoria", "Rastreados", "Conformes", "Riscos"].map((h) => (
                      <th key={h} className="text-left px-4 py-2.5 text-[10px] font-semibold text-[#808181] uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {socialIndicators.map((s) => (
                    <tr key={s.category} className="border-b border-[#F0F4F3] hover:bg-[#F8FAF9]">
                      <td className="px-4 py-3 font-semibold text-[#030304]">{s.category}</td>
                      <td className="px-4 py-3 text-[#808181]">{s.tracked}</td>
                      <td className="px-4 py-3">
                        <span className="text-[#1d7a6b] font-semibold">{s.compliant}</span>
                        <span className="text-[#BDBDBC]"> / {s.tracked}</span>
                      </td>
                      <td className="px-4 py-3">
                        {s.risk > 0 ? (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#FEF2F2] text-[#EF4444]">
                            {s.risk} riscos
                          </span>
                        ) : (
                          <CheckCircle2 size={14} className="text-[#56B7A5]" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bottom: Simulator Preview + Reporting */}
          <div className="grid grid-cols-3 gap-4">

            {/* Simulator */}
            <div className="col-span-2 bg-white rounded-xl border border-[#E0E4E3] p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <TrendingDown size={16} className="text-[#56B7A5]" />
                  <h2 className="text-sm font-bold text-[#030304]">Simulador de Descarbonizacao</h2>
                </div>
                <span className="text-[10px] font-bold bg-[#E6F3EE] text-[#1d7a6b] px-2 py-0.5 rounded">
                  17.000+ EPDs
                </span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-[#F8FAF9] rounded-lg p-3 text-center">
                  <p className="text-[10px] text-[#808181] uppercase tracking-wide mb-1">Cenarios Ativos</p>
                  <p className="text-2xl font-bold text-[#030304]">12</p>
                  <p className="text-[10px] text-[#808181]">em 5 entidades</p>
                </div>
                <div className="bg-[#E6F3EE] rounded-lg p-3 text-center">
                  <p className="text-[10px] text-[#808181] uppercase tracking-wide mb-1">Reducao Potencial</p>
                  <p className="text-2xl font-bold text-[#1d7a6b]">-4.820</p>
                  <p className="text-[10px] text-[#808181]">tCO2e identificados</p>
                </div>
                <div className="bg-[#F8FAF9] rounded-lg p-3 text-center">
                  <p className="text-[10px] text-[#808181] uppercase tracking-wide mb-1">EPDs Utilizados</p>
                  <p className="text-2xl font-bold text-[#030304]">847</p>
                  <p className="text-[10px] text-[#808181]">de 17.000+ disponiveis</p>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between bg-[#F8FAF9] rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <Scale size={14} className="text-[#808181]" />
                  <p className="text-xs text-[#808181]">Simulacao de troca de materiais com analise de custo vs impacto ambiental</p>
                </div>
                <button className="flex items-center gap-1 text-xs font-semibold text-[#56B7A5] hover:text-[#1d7a6b]">
                  Abrir Simulador <ArrowUpRight size={12} />
                </button>
              </div>
            </div>

            {/* AI Reporting */}
            <div className="bg-white rounded-xl border border-[#E0E4E3] p-5">
              <div className="flex items-center gap-2 mb-4">
                <Layers size={16} className="text-[#b45309]" />
                <h2 className="text-sm font-bold text-[#030304]">Relatorios IA</h2>
              </div>
              <div className="space-y-2">
                {[
                  { framework: "GRI", status: "pronto", date: "28/03/2026" },
                  { framework: "CSRD", status: "gerando", date: "—" },
                  { framework: "CDP", status: "pendente", date: "—" },
                  { framework: "GHG Protocol", status: "pronto", date: "25/03/2026" },
                ].map((r) => (
                  <div key={r.framework} className="flex items-center justify-between py-2 border-b border-[#F0F4F3] last:border-0">
                    <div className="flex items-center gap-2">
                      <FileText size={13} className="text-[#808181]" />
                      <span className="text-xs font-semibold text-[#030304]">{r.framework}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[#808181]">{r.date}</span>
                      <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded",
                        r.status === "pronto" ? "bg-[#E6F3EE] text-[#1d7a6b]" :
                        r.status === "gerando" ? "bg-[#FEF3C7] text-[#92400e]" :
                        "bg-[#F3F4F6] text-[#808181]"
                      )}>
                        {r.status === "pronto" ? "Pronto" : r.status === "gerando" ? "Gerando..." : "Pendente"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 bg-[#FEF3C7] rounded-lg p-2.5 flex items-start gap-2">
                <Bot size={13} className="text-[#92400e] mt-0.5 shrink-0" />
                <p className="text-[10px] text-[#92400e]">
                  Agente IA classificando 234 indicadores para CSRD...
                </p>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
