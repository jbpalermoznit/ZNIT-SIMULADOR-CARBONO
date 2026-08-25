/**
 * Backfill de item_mappings.factor_version / scenario_items.factor_version
 * pra mapeamentos criados ANTES da migration-v12-factor-version.sql — o
 * ADD COLUMN não populou retroativamente, então toda linha existente ficou
 * congelada em NULL (confirmado: 6313/6342 mappings no banco, ~99.5%).
 *
 * NÃO re-executa auto-map nem muda qual fator está mapeado — só resolve a
 * versão a partir dos ids já salvos em cada mapping (mesma buildFactorVersion
 * usada pelo fluxo normal), pra não arriscar trocar o match de ninguém.
 *
 * Idempotente: só toca linhas com factor_version IS NULL.
 *
 * Uso:
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/backfill-factor-version.ts
 */
import { supabase, supabaseEmission } from "../lib/server/supabase";
import { chunkArray } from "../lib/server/db-utils";
import { buildFactorVersion, extractYearFromText } from "../lib/server/factor-version";

interface MappingRow {
  id: string;
  abc_item_id: string;
  source_tier: string;
  ecoinvent_product_id: string | null;
  ecoinvent_activity_id: string | null;
  ghg_factor_id: number | null;
  epd_id: number | null;
  factor_source: string | null;
}

async function fetchAllNullVersionMappings(): Promise<MappingRow[]> {
  const out: MappingRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("item_mappings")
      .select("id, abc_item_id, source_tier, ecoinvent_product_id, ecoinvent_activity_id, ghg_factor_id, epd_id, factor_source")
      .is("factor_version", null)
      .in("source_tier", ["ecoinvent", "ghg_protocol", "cecarbon", "epd"])
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`fetch mappings: ${error.message}`);
    out.push(...((data ?? []) as MappingRow[]));
    if (!data || data.length < pageSize) break;
  }
  return out;
}

async function main() {
  const mappings = await fetchAllNullVersionMappings();
  console.log(`${mappings.length} mappings sem factor_version (ecoinvent/ghg_protocol/cecarbon/epd).`);

  // Batch-load source rows por tier, usando os ids já salvos no mapping —
  // nunca re-busca/re-casa o material.
  const ecoinventIds = [...new Set(mappings.filter((m) => m.source_tier === "ecoinvent" && m.ecoinvent_product_id).map((m) => m.ecoinvent_product_id as string))];
  const ghgIds = [...new Set(mappings.filter((m) => m.source_tier === "ghg_protocol" && m.ghg_factor_id != null).map((m) => m.ghg_factor_id as number))];
  const epdIds = [...new Set(mappings.filter((m) => m.source_tier === "epd" && m.epd_id != null).map((m) => m.epd_id as number))];

  const ecoinventByKey = new Map<string, Record<string, unknown>>();
  for (const chunk of chunkArray(ecoinventIds, 100)) {
    const { data, error } = await supabaseEmission.from("ecoinvent_dev").select("*").in("product_id", chunk);
    if (error) throw new Error(`fetch ecoinvent: ${error.message}`);
    for (const row of data ?? []) ecoinventByKey.set(`${row.product_id}|${row.activity_id}`, row);
  }

  const ghgById = new Map<number, Record<string, unknown>>();
  for (const chunk of chunkArray(ghgIds, 100)) {
    const { data, error } = await supabaseEmission.from("fatores_ghg_dev").select("*").in("id", chunk);
    if (error) throw new Error(`fetch ghg: ${error.message}`);
    for (const row of data ?? []) ghgById.set(row.id as number, row);
  }

  const epdById = new Map<number, Record<string, unknown>>();
  for (const chunk of chunkArray(epdIds, 100)) {
    const { data, error } = await supabaseEmission.from("epd_dev").select("*").in("id", chunk);
    if (error) throw new Error(`fetch epd: ${error.message}`);
    for (const row of data ?? []) epdById.set(row.id as number, row);
  }

  let computed = 0, noSourceRow = 0, noVersionAvailable = 0;
  const updates: Array<{ id: string; abc_item_id: string; factor_version: string }> = [];

  for (const m of mappings) {
    let row: Record<string, unknown> | null = null;
    let version: string | null = null;

    if (m.source_tier === "ecoinvent") {
      row = m.ecoinvent_product_id ? ecoinventByKey.get(`${m.ecoinvent_product_id}|${m.ecoinvent_activity_id}`) ?? null : null;
      version = row ? buildFactorVersion("ecoinvent", row) : null;
    } else if (m.source_tier === "ghg_protocol") {
      row = m.ghg_factor_id != null ? ghgById.get(m.ghg_factor_id) ?? null : null;
      version = row ? buildFactorVersion("ghg_protocol", row) : null;
    } else if (m.source_tier === "epd") {
      row = m.epd_id != null ? epdById.get(m.epd_id) ?? null : null;
      version = row ? buildFactorVersion("epd", row) : null;
    } else if (m.source_tier === "cecarbon") {
      // Sem id estruturado (nunca existiu) — mesma extração best-effort do
      // texto que a rota de mapping já usa em tempo real.
      version = extractYearFromText(m.factor_source);
      row = version ? {} : null; // só pra não cair em "sem linha fonte" no log
    }

    if (!row) { noSourceRow++; continue; }
    if (!version) { noVersionAvailable++; continue; }

    computed++;
    updates.push({ id: m.id, abc_item_id: m.abc_item_id, factor_version: version });
  }

  console.log(`${computed} versões calculadas | ${noSourceRow} sem linha fonte (id salvo não resolve mais) | ${noVersionAvailable} fonte sem dado de versão.`);

  // item_mappings: um update por linha (supabase-js não faz bulk update com
  // valores diferentes por linha sem upsert-by-id).
  let mappingsUpdated = 0;
  for (const u of updates) {
    const { error } = await supabase.from("item_mappings").update({ factor_version: u.factor_version }).eq("id", u.id);
    if (error) { console.warn(`  falha ao atualizar mapping ${u.id}: ${error.message}`); continue; }
    mappingsUpdated++;
  }
  console.log(`item_mappings atualizados: ${mappingsUpdated}/${updates.length}`);

  // scenario_items: propaga a versão pra toda linha de cenário que aponta
  // pro mesmo abc_item_id (pode haver mais de um cenário/curva por item).
  let scenarioItemsUpdated = 0;
  for (const chunk of chunkArray(updates, 50)) {
    for (const u of chunk) {
      const { data, error } = await supabase
        .from("scenario_items")
        .update({ factor_version: u.factor_version })
        .eq("abc_item_id", u.abc_item_id)
        .is("factor_version", null)
        .select("id");
      if (error) { console.warn(`  falha ao atualizar scenario_items de ${u.abc_item_id}: ${error.message}`); continue; }
      scenarioItemsUpdated += data?.length ?? 0;
    }
  }
  console.log(`scenario_items atualizados: ${scenarioItemsUpdated}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
