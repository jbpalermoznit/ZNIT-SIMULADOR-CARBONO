import { NextRequest } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/server/auth";
import { supabase } from "@/lib/server/supabase";
import { callGemini } from "@/lib/server/agent/gemini-client";
import { resolveLocally } from "@/lib/server/agent/rule-based-resolver";

async function getPendingItems(projectId: string, itemType?: string | null) {
  const { data: curve } = await supabase
    .from("abc_curves")
    .select("id")
    .eq("project_id", projectId)
    .order("imported_at", { ascending: false })
    .limit(1)
    .single();

  if (!curve) return [];

  let query = supabase
    .from("abc_items")
    .select("id, cost_code, description, quantity, unit, total_cost, item_type, abc_class, mapping_status")
    .eq("abc_curve_id", curve.id)
    .in("mapping_status", ["pending", "blocked"])
    .order("total_cost", { ascending: false });

  if (itemType) query = query.eq("item_type", itemType);

  const { data } = await query;
  return (data ?? []).map((i) => ({
    item_id: i.id,
    cost_code: i.cost_code,
    description: i.description,
    quantity: i.quantity ?? 0,
    unit: i.unit ?? "",
    total_cost: i.total_cost ?? 0,
    item_type: i.item_type,
    abc_class: i.abc_class ?? "",
    mapping_status: i.mapping_status,
  }));
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try { await getCurrentUser(req); } catch { return unauthorized(); }

  const { projectId } = await params;
  const body = await req.json();
  const { message, item_type, item_ids } = body;

  let pending = await getPendingItems(projectId, item_type);
  if (item_ids?.length) {
    pending = pending.filter((p) => item_ids.includes(p.item_id));
  }

  let agentResponse = "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let decisions: any[] = [];

  // Try Gemini, fallback to local resolver
  try {
    const prompt = `Itens pendentes:\n${JSON.stringify(pending, null, 2)}\n\nInstrução: ${message}`;
    const result = await callGemini(prompt);
    agentResponse = (result.agent_response as string) ?? "";
    decisions = (result.decisions as Record<string, unknown>[]) ?? [];

    if (!decisions.length && result.text) {
      agentResponse = result.text as string;
    }
  } catch {
    const result = resolveLocally(
      pending as Parameters<typeof resolveLocally>[0],
      message,
    );
    agentResponse = result.agent_response;
    decisions = result.decisions;
  }

  // Fix invalid item_ids
  const validIds = new Set(pending.map((p) => p.item_id));
  for (const dec of decisions) {
    if (!validIds.has(dec.item_id as string) && pending.length > 0) {
      if (pending.length === 1) {
        dec.item_id = pending[0].item_id;
      }
    }
  }

  return Response.json({
    agent_response: agentResponse,
    decisions,
    summary: {
      proposed: decisions.length,
      exclude: decisions.filter((d) => d.action === "exclude").length,
      map_factor: decisions.filter((d) => d.action === "map_factor").length,
      equipment_calc: decisions.filter((d) => d.action === "equipment_calc").length,
      decompose: decisions.filter((d) => d.action === "decompose").length,
    },
  });
}
