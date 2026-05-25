"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Loader2, AlertTriangle, Trash2 } from "lucide-react";
import { DELETE_PROJECT_PHRASE } from "@/lib/api/projects";

interface Props {
  open: boolean;
  projectName: string;
  saving?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Confirms a permanent project delete. The user has to type
 * DELETE_PROJECT_PHRASE exactly into the input — the Apagar button stays
 * disabled until then. This is the only guard against accidental clicks;
 * the backend re-checks the phrase before touching any data.
 */
export function DeleteProjectDialog({
  open,
  projectName,
  saving,
  onCancel,
  onConfirm,
}: Props) {
  const [typed, setTyped] = useState("");
  if (!open) return null;

  const canSubmit = !saving && typed.trim() === DELETE_PROJECT_PHRASE;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl border border-[#E0E4E3] shadow-[0_8px_32px_rgba(3,3,4,0.16)] w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E0E4E3]">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-[#DC2626]" />
            <h2 className="text-sm font-bold text-[#030304]">Apagar projeto</h2>
          </div>
          <button
            onClick={onCancel}
            disabled={saving}
            className="text-[#808181] hover:text-[#030304] disabled:opacity-40"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-[#030304]">
            Você está prestes a apagar{" "}
            <span className="font-semibold">{projectName}</span> permanentemente.
          </p>
          <p className="text-xs text-[#808181] leading-relaxed">
            Cenários, curva ABC, itens, mapeamentos e cálculos serão removidos
            e não podem ser recuperados. Faça download dos relatórios antes
            se precisar guardar a evidência.
          </p>

          <div className="pt-2">
            <label className="text-xs font-semibold text-[#030304] block mb-1.5">
              Para confirmar, digite{" "}
              <span className="font-mono bg-[#F3F4F6] px-1.5 py-0.5 rounded">
                {DELETE_PROJECT_PHRASE}
              </span>
            </label>
            <input
              type="text"
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              disabled={saving}
              placeholder={DELETE_PROJECT_PHRASE}
              className="w-full rounded-lg border border-[#E0E4E3] px-3 py-2 text-sm focus:outline-none focus:border-[#DC2626] focus:ring-1 focus:ring-[#DC2626] disabled:opacity-50"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[#E0E4E3]">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={onConfirm}
            disabled={!canSubmit}
            className="bg-[#DC2626] hover:bg-[#B91C1C] text-white disabled:bg-[#FCA5A5]"
          >
            {saving ? (
              <>
                <Loader2 size={13} className="animate-spin" /> Apagando…
              </>
            ) : (
              <>
                <Trash2 size={13} /> Apagar definitivamente
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
