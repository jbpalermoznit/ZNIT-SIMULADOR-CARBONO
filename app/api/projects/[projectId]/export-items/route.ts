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

  // Get curve (from query param or latest)
  const curveIdParam = req.nextUrl.searchParams.get("curve_id");
  let curveId: string | null = null;
  if (curveIdParam) {
    curveId = curveIdParam;
  } else {
    const { data: curve } = await supabase
      .from("abc_curves").select("id").eq("project_id", projectId)
      .order("imported_at", { ascending: false }).limit(1).single();
    curveId = curve?.id ?? null;
  }
  if (!curveId) return Response.json({ detail: "Nenhuma curva ABC" }, { status: 404 });

  const { data: items } = await supabase
    .from("abc_items").select("*").eq("abc_curve_id", curveId).order("item_order");
  if (!items?.length) return Response.json({ detail: "Sem itens" }, { status: 404 });

  const itemIds = items.map((i) => i.id);
  const { data: mappings } = await supabase
    .from("item_mappings").select("*").in("abc_item_id", itemIds);
  const mappingByItem = new Map((mappings ?? []).map((m) => [m.abc_item_id, m]));

  // CSV branch — plain text, semicolon-separated, UTF-8 with BOM so
  // Excel opens it with the right encoding/locale on PT-BR machines.
  const format = req.nextUrl.searchParams.get("format");
  if (format === "csv") {
    const dateStr = new Date().toISOString().slice(0, 10);
    const projectName = (project.name ?? "Projeto").replace(/\s/g, "_").replace(/\//g, "-");
    const filename = `ZNIT_${projectName}_itens_${dateStr}.csv`;

    const headers = [
      "Descrição", "CostCode", "Tipo", "Classe", "Unidade",
      "Quantidade", "Custo Total (R$)",
      "Fator de Emissão", "Unidade Fator", "Fonte", "Confiança",
      "Status", "Emissões (tCO₂e)",
    ];

    const escape = (v: unknown): string => {
      if (v === null || v === undefined) return "";
      const s = typeof v === "number"
        ? v.toLocaleString("pt-BR", { maximumFractionDigits: 6 }).replace(/\./g, "").replace(",", ",")
        : String(v);
      // Quote when the value contains the separator, quotes, or line breaks.
      if (/[;"\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    const lines: string[] = [];
    lines.push(headers.map(escape).join(";"));

    for (const item of items) {
      const m = mappingByItem.get(item.id);
      const factor = m?.factor_value as number | null | undefined;
      const emissionT = factor && item.quantity
        ? Math.round(((item.quantity * factor) / 1000) * 10000) / 10000
        : "";
      lines.push([
        item.description,
        item.cost_code,
        item.item_type,
        item.abc_class,
        item.unit,
        item.quantity,
        item.total_cost,
        factor ?? "",
        m?.factor_unit ?? "",
        m?.source_tier ?? "",
        m?.confidence ?? "",
        item.mapping_status,
        emissionT,
      ].map(escape).join(";"));
    }

    const body = "﻿" + lines.join("\r\n") + "\r\n";
    return new Response(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Access-Control-Expose-Headers": "Content-Disposition",
      },
    });
  }

  // Separate parents and children
  const parents = items.filter((i) => i.mapping_status === "blocked" && !i.parent_item_id);
  const childrenByParent = new Map<string, typeof items>();
  const directItems: typeof items = [];

  for (const item of items) {
    if (item.parent_item_id) {
      const list = childrenByParent.get(item.parent_item_id) ?? [];
      list.push(item);
      childrenByParent.set(item.parent_item_id, list);
    } else if (item.mapping_status !== "blocked") {
      directItems.push(item);
    }
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Composições e Insumos");

  const PRIMARY = "FF56B7A5";
  const DARK = "FF1D7A6B";
  const COMP_BG = "FFF0FAF7";
  const HEADER_BG = "FF1D7A6B";

  const headers = [
    "Cenário", "Descrição", "Un", "Quantidade", "Emissões (tCO₂e)", "Código",
    "Fator de Emissão", "Unidade Fator", "Fonte", "Confiança",
  ];

  const headerRow = ws.addRow(headers);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 9, name: "Calibri" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: "FF808181" } } };
  });

  const addItemRow = (
    scenario: string,
    item: typeof items[0],
    isParent: boolean,
    isChild: boolean
  ) => {
    const m = mappingByItem.get(item.id);
    const emission = m?.factor_value && item.quantity
      ? (item.quantity * (m.factor_value as number)) / 1000
      : 0;

    const desc = isChild ? `  ↳ ${item.description}` : item.description;

    const row = ws.addRow([
      isChild ? "–" : scenario,
      desc,
      item.unit,
      item.quantity,
      isParent ? "" : (emission > 0 ? Math.round(emission * 10000) / 10000 : ""),
      item.cost_code,
      m?.factor_value ?? "",
      m?.factor_unit ?? "",
      m?.source_tier ?? "",
      m?.confidence ?? "",
    ]);

    if (isParent) {
      row.eachCell((cell) => {
        cell.font = { bold: true, size: 9, name: "Calibri", color: { argb: DARK.slice(2) } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COMP_BG } };
      });
    } else if (isChild) {
      row.eachCell((cell) => {
        cell.font = { size: 8, name: "Calibri", color: { argb: "FF404040" } };
      });
      // Factor source in lighter color
      const srcCell = row.getCell(9);
      srcCell.font = { size: 7, name: "Calibri", color: { argb: "FF808181" } };
    } else {
      row.eachCell((cell) => {
        cell.font = { size: 9, name: "Calibri" };
      });
    }

    row.eachCell((cell) => {
      cell.border = { bottom: { style: "hair", color: { argb: "FFE0E4E3" } } };
    });
  };

  const scenarioName = project.name ?? "Cenário";

  // Render parents with children
  for (const parent of parents) {
    const children = childrenByParent.get(parent.id) ?? [];
    // Sum children emissions for parent
    addItemRow(scenarioName, parent, true, false);
    for (const child of children) {
      addItemRow("", child, false, true);
    }
  }

  // Render direct items
  for (const item of directItems) {
    addItemRow(scenarioName, item, false, false);
  }

  // Column widths
  ws.columns.forEach((col, i) => {
    col.width = [14, 55, 7, 14, 16, 22, 12, 14, 14, 10][i] ?? 12;
  });

  // Freeze header
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await wb.xlsx.writeBuffer();
  const dateStr = new Date().toISOString().slice(0, 10);
  const projectName = (project.name ?? "Projeto").replace(/\s/g, "_").replace(/\//g, "-");
  const filename = `ZNIT_${projectName}_composicoes_${dateStr}.xlsx`;

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Access-Control-Expose-Headers": "Content-Disposition",
    },
  });
}
