/**
 * Copia os projetos "RDL — EAP R07 Valor Meta" (proj-202607-rdl-eap) e
 * "Vinícola Villa Santa Maria" (proj-202608-invino-vsm), importados em ZNIT
 * TECNOLOGIA LTDA, para a organização Grupo HTB como projetos independentes
 * (não move — os originais continuam em ZNIT TECNOLOGIA LTDA).
 *
 * Mesmo padrão de copy-640-ht-vale-to-fortes.ts: curvas/itens/mapeamentos
 * copiados com select("*") + remapeamento de ids, preservando os mapeamentos
 * existentes. Diferenças:
 *   - imported_by/cenário atribuídos ao usuário do Grupo HTB (não ao de ZNIT);
 *   - itens de mão de obra que duplicam o volume de concreto já contado no
 *     item de material são excluídos com justificativa (ver LABOR_EXCLUSIONS);
 *   - roda o auto-map nos itens ainda `pending` (o matcher evoluiu desde a
 *     importação de 2026-08-28);
 *   - sugestões do auto-map com confiança `low` que nunca foram revisadas
 *     (mapped_by = "auto") NÃO entram no cálculo: as criadas nesta execução
 *     são todas revertidas, e as herdadas da origem são revertidas quando a
 *     unidade converte (i.e. quando estariam somando carbono). As herdadas
 *     com unidade incompatível ficam como dica para revisão (contribuem 0) —
 *     várias têm o material certo e só precisam de conversão (ex.: Steel Deck
 *     m² × fator por t);
 *   - mapeamentos curados (CURATED_MAPPINGS) para itens que o auto-map não
 *     casou mas cujo fator é inequívoco, reaproveitando o fator de um item
 *     irmão de mesma unidade.
 *
 * Nenhum mapeamento da origem foi revisado por humano (revisão manual grava
 * mapped_by = user.id e confidence = "high"); o status `manual` dos itens
 * vem do próprio auto-map para sugestões abaixo de `high`.
 *
 * Uso:
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/copy-202607-202608-to-htb.ts
 *
 * Re-execução é idempotente: os projetos de destino (ids fixos) são
 * removidos e recopiados — só se pertencerem ao Grupo HTB.
 */
import { supabase } from "../lib/server/supabase";
import { runAutoMapForCurve } from "../lib/server/auto-map";
import { createBaseScenario, getConversionStatus } from "../lib/server/calculator";
import { chunkArray } from "../lib/server/db-utils";

const DEST_COMPANY_ID = "d2afedd7-8332-4b8f-88a6-3b7069f6b73a"; // Grupo HTB
const USER_EMAIL = "jbpalermo@gmail.com";

interface LaborExclusion {
  cost_code: string;
  justification: string;
}

// Mão de obra de concreto mapeada (pelo auto-map) para fator de concreto: o
// material já está contado no item "Concreto dosado em central" de mesmo
// volume — sem exclusão o concreto entra duas vezes (~698 t no RDL).
const LABOR_EXCLUSIONS: Record<string, LaborExclusion[]> = {
  "proj-202607-rdl-eap": [
    { cost_code: "2.08.03.07.01.22", justification: "Mão de obra — concreto (1.980 m³) já contabilizado em 2.08.03.07.01.23" },
    { cost_code: "2.08.03.06.01.34", justification: "Mão de obra — concreto (453,4 m³) já contabilizado nos itens 2.08.03.06.01.05/.10/.15/.20/.27/.32" },
    { cost_code: "2.08.02.08.01.07", justification: "Mão de obra — concreto (314 m³) já contabilizado em 2.08.02.08.01.06" },
    { cost_code: "2.08.02.07.01.12", justification: "Mão de obra — concreto (298 m³) já contabilizado em 2.08.02.07.01.14" },
  ],
};

interface CuratedMapping {
  cost_code: string;
  /** Item da mesma curva cujo fator é reaproveitado (mesma unidade). */
  factor_from_cost_code: string;
  note: string;
}

// Itens que o auto-map não casou mas cujo fator é inequívoco.
const CURATED_MAPPINGS: Record<string, CuratedMapping[]> = {
  "proj-202607-rdl-eap": [
    {
      cost_code: "2.08.02.06.01.11",
      factor_from_cost_code: "2.08.02.08.01.05",
      note: "Curadoria ZNIT (2026-10-26): armação da estaca raiz — mesmo fator das demais armações CA-50/CA-60 do orçamento.",
    },
  ],
};

const COPIES = [
  { source: "proj-202607-rdl-eap", dest: "proj-202607-rdl-eap-htb" },
  { source: "proj-202608-invino-vsm", dest: "proj-202608-invino-vsm-htb" },
];

async function applyCuratedMappings(curveId: string, curated: CuratedMapping[], userId: string) {
  const FACTOR_FIELDS = [
    "source_tier", "ecoinvent_product_id", "ecoinvent_activity_id", "ghg_factor_id", "epd_id",
    "factor_value", "factor_unit", "product_unit", "factor_name", "factor_source", "factor_version",
  ];
  for (const c of curated) {
    const { data: target } = await supabase
      .from("abc_items")
      .select("id, unit, mapping_status")
      .eq("abc_curve_id", curveId)
      .eq("cost_code", c.cost_code)
      .single();
    const { data: ref } = await supabase
      .from("abc_items")
      .select("id, unit")
      .eq("abc_curve_id", curveId)
      .eq("cost_code", c.factor_from_cost_code)
      .single();
    if (!target || !ref) throw new Error(`curadoria ${c.cost_code}: item ou referência não encontrado`);
    if (target.unit !== ref.unit) throw new Error(`curadoria ${c.cost_code}: unidade ${target.unit} ≠ ${ref.unit}`);
    if (target.mapping_status !== "pending") throw new Error(`curadoria ${c.cost_code}: status ${target.mapping_status}, esperado pending`);

    const { data: refMapping } = await supabase.from("item_mappings").select("*").eq("abc_item_id", ref.id).single();
    if (!refMapping) throw new Error(`curadoria ${c.cost_code}: referência sem mapeamento`);

    const factor: Record<string, unknown> = {};
    for (const f of FACTOR_FIELDS) if (f in refMapping) factor[f] = refMapping[f];
    const { error } = await supabase.from("item_mappings").insert({
      ...factor,
      abc_item_id: target.id,
      confidence: "high",
      mapped_by: userId,
      notes: c.note,
    });
    if (error) throw new Error(`curadoria ${c.cost_code}: ${error.message}`);
    await supabase.from("abc_items").update({ mapping_status: "manual" }).eq("id", target.id);
  }
  console.log(`  ${curated.length} mapeamento(s) curado(s) aplicado(s)`);
}

async function excludeLaborItems(curveId: string, exclusions: LaborExclusion[]) {
  for (const ex of exclusions) {
    const { data: matches } = await supabase
      .from("abc_items")
      .select("id, description")
      .eq("abc_curve_id", curveId)
      .eq("cost_code", ex.cost_code)
      .ilike("description", "m_o de obra%");
    if (!matches || matches.length !== 1) {
      throw new Error(`exclusão ${ex.cost_code}: esperado 1 item de mão de obra, achou ${matches?.length ?? 0}`);
    }
    const itemId = matches[0].id as string;
    const { error: delErr } = await supabase.from("item_mappings").delete().eq("abc_item_id", itemId);
    if (delErr) throw new Error(`exclusão ${ex.cost_code}: ${delErr.message}`);
    // Mesmo formato da exclusão manual em app/api/emission-factors/mapping/[itemId].
    const { error: insErr } = await supabase.from("item_mappings").insert({
      abc_item_id: itemId,
      source_tier: "excluded",
      factor_value: 0.0,
      factor_unit: "kg CO2-Eq",
      factor_name: "Excluído",
      mapped_by: "excluded",
      exclusion_justification: ex.justification,
    });
    if (insErr) throw new Error(`exclusão ${ex.cost_code}: ${insErr.message}`);
    await supabase.from("abc_items").update({ mapping_status: "excluded" }).eq("id", itemId);
  }
  console.log(`  ${exclusions.length} itens de mão de obra excluídos (concreto duplicado)`);
}

async function revertUnreviewedLowSuggestions(curveId: string, inheritedMappingIds: Set<string>) {
  const { data: items } = await supabase
    .from("abc_items")
    .select("id, description, unit")
    .eq("abc_curve_id", curveId);
  const itemById = new Map((items ?? []).map((i) => [i.id as string, i]));

  const toRevert: Array<{ mappingId: string; itemId: string }> = [];
  let inheritedCounted = 0;
  let createdHere = 0;
  for (const chunk of chunkArray([...itemById.keys()], 100)) {
    const { data, error } = await supabase
      .from("item_mappings")
      .select("id, abc_item_id, factor_value, factor_unit, unit_override, manual_conversion_factor")
      .in("abc_item_id", chunk)
      .eq("mapped_by", "auto")
      .eq("confidence", "low");
    if (error) throw new Error(`fetch low suggestions: ${error.message}`);
    for (const m of data ?? []) {
      const item = itemById.get(m.abc_item_id as string)!;
      if (!inheritedMappingIds.has(m.id as string)) {
        createdHere++;
      } else {
        const conv = getConversionStatus(item.description as string, item.unit as string, m.factor_unit as string, {
          unitOverride: m.unit_override as string | null,
          conversionFactor: m.manual_conversion_factor as number | null,
        });
        if (!((m.factor_value as number) > 0 && conv.factor > 0)) continue;
        inheritedCounted++;
      }
      toRevert.push({ mappingId: m.id as string, itemId: m.abc_item_id as string });
    }
  }

  for (const chunk of chunkArray(toRevert, 100)) {
    const { error } = await supabase.from("item_mappings").delete().in("id", chunk.map((r) => r.mappingId));
    if (error) throw new Error(`revert mappings: ${error.message}`);
    const { error: upErr } = await supabase
      .from("abc_items")
      .update({ mapping_status: "pending" })
      .in("id", chunk.map((r) => r.itemId));
    if (upErr) throw new Error(`revert items: ${upErr.message}`);
  }
  console.log(
    `  sugestões low revertidas: ${createdHere} desta execução + ${inheritedCounted} herdadas que somavam carbono`
  );
}

async function cleanupProject(projectId: string) {
  const { data: existing } = await supabase
    .from("projects")
    .select("company_id")
    .eq("id", projectId)
    .maybeSingle();
  if (!existing) return;
  if (existing.company_id !== DEST_COMPANY_ID) {
    throw new Error(`${projectId} existe fora do Grupo HTB (${existing.company_id}) — abortando cleanup`);
  }

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

async function logResult(label: string, scenarioId: string) {
  const { data: res } = await supabase
    .from("scenario_results")
    .select("total_tco2e, items_total, items_mapped, coverage_pct")
    .eq("scenario_id", scenarioId)
    .single();
  if (res) {
    console.log(
      `  ${label}: ${res.total_tco2e?.toFixed(1)} tCO2e | cobertura ${res.coverage_pct}% (${res.items_mapped}/${res.items_total})`
    );
  }
}

async function copyProject(sourceId: string, destId: string, userId: string) {
  const { data: srcProject } = await supabase.from("projects").select("*").eq("id", sourceId).single();
  if (!srcProject) throw new Error(`Projeto origem não encontrado: ${sourceId}`);

  console.log(`=== ${srcProject.name} (${sourceId} → ${destId})`);

  await cleanupProject(destId);

  const { id: _srcId, company_id: _srcCompany, created_at: _c, ...projectRest } = srcProject as Record<string, unknown>;
  const { error: projErr } = await supabase.from("projects").insert({
    ...projectRest,
    id: destId,
    company_id: DEST_COMPANY_ID,
  });
  if (projErr) throw new Error(`insert project: ${projErr.message}`);

  const { data: srcCurves } = await supabase.from("abc_curves").select("*").eq("project_id", sourceId);
  if (!srcCurves || srcCurves.length === 0) throw new Error("Projeto origem não tem curvas");

  for (const srcCurve of srcCurves) {
    const { data: srcItems } = await supabase.from("abc_items").select("*").eq("abc_curve_id", srcCurve.id);
    if (!srcItems || srcItems.length === 0) throw new Error(`Curva ${srcCurve.id} sem itens`);

    const { id: srcCurveId, project_id: _p, ...curveRest } = srcCurve as Record<string, unknown>;
    const { data: newCurve, error: curveErr } = await supabase
      .from("abc_curves")
      .insert({ ...curveRest, project_id: destId, imported_by_user_id: userId })
      .select("id")
      .single();
    if (curveErr || !newCurve) throw new Error(`insert curve: ${curveErr?.message}`);

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

    const srcMappings: Record<string, unknown>[] = [];
    for (const chunk of chunkArray(srcItems.map((i) => i.id as string), 100)) {
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

    const { data: srcScenario } = await supabase
      .from("scenarios")
      .select("name, is_base")
      .eq("project_id", sourceId)
      .eq("abc_curve_id", srcCurveId)
      .maybeSingle();
    const scenarioOpts = {
      abcCurveId: newCurve.id as string,
      scenarioName: (srcScenario?.name as string) ?? "Cenário Base",
      isBase: (srcScenario?.is_base as boolean) ?? true,
    };

    // Linha de base: só a cópia (com a correção de unidade "unid.").
    const { scenario: baseline } = await createBaseScenario(destId, userId, scenarioOpts);
    const baselineId = (baseline as { id: string }).id;
    await logResult("cópia", baselineId);

    const exclusions = LABOR_EXCLUSIONS[sourceId] ?? [];
    if (exclusions.length > 0) await excludeLaborItems(newCurve.id as string, exclusions);

    const inheritedMappingIds = new Set<string>();
    for (const chunk of chunkArray(newItems.map((i) => i.id as string), 100)) {
      const { data } = await supabase.from("item_mappings").select("id").in("abc_item_id", chunk);
      for (const m of data ?? []) inheritedMappingIds.add(m.id as string);
    }

    const autoMap = await runAutoMapForCurve(newCurve.id as string, DEST_COMPANY_ID);
    console.log(`  auto-map (pendentes): ${JSON.stringify(autoMap)}`);

    await revertUnreviewedLowSuggestions(newCurve.id as string, inheritedMappingIds);

    const curated = CURATED_MAPPINGS[sourceId] ?? [];
    if (curated.length > 0) await applyCuratedMappings(newCurve.id as string, curated, userId);

    // Cenário final recriado com exclusões + auto-map + reversões + curadoria.
    const { error: delErr } = await supabase.from("scenarios").delete().eq("id", baselineId);
    if (delErr) throw new Error(`delete baseline scenario: ${delErr.message}`);
    const { scenario } = await createBaseScenario(destId, userId, scenarioOpts);
    await logResult("final", (scenario as { id: string }).id);
    console.log();
  }
}

async function main() {
  const { data: destCompany } = await supabase.from("companies").select("id, name").eq("id", DEST_COMPANY_ID).single();
  if (!destCompany) throw new Error(`Empresa de destino não encontrada: ${DEST_COMPANY_ID}`);

  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("company_id", DEST_COMPANY_ID)
    .eq("email", USER_EMAIL)
    .single();
  if (!user) throw new Error(`Usuário ${USER_EMAIL} não encontrado em ${destCompany.name}`);

  console.log(`Copiando para "${destCompany.name}" (${DEST_COMPANY_ID})\n`);
  for (const c of COPIES) await copyProject(c.source, c.dest, user.id);
  console.log(`Cópia concluída.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
