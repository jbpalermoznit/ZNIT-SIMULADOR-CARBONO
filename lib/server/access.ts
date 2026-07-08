/**
 * Ownership / access helpers — enforce company_id boundary on resources whose
 * IDs are passed in the URL.
 *
 * Background: app talks to Supabase via the service_role key, which bypasses
 * RLS. Every API route handler must therefore validate that the user's
 * company owns the resource before reading or mutating it. This module
 * centralizes those checks.
 */
import { supabase } from "./supabase";
import type { AuthUser } from "./auth";

export class ForbiddenError extends Error {
  constructor(message = "Acesso negado") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Resolve the scenario's project and verify the company matches the user's. */
export async function assertScenarioOwnership(
  scenarioId: string,
  user: AuthUser
): Promise<{ projectId: string }> {
  const { data: scenario } = await supabase
    .from("scenarios")
    .select("id, project_id")
    .eq("id", scenarioId)
    .single();

  if (!scenario) throw new ForbiddenError("Cenário não encontrado");

  const { data: project } = await supabase
    .from("projects")
    .select("company_id")
    .eq("id", scenario.project_id)
    .single();

  if (!project || project.company_id !== user.company_id) {
    throw new ForbiddenError();
  }

  return { projectId: scenario.project_id };
}

/** Verify the user's company owns the project. */
export async function assertProjectOwnership(
  projectId: string,
  user: AuthUser
): Promise<void> {
  const { data: project } = await supabase
    .from("projects")
    .select("company_id")
    .eq("id", projectId)
    .single();

  if (!project || project.company_id !== user.company_id) {
    throw new ForbiddenError();
  }
}

/**
 * Verify the user's company owns the abc_item (via abc_curves → projects).
 * Returns the item row so callers don't re-fetch it.
 */
export async function assertItemOwnership(
  itemId: string,
  user: AuthUser
): Promise<Record<string, unknown>> {
  const { data: item } = await supabase
    .from("abc_items")
    .select("*")
    .eq("id", itemId)
    .single();

  if (!item) throw new ForbiddenError("Item não encontrado");

  const { data: curve } = await supabase
    .from("abc_curves")
    .select("project_id")
    .eq("id", item.abc_curve_id)
    .single();

  if (!curve) throw new ForbiddenError();

  const { data: project } = await supabase
    .from("projects")
    .select("company_id")
    .eq("id", curve.project_id)
    .single();

  if (!project || project.company_id !== user.company_id) {
    throw new ForbiddenError();
  }

  return item;
}

/** Map ForbiddenError to a 403 response. */
export function forbidden(message = "Acesso negado") {
  return Response.json({ detail: message }, { status: 403 });
}
