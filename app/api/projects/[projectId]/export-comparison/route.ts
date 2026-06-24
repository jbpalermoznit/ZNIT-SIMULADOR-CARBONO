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

  // Get scenarios
  const searchParams = req.nextUrl.searchParams;
  const scenAId = searchParams.get("scenario_a");
  const scenBId = searchParams.get("scenario_b");

  if (!scenAId || !scenBId) {
    return Response.json({ detail: "Parâmetros scenario_a e scenario_b obrigatórios" }, { status: 400 });
  }

  // Load both scenarios with items
  const loadScenario = async (scenId: string) => {
    const { data: scenario } = await supabase
      .from("scenarios").select("*").eq("id", scenId).single();
    if (!scenario) return null;

    const { data: result } = await supabase
      .from("scenario_results").select("*").eq("scenario_id", scenId).single();

    const { data: scenItems } = await supabase
      .from("scenario_items").select("*").eq("scenario_id", scenId);

    const abcIds = (scenItems ?? []).map((si) => si.abc_item_id);
    const abcMap: Record<string, Record<string, unknown>> = {};
    if (abcIds.length > 0) {
      const { data: abcItems } = await supabase
        .from("abc_items").select("*").in("id", abcIds);
      for (const ai of abcItems ?? []) abcMap[ai.id] = ai;
    }

    // Load parents (blocked items)
    const curveId = abcIds.length > 0 ? Object.values(abcMap)[0]?.abc_curve_id : null;
    let parents: Record<string, unknown>[] = [];
    if (curveId) {
      const { data: blocked } = await supabase
        .from("abc_items").select("*")
        .eq("abc_curve_id", curveId as string)
        .eq("mapping_status", "blocked")
        .order("item_order");
      parents = blocked ?? [];
    }

    return { scenario, result, scenItems: scenItems ?? [], abcMap, parents };
  };

  const [dataA, dataB] = await Promise.all([loadScenario(scenAId), loadScenario(scenBId)]);
  if (!dataA || !dataB) return Response.json({ detail: "Cenário não encontrado" }, { status: 404 });

  const wb = new ExcelJS.Workbook();
  const PRIMARY = "FF56B7A5";
  const DARK = "FF1D7A6B";
  const HEADER_BG = "FF1D7A6B";
  const COMP_BG = "FFF0FAF7";
  const LIGHT_BG = "FFF8FAF9";

  // ── Sheet 1: Indicadores Comparativos ─────────────────────────────
  const wsInd = wb.addWorksheet("Indicadores");

  const nameA = dataA.scenario.name;
  const nameB = dataB.scenario.name;

  // Title
  const titleRow = wsInd.addRow(["RELATÓRIO COMPARATIVO DE EMISSÕES"]);
  titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: DARK.slice(2) } };
  wsInd.mergeCells("A1:D1");
  wsInd.addRow(["Projeto: " + (project.name ?? ""), "", "Emitido em: " + new Date().toLocaleDateString("pt-BR")]);
  wsInd.addRow([]);

  const indHeader = wsInd.addRow(["Parâmetro", nameA, nameB, "Diferença %"]);
  indHeader.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
    cell.alignment = { horizontal: "center" };
  });
  indHeader.getCell(1).alignment = { horizontal: "left" };

  const rA = dataA.result;
  const rB = dataB.result;
  const tA = rA?.total_tco2e ?? 0;
  const tB = rB?.total_tco2e ?? 0;

  // Calculate indicators from items
  const calcFromItems = (scenItems: typeof dataA.scenItems, abcMap: typeof dataA.abcMap, parents: typeof dataA.parents) => {
    let concM3 = 0, concTco2 = 0, acoKg = 0, acoTco2 = 0;
    const parentsCost = parents.reduce((s, p) => s + ((p.total_cost as number) ?? 0), 0);
    const directCost = scenItems
      .filter((si) => !abcMap[si.abc_item_id]?.parent_item_id)
      .reduce((s, si) => s + ((abcMap[si.abc_item_id]?.total_cost as number) ?? 0), 0);

    for (const si of scenItems) {
      const ai = abcMap[si.abc_item_id];
      if (!ai) continue;
      const desc = ((ai.description as string) ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const unit = ((ai.unit as string) ?? "").toLowerCase();
      const qty = (ai.quantity as number) ?? 0;
      const em = si.emission_kgco2e ? si.emission_kgco2e / 1000 : 0;
      if (desc.includes("concreto") && (unit === "m³" || unit === "m3")) { concM3 += qty; concTco2 += em; }
      if ((desc.includes("aco") || desc.includes("armadura") || desc.includes("ca-50") || desc.includes("ca-25") || desc.includes("ca-60") || desc.includes("tela soldada")) && (unit === "kg" || unit === "t")) {
        acoKg += unit === "t" ? qty * 1000 : qty; acoTco2 += em;
      }
    }
    return { cost: parentsCost + directCost, concM3, concTco2, acoTon: acoKg / 1000, acoTco2 };
  };

  const iA = calcFromItems(dataA.scenItems, dataA.abcMap, dataA.parents);
  const iB = calcFromItems(dataB.scenItems, dataB.abcMap, dataB.parents);
  const pct = (a: number, b: number) => a > 0 ? `${((a - b) / a * 100).toFixed(2)}%` : "0%";

  const indicators = [
    ["Emissões Totais (tCO₂e)", tA, tB, pct(tA, tB)],
    ["Valor do Projeto (R$)", iA.cost, iB.cost, pct(iA.cost, iB.cost)],
    ["Quantidade de Concreto (m³)", iA.concM3, iB.concM3, pct(iA.concM3, iB.concM3)],
    ["Indicador Concreto (tCO₂/m³)", iA.concM3 > 0 ? iA.concTco2 / iA.concM3 : 0, iB.concM3 > 0 ? iB.concTco2 / iB.concM3 : 0, ""],
    ["Quantidade de Aço (ton)", iA.acoTon, iB.acoTon, pct(iA.acoTon, iB.acoTon)],
    ["Indicador Aço (tCO₂/ton)", iA.acoTon > 0 ? iA.acoTco2 / iA.acoTon : 0, iB.acoTon > 0 ? iB.acoTco2 / iB.acoTon : 0, ""],
    ["Emissões Materiais (tCO₂e)", (rA?.scope3_materials_kgco2e ?? 0) / 1000, (rB?.scope3_materials_kgco2e ?? 0) / 1000, pct((rA?.scope3_materials_kgco2e ?? 0), (rB?.scope3_materials_kgco2e ?? 0))],
    ["Emissões Transporte (tCO₂e)", (rA?.scope3_logistics_kgco2e ?? 0) / 1000, (rB?.scope3_logistics_kgco2e ?? 0) / 1000, ""],
    ["Cobertura (%)", rA?.coverage_pct ?? 0, rB?.coverage_pct ?? 0, ""],
    ["Itens Mapeados", rA?.items_mapped ?? 0, rB?.items_mapped ?? 0, ""],
  ];

  for (const [label, valA, valB, diff] of indicators) {
    const row = wsInd.addRow([label, valA, valB, diff]);
    row.getCell(1).font = { bold: true, size: 9 };
    row.getCell(2).numFmt = typeof valA === "number" && (label as string).includes("R$") ? "#,##0" : "#,##0.00";
    row.getCell(3).numFmt = typeof valB === "number" && (label as string).includes("R$") ? "#,##0" : "#,##0.00";
    row.getCell(2).alignment = { horizontal: "right" };
    row.getCell(3).alignment = { horizontal: "right" };
    row.getCell(4).alignment = { horizontal: "right" };
  }

  wsInd.columns = [{ width: 35 }, { width: 20 }, { width: 20 }, { width: 15 }];

  // ── Sheet 2 & 3: Detail per scenario ──────────────────────────────
  const addDetailSheet = (
    sheetName: string,
    scenData: typeof dataA,
  ) => {
    const ws = wb.addWorksheet(sheetName);

    const header = ws.addRow([
      "Composição", "Código", "Un", "Qtd (Input)", "Custo (Input)",
      "Insumo", "Código Insumo", "Un", "Qtd Expandida",
      "Fator Emissão", "Unidade Fator", "Fonte", "tCO₂e",
    ]);
    header.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 9, name: "Calibri" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    });

    // Build parent → children map
    const childrenByParent = new Map<string, typeof scenData.scenItems>();
    const directScenItems: typeof scenData.scenItems = [];

    for (const si of scenData.scenItems) {
      const ai = scenData.abcMap[si.abc_item_id];
      if (!ai) continue;
      const parentId = ai.parent_item_id as string | null;
      if (parentId) {
        const list = childrenByParent.get(parentId) ?? [];
        list.push(si);
        childrenByParent.set(parentId, list);
      } else if (ai.mapping_status !== "blocked") {
        directScenItems.push(si);
      }
    }

    // Render parents with children
    for (const parent of scenData.parents) {
      const children = childrenByParent.get(parent.id as string) ?? [];
      const parentEmission = children.reduce((s, si) => s + (si.emission_kgco2e ? si.emission_kgco2e / 1000 : 0), 0);

      // Parent row
      const pRow = ws.addRow([
        parent.description, parent.cost_code, parent.unit, parent.quantity, parent.total_cost,
        "", "", "", "",
        "", "", "Σ Insumos", Math.round(parentEmission * 10000) / 10000,
      ]);
      pRow.eachCell((cell) => {
        cell.font = { bold: true, size: 9, name: "Calibri", color: { argb: DARK.slice(2) } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COMP_BG } };
      });

      // Children rows
      for (const si of children) {
        const ai = scenData.abcMap[si.abc_item_id];
        if (!ai) continue;
        const em = si.emission_kgco2e ? si.emission_kgco2e / 1000 : 0;
        const cRow = ws.addRow([
          "", "", "", "", "",
          ai.description, ai.cost_code, ai.unit, ai.quantity,
          si.factor_value ?? "", si.factor_unit ?? "", si.source_tier ?? "",
          Math.round(em * 10000) / 10000,
        ]);
        cRow.eachCell((cell) => {
          cell.font = { size: 8, name: "Calibri" };
          cell.border = { bottom: { style: "hair", color: { argb: "FFE0E4E3" } } };
        });
        cRow.getCell(6).font = { size: 8, name: "Calibri", color: { argb: "FF404040" } };
      }
    }

    // Direct items
    if (directScenItems.length > 0) {
      const sepRow = ws.addRow(["ITENS DIRETOS (sem composição)"]);
      sepRow.getCell(1).font = { bold: true, size: 9, color: { argb: "FF808181" } };
      sepRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_BG } };

      for (const si of directScenItems) {
        const ai = scenData.abcMap[si.abc_item_id];
        if (!ai) continue;
        const em = si.emission_kgco2e ? si.emission_kgco2e / 1000 : 0;
        ws.addRow([
          ai.description, ai.cost_code, ai.unit, ai.quantity, ai.total_cost,
          "", "", "", "",
          si.factor_value ?? "", si.factor_unit ?? "", si.source_tier ?? "",
          Math.round(em * 10000) / 10000,
        ]);
      }
    }

    ws.columns = [
      { width: 45 }, { width: 14 }, { width: 6 }, { width: 14 }, { width: 16 },
      { width: 45 }, { width: 18 }, { width: 6 }, { width: 14 },
      { width: 12 }, { width: 14 }, { width: 14 }, { width: 14 },
    ];
    ws.views = [{ state: "frozen", ySplit: 1 }];
  };

  addDetailSheet(nameA.length > 31 ? nameA.slice(0, 28) + "..." : nameA, dataA);
  addDetailSheet(nameB.length > 31 ? nameB.slice(0, 28) + "..." : nameB, dataB);

  const buffer = await wb.xlsx.writeBuffer();
  const dateStr = new Date().toISOString().slice(0, 10);
  const projectName = (project.name ?? "Projeto").replace(/\s/g, "_").replace(/\//g, "-");
  const filename = `ZNIT_${projectName}_conferencia_${dateStr}.xlsx`;

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Access-Control-Expose-Headers": "Content-Disposition",
    },
  });
}
