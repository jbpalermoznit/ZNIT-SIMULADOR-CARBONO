import { NextRequest } from "next/server";
import { supabase } from "@/lib/server/supabase";
import { getCurrentUser, unauthorized } from "@/lib/server/auth";
import type { AuthUser } from "@/lib/server/auth";

// ---------------------------------------------------------------------------
// POST /api/factor-rules/[ruleId]/increment-applied
// Requer auth + a regra precisa pertencer à empresa do usuário (antes era
// um endpoint aberto: qualquer chamada incrementava qualquer regra por id).
// ---------------------------------------------------------------------------
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> }
) {
  let user: AuthUser;
  try {
    user = await getCurrentUser(req);
  } catch {
    return unauthorized();
  }

  const { ruleId } = await params;

  const { data: rule } = await supabase
    .from("factor_rules")
    .select("id, times_applied, company_id")
    .eq("id", ruleId)
    .eq("company_id", user.company_id)
    .single();

  if (rule) {
    await supabase
      .from("factor_rules")
      .update({ times_applied: (rule.times_applied ?? 0) + 1 })
      .eq("id", ruleId);
  }

  return Response.json({ ok: true });
}
