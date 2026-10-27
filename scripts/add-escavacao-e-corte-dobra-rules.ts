/**
 * Duas regras com valor de referência PUBLICADO — fecha os itens 2 e 1 do
 * retorno do cliente (escavação mecanizada zerada; corte e dobra de aço sem
 * emissão de processo).
 *
 * ── 1. ESCAVAÇÃO MECANIZADA ────────────────────────────────────────────
 * Os itens estavam casados com o fator Ecoinvent "excavation, hydraulic
 * digger", cuja unidade é "Infrastructure & Machinery" — adimensional.
 * getConversionFactor() recusa (corretamente) um fator sem denominador
 * dimensional, a conversão retorna 0 e a emissão zerava em silêncio.
 *
 * Valor derivado de duas referências SINAPI, não arbitrado:
 *   - Composição de escavação mecanizada de vala, profundidade até 1,5 m,
 *     solo de 1ª categoria: CHP (custo horário PRODUTIVO) da escavadeira
 *     hidráulica = 0,020951 h/m³.
 *   - Composição do equipamento (escavadeira hidráulica sobre esteiras,
 *     caçamba 1,20 m³, 21 t, 155 HP): consumo de 15,03 L de diesel por hora
 *     produtiva.
 *   → 0,020951 h/m³ × 15,03 L/h = 0,3149 L/m³
 *
 * Conservador de propósito: usa só o tempo PRODUTIVO (CHP). O tempo
 * improdutivo (CHI, máquina parada aguardando) não entra, então o número
 * tende a subestimar levemente.
 *
 * ── 2. CORTE E DOBRA DE AÇO ────────────────────────────────────────────
 * Hoje os itens estão desconsiderados (0), com quantidade já idêntica à do
 * aço pai — ou seja, sem duplicidade, exatamente como o cliente pediu. Falta
 * só a emissão do PROCESSO.
 *
 * Valor da EPD SmartEPD-2025-086-0608-01 (CMC, "Unfabricated and Fabricated
 * Steel Rebar", unidade declarada 1 tonelada, cradle-to-gate A1–A3,
 * verificada por terceira parte):
 *   - Rebar NÃO fabricado:  A1–A3 = 608 kgCO₂e/t
 *   - Rebar FABRICADO:      A1–A3 = 717 kgCO₂e/t, sendo A3 = 27,7 kgCO₂e/t
 *   → A3 do fabricado = 27,7 kgCO₂e/t = 0,0277 kgCO₂e/kg é o processo de
 *     corte e dobra isolado (o A1 do fabricado já carrega o aço a montante).
 *
 * Não inclui o A2 (transporte até o beneficiador) nem a perda de material de
 * fabricação (a EPD indica 1,079 t de aço bruto por 1 t fabricada) — o
 * primeiro é o item de transporte, ainda em aberto; a segunda não é modelada
 * porque a quantidade do filho é igual à do pai, como o cliente pediu.
 *
 * Idempotente. Recalcula os cenários afetados no final.
 *
 * Uso:
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/add-escavacao-e-corte-dobra-rules.ts
 */
import { supabase } from "../lib/server/supabase";
import { getFuelFactors } from "../lib/server/canonical-factors";
import { recalculateScenario } from "../lib/server/calculator";
import { extractYearFromText } from "../lib/server/factor-version";
import { normalizeKeyword } from "../lib/server/keyword";

// ── Escavação mecanizada (SINAPI) ─────────────────────────────────────
const ESCAV_KEYWORD = "escavacao mecanizada";
const ESCAV_CHP_H_PER_M3 = 0.020951; // SINAPI: vala até 1,5 m, solo 1ª categoria
const ESCAV_L_PER_HOUR = 15.03; // SINAPI: escavadeira hidráulica 155 HP / 21 t
const ESCAV_L_PER_M3 = ESCAV_CHP_H_PER_M3 * ESCAV_L_PER_HOUR; // 0,3149
const ESCAV_NOTE =
  `Escavação mecanizada: SINAPI CHP ${ESCAV_CHP_H_PER_M3} h/m³ (vala até 1,5 m, solo 1ª cat.) × ` +
  `${ESCAV_L_PER_HOUR} L/h (escavadeira hidráulica 155 HP, 21 t, caçamba 1,20 m³) = ` +
  `${ESCAV_L_PER_M3.toFixed(4)} L/m³. Só tempo produtivo (CHP); tempo improdutivo (CHI) não incluído.`;

// ── Corte e dobra de aço (EPD CMC) ────────────────────────────────────
const CORTE_KEYWORD_PATTERNS = ["%corte e dobra%"];
const CORTE_KGCO2E_PER_KG = 0.0277; // A3 do rebar fabricado: 27,7 kgCO₂e/t
const CORTE_SOURCE =
  "EPD SmartEPD-2025-086-0608-01 (CMC) — Fabricated Steel Rebar, A3 = 27,7 kgCO₂e/t";
const CORTE_NOTE =
  "Corte e dobra de aço: emissão do PROCESSO apenas (A3 do rebar fabricado na EPD CMC " +
  "SmartEPD-2025-086-0608-01 = 27,7 kgCO₂e/t = 0,0277 kgCO₂e/kg). O aço em si é contabilizado " +
  "no item pai — quantidade do filho igual à do pai, sem duplicidade. Não inclui transporte " +
  "até o beneficiador (A2) nem perda de fabricação.";

async function applyToItems(
  items: Array<Record<string, unknown>>,
  factorValue: number,
  factorUnit: string,
  factorName: string,
  factorSource: string,
  factorVersion: string | null,
  notes: string,
  affected: Set<string>
) {
  let applied = 0;
  for (const item of items) {
    const id = item.id as string;
    await supabase.from("item_mappings").delete().eq("abc_item_id", id);
    const { error } = await supabase.from("item_mappings").insert({
      abc_item_id: id,
      source_tier: "user_custom",
      factor_value: factorValue,
      factor_unit: factorUnit,
      factor_name: factorName,
      factor_source: factorSource,
      custom_factor_source: factorSource,
      factor_version: factorVersion,
      confidence: "high",
      mapped_by: "rule",
      notes,
    });
    if (error) { console.warn(`  ${id}: ${error.message}`); continue; }
    await supabase.from("abc_items").update({ mapping_status: "manual" }).eq("id", id);

    const { data: sis } = await supabase
      .from("scenario_items")
      .select("id, scenario_id")
      .eq("abc_item_id", id);
    for (const si of sis ?? []) {
      await supabase
        .from("scenario_items")
        .update({
          factor_value: factorValue,
          factor_unit: factorUnit,
          factor_name: factorName,
          source_tier: "user_custom",
          factor_version: factorVersion,
          is_excluded: false,
          exclusion_reason: null,
        })
        .eq("id", si.id);
      affected.add(si.scenario_id as string);
    }
    applied++;
  }
  return applied;
}

async function main() {
  const fuel = await getFuelFactors();
  const diesel = fuel.diesel;
  const dieselVersion = extractYearFromText(diesel.source);
  const escavFactor = ESCAV_L_PER_M3 * diesel.value;

  console.log(`Diesel: ${diesel.value} ${diesel.unit} (${diesel.source})`);
  console.log(`Escavação: ${ESCAV_L_PER_M3.toFixed(4)} L/m³ × ${diesel.value} = ${escavFactor.toFixed(4)} kgCO₂/m³`);
  console.log(`Corte e dobra: ${CORTE_KGCO2E_PER_KG} kgCO₂e/kg\n`);

  const { data: companies } = await supabase.from("companies").select("id, name");
  const affected = new Set<string>();

  // ── Regra de equipamento: escavação mecanizada ──────────────────────
  let eqCreated = 0, eqUpdated = 0;
  for (const company of companies ?? []) {
    const payload = {
      category: "escavadeira",
      fuel_type: "diesel",
      consumption_per_hour: ESCAV_L_PER_M3,
      consumption_unit: "L/m³",
      emission_factor_value: diesel.value,
      emission_factor_unit: diesel.unit,
      emission_factor_source: diesel.source,
      emission_factor_tier: "ghg_protocol",
      scope: 1,
      productivity_index: 1,
      notes: ESCAV_NOTE,
    };
    const { data: existing } = await supabase
      .from("equipment_rules")
      .select("id")
      .eq("company_id", company.id)
      .eq("match_keyword", ESCAV_KEYWORD)
      .eq("is_active", true)
      .maybeSingle();
    if (existing) {
      await supabase.from("equipment_rules").update(payload).eq("id", existing.id);
      eqUpdated++;
    } else {
      const { error } = await supabase.from("equipment_rules").insert({
        company_id: company.id,
        match_keyword: ESCAV_KEYWORD,
        original_description: "Escavação mecanizada de cavas ou valas",
        created_by: "system",
        ...payload,
      });
      if (error) { console.warn(`  [${company.name}] eq: ${error.message}`); continue; }
      eqCreated++;
    }
  }
  console.log(`Regras de equipamento (escavação): ${eqCreated} criadas, ${eqUpdated} atualizadas.`);

  // ── Factor rule: corte e dobra ──────────────────────────────────────
  let frCreated = 0, frUpdated = 0;
  const corteKeyword = normalizeKeyword("CORTE E DOBRA DE ACO");
  for (const company of companies ?? []) {
    const payload = {
      factor_value: CORTE_KGCO2E_PER_KG,
      factor_unit: "kgCO₂e/kg",
      factor_name: "Corte e dobra de aço (processo)",
      source_tier: "user_custom",
      source_description: CORTE_SOURCE,
      is_active: true,
    };
    const { data: existing } = await supabase
      .from("factor_rules")
      .select("id")
      .eq("company_id", company.id)
      .eq("match_keyword", corteKeyword)
      .maybeSingle();
    if (existing) {
      await supabase.from("factor_rules").update(payload).eq("id", existing.id);
      frUpdated++;
    } else {
      const { error } = await supabase.from("factor_rules").insert({
        company_id: company.id,
        match_keyword: corteKeyword,
        original_description: "CORTE E DOBRA DE ACO",
        created_by: "system",
        ...payload,
      });
      if (error) { console.warn(`  [${company.name}] fr: ${error.message}`); continue; }
      frCreated++;
    }
  }
  console.log(`Factor rules (corte e dobra): ${frCreated} criadas, ${frUpdated} atualizadas.\n`);

  // ── Aplicação: escavação mecanizada (só itens em m³, não composições) ─
  const { data: escavAll } = await supabase
    .from("abc_items")
    .select("id, description, unit, quantity, mapping_status")
    .or("description.ilike.%escavacao mecanizada%,description.ilike.%escavação mecanizada%");
  const escavItems = (escavAll ?? []).filter((i) => {
    const u = ((i.unit as string) ?? "").toLowerCase().replace("³", "3");
    return u === "m3" && i.mapping_status !== "blocked";
  });
  const escavName = `Escavação mecanizada (${ESCAV_L_PER_M3.toFixed(4)} L/m³ × ${diesel.value} ${diesel.unit})`;
  const escavApplied = await applyToItems(
    escavItems, escavFactor, "kgCO₂/m³", escavName, diesel.source, dieselVersion, ESCAV_NOTE, affected
  );
  console.log(`Escavação mecanizada: ${escavApplied} itens mapeados (de ${escavAll?.length ?? 0} encontrados).`);

  // ── Aplicação: corte e dobra (só itens em kg) ───────────────────────
  const corteAll: Array<Record<string, unknown>> = [];
  for (const pattern of CORTE_KEYWORD_PATTERNS) {
    const { data } = await supabase
      .from("abc_items")
      .select("id, description, unit, quantity, mapping_status, item_type")
      .ilike("description", pattern);
    corteAll.push(...(data ?? []));
  }
  const corteItems = corteAll.filter((i) => {
    const u = ((i.unit as string) ?? "").toLowerCase();
    return u === "kg" && i.mapping_status !== "blocked";
  });
  const corteApplied = await applyToItems(
    corteItems, CORTE_KGCO2E_PER_KG, "kgCO₂e/kg", "Corte e dobra de aço (processo)",
    CORTE_SOURCE, "2025", CORTE_NOTE, affected
  );
  console.log(`Corte e dobra: ${corteApplied} itens mapeados (de ${corteAll.length} encontrados).\n`);

  // ── Recálculo ───────────────────────────────────────────────────────
  console.log(`Recalculando ${affected.size} cenários...`);
  for (const scenId of affected) {
    const { data: before } = await supabase.from("scenario_results").select("total_tco2e").eq("scenario_id", scenId).maybeSingle();
    try { await recalculateScenario(scenId); } catch (e) { console.warn(`  ${scenId}: ${e instanceof Error ? e.message : e}`); continue; }
    const { data: after } = await supabase.from("scenario_results").select("total_tco2e, coverage_pct").eq("scenario_id", scenId).maybeSingle();
    const { data: scen } = await supabase.from("scenarios").select("name, project_id").eq("id", scenId).maybeSingle();
    const delta = (after?.total_tco2e ?? 0) - (before?.total_tco2e ?? 0);
    console.log(`  [${scen?.project_id} / ${scen?.name}] ${before?.total_tco2e} → ${after?.total_tco2e} tCO₂e (${delta >= 0 ? "+" : ""}${delta.toFixed(2)}) · cobertura ${after?.coverage_pct}%`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
