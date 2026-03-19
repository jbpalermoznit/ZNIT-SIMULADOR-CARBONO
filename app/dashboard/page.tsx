"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { KpiCard } from "@/components/ui/kpi-card";
import { listProjects, createProject, ProjectResponse } from "@/lib/api/projects";
import { Plus, ArrowUpRight, Leaf, TrendingDown, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "znit_settings";

export default function DashboardPage() {
  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewProject, setShowNewProject] = useState(false);
  const [creating, setCreating] = useState(false);
  const [portfolioTitle, setPortfolioTitle] = useState("Portfólio HTB");
  const [portfolioSubtitle, setPortfolioSubtitle] = useState(
    "Projetos ativos · Piloto 90 dias · Grupo HTB"
  );

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listProjects();
      setProjects(data);
    } catch {
      console.error("Erro ao carregar projetos");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.portfolioTitle) setPortfolioTitle(s.portfolioTitle);
        if (s.portfolioSubtitle) setPortfolioSubtitle(s.portfolioSubtitle);
      }
    } catch {}
    loadProjects();
  }, [loadProjects]);

  const [newName, setNewName] = useState("");
  const [newClient, setNewClient] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newArea, setNewArea] = useState("");
  const [newType, setNewType] = useState("");

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createProject({
        name: newName,
        client_name: newClient || undefined,
        address: newAddress || undefined,
        total_area_m2: newArea ? parseFloat(newArea) : undefined,
        building_type: newType || undefined,
      });
      setShowNewProject(false);
      setNewName("");
      setNewClient("");
      setNewAddress("");
      setNewArea("");
      setNewType("");
      await loadProjects();
    } catch {
      console.error("Erro ao criar projeto");
    }
    setCreating(false);
  };

  const totalTco2e = projects.reduce((sum, p) => sum + (p.total_tco2e ?? 0), 0);
  const totalProjects = projects.filter((p) => p.status === "active").length;
  const projectsWithCoverage = projects.filter((p) => p.coverage_pct != null);
  const avgCoverage =
    projectsWithCoverage.length > 0
      ? projectsWithCoverage.reduce((sum, p) => sum + (p.coverage_pct ?? 0), 0) /
        projectsWithCoverage.length
      : 0;
  const totalScenarios = projects.reduce((s, p) => s + p.scenarios_count, 0);

  return (
    <div className="p-7">
      {/* Header */}
      <div className="flex items-start justify-between mb-7">
        <div>
          <h1 className="text-2xl font-bold text-[#030304] mb-1">{portfolioTitle}</h1>
          <p className="text-sm text-[#808181]">{portfolioSubtitle}</p>
        </div>
        <Button onClick={() => setShowNewProject(true)}>
          <Plus size={15} />
          Novo Projeto
        </Button>
      </div>

      {/* Portfolio KPIs */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <KpiCard
          label="Total Portfólio"
          value={
            totalTco2e >= 1000
              ? (totalTco2e / 1000).toFixed(1) + "k"
              : totalTco2e.toFixed(0)
          }
          unit="tCO₂e"
          sub={`${totalProjects} projeto${totalProjects !== 1 ? "s" : ""} ativo${totalProjects !== 1 ? "s" : ""}`}
          highlight
          icon={<Leaf size={20} />}
        />
        <KpiCard
          label="Projetos Ativos"
          value={totalProjects}
          sub="Piloto HTB em andamento"
          icon={<ArrowUpRight size={20} />}
        />
        <KpiCard
          label="Cobertura Média"
          value={avgCoverage.toFixed(0) + "%"}
          sub="Itens com fator mapeado"
          icon={<TrendingDown size={20} />}
        />
        <KpiCard
          label="Cenários Gerados"
          value={totalScenarios}
          sub="Em todos os projetos"
        />
      </div>

      {/* Projects list */}
      <div className="flex flex-col gap-5">
        <h2 className="text-sm font-semibold text-[#808181] uppercase tracking-wide">
          Projetos
        </h2>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-[#808181]">
            <Loader2 className="animate-spin mr-2" size={18} />
            Carregando projetos...
          </div>
        ) : projects.length === 0 ? (
          <div className="bg-white rounded-xl border border-[#E0E4E3] p-12 text-center text-[#808181]">
            <p className="mb-2">Nenhum projeto criado ainda.</p>
            <Button onClick={() => setShowNewProject(true)} variant="outline" size="sm">
              <Plus size={14} />
              Criar primeiro projeto
            </Button>
          </div>
        ) : (
          projects.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}/overview`}
              className="block"
            >
              <div className="bg-white rounded-xl border border-[#E0E4E3] shadow-[0_1px_3px_rgba(3,3,4,0.06)] hover:shadow-[0_4px_12px_rgba(3,3,4,0.08)] hover:border-[#A9D7CD] transition-all p-6 cursor-pointer group">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1.5">
                      <h3 className="text-base font-bold text-[#030304] group-hover:text-[#56B7A5] transition-colors">
                        {project.name}
                      </h3>
                      <span className="text-xs bg-[#E6F3EE] text-[#1d7a6b] px-2 py-0.5 rounded font-semibold">
                        {project.status === "active" ? "Ativo" : "Arquivado"}
                      </span>
                    </div>
                    <p className="text-sm text-[#808181]">
                      {[project.client_name, project.building_type, project.address]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <ArrowUpRight
                    size={18}
                    className="text-[#BDBDBC] group-hover:text-[#56B7A5] transition-colors shrink-0 mt-0.5"
                  />
                </div>

                <div className="flex gap-8 mt-5 pt-5 border-t border-[#F0F4F3]">
                  <div>
                    <p className="text-[10px] text-[#808181] uppercase tracking-wide mb-0.5">
                      Total
                    </p>
                    <p className="text-lg font-bold text-[#030304]">
                      {project.total_tco2e != null
                        ? project.total_tco2e.toLocaleString("pt-BR", {
                            maximumFractionDigits: 0,
                          })
                        : "—"}{" "}
                      <span className="text-sm font-normal text-[#808181]">tCO₂e</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#808181] uppercase tracking-wide mb-0.5">
                      Intensidade
                    </p>
                    <p className="text-lg font-bold text-[#030304]">
                      {project.intensity_kgco2e_per_m2 != null
                        ? project.intensity_kgco2e_per_m2.toFixed(1)
                        : "—"}{" "}
                      <span className="text-sm font-normal text-[#808181]">
                        kgCO₂e/m²
                      </span>
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#808181] uppercase tracking-wide mb-0.5">
                      Cobertura
                    </p>
                    <div className="flex items-center gap-2">
                      <p className="text-lg font-bold text-[#030304]">
                        {project.coverage_pct != null
                          ? project.coverage_pct.toFixed(0)
                          : "—"}
                        <span className="text-sm font-normal text-[#808181]">%</span>
                      </p>
                      {project.coverage_pct != null && (
                        <div className="w-20 h-1.5 bg-[#E0E4E3] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#56B7A5] rounded-full"
                            style={{ width: `${project.coverage_pct}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#808181] uppercase tracking-wide mb-0.5">
                      Cenários
                    </p>
                    <p className="text-lg font-bold text-[#030304]">
                      {project.scenarios_count}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#808181] uppercase tracking-wide mb-0.5">
                      Itens
                    </p>
                    <p className="text-lg font-bold text-[#030304]">
                      {project.items_count}
                    </p>
                  </div>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>

      {/* Modal Novo Projeto */}
      {showNewProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setShowNewProject(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-[0_20px_60px_rgba(3,3,4,0.15)] w-full max-w-md">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-[#E0E4E3]">
              <h2 className="text-base font-bold text-[#030304]">Novo Projeto</h2>
              <button
                onClick={() => setShowNewProject(false)}
                className="text-[#808181] hover:text-[#404040] p-1 rounded"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#404040] mb-1.5">
                  Nome do projeto <span className="text-[#DC2626]">*</span>
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ex: Raízen VRO R8"
                  className="w-full h-9 px-3 rounded-lg border border-[#E0E4E3] text-sm text-[#030304] bg-[#F8FAF9] placeholder:text-[#BDBDBC] focus:outline-none focus:border-[#56B7A5] focus:bg-white transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#404040] mb-1.5">
                  Cliente
                </label>
                <input
                  type="text"
                  value={newClient}
                  onChange={(e) => setNewClient(e.target.value)}
                  placeholder="Ex: Raízen"
                  className="w-full h-9 px-3 rounded-lg border border-[#E0E4E3] text-sm text-[#030304] bg-[#F8FAF9] placeholder:text-[#BDBDBC] focus:outline-none focus:border-[#56B7A5] focus:bg-white transition-all"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#404040] mb-1.5">
                    Área total (m²)
                  </label>
                  <input
                    type="number"
                    value={newArea}
                    onChange={(e) => setNewArea(e.target.value)}
                    placeholder="Ex: 102000"
                    className="w-full h-9 px-3 rounded-lg border border-[#E0E4E3] text-sm text-[#030304] bg-[#F8FAF9] placeholder:text-[#BDBDBC] focus:outline-none focus:border-[#56B7A5] focus:bg-white transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#404040] mb-1.5">
                    Tipo de obra
                  </label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-[#E0E4E3] text-sm text-[#030304] bg-[#F8FAF9] focus:outline-none focus:border-[#56B7A5] transition-all"
                  >
                    <option value="">Selecionar</option>
                    <option value="Industrial">Industrial</option>
                    <option value="Comercial">Comercial</option>
                    <option value="Residencial">Residencial</option>
                    <option value="Infraestrutura">Infraestrutura</option>
                    <option value="Institucional">Institucional</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#404040] mb-1.5">
                  Endereço
                </label>
                <input
                  type="text"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  placeholder="Ex: São Paulo, SP"
                  className="w-full h-9 px-3 rounded-lg border border-[#E0E4E3] text-sm text-[#030304] bg-[#F8FAF9] placeholder:text-[#BDBDBC] focus:outline-none focus:border-[#56B7A5] focus:bg-white transition-all"
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end px-6 pb-6">
              <Button variant="outline" onClick={() => setShowNewProject(false)}>
                Cancelar
              </Button>
              <Button disabled={!newName.trim() || creating} onClick={handleCreate}>
                {creating ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Plus size={15} />
                )}
                Criar Projeto
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
