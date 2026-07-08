/**
 * POST /api/projects/[projectId]/upload-scenario
 *
 * Upload combinado: Planilha de Itens + Planilha de Insumos.
 * Expande itens via receita (1:N), auto-mapeia materiais e cria cenário.
 *
 * Fórmula: Emissões Total = Σ(Qtd_Item × Índice_Composição × Fator_Emissão)
 */

import { NextRequest } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/server/auth";
import { supabase } from "@/lib/server/supabase";
import { parseAbcFile } from "@/lib/server/parser";
import { parseInsumoFile } from "@/lib/server/parser-insumos";
import { autoMatchItem } from "@/lib/server/emission-mapper";
import { createBaseScenario } from "@/lib/server/calculator";
import { expandScenarioItems } from "@/lib/server/scenario-expansion";

export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  let user;
  try {
    user = await getCurrentUser(req);
  } catch {
    return unauthorized();
  }

  const { projectId } = await params;

  // Verify project belongs to user's company
  const { data: project } = await supabase
    .from("projects")
    .select("id, company_id")
    .eq("id", projectId)
    .eq("company_id", user.company_id)
    .single();

  if (!project) {
    return Response.json({ detail: "Projeto não encontrado" }, { status: 404 });
  }

  // Parse multipart form
  const formData = await req.formData();
  const itemsFile = formData.get("items_file") as File | null;
  const insumosFile = formData.get("insumos_file") as File | null;
  const scenarioName =
    (formData.get("scenario_name") as string) || "Cenário";

  if (!itemsFile) {
    return Response.json(
      { detail: "Planilha de Itens é obrigatória" },
      { status: 400 }
    );
  }
  if (!insumosFile) {
    return Response.json(
      { detail: "Planilha de Insumos é obrigatória" },
      { status: 400 }
    );
  }

  try {
    // 1. Parse Planilha de Itens (Solucao)
    const itemsBuffer = Buffer.from(await itemsFile.arrayBuffer());
    const parsedItems = parseAbcFile(itemsBuffer, itemsFile.name);

    // 2. Parse Planilha de Insumos (SECAGEM) → recipes
    const insumosBuffer = Buffer.from(await insumosFile.arrayBuffer());
    const recipeMap = parseInsumoFile(insumosBuffer, insumosFile.name);

    // 3. Create abc_curve
    const curveInsert: Record<string, unknown> = {
      project_id: projectId,
      file_name: `${itemsFile.name} + ${insumosFile.name}`,
      imported_by_user_id: user.id,
      total_items: parsedItems.items.length,
      total_cost: parsedItems.total_cost,
    };

    // Try with curve_type (migration-v2), fallback without
    let curve: Record<string, unknown> | null = null;
    let curveErr: { message: string } | null = null;

    const res1 = await supabase
      .from("abc_curves")
      .insert({ ...curveInsert, curve_type: "scenario" })
      .select()
      .single();

    if (res1.error?.message?.includes("curve_type")) {
      const res2 = await supabase
        .from("abc_curves")
        .insert(curveInsert)
        .select()
        .single();
      curve = res2.data;
      curveErr = res2.error;
    } else {
      curve = res1.data;
      curveErr = res1.error;
    }

    if (curveErr || !curve) {
      return Response.json(
        { detail: `Erro ao criar curva: ${curveErr?.message}` },
        { status: 500 }
      );
    }

    // 4. Insert parent items and expand via recipes — lógica compartilhada
    // com o harness de validação (lib/server/scenario-expansion.ts).
    const { parents, children } = expandScenarioItems(
      parsedItems.items,
      recipeMap
    );

    const toDbRow = (it: (typeof parents)[number]) => ({
      id: `${curve.id}-${it.key}`,
      abc_curve_id: curve.id,
      cost_code: it.cost_code,
      description: it.description,
      quantity: it.quantity,
      unit: it.unit,
      unit_cost: it.unit_cost,
      total_cost: it.total_cost,
      cost_pct: it.cost_pct,
      cumulative_pct: it.cumulative_pct,
      abc_class: it.abc_class,
      item_type: it.item_type,
      item_order: it.item_order,
      mapping_status: it.mapping_status,
      classification_note: it.classification_note,
      ...(it.parent_key
        ? { parent_item_id: `${curve.id}-${it.parent_key}` }
        : {}),
    });

    const parentItems = parents.map(toDbRow);
    const childItems = children.map(toDbRow);

    // Batch insert all items
    const allDbItems = [...parentItems, ...childItems];
    const BATCH_SIZE = 50;
    for (let i = 0; i < allDbItems.length; i += BATCH_SIZE) {
      const batch = allDbItems.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from("abc_items").insert(batch);
      if (error) {
        return Response.json(
          { detail: `Erro ao inserir itens: ${error.message}` },
          { status: 500 }
        );
      }
    }

    // 5. Auto-map pending items (Type A)
    const pendingItems = allDbItems.filter(
      (it) => it.item_type === "A" && it.mapping_status === "pending"
    );

    let autoMapped = 0;
    let suggested = 0;

    for (const item of pendingItems) {
      const match = await autoMatchItem(
        item.description as string,
        item.unit as string,
        user.company_id
      );

      const best = match.best;
      if (best && (best.factor_value ?? 0) > 0) {
        await supabase.from("item_mappings").insert({
          abc_item_id: item.id,
          source_tier: best.source_tier,
          ecoinvent_product_id: best.ecoinvent_product_id ?? null,
          ecoinvent_activity_id: best.ecoinvent_activity_id ?? null,
          ghg_factor_id: best.ghg_factor_id ?? null,
          epd_id: best.epd_id ?? null,
          factor_value: best.factor_value,
          factor_unit: best.factor_unit,
          product_unit: best.product_unit ?? "",
          factor_name: best.factor_name,
          factor_source: best.factor_source ?? null,
          confidence: match.confidence,
          similarity_score: best.score / 100.0,
          mapped_by: "auto",
        });

        const newStatus =
          match.confidence === "high" ? "auto" : "manual";
        await supabase
          .from("abc_items")
          .update({ mapping_status: newStatus })
          .eq("id", item.id);

        if (match.confidence === "high") autoMapped++;
        else suggested++;
      }
    }

    // 6. Create scenario with emissions
    const { scenario, result } = await createBaseScenario(
      projectId,
      user.id,
      {
        abcCurveId: curve.id as string,
        scenarioName,
        isBase: false,
      }
    );

    return Response.json(
      {
        scenario_id: scenario.id,
        scenario_name: scenarioName,
        abc_curve_id: curve.id,
        total_parent_items: parentItems.length,
        total_child_items: childItems.length,
        total_items_for_calculation: pendingItems.length,
        auto_mapped: autoMapped,
        suggested,
        pending: pendingItems.length - autoMapped - suggested,
        recipes_used: recipeMap.stats,
        result: {
          total_tco2e: result.total_tco2e,
          total_kgco2e: result.total_kgco2e,
          items_mapped: result.items_mapped,
          items_total: result.items_total,
          coverage_pct: result.coverage_pct,
        },
        warnings: [
          ...parsedItems.warnings,
          ...recipeMap.warnings,
        ],
      },
      { status: 201 }
    );
  } catch (e) {
    return Response.json(
      {
        detail: `Erro ao processar cenário: ${e instanceof Error ? e.message : e}`,
      },
      { status: 400 }
    );
  }
}
