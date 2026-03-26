import { NextRequest } from "next/server";
import { supabase } from "@/lib/server/supabase";
import { getCurrentUser, unauthorized } from "@/lib/server/auth";
import type { AuthUser } from "@/lib/server/auth";

// ---------------------------------------------------------------------------
// DELETE /api/equipment-rules/[ruleId] — soft delete
// ---------------------------------------------------------------------------
export async function DELETE(
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
    .from("equipment_rules")
    .select("id")
    .eq("id", ruleId)
    .eq("company_id", user.company_id)
    .single();

  if (!rule) {
    return Response.json(
      { detail: "Regra não encontrada" },
      { status: 404 }
    );
  }

  await supabase
    .from("equipment_rules")
    .update({ is_active: false })
    .eq("id", ruleId);

  return Response.json({ message: "Regra desativada" });
}
