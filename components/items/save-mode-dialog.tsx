"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Loader2, GitBranch, Pencil, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

export type SaveMode = "fork" | "update";

export interface SaveModeChoice {
  mode: SaveMode;
  newScenarioName?: string;
  /** New unit cost for the substituted product. `null` means "no change
   *  from the original ABC cost"; a number sets scenario_items.unit_cost_override. */
  unitCostOverride?: number | null;
}

interface SaveModeDialogProps {
  open: boolean;
  /** Scenario the user is currently viewing, used for default name suggestion. */
  activeScenarioName: string;
  /** Short summary of the change, e.g. the new factor's name. */
  changeLabel: string;
  saving?: boolean;
  /** When true, the dialog renders the cost-change section. Pass `true`
   *  for EPD substitutions where the product price typically differs. */
  askCostChange?: boolean;
  /** Original unit cost from abc_items.unit_cost (R$ per unit). */
  currentUnitCost?: number;
  /** Item unit for display next to the cost field (e.g. "m³", "kg"). */
  itemUnit?: string;
  /** Quantity for the live delta computation (`(new − old) × qty`). */
  itemQuantity?: number;
  onCancel: () => void;
  onConfirm: (choice: SaveModeChoice) => void;
}

export function SaveModeDialog({
  open,
  activeScenarioName,
  changeLabel,
  saving,
  askCostChange,
  currentUnitCost,
  itemUnit,
  itemQuantity,
  onCancel,
  onConfirm,
}: SaveModeDialogProps) {
  const defaultName = `${activeScenarioName} + ${changeLabel}`.slice(0, 80);
  // The parent remounts the dialog (via `key`) whenever a new save is
  // pending, so initialising state lazily here is enough — no effect needed.
  const [mode, setMode] = useState<SaveMode>("fork");
  const [name, setName] = useState(defaultName);
  const [costChanged, setCostChanged] = useState(false);
  const [newCostStr, setNewCostStr] = useState<string>(
    currentUnitCost != null ? String(currentUnitCost) : "",
  );

  if (!open) return null;

  const newCostNum = costChanged ? parseFloat(newCostStr.replace(",", ".")) : NaN;
  const newCostValid = costChanged && Number.isFinite(newCostNum) && newCostNum >= 0;
  const deltaPerUnit = newCostValid && currentUnitCost != null
    ? newCostNum - currentUnitCost
    : null;
  const deltaTotal = deltaPerUnit != null && itemQuantity != null
    ? deltaPerUnit * itemQuantity
    : null;

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

          {askCostChange && currentUnitCost != null && (
            <div className="pt-2 border-t border-[#F0F4F3]">
              <div className="flex items-start gap-2 mb-2">
                <DollarSign size={14} className="text-[#56B7A5] mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-xs font-bold text-[#030304]">Custo do produto substituído</p>
                  <p className="text-[11px] text-[#808181] mt-0.5">
                    O novo fator vem com preço diferente do orçamento? Declare aqui pro cenário refletir o ΔR$.
                  </p>
                </div>
              </div>
              <label className="flex items-center gap-2 text-[11px] text-[#404040]">
                <input
                  type="checkbox"
                  className="accent-[#56B7A5]"
                  checked={costChanged}
                  onChange={(e) => setCostChanged(e.target.checked)}
                  disabled={saving}
                />
                Mudar o custo unitário (atual:{" "}
                <span className="font-semibold text-[#030304]">
                  {currentUnitCost.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                    maximumFractionDigits: 2,
                  })}
                </span>
                {itemUnit ? <> / {itemUnit}</> : null})
              </label>
              {costChanged && (
                <div className="mt-2 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-[#808181]">Novo custo unitário</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={newCostStr}
                      onChange={(e) => setNewCostStr(e.target.value)}
                      disabled={saving}
                      className="flex-1 h-8 px-2.5 rounded-lg border border-[#E0E4E3] text-xs text-[#030304] bg-white focus:outline-none focus:border-[#56B7A5]"
                      placeholder={String(currentUnitCost)}
                    />
                    {itemUnit && <span className="text-[11px] text-[#808181]">R$ / {itemUnit}</span>}
                  </div>
                  {newCostValid && deltaTotal != null && (
                    <p className="text-[11px] leading-snug">
                      <span className="text-[#808181]">Variação total: </span>
                      <span className={cn("font-semibold",
                        deltaTotal > 0 ? "text-[#DC2626]" : deltaTotal < 0 ? "text-[#16A34A]" : "text-[#404040]"
                      )}>
                        {deltaTotal > 0 ? "+" : ""}
                        {deltaTotal.toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                          maximumFractionDigits: 0,
                        })}
                      </span>
                      {itemQuantity != null && (
                        <span className="text-[10px] text-[#808181] ml-1">
                          ({(deltaPerUnit ?? 0) >= 0 ? "+" : ""}
                          {(deltaPerUnit ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}{" "}
                          R$ × {itemQuantity.toLocaleString("pt-BR")} {itemUnit ?? ""})
                        </span>
                      )}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-[#E0E4E3] bg-[#F8FAF9] rounded-b-xl">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
          <Button
            size="sm"
            disabled={
              saving ||
              (mode === "fork" && !name.trim()) ||
              (costChanged && !newCostValid)
            }
            onClick={() =>
              onConfirm({
                mode,
                newScenarioName: mode === "fork" ? name.trim() : undefined,
                unitCostOverride: costChanged && newCostValid ? newCostNum : null,
              })
            }
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
