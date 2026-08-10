import { NextRequest } from "next/server";
import { supabase } from "@/lib/server/supabase";
import { getCurrentUser, unauthorized } from "@/lib/server/auth";
import type { AuthUser } from "@/lib/server/auth";
import { chunkArray } from "@/lib/server/db-utils";

// ---------------------------------------------------------------------------
// GET /api/projects/[projectId]
// ---------------------------------------------------------------------------
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  let user: AuthUser;
  try {
    user = await getCurrentUser(req);
  } catch {
    return unauthorized();
  }

  const { projectId } = await params;

  const { data: project, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("company_id", user.company_id)
    .single();

  if (error || !project) {
    return Response.json(
      { detail: "Projeto não encontrado" },
      { status: 404 }
    );
  }

  return Response.json(project);
}

// ---------------------------------------------------------------------------
// DELETE /api/projects/[projectId]
// ---------------------------------------------------------------------------
// Body: { "confirmation": "delete o projeto" }
//
// The confirmation phrase is required and must match exactly. This is the
// only guard against accidental deletion — the DB schema doesn't ON DELETE
// CASCADE from projects, so we do the cleanup explicitly in the right order.

const DELETE_CONFIRMATION_PHRASE = "delete o projeto";

export const maxDuration = 60;

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  let user: AuthUser;
  try {
    user = await getCurrentUser(req);
  } catch {
    return unauthorized();
  }

  const { projectId } = await params;

  let body: { confirmation?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  if ((body.confirmation ?? "").trim() !== DELETE_CONFIRMATION_PHRASE) {
    return Response.json(
      {
        detail:
          `Confirmação inválida. Para apagar, envie { "confirmation": "${DELETE_CONFIRMATION_PHRASE}" }.`,
      },
      { status: 400 },
    );
  }

  // Tenant guard: project must belong to the caller's company.
  const { data: project } = await supabase
    .from("projects")
    .select("id, company_id, name")
    .eq("id", projectId)
    .eq("company_id", user.company_id)
    .single();

  if (!project) {
    return Response.json(
      { detail: "Projeto não encontrado" },
      { status: 404 },
    );
  }

  // 1. Pull all abc_curve ids of this project + the abc_items inside them
  //    so we can clean up item_mappings (no cascade on that FK).
  const { data: curves } = await supabase
    .from("abc_curves")
    .select("id")
    .eq("project_id", projectId);
  const curveIds = (curves ?? []).map((c) => c.id as string);

  let itemIds: string[] = [];
  if (curveIds.length > 0) {
    const { data: itemsRows } = await supabase
      .from("abc_items")
      .select("id")
      .in("abc_curve_id", curveIds);
    itemIds = (itemsRows ?? []).map((i) => i.id as string);
  }

  // 2. item_mappings → abc_items (no cascade). Delete first.
  for (const chunk of chunkArray(itemIds)) {
    await supabase.from("item_mappings").delete().in("abc_item_id", chunk);
  }

  // 3. abc_curves → cascades abc_items + parent_item_id self-refs.
  if (curveIds.length > 0) {
    await supabase.from("abc_curves").delete().in("id", curveIds);
  }

  // 4. scenarios → cascades scenario_items + scenario_results.
  await supabase.from("scenarios").delete().eq("project_id", projectId);

  // 5. project itself.
  const { error: delErr } = await supabase
    .from("projects")
    .delete()
    .eq("id", projectId);

  if (delErr) {
    return Response.json(
      { detail: "Erro ao apagar projeto: " + delErr.message },
      { status: 500 },
    );
  }

  return Response.json({ deleted: true, project_id: projectId, name: project.name });
}
