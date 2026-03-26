import { NextRequest } from "next/server";
import { supabase } from "@/lib/server/supabase";

// ---------------------------------------------------------------------------
// POST /api/factor-rules/[ruleId]/increment-applied
// ---------------------------------------------------------------------------
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> }
) {
  const { ruleId } = await params;

  const { data: rule } = await supabase
    .from("factor_rules")
    .select("id, times_applied")
    .eq("id", ruleId)
    .single();

  if (rule) {
    await supabase
      .from("factor_rules")
      .update({ times_applied: (rule.times_applied ?? 0) + 1 })
      .eq("id", ruleId);
  }

  return Response.json({ ok: true });
}
