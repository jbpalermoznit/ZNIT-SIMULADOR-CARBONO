/**
 * Insere a regra de equipamento "guindaste" (Indicador H) como dado real em
 * public.equipment_rules — não como valor hardcoded no código. O fator de
 * emissão do diesel vem do fator canônico já resolvido em runtime
 * (lib/server/canonical-factors.ts), nunca hardcoded aqui também.
 *
 * Indicador H de guindaste: índice de 2,35 h/m³ (horas de operação por m³
 * de concreto lançado) e consumo médio de 40 L/h de diesel.
 *
 * Cria/atualiza a regra pra TODAS as empresas existentes (equipment_rules é
 * por empresa — sem isso, só a empresa em que alguém "salvar como regra"
 * manualmente pela UI teria o valor certo). Idempotente: mesma lógica de
 * upsert-por-keyword da rota POST /api/equipment-rules.
 *
 * Pré-requisito: migration-v15-equipment-productivity-index.sql aplicada.
 *
 * Uso:
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/add-guindaste-equipment-rule.ts
 */
import { supabase } from "../lib/server/supabase";
import { getFuelFactors } from "../lib/server/canonical-factors";

const MATCH_KEYWORD = "guindaste";
const PRODUCTIVITY_INDEX = 2.35; // h/m³
const CONSUMPTION_PER_HOUR = 40; // L/h (diesel)

async function main() {
  const fuel = await getFuelFactors();
  const diesel = fuel.diesel;
  console.log(`Fator diesel resolvido: ${diesel.value} ${diesel.unit} (${diesel.source})`);

  const { data: companies, error: companiesErr } = await supabase
    .from("companies")
    .select("id, name");
  if (companiesErr) throw new Error(`fetch companies: ${companiesErr.message}`);
  if (!companies?.length) throw new Error("nenhuma empresa encontrada");

  let created = 0, updated = 0, failed = 0;

  for (const company of companies) {
    const { data: existing, error: existingErr } = await supabase
      .from("equipment_rules")
      .select("id")
      .eq("company_id", company.id)
      .eq("match_keyword", MATCH_KEYWORD)
      .eq("is_active", true)
      .maybeSingle();
    if (existingErr) {
      console.warn(`  [${company.name}] erro ao checar regra existente: ${existingErr.message}`);
      failed++;
      continue;
    }

    const payload = {
      category: "guindaste",
      fuel_type: "diesel",
      consumption_per_hour: CONSUMPTION_PER_HOUR,
      consumption_unit: "L/h",
      emission_factor_value: diesel.value,
      emission_factor_unit: diesel.unit,
      emission_factor_source: diesel.source,
      emission_factor_tier: "ghg_protocol",
      scope: 1,
      productivity_index: PRODUCTIVITY_INDEX,
      notes: "Indicador H de guindaste: índice de 2,35 h/m³ e consumo médio de 40 L/h (diesel).",
    };

    if (existing) {
      const { error } = await supabase.from("equipment_rules").update(payload).eq("id", existing.id);
      if (error) { console.warn(`  [${company.name}] falha ao atualizar: ${error.message}`); failed++; continue; }
      updated++;
      console.log(`  [${company.name}] regra atualizada.`);
    } else {
      const { error } = await supabase.from("equipment_rules").insert({
        company_id: company.id,
        match_keyword: MATCH_KEYWORD,
        original_description: "Guindaste (Indicador H)",
        created_by: "system",
        ...payload,
      });
      if (error) { console.warn(`  [${company.name}] falha ao criar: ${error.message}`); failed++; continue; }
      created++;
      console.log(`  [${company.name}] regra criada.`);
    }
  }

  console.log(`\nTotal: ${companies.length} empresas | criadas: ${created} | atualizadas: ${updated} | falhas: ${failed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
