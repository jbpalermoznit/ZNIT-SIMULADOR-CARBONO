/**
 * PDF Report Generator — matches reference report format
 * Uses jsPDF + jspdf-autotable for client-side PDF generation
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { BrandingSettings } from "@/app/settings/page";

interface ReportScenario {
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

interface ReportItem {
  description: string;
  costCode: string;
  unit: string;
  quantity: number;
  emissionTco2e: number;
  children?: ReportChild[];
}

interface ReportChild {
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
  capacity: number;
  unit: string;
  createdAt: string;
}

export function generateComparisonPDF(
  data: ReportData,
  branding: BrandingSettings
): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentW = pageW - margin * 2;
  let y = margin;

  const primary = branding.primaryColor || "#56B7A5";
  const hexToRgb = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return [r, g, b] as [number, number, number];
  };
  const primaryRgb = hexToRgb(primary);

  // ─── Header ───────────────────────────────────────────────────────────
  const drawHeader = () => {
    // Logo or company name
    if (branding.companyLogo) {
      try {
        doc.addImage(branding.companyLogo, "PNG", pageW - margin - 30, y, 30, 12);
      } catch {
        doc.setFontSize(10);
        doc.setTextColor(...primaryRgb);
        doc.text(branding.companyName, pageW - margin, y + 6, { align: "right" });
      }
    } else {
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...primaryRgb);
      doc.text(branding.companyName, pageW - margin, y + 6, { align: "right" });
    }

    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text(branding.reportFooter || "www.znit.ai", pageW - margin, y + 12, { align: "right" });

    // Title
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(3, 3, 4);
    doc.text("RELATÓRIO COMPARATIVO DE EMISSÕES", margin, y + 8);

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(128, 128, 128);
    doc.text(
      `Projeto: ${data.projectName} · Emitido em: ${data.createdAt} · Capacidade: ${data.capacity} ${data.unit}`,
      margin, y + 14
    );

    // Separator line
    y += 18;
    doc.setDrawColor(...primaryRgb);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageW - margin, y);
    y += 6;
  };

  // ─── Footer ───────────────────────────────────────────────────────────
  const drawFooter = (pageNum: number) => {
    doc.setFontSize(7);
    doc.setTextColor(189, 189, 188);
    doc.text(branding.reportFooter || "www.znit.ai", margin, pageH - 8);
    doc.text(`Página ${pageNum}`, pageW - margin, pageH - 8, { align: "right" });
  };

  // ─── Page 1: Indicators Table ─────────────────────────────────────────
  drawHeader();

  // Big comparison numbers
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(3, 3, 4);
  const aLabel = data.scenarioA.name.split(" - ").pop() || "PADRÃO";
  const bLabel = data.scenarioB.name.split(" - ").pop() || "NOVO";
  doc.text(`${aLabel}: ${fmtNum(data.scenarioA.totalTco2e)} tCO₂e`, margin, y + 6);
  doc.setTextColor(...primaryRgb);
  doc.text(`${bLabel}: ${fmtNum(data.scenarioB.totalTco2e)} tCO₂e`, margin, y + 14);
  y += 22;

  // Indicators table
  const a = data.scenarioA;
  const b = data.scenarioB;
  const pct = (va: number, vb: number) => va > 0 ? `${((va - vb) / va * 100).toFixed(2)}%` : "0.00%";

  const indicatorRows = [
    ["Emissões Totais (tCO₂e)", fmtNum(a.totalTco2e), fmtNum(b.totalTco2e), pct(a.totalTco2e, b.totalTco2e)],
    ["Valor (R$)", fmtBRL(a.totalCostR$), fmtBRL(b.totalCostR$), pct(a.totalCostR$, b.totalCostR$)],
    ["Quantidade de concreto (m³)", fmtNum(a.concretoM3, 1), fmtNum(b.concretoM3, 1), pct(a.concretoM3, b.concretoM3)],
    ["Indicador de Concreto tCO₂/m³", a.concretoM3 > 0 ? fmtNum(a.concretoTco2e / a.concretoM3) : "0", b.concretoM3 > 0 ? fmtNum(b.concretoTco2e / b.concretoM3) : "0", ""],
    ["Quantidade de aço (ton)", fmtNum(a.acoTon, 1), fmtNum(b.acoTon, 1), pct(a.acoTon, b.acoTon)],
    ["Indicador de Aço tCO₂/ton", a.acoTon > 0 ? fmtNum(a.acoTco2e / a.acoTon) : "0", b.acoTon > 0 ? fmtNum(b.acoTco2e / b.acoTon) : "0", ""],
    ["Emissões de Materiais (tCO₂e)", fmtNum(a.materiaisTco2e), fmtNum(b.materiaisTco2e), pct(a.materiaisTco2e, b.materiaisTco2e)],
    ["Emissões de Transporte (tCO₂e)", fmtNum(a.transporteTco2e), fmtNum(b.transporteTco2e), pct(a.transporteTco2e, b.transporteTco2e)],
  ];

  autoTable(doc, {
    startY: y,
    head: [["Parâmetro", aLabel, bLabel, "Diferença %"]],
    body: indicatorRows,
    margin: { left: margin, right: margin },
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: primaryRgb, textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 249] },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 65 },
      1: { halign: "right", cellWidth: 35 },
      2: { halign: "right", cellWidth: 35 },
      3: { halign: "right", cellWidth: 30 },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable?.finalY ?? y + 80;
  y += 8;

  drawFooter(1);

  // ─── Pages 2+: Item detail table (top emitters) ───────────────────────
  const allItems = [
    ...a.items.map((i) => ({ ...i, scenario: aLabel })),
    ...b.items.map((i) => ({ ...i, scenario: bLabel })),
  ].sort((x, y) => y.emissionTco2e - x.emissionTco2e);

  doc.addPage();
  y = margin;
  drawHeader();

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(3, 3, 4);
  doc.text("Detalhamento por Item — Composições e Insumos", margin, y + 4);
  y += 8;

  const detailRows: (string | number)[][] = [];
  for (const item of allItems.slice(0, 40)) {
    detailRows.push([
      item.scenario,
      item.description,
      item.unit,
      fmtNum(item.quantity, 0),
      fmtNum(item.emissionTco2e),
      item.costCode,
    ]);
    if (item.children) {
      for (const child of item.children.slice(0, 5)) {
        detailRows.push([
          "↳",
          child.description,
          child.unit,
          fmtNum(child.quantity, 1),
          fmtNum(child.emissionTco2e, 4),
          `FE: ${child.factorValue} · ${child.factorSource}`,
        ]);
      }
    }
  }

  autoTable(doc, {
    startY: y,
    head: [["Cenário", "Descrição", "Un", "Quantidade", "Emissões (tCO₂e)", "Código"]],
    body: detailRows,
    margin: { left: margin, right: margin },
    styles: { fontSize: 6.5, cellPadding: 1.5, overflow: "linebreak" },
    headStyles: { fillColor: primaryRgb, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7 },
    columnStyles: {
      0: { cellWidth: 18 },
      1: { cellWidth: 55 },
      2: { cellWidth: 12, halign: "center" },
      3: { cellWidth: 22, halign: "right" },
      4: { cellWidth: 22, halign: "right", fontStyle: "bold" },
      5: { cellWidth: 38, fontSize: 5.5, textColor: [128, 128, 128] },
    },
    didDrawPage: (hookData) => {
      drawFooter(hookData.pageNumber);
      if (hookData.pageNumber > 1) {
        // Mini header on subsequent pages
        doc.setFontSize(7);
        doc.setTextColor(128, 128, 128);
        doc.text(`${data.projectName} — Relatório Comparativo`, margin, 10);
        if (branding.companyLogo) {
          try { doc.addImage(branding.companyLogo, "PNG", pageW - margin - 20, 5, 20, 8); } catch {}
        }
      }
    },
    rowPageBreak: "auto",
  });

  return doc;
}

function fmtNum(v: number, d = 2): string {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: d, minimumFractionDigits: d });
}

function fmtBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
