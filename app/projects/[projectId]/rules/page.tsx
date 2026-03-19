"use client";
import { useState, useEffect, useCallback } from "react";
import { listFactorRules, deleteFactorRule, type FactorRuleResponse } from "@/lib/api/factor-rules";
import { listEquipmentRules, deleteEquipmentRule, type EquipmentRuleResponse } from "@/lib/api/equipment-rules";
import { Button } from "@/components/ui/button";
import { BookOpen, Trash2, Loader2, Database, Fuel } from "lucide-react";

const TIER_LABELS: Record<string, { label: string; color: string }> = {
  ecoinvent: { label: "Ecoinvent", color: "bg-blue-50 text-blue-700" },
  ghg_protocol: { label: "GHG Protocol", color: "bg-emerald-50 text-emerald-700" },
  cecarbon: { label: "CECarbon", color: "bg-amber-50 text-amber-700" },
  user_custom: { label: "Manual", color: "bg-purple-50 text-purple-700" },
};

const FUEL_LABELS: Record<string, string> = {
  diesel: "Diesel",
  gasoline: "Gasolina",
  electric: "Elétrico",
  glp: "GLP",
  none: "Sem combustão",
};

export default function RulesPage() {
  const [rules, setRules] = useState<FactorRuleResponse[]>([]);
  const [eqRules, setEqRules] = useState<EquipmentRuleResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadRules = useCallback(async () => {
    setLoading(true);
    try {
      const [factors, equipment] = await Promise.all([listFactorRules(), listEquipmentRules()]);
      setRules(factors);
      setEqRules(equipment);
    } catch {
      console.error("Erro ao carregar regras");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  const handleDelete = async (ruleId: string, type: "factor" | "equipment" = "factor") => {
    if (!confirm("Desativar esta regra? Ela não será mais aplicada em futuros imports.")) return;
    setDeleting(ruleId);
    try {
      if (type === "equipment") {
        await deleteEquipmentRule(ruleId);
      } else {
        await deleteFactorRule(ruleId);
      }
      await loadRules();
    } catch {
      alert("Erro ao desativar regra");
    }
    setDeleting(null);
  };

  return (
    <div className="p-7">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#030304] mb-1 flex items-center gap-2">
            <BookOpen size={20} className="text-[#56B7A5]" />
            Regras Salvas
          </h1>
          <p className="text-sm text-[#808181]">
            Fatores de emissão salvos para reutilização automática em futuros imports e auto-maps
          </p>
        </div>
      </div>

      {/* Info banner */}
      <div className="bg-[#E6F3EE] rounded-lg px-4 py-3 mb-6 text-xs text-[#1d7a6b] flex items-start gap-2">
        <Database size={14} className="mt-0.5 shrink-0" />
        <p>
          Quando você confirma um fator de emissão e marca &ldquo;Salvar como regra&rdquo;,
          itens com descrição similar serão mapeados automaticamente no próximo Auto-Map ou importação.
          As regras têm prioridade máxima na hierarquia de busca.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-[#808181]">
          <Loader2 className="animate-spin mr-2" size={18} />
          Carregando regras...
        </div>
      ) : rules.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E0E4E3] p-12 text-center">
          <BookOpen size={32} className="mx-auto mb-3 text-[#BDBDBC]" />
          <p className="text-sm text-[#808181] mb-1">Nenhuma regra salva ainda</p>
          <p className="text-xs text-[#BDBDBC]">
            Vá em Itens → selecione um item → Editar Fator de Emissão → marque &ldquo;Salvar como regra&rdquo;
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#E0E4E3] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#F8FAF9] border-b border-[#E0E4E3]">
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#808181] uppercase tracking-wide">
                  Descrição Original
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#808181] uppercase tracking-wide">
                  Keyword
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#808181] uppercase tracking-wide">
                  Fator
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#808181] uppercase tracking-wide">
                  Fonte
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-[#808181] uppercase tracking-wide">
                  Aplicações
                </th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => {
                const tier = TIER_LABELS[rule.source_tier] || { label: rule.source_tier, color: "bg-gray-50 text-gray-700" };
                return (
                  <tr key={rule.id} className="border-b border-[#F0F4F3] hover:bg-[#FAFCFB] transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-[#030304] text-sm">{rule.original_description}</p>
                    </td>
                    <td className="px-4 py-3">
                      <code className="text-xs bg-[#F3F4F6] px-1.5 py-0.5 rounded text-[#404040]">
                        {rule.match_keyword}
                      </code>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-[#030304]">{rule.factor_name}</p>
                      <p className="text-xs text-[#808181]">
                        {rule.factor_value.toLocaleString("pt-BR")} {rule.factor_unit}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${tier.color}`}>
                        {tier.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm font-bold text-[#030304]">{rule.times_applied}</span>
                    </td>
                    <td className="px-2 py-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(rule.id)}
                        disabled={deleting === rule.id}
                        className="text-[#BDBDBC] hover:text-[#DC2626] p-1 h-auto"
                      >
                        {deleting === rule.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Trash2 size={14} />
                        )}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Equipment Rules Section */}
      {!loading && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-[#808181] uppercase tracking-wide mb-4 flex items-center gap-2">
            <Fuel size={14} />
            Regras de Equipamentos (Tipo E)
          </h2>

          {eqRules.length === 0 ? (
            <div className="bg-white rounded-xl border border-[#E0E4E3] p-8 text-center">
              <Fuel size={24} className="mx-auto mb-2 text-[#BDBDBC]" />
              <p className="text-xs text-[#808181]">
                Nenhuma regra de equipamento salva. Configure um item Tipo E para criar.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-[#E0E4E3] overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F8FAF9] border-b border-[#E0E4E3]">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#808181] uppercase tracking-wide">
                      Categoria
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#808181] uppercase tracking-wide">
                      Combustível
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#808181] uppercase tracking-wide">
                      Consumo
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#808181] uppercase tracking-wide">
                      Fator
                    </th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-[#808181] uppercase tracking-wide">
                      Scope
                    </th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-[#808181] uppercase tracking-wide">
                      Uso
                    </th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {eqRules.map((rule) => (
                    <tr key={rule.id} className="border-b border-[#F0F4F3] hover:bg-[#FAFCFB] transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-[#030304] text-sm capitalize">{rule.category}</p>
                        <p className="text-[11px] text-[#808181]">{rule.original_description}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs">{FUEL_LABELS[rule.fuel_type] || rule.fuel_type}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-mono">{rule.consumption_per_hour} {rule.consumption_unit}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-mono">{rule.emission_factor_value} {rule.emission_factor_unit}</span>
                        <p className="text-[10px] text-[#808181]">{rule.emission_factor_source}</p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-xs">{rule.scope}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm font-bold">{rule.times_applied}</span>
                      </td>
                      <td className="px-2 py-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(rule.id, "equipment")}
                          disabled={deleting === rule.id}
                          className="text-[#BDBDBC] hover:text-[#DC2626] p-1 h-auto"
                        >
                          {deleting === rule.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Trash2 size={14} />
                          )}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
