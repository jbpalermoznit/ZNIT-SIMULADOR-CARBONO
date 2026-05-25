"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { listProjects, type ProjectResponse } from "@/lib/api/projects";
import { useActiveScenario } from "@/lib/hooks/use-active-scenario";
import { UserButton, OrganizationSwitcher } from "@clerk/nextjs";
import {
  LayoutDashboard,
  Upload,
  Table2,
  MessageSquare,
  GitCompare,
  FileText,
  BookOpen,
  Settings,
  ChevronDown,
  BarChart3,
  Scale,
  Layers,
} from "lucide-react";

const navItems = [
  { label: "Painel", href: "/dashboard", icon: LayoutDashboard },
];

const projectMenuItems = [
  { label: "Importar",          path: "import",      icon: Upload },
  { label: "Itens",             path: "items",       icon: Table2 },
  { label: "Visão Geral",       path: "overview",    icon: LayoutDashboard },
  { label: "Cenários",          path: "scenarios",   icon: GitCompare },
  { label: "Regras Salvas",     path: "rules",       icon: BookOpen },
  { label: "Curva MACC",        path: "macc",        icon: BarChart3 },
  { label: "Simulação Carbono", path: "simulation",  icon: Scale },
  { label: "Relatórios",        path: "reports",     icon: FileText },
  { label: "Agente IA",         path: "agent",       icon: MessageSquare, comingSoon: true },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [projectOpen, setProjectOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [activeProject, setActiveProject] = useState<ProjectResponse | null>(null);
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const scenarioPopRef = useRef<HTMLDivElement>(null);

  const { scenarios, activeScenarioId, activeScenario, setActiveScenarioId } =
    useActiveScenario(activeProject?.id ?? null);

  useEffect(() => {
    if (!scenarioOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!scenarioPopRef.current?.contains(e.target as Node)) setScenarioOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [scenarioOpen]);

  const handleScenarioSelect = (id: string) => {
    setActiveScenarioId(id);
    setScenarioOpen(false);
    // Notify other components in the same tab — useActiveScenario reads
    // localStorage on mount but doesn't subscribe to changes, so we trigger
    // a soft refresh by dispatching a custom event consumers can listen to.
    window.dispatchEvent(new CustomEvent("znit:active-scenario-changed", { detail: { id } }));
    router.refresh();
  };

  // Detect active project from URL
  useEffect(() => {
    const match = pathname.match(/\/projects\/([^/]+)/);
    if (match && projects.length > 0) {
      const found = projects.find((p) => p.id === match[1]);
      if (found && found.id !== activeProject?.id) setActiveProject(found);
    }
  }, [pathname, projects, activeProject?.id]);

  useEffect(() => {
    listProjects()
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setProjects(list);
        if (list.length > 0 && !activeProject) setActiveProject(list[0]);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <aside className="w-56 bg-white border-r border-[#E0E4E3] flex flex-col h-screen sticky top-0 shrink-0">
      {/* Logo */}
      <div className="px-5 py-4 border-b border-[#E0E4E3]">
        <img
          src="/ZNIT_Logo.png"
          alt="ZNIT"
          width={110}
          height={33}
          className="block h-[33px] w-auto"
        />
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4">
        {/* Global */}
        <div className="px-3 mb-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded text-sm font-medium transition-all",
                  active
                    ? "bg-[#E6F3EE] text-[#1d7a6b]"
                    : "text-[#404040] hover:bg-[rgba(86,183,165,0.06)] hover:text-[#030304]"
                )}
              >
                <Icon size={16} className={active ? "text-[#56B7A5]" : "opacity-60"} />
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* Projeto Ativo */}
        <div className="px-3">
          <p className="text-[10px] font-semibold text-[#808181] uppercase tracking-widest px-3 mb-2">
            Projeto Ativo
          </p>

          {/* Dropdown selector */}
          <div className="relative mb-2">
            <button
              onClick={() => setProjectOpen((o) => !o)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[#F8FAF9] border border-[#E0E4E3] hover:border-[#56B7A5] transition-all group"
            >
              <div className="text-left min-w-0">
                <p className="text-xs font-semibold text-[#030304] truncate">
                  {activeProject?.name ?? "Selecionar projeto"}
                </p>
                <p className="text-[10px] text-[#808181]">
                  {activeProject?.client_name ?? ""} · {activeProject?.building_type ?? ""}
                </p>
              </div>
              <ChevronDown
                size={14}
                className={cn(
                  "text-[#808181] shrink-0 transition-transform",
                  projectOpen && "rotate-180"
                )}
              />
            </button>

            {projectOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#E0E4E3] rounded-lg shadow-[0_4px_16px_rgba(3,3,4,0.10)] z-10 overflow-hidden">
                {projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { setActiveProject(p); setProjectOpen(false); router.push(`/projects/${p.id}/overview`); }}
                    className={cn(
                      "w-full text-left px-3 py-2.5 hover:bg-[#F8FAF9] transition-all",
                      p.id === activeProject?.id && "bg-[#E6F3EE]"
                    )}
                  >
                    <p className="text-xs font-semibold text-[#030304] truncate">{p.name}</p>
                    <p className="text-[10px] text-[#808181]">
                      {p.client_name} · {p.building_type}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Active scenario chip — visible across the whole project area */}
          {activeProject && scenarios.length > 0 && (
            <div className="relative mb-3" ref={scenarioPopRef}>
              <button
                onClick={() => setScenarioOpen((o) => !o)}
                className="w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-[#E6F3EE] border border-[#A9D7CD] hover:border-[#56B7A5] transition-all"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <Layers size={12} className="text-[#56B7A5] shrink-0" />
                  <span className="text-[10px] font-semibold text-[#1d7a6b] uppercase tracking-wider shrink-0">
                    Cenário
                  </span>
                  <span className="text-xs font-semibold text-[#030304] truncate">
                    {activeScenario?.name ?? "—"}
                  </span>
                </div>
                <ChevronDown
                  size={12}
                  className={cn(
                    "text-[#1d7a6b] shrink-0 transition-transform",
                    scenarioOpen && "rotate-180"
                  )}
                />
              </button>
              {scenarioOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#E0E4E3] rounded-lg shadow-[0_4px_16px_rgba(3,3,4,0.10)] z-10 overflow-hidden max-h-64 overflow-y-auto">
                  {scenarios.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => handleScenarioSelect(s.id)}
                      className={cn(
                        "w-full text-left px-3 py-2 hover:bg-[#F8FAF9] transition-all",
                        s.id === activeScenarioId && "bg-[#E6F3EE]"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-semibold text-[#030304] truncate flex-1">{s.name}</p>
                        {s.is_base && (
                          <span className="text-[9px] font-bold text-[#56B7A5] bg-white border border-[#A9D7CD] rounded px-1 py-px shrink-0">
                            BASE
                          </span>
                        )}
                      </div>
                      {s.result?.total_tco2e != null && (
                        <p className="text-[10px] text-[#808181] mt-0.5">
                          {s.result.total_tco2e.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} tCO₂e
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Project nav items */}
          {projectMenuItems.map((item) => {
            const Icon = item.icon;
            const href = activeProject ? `/projects/${activeProject.id}/${item.path}` : "#";
            const active = pathname.endsWith(`/${item.path}`) || pathname.includes(`/${item.path}/`);

            if (item.comingSoon) {
              return (
                <span
                  key={item.path}
                  className="flex items-center gap-2.5 px-3 py-2 rounded text-sm font-medium text-[#BDBDBC] cursor-default"
                >
                  <Icon size={15} className="opacity-30" />
                  {item.label}
                  <span className="ml-auto bg-[#F0F4F3] text-[#BDBDBC] text-[9px] font-bold px-1.5 py-0.5 rounded">
                    Em breve
                  </span>
                </span>
              );
            }

            return (
              <Link
                key={item.path}
                href={href}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded text-sm font-medium transition-all",
                  active
                    ? "bg-[#E6F3EE] text-[#1d7a6b]"
                    : "text-[#404040] hover:bg-[rgba(86,183,165,0.06)] hover:text-[#030304]"
                )}
              >
                <Icon size={15} className={active ? "text-[#56B7A5]" : "opacity-50"} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Bottom */}
      <div className="px-3 py-3 border-t border-[#E0E4E3] space-y-2">
        <div className="px-1">
          <OrganizationSwitcher
            hidePersonal
            afterCreateOrganizationUrl="/dashboard"
            afterSelectOrganizationUrl="/dashboard"
            appearance={{
              elements: {
                rootBox: "w-full",
                organizationSwitcherTrigger: "w-full justify-between",
              },
            }}
          />
        </div>
        <Link
          href="/settings"
          className="flex items-center gap-2.5 px-3 py-2 rounded text-sm font-medium text-[#808181] hover:bg-[rgba(86,183,165,0.06)] hover:text-[#404040] transition-all"
        >
          <Settings size={15} />
          Configurações
        </Link>
        <div className="flex items-center gap-2.5 px-3 py-1">
          <UserButton />
          <span className="text-[10px] text-[#808181]">Conta</span>
        </div>
      </div>
    </aside>
  );
}
