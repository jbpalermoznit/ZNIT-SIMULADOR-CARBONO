"use client";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Send, Bot, Sparkles, CheckCircle2, X, Loader2,
  Zap, AlertTriangle, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  resolveItems, applyDecisions, getPendingSummary,
  type PendingSummary, type AgentDecision, type ResolveResponse,
} from "@/lib/api/agent";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  decisions?: AgentDecision[];
}

const TYPE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  B: { bg: "#FEF3C7", text: "#92400e", label: "Mão de Obra" },
  C: { bg: "#EDE9FE", text: "#7c3aed", label: "Item Agrupado" },
  D: { bg: "#FFE4E6", text: "#be123c", label: "Material Embutido" },
  E: { bg: "#DBEAFE", text: "#1e40af", label: "Equipamento" },
  F: { bg: "#F3F4F6", text: "#4b5563", label: "Administrativo" },
  A: { bg: "#E6F3EE", text: "#1d7a6b", label: "Material Direto" },
};

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  exclude:        { label: "Excluir",    color: "#808181" },
  map_factor:     { label: "Mapear",     color: "#1d7a6b" },
  equipment_calc: { label: "Equipamento", color: "#1e40af" },
  decompose:      { label: "Decompor",   color: "#7c3aed" },
};

export function AgentChat({
  projectId,
  summary: initialSummary,
}: {
  projectId: string;
  summary: PendingSummary | null;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [summary, setSummary] = useState<PendingSummary | null>(initialSummary);
  const chatEnd = useRef<HTMLDivElement>(null);

  useEffect(() => { setSummary(initialSummary); }, [initialSummary]);

  async function refreshSummary() {
    try {
      const s = await getPendingSummary(projectId);
      setSummary(s);
    } catch {}
  }

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // ── Send message ──────────────────────────────────────────────────────────

  async function handleSend(message?: string, itemType?: string, itemIds?: string[]) {
    const text = message || input.trim();
    if (!text || loading) return;
    setInput("");

    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);

    try {
      // Build conversation history from previous messages
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const resp: ResolveResponse = await resolveItems(projectId, text, itemType, itemIds, history);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: resp.agent_response,
          decisions: resp.decisions.map((d) => ({ ...d, accepted: false, rejected: false })),
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Erro ao consultar o agente. Verifique a conexão." },
      ]);
    }
    setLoading(false);
  }

  // ── Accept / Reject decisions ─────────────────────────────────────────────

  function toggleDecision(msgIdx: number, decIdx: number, accepted: boolean) {
    setMessages((prev) =>
      prev.map((m, mi) => {
        if (mi !== msgIdx || !m.decisions) return m;
        return {
          ...m,
          decisions: m.decisions.map((d, di) =>
            di === decIdx ? { ...d, accepted, rejected: !accepted } : d
          ),
        };
      })
    );
  }

  async function handleApplyAll(msgIdx: number, applyAll = false) {
    const msg = messages[msgIdx];
    if (!msg?.decisions) return;

    const accepted = applyAll ? msg.decisions : msg.decisions.filter((d) => d.accepted);
    if (accepted.length === 0) return;

    setApplying(true);
    try {
      const result = await applyDecisions(projectId, accepted);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Aplicado com sucesso: ${result.resolved} itens resolvidos, ${result.excluded} excluídos, ${result.rules_saved} regras salvas.${result.errors.length > 0 ? ` Erros: ${result.errors.join(", ")}` : ""}`,
        },
      ]);
      await refreshSummary();
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Erro ao aplicar decisões." },
      ]);
    }
    setApplying(false);
  }

  function acceptAll(msgIdx: number) {
    setMessages((prev) =>
      prev.map((m, mi) => {
        if (mi !== msgIdx || !m.decisions) return m;
        return {
          ...m,
          decisions: m.decisions.map((d) => ({ ...d, accepted: true, rejected: false })),
        };
      })
    );
  }

  // ── Quick action buttons ──────────────────────────────────────────────────

  const quickActions = [
    { label: "Resolver Tipo A (Materiais)", msg: "Resolva todos os itens Tipo A pendentes. Busque o melhor fator de emissão no CECarbon ou Ecoinvent.", type: "A" },
    { label: "Resolver Tipo B (Mão de Obra)", msg: "Resolva todos os itens Tipo B. Exclua do inventário com justificativa padrão.", type: "B" },
    { label: "Resolver Tipo C (Agrupados)", msg: "Resolva todos os itens Tipo C. Analise cada um e sugira decomposição ou exclusão com justificativa.", type: "C" },
    { label: "Resolver Tipo D (Dupla Contagem)", msg: "Analise todos os itens Tipo D e verifique dupla contagem com itens Tipo A.", type: "D" },
    { label: "Resolver Tipo E (Equipamentos)", msg: "Resolva todos os itens Tipo E usando perfis de equipamento padrão.", type: "E" },
    { label: "Resolver Tipo F (Administrativo)", msg: "Resolva todos os itens Tipo F. Exclua do inventário com justificativa padrão.", type: "F" },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full">
      {/* Left panel — pending items */}
      <div className="w-72 border-r border-[#E0E4E3] bg-white flex flex-col">
        <div className="px-4 py-3 border-b border-[#E0E4E3]">
          <p className="text-xs font-semibold text-[#808181] uppercase tracking-widest">
            Itens Pendentes
          </p>
          <p className="text-2xl font-bold text-[#030304] mt-1">
            {summary?.total_pending ?? "—"}
          </p>
        </div>

        {/* Quick actions */}
        <div className="px-3 py-2 border-b border-[#E0E4E3] space-y-1">
          {quickActions.map((qa) => {
            const count = summary?.by_type[qa.type] ?? 0;
            if (count === 0) return null;
            return (
              <button
                key={qa.type}
                onClick={() => handleSend(qa.msg, qa.type)}
                disabled={loading}
                className="w-full text-left px-3 py-2 rounded text-xs font-medium hover:bg-[#F8FAF9] transition-all flex items-center gap-2"
              >
                <Zap size={12} className="text-[#56B7A5]" />
                <span className="flex-1">{qa.label}</span>
                <span className="text-[10px] font-bold text-[#808181] bg-[#F3F4F6] px-1.5 py-0.5 rounded">
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Item list */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          {summary?.items.map((item) => {
            const tc = TYPE_COLORS[item.item_type] || TYPE_COLORS.A;
            return (
              <button
                key={item.id}
                onClick={() => handleSend(
                  `Analise e resolva este item específico: "${item.description}" (Tipo ${item.item_type}, ${item.quantity} ${item.unit}, R$ ${item.total_cost.toLocaleString("pt-BR")})`,
                  undefined,
                  [item.id]
                )}
                disabled={loading}
                className="w-full text-left px-3 py-2 rounded hover:bg-[#E6F3EE] transition-all cursor-pointer"
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span
                    className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: tc.bg, color: tc.text }}
                  >
                    {item.item_type}
                  </span>
                  <span className="text-[10px] text-[#808181] truncate">{item.cost_code}</span>
                </div>
                <p className="text-xs text-[#030304] truncate">{item.description}</p>
                <p className="text-[10px] text-[#808181]">
                  R$ {item.total_cost.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right panel — chat */}
      <div className="flex-1 flex flex-col bg-[#F8FAF9]">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Welcome message */}
          {messages.length === 0 && !loading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-[#56B7A5] flex items-center justify-center shrink-0">
                <Bot size={16} className="text-white" />
              </div>
              <div className="bg-white rounded-lg border border-[#E0E4E3] px-4 py-3 max-w-2xl">
                <p className="text-sm text-[#030304]">
                  Olá! Sou o <strong>Agente ZNIT</strong>. Posso ajudar a resolver os{" "}
                  <strong>{summary?.total_pending ?? 0} itens pendentes</strong> do seu projeto.
                </p>
                <p className="text-sm text-[#808181] mt-2">
                  Use os botões rápidos na barra lateral ou me diga o que deseja resolver.
                </p>
              </div>
            </div>
          )}

          {messages.map((msg, msgIdx) => (
            <div key={msgIdx}>
              {/* Message bubble */}
              <div className={cn("flex gap-3", msg.role === "user" && "justify-end")}>
                {msg.role === "assistant" && (
                  <div className="w-8 h-8 rounded-full bg-[#56B7A5] flex items-center justify-center shrink-0">
                    <Bot size={16} className="text-white" />
                  </div>
                )}
                <div
                  className={cn(
                    "rounded-lg px-4 py-3 max-w-2xl text-sm",
                    msg.role === "user"
                      ? "bg-[#030304] text-white"
                      : "bg-white border border-[#E0E4E3] text-[#030304]"
                  )}
                >
                  {msg.content}
                </div>
              </div>

              {/* Action cards */}
              {msg.decisions && msg.decisions.length > 0 && (
                <div className="ml-11 mt-3 space-y-2">
                  {/* Batch controls */}
                  <div className="flex items-center gap-2 mb-2">
                    <Button
                      size="sm"
                      onClick={async () => { acceptAll(msgIdx); setTimeout(() => handleApplyAll(msgIdx, true), 100); }}
                      disabled={applying}
                      className="text-xs bg-[#56B7A5] hover:bg-[#1d7a6b] text-white"
                    >
                      {applying ? (
                        <Loader2 size={12} className="mr-1 animate-spin" />
                      ) : (
                        <CheckCircle2 size={12} className="mr-1" />
                      )}
                      Aceitar e aplicar todos ({msg.decisions.length})
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleApplyAll(msgIdx)}
                      disabled={applying || !msg.decisions.some((d) => d.accepted)}
                      className="text-xs"
                    >
                      <Sparkles size={12} className="mr-1" />
                      Aplicar selecionados
                    </Button>
                  </div>

                  {/* Individual decision cards */}
                  {msg.decisions.map((dec, decIdx) => {
                    const actionMeta = ACTION_LABELS[dec.action] || ACTION_LABELS.exclude;
                    return (
                      <div
                        key={decIdx}
                        className={cn(
                          "bg-white border rounded-lg px-4 py-3 transition-all",
                          dec.accepted && "border-[#56B7A5] bg-[#F0FAF7]",
                          dec.rejected && "border-[#E0E4E3] opacity-50",
                          !dec.accepted && !dec.rejected && "border-[#E0E4E3]"
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            {/* Action badge */}
                            <div className="flex items-center gap-2 mb-1">
                              <span
                                className="text-[10px] font-bold px-2 py-0.5 rounded"
                                style={{ backgroundColor: actionMeta.color + "15", color: actionMeta.color }}
                              >
                                {actionMeta.label}
                              </span>
                              {dec.source_tier && (
                                <span className="text-[10px] text-[#808181]">
                                  Fonte: {dec.source_tier}
                                </span>
                              )}
                              {dec.save_as_rule && (
                                <span className="text-[10px] text-[#7c3aed] bg-[#EDE9FE] px-1.5 py-0.5 rounded">
                                  Salvar regra
                                </span>
                              )}
                            </div>

                            {/* Factor details */}
                            {dec.factor_value != null && dec.factor_value > 0 && (
                              <p className="text-xs font-medium text-[#030304]">
                                {dec.factor_name} — {dec.factor_value.toLocaleString("pt-BR")} {dec.factor_unit}
                              </p>
                            )}

                            {/* Equipment details */}
                            {dec.equipment_config && (
                              <p className="text-xs text-[#030304]">
                                {dec.equipment_config.fuel_type} · {dec.equipment_config.consumption_per_hour} {dec.equipment_config.consumption_unit} × {dec.equipment_config.emission_factor} kgCO₂/{dec.equipment_config.consumption_unit.replace("/h", "")}
                              </p>
                            )}

                            {/* Justification */}
                            <p className="text-xs text-[#808181] mt-1">{dec.justification}</p>
                          </div>

                          {/* Accept/Reject buttons */}
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => toggleDecision(msgIdx, decIdx, true)}
                              className={cn(
                                "w-7 h-7 rounded flex items-center justify-center transition-all",
                                dec.accepted
                                  ? "bg-[#56B7A5] text-white"
                                  : "bg-[#F3F4F6] text-[#808181] hover:bg-[#E6F3EE] hover:text-[#1d7a6b]"
                              )}
                            >
                              <CheckCircle2 size={14} />
                            </button>
                            <button
                              onClick={() => toggleDecision(msgIdx, decIdx, false)}
                              className={cn(
                                "w-7 h-7 rounded flex items-center justify-center transition-all",
                                dec.rejected
                                  ? "bg-[#DC2626] text-white"
                                  : "bg-[#F3F4F6] text-[#808181] hover:bg-[#FFE4E6] hover:text-[#be123c]"
                              )}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}

          {/* Loading indicator */}
          {loading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-[#56B7A5] flex items-center justify-center shrink-0">
                <Bot size={16} className="text-white" />
              </div>
              <div className="bg-white rounded-lg border border-[#E0E4E3] px-4 py-3 flex items-center gap-2">
                <Loader2 size={14} className="animate-spin text-[#56B7A5]" />
                <span className="text-sm text-[#808181]">Analisando itens com Gemini AI...</span>
              </div>
            </div>
          )}

          <div ref={chatEnd} />
        </div>

        {/* Input */}
        <div className="px-6 py-4 border-t border-[#E0E4E3] bg-white">
          <form
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ex: Resolva os itens tipo B e F, exclua do inventário..."
              className="flex-1 px-4 py-2.5 rounded-lg border border-[#E0E4E3] text-sm focus:outline-none focus:ring-2 focus:ring-[#56B7A5] focus:border-transparent"
              disabled={loading}
            />
            <Button
              type="submit"
              disabled={loading || !input.trim()}
              className="bg-[#56B7A5] hover:bg-[#1d7a6b] text-white px-4"
            >
              <Send size={16} />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
