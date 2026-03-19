"use client";
import { useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  Upload, FileSpreadsheet, CheckCircle2, Loader2, X,
  Clock, ChevronRight, AlertTriangle, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { uploadAbc, UploadResult } from "@/lib/api/projects";

type Step = "upload" | "processing" | "preview" | "done";

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
  { date: "12/03/2026", file: "Curva ABC_Raizen VRO_R8_v2.xlsm", items: 116, status: "ok" },
  { date: "05/03/2026", file: "Curva ABC_Raizen VRO_R8_v1.xlsm", items: 112, status: "ok" },
];

export default function ImportPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const [step, setStep] = useState<Step>("upload");
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      const data = await uploadAbc(projectId, file);
      setResult(data); setStep("preview");
    } catch (e: any) {
      setError(e.message ?? "Erro ao processar arquivo"); setStep("upload");
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
          <p className="text-xs font-semibold text-[#808181] uppercase tracking-widest mb-1">Raízen VRO R8</p>
          <h1 className="text-2xl font-bold text-[#030304]">Importar Curva ABC</h1>
          <p className="text-sm text-[#808181] mt-0.5">Faça upload do arquivo XLSX ou XLSM exportado do iTwo</p>
        </div>

        {/* Steps */}
        <div className="flex items-center gap-3 mb-8">
          {[
            { id: "upload", label: "Upload" },
            { id: "processing", label: "Processando" },
            { id: "preview", label: "Preview" },
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

        {/* Upload */}
        {step === "upload" && (
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
          </div>
        )}

        {/* Processing */}
        {step === "processing" && (
          <div className="bg-white rounded-xl border border-[#E0E4E3] p-10 text-center">
            <div className="w-16 h-16 bg-[#E6F3EE] rounded-xl flex items-center justify-center mx-auto mb-4">
              <Loader2 size={28} className="text-[#56B7A5] animate-spin" />
            </div>
            <h3 className="text-base font-bold text-[#030304] mb-1">Processando arquivo...</h3>
            <p className="text-sm text-[#808181]">{file?.name}</p>
            <p className="text-xs text-[#BDBDBC] mt-2">Detectando colunas, classificando itens e calculando Curva de Pareto...</p>
          </div>
        )}

        {/* Preview */}
        {step === "preview" && result && (
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

        {/* Done */}
        {step === "done" && result && (
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
