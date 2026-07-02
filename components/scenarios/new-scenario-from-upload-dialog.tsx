"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { uploadAbc, uploadScenario } from "@/lib/api/projects";
import { X, Upload, Loader2, FileSpreadsheet, CheckCircle2 } from "lucide-react";

type UploadMode = "abc" | "complete";

interface DropZoneProps {
  file: File | null;
  onFile: (f: File) => void;
  label: string;
  hint: string;
  disabled?: boolean;
}

function DropZone({ file, onFile, label, hint, disabled }: DropZoneProps) {
  const ref = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  return (
    <div>
      <p className="text-xs font-semibold text-[#404040] mb-1.5">{label}</p>
      <button
        type="button"
        disabled={disabled}
        onClick={() => ref.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files[0];
          if (f) onFile(f);
        }}
        className={cn(
          "w-full h-28 rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1.5 transition-all px-3",
          file
            ? "border-[#56B7A5] bg-[#E6F3EE]"
            : drag
            ? "border-[#56B7A5] bg-[#F0F9F6]"
            : "border-[#E0E4E3] bg-[#F8FAF9] hover:border-[#A9D7CD]",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        {file ? (
          <>
            <FileSpreadsheet size={20} className="text-[#56B7A5]" />
            <p className="text-xs font-semibold text-[#1d7a6b] truncate max-w-[260px]">{file.name}</p>
            <p className="text-[10px] text-[#56B7A5]">{(file.size / 1024).toFixed(0)} KB</p>
          </>
        ) : (
          <>
            <Upload size={18} className="text-[#808181]" />
            <p className="text-xs font-semibold text-[#404040]">Arraste o arquivo ou clique</p>
            <p className="text-[10px] text-[#808181]">{hint}</p>
          </>
        )}
      </button>
      <input
        ref={ref}
        type="file"
        accept=".xlsx,.xlsm"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
    </div>
  );
}

interface Props {
  projectId: string;
  open: boolean;
  onClose: () => void;
  /** Called after upload + scenario creation. Receives the new scenario id. */
  onCreated: (newScenarioId: string) => void;
}

export function NewScenarioFromUploadDialog({ projectId, open, onClose, onCreated }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<UploadMode>("abc");
  const [abcFile, setAbcFile] = useState<File | null>(null);
  const [itemsFile, setItemsFile] = useState<File | null>(null);
  const [insumosFile, setInsumosFile] = useState<File | null>(null);
  // Optional enrichment files that lift coverage when paired with an ABC.
  const [costCodesFile, setCostCodesFile] = useState<File | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [showEnrichment, setShowEnrichment] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyStep, setBusyStep] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Abort any in-flight upload when the dialog unmounts.
  useEffect(() => () => abortRef.current?.abort(), []);

  if (!open) return null;

  const isAbortError = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

  // Safety net for a stalled/dropped connection: abort just above the server's
  // 300s budget with a TimeoutError so the user gets a clear, retryable message
  // instead of an eternal spinner. User cancel / unmount stay silent.
  const UPLOAD_TIMEOUT_MS = 320_000;

  const canSubmit =
    name.trim().length > 0 &&
    !busy &&
    (mode === "abc" ? !!abcFile : !!itemsFile && !!insumosFile);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError("");
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const timer = setTimeout(
      () => controller.abort(new DOMException("timeout", "TimeoutError")),
      UPLOAD_TIMEOUT_MS
    );
    try {
      let newScenarioId: string | null = null;

      if (mode === "abc" && abcFile) {
        setBusyStep(
          costCodesFile || proofFile
            ? "Enviando arquivos, enriquecendo e calculando…"
            : "Enviando arquivo…"
        );
        const res = await uploadAbc(projectId, abcFile, {
          scenarioName: name.trim(),
          asScenario: true,
          costCodesFile: costCodesFile ?? undefined,
          proofFile: proofFile ?? undefined,
          signal: controller.signal,
        });
        newScenarioId = res.base_scenario_id;
        if (res.base_scenario_error) throw new Error(res.base_scenario_error);
      } else if (mode === "complete" && itemsFile && insumosFile) {
        setBusyStep("Enviando arquivos e calculando…");
        const res = await uploadScenario(projectId, itemsFile, insumosFile, name.trim(), controller.signal);
        newScenarioId = res.scenario_id;
      }

      if (!newScenarioId) {
        throw new Error("Servidor não retornou o id do cenário criado");
      }

      try {
        localStorage.setItem(`znit_active_scenario_${projectId}`, newScenarioId);
      } catch {}
      window.dispatchEvent(
        new CustomEvent("znit:active-scenario-changed", { detail: { id: newScenarioId } })
      );

      onCreated(newScenarioId);
      setDone(true);
      setBusyStep("Cenário criado com sucesso! Abrindo Itens…");
      setTimeout(() => router.push(`/projects/${projectId}/items`), 1400);
    } catch (e) {
      if (e instanceof DOMException && e.name === "TimeoutError") {
        setError("O processamento passou de 5 minutos sem resposta e foi interrompido. Verifique sua conexão e tente novamente.");
        setBusy(false);
        setBusyStep("");
        return;
      }
      if (isAbortError(e)) { setBusy(false); setBusyStep(""); return; }
      setError(e instanceof Error ? e.message : "Erro ao criar cenário");
      setBusy(false);
      setBusyStep("");
    } finally {
      clearTimeout(timer);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl border border-[#E0E4E3] shadow-[0_8px_32px_rgba(3,3,4,0.16)] w-full max-w-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E0E4E3]">
          <div>
            <h2 className="text-sm font-bold text-[#030304]">Novo cenário a partir de arquivo</h2>
            <p className="text-[11px] text-[#808181] mt-0.5">
              Cria um cenário paralelo apontando para uma nova curva ABC. O Base atual permanece intocado.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="text-[#808181] hover:text-[#030304] disabled:opacity-40"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Tabs */}
          <div className="flex gap-1 bg-[#F3F4F6] rounded-lg p-1 w-fit">
            <button
              onClick={() => !busy && setMode("abc")}
              disabled={busy}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-semibold transition-all",
                mode === "abc" ? "bg-white text-[#030304] shadow-sm" : "text-[#808181] hover:text-[#030304]"
              )}
            >
              ABC simples
            </button>
            <button
              onClick={() => !busy && setMode("complete")}
              disabled={busy}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-semibold transition-all",
                mode === "complete" ? "bg-white text-[#030304] shadow-sm" : "text-[#808181] hover:text-[#030304]"
              )}
            >
              Cenário Completo (items + insumos)
            </button>
          </div>

          {/* Drop zones */}
          {mode === "abc" ? (
            <>
              <DropZone
                file={abcFile}
                onFile={setAbcFile}
                label="Curva ABC (XLSX/XLSM)"
                hint=".xlsx ou .xlsm exportado do iTwo"
                disabled={busy}
              />
              <button
                type="button"
                onClick={() => setShowEnrichment((v) => !v)}
                disabled={busy}
                className="text-[11px] font-semibold text-[#56B7A5] hover:text-[#1d7a6b] transition-all"
              >
                {showEnrichment ? "− Ocultar" : "+ Adicionar"} arquivos opcionais para aumentar cobertura
              </button>
              {showEnrichment && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <DropZone
                    file={costCodesFile}
                    onFile={setCostCodesFile}
                    label="Cost Code (catálogo iTwo)"
                    hint="Opcional · descrições canônicas"
                    disabled={busy}
                  />
                  <DropZone
                    file={proofFile}
                    onFile={setProofFile}
                    label="Relatório Proof"
                    hint="Opcional · composições por cost code"
                    disabled={busy}
                  />
                </div>
              )}
            </>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <DropZone
                file={itemsFile}
                onFile={setItemsFile}
                label="Planilha de Itens"
                hint="Orçamento (Curva ABC)"
                disabled={busy}
              />
              <DropZone
                file={insumosFile}
                onFile={setInsumosFile}
                label="Planilha de Insumos"
                hint="Composições (SECAGEM)"
                disabled={busy}
              />
            </div>
          )}

          {/* Scenario name */}
          <div>
            <label className="block text-xs font-semibold text-[#404040] mb-1.5">
              Nome do cenário <span className="text-red-500">*</span>
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
              placeholder='Ex: "Cenário B — Concreto reciclado"'
              className="w-full h-9 px-3 rounded-lg border border-[#E0E4E3] text-xs text-[#030304] bg-[#F8FAF9] focus:outline-none focus:border-[#56B7A5] focus:bg-white transition-all"
            />
          </div>

          {/* Caveat */}
          <Alert variant="info">
            <span className="text-[11px]">
              Itens novos no arquivo aparecerão neste cenário. Comparação item-a-item com o Base assume os mesmos códigos de orçamento (cost codes).
            </span>
          </Alert>

          {error && (
            <p className="text-[11px] text-[#DC2626] bg-[#FEE2E2] border border-[#FCA5A5] rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {done ? (
            <div className="flex items-center gap-2 text-xs font-semibold text-[#1d7a6b] bg-[#E6F3EE] border border-[#A9D7CD] rounded-lg px-3 py-2">
              <CheckCircle2 size={14} className="text-[#56B7A5]" />
              {busyStep}
            </div>
          ) : busy ? (
            <div className="flex items-center gap-2 text-xs text-[#56B7A5]">
              <Loader2 size={14} className="animate-spin" />
              {busyStep}
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-[#E0E4E3] bg-[#F8FAF9] rounded-b-xl">
          <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button size="sm" disabled={!canSubmit} onClick={handleSubmit}>
            {done ? (
              <>
                <CheckCircle2 size={14} />
                Criado!
              </>
            ) : busy ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Processando…
              </>
            ) : (
              "Criar e calcular"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
