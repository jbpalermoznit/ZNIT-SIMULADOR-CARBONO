import { NextRequest } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/server/auth";
import { supabase } from "@/lib/server/supabase";
import ExcelJS from "exceljs";

// ---------------------------------------------------------------------------
// GET /api/projects/[projectId]/export-items
//
// Exporta os itens de um cenário (Excel ou CSV). As emissões vêm da MESMA
// fonte que a UI e a calculadora mostram — scenario_items.emission_kgco2e
// (÷1000 → tCO₂e), que já inclui a conversão de unidade (resolveConversion,
// receitas §5) e respeita is_excluded. Antes o export recomputava
// qty × factor / 1000 a partir de item_mappings, SEM conversão nem exclusão —
// o que inflava o total (ex.: 27.523 vs 3.393 tCO₂e). Ver PR do incidente.
//
// Escopo: ?scenario_id=<id> (padrão: cenário Base do projeto). A soma da coluna
// de emissões bate com scenario_results.total_tco2e.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

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

  // Resolve the scenario to export: explicit param, else the project's Base,
  // else the most recent scenario. All scoped to this project.
  const scenIdParam = req.nextUrl.searchParams.get("scenario_id");
  let scenario: Row | null = null;
  if (scenIdParam) {
    const { data } = await supabase
      .from("scenarios").select("*").eq("id", scenIdParam).eq("project_id", projectId).single();
    scenario = data ?? null;
    if (!scenario) return Response.json({ detail: "Cenário não encontrado" }, { status: 404 });
  } else {
    const { data: base } = await supabase
      .from("scenarios").select("*").eq("project_id", projectId).eq("is_base", true)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    scenario = base ?? null;
    if (!scenario) {
      const { data: latest } = await supabase
        .from("scenarios").select("*").eq("project_id", projectId)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      scenario = latest ?? null;
    }
  }
  if (!scenario) return Response.json({ detail: "Nenhum cenário calculado para exportar" }, { status: 404 });

  const scenarioId = scenario.id as string;

  // Persisted per-item emissions (source of truth) + the ABC items they map to.
  const { data: scenItems } = await supabase
    .from("scenario_items").select("*").eq("scenario_id", scenarioId);
  if (!scenItems?.length) return Response.json({ detail: "Cenário sem itens" }, { status: 404 });

  const abcIds = scenItems.map((si) => si.abc_item_id);
  const abcMap = new Map<string, Row>();
  const { data: abcItems } = await supabase.from("abc_items").select("*").in("id", abcIds);
  for (const ai of abcItems ?? []) abcMap.set(ai.id as string, ai);

  // Parents (blocked compositions) live on the curve, not in scenario_items.
  const curveId = (abcItems?.[0]?.abc_curve_id as string | undefined) ?? null;
  let parents: Row[] = [];
  if (curveId) {
    const { data: blocked } = await supabase
      .from("abc_items").select("*")
      .eq("abc_curve_id", curveId).eq("mapping_status", "blocked").order("item_order");
    parents = blocked ?? [];
  }

  // Group scenario items under their parent, and collect direct items.
  const childrenByParent = new Map<string, Row[]>();
  const directItems: Row[] = [];
  for (const si of scenItems) {
    const ai = abcMap.get(si.abc_item_id as string);
    if (!ai) continue;
    const parentId = ai.parent_item_id as string | null;
    if (parentId) {
      const list = childrenByParent.get(parentId) ?? [];
      list.push(si);
      childrenByParent.set(parentId, list);
    } else if (ai.mapping_status !== "blocked") {
      directItems.push(si);
    }
  }

  // tCO₂e for a scenario item — persisted value, already converted + excluded.
  const emT = (si: Row): number => {
    const kg = si.emission_kgco2e as number | null | undefined;
    return kg ? Math.round((kg / 1000) * 10000) / 10000 : 0;
  };
  const scenarioName = (scenario.name as string) ?? (project.name as string) ?? "Cenário";

  // ── CSV branch — plano, ; separado, UTF-8 com BOM ──────────────────────────
  const format = req.nextUrl.searchParams.get("format");
  if (format === "csv") {
    const dateStr = new Date().toISOString().slice(0, 10);
    const projName = (project.name as string ?? "Projeto").replace(/\s/g, "_").replace(/\//g, "-");
    const filename = `ZNIT_${projName}_itens_${dateStr}.csv`;

    const headers = [
      "Cenário", "Descrição", "CostCode", "Tipo", "Classe", "Unidade",
      "Quantidade", "Custo Total (R$)",
      "Fator de Emissão", "Unidade Fator", "Fonte", "Status", "Emissões (tCO₂e)",
    ];
    const escape = (v: unknown): string => {
      if (v === null || v === undefined) return "";
      const s = typeof v === "number"
        ? v.toLocaleString("pt-BR", { maximumFractionDigits: 6 })
        : String(v);
      if (/[;"\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    const lines: string[] = [headers.map(escape).join(";")];
    const pushItem = (ai: Row, si: Row) => {
      lines.push([
        scenarioName,
        (si.is_excluded ? "[excluído] " : "") + (ai.description as string),
        ai.cost_code, ai.item_type, ai.abc_class, ai.unit,
        ai.quantity, ai.total_cost,
        si.factor_value ?? "", si.factor_unit ?? "", si.source_tier ?? "",
        si.is_excluded ? "excluído" : ai.mapping_status,
        si.is_excluded ? 0 : emT(si),
      ].map(escape).join(";"));
    };
    for (const parent of parents) {
      const kids = childrenByParent.get(parent.id as string) ?? [];
      const parentT = kids.reduce((s, si) => s + emT(si), 0);
      lines.push([
        scenarioName, parent.description, parent.cost_code, parent.item_type, parent.abc_class,
        parent.unit, parent.quantity, parent.total_cost, "", "", "", "composição",
        Math.round(parentT * 10000) / 10000,
      ].map(escape).join(";"));
      for (const si of kids) pushItem(abcMap.get(si.abc_item_id as string)!, si);
    }
    for (const si of directItems) pushItem(abcMap.get(si.abc_item_id as string)!, si);

    const body = "﻿" + lines.join("\r\n") + "\r\n";
    return new Response(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Access-Control-Expose-Headers": "Content-Disposition",
      },
    });
  }

  // ── Excel branch ───────────────────────────────────────────────────────────
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Itens do Cenário");

  const DARK = "FF1D7A6B";
  const COMP_BG = "FFF0FAF7";
  const HEADER_BG = "FF1D7A6B";

  const headers = [
    "Cenário", "Descrição", "Un", "Quantidade", "Emissões (tCO₂e)", "Código",
    "Fator de Emissão", "Unidade Fator", "Fonte",
  ];
  const headerRow = ws.addRow(headers);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 9, name: "Calibri" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: "FF808181" } } };
  });

  const addChildOrDirect = (ai: Row, si: Row, isChild: boolean) => {
    const excluded = !!si.is_excluded;
    const desc = (isChild ? "  ↳ " : "") + (excluded ? "[excluído] " : "") + (ai.description as string);
    const row = ws.addRow([
      isChild ? "–" : scenarioName,
      desc,
      ai.unit,
      ai.quantity,
      excluded ? 0 : (emT(si) > 0 ? emT(si) : ""),
      ai.cost_code,
      si.factor_value ?? "",
      si.factor_unit ?? "",
      si.source_tier ?? "",
    ]);
    row.eachCell((cell) => {
      cell.font = isChild
        ? { size: 8, name: "Calibri", color: { argb: "FF404040" } }
        : { size: 9, name: "Calibri" };
      cell.border = { bottom: { style: "hair", color: { argb: "FFE0E4E3" } } };
    });
  };

  // Parents with children (parent emission = Σ children; blank to keep the
  // column summing to the scenario total without double counting).
  for (const parent of parents) {
    const kids = childrenByParent.get(parent.id as string) ?? [];
    const pRow = ws.addRow([
      scenarioName, parent.description, parent.unit, parent.quantity,
      "", parent.cost_code, "", "", "",
    ]);
    pRow.eachCell((cell) => {
      cell.font = { bold: true, size: 9, name: "Calibri", color: { argb: DARK.slice(2) } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COMP_BG } };
    });
    for (const si of kids) addChildOrDirect(abcMap.get(si.abc_item_id as string)!, si, true);
  }
  for (const si of directItems) addChildOrDirect(abcMap.get(si.abc_item_id as string)!, si, false);

  ws.columns.forEach((col, i) => {
    col.width = [14, 55, 7, 14, 16, 22, 12, 14, 14][i] ?? 12;
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await wb.xlsx.writeBuffer();
  const dateStr = new Date().toISOString().slice(0, 10);
  const projName = (project.name as string ?? "Projeto").replace(/\s/g, "_").replace(/\//g, "-");
  const filename = `ZNIT_${projName}_itens_${dateStr}.xlsx`;

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Access-Control-Expose-Headers": "Content-Disposition",
    },
  });
}
