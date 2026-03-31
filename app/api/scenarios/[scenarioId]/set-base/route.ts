import { NextRequest } from "next/server";
import { supabase } from "@/lib/server/supabase";
import { getCurrentUser, unauthorized } from "@/lib/server/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ scenarioId: string }> }
) {
  try {
    await getCurrentUser(req);
  } catch {
    return unauthorized();
  }

  const { scenarioId } = await params;

  // Get the scenario to find its project
  const { data: scenario } = await supabase
    .from("scenarios")
    .select("id, project_id")
    .eq("id", scenarioId)
    .single();

  if (!scenario) {
    return Response.json({ detail: "Cenário não encontrado" }, { status: 404 });
  }

  // Unset all other base scenarios in the same project
  await supabase
    .from("scenarios")
    .update({ is_base: false })
    .eq("project_id", scenario.project_id)
    .eq("is_base", true);

  // Set this one as base
  await supabase
    .from("scenarios")
    .update({ is_base: true })
    .eq("id", scenarioId);

  return Response.json({ ok: true });
}
