import { NextRequest } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/server/auth";
import { projectBelongsToCompany } from "@/lib/server/tenant";
import { applyDecisions } from "@/lib/server/agent/action-applier";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  let user;
  try { user = await getCurrentUser(req); } catch { return unauthorized(); }

  const { projectId } = await params;

  // Tenant scope: only act on projects owned by the caller's company.
  if (!(await projectBelongsToCompany(projectId, user.company_id))) {
    return Response.json({ detail: "Projeto não encontrado" }, { status: 404 });
  }

  const body = await req.json();
  const { decisions } = body;

  const result = await applyDecisions(decisions, projectId, user.id, user.company_id);
  return Response.json(result);
}
