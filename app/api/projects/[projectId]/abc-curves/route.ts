import { NextRequest } from "next/server";
import { supabase } from "@/lib/server/supabase";
import { getCurrentUser, unauthorized } from "@/lib/server/auth";
import type { AuthUser } from "@/lib/server/auth";

// ---------------------------------------------------------------------------
// GET /api/projects/[projectId]/abc-curves
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

  const { data: curves } = await supabase
    .from("abc_curves")
    .select("*")
    .eq("project_id", projectId)
    .order("imported_at", { ascending: false });

  return Response.json(curves ?? []);
}
