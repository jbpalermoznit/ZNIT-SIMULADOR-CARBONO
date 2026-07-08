import { NextRequest } from "next/server";
import { supabase } from "@/lib/server/supabase";
import { getCurrentUser, unauthorized } from "@/lib/server/auth";
import type { AuthUser } from "@/lib/server/auth";
import { recalculateScenario } from "@/lib/server/calculator";
import { assertProjectOwnership, ForbiddenError, forbidden } from "@/lib/server/access";

// ---------------------------------------------------------------------------
// GET /api/projects/[projectId]/scenarios — list scenarios with results
// ---------------------------------------------------------------------------
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  let user: AuthUser;
  try {
    user = await getCurrentUser(req);
  } catch {
    return unauthorized();
  }

  const { projectId } = await params;

  // Escopo por empresa: sem isto, qualquer usuário autenticado listava os
  // cenários (com resultados completos) de qualquer projeto pelo id cru.
  try {
    await assertProjectOwnership(projectId, user);
  } catch (e) {
    if (e instanceof ForbiddenError) return forbidden(e.message);
    throw e;
  }

  const { data: scenarios } = await supabase
    .from("scenarios")
    .select("*")
    .eq("project_id", projectId)
    .order("is_base", { ascending: false })
    .order("created_at", { ascending: true });

  const results = [];
  for (const s of scenarios ?? []) {
    const { count: itemCount } = await supabase
      .from("scenario_items")
      .select("*", { count: "exact", head: true })
      .eq("scenario_id", s.id);

    const { data: result } = await supabase
      .from("scenario_results")
      .select("*")
      .eq("scenario_id", s.id)
      .single();

    results.push({
      id: s.id,
      project_id: s.project_id,
      name: s.name,
      description: s.description,
      status: s.status,
      version: s.version,
      is_base: s.is_base,
      created_at: s.created_at,
      items_count: itemCount ?? 0,
      result: result ?? null,
    });
  }

  return Response.json(results);
}

// ---------------------------------------------------------------------------
// POST /api/projects/[projectId]/scenarios — create alternative scenario
// ---------------------------------------------------------------------------
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  let user: AuthUser;
  try {
    user = await getCurrentUser(req);
  } catch {
    return unauthorized();
  }

  const { projectId } = await params;

  // Verify project
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("company_id", user.company_id)
    .single();

  if (!project) {
    return Response.json(
      { detail: "Projeto não encontrado" },
      { status: 404 }
    );
  }

  try {
    const body = await req.json();

    const { data: scenario, error: scErr } = await supabase
      .from("scenarios")
      .insert({
        project_id: projectId,
        name: body.name,
        description: body.description ?? null,
        is_base: false,
        created_by: user.id,
      })
      .select()
      .single();

    if (scErr || !scenario) {
      return Response.json(
        { detail: scErr?.message ?? "Erro ao criar cenário" },
        { status: 400 }
      );
    }

    // If duplicating from another scenario, copy items
    let copiedItems = false;
    if (body.source_scenario_id) {
      // O cenário-origem precisa pertencer a ESTE projeto (já validado como
      // da empresa do usuário) — sem isto, um id de outro tenant era copiado.
      const { data: srcScenario } = await supabase
        .from("scenarios")
        .select("id")
        .eq("id", body.source_scenario_id)
        .eq("project_id", projectId)
        .single();
      if (!srcScenario) {
        await supabase.from("scenarios").delete().eq("id", scenario.id);
        return Response.json(
          { detail: "Cenário origem não encontrado neste projeto" },
          { status: 404 }
        );
      }

      const { data: sourceItems } = await supabase
        .from("scenario_items")
        .select("*")
        .eq("scenario_id", body.source_scenario_id);

      if (sourceItems && sourceItems.length > 0) {
        const newItems = sourceItems.map((si) => ({
          scenario_id: scenario.id,
          abc_item_id: si.abc_item_id,
          factor_value: si.factor_value,
          factor_unit: si.factor_unit,
          factor_name: si.factor_name,
          source_tier: si.source_tier,
          quantity_override: si.quantity_override,
          emission_kgco2e: si.emission_kgco2e,
          emission_scope3_logistics_kgco2e:
            si.emission_scope3_logistics_kgco2e,
          is_excluded: si.is_excluded,
          exclusion_reason: si.exclusion_reason,
        }));

        await supabase.from("scenario_items").insert(newItems);
        copiedItems = true;
      }
    }

    // O cenário duplicado precisa nascer com scenario_results — sem isto a
    // lista mostrava totais em branco até alguém disparar /calculate.
    let result: unknown = null;
    if (copiedItems) {
      try {
        result = await recalculateScenario(scenario.id);
      } catch (e) {
        console.error("Recalc do cenário duplicado falhou:", e);
      }
    }

    const { count: itemCount } = await supabase
      .from("scenario_items")
      .select("*", { count: "exact", head: true })
      .eq("scenario_id", scenario.id);

    return Response.json(
      {
        id: scenario.id,
        project_id: scenario.project_id,
        name: scenario.name,
        description: scenario.description,
        status: scenario.status,
        version: scenario.version,
        is_base: scenario.is_base,
        created_at: scenario.created_at,
        items_count: itemCount ?? 0,
        result,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("Create scenario error:", err);
    return Response.json({ detail: "Erro interno" }, { status: 500 });
  }
}
