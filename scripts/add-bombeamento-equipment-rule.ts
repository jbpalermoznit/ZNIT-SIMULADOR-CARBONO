/**
 * Regra de equipamento "bombeamento de concreto" + aplicação nos projetos
 * reais onde o item aparece.
 *
 * Indicador: consumo de diesel de 0,6–0,8 L por m³ de concreto bombeado —
 * adotada a média do intervalo (0,7 L/m³), documentando o range em notes.
 * Modelagem em equipment_rules: consumption_per_hour = 0,7 com
 * consumption_unit "L/m³" e productivity_index = 1 (a "produtividade" aqui
 * já é por unidade do item, sem passar por horas). O fator do diesel vem do
 * canônico em runtime (lib/server/canonical-factors.ts), nunca hardcoded.
 *
 * Além de salvar a regra pra todas as empresas (mesmo padrão de
 * add-guindaste-equipment-rule.ts), aplica o cálculo nos itens
 * "BOMBEAMENTO DE CONCRETO" (Tipo D, em m³) dos projetos reais — VALE
 * (ZNIT), VALE (cópia Fortes) e RDL — criando o mapping (0,7 × fator
 * diesel = kgCO₂/m³), reativando itens auto-excluídos e recalculando os
 * cenários afetados. Projetos de teste/demo ficam de fora; neles a regra
 * salva passa a valer quando alguém parametrizar.
 *
 * Idempotente: re-rodar atualiza a regra e re-aplica o mesmo fator.
 *
 * Uso:
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/add-bombeamento-equipment-rule.ts
 */
import { supabase } from "../lib/server/supabase";
import { getFuelFactors } from "../lib/server/canonical-factors";
import { recalculateScenario } from "../lib/server/calculator";
import { extractYearFromText } from "../lib/server/factor-version";

const MATCH_KEYWORD = "bombeamento de concreto";
const LITERS_PER_M3 = 0.7; // média do intervalo 0,6–0,8 L/m³
const RANGE_NOTE =
  "Bombeamento de concreto: consumo de diesel de 0,6–0,8 L/m³ — adotada a média de 0,7 L/m³.";

const TARGET_PROJECT_MATCHERS = ["proj-640-ht-vale", "proj-640-ht-vale-fortes"]; // + RDL por nome

async function main() {
  const fuel = await getFuelFactors();
  const diesel = fuel.diesel;
  const factorValue = LITERS_PER_M3 * diesel.value;
  const factorVersion = extractYearFromText(diesel.source);
  console.log(`Diesel: ${diesel.value} ${diesel.unit} (${diesel.source})`);
  console.log(`Fator por m³: ${LITERS_PER_M3} L/m³ × ${diesel.value} = ${factorValue.toFixed(6)} kgCO₂/m³\n`);

  // ── 1. Regra salva para todas as empresas ─────────────────────────────
  const { data: companies, error: companiesErr } = await supabase.from("companies").select("id, name");
  if (companiesErr) throw new Error(`fetch companies: ${companiesErr.message}`);

  let rulesCreated = 0, rulesUpdated = 0;
  for (const company of companies ?? []) {
    const payload = {
      category: "bomba de concreto",
      fuel_type: "diesel",
      consumption_per_hour: LITERS_PER_M3,
      consumption_unit: "L/m³",
      emission_factor_value: diesel.value,
      emission_factor_unit: diesel.unit,
      emission_factor_source: diesel.source,
      emission_factor_tier: "ghg_protocol",
      scope: 1,
      productivity_index: 1,
      notes: RANGE_NOTE,
    };
    const { data: existing } = await supabase
      .from("equipment_rules")
      .select("id")
      .eq("company_id", company.id)
      .eq("match_keyword", MATCH_KEYWORD)
      .eq("is_active", true)
      .maybeSingle();
    if (existing) {
      const { error } = await supabase.from("equipment_rules").update(payload).eq("id", existing.id);
      if (error) { console.warn(`  [${company.name}] update falhou: ${error.message}`); continue; }
      rulesUpdated++;
    } else {
      const { error } = await supabase.from("equipment_rules").insert({
        company_id: company.id,
        match_keyword: MATCH_KEYWORD,
        original_description: "Bombeamento de Concreto",
        created_by: "system",
        ...payload,
      });
      if (error) { console.warn(`  [${company.name}] insert falhou: ${error.message}`); continue; }
      rulesCreated++;
    }
  }
  console.log(`Regras salvas: ${rulesCreated} criadas, ${rulesUpdated} atualizadas (${companies?.length} empresas).\n`);

  // ── 2. Aplicação nos projetos reais ───────────────────────────────────
  const { data: rdl } = await supabase.from("projects").select("id, name").ilike("name", "RDL%");
  const targetProjects = [...TARGET_PROJECT_MATCHERS, ...(rdl ?? []).map((p) => p.id)];
  console.log("Projetos alvo:", targetProjects);

  const { data: curves } = await supabase.from("abc_curves").select("id, project_id").in("project_id", targetProjects);
  const curveIds = (curves ?? []).map((c) => c.id);

  const { data: items, error: itemsErr } = await supabase
    .from("abc_items")
    .select("id, description, unit, quantity, mapping_status, abc_curve_id")
    .in("abc_curve_id", curveIds)
    .ilike("description", "bombeamento de concreto%");
  if (itemsErr) throw new Error(`fetch items: ${itemsErr.message}`);
  console.log(`${items?.length} itens de bombeamento nos projetos alvo.`);

  const factorName = `Bombeamento de concreto (${LITERS_PER_M3} L/m³ × ${diesel.value} ${diesel.unit})`;
  const affectedScenarioIds = new Set<string>();
  let itemsApplied = 0;

  for (const item of items ?? []) {
    if ((item.unit ?? "").toLowerCase().replace("³", "3") !== "m3") {
      console.warn(`  pulando "${item.description}" (${item.unit}) — unidade não é m³`);
      continue;
    }

    await supabase.from("item_mappings").delete().eq("abc_item_id", item.id);
    const { error: mapErr } = await supabase.from("item_mappings").insert({
      abc_item_id: item.id,
      source_tier: "ghg_protocol",
      factor_value: factorValue,
      factor_unit: "kgCO₂/m³",
      factor_name: factorName,
      factor_source: diesel.source,
      factor_version: factorVersion,
      product_unit: null,
      confidence: "high",
      mapped_by: "rule",
      notes: RANGE_NOTE,
    });
    if (mapErr) { console.warn(`  mapping falhou (${item.id}): ${mapErr.message}`); continue; }

    await supabase.from("abc_items").update({ mapping_status: "manual" }).eq("id", item.id);

    // Propaga pros cenários que referenciam o item (reativa se auto-excluído)
    const { data: sis } = await supabase
      .from("scenario_items")
      .select("id, scenario_id")
      .eq("abc_item_id", item.id);
    for (const si of sis ?? []) {
      await supabase
        .from("scenario_items")
        .update({
          factor_value: factorValue,
          factor_unit: "kgCO₂/m³",
          factor_name: factorName,
          source_tier: "ghg_protocol",
          factor_version: factorVersion,
          is_excluded: false,
          exclusion_reason: null,
        })
        .eq("id", si.id);
      affectedScenarioIds.add(si.scenario_id as string);
    }
    itemsApplied++;
  }
  console.log(`${itemsApplied} itens mapeados.\n`);

  // ── 3. Recálculo dos cenários afetados ────────────────────────────────
  for (const scenId of affectedScenarioIds) {
    const { data: before } = await supabase.from("scenario_results").select("total_tco2e").eq("scenario_id", scenId).maybeSingle();
    await recalculateScenario(scenId);
    const { data: after } = await supabase.from("scenario_results").select("total_tco2e, coverage_pct").eq("scenario_id", scenId).maybeSingle();
    const { data: scen } = await supabase.from("scenarios").select("name, project_id").eq("id", scenId).single();
    console.log(`  [${scen?.project_id} / ${scen?.name}] ${before?.total_tco2e ?? "?"} → ${after?.total_tco2e} tCO₂e (cobertura ${after?.coverage_pct}%)`);
  }
  console.log(`\n${affectedScenarioIds.size} cenários recalculados.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
