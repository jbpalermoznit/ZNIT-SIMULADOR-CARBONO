/**
 * PDF Report Generator - Comparison report matching reference format
 * Uses jsPDF + jspdf-autotable
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { BrandingSettings } from "@/app/settings/page";

export interface ReportScenario {
  name: string;
  totalTco2e: number;
  totalCostR$: number;
  concretoM3: number;
  concretoTco2e: number;
  acoTon: number;
  acoTco2e: number;
  materiaisTco2e: number;
  transporteTco2e: number;
  items: ReportItem[];
}

export interface ReportItem {
  description: string;
  costCode: string;
  unit: string;
  quantity: number;
  emissionTco2e: number;
  /** Fase/etapa de obra (abc_items.phase) — usada pelo relatório LEED v5 por fase. */
  phase?: string | null;
  children?: ReportChild[];
}

export interface ReportChild {
  description: string;
  costCode: string;
  unit: string;
  quantity: number;
  emissionTco2e: number;
  factorValue: number;
  factorSource: string;
}

interface ReportData {
  projectName: string;
  scenarioA: ReportScenario;
  scenarioB: ReportScenario;
  createdAt: string;
}

function fmtN(v: number, d = 2): string {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: d, minimumFractionDigits: d });
}

function fmtR$(v: number): string {
  if (v === 0) return "R$ 0";
  return "R$ " + v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/**
 * Helpers de desenho compartilhados entre os geradores de relatório
 * (logo/rodapé/linha de cabeçalho) — mesmo padrão visual em todo PDF.
 * `getY`/`setY` indiretos porque cada gerador mantém seu próprio cursor Y.
 */
function createPdfHelpers(
  doc: jsPDF,
  branding: BrandingSettings,
  pageW: number,
  pageH: number,
  ml: number,
  mr: number,
  rgb: [number, number, number]
) {
  const drawLogo = (xRight: number, yTop: number, maxW: number, maxH: number) => {
    if (branding.companyLogo) {
      try {
        // Get image natural dimensions to preserve aspect ratio
        const img = new Image();
        img.src = branding.companyLogo;
        const natW = img.width || 200;
        const natH = img.height || 60;
        const ratio = natW / natH;
        let w = maxW;
        let h = w / ratio;
        if (h > maxH) {
          h = maxH;
          w = h * ratio;
        }
        doc.addImage(branding.companyLogo, "AUTO", xRight - w, yTop, w, h);
        return;
      } catch { /* fallback to text */ }
    }
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...rgb);
    doc.text(branding.companyName || "ZNIT", xRight, yTop + 5, { align: "right" });
  };

  const drawFooter = (pg: number) => {
    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(180, 180, 180);
    doc.text(branding.reportFooter || "www.znit.ai", ml, pageH - 7);
    doc.text("Pag. " + pg, pageW - mr, pageH - 7, { align: "right" });
  };

  const drawHeaderLine = (y: number) => {
    doc.setDrawColor(...rgb);
    doc.setLineWidth(0.4);
    doc.line(ml, y, pageW - mr, y);
    return y + 4;
  };

  return { drawLogo, drawFooter, drawHeaderLine };
}

export function generateComparisonPDF(
  data: ReportData,
  branding: BrandingSettings
): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const ml = 15; // margin left
  const mr = 15;
  let y = ml;

  const pc = branding.primaryColor || "#56B7A5";
  const rgb = hexRgb(pc);
  const aName = data.scenarioA.name.split(" - ").pop() || "Padrao";
  const bName = data.scenarioB.name.split(" - ").pop() || "Novo";

  const { drawLogo, drawFooter, drawHeaderLine } = createPdfHelpers(doc, branding, pageW, pageH, ml, mr, rgb);

  // ── PAGE 1: Header + Indicators ────────────────────────────────────
  // Logo
  drawLogo(pageW - mr, y, 25, 10);

  // Title
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(3, 3, 4);
  doc.text("RELATORIO COMPARATIVO DE EMISSOES", ml, y + 7);

  y += 12;
  y = drawHeaderLine(y);

  // Scenario identification
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(128, 129, 129);
  doc.text("Projeto: " + data.projectName + "  |  Emitido em: " + data.createdAt, ml, y + 3);

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(3, 3, 4);
  doc.text("Cenario A (Referencia):  " + data.scenarioA.name, ml, y + 9);
  doc.setTextColor(...rgb);
  doc.text("Cenario B (Comparacao):  " + data.scenarioB.name, ml, y + 14);
  y += 18;

  // Big numbers
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(3, 3, 4);
  doc.text(fmtN(data.scenarioA.totalTco2e) + " tCO2e", ml, y + 7);

  const diffPct = data.scenarioA.totalTco2e > 0
    ? ((data.scenarioA.totalTco2e - data.scenarioB.totalTco2e) / data.scenarioA.totalTco2e * 100).toFixed(1)
    : "0";

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(128, 129, 129);
  doc.text("vs", ml + 55, y + 5);

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...rgb);
  doc.text(fmtN(data.scenarioB.totalTco2e) + " tCO2e", ml + 62, y + 7);

  doc.setFontSize(12);
  doc.text("-" + diffPct + "%", ml + 130, y + 7);
  y += 14;

  // Indicators table
  const a = data.scenarioA;
  const b = data.scenarioB;
  const pct = (va: number, vb: number) => va > 0 ? ((va - vb) / va * 100).toFixed(2) + "%" : "0.00%";

  const indicatorRows = [
    ["Emissoes Totais (tCO2e)", fmtN(a.totalTco2e), fmtN(b.totalTco2e), pct(a.totalTco2e, b.totalTco2e)],
    ["Valor (R$)", fmtR$(a.totalCostR$), fmtR$(b.totalCostR$), pct(a.totalCostR$, b.totalCostR$)],
    ["Quantidade de concreto (m3)", fmtN(a.concretoM3, 1), fmtN(b.concretoM3, 1), pct(a.concretoM3, b.concretoM3)],
    ["Indicador de Concreto tCO2/m3", a.concretoM3 > 0 ? fmtN(a.concretoTco2e / a.concretoM3) : "0", b.concretoM3 > 0 ? fmtN(b.concretoTco2e / b.concretoM3) : "0", ""],
    ["Quantidade de aco (ton)", fmtN(a.acoTon, 1), fmtN(b.acoTon, 1), pct(a.acoTon, b.acoTon)],
    ["Indicador de Aco tCO2/ton", a.acoTon > 0 ? fmtN(a.acoTco2e / a.acoTon) : "0", b.acoTon > 0 ? fmtN(b.acoTco2e / b.acoTon) : "0", ""],
    ["Emissoes de Materiais (tCO2e)", fmtN(a.materiaisTco2e), fmtN(b.materiaisTco2e), pct(a.materiaisTco2e, b.materiaisTco2e)],
    ["Emissoes de Transporte (tCO2e)", fmtN(a.transporteTco2e), fmtN(b.transporteTco2e), pct(a.transporteTco2e, b.transporteTco2e)],
  ];

  autoTable(doc, {
    startY: y,
    head: [["Parametro", aName, bName, "Diferenca %"]],
    body: indicatorRows,
    margin: { left: ml, right: mr },
    styles: { fontSize: 8, cellPadding: 2.5, font: "helvetica" },
    headStyles: { fillColor: rgb, textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 249] },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 60 },
      1: { halign: "right" as const, cellWidth: 35 },
      2: { halign: "right" as const, cellWidth: 35 },
      3: { halign: "right" as const, cellWidth: 30 },
    },
  });

  drawFooter(1);

  // ── PAGE 2+: Item details ──────────────────────────────────────────
  doc.addPage();
  y = ml;

  drawLogo(pageW - mr, y, 20, 8);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(3, 3, 4);
  doc.text("DETALHAMENTO POR COMPOSICAO E INSUMOS", ml, y + 6);

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(128, 129, 129);
  doc.text(
    data.scenarioA.name + "  vs  " + data.scenarioB.name,
    ml, y + 11
  );
  y += 14;
  y = drawHeaderLine(y);

  // Build detail rows
  const allItems = [
    ...a.items.map((i) => ({ ...i, scen: aName })),
    ...b.items.map((i) => ({ ...i, scen: bName })),
  ].sort((x, yy) => yy.emissionTco2e - x.emissionTco2e);

  const detailRows: string[][] = [];
  for (const item of allItems.slice(0, 50)) {
    detailRows.push([
      item.scen,
      item.description,
      item.unit,
      fmtN(item.quantity, 0),
      fmtN(item.emissionTco2e),
      item.costCode,
    ]);
    if (item.children) {
      for (const child of item.children.slice(0, 6)) {
        detailRows.push([
          " ",
          "  > " + child.description,
          child.unit,
          fmtN(child.quantity, 1),
          fmtN(child.emissionTco2e, 4),
          "FE: " + child.factorValue + " | " + child.factorSource,
        ]);
      }
    }
  }

  autoTable(doc, {
    startY: y,
    head: [["Cenario", "Descricao", "Un", "Quantidade", "tCO2e", "Codigo"]],
    body: detailRows,
    margin: { left: ml, right: mr },
    styles: { fontSize: 6.5, cellPadding: 1.5, font: "helvetica", overflow: "linebreak" },
    headStyles: { fillColor: rgb, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7 },
    columnStyles: {
      0: { cellWidth: 16 },
      1: { cellWidth: 58 },
      2: { cellWidth: 10, halign: "center" as const },
      3: { cellWidth: 20, halign: "right" as const },
      4: { cellWidth: 18, halign: "right" as const, fontStyle: "bold" },
      5: { cellWidth: 40, fontSize: 5.5, textColor: [128, 128, 128] },
    },
    didDrawPage: (hookData) => {
      drawFooter(hookData.pageNumber);
    },
    rowPageBreak: "auto",
  });

  return doc;
}

export interface PhaseReportData {
  projectName: string;
  scenario: ReportScenario;
  createdAt: string;
}

interface PhaseGroup {
  phase: string;
  tco2e: number;
  items: ReportItem[];
}

const UNCLASSIFIED_PHASE = "Nao classificado";

/**
 * Agrupa por fase somando só os itens de topo (`emissionTco2e` do pai já
 * inclui os filhos, mesmo padrão de agregação usado no Overview) — os
 * filhos entram na tabela de detalhe de cada fase, mas não no subtotal.
 */
function groupItemsByPhase(items: ReportItem[]): PhaseGroup[] {
  const groups = new Map<string, PhaseGroup>();
  for (const item of items) {
    const phase = item.phase?.trim() || UNCLASSIFIED_PHASE;
    let group = groups.get(phase);
    if (!group) {
      group = { phase, tco2e: 0, items: [] };
      groups.set(phase, group);
    }
    group.tco2e += item.emissionTco2e;
    group.items.push(item);
  }
  return [...groups.values()].sort((x, y) => y.tco2e - x.tco2e);
}

export function generatePhaseReportPDF(
  data: PhaseReportData,
  branding: BrandingSettings
): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const ml = 15;
  const mr = 15;
  let y = ml;

  const pc = branding.primaryColor || "#56B7A5";
  const rgb = hexRgb(pc);
  const { drawLogo, drawFooter, drawHeaderLine } = createPdfHelpers(doc, branding, pageW, pageH, ml, mr, rgb);

  const groups = groupItemsByPhase(data.scenario.items);
  const totalTco2e = groups.reduce((sum, g) => sum + g.tco2e, 0);

  // ── PAGE 1: Header + Phase summary ─────────────────────────────────
  drawLogo(pageW - mr, y, 25, 10);

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(3, 3, 4);
  doc.text("RELATORIO DE CARBONO POR FASE DE OBRA (LEED v5)", ml, y + 7);

  y += 12;
  y = drawHeaderLine(y);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(128, 129, 129);
  doc.text("Projeto: " + data.projectName + "  |  Emitido em: " + data.createdAt, ml, y + 3);

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(3, 3, 4);
  doc.text("Cenario:  " + data.scenario.name, ml, y + 9);
  y += 14;

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...rgb);
  doc.text(fmtN(totalTco2e) + " tCO2e", ml, y + 7);
  y += 14;

  const summaryRows = groups.map((g) => [
    g.phase,
    fmtN(g.tco2e),
    (totalTco2e > 0 ? (g.tco2e / totalTco2e * 100) : 0).toFixed(1) + "%",
  ]);

  autoTable(doc, {
    startY: y,
    head: [["Fase de Obra", "tCO2e", "% do Total"]],
    body: summaryRows,
    margin: { left: ml, right: mr },
    styles: { fontSize: 8, cellPadding: 2.5, font: "helvetica" },
    headStyles: { fillColor: rgb, textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 249] },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 100 },
      1: { halign: "right" as const, cellWidth: 35 },
      2: { halign: "right" as const, cellWidth: 30 },
    },
  });

  drawFooter(1);

  // ── PAGE 2+: One detail section per phase ──────────────────────────
  for (const group of groups) {
    doc.addPage();
    y = ml;

    drawLogo(pageW - mr, y, 20, 8);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(3, 3, 4);
    doc.text("FASE: " + group.phase.toUpperCase(), ml, y + 6);

    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(128, 129, 129);
    doc.text(
      fmtN(group.tco2e) + " tCO2e  |  " + (totalTco2e > 0 ? (group.tco2e / totalTco2e * 100) : 0).toFixed(1) + "% do total",
      ml, y + 11
    );
    y += 14;
    y = drawHeaderLine(y);

    const detailRows: string[][] = [];
    for (const item of group.items.sort((x, yy) => yy.emissionTco2e - x.emissionTco2e)) {
      detailRows.push([
        item.description,
        item.unit,
        fmtN(item.quantity, 0),
        fmtN(item.emissionTco2e),
        item.costCode,
      ]);
      if (item.children) {
        for (const child of item.children.slice(0, 6)) {
          detailRows.push([
            "  > " + child.description,
            child.unit,
            fmtN(child.quantity, 1),
            fmtN(child.emissionTco2e, 4),
            "FE: " + child.factorValue + " | " + child.factorSource,
          ]);
        }
      }
    }

    autoTable(doc, {
      startY: y,
      head: [["Descricao", "Un", "Quantidade", "tCO2e", "Codigo"]],
      body: detailRows,
      margin: { left: ml, right: mr },
      styles: { fontSize: 6.5, cellPadding: 1.5, font: "helvetica", overflow: "linebreak" },
      headStyles: { fillColor: rgb, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 74 },
        1: { cellWidth: 10, halign: "center" as const },
        2: { cellWidth: 20, halign: "right" as const },
        3: { cellWidth: 18, halign: "right" as const, fontStyle: "bold" },
        4: { cellWidth: 40, fontSize: 5.5, textColor: [128, 128, 128] },
      },
      didDrawPage: (hookData) => {
        drawFooter(hookData.pageNumber);
      },
      rowPageBreak: "auto",
    });
  }

  return doc;
}
