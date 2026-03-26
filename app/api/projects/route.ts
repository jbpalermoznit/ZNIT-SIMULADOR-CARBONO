import { NextRequest } from "next/server";
import { supabase } from "@/lib/server/supabase";
import { getCurrentUser, unauthorized } from "@/lib/server/auth";
import type { AuthUser } from "@/lib/server/auth";

// ---------------------------------------------------------------------------
// GET /api/projects — list projects with stats
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  let user: AuthUser;
  try {
    user = await getCurrentUser(req);
  } catch {
    return unauthorized();
  }

  const { data: projects, error } = await supabase
    .from("projects")
    .select("*")
    .eq("company_id", user.company_id)
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json({ detail: error.message }, { status: 500 });
  }

  const results = [];

  for (const p of projects ?? []) {
    // Count scenarios
    const { count: scenariosCount } = await supabase
      .from("scenarios")
      .select("*", { count: "exact", head: true })
      .eq("project_id", p.id);

    // Count items from latest curve
    const { data: curves } = await supabase
      .from("abc_curves")
      .select("id")
      .eq("project_id", p.id)
      .order("imported_at", { ascending: false })
      .limit(1);

    const curve = curves?.[0];
    let itemsCount = 0;
    if (curve) {
      const { count } = await supabase
        .from("abc_items")
        .select("*", { count: "exact", head: true })
        .eq("abc_curve_id", curve.id);
      itemsCount = count ?? 0;
    }

    // Get base scenario result
    const { data: baseScenarios } = await supabase
      .from("scenarios")
      .select("id")
      .eq("project_id", p.id)
      .eq("is_base", true)
      .limit(1);

    const base = baseScenarios?.[0];
    let totalTco2e: number | null = null;
    let intensityKgco2ePerM2: number | null = null;
    let coveragePct: number | null = null;

    if (base) {
      const { data: result } = await supabase
        .from("scenario_results")
        .select("*")
        .eq("scenario_id", base.id)
        .single();

      if (result) {
        totalTco2e = result.total_tco2e;
        intensityKgco2ePerM2 =
          result.total_tco2e && p.total_area_m2
            ? (result.total_tco2e * 1000) / p.total_area_m2
            : null;
        coveragePct = result.coverage_pct;
      }
    }

    results.push({
      id: p.id,
      company_id: p.company_id,
      name: p.name,
      client_name: p.client_name,
      address: p.address,
      total_area_m2: p.total_area_m2,
      building_type: p.building_type,
      status: p.status,
      created_at: p.created_at,
      total_tco2e: totalTco2e,
      intensity_kgco2e_per_m2: intensityKgco2ePerM2,
      coverage_pct: coveragePct,
      scenarios_count: scenariosCount ?? 0,
      items_count: itemsCount,
    });
  }

  return Response.json(results);
}

// ---------------------------------------------------------------------------
// POST /api/projects — create project
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  let user: AuthUser;
  try {
    user = await getCurrentUser(req);
  } catch {
    return unauthorized();
  }

  try {
    const body = await req.json();

    const { data: project, error } = await supabase
      .from("projects")
      .insert({
        company_id: user.company_id,
        name: body.name,
        client_name: body.client_name,
        address: body.address,
        total_area_m2: body.total_area_m2,
        building_type: body.building_type,
        status: body.status ?? "active",
      })
      .select()
      .single();

    if (error) {
      return Response.json({ detail: error.message }, { status: 400 });
    }

    return Response.json(project, { status: 201 });
  } catch (err) {
    console.error("Create project error:", err);
    return Response.json({ detail: "Erro interno" }, { status: 500 });
  }
}
