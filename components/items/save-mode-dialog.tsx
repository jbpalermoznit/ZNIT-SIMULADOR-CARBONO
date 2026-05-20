"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Loader2, GitBranch, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

export type SaveMode = "fork" | "update";

export interface SaveModeChoice {
  mode: SaveMode;
  newScenarioName?: string;
}

interface SaveModeDialogProps {
  open: boolean;
  /** Scenario the user is currently viewing, used for default name suggestion. */
  activeScenarioName: string;
  /** Short summary of the change, e.g. the new factor's name. */
  changeLabel: string;
  saving?: boolean;
  onCancel: () => void;
  onConfirm: (choice: SaveModeChoice) => void;
}

export function SaveModeDialog({
  open,
  activeScenarioName,
  changeLabel,
  saving,
  onCancel,
  onConfirm,
}: SaveModeDialogProps) {
  const defaultName = `${activeScenarioName} + ${changeLabel}`.slice(0, 80);
  // The parent remounts the dialog (via `key`) whenever a new save is
  // pending, so initialising state lazily here is enough — no effect needed.
  const [mode, setMode] = useState<SaveMode>("fork");
  const [name, setName] = useState(defaultName);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl border border-[#E0E4E3] shadow-[0_8px_32px_rgba(3,3,4,0.16)] w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E0E4E3]">
          <h2 className="text-sm font-bold text-[#030304]">Salvar mudança</h2>
          <button
            onClick={onCancel}
            disabled={saving}
            className="text-[#808181] hover:text-[#030304] disabled:opacity-40"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <button
            type="button"
            onClick={() => setMode("fork")}
            className={cn(
              "w-full text-left rounded-lg border p-3 transition-all",
              mode === "fork"
                ? "border-[#56B7A5] bg-[#E6F3EE]"
                : "border-[#E0E4E3] hover:border-[#A9D7CD]"
            )}
          >
            <div className="flex items-start gap-2">
              <GitBranch size={14} className="mt-0.5 text-[#56B7A5]" />
              <div className="flex-1">
                <p className="text-xs font-bold text-[#030304]">Criar novo cenário</p>
                <p className="text-[11px] text-[#808181] mt-0.5">
                  Mantém o cenário atual intocado. Cria uma cópia com a mudança e calcula.
                </p>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setMode("update")}
            className={cn(
              "w-full text-left rounded-lg border p-3 transition-all",
              mode === "update"
                ? "border-[#56B7A5] bg-[#E6F3EE]"
                : "border-[#E0E4E3] hover:border-[#A9D7CD]"
            )}
          >
            <div className="flex items-start gap-2">
              <Pencil size={14} className="mt-0.5 text-[#56B7A5]" />
              <div className="flex-1">
                <p className="text-xs font-bold text-[#030304]">Atualizar cenário atual</p>
                <p className="text-[11px] text-[#808181] mt-0.5">
                  Modifica <span className="font-semibold">{activeScenarioName}</span> direto e recalcula.
                </p>
              </div>
            </div>
          </button>

          {mode === "fork" && (
            <div className="pt-1">
              <label className="block text-[11px] font-semibold text-[#404040] mb-1">
                Nome do novo cenário
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[#E0E4E3] text-xs text-[#030304] bg-[#F8FAF9] focus:outline-none focus:border-[#56B7A5] focus:bg-white transition-all"
                placeholder="Ex: Base + troca de fator"
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
            disabled={saving || (mode === "fork" && !name.trim())}
            onClick={() => onConfirm({ mode, newScenarioName: mode === "fork" ? name.trim() : undefined })}
          >
            {saving ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Salvando…
              </>
            ) : (
              "Salvar"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
