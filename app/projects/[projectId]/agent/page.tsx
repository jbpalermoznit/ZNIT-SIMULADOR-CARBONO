"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { AgentChat } from "@/components/agent/agent-chat";
import { getPendingSummary, type PendingSummary } from "@/lib/api/agent";

export default function AgentPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [summary, setSummary] = useState<PendingSummary | null>(null);

  useEffect(() => {
    getPendingSummary(projectId).then(setSummary).catch(() => {});
  }, [projectId]);

  const typeLabels: Record<string, string> = {
    B: "Mão de Obra", C: "Item Agrupado", D: "Material Embutido",
    E: "Equipamento", F: "Administrativo", A: "Material Direto",
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="px-7 py-5 border-b border-[#E0E4E3] bg-white">
        <p className="text-xs font-semibold text-[#808181] uppercase tracking-widest mb-0.5">
          Agente ZNIT
        </p>
        <h1 className="text-xl font-bold text-[#030304]">Agente de Parametrização IA</h1>
        <p className="text-sm text-[#808181] mt-0.5">
          {summary
            ? `${summary.total_pending} itens pendentes · ${Object.entries(summary.by_type).map(([t, n]) => `${n} ${typeLabels[t] || t}`).join(", ")}`
            : "Carregando..."
          }
        </p>
      </div>

      {/* Agent Chat */}
      <div className="flex-1 min-h-0">
        <AgentChat projectId={projectId} summary={summary} />
      </div>
    </div>
  );
}
