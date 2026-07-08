import { NextRequest } from "next/server";
import { supabase } from "@/lib/server/supabase";
import { resolveConversion } from "@/lib/server/calculator";
import { authenticatePowerBI, powerbiUnauthorized } from "@/lib/server/powerbi-auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  if (!authenticatePowerBI(req)) {
    return powerbiUnauthorized();
  }

  const { projectId } = await params;

  const { data: project } = await supabase.from("projects").select("*").eq("id", projectId).single();
  if (!project) return Response.json({ detail: "Projeto não encontrado" }, { status: 404 });

  const { data: curve } = await supabase
    .from("abc_curves").select("id").eq("project_id", projectId)
    .order("imported_at", { ascending: false }).limit(1).single();
  if (!curve) return Response.json([]);

  const { data: items } = await supabase
    .from("abc_items").select("*").eq("abc_curve_id", curve.id).order("item_order");
  if (!items?.length) return Response.json([]);

  const { data: mappings } = await supabase
    .from("item_mappings").select("*").in("abc_item_id", items.map((i) => i.id));
  const mMap = new Map((mappings ?? []).map((m) => [m.abc_item_id, m]));

  const rows = items.map((item) => {
    const m = mMap.get(item.id);
    // Mesma máquina de conversão do calculador (inclui receitas
    // geométricas) — antes, itens que dependem de receita (m²→m³ etc.)
    // zeravam aqui e o PowerBI sub-reportava vs. o cenário persistido.
    const conv = m?.factor_unit
      ? resolveConversion(item.description, item.unit, m.factor_unit)
      : 1;
    const emission = m?.factor_value && conv > 0 ? (item.quantity ?? 0) * m.factor_value * conv : 0;
    return {
      projeto: project.name,
      area_m2: project.total_area_m2,
      codigo: item.cost_code,
      descricao: item.description,
      quantidade: item.quantity,
      unidade: item.unit,
      custo_total: item.total_cost,
      tipo: item.item_type,
      status: item.mapping_status,
      fator_nome: m?.factor_name ?? null,
      fator_valor: m?.factor_value ?? null,
      emissao_kgco2e: Math.round(emission * 100) / 100,
      // 4 casas em tCO₂e — mesma precisão do scenario_results.total_tco2e,
      // para os somatórios do PowerBI baterem com o app.
      emissao_tco2e: Math.round((emission / 1000) * 10000) / 10000,
    };
  });

  return Response.json(rows);
}
