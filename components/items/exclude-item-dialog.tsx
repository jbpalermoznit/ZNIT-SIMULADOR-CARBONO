"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Loader2, Ban } from "lucide-react";
import { cn } from "@/lib/utils";

export type ExcludeMode = "fork" | "update";

export interface ExcludeChoice {
  justification: string;
  mode: ExcludeMode;
  newScenarioName?: string;
}

interface Props {
  open: boolean;
  itemDescription: string;
  activeScenarioName: string;
  saving?: boolean;
  onCancel: () => void;
  onConfirm: (choice: ExcludeChoice) => void;
}

/**
 * Modal to take an item out of the inventory. Captures a justification
 * (required, written to item_mappings.exclusion_justification) plus the
 * usual scenario decision: fork or update.
 *
 * Mounted with `key={openItemId}` from the parent so its state resets
 * cleanly between opens.
 */
export function ExcludeItemDialog({
  open,
  itemDescription,
  activeScenarioName,
  saving,
  onCancel,
  onConfirm,
}: Props) {
  const defaultName = `${activeScenarioName} − ${itemDescription}`.slice(0, 80);
  const [mode, setMode] = useState<ExcludeMode>("fork");
  const [name, setName] = useState(defaultName);
  const [justification, setJustification] = useState("");

  if (!open) return null;

  const canSubmit = !saving && justification.trim().length >= 5 && (mode === "update" || name.trim().length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl border border-[#E0E4E3] shadow-[0_8px_32px_rgba(3,3,4,0.16)] w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E0E4E3]">
          <div className="flex items-center gap-2">
            <Ban size={16} className="text-[#6b7280]" />
            <h2 className="text-sm font-bold text-[#030304]">Desconsiderar item do cálculo</h2>
          </div>
          <button
            onClick={onCancel}
            disabled={saving}
            className="text-[#808181] hover:text-[#030304] disabled:opacity-40"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <p className="text-[11px] font-semibold text-[#404040] mb-1">Item</p>
            <p className="text-xs text-[#030304] bg-[#F8FAF9] rounded-lg px-3 py-2 border border-[#E0E4E3]">
              {itemDescription}
            </p>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#404040] mb-1">
              Justificativa <span className="text-red-500">*</span>
            </label>
            <textarea
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              disabled={saving}
              rows={3}
              placeholder="Ex: Material já contabilizado em outro item · Sem EPD disponível · Fora do escopo da análise"
              className="w-full px-3 py-2 rounded-lg border border-[#E0E4E3] text-xs text-[#030304] bg-[#F8FAF9] placeholder:text-[#BDBDBC] focus:outline-none focus:border-[#56B7A5] focus:bg-white transition-all resize-none"
            />
            <p className="text-[10px] text-[#808181] mt-1">
              Ficará registrada no item e no memorando de cálculo do cenário.
            </p>
          </div>

          <div className="space-y-2 pt-1">
            <p className="text-[11px] font-semibold text-[#404040]">Aplicar em</p>
            <label
              className={cn(
                "flex items-start gap-2 rounded-lg border p-2.5 cursor-pointer transition-all",
                mode === "fork"
                  ? "border-[#56B7A5] bg-[#E6F3EE]"
                  : "border-[#E0E4E3] hover:border-[#A9D7CD]"
              )}
            >
              <input
                type="radio"
                name="exclude-mode"
                checked={mode === "fork"}
                onChange={() => setMode("fork")}
                disabled={saving}
                className="mt-0.5"
              />
              <div className="flex-1">
                <p className="text-xs font-bold text-[#030304]">Criar novo cenário</p>
                <p className="text-[11px] text-[#808181]">
                  Mantém o cenário atual intocado. Cria uma cópia sem este item.
                </p>
              </div>
            </label>
            <label
              className={cn(
                "flex items-start gap-2 rounded-lg border p-2.5 cursor-pointer transition-all",
                mode === "update"
                  ? "border-[#56B7A5] bg-[#E6F3EE]"
                  : "border-[#E0E4E3] hover:border-[#A9D7CD]"
              )}
            >
              <input
                type="radio"
                name="exclude-mode"
                checked={mode === "update"}
                onChange={() => setMode("update")}
                disabled={saving}
                className="mt-0.5"
              />
              <div className="flex-1">
                <p className="text-xs font-bold text-[#030304]">Atualizar cenário atual</p>
                <p className="text-[11px] text-[#808181]">
                  Remove o item de <span className="font-semibold">{activeScenarioName}</span> e recalcula.
                </p>
              </div>
            </label>
          </div>

          {mode === "fork" && (
            <div>
              <label className="block text-[11px] font-semibold text-[#404040] mb-1">
                Nome do novo cenário
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={saving}
                className="w-full h-9 px-3 rounded-lg border border-[#E0E4E3] text-xs text-[#030304] bg-[#F8FAF9] focus:outline-none focus:border-[#56B7A5] focus:bg-white transition-all"
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-[#E0E4E3] bg-[#F8FAF9] rounded-b-xl">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
          <Button
            size="sm"
            disabled={!canSubmit}
            onClick={() =>
              onConfirm({
                justification: justification.trim(),
                mode,
                newScenarioName: mode === "fork" ? name.trim() : undefined,
              })
            }
          >
            {saving ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Excluindo…
              </>
            ) : (
              <>
                <Ban size={14} />
                Desconsiderar
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
