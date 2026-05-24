/**
 * POST /api/emission-factors/auto-map/[projectId]
 * Auto-map all pending Type A items in a project (latest ABC curve).
 */

import { NextRequest } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/server/auth";
import { supabase } from "@/lib/server/supabase";
import { runAutoMapForCurve } from "@/lib/server/auto-map";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  let user;
  try {
    user = await getCurrentUser(req);
  } catch {
    return unauthorized();
  }

  const { projectId } = await params;

  // Verify the project belongs to the user's company before touching anything.
  const { data: project } = await supabase
    .from("projects")
    .select("id, company_id")
    .eq("id", projectId)
    .eq("company_id", user.company_id)
    .single();

  if (!project) {
    return Response.json({ detail: "Projeto não encontrado" }, { status: 404 });
  }

  const { data: curves } = await supabase
    .from("abc_curves")
    .select("id")
    .eq("project_id", projectId)
    .order("imported_at", { ascending: false })
    .limit(1);

  const curve = curves?.[0];
  if (!curve) {
    return Response.json(
      { detail: "Nenhuma curva ABC encontrada" },
      { status: 404 }
    );
  }

  const result = await runAutoMapForCurve(curve.id, user.company_id);
  return Response.json(result);
}
