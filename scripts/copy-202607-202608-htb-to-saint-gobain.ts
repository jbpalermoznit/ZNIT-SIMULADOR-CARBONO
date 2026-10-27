/**
 * Copia os projetos "RDL — EAP R07 Valor Meta" (proj-202607-rdl-eap-htb) e
 * "Vinícola Villa Santa Maria" (proj-202608-invino-vsm-htb), já curados no
 * Grupo HTB, para a organização Saint Gobain como projetos independentes
 * (não move — os originais continuam no Grupo HTB).
 *
 * Cópia pura, mesmo padrão de copy-640-ht-vale-to-fortes.ts: curvas, itens e
 * mapeamentos com select("*") + remapeamento de ids (inclui exclusões,
 * estimativas com aviso e conversões manuais da curadoria), e o cenário base
 * recriado via createBaseScenario. Rodar de novo depois de qualquer
 * re-curadoria no Grupo HTB para atualizar a cópia.
 *
 * Uso:
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/copy-202607-202608-htb-to-saint-gobain.ts
 *
 * Re-execução é idempotente: os projetos de destino (ids fixos) são
 * removidos e recopiados — só se pertencerem à Saint Gobain.
 */
import { supabase } from "../lib/server/supabase";
import { createBaseScenario } from "../lib/server/calculator";
import { chunkArray } from "../lib/server/db-utils";

const DEST_COMPANY_ID = "68bcd29f-0bb6-4a5c-92fb-8863e098de56"; // Saint Gobain
const USER_EMAIL = "jbpalermo@gmail.com";

const COPIES = [
  { source: "proj-202607-rdl-eap-htb", dest: "proj-202607-rdl-eap-sg" },
  { source: "proj-202608-invino-vsm-htb", dest: "proj-202608-invino-vsm-sg" },
];

async function cleanupProject(projectId: string) {
  const { data: existing } = await supabase.from("projects").select("company_id").eq("id", projectId).maybeSingle();
  if (!existing) return;
  if (existing.company_id !== DEST_COMPANY_ID) {
    throw new Error(`${projectId} existe fora da Saint Gobain (${existing.company_id}) — abortando cleanup`);
  }

  const { data: curves } = await supabase.from("abc_curves").select("id").eq("project_id", projectId);
  const curveIds = (curves ?? []).map((c) => c.id);

  for (const curveId of curveIds) {
    const { data: items } = await supabase.from("abc_items").select("id").eq("abc_curve_id", curveId);
    for (const chunk of chunkArray((items ?? []).map((i) => i.id), 100)) {
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

async function copyProject(sourceId: string, destId: string, userId: string) {
  const { data: srcProject } = await supabase.from("projects").select("*").eq("id", sourceId).single();
  if (!srcProject) throw new Error(`Projeto origem não encontrado: ${sourceId}`);
  console.log(`=== ${srcProject.name} (${sourceId} → ${destId})`);

  await cleanupProject(destId);

  const { id: _srcId, company_id: _srcCompany, created_at: _c, ...projectRest } = srcProject as Record<string, unknown>;
  const { error: projErr } = await supabase.from("projects").insert({ ...projectRest, id: destId, company_id: DEST_COMPANY_ID });
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
    for (const item of srcItems) idMap.set(item.id as string, `${newCurve.id}-${(item.id as string).split("-").slice(-5).join("-")}`);

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
    const { scenario } = await createBaseScenario(destId, userId, {
      abcCurveId: newCurve.id as string,
      scenarioName: (srcScenario?.name as string) ?? "Cenário Base",
      isBase: (srcScenario?.is_base as boolean) ?? true,
    });

    const { data: res } = await supabase
      .from("scenario_results")
      .select("total_tco2e, items_total, items_mapped, items_excluded, coverage_pct")
      .eq("scenario_id", (scenario as { id: string }).id)
      .single();
    if (res) {
      console.log(`  RESULTADO: ${res.total_tco2e?.toFixed(1)} tCO₂e | cobertura ${res.coverage_pct}% (${res.items_mapped}/${res.items_total - res.items_excluded})`);
    }
  }
}

async function main() {
  const { data: destCompany } = await supabase.from("companies").select("id, name").eq("id", DEST_COMPANY_ID).single();
  if (!destCompany) throw new Error(`Empresa de destino não encontrada: ${DEST_COMPANY_ID}`);
  const { data: user } = await supabase.from("users").select("id").eq("company_id", DEST_COMPANY_ID).eq("email", USER_EMAIL).single();
  if (!user) throw new Error(`Usuário ${USER_EMAIL} não encontrado em ${destCompany.name}`);

  console.log(`Copiando para "${destCompany.name}" (${DEST_COMPANY_ID})\n`);
  for (const c of COPIES) await copyProject(c.source, c.dest, user.id);
  console.log(`\nCópia concluída.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
