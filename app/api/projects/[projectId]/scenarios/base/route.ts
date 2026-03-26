import { NextRequest } from "next/server";
import { supabase } from "@/lib/server/supabase";
import { getCurrentUser, unauthorized } from "@/lib/server/auth";
import { createBaseScenario } from "@/lib/server/calculator";
import type { AuthUser } from "@/lib/server/auth";

// ---------------------------------------------------------------------------
// POST /api/projects/[projectId]/scenarios/base — create base scenario
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

  // Verify project belongs to user's company
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
    const { scenario, result } = await createBaseScenario(projectId, user.id);

    const { count: itemCount } = await supabase
      .from("scenario_items")
      .select("*", { count: "exact", head: true })
      .eq("scenario_id", scenario.id);

    return Response.json({
      id: scenario.id,
      project_id: scenario.project_id,
      name: scenario.name,
      description: scenario.description,
      status: scenario.status,
      version: scenario.version,
      is_base: scenario.is_base,
      created_at: scenario.created_at,
      items_count: itemCount ?? 0,
      result: result ?? null,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Erro ao criar cenário base";
    return Response.json({ detail: message }, { status: 400 });
  }
}
