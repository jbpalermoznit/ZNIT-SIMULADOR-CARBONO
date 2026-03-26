import { NextRequest } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/server/auth";
import { supabase } from "@/lib/server/supabase";
import ExcelJS from "exceljs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  let user;
  try { user = await getCurrentUser(req); } catch { return unauthorized(); }

  const { projectId } = await params;

  const { data: project } = await supabase
    .from("projects").select("*").eq("id", projectId).eq("company_id", user.company_id).single();
  if (!project) return Response.json({ detail: "Projeto não encontrado" }, { status: 404 });

  const { data: curve } = await supabase
    .from("abc_curves").select("id").eq("project_id", projectId)
    .order("imported_at", { ascending: false }).limit(1).single();
  if (!curve) return Response.json({ detail: "Nenhuma curva ABC" }, { status: 404 });

  const { data: items } = await supabase
    .from("abc_items").select("*").eq("abc_curve_id", curve.id).order("item_order");
  if (!items?.length) return Response.json({ detail: "Sem itens" }, { status: 404 });

  const itemIds = items.map((i) => i.id);
  const { data: mappings } = await supabase
    .from("item_mappings").select("*").in("abc_item_id", itemIds);
  const mappingByItem = new Map((mappings ?? []).map((m) => [m.abc_item_id, m]));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Todos os Itens");

  const headers = [
    "Código", "Descrição", "Quantidade", "Unidade", "Custo Unitário",
    "Custo Total", "% Custo", "% Acumulado", "Classe Pareto",
    "Tipo", "Status", "Fator Sugerido", "Valor Fator", "Unidade Fator", "Fonte", "Confiança",
  ];

  const headerRow = ws.addRow(headers);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D7A6B" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });

  for (const item of items) {
    const m = mappingByItem.get(item.id);
    ws.addRow([
      item.cost_code, item.description, item.quantity, item.unit,
      item.unit_cost, item.total_cost,
      item.cost_pct ? Math.round(item.cost_pct * 10000) / 100 : 0,
      item.cumulative_pct ? Math.round(item.cumulative_pct * 10000) / 100 : 0,
      item.abc_class, item.item_type, item.mapping_status,
      m?.factor_name ?? "", m?.factor_value ?? "", m?.factor_unit ?? "",
      m?.source_tier ?? "", m?.confidence ?? "",
    ]);
  }

  ws.columns.forEach((col, i) => {
    col.width = [15, 45, 12, 8, 12, 15, 8, 8, 8, 6, 12, 30, 12, 15, 15, 12][i] ?? 12;
  });

  const buffer = await wb.xlsx.writeBuffer();
  const dateStr = new Date().toISOString().slice(0, 10);
  const projectName = (project.name ?? "Projeto").replace(/\s/g, "_").replace(/\//g, "-");
  const filename = `ZNIT_${projectName}_${dateStr}.xlsx`;

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Access-Control-Expose-Headers": "Content-Disposition",
    },
  });
}
