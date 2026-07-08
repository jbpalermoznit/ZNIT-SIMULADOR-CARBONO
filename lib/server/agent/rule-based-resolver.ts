/**
 * Local rule-based resolver — fallback when Gemini is unavailable.
 * Replaces backend/app/services/agent/rule_based_resolver.py
 */

interface PendingItem {
  item_id: string;
  cost_code: string;
  description: string;
  quantity: number;
  unit: string;
  total_cost: number;
  item_type: string;
  abc_class: string;
  mapping_status: string;
}

interface Decision {
  item_id: string;
  action: string;
  justification: string;
  save_as_rule: boolean;
  factor_value?: number;
  factor_unit?: string;
  factor_name?: string;
  source_tier?: string;
  equipment_config?: Record<string, unknown>;
}

/**
 * Perfis de equipamento: consumo/hora fixo por categoria; o fator de emissão
 * do diesel é injetado pelo caller a partir das tabelas Supabase
 * (canonical-factors.getDieselFactor) — não hardcoded aqui.
 */
function buildEquipmentProfiles(
  dieselFactor: number
): Record<string, Record<string, unknown> | null> {
  const diesel = (consumption: number) => ({
    fuel_type: "diesel",
    consumption_per_hour: consumption,
    consumption_unit: "L/h",
    emission_factor: dieselFactor,
    emission_factor_unit: "kgCO₂/L",
  });
  return {
    retroescavadeira: diesel(12),
    escavadeira: diesel(20),
    caminhão: diesel(15),
    basculante: diesel(15),
    guindaste: diesel(25),
    solda: { fuel_type: "electric", consumption_per_hour: 8, consumption_unit: "kWh/h", emission_factor: 0.10, emission_factor_unit: "kgCO₂/kWh" },
    andaime: null,
  };
}

function matchEquipmentProfile(
  description: string,
  profiles: Record<string, Record<string, unknown> | null>
): Record<string, unknown> | null {
  const descLower = description.toLowerCase();
  for (const [keyword, profile] of Object.entries(profiles)) {
    if (descLower.includes(keyword)) return profile;
  }
  return null;
}

export function resolveLocally(
  pendingItems: PendingItem[],
  userMessage: string,
  options: { dieselFactor: number },
): { agent_response: string; decisions: Decision[] } {
  const decisions: Decision[] = [];
  const msgLower = userMessage.toLowerCase();
  const equipmentProfiles = buildEquipmentProfiles(options.dieselFactor);

  const resolveTypes = new Set<string>();
  if (msgLower.includes("tipo b") || msgLower.includes("mão de obra") || msgLower.includes("mao de obra")) resolveTypes.add("B");
  if (msgLower.includes("tipo c") || msgLower.includes("agrupado")) resolveTypes.add("C");
  if (msgLower.includes("tipo d") || msgLower.includes("dupla") || msgLower.includes("embutido")) resolveTypes.add("D");
  if (msgLower.includes("tipo e") || msgLower.includes("equipamento")) resolveTypes.add("E");
  if (msgLower.includes("tipo f") || msgLower.includes("administrativo")) resolveTypes.add("F");
  if (msgLower.includes("tudo") || msgLower.includes("todos")) {
    ["B", "C", "D", "E", "F"].forEach((t) => resolveTypes.add(t));
  }

  for (const item of pendingItems) {
    const itemType = item.item_type;
    if (resolveTypes.size > 0 && !resolveTypes.has(itemType)) continue;

    if (itemType === "B") {
      decisions.push({
        item_id: item.item_id, action: "exclude",
        justification: "Mão de obra — excluída conforme escopo operacional (GHG Protocol, Scope 1+2+3 materiais).",
        save_as_rule: true,
      });
    } else if (itemType === "F") {
      decisions.push({
        item_id: item.item_id, action: "exclude",
        justification: "Custo administrativo/indireto — excluído conforme escopo. Sem emissão direta de carbono associada.",
        save_as_rule: true,
      });
    } else if (itemType === "E") {
      const profile = matchEquipmentProfile(item.description, equipmentProfiles);
      if (!profile) {
        decisions.push({
          item_id: item.item_id, action: "exclude",
          justification: "Equipamento passivo (sem consumo de combustível) — excluído do inventário.",
          save_as_rule: true,
        });
      } else {
        decisions.push({
          item_id: item.item_id, action: "equipment_calc",
          justification: `Equipamento: ${profile.fuel_type}, ${profile.consumption_per_hour} ${profile.consumption_unit} × ${profile.emission_factor} ${profile.emission_factor_unit}`,
          save_as_rule: true,
          equipment_config: profile,
        });
      }
    } else if (itemType === "D") {
      decisions.push({
        item_id: item.item_id, action: "exclude",
        justification: "Material embutido em serviço — verificar dupla contagem com itens Tipo A. Excluído por precaução.",
        save_as_rule: false,
      });
    } else if (itemType === "C") {
      decisions.push({
        item_id: item.item_id, action: "exclude",
        justification: `Item agrupado (subempreitada) — requer decomposição manual. Custo: R$ ${item.total_cost.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}. Excluído temporariamente.`,
        save_as_rule: false,
      });
    }
  }

  const typeCounts: Record<string, number> = {};
  for (const d of decisions) {
    typeCounts[d.action] = (typeCounts[d.action] ?? 0) + 1;
  }

  const parts: string[] = [];
  if (typeCounts.exclude) parts.push(`${typeCounts.exclude} itens excluídos`);
  if (typeCounts.map_factor) parts.push(`${typeCounts.map_factor} itens mapeados`);
  if (typeCounts.equipment_calc) parts.push(`${typeCounts.equipment_calc} equipamentos calculados`);

  const agentResponse = decisions.length > 0
    ? `Análise concluída para ${decisions.length} itens. ${parts.join(", ")}. Revise as decisões e clique 'Aceitar todos' para aplicar.`
    : "Nenhum item encontrado para resolver com os critérios informados.";

  return { agent_response: agentResponse, decisions };
}
