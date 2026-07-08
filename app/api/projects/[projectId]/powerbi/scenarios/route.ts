import { NextRequest } from "next/server";
import { supabase } from "@/lib/server/supabase";
import { authenticatePowerBI, powerbiUnauthorized } from "@/lib/server/powerbi-auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  if (!authenticatePowerBI(req)) {
    return powerbiUnauthorized();
  }

  const { projectId } = await params;

  const { data: project } = await supabase.from("projects").select("name").eq("id", projectId).single();
  if (!project) return Response.json({ detail: "Projeto não encontrado" }, { status: 404 });

  const { data: scenarios } = await supabase.from("scenarios").select("*").eq("project_id", projectId);

  const rows = [];
  for (const scen of scenarios ?? []) {
    const { data: result } = await supabase.from("scenario_results").select("*").eq("scenario_id", scen.id).single();
    rows.push({
      projeto: project.name,
      cenario: scen.name,
      cenario_id: scen.id,
      eh_base: scen.is_base,
      status: scen.status,
      total_tco2e: result?.total_tco2e ?? 0,
      cobertura_pct: result?.coverage_pct ?? 0,
    });
  }

  return Response.json(rows);
}
