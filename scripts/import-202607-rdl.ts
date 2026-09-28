/**
 * Importação pontual — "RDL - EAP R07 VALOR META" (input/202607 RDL - EAP
 * R07 VALOR META.xlsx).
 *
 * Formato EAP hierárquico (ver lib/server/parser-eap.ts): aba única
 * "EAP-NOVA (ESTUDO HTB)", cabeçalho na linha 26, itens-folha identificados
 * por terem UNID. preenchida (linhas de grupo/subtotal não têm).
 *
 * Decisões confirmadas para esta importação:
 *   - Itens em 'vb' (verba, ~22% dos itens-folha) e itens com quantidade
 *     zerada (escopo ainda não definido, ~113 itens) entram como pendência
 *     na lista de itens (mapping_status="blocked"), fora do fluxo de
 *     auto-map — não recebem fator por engano.
 *
 * Uso:
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/import-202607-rdl.ts
 *
 * Re-execução é idempotente: o projeto (id fixo) é removido e reimportado.
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { supabase } from "../lib/server/supabase";
import { runAutoMapForCurve } from "../lib/server/auto-map";
import { createBaseScenario } from "../lib/server/calculator";
import { parseEapFile } from "../lib/server/parser-eap";

const COMPANY_ID = "efb2ccda-4024-44fa-aee7-5889b316be26"; // ZNIT TECNOLOGIA LTDA
const USER_EMAIL = "jbpalermo@gmail.com";
const PROJECT_ID = "proj-202607-rdl-eap";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INPUT_DIR = join(ROOT, "input");
const FILE_NAME = "202607 RDL - EAP R07 VALOR META.xlsx";
const SHEET_NAME = "EAP-NOVA (ESTUDO HTB)";

async function cleanupProject(projectId: string) {
  const { data: curves } = await supabase
    .from("abc_curves")
    .select("id")
    .eq("project_id", projectId);
  const curveIds = (curves ?? []).map((c) => c.id);

  for (const curveId of curveIds) {
    const { data: items } = await supabase
      .from("abc_items")
      .select("id")
      .eq("abc_curve_id", curveId);
    const itemIds = (items ?? []).map((i) => i.id);
    for (let i = 0; i < itemIds.length; i += 100) {
      const { error } = await supabase
        .from("item_mappings")
        .delete()
        .in("abc_item_id", itemIds.slice(i, i + 100));
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
  const { data: company } = await supabase
    .from("companies")
    .select("id, name")
    .eq("id", COMPANY_ID)
    .single();
  if (!company) throw new Error(`Empresa não encontrada: ${COMPANY_ID}`);

  const { data: user } = await supabase
    .from("users")
    .select("id, email")
    .eq("company_id", COMPANY_ID)
    .eq("email", USER_EMAIL)
    .single();
  if (!user) throw new Error(`Usuário ${USER_EMAIL} não encontrado na empresa ${company.name}`);

  console.log(`Importando "RDL - EAP R07 Valor Meta" em "${company.name}" (${COMPANY_ID})\n`);

  await cleanupProject(PROJECT_ID);

  const { error: projErr } = await supabase.from("projects").insert({
    id: PROJECT_ID,
    company_id: COMPANY_ID,
    name: "RDL — EAP R07 Valor Meta",
    client_name: "RDL",
    building_type: "misto",
    status: "active",
  });
  if (projErr) throw new Error(`insert project: ${projErr.message}`);

  const buffer = readFileSync(join(INPUT_DIR, FILE_NAME));
  const result = parseEapFile(buffer, FILE_NAME, { sheetName: SHEET_NAME });

  console.log(`itens-folha: ${result.items.length} | custo total: R$ ${result.total_cost.toFixed(2)}`);
  for (const w of result.warnings) console.log(`  aviso: ${w}`);

  const typeSummary: Record<string, number> = {};
  const classSummary: Record<string, number> = {};
  let blockedCount = 0;
  for (const item of result.items) {
    typeSummary[item.item_type] = (typeSummary[item.item_type] ?? 0) + 1;
    classSummary[item.abc_class] = (classSummary[item.abc_class] ?? 0) + 1;
    if (item.mapping_status === "blocked") blockedCount++;
  }
  console.log(`  por tipo: ${JSON.stringify(typeSummary)}`);
  console.log(`  por classe ABC: ${JSON.stringify(classSummary)}`);
  console.log(`  pendências (blocked): ${blockedCount}/${result.items.length}`);

  const curveInsert = {
    project_id: PROJECT_ID,
    file_name: FILE_NAME,
    imported_by_user_id: user.id,
    total_items: result.items.length,
    total_cost: result.total_cost,
  };
  let curve: { id: string } | null = null;
  const curveRes1 = await supabase
    .from("abc_curves")
    .insert({ ...curveInsert, curve_type: "eap" })
    .select("id")
    .single();
  if (curveRes1.error?.message?.includes("curve_type")) {
    const curveRes2 = await supabase.from("abc_curves").insert(curveInsert).select("id").single();
    if (curveRes2.error || !curveRes2.data) throw new Error(`insert curve: ${curveRes2.error?.message}`);
    curve = curveRes2.data;
  } else {
    if (curveRes1.error || !curveRes1.data) throw new Error(`insert curve: ${curveRes1.error?.message}`);
    curve = curveRes1.data;
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
    const { error } = await supabase.from("abc_items").insert(itemRows.slice(i, i + 50));
    if (error) throw new Error(`insert items: ${error.message}`);
  }

  const autoMap = await runAutoMapForCurve(curve.id, COMPANY_ID);
  console.log(`  auto-map: ${JSON.stringify(autoMap)}`);

  const { scenario } = await createBaseScenario(PROJECT_ID, user.id, {
    abcCurveId: curve.id,
    isBase: true,
  });
  const scenarioId = (scenario as { id: string }).id;

  const { data: scenarioResult } = await supabase
    .from("scenario_results")
    .select("total_tco2e, items_total, items_mapped, coverage_pct")
    .eq("scenario_id", scenarioId)
    .single();

  if (scenarioResult) {
    console.log(
      `  RESULTADO: ${scenarioResult.total_tco2e?.toFixed(1)} tCO2e | cobertura ${scenarioResult.coverage_pct}% ` +
      `(${scenarioResult.items_mapped}/${scenarioResult.items_total})`
    );
  } else {
    console.log("  AVISO: scenario_results não encontrado");
  }

  console.log(`\nImportação concluída. Projeto: ${PROJECT_ID}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
