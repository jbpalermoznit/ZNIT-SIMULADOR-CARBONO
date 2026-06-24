/**
 * Tenant-scoping helpers for API routes.
 *
 * The app is multi-tenant: every transactional row ultimately belongs to a
 * `company_id`. Route handlers use the service-role Supabase client (which
 * bypasses RLS), so cross-tenant access must be enforced in the app layer.
 */
import { supabase } from "./supabase";

/**
 * True when the given ABC curve belongs to `companyId`.
 * Chain: abc_curves → projects → companies.
 */
export async function curveBelongsToCompany(
  curveId: string,
  companyId: string,
): Promise<boolean> {
  if (!curveId) return false;
  const { data: curve } = await supabase
    .from("abc_curves")
    .select("project_id")
    .eq("id", curveId)
    .single();
  if (!curve?.project_id) return false;

  const { data: project } = await supabase
    .from("projects")
    .select("company_id")
    .eq("id", curve.project_id)
    .single();
  return project?.company_id === companyId;
}

/**
 * True when the given project belongs to `companyId`.
 */
export async function projectBelongsToCompany(
  projectId: string,
  companyId: string,
): Promise<boolean> {
  if (!projectId) return false;
  const { data: project } = await supabase
    .from("projects")
    .select("company_id")
    .eq("id", projectId)
    .single();
  return project?.company_id === companyId;
}
