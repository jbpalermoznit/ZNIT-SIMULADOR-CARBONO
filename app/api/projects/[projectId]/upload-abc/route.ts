import { NextRequest } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/server/auth";
import { supabase } from "@/lib/server/supabase";
import { parseAbcFile } from "@/lib/server/parser";
import { runAutoMapForCurve } from "@/lib/server/auto-map";
import { createBaseScenario } from "@/lib/server/calculator";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  let user;
  try { user = await getCurrentUser(req); } catch { return unauthorized(); }

  const { projectId } = await params;

  const { data: project } = await supabase
    .from("projects")
    .select("id, company_id")
    .eq("id", projectId)
    .eq("company_id", user.company_id)
    .single();

  if (!project) return Response.json({ detail: "Projeto não encontrado" }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  // Optional: when set, the upload creates a non-base scenario tied to this
  // new curve and leaves the existing base untouched. Used by the "import
  // new scenario from file" flow on Overview / Cenários.
  const scenarioName = (formData.get("scenario_name") as string | null) ?? null;
  const asScenario = (formData.get("as_scenario") as string | null) === "true";

  if (!file || !file.name.match(/\.(xlsx|xlsm)$/i)) {
    return Response.json({ detail: "Formato inválido. Use .xlsx ou .xlsm" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let result;
  try {
    result = parseAbcFile(buffer, file.name);
  } catch (e: unknown) {
    return Response.json({ detail: e instanceof Error ? e.message : "Erro ao processar" }, { status: 422 });
  }

  const { data: curve, error: curveErr } = await supabase
    .from("abc_curves")
    .insert({
      project_id: projectId,
      file_name: file.name,
      imported_by_user_id: user.id,
      total_items: result.items.length,
      total_cost: result.total_cost,
    })
    .select("id")
    .single();

  if (curveErr || !curve) {
    return Response.json({ detail: "Erro ao criar curva ABC" }, { status: 500 });
  }

  const itemRows = result.items.map((item) => ({
    abc_curve_id: curve.id,
    cost_code: item.cost_code,
    description: item.description,
    adf: item.adf,
    quantity: item.quantity,
    unit: item.unit,
    unit_cost: item.unit_cost,
    total_cost: item.total_cost,
    supplier: item.supplier,
    cost_pct: item.cost_pct,
    cumulative_pct: item.cumulative_pct,
    abc_class: item.abc_class,
    item_type: item.item_type,
    item_order: item.order,
    mapping_status: item.mapping_status,
    classification_note: item.classification_note,
  }));

  for (let i = 0; i < itemRows.length; i += 50) {
    await supabase.from("abc_items").insert(itemRows.slice(i, i + 50));
  }

  const typeSummary: Record<string, number> = {};
  const classSummary: Record<string, number> = {};
  for (const item of result.items) {
    typeSummary[item.item_type] = (typeSummary[item.item_type] ?? 0) + 1;
    classSummary[item.abc_class] = (classSummary[item.abc_class] ?? 0) + 1;
  }

  // Chain auto-map + base scenario + calculation so the user lands on Itens
  // with everything ready. Each step is best-effort: if auto-map or base
  // scenario creation fails, surface a partial response so the user can
  // recover via the Visão Geral flow.
  let autoMap: Awaited<ReturnType<typeof runAutoMapForCurve>> | null = null;
  let baseScenarioId: string | null = null;
  let baseScenarioError: string | null = null;

  try {
    autoMap = await runAutoMapForCurve(curve.id, user.company_id);
  } catch (e) {
    console.error("[upload-abc] auto-map failed", e);
  }

  try {
    const { scenario } = await createBaseScenario(projectId, user.id, {
      abcCurveId: curve.id,
      isBase: !asScenario,
      scenarioName: asScenario ? scenarioName ?? "Cenário derivado" : undefined,
    });
    baseScenarioId = (scenario as { id: string }).id;
  } catch (e) {
    baseScenarioError = e instanceof Error ? e.message : "Erro ao criar cenário";
    console.error("[upload-abc] scenario creation failed", e);
  }

  return Response.json({
    abc_curve_id: curve.id,
    file_name: file.name,
    total_items: result.items.length,
    total_cost: result.total_cost,
    type_summary: typeSummary,
    class_summary: classSummary,
    warnings: result.warnings,
    auto_map: autoMap,
    base_scenario_id: baseScenarioId,
    base_scenario_error: baseScenarioError,
  }, { status: 201 });
}
