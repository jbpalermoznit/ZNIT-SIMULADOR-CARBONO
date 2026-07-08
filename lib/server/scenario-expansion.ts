/**
 * Expansão de cenário (Planilha de Itens × Planilha de Insumos) — lógica
 * compartilhada entre a rota upload-scenario e o harness de validação
 * (tests/lib/server/simulation-validation.test.ts), para o teste exercitar
 * EXATAMENTE o que roda em produção.
 *
 * Fórmula: Emissões Total = Σ(Qtd_Item × Índice_Composição × Fator_Emissão)
 *
 * Todo item com receita na Planilha de Insumos é expandido — inclusive
 * materiais "diretos" como concreto usinado. O índice da composição é o
 * consumo REAL do material (inclui perdas, tipicamente 1,05); pular a
 * expansão fazia o item ficar com a descrição da Solução (que não casa as
 * Factor Rules geradas das descrições de insumo) e perdia os insumos
 * secundários da receita (cimento, aditivo expansor) — foi o buraco de
 * ~500 tCO₂e de concreto encontrado na validação contra o relatório v29.
 * Insumos não-construtivos (bombeamento, refeição, etc.) já são filtrados
 * no parser-insumos.
 */
import { classifyType, type ParsedItem } from "./parser";
import type { RecipeMap } from "./parser-insumos";
import {
  shouldAutoExcludeType,
  autoExclusionReason,
  type ItemType,
} from "./cost-code-classifier";

export interface ExpandedItem {
  /** Sufixo estável para compor o id no banco: "p<n>" (pai) ou "c<n>" (filho). */
  key: string;
  cost_code: string;
  description: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  total_cost: number;
  cost_pct: number;
  cumulative_pct: number;
  abc_class: string;
  item_type: string;
  item_order: number;
  mapping_status: "pending" | "excluded" | "blocked";
  parent_key: string | null;
  classification_note: string;
}

export interface ExpandedScenario {
  parents: ExpandedItem[];
  children: ExpandedItem[];
}

/**
 * Serviços/mão-de-obra/montagem/equipamento (Tipo B/D/E/F via classifyType)
 * NÃO são materiais: não devem casar um fator de material bruto. Sem isto,
 * itens como "FABRICACAO E MONTAGEM DE PRE-MOLDADO" (material já contado em
 * linhas próprias de aço/concreto) ou "PINTURA"/"APLICACAO DE ..." casavam
 * fator de concreto/tinta e inflavam/duplicavam o total. Marcamos como
 * excluído → o calculador os ignora. Ver docs/PARIDADE_SIMULADOR.md.
 */
function serviceExclusion(
  costCode: string,
  description: string,
  unit: string
): { item_type: ItemType; note: string } | null {
  const [t] = classifyType(costCode, description, unit);
  const type = t as ItemType;
  if (type !== "A" && shouldAutoExcludeType(type)) {
    return { item_type: type, note: autoExclusionReason(type) };
  }
  return null;
}

export function expandScenarioItems(
  items: ParsedItem[],
  recipeMap: RecipeMap
): ExpandedScenario {
  const parents: ExpandedItem[] = [];
  const children: ExpandedItem[] = [];
  let itemOrder = 0;

  for (const item of items) {
    const qty = item.quantity;
    if (qty <= 0) continue;

    const parentKey = `p${itemOrder}`;
    const recipe = recipeMap.recipes.get(item.cost_code);

    if (recipe && recipe.length > 0) {
      // Item com receita → expande via Σ(Qtd_Item × Índice × FE)
      parents.push({
        key: parentKey,
        cost_code: item.cost_code,
        description: item.description,
        quantity: qty,
        unit: item.unit,
        unit_cost: item.unit_cost,
        total_cost: item.total_cost,
        cost_pct: item.cost_pct,
        cumulative_pct: item.cumulative_pct,
        abc_class: item.abc_class,
        item_type: "C", // pai bloqueado — filhos carregam as emissões
        item_order: itemOrder,
        mapping_status: "blocked",
        parent_key: null,
        classification_note:
          "Composição expandida via Planilha de Insumos — emissões nos itens-filho",
      });

      for (const insumo of recipe) {
        const childQty = qty * insumo.indice;
        if (childQty <= 0) continue;

        itemOrder++;
        const childSvc = serviceExclusion(
          insumo.codigo,
          insumo.descricao,
          insumo.unidade
        );
        children.push({
          key: `c${itemOrder}`,
          cost_code: insumo.codigo,
          description: insumo.descricao,
          quantity: childQty,
          unit: insumo.unidade,
          unit_cost: 0,
          total_cost: 0,
          cost_pct: 0,
          cumulative_pct: 0,
          abc_class: item.abc_class,
          item_type: childSvc ? childSvc.item_type : "A",
          item_order: itemOrder,
          mapping_status: childSvc ? "excluded" : "pending",
          parent_key: parentKey,
          classification_note: childSvc
            ? childSvc.note
            : `Insumo de ${item.description} (${qty} ${item.unit} x ${insumo.indice} ${insumo.unidade})`,
        });
      }
    } else {
      // Sem receita → item direto. Classifica primeiro: serviços/montagem/
      // equipamento (Tipo B/D/E/F) são excluídos do match de material.
      const svc = serviceExclusion(item.cost_code, item.description, item.unit);
      parents.push({
        key: parentKey,
        cost_code: item.cost_code,
        description: item.description,
        quantity: qty,
        unit: item.unit,
        unit_cost: item.unit_cost,
        total_cost: item.total_cost,
        cost_pct: item.cost_pct,
        cumulative_pct: item.cumulative_pct,
        abc_class: item.abc_class,
        item_type: svc ? svc.item_type : "A",
        item_order: itemOrder,
        mapping_status: svc ? "excluded" : "pending",
        parent_key: null,
        classification_note: svc
          ? svc.note
          : "Item direto (sem receita na Planilha de Insumos)",
      });
    }
    itemOrder++;
  }

  return { parents, children };
}
