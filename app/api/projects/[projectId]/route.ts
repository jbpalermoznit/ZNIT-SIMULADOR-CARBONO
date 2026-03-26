import { NextRequest } from "next/server";
import { supabase } from "@/lib/server/supabase";
import { getCurrentUser, unauthorized } from "@/lib/server/auth";
import type { AuthUser } from "@/lib/server/auth";

// ---------------------------------------------------------------------------
// GET /api/projects/[projectId]
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

  const { data: project, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("company_id", user.company_id)
    .single();

  if (error || !project) {
    return Response.json(
      { detail: "Projeto não encontrado" },
      { status: 404 }
    );
  }

  return Response.json(project);
}
