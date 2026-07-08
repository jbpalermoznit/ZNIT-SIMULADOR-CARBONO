/**
 * GET /api/emission-factors/auto-match/[itemId]
 * Auto-match a single ABC item to the best emission factor.
 * Port of backend/app/api/emission_factors.py — auto_match
 */

import { NextRequest } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/server/auth";
import { autoMatchItem } from "@/lib/server/emission-mapper";
import { assertItemOwnership, ForbiddenError, forbidden } from "@/lib/server/access";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  let user;
  try {
    user = await getCurrentUser(req);
  } catch {
    return unauthorized();
  }

  const { itemId } = await params;

  // Fetch item + escopo por empresa (id cru não pode vazar entre tenants)
  let item: Record<string, unknown>;
  try {
    item = await assertItemOwnership(itemId, user);
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return e.message === "Item não encontrado"
        ? Response.json({ detail: "Item não encontrado" }, { status: 404 })
        : forbidden(e.message);
    }
    throw e;
  }

  const result = await autoMatchItem(
    item.description as string,
    item.unit as string,
    user.company_id
  );

  return Response.json(result);
}
