import { NextRequest } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/server/auth";
import { supabase } from "@/lib/server/supabase";
import { chunkArray } from "@/lib/server/db-utils";
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

  // Get scenarios — scenario_ids=<id1>,<id2>,... (2+; ordem preservada).
  const searchParams = req.nextUrl.searchParams;
  const scenarioIds = (searchParams.get("scenario_ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (scenarioIds.length < 2) {
    return Response.json(
      { detail: "Parâmetro scenario_ids obrigatório, com pelo menos 2 ids separados por vírgula" },
      { status: 400 },
    );
  }

  // Load scenarios with items — escopado ao projeto (já validado como
  // da empresa do usuário); sem o .eq("project_id"), ids de cenários de
  // outros projetos/tenants eram exportáveis.
  const loadScenario = async (scenId: string) => {
    const { data: scenario } = await supabase
      .from("scenarios").select("*").eq("id", scenId).eq("project_id", projectId).single();
    if (!scenario) return null;

    const { data: result } = await supabase
      .from("scenario_results").select("*").eq("scenario_id", scenId).single();

    const { data: scenItems } = await supabase
      .from("scenario_items").select("*").eq("scenario_id", scenId);

    const abcIds = (scenItems ?? []).map((si) => si.abc_item_id);
    const abcMap: Record<string, Record<string, unknown>> = {};
    for (const chunk of chunkArray(abcIds)) {
      const { data: abcItems } = await supabase
        .from("abc_items").select("*").in("id", chunk);
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
  type ScenData = NonNullable<Awaited<ReturnType<typeof loadScenario>>>;

  const loaded = await Promise.all(scenarioIds.map(loadScenario));
  if (loaded.some((d) => !d)) {
    return Response.json({ detail: "Um ou mais cenários não encontrados" }, { status: 404 });
  }
  const scenariosData = loaded as ScenData[];

  const wb = new ExcelJS.Workbook();
  const PRIMARY = "FF56B7A5";
  const DARK = "FF1D7A6B";
  const HEADER_BG = "FF1D7A6B";
  const COMP_BG = "FFF0FAF7";
  const LIGHT_BG = "FFF8FAF9";

  // ── Sheet 1: Indicadores Comparativos ─────────────────────────────
  const wsInd = wb.addWorksheet("Indicadores");

  const names = scenariosData.map((d) => d.scenario.name as string);
  // Ancora as diferenças % no cenário Base do projeto — mesmo conceito que
  // a UI já usa (scenarios.is_base). Se nenhum dos selecionados for o Base
  // (ex.: comparando duas variações entre si), usa o primeiro como referência.
  const baseIdxFound = scenariosData.findIndex((d) => d.scenario.is_base);
  const baseIdx = baseIdxFound >= 0 ? baseIdxFound : 0;

  // Colunas: "Parâmetro" + 1 valor por cenário + 1 "Δ%" por cenário não-base.
  const colWidths = [35, ...scenariosData.flatMap((_, i) => (i === baseIdx ? [20] : [20, 15]))];

  // Title
  const titleRow = wsInd.addRow(["RELATÓRIO COMPARATIVO DE EMISSÕES"]);
  titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: DARK.slice(2) } };
  wsInd.mergeCells(1, 1, 1, Math.max(4, colWidths.length));
  wsInd.addRow(["Projeto: " + (project.name ?? ""), "", "Emitido em: " + new Date().toLocaleDateString("pt-BR")]);
  wsInd.addRow([]);

  const headerCells: string[] = ["Parâmetro"];
  scenariosData.forEach((d, i) => {
    headerCells.push(names[i] + (i === baseIdx ? " (Base)" : ""));
    if (i !== baseIdx) headerCells.push(`Δ% vs ${names[baseIdx]}`);
  });
  const indHeader = wsInd.addRow(headerCells);
  indHeader.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
    cell.alignment = { horizontal: "center" };
  });
  indHeader.getCell(1).alignment = { horizontal: "left" };

  // Calculate indicators from items
  const calcFromItems = (scenItems: ScenData["scenItems"], abcMap: ScenData["abcMap"], parents: ScenData["parents"]) => {
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

  const perScenario = scenariosData.map((d) => ({
    result: d.result,
    ind: calcFromItems(d.scenItems, d.abcMap, d.parents),
  }));
  const pct = (a: number, b: number) => a > 0 ? `${((a - b) / a * 100).toFixed(2)}%` : "0%";

  interface Metric {
    label: string;
    isCurrency?: boolean;
    /** Indicadores de intensidade (tCO₂/m³ etc.) e contadores não têm um Δ% útil. */
    noDiff?: boolean;
    value: (p: (typeof perScenario)[number]) => number;
  }
  const metrics: Metric[] = [
    { label: "Emissões Totais (tCO₂e)", value: (p) => p.result?.total_tco2e ?? 0 },
    { label: "Valor do Projeto (R$)", isCurrency: true, value: (p) => p.ind.cost },
    { label: "Quantidade de Concreto (m³)", value: (p) => p.ind.concM3 },
    { label: "Indicador Concreto (tCO₂/m³)", noDiff: true, value: (p) => (p.ind.concM3 > 0 ? p.ind.concTco2 / p.ind.concM3 : 0) },
    { label: "Quantidade de Aço (ton)", value: (p) => p.ind.acoTon },
    { label: "Indicador Aço (tCO₂/ton)", noDiff: true, value: (p) => (p.ind.acoTon > 0 ? p.ind.acoTco2 / p.ind.acoTon : 0) },
    { label: "Emissões Materiais (tCO₂e)", value: (p) => (p.result?.scope3_materials_kgco2e ?? 0) / 1000 },
    { label: "Emissões Transporte (tCO₂e)", noDiff: true, value: (p) => (p.result?.scope3_logistics_kgco2e ?? 0) / 1000 },
    { label: "Cobertura (%)", noDiff: true, value: (p) => p.result?.coverage_pct ?? 0 },
    { label: "Itens Mapeados", noDiff: true, value: (p) => p.result?.items_mapped ?? 0 },
  ];

  for (const m of metrics) {
    const values = perScenario.map(m.value);
    const rowCells: Array<string | number> = [m.label];
    values.forEach((v, i) => {
      rowCells.push(v);
      if (i !== baseIdx) rowCells.push(m.noDiff ? "" : pct(values[baseIdx], v));
    });
    const row = wsInd.addRow(rowCells);
    row.getCell(1).font = { bold: true, size: 9 };
    for (let col = 2; col <= rowCells.length; col++) {
      const cell = row.getCell(col);
      cell.alignment = { horizontal: "right" };
      if (typeof rowCells[col - 1] === "number") {
        cell.numFmt = m.isCurrency ? "#,##0" : "#,##0.00";
      }
    }
  }

  wsInd.columns = colWidths.map((width) => ({ width }));

  // ── Sheet 2 & 3: Detail per scenario ──────────────────────────────
  const addDetailSheet = (
    sheetName: string,
    scenData: ScenData,
  ) => {
    const ws = wb.addWorksheet(sheetName);

    const header = ws.addRow([
      "Composição", "Código", "Un", "Qtd (Input)", "Custo (Input)",
      "Insumo", "Código Insumo", "Un", "Qtd Expandida",
      "Fator Emissão", "Unidade Fator", "Fonte", "Versão do Fator", "tCO₂e",
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
        "", "", "Σ Insumos", "", Math.round(parentEmission * 10000) / 10000,
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
          si.factor_value ?? "", si.factor_unit ?? "", si.source_tier ?? "", si.factor_version ?? "",
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
          si.factor_value ?? "", si.factor_unit ?? "", si.source_tier ?? "", si.factor_version ?? "",
          Math.round(em * 10000) / 10000,
        ]);
      }
    }

    ws.columns = [
      { width: 45 }, { width: 14 }, { width: 6 }, { width: 14 }, { width: 16 },
      { width: 45 }, { width: 18 }, { width: 6 }, { width: 14 },
      { width: 12 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 },
    ];
    ws.views = [{ state: "frozen", ySplit: 1 }];
  };

  // Nomes de aba do Excel: máx 31 caracteres e únicos no workbook — com N
  // cenários, truncamentos de nomes parecidos podem colidir (ex.: dois
  // cenários cujos primeiros 28 caracteres são iguais), então desambigua
  // com um sufixo numérico quando necessário.
  const usedSheetNames = new Set<string>();
  scenariosData.forEach((d) => {
    const fullName = d.scenario.name as string;
    let sheetName = fullName.length > 31 ? fullName.slice(0, 28) + "..." : fullName;
    let suffix = 2;
    while (usedSheetNames.has(sheetName)) {
      const base = fullName.length > 26 ? fullName.slice(0, 23) + "..." : fullName;
      sheetName = `${base} (${suffix})`;
      suffix++;
    }
    usedSheetNames.add(sheetName);
    addDetailSheet(sheetName, d);
  });

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
