/**
 * GET/PUT /api/emission-factors/mapping/[itemId]
 * Get or confirm/update the emission factor mapping for an item.
 * Port of backend/app/api/emission_factors.py — get_mapping, confirm_mapping
 */

import { NextRequest } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/server/auth";
import { supabase } from "@/lib/server/supabase";
import {
  getEcoinventById,
  getGhgById,
  getEpdById,
} from "@/lib/server/supabase-emission";
import { applyFactorToScenarioItem } from "@/lib/server/calculator";
import {
  assertScenarioOwnership,
  assertItemOwnership,
  ForbiddenError,
  forbidden,
} from "@/lib/server/access";

// PUT can fork a scenario + recalc, which adds latency on big scenarios.
export const maxDuration = 60;

// ---------------------------------------------------------------------------
// GET — current mapping for an item
// ---------------------------------------------------------------------------

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  let user;
  try {
    user = await getCurrentUser(req);
  } catch {
    return unauthorized();
  }

  const { itemId } = await params;

  // Escopo por empresa: sem isto, qualquer usuário autenticado lia o
  // mapeamento de itens de outras empresas passando o id cru.
  try {
    await assertItemOwnership(itemId, user);
  } catch (e) {
    if (e instanceof ForbiddenError) return forbidden(e.message);
    throw e;
  }

  const { data: mapping } = await supabase
    .from("item_mappings")
    .select("*")
    .eq("abc_item_id", itemId)
    .limit(1)
    .maybeSingle();

  if (!mapping) {
    return Response.json(null);
  }

  return Response.json({
    id: mapping.id,
    abc_item_id: mapping.abc_item_id,
    source_tier: mapping.source_tier,
    factor_value: mapping.factor_value,
    factor_unit: mapping.factor_unit,
    factor_name: mapping.factor_name,
    factor_source: mapping.factor_source,
    confidence: mapping.confidence,
    similarity_score: mapping.similarity_score,
    mapped_by: mapping.mapped_by,
    notes: mapping.notes,
    exclusion_justification: mapping.exclusion_justification ?? null,
  });
}

// ---------------------------------------------------------------------------
// PUT — confirm or create manual mapping
// ---------------------------------------------------------------------------

interface MappingConfirmBody {
  source_tier: string;
  factor_value?: number | null;
  factor_unit?: string;
  factor_name?: string;
  ecoinvent_product_id?: string | null;
  ecoinvent_activity_id?: string | null;
  ghg_factor_id?: number | null;
  epd_id?: number | null;
  custom_factor_source?: string | null;
  distance_km?: number | null;
  transport_modal?: string | null;
  exclusion_justification?: string | null;
  notes?: string | null;
  // Scenario-aware save: if provided, the edit also propagates to scenario_items.
  //   mode=update → modify the given scenario in place + recalc
  //   mode=fork   → clone the given scenario, apply the edit on the clone,
  //                 recalc the clone, return its id in `new_scenario_id`
  scenario_id?: string;
  mode?: "update" | "fork";
  new_scenario_name?: string;
  new_scenario_description?: string;
  /** Analyst-declared new unit cost when substituting a factor (typically
   *  EPD). `null` clears any existing override; `undefined` leaves it
   *  alone. Persisted to scenario_items.unit_cost_override. */
  unit_cost_override?: number | null;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  let user;
  try {
    user = await getCurrentUser(req);
  } catch {
    return unauthorized();
  }

  const { itemId } = await params;
  const body: MappingConfirmBody = await req.json();

  // Check item exists AND belongs to the caller's company (sem isto,
  // qualquer usuário autenticado sobrescrevia mapeamentos de outra empresa).
  try {
    await assertItemOwnership(itemId, user);
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return e.message === "Item não encontrado"
        ? Response.json({ detail: "Item não encontrado" }, { status: 404 })
        : forbidden(e.message);
    }
    throw e;
  }

  // Remove existing mapping
  await supabase.from("item_mappings").delete().eq("abc_item_id", itemId);

  let mappingData: Record<string, unknown>;

  if (body.source_tier === "excluded") {
    if (!body.exclusion_justification) {
      return Response.json(
        { detail: "Justificativa obrigatória para exclusão" },
        { status: 400 }
      );
    }
    mappingData = {
      abc_item_id: itemId,
      source_tier: "excluded",
      factor_value: 0.0,
      factor_unit: "kg CO2-Eq",
      factor_name: "Excluído",
      mapped_by: "excluded",
      exclusion_justification: body.exclusion_justification,
      notes: body.notes ?? null,
    };

    await supabase
      .from("abc_items")
      .update({ mapping_status: "excluded" })
      .eq("id", itemId);
  } else {
    if (body.factor_value == null) {
      return Response.json(
        { detail: "factor_value obrigatório" },
        { status: 400 }
      );
    }

    let factorName = body.factor_name ?? "";
    let factorSource = body.custom_factor_source ?? "";

    // Enrich with Supabase data if needed
    if (
      body.source_tier === "ecoinvent" &&
      body.ecoinvent_product_id
    ) {
      const row = await getEcoinventById(
        body.ecoinvent_product_id,
        body.ecoinvent_activity_id ?? ""
      );
      if (row) {
        factorName = factorName || ((row.product_name as string) ?? "");
        factorSource = `Ecoinvent — ${(row.activity_name as string) ?? ""}`;
      }
    } else if (
      body.source_tier === "ghg_protocol" &&
      body.ghg_factor_id
    ) {
      const row = await getGhgById(body.ghg_factor_id);
      if (row) {
        factorName = factorName || ((row.produto as string) ?? "");
        factorSource = `GHG Protocol BR ${(row.versao_ghg as string) ?? ""}`;
      }
    } else if (body.source_tier === "epd" && body.epd_id) {
      const row = await getEpdById(body.epd_id);
      if (row) {
        factorName = factorName || ((row.titulo as string) ?? "");
        const company = (row.company_name as string) ?? "";
        factorSource = company ? `EPD — ${company}` : "EPD";
      }
    }

    mappingData = {
      abc_item_id: itemId,
      source_tier: body.source_tier,
      ecoinvent_product_id: body.ecoinvent_product_id ?? null,
      ecoinvent_activity_id: body.ecoinvent_activity_id ?? null,
      ghg_factor_id: body.ghg_factor_id ?? null,
      epd_id: body.epd_id ?? null,
      factor_value: body.factor_value,
      factor_unit: body.factor_unit ?? "kgCO2e",
      factor_name: factorName,
      factor_source: factorSource,
      product_unit: null,
      confidence: "high",
      mapped_by:
        body.source_tier !== "user_custom" ? user.id : "user_custom",
      custom_factor_source: body.custom_factor_source ?? null,
      distance_km: body.distance_km ?? null,
      transport_modal: body.transport_modal ?? null,
      notes: body.notes ?? null,
    };

    await supabase
      .from("abc_items")
      .update({ mapping_status: "manual" })
      .eq("id", itemId);
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("item_mappings")
    .insert(mappingData)
    .select()
    .single();

  if (insertErr || !inserted) {
    return Response.json(
      { detail: `Erro ao salvar mapeamento: ${insertErr?.message}` },
      { status: 500 }
    );
  }

  // Scenario-aware propagation. When the client passes scenario_id + mode,
  // also apply the change to scenario_items so the active scenario reflects
  // the new factor without an extra "recalc" step.
  let newScenarioId: string | null = null;
  let scenarioApplyError: string | null = null;

  if (body.scenario_id && body.mode) {
    try {
      await assertScenarioOwnership(body.scenario_id, user);

      // Probe whether migration-v8-unit-cost-override.sql is applied.
      // If not, we silently skip the new column on inserts/updates so a
      // partially-deployed env still forks scenarios correctly (the
      // cost-change UI was hard-disabling user input until the column
      // is present anyway). When the migration is applied this branch
      // becomes a no-op.
      const probe = await supabase
        .from("scenario_items")
        .select("unit_cost_override")
        .limit(1);
      const unitCostColumnExists = !probe.error;
      if (!unitCostColumnExists) {
        console.warn(
          "[mapping PUT] migration-v8-unit-cost-override.sql not applied; " +
          "unit_cost_override will be ignored on this request",
        );
      }

      const factorPatch: import("@/lib/server/calculator").ScenarioItemFactorPatch = {
        factor_value: body.source_tier === "excluded" ? 0 : (body.factor_value ?? 0),
        factor_unit: body.source_tier === "excluded" ? "kg CO2-Eq" : (body.factor_unit ?? "kgCO2e"),
        factor_name: body.source_tier === "excluded" ? "Excluído" : (body.factor_name ?? ""),
        source_tier: body.source_tier,
        is_excluded: body.source_tier === "excluded",
        exclusion_reason: body.source_tier === "excluded" ? body.exclusion_justification ?? null : null,
      };
      // Propagate the analyst-declared new unit cost when present AND the
      // schema can hold it. Only forward the field if the request actually
      // carries it, so omitted payloads don't wipe a previous override.
      if (
        unitCostColumnExists &&
        Object.prototype.hasOwnProperty.call(body, "unit_cost_override")
      ) {
        factorPatch.unit_cost_override = body.unit_cost_override ?? null;
      }

      let targetScenarioId = body.scenario_id;

      if (body.mode === "fork") {
        const { data: srcScenario } = await supabase
          .from("scenarios")
          .select("project_id")
          .eq("id", body.scenario_id)
          .single();

        if (!srcScenario) throw new Error("Cenário origem não encontrado");

        const { data: newScenario, error: newErr } = await supabase
          .from("scenarios")
          .insert({
            project_id: srcScenario.project_id,
            name: body.new_scenario_name ?? "Cenário derivado",
            description: body.new_scenario_description ?? null,
            is_base: false,
            created_by: user.id,
          })
          .select("id")
          .single();

        if (newErr || !newScenario) throw new Error(newErr?.message ?? "Erro ao criar cenário");

        const { data: sourceItems } = await supabase
          .from("scenario_items")
          .select("*")
          .eq("scenario_id", body.scenario_id);

        if (sourceItems && sourceItems.length > 0) {
          const cloned = sourceItems.map((si) => {
            const row: Record<string, unknown> = {
              scenario_id: newScenario.id,
              abc_item_id: si.abc_item_id,
              factor_value: si.factor_value,
              factor_unit: si.factor_unit,
              factor_name: si.factor_name,
              source_tier: si.source_tier,
              quantity_override: si.quantity_override,
              emission_kgco2e: si.emission_kgco2e,
              emission_scope3_logistics_kgco2e: si.emission_scope3_logistics_kgco2e,
              is_excluded: si.is_excluded,
              exclusion_reason: si.exclusion_reason,
            };
            if (unitCostColumnExists) {
              row.unit_cost_override = si.unit_cost_override ?? null;
            }
            return row;
          });
          const { error: cloneErr } = await supabase
            .from("scenario_items")
            .insert(cloned);
          // Surface clone failures — silent failure is what zeroed the
          // forked scenario emissions and made items show 'pendente' in
          // the tCO₂e column.
          if (cloneErr) {
            throw new Error(
              `Erro ao clonar itens do cenário: ${cloneErr.message}`,
            );
          }
        }

        targetScenarioId = newScenario.id;
        newScenarioId = newScenario.id;
      }

      await applyFactorToScenarioItem(targetScenarioId, itemId, factorPatch);
    } catch (e) {
      if (e instanceof ForbiddenError) return forbidden(e.message);
      scenarioApplyError = e instanceof Error ? e.message : "Erro ao aplicar no cenário";
      console.error("[mapping PUT] scenario apply failed", e);
    }
  }

  // Sem contexto de cenário, o mapping mudou mas os cenários que referenciam
  // este item mantêm o fator congelado (comportamento intencional — cenários
  // fotografam o fator ao salvar). Devolve QUAIS cenários ficaram
  // desatualizados para a UI avisar, em vez de divergir em silêncio.
  let staleScenarios: Array<{ id: string; name: string | null }> = [];
  if (!body.scenario_id || !body.mode) {
    const { data: refs } = await supabase
      .from("scenario_items")
      .select("scenario_id")
      .eq("abc_item_id", itemId);
    const ids = [...new Set((refs ?? []).map((r) => r.scenario_id))];
    if (ids.length > 0) {
      const { data: scens } = await supabase
        .from("scenarios")
        .select("id, name")
        .in("id", ids);
      staleScenarios = (scens ?? []).map((s) => ({ id: s.id, name: s.name }));
    }
  }

  return Response.json({
    id: inserted.id,
    abc_item_id: inserted.abc_item_id,
    source_tier: inserted.source_tier,
    factor_value: inserted.factor_value,
    factor_unit: inserted.factor_unit,
    factor_name: inserted.factor_name,
    factor_source: inserted.factor_source,
    confidence: inserted.confidence,
    similarity_score: inserted.similarity_score,
    mapped_by: inserted.mapped_by,
    notes: inserted.notes,
    new_scenario_id: newScenarioId,
    scenario_apply_error: scenarioApplyError,
    stale_scenarios: staleScenarios,
  });
}
