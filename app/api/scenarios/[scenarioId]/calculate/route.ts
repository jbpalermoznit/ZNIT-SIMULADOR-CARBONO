import { NextRequest } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/server/auth";
import { recalculateScenario } from "@/lib/server/calculator";
import type { AuthUser } from "@/lib/server/auth";
import { assertScenarioOwnership, ForbiddenError, forbidden } from "@/lib/server/access";

export const maxDuration = 120;

// ---------------------------------------------------------------------------
// POST /api/scenarios/[scenarioId]/calculate — recalculate scenario
// ---------------------------------------------------------------------------
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

  try {
    await assertScenarioOwnership(scenarioId, user);
    const result = await recalculateScenario(scenarioId);
    return Response.json(result);
  } catch (err) {
    if (err instanceof ForbiddenError) return forbidden(err.message);
    const message =
      err instanceof Error ? err.message : "Erro ao recalcular cenário";
    return Response.json({ detail: message }, { status: 400 });
  }
}
