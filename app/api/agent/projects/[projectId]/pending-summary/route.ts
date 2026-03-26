import { NextRequest } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/server/auth";
import { supabase } from "@/lib/server/supabase";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try { await getCurrentUser(req); } catch { return unauthorized(); }

  const { projectId } = await params;

  // Get latest curve
  const { data: curve } = await supabase
    .from("abc_curves")
    .select("id")
    .eq("project_id", projectId)
    .order("imported_at", { ascending: false })
    .limit(1)
    .single();

  if (!curve) {
    return Response.json({ total_pending: 0, by_type: {}, items: [] });
  }

  const { data: items } = await supabase
    .from("abc_items")
    .select("id, cost_code, description, item_type, total_cost, unit, quantity")
    .eq("abc_curve_id", curve.id)
    .in("mapping_status", ["pending", "blocked"])
    .order("total_cost", { ascending: false });

  const byType: Record<string, number> = {};
  const itemsList = (items ?? []).map((item) => {
    byType[item.item_type] = (byType[item.item_type] ?? 0) + 1;
    return {
      id: item.id,
      cost_code: item.cost_code,
      description: item.description,
      item_type: item.item_type,
      total_cost: item.total_cost ?? 0,
      unit: item.unit ?? "",
      quantity: item.quantity ?? 0,
    };
  });

  return Response.json({
    total_pending: itemsList.length,
    by_type: byType,
    items: itemsList,
  });
}
