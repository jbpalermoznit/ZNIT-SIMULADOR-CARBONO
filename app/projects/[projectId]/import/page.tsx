"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  Upload, FileSpreadsheet, CheckCircle2, Loader2, X,
  Clock, ChevronRight, AlertTriangle, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { uploadAbc, uploadScenario, getProject, UploadResult, ScenarioUploadResult } from "@/lib/api/projects";

type Step = "upload" | "processing" | "preview" | "done";
type ImportMode = "abc" | "scenario" | "api";

const API_INTEGRATIONS = [
  {
    id: "altoqi",
    name: "AltoQI Visus",
    description: "Plataforma BIM para gestão de projetos e quantitativos",
    status: "active" as const,
    logo: "/logos/altoqi.png",
  },
  {
    id: "itwo",
    name: "iTwo RIB",
    description: "Orçamento e planejamento de obras — importação direta da Curva ABC",
    status: "soon" as const,
    logo: "/logos/itwo-rib.webp",
  },
  {
    id: "orcafascio",
    name: "OrçaFascio",
    description: "Orçamento de obras com composições SINAPI e SICRO",
    status: "soon" as const,
    logo: "/logos/orcafascio.png",
  },
  {
    id: "sienge",
    name: "Sienge",
    description: "ERP para construção civil — orçamento, compras e planejamento",
    status: "soon" as const,
    logo: "/logos/sienge.png",
  },
  {
    id: "vigha",
    name: "Vigha",
    description: "Gestão de obras e orçamento integrado com BIM",
    status: "soon" as const,
    logo: "/logos/vigha.png",
  },
];

const TYPE_LABELS: Record<string, { label: string; description: string; color: string; bg: string }> = {
  A: { label: "Material Direto",         description: "Material físico com EPD — mapeamento direto de emissões.",              color: "#1d7a6b", bg: "#E6F3EE" },
  B: { label: "Mão de Obra",             description: "Serviço humano sem material físico. Requer definição de premissa.",     color: "#92400e", bg: "#FEF3C7" },
  C: { label: "Item Agrupado",           description: "Código que engloba múltiplos materiais. Bloqueado até decomposição.",   color: "#7c3aed", bg: "#EDE9FE" },
  D: { label: "Material Embutido",       description: "Serviço onde o material já foi contado. Risco de dupla contagem.",      color: "#b45309", bg: "#FEF9C3" },
  E: { label: "Equipamento/Locação",     description: "Emissão por horas de uso e combustível. Requer dados operacionais.",   color: "#1e40af", bg: "#DBEAFE" },
  F: { label: "Administrativo/Indireto", description: "Sem emissão direta. Decisão de incluir ou excluir com justificativa.", color: "#374151", bg: "#F3F4F6" },
};

const COLUMNS = [
  { name: "CostCode",     aliases: "CostCode, Cód, Código",        required: true  },
  { name: "Descrição",    aliases: "Description, Desc, Item",       required: true  },
  { name: "Quantidade",   aliases: "Qty, Qtd, Quant",               required: true  },
  { name: "Unidade",      aliases: "Unit, Unid, Un",                required: true  },
  { name: "Custo Total",  aliases: "Total Cost, Custo, Total",      required: true  },
  { name: "Custo Unit.",  aliases: "Unit Cost, Valor Unit, VU",     required: false },
  { name: "Fornecedor",   aliases: "Supplier, Fornec",              required: false },
  { name: "ADF",          aliases: "ADF, Fator",                    required: false },
];

const NEXT_STEPS = [
  { step: "1", label: "Mapeamento automático", desc: "EPDs identificados por similaridade para itens Tipo A." },
  { step: "2", label: "Sessão com o Agente IA", desc: "Itens Tipo B–F parametrizados via conversa com o agente." },
  { step: "3", label: "Cenário Base calculado", desc: "Total de emissões em tCO₂e gerado automaticamente." },
  { step: "4", label: "Cenários alternativos", desc: "Compare materiais substitutos e gere relatórios." },
];

const IMPORT_HISTORY = [
  { date: "12/03/2026", file: "Curva_ABC_Demo_v2.xlsm", items: 116, status: "ok" },
  { date: "05/03/2026", file: "Curva_ABC_Demo_v1.xlsm", items: 112, status: "ok" },
];

export default function ImportPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const [mode, setMode] = useState<ImportMode>("scenario");
  const [step, setStep] = useState<Step>("upload");
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState("");
  const [projectName, setProjectName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Scenario mode state
  const [itemsFile, setItemsFile] = useState<File | null>(null);
  const [insumosFile, setInsumosFile] = useState<File | null>(null);
  const [draggingItems, setDraggingItems] = useState(false);
  const [draggingInsumos, setDraggingInsumos] = useState(false);
  const [scenarioName, setScenarioName] = useState("");
  const [scenarioResult, setScenarioResult] = useState<ScenarioUploadResult | null>(null);
  const insumosInputRef = useRef<HTMLInputElement>(null);
  const itemsInputRef = useRef<HTMLInputElement>(null);

  // Optional enrichment files (ABC mode) — boost coverage by feeding the
  // iTwo Cost Code catalog and Relatório Proof alongside the ABC.
  const [costCodesFile, setCostCodesFile] = useState<File | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const costCodesInputRef = useRef<HTMLInputElement>(null);
  const proofInputRef = useRef<HTMLInputElement>(null);
  const [showEnrichment, setShowEnrichment] = useState(false);

  useEffect(() => { getProject(projectId).then((p) => setProjectName(p.name)).catch(() => {}); }, [projectId]);

  // Warn the user before they leave/refresh while a file is still processing —
  // navigating away unmounts the page and aborts the in-flight upload silently.
  useEffect(() => {
    if (step !== "processing") return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [step]);

  const handleFile = (f: File) => { setFile(f); setError(""); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0]; if (f) handleFile(f);
  };
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (f) handleFile(f);
  };
  const handleUpload = async () => {
    if (!file) return;
    setStep("processing"); setError("");
    try {
      const data = await uploadAbc(projectId, file, {
        costCodesFile: costCodesFile ?? undefined,
        proofFile: proofFile ?? undefined,
      });
      setResult(data); setStep("preview");
      // The upload route now runs auto-map + base scenario + calculation
      // inline. As soon as we have a base scenario id, persist it as the
      // active scenario and route the user straight into Itens.
      if (data.base_scenario_id) {
        try {
          localStorage.setItem(`znit_active_scenario_${projectId}`, data.base_scenario_id);
        } catch {}
        setStep("done");
        setTimeout(() => router.push(`/projects/${projectId}/items`), 600);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao processar arquivo"); setStep("upload");
    }
  };

  const handleScenarioUpload = async () => {
    if (!itemsFile || !insumosFile || !scenarioName) return;
    setStep("processing"); setError("");
    try {
      const data = await uploadScenario(projectId, itemsFile, insumosFile, scenarioName);
      setScenarioResult(data); setStep("preview");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao processar cenário"); setStep("upload");
    }
  };

  const typeSummaryCards = result
    ? Object.entries(result.type_summary).map(([type, count]) => ({ type, count })).sort((a, b) => a.type.localeCompare(b.type))
    : [];

  return (
    <div className="flex gap-7 p-7 min-h-screen items-start">

      {/* ── Conteúdo principal ── */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="mb-7">
          <p className="text-xs font-semibold text-[#808181] uppercase tracking-widest mb-1">{projectName}</p>
          <h1 className="text-2xl font-bold text-[#030304]">Importar Dados</h1>
          <p className="text-sm text-[#808181] mt-0.5">Faça upload dos arquivos para calcular emissões de carbono</p>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-1 bg-[#F3F4F6] rounded-lg p-1 mb-6 w-fit">
          {[
            { id: "scenario" as ImportMode, label: "Cenário Completo" },
            { id: "abc" as ImportMode, label: "Curva ABC" },
            { id: "api" as ImportMode, label: "Conexões API" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => { setMode(t.id); setStep("upload"); setError(""); setResult(null); setScenarioResult(null); }}
              className={cn(
                "px-4 py-1.5 rounded-md text-xs font-semibold transition-all",
                mode === t.id ? "bg-white text-[#030304] shadow-sm" : "text-[#808181] hover:text-[#030304]"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Steps */}
        <div className="flex items-center gap-3 mb-8">
          {[
            { id: "upload", label: "Enviar" },
            { id: "processing", label: "Processando" },
            { id: "preview", label: "Visualização" },
            { id: "done", label: "Importado" },
          ].map((s, i) => {
            const order = ["upload", "processing", "preview", "done"];
            const isActive = s.id === step;
            const isPast = order.indexOf(s.id) < order.indexOf(step);
            return (
              <div key={s.id} className="flex items-center gap-2">
                {i > 0 && <div className={cn("w-8 h-px", isPast ? "bg-[#56B7A5]" : "bg-[#E0E4E3]")} />}
                <div className="flex items-center gap-1.5">
                  <div className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all",
                    isActive ? "bg-[#56B7A5] text-white" : isPast ? "bg-[#E6F3EE] text-[#56B7A5]" : "bg-[#F3F4F6] text-[#BDBDBC]"
                  )}>
                    {isPast ? <CheckCircle2 size={14} /> : i + 1}
                  </div>
                  <span className={cn("text-xs font-semibold", isActive ? "text-[#030304]" : isPast ? "text-[#56B7A5]" : "text-[#BDBDBC]")}>
                    {s.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Cenário Completo — Upload ── */}
        {mode === "scenario" && step === "upload" && (
          <div className="space-y-5">
            {error && <Alert variant="danger"><strong>Erro:</strong> {error}</Alert>}

            {/* Scenario name */}
            <div>
              <label className="text-xs font-semibold text-[#030304] mb-1 block">Nome do Cenário</label>
              <input
                type="text"
                value={scenarioName}
                onChange={(e) => setScenarioName(e.target.value)}
                placeholder="Ex: Cenário Padrão - Estaca Helice"
                className="w-full px-3 py-2 border border-[#E0E4E3] rounded-lg text-sm text-[#030304] placeholder:text-[#BDBDBC] focus:outline-none focus:ring-2 focus:ring-[#56B7A5]/30 focus:border-[#56B7A5]"
              />
            </div>

            {/* Two file dropzones side by side */}
            <div className="grid grid-cols-2 gap-4">
              {/* Planilha de Itens */}
              <div
                className={cn(
                  "border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer",
                  itemsFile ? "border-[#56B7A5] bg-[#E6F3EE]" : draggingItems ? "border-[#56B7A5] bg-[#E6F3EE]" : "border-[#BDBDBC] bg-white hover:border-[#81C8B9] hover:bg-[#F8FAF9]"
                )}
                onClick={() => itemsInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDraggingItems(true); }}
                onDragLeave={() => setDraggingItems(false)}
                onDrop={(e) => { e.preventDefault(); setDraggingItems(false); const f = e.dataTransfer.files[0]; if (f) { setItemsFile(f); setError(""); } }}
              >
                <input ref={itemsInputRef} type="file" accept=".xlsx,.xlsm" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setItemsFile(f); setError(""); } }} />
                <div className="w-10 h-10 bg-[#E6F3EE] rounded-lg flex items-center justify-center mx-auto mb-3">
                  <FileSpreadsheet size={20} className="text-[#56B7A5]" />
                </div>
                <h4 className="text-sm font-bold text-[#030304] mb-1">Planilha de Itens</h4>
                <p className="text-xs text-[#808181] mb-2">Arquivo de orçamento</p>
                {itemsFile ? (
                  <div className="flex items-center gap-2 justify-center">
                    <CheckCircle2 size={14} className="text-[#56B7A5]" />
                    <span className="text-xs font-semibold text-[#56B7A5] truncate max-w-[160px]">{itemsFile.name}</span>
                    <button onClick={(e) => { e.stopPropagation(); setItemsFile(null); }} className="text-[#808181] hover:text-red-500"><X size={12} /></button>
                  </div>
                ) : (
                  <p className="text-[11px] text-[#BDBDBC]">Arraste o arquivo ou clique</p>
                )}
              </div>

              {/* Planilha de Insumos */}
              <div
                className={cn(
                  "border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer",
                  insumosFile ? "border-[#56B7A5] bg-[#E6F3EE]" : draggingInsumos ? "border-[#56B7A5] bg-[#E6F3EE]" : "border-[#BDBDBC] bg-white hover:border-[#81C8B9] hover:bg-[#F8FAF9]"
                )}
                onClick={() => insumosInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDraggingInsumos(true); }}
                onDragLeave={() => setDraggingInsumos(false)}
                onDrop={(e) => { e.preventDefault(); setDraggingInsumos(false); const f = e.dataTransfer.files[0]; if (f) { setInsumosFile(f); setError(""); } }}
              >
                <input ref={insumosInputRef} type="file" accept=".xlsx,.xlsm" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setInsumosFile(f); setError(""); } }} />
                <div className="w-10 h-10 bg-[#E6F3EE] rounded-lg flex items-center justify-center mx-auto mb-3">
                  <FileSpreadsheet size={20} className="text-[#56B7A5]" />
                </div>
                <h4 className="text-sm font-bold text-[#030304] mb-1">Planilha de Insumos</h4>
                <p className="text-xs text-[#808181] mb-2">Arquivo de composições</p>
                {insumosFile ? (
                  <div className="flex items-center gap-2 justify-center">
                    <CheckCircle2 size={14} className="text-[#56B7A5]" />
                    <span className="text-xs font-semibold text-[#56B7A5] truncate max-w-[160px]">{insumosFile.name}</span>
                    <button onClick={(e) => { e.stopPropagation(); setInsumosFile(null); }} className="text-[#808181] hover:text-red-500"><X size={12} /></button>
                  </div>
                ) : (
                  <p className="text-[11px] text-[#BDBDBC]">Arraste o arquivo ou clique</p>
                )}
              </div>
            </div>

            {/* Process button */}
            {itemsFile && insumosFile && scenarioName && (
              <div className="flex justify-end">
                <Button onClick={handleScenarioUpload}>
                  <Upload size={15} /> Processar Cenário
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── Cenário Completo — Preview ── */}
        {mode === "scenario" && step === "preview" && scenarioResult && (
          <div className="space-y-5">
            <Alert variant="success">
              <strong>Cenário &quot;{scenarioResult.scenario_name}&quot; criado!</strong>{" "}
              {scenarioResult.result.total_tco2e.toFixed(2)} tCO₂e calculados.
            </Alert>

            <div className="grid grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border border-[#E0E4E3] p-4">
                <p className="text-xs text-[#808181]">Emissões Totais</p>
                <p className="text-2xl font-bold text-[#030304]">{scenarioResult.result.total_tco2e.toFixed(1)}</p>
                <p className="text-xs text-[#808181]">tCO₂e</p>
              </div>
              <div className="bg-white rounded-xl border border-[#E0E4E3] p-4">
                <p className="text-xs text-[#808181]">Itens mapeados</p>
                <p className="text-2xl font-bold text-[#56B7A5]">{scenarioResult.auto_mapped}</p>
                <p className="text-xs text-[#808181]">auto + {scenarioResult.suggested} sugeridos</p>
              </div>
              <div className="bg-white rounded-xl border border-[#E0E4E3] p-4">
                <p className="text-xs text-[#808181]">Cobertura</p>
                <p className="text-2xl font-bold text-[#030304]">{scenarioResult.result.coverage_pct.toFixed(0)}%</p>
                <p className="text-xs text-[#808181]">{scenarioResult.result.items_mapped}/{scenarioResult.result.items_total} itens</p>
              </div>
              <div className="bg-white rounded-xl border border-[#E0E4E3] p-4">
                <p className="text-xs text-[#808181]">Expansão</p>
                <p className="text-2xl font-bold text-[#030304]">{scenarioResult.total_parent_items}</p>
                <p className="text-xs text-[#808181]">itens → {scenarioResult.total_child_items} insumos</p>
              </div>
            </div>

            {scenarioResult.warnings.length > 0 && (
              <Alert variant="warning">
                {scenarioResult.warnings.slice(0, 3).join(" · ")}
              </Alert>
            )}

            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => { setStep("upload"); setScenarioResult(null); setItemsFile(null); setInsumosFile(null); setScenarioName(""); }}>
                Importar outro cenário
              </Button>
              <Button onClick={() => router.push(`/projects/${projectId}/scenarios`)}>
                Ver Cenários
              </Button>
            </div>
          </div>
        )}

        {/* ── Curva ABC — Upload ── */}
        {mode === "abc" && step === "upload" && (
          <div className="space-y-5">
            {error && <Alert variant="danger"><strong>Erro ao processar:</strong> {error}</Alert>}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              className={cn(
                "border-2 border-dashed rounded-xl p-12 text-center transition-all",
                dragging ? "border-[#56B7A5] bg-[#E6F3EE]" : "border-[#BDBDBC] bg-white hover:border-[#81C8B9] hover:bg-[#F8FAF9]"
              )}
            >
              <div className="w-16 h-16 bg-[#E6F3EE] rounded-xl flex items-center justify-center mx-auto mb-4">
                <Upload size={28} className="text-[#56B7A5]" />
              </div>
              <h3 className="text-base font-bold text-[#030304] mb-1">Arraste o arquivo aqui</h3>
              <p className="text-sm text-[#808181] mb-6">ou clique para selecionar · XLSX, XLSM · até 50MB</p>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xlsm" className="hidden" onChange={handleInputChange} />
              <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
                <FileSpreadsheet size={15} /> Selecionar arquivo
              </Button>
              <p className="text-xs text-[#BDBDBC] mt-4">Formato suportado: iTwo · Colunas detectadas automaticamente</p>
            </div>

            {file && (
              <div className="bg-white rounded-xl border border-[#E0E4E3] p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-[#E6F3EE] rounded-lg flex items-center justify-center">
                    <FileSpreadsheet size={18} className="text-[#56B7A5]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#030304]">{file.name}</p>
                    <p className="text-xs text-[#808181]">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setFile(null)} className="text-[#808181] hover:text-[#404040] p-1"><X size={16} /></button>
                  <Button onClick={handleUpload}>Processar arquivo</Button>
                </div>
              </div>
            )}

            {/* Optional enrichment files — boost coverage */}
            {file && (
              <div className="bg-white rounded-xl border border-[#E0E4E3] p-4 space-y-3">
                <button
                  type="button"
                  onClick={() => setShowEnrichment((v) => !v)}
                  className="flex items-center justify-between w-full text-left"
                >
                  <div>
                    <p className="text-xs font-bold text-[#030304]">
                      {showEnrichment ? "− Arquivos opcionais para aumentar cobertura" : "+ Adicionar arquivos opcionais para aumentar cobertura"}
                    </p>
                    <p className="text-[11px] text-[#808181] mt-0.5">
                      Catálogo Cost Code (iTwo) + Relatório Proof. Cada um aumenta a precisão do mapeamento automático.
                    </p>
                  </div>
                </button>
                {showEnrichment && (
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    {[
                      {
                        file: costCodesFile,
                        setFile: setCostCodesFile,
                        ref: costCodesInputRef,
                        label: "Cost Code (catálogo iTwo)",
                        hint: "Descrições canônicas por código",
                      },
                      {
                        file: proofFile,
                        setFile: setProofFile,
                        ref: proofInputRef,
                        label: "Relatório Proof",
                        hint: "Composições por cost code",
                      },
                    ].map((slot, idx) => (
                      <div key={idx}>
                        <p className="text-[11px] font-semibold text-[#404040] mb-1">{slot.label}</p>
                        {slot.file ? (
                          <div className="flex items-center justify-between gap-2 rounded-lg border border-[#56B7A5] bg-[#E6F3EE] px-3 py-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <FileSpreadsheet size={14} className="text-[#56B7A5] shrink-0" />
                              <span className="text-[11px] font-semibold text-[#1d7a6b] truncate">
                                {slot.file.name}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => slot.setFile(null)}
                              className="text-[#1d7a6b] hover:text-[#030304]"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => slot.ref.current?.click()}
                            className="w-full rounded-lg border-2 border-dashed border-[#E0E4E3] bg-[#F8FAF9] px-3 py-3 text-left hover:border-[#A9D7CD] transition-all"
                          >
                            <p className="text-[11px] font-semibold text-[#404040]">Selecionar arquivo</p>
                            <p className="text-[10px] text-[#808181] mt-0.5">{slot.hint}</p>
                          </button>
                        )}
                        <input
                          ref={slot.ref}
                          type="file"
                          accept=".xlsx,.xlsm,.xls"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) slot.setFile(f);
                          }}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Conexões API ── */}
        {mode === "api" && (
          <div className="space-y-4">
            <p className="text-sm text-[#808181]">
              Conecte diretamente com seu software de orçamento para importar dados automaticamente.
            </p>
            <div className="grid grid-cols-1 gap-3">
              {API_INTEGRATIONS.map((api) => (
                <div
                  key={api.id}
                  className={cn(
                    "bg-white rounded-xl border p-5 flex items-center gap-4 transition-all",
                    api.status === "active"
                      ? "border-[#56B7A5] shadow-[0_0_0_1px_rgba(86,183,165,0.15),0_2px_8px_rgba(86,183,165,0.1)]"
                      : "border-[#E0E4E3] hover:border-[#BDBDBC]"
                  )}
                >
                  <div className="w-12 h-12 rounded-lg bg-white border border-[#E0E4E3] flex items-center justify-center overflow-hidden shrink-0 p-1">
                    <img src={api.logo} alt={api.name} className="w-full h-full object-contain" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-[#030304]">{api.name}</h3>
                    <p className="text-xs text-[#808181] mt-0.5">{api.description}</p>
                  </div>
                  {api.status === "active" ? (
                    <button className="text-xs font-bold px-4 py-1.5 rounded-lg bg-[#56B7A5] text-white hover:bg-[#1d7a6b] transition-colors shrink-0">
                      Conectar
                    </button>
                  ) : (
                    <span className="text-[10px] font-bold px-3 py-1 rounded-full bg-[#F3F4F6] text-[#808181] shrink-0 uppercase tracking-wide">
                      Em breve
                    </span>
                  )}
                </div>
              ))}
            </div>
            <div className="bg-[#F8FAF9] rounded-xl border border-dashed border-[#E0E4E3] p-5 text-center">
              <p className="text-xs text-[#808181]">
                Tem interesse em uma integração? Entre em contato com{" "}
                <a href="mailto:contato@znit.ai" className="text-[#56B7A5] font-semibold hover:underline">contato@znit.ai</a>
              </p>
            </div>
          </div>
        )}

        {/* Processing (both modes) */}
        {step === "processing" && (
          <div className="bg-white rounded-xl border border-[#E0E4E3] p-10 text-center">
            <div className="w-16 h-16 bg-[#E6F3EE] rounded-xl flex items-center justify-center mx-auto mb-4">
              <Loader2 size={28} className="text-[#56B7A5] animate-spin" />
            </div>
            <h3 className="text-base font-bold text-[#030304] mb-1">Processando arquivo...</h3>
            <p className="text-sm text-[#808181]">{file?.name ?? scenarioName}</p>
            <p className="text-xs text-[#BDBDBC] mt-2">Detectando colunas, classificando itens e calculando Curva de Pareto...</p>
            <p className="text-xs font-semibold text-[#F59E0B] mt-4">Não feche nem saia desta tela — o processamento é interrompido se você sair.</p>
          </div>
        )}

        {/* ABC Preview */}
        {mode === "abc" && step === "preview" && result && (
          <div className="space-y-5">
            <Alert variant="success">
              <strong>{result.total_items} itens detectados</strong> em <strong>{result.file_name}</strong> — confira antes de confirmar.
            </Alert>
            {result.warnings.length > 0 && (
              <Alert variant="warning">
                <strong>{result.warnings.length} aviso(s):</strong>{" "}
                {result.warnings.slice(0, 2).join(" · ")}
                {result.warnings.length > 2 && ` +${result.warnings.length - 2} mais`}
              </Alert>
            )}

            {/* Type summary */}
            <div className="bg-white rounded-xl border border-[#E0E4E3] overflow-hidden">
              <div className="px-5 py-3 border-b border-[#E0E4E3]">
                <h3 className="text-sm font-bold text-[#030304]">Classificação por tipo de item</h3>
                <p className="text-xs text-[#808181] mt-0.5">Cada tipo tem uma lógica diferente para o cálculo de carbono</p>
              </div>
              <div className="divide-y divide-[#F0F4F3]">
                {typeSummaryCards.map(({ type, count }) => {
                  const meta = TYPE_LABELS[type];
                  return (
                    <div key={type} className="flex items-center gap-4 px-5 py-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                        style={{ backgroundColor: meta?.bg ?? "#F3F4F6", color: meta?.color ?? "#374151" }}>
                        {type}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#030304]">{meta?.label ?? type}</p>
                        <p className="text-xs text-[#808181] mt-0.5">{meta?.description}</p>
                      </div>
                      <div className="text-2xl font-bold flex-shrink-0" style={{ color: meta?.color ?? "#374151" }}>{count}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Class summary */}
            <div className="bg-white rounded-xl border border-[#E0E4E3] overflow-hidden">
              <div className="px-5 py-3 border-b border-[#E0E4E3] flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[#030304]">Prioridade por custo</h3>
                  <p className="text-xs text-[#808181] mt-0.5">Curva de Pareto — % custo acumulado</p>
                </div>
                <span className="text-sm text-[#808181]">
                  Total: <strong className="text-[#030304]">R$ {(result.total_cost / 1_000_000).toFixed(1)}M</strong>
                </span>
              </div>
              <div className="divide-y divide-[#F0F4F3]">
                {[
                  { cls: "P1", range: "0 – 80% do custo",   desc: "Foco principal do mapeamento de carbono.", color: "#56B7A5", bg: "#E6F3EE" },
                  { cls: "P2", range: "80 – 95% do custo",  desc: "Mapeados após cobertura total da P1.",     color: "#F59E0B", bg: "#FEF3C7" },
                  { cls: "P3", range: "95 – 100% do custo", desc: "Podem usar fatores genéricos.",            color: "#9CA3AF", bg: "#F3F4F6" },
                ].map(({ cls, range, desc, color, bg }) => (
                  <div key={cls} className="flex items-center gap-4 px-5 py-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0"
                      style={{ backgroundColor: bg, color }}>{cls}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#030304]">{range}</p>
                      <p className="text-xs text-[#808181] mt-0.5">{desc}</p>
                    </div>
                    <div className="text-2xl font-bold flex-shrink-0" style={{ color }}>{result.class_summary[cls] ?? 0}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => { setStep("upload"); setResult(null); }}>Cancelar</Button>
              <Button onClick={() => { setStep("done"); setTimeout(() => router.push(`/projects/${projectId}/overview`), 1500); }}>
                <CheckCircle2 size={15} /> Confirmar Importação
              </Button>
            </div>
          </div>
        )}

        {/* ABC Done */}
        {mode === "abc" && step === "done" && result && (
          <div className="bg-white rounded-xl border border-[#E0E4E3] p-12 text-center">
            <div className="w-16 h-16 bg-[#E6F3EE] rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={32} className="text-[#56B7A5]" />
            </div>
            <h3 className="text-xl font-bold text-[#030304] mb-1">Importação concluída!</h3>
            <p className="text-sm text-[#808181] mb-1">{result.total_items} itens processados com sucesso.</p>
            <p className="text-sm text-[#808181]">Redirecionando para o dashboard do projeto...</p>
          </div>
        )}
      </div>

      {/* ── Sidebar direita ── */}
      <aside className="w-72 shrink-0 flex flex-col gap-5 sticky top-7">

        {/* Guia de formato */}
        <div className="bg-white rounded-xl border border-[#E0E4E3] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E0E4E3] flex items-center gap-2">
            <Info size={14} className="text-[#56B7A5]" />
            <h3 className="text-xs font-bold text-[#030304] uppercase tracking-wide">Formato esperado</h3>
          </div>
          <div className="px-4 py-3 space-y-1">
            <p className="text-xs text-[#808181] mb-2">Colunas detectadas automaticamente por nome ou sinônimo:</p>
            {COLUMNS.map((col) => (
              <div key={col.name} className="flex items-start justify-between gap-2 py-1">
                <div>
                  <span className="text-xs font-semibold text-[#030304]">{col.name}</span>
                  <span className="text-[10px] text-[#BDBDBC] ml-1.5">{col.aliases}</span>
                </div>
                {col.required
                  ? <span className="text-[10px] font-bold text-[#56B7A5] shrink-0">obrig.</span>
                  : <span className="text-[10px] text-[#BDBDBC] shrink-0">opcional</span>
                }
              </div>
            ))}
          </div>
          <div className="px-4 py-3 border-t border-[#F0F4F3] bg-[#F8FAF9]">
            <div className="flex items-start gap-2">
              <AlertTriangle size={13} className="text-[#F59E0B] mt-0.5 shrink-0" />
              <p className="text-[11px] text-[#808181] leading-relaxed">
                A linha <strong className="text-[#404040]">TOTAL</strong> ao final do arquivo é ignorada automaticamente.
                Células mescladas podem causar erros de leitura.
              </p>
            </div>
          </div>
        </div>

        {/* O que acontece depois */}
        <div className="bg-white rounded-xl border border-[#E0E4E3] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E0E4E3] flex items-center gap-2">
            <ChevronRight size={14} className="text-[#56B7A5]" />
            <h3 className="text-xs font-bold text-[#030304] uppercase tracking-wide">O que acontece depois</h3>
          </div>
          <div className="px-4 py-3 space-y-3">
            {NEXT_STEPS.map((s, i) => (
              <div key={s.step} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-5 h-5 rounded-full bg-[#E6F3EE] flex items-center justify-center text-[10px] font-bold text-[#56B7A5] shrink-0">
                    {s.step}
                  </div>
                  {i < NEXT_STEPS.length - 1 && <div className="w-px flex-1 bg-[#E0E4E3] mt-1" />}
                </div>
                <div className="pb-3">
                  <p className="text-xs font-semibold text-[#030304]">{s.label}</p>
                  <p className="text-[11px] text-[#808181] mt-0.5 leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Histórico */}
        <div className="bg-white rounded-xl border border-[#E0E4E3] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E0E4E3] flex items-center gap-2">
            <Clock size={14} className="text-[#56B7A5]" />
            <h3 className="text-xs font-bold text-[#030304] uppercase tracking-wide">Histórico de importações</h3>
          </div>
          {IMPORT_HISTORY.length === 0 ? (
            <p className="text-xs text-[#BDBDBC] px-4 py-3">Nenhuma importação anterior.</p>
          ) : (
            <div className="divide-y divide-[#F0F4F3]">
              {IMPORT_HISTORY.map((h, i) => (
                <div key={i} className="px-4 py-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#030304] truncate">{h.file}</p>
                    <p className="text-[11px] text-[#808181] mt-0.5">{h.date} · {h.items} itens</p>
                  </div>
                  <CheckCircle2 size={14} className="text-[#56B7A5] shrink-0 mt-0.5" />
                </div>
              ))}
            </div>
          )}
        </div>

      </aside>
    </div>
  );
}
