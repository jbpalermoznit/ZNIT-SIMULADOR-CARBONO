import { NextRequest } from "next/server";
import { supabase } from "@/lib/server/supabase";
import { authenticatePowerBI, powerbiUnauthorized } from "@/lib/server/powerbi-auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  if (!authenticatePowerBI(req)) {
    return powerbiUnauthorized();
  }

  const { projectId } = await params;

  const { data: base } = await supabase
    .from("scenarios")
    .select("id")
    .eq("project_id", projectId)
    .eq("is_base", true)
    .single();

  if (!base) return Response.json([]);

  const { data: scenItems } = await supabase
    .from("scenario_items")
    .select("*")
    .eq("scenario_id", base.id);

  const categories: Record<string, { categoria: string; emissao_kgco2e: number; itens_count: number }> = {};
  for (const si of scenItems ?? []) {
    if (!si.emission_kgco2e || si.emission_kgco2e <= 0) continue;
    const cat = si.factor_name ?? "Outros";
    if (!categories[cat]) {
      categories[cat] = { categoria: cat, emissao_kgco2e: 0, itens_count: 0 };
    }
    categories[cat].emissao_kgco2e += si.emission_kgco2e;
    categories[cat].itens_count += 1;
  }

  const rows = Object.values(categories).sort((a, b) => b.emissao_kgco2e - a.emissao_kgco2e);
  const total = rows.reduce((s, r) => s + r.emissao_kgco2e, 0) || 1;
  let cum = 0;
  for (const r of rows) {
    const pct = (r.emissao_kgco2e / total) * 100;
    cum += pct;
    Object.assign(r, {
      emissao_tco2e: Math.round((r.emissao_kgco2e / 1000) * 10000) / 10000,
      pct_total: Math.round(pct * 100) / 100,
      pct_acumulado: Math.round(cum * 100) / 100,
    });
  }

  return Response.json(rows);
}
