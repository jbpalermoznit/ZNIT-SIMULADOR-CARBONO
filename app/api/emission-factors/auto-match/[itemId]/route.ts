/**
 * GET /api/emission-factors/auto-match/[itemId]
 * Auto-match a single ABC item to the best emission factor.
 * Port of backend/app/api/emission_factors.py — auto_match
 */

import { NextRequest } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/server/auth";
import { supabase } from "@/lib/server/supabase";
import { autoMatchItem } from "@/lib/server/emission-mapper";

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

  // Fetch item
  const { data: item, error } = await supabase
    .from("abc_items")
    .select("id, description, unit")
    .eq("id", itemId)
    .single();

  if (error || !item) {
    return Response.json({ detail: "Item não encontrado" }, { status: 404 });
  }

  const result = await autoMatchItem(
    item.description as string,
    item.unit as string,
    user.company_id
  );

  return Response.json(result);
}
