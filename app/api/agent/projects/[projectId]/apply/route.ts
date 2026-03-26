import { NextRequest } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/server/auth";
import { applyDecisions } from "@/lib/server/agent/action-applier";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  let user;
  try { user = await getCurrentUser(req); } catch { return unauthorized(); }

  const { projectId } = await params;
  const body = await req.json();
  const { decisions } = body;

  const result = await applyDecisions(decisions, projectId, user.id);
  return Response.json(result);
}
