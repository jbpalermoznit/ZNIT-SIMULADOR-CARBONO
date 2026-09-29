/**
 * Limpeza de mapeamentos implausíveis — feedback do cliente (revisão geral
 * de fatores, itens 4 e 8).
 *
 * Auditoria manual encontrou fatores do Ecoinvent casados por similaridade
 * textual/compatibilidade de unidade ("un" casa com "un") em itens que não
 * têm nenhuma relação com o produto do fator. Só no projeto da VALE isso
 * somava ~518 tCO₂e num inventário de 2.310 t (22%).
 *
 * Política: NUNCA substitui por um fator inventado. Devolve o item para
 * `pending` com nota de auditoria, deixando o gap visível para um humano
 * decidir (remapear ou desconsiderar) — um buraco explícito é melhor que um
 * número fabricado num inventário de carbono. A exceção é escavação manual,
 * que é serviço de mão-de-obra sem material: essa é desconsiderada com
 * justificativa, mesmo tratamento que o app já dá a Tipo B.
 *
 * Casos tratados (verificados um a um contra as descrições reais):
 *   - "air distribution terminal panel, steel, 120 m3/h" (129 mapeamentos):
 *     etiqueta de identificação, parabolt, aço para pré-moldado, cantoneira…
 *     Nenhum item de HVAC na lista — o match é sempre espúrio.
 *   - "silencer, steel, DN 125" (59): protetor de ponta de ferro, fechadura,
 *     vergalhão. Idem.
 *   - "bottom ash, MSWI-WWT, WW from plywood production" (158): chapa
 *     compensada casada com a CINZA do tratamento de resíduo da produção de
 *     compensado, não com o compensado.
 *   - "taipa de pilão estabilizada com cimento" APENAS em escavação manual
 *     (os demais itens desse fator são taipa/argamassa — colisão de nome que
 *     precisa de decisão do cliente, fica fora daqui).
 *   - factor_rule "pontalete 8x8cm" @ 58,75 kgCO₂/m, marcada "revisar" na
 *     origem: um pontalete 8×8cm×1m tem ~0,0064 m³ (~3 kg) de madeira, então
 *     o valor está ~40× acima do plausível. Regra desativada + mapeamentos
 *     revertidos.
 *
 * Idempotente. Recalcula os cenários afetados no final.
 *
 * Uso:
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/cleanup-implausible-mappings.ts
 */
import { supabase } from "../lib/server/supabase";
import { recalculateScenario } from "../lib/server/calculator";
import { chunkArray } from "../lib/server/db-utils";

const AUDIT_NOTE =
  "Mapeamento revertido na auditoria de fatores (revisão do cliente): o fator anterior não representava o material do item (match por similaridade textual/unidade). Remapeie ou desconsidere com justificativa.";

/** Fatores cujo match é espúrio em 100% dos itens observados. */
const BOGUS_FACTOR_PATTERNS = [
  "%air distribution terminal panel%",
  "%silencer, steel%",
  "%bottom ash%plywood%",
];

/** (fator, descrição do item) — reverte só nessa combinação. */
const BOGUS_PAIRS: Array<{ factor: string; description: string }> = [
  { factor: "%taipa%", description: "%escavacao manual%" },
  { factor: "%taipa%", description: "%escavação manual%" },
];

const PONTALETE_RULE_KEYWORD = "pontalete 8x8cm";

/** Serviços de mão-de-obra sem material: desconsiderar em vez de deixar pendente. */
const LABOR_ONLY_DESCRIPTION = "%escavacao manual%";
const LABOR_ONLY_REASON =
  "Escavação manual — serviço de mão-de-obra sem insumo material; sem emissão direta de Escopo 3 de materiais. O fator anterior (taipa de pilão estabilizada com cimento) era um match espúrio.";

async function collectMappingIds(): Promise<Map<string, string>> {
  // abc_item_id → motivo
  const targets = new Map<string, string>();

  for (const pattern of BOGUS_FACTOR_PATTERNS) {
    const { data, error } = await supabase
      .from("item_mappings")
      .select("abc_item_id, factor_name")
      .ilike("factor_name", pattern);
    if (error) throw new Error(`fetch ${pattern}: ${error.message}`);
    for (const m of data ?? []) targets.set(m.abc_item_id as string, `fator espúrio: ${m.factor_name}`);
    console.log(`  ${pattern}: ${data?.length ?? 0} mapeamentos`);
  }

  for (const pair of BOGUS_PAIRS) {
    const { data } = await supabase
      .from("item_mappings")
      .select("abc_item_id, factor_name")
      .ilike("factor_name", pair.factor);
    const ids = (data ?? []).map((m) => m.abc_item_id as string);
    const nameById = new Map((data ?? []).map((m) => [m.abc_item_id as string, m.factor_name as string]));
    for (const chunk of chunkArray(ids, 100)) {
      const { data: items } = await supabase
        .from("abc_items")
        .select("id, description")
        .in("id", chunk)
        .ilike("description", pair.description);
      for (const it of items ?? []) {
        targets.set(it.id as string, `fator espúrio: ${nameById.get(it.id as string)}`);
      }
    }
  }

  // Pontalete: via factor_rule desativada
  const { data: pontaleteMaps } = await supabase
    .from("item_mappings")
    .select("abc_item_id, factor_name")
    .ilike("factor_name", "%pontalete%");
  for (const m of pontaleteMaps ?? []) {
    targets.set(m.abc_item_id as string, `fator implausível para madeira: ${m.factor_name}`);
  }
  console.log(`  %pontalete%: ${pontaleteMaps?.length ?? 0} mapeamentos`);

  return targets;
}

async function main() {
  console.log("Coletando mapeamentos implausíveis...");
  const targets = await collectMappingIds();
  console.log(`\n${targets.size} itens distintos a reverter.\n`);

  // Quais são mão-de-obra (desconsiderar em vez de pendente)?
  const laborOnly = new Set<string>();
  for (const chunk of chunkArray([...targets.keys()], 100)) {
    const { data } = await supabase
      .from("abc_items")
      .select("id")
      .in("id", chunk)
      .ilike("description", LABOR_ONLY_DESCRIPTION);
    for (const it of data ?? []) laborOnly.add(it.id as string);
  }
  console.log(`${laborOnly.size} são escavação manual (serão desconsiderados com justificativa).\n`);

  const affectedScenarios = new Set<string>();
  let reverted = 0, excluded = 0;

  for (const [abcItemId, reason] of targets) {
    const isLabor = laborOnly.has(abcItemId);

    await supabase.from("item_mappings").delete().eq("abc_item_id", abcItemId);

    if (isLabor) {
      const { error } = await supabase.from("item_mappings").insert({
        abc_item_id: abcItemId,
        source_tier: "excluded",
        factor_value: 0,
        factor_unit: "kg CO2-Eq",
        factor_name: "Excluído",
        mapped_by: "excluded",
        exclusion_justification: LABOR_ONLY_REASON,
        notes: AUDIT_NOTE,
      });
      if (error) { console.warn(`  insert excluded ${abcItemId}: ${error.message}`); continue; }
      await supabase.from("abc_items").update({ mapping_status: "excluded" }).eq("id", abcItemId);
      excluded++;
    } else {
      await supabase
        .from("abc_items")
        .update({ mapping_status: "pending", classification_note: AUDIT_NOTE })
        .eq("id", abcItemId);
      reverted++;
    }

    const { data: sis } = await supabase
      .from("scenario_items")
      .select("id, scenario_id")
      .eq("abc_item_id", abcItemId);
    for (const si of sis ?? []) {
      await supabase
        .from("scenario_items")
        .update({
          factor_value: null,
          factor_unit: null,
          factor_name: null,
          source_tier: isLabor ? "excluded" : null,
          factor_version: null,
          emission_kgco2e: 0,
          is_excluded: isLabor,
          exclusion_reason: isLabor ? LABOR_ONLY_REASON : null,
        })
        .eq("id", si.id);
      affectedScenarios.add(si.scenario_id as string);
    }
    void reason;
  }

  console.log(`Revertidos para pendente: ${reverted} | desconsiderados: ${excluded}\n`);

  // Desativa a factor rule do pontalete pra não re-aplicar no próximo auto-map
  const { data: rules } = await supabase
    .from("factor_rules")
    .select("id, match_keyword, company_id")
    .eq("match_keyword", PONTALETE_RULE_KEYWORD)
    .eq("is_active", true);
  for (const r of rules ?? []) {
    await supabase.from("factor_rules").update({ is_active: false }).eq("id", r.id);
  }
  console.log(`Factor rules "${PONTALETE_RULE_KEYWORD}" desativadas: ${rules?.length ?? 0}\n`);

  console.log(`Recalculando ${affectedScenarios.size} cenários...`);
  for (const scenId of affectedScenarios) {
    const { data: before } = await supabase.from("scenario_results").select("total_tco2e").eq("scenario_id", scenId).maybeSingle();
    try {
      await recalculateScenario(scenId);
    } catch (e) {
      console.warn(`  cenário ${scenId}: ${e instanceof Error ? e.message : e}`);
      continue;
    }
    const { data: after } = await supabase.from("scenario_results").select("total_tco2e, coverage_pct").eq("scenario_id", scenId).maybeSingle();
    const { data: scen } = await supabase.from("scenarios").select("name, project_id").eq("id", scenId).maybeSingle();
    const delta = (after?.total_tco2e ?? 0) - (before?.total_tco2e ?? 0);
    console.log(`  [${scen?.project_id} / ${scen?.name}] ${before?.total_tco2e} → ${after?.total_tco2e} tCO₂e (${delta.toFixed(1)}) · cobertura ${after?.coverage_pct}%`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
