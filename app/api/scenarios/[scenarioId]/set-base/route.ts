import { NextRequest } from "next/server";
import { supabase } from "@/lib/server/supabase";
import { getCurrentUser, unauthorized } from "@/lib/server/auth";
import type { AuthUser } from "@/lib/server/auth";
import { assertScenarioOwnership, ForbiddenError, forbidden } from "@/lib/server/access";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ scenarioId: string }> }
) {
  let user: AuthUser;
  try {
    user = await getCurrentUser(req);
  } catch {
    return unauthorized();
  }

  const { scenarioId } = await params;

  let projectId: string;
  try {
    ({ projectId } = await assertScenarioOwnership(scenarioId, user));
  } catch (e) {
    if (e instanceof ForbiddenError) return forbidden(e.message);
    throw e;
  }

  // Unset all other base scenarios in the same project
  await supabase
    .from("scenarios")
    .update({ is_base: false })
    .eq("project_id", projectId)
    .eq("is_base", true);

  // Set this one as base
  await supabase
    .from("scenarios")
    .update({ is_base: true })
    .eq("id", scenarioId);

  return Response.json({ ok: true });
}
