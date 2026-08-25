/**
 * Copia o projeto "Planta de Silicato — VALE" (proj-640-ht-vale, em ZNIT
 * TECNOLOGIA LTDA) para a organização Fortes Engenharia, como um projeto
 * independente (não move — o original continua em ZNIT TECNOLOGIA LTDA).
 *
 * Copia curvas/itens/mapeamentos preservando os dados exatamente como estão
 * (select("*") + remapeamento de ids), e recria os cenários via
 * createBaseScenario (sem precisar rodar auto-map de novo — os mapeamentos
 * já vêm copiados).
 *
 * Uso:
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/copy-640-ht-vale-to-fortes.ts
 *
 * Re-execução é idempotente: o projeto de destino (id fixo) é removido e
 * recopiado.
 */
import { supabase } from "../lib/server/supabase";
import { createBaseScenario } from "../lib/server/calculator";
import { chunkArray } from "../lib/server/db-utils";

const SOURCE_PROJECT_ID = "proj-640-ht-vale";
const DEST_PROJECT_ID = "proj-640-ht-vale-fortes";
const DEST_COMPANY_ID = "8a01df4d-f215-4155-9b1f-2dacbe6fd931"; // Fortes Engenharia

async function cleanupProject(projectId: string) {
  const { data: curves } = await supabase.from("abc_curves").select("id").eq("project_id", projectId);
  const curveIds = (curves ?? []).map((c) => c.id);

  for (const curveId of curveIds) {
    const { data: items } = await supabase.from("abc_items").select("id").eq("abc_curve_id", curveId);
    const itemIds = (items ?? []).map((i) => i.id);
    for (const chunk of chunkArray(itemIds, 100)) {
      const { error } = await supabase.from("item_mappings").delete().in("abc_item_id", chunk);
      if (error) throw new Error(`cleanup item_mappings: ${error.message}`);
    }
  }

  const { error: scenErr } = await supabase.from("scenarios").delete().eq("project_id", projectId);
  if (scenErr) throw new Error(`cleanup scenarios: ${scenErr.message}`);

  for (const curveId of curveIds) {
    const { error } = await supabase.from("abc_curves").delete().eq("id", curveId);
    if (error) throw new Error(`cleanup abc_curves ${curveId}: ${error.message}`);
  }

  const { error: projErr } = await supabase.from("projects").delete().eq("id", projectId);
  if (projErr) throw new Error(`cleanup project: ${projErr.message}`);
}

async function main() {
  const { data: destCompany } = await supabase.from("companies").select("id, name").eq("id", DEST_COMPANY_ID).single();
  if (!destCompany) throw new Error(`Empresa de destino não encontrada: ${DEST_COMPANY_ID}`);

  const { data: srcProject } = await supabase.from("projects").select("*").eq("id", SOURCE_PROJECT_ID).single();
  if (!srcProject) throw new Error(`Projeto origem não encontrado: ${SOURCE_PROJECT_ID}`);

  console.log(`Copiando "${srcProject.name}" para "${destCompany.name}" (${DEST_COMPANY_ID})\n`);

  await cleanupProject(DEST_PROJECT_ID);

  const { id: _srcId, company_id: _srcCompany, ...projectRest } = srcProject as Record<string, unknown>;
  const { error: projErr } = await supabase.from("projects").insert({
    ...projectRest,
    id: DEST_PROJECT_ID,
    company_id: DEST_COMPANY_ID,
  });
  if (projErr) throw new Error(`insert project: ${projErr.message}`);

  const { data: srcCurves } = await supabase.from("abc_curves").select("*").eq("project_id", SOURCE_PROJECT_ID);
  if (!srcCurves || srcCurves.length === 0) throw new Error("Projeto origem não tem curvas");

  for (const srcCurve of srcCurves) {
    console.log(`=== ${srcCurve.file_name} ===`);

    const { data: srcItems } = await supabase.from("abc_items").select("*").eq("abc_curve_id", srcCurve.id);
    if (!srcItems || srcItems.length === 0) throw new Error(`Curva ${srcCurve.id} sem itens`);

    const { id: srcCurveId, project_id: _p, ...curveRest } = srcCurve as Record<string, unknown>;
    const { data: newCurve, error: curveErr } = await supabase
      .from("abc_curves")
      .insert({ ...curveRest, project_id: DEST_PROJECT_ID })
      .select("id")
      .single();
    if (curveErr || !newCurve) throw new Error(`insert curve: ${curveErr?.message}`);

    // Remapeia ids de abc_items (preservando parent_item_id entre pais/filhos).
    const idMap = new Map<string, string>();
    for (const item of srcItems) idMap.set(item.id as string, `${newCurve.id}-${item.id}`);

    const newItems = srcItems.map((item) => {
      const { id, abc_curve_id: _ac, parent_item_id, ...rest } = item as Record<string, unknown>;
      return {
        ...rest,
        id: idMap.get(id as string),
        abc_curve_id: newCurve.id,
        parent_item_id: parent_item_id ? idMap.get(parent_item_id as string) ?? null : null,
      };
    });
    for (let i = 0; i < newItems.length; i += 50) {
      const { error } = await supabase.from("abc_items").insert(newItems.slice(i, i + 50));
      if (error) throw new Error(`insert items: ${error.message}`);
    }

    const srcItemIds = srcItems.map((i) => i.id as string);
    const srcMappings: Record<string, unknown>[] = [];
    for (const chunk of chunkArray(srcItemIds, 100)) {
      const { data, error } = await supabase.from("item_mappings").select("*").in("abc_item_id", chunk);
      if (error) throw new Error(`fetch mappings: ${error.message}`);
      srcMappings.push(...(data ?? []));
    }
    const newMappings = srcMappings.map((m) => {
      const { id: _mid, abc_item_id, ...rest } = m as Record<string, unknown>;
      return { ...rest, abc_item_id: idMap.get(abc_item_id as string) };
    });
    for (let i = 0; i < newMappings.length; i += 50) {
      const { error } = await supabase.from("item_mappings").insert(newMappings.slice(i, i + 50));
      if (error) throw new Error(`insert mappings: ${error.message}`);
    }
    console.log(`  ${newItems.length} itens, ${newMappings.length} mapeamentos copiados`);

    // Recria o cenário (base/alternativo, na mesma ordem/critério do
    // import original) — sem precisar rodar auto-map de novo.
    const { data: srcScenario } = await supabase
      .from("scenarios")
      .select("name, is_base")
      .eq("project_id", SOURCE_PROJECT_ID)
      .eq("abc_curve_id", srcCurveId)
      .maybeSingle();

    const { scenario, result } = await createBaseScenario(DEST_PROJECT_ID, "", {
      abcCurveId: newCurve.id as string,
      scenarioName: (srcScenario?.name as string) ?? (srcCurve.file_name as string),
      isBase: (srcScenario?.is_base as boolean) ?? false,
    });
    const scenarioId = (scenario as { id: string }).id;
    console.log(`  cenário "${(srcScenario?.name as string) ?? srcCurve.file_name}" recriado (${scenarioId})`);

    const { data: res } = await supabase
      .from("scenario_results")
      .select("total_tco2e, items_total, items_mapped, coverage_pct")
      .eq("scenario_id", scenarioId)
      .single();
    if (res) {
      console.log(`  RESULTADO: ${res.total_tco2e?.toFixed(1)} tCO2e | cobertura ${res.coverage_pct}% (${res.items_mapped}/${res.items_total})`);
    }
    void result;
    console.log();
  }

  console.log(`Cópia concluída. Projeto: ${DEST_PROJECT_ID} em "${destCompany.name}"`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
