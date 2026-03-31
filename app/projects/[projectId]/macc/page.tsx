"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams } from "next/navigation";
import { ArrowDownRight, Info, Loader2, Pencil } from "lucide-react";
import { getMaccData, type MaccBar } from "@/lib/api/macc";

const SOURCE_LABELS: Record<string, string> = {
  epd: "EPD",
  cecarbon: "CECarbon",
  ecoinvent: "Ecoinvent",
  ghg_protocol: "GHG Protocol",
  rule: "Regra",
};

const TIER_COLORS: Record<string, [string, string]> = {
  epd: ["bg-[#EDE9FE]", "text-[#7c3aed]"],
  cecarbon: ["bg-[#FEF3C7]", "text-[#92400E]"],
  ecoinvent: ["bg-[#F0F4F3]", "text-[#808181]"],
  ghg_protocol: ["bg-[#DBEAFE]", "text-[#1D4ED8]"],
};

// Group bars by item, keep best alternative per item (highest abatement)
function pickTopItems(bars: MaccBar[]) {
  const byItem = new Map<string, MaccBar>();
  for (const bar of bars) {
    const existing = byItem.get(bar.item_cost_code);
    if (!existing || bar.abatement_tco2e > existing.abatement_tco2e) {
      byItem.set(bar.item_cost_code, bar);
    }
  }
  return [...byItem.values()]
    .sort((a, b) => b.abatement_tco2e - a.abatement_tco2e);
}

type CountryFilter = "all" | "brasil" | "outros";

export default function MaccPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [allBars, setAllBars] = useState<MaccBar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredBar, setHoveredBar] = useState<string | null>(null);
  const [countryFilter, setCountryFilter] = useState<CountryFilter>("all");

  // Cost multipliers: barId → multiplier (default 1.0 = same cost)
  const [multipliers, setMultipliers] = useState<Record<string, number>>({});
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    getMaccData(projectId)
      .then((data) => {
        if (!cancelled) {
          setAllBars(data.bars);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message || "Erro ao carregar dados MACC");
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [projectId]);

  // Filter by country
  const filteredBars = useMemo(() => {
    if (countryFilter === "all") return allBars;
    return allBars.filter((bar) => {
      const country = (bar.country ?? "").toLowerCase();
      const isBrasil = country.includes("brazil") || country.includes("brasil");
      return countryFilter === "brasil" ? isBrasil : !isBrasil;
    });
  }, [allBars, countryFilter]);

  const topItems = useMemo(() => pickTopItems(filteredBars), [filteredBars]);

  // Count EPDs by country for the dropdown label
  const countryStats = useMemo(() => {
    let br = 0, other = 0;
    for (const b of allBars) {
      const c = (b.country ?? "").toLowerCase();
      if (c.includes("brazil") || c.includes("brasil")) br++;
      else other++;
    }
    return { br, other };
  }, [allBars]);

  // Apply multipliers to compute cost in R$/tCO₂e
  const barsWithCost = useMemo(() => {
    return topItems.map((bar) => {
      const mult = multipliers[bar.id] ?? 1.0;
      // Total baseline cost = unit_cost × quantity
      const baselineTotalCost = (bar.item_unit_cost ?? 0) * (bar.item_quantity ?? 0);
      // Alternative total cost = baseline × multiplier
      const altTotalCost = baselineTotalCost * mult;
      // Delta cost in R$
      const deltaCost = altTotalCost - baselineTotalCost;
      // Cost per tCO₂e avoided (R$/tCO₂e)
      const costPerTco2e = bar.abatement_tco2e > 0 ? deltaCost / bar.abatement_tco2e : 0;
      const category = costPerTco2e < 0 ? "saving" as const
        : costPerTco2e <= 50 ? "low" as const
        : costPerTco2e <= 200 ? "medium" as const
        : "high" as const;
      return { ...bar, cost_per_tco2e: Math.round(costPerTco2e), category };
    });
  }, [topItems, multipliers]);

  // Sort by cost (MACC convention: cheapest first)
  const sorted = useMemo(
    () => [...barsWithCost].sort((a, b) => a.cost_per_tco2e - b.cost_per_tco2e),
    [barsWithCost]
  );

  // KPIs computed from sorted bars with multipliers
  const kpis = useMemo(() => {
    if (sorted.length === 0) return null;
    const total = sorted.reduce((s, b) => s + b.abatement_tco2e, 0);
    const savingsBars = sorted.filter((b) => b.cost_per_tco2e < 0);
    const savingsTotal = savingsBars.reduce((s, b) => s + b.abatement_tco2e, 0);
    const costs = sorted.map((b) => b.cost_per_tco2e);
    const avg = costs.reduce((s, c) => s + c, 0) / costs.length;
    return {
      total_abatement: total,
      savings_abatement: savingsTotal,
      savings_count: savingsBars.length,
      avg_cost: avg,
      total_alternatives: sorted.length,
    };
  }, [sorted]);

  const hasCostData = sorted.some((d) => d.cost_per_tco2e !== 0);

  // Chart dimensions
  const chartW = 900;
  const chartH = 380;
  const padL = 70;
  const padR = 30;
  const padT = 40;
  const padB = 50;
  const innerW = chartW - padL - padR;
  const innerH = chartH - padT - padB;

  // Y-axis: cost or reduction %
  const reductionPcts = useMemo(
    () => sorted.map((d) =>
      d.baseline_factor > 0 ? ((d.baseline_factor - d.alternative_factor) / d.baseline_factor) * 100 : 0
    ),
    [sorted]
  );
  const maxReduction = Math.max(...(reductionPcts.length ? reductionPcts : [10]), 10);
  const maxCost = hasCostData
    ? Math.max(...sorted.map((d) => Math.abs(d.cost_per_tco2e)), 20)
    : maxReduction;

  const yScale = useCallback(
    (v: number) => padT + innerH / 2 - (v / maxCost) * (innerH / 2),
    [padT, innerH, maxCost]
  );
  const zeroY = yScale(0);

  const totalAbatement = sorted.reduce((s, d) => s + d.abatement_tco2e, 0);
  const barGap = 6;
  const totalGaps = Math.max(0, sorted.length - 1) * barGap;
  const xScale = useCallback(
    (abatement: number) =>
      totalAbatement > 0 ? (abatement / totalAbatement) * (innerW - totalGaps) : 0,
    [totalAbatement, innerW, totalGaps]
  );

  const barPositions = useMemo(() => {
    const positions: number[] = [];
    let acc = padL;
    for (const bar of sorted) {
      positions.push(acc);
      acc += Math.max(xScale(bar.abatement_tco2e), 20) + barGap;
    }
    return positions;
  }, [sorted, padL, barGap, xScale]);

  // Grid — dynamic steps based on maxCost
  const gridSteps = hasCostData
    ? (() => {
        const step = Math.ceil(maxCost / 3 / 50) * 50 || 50;
        return [-step * 2, -step, 0, step, step * 2];
      })()
    : [0, -20, -40, -60, -80];
  const gridValues = gridSteps.filter((v) => {
    const y = yScale(v);
    return y >= padT && y <= chartH - padB;
  });

  // Bar colors by category
  const barColor = (cat: string) => {
    switch (cat) {
      case "saving": return "#16A34A";
      case "low": return "#56B7A5";
      case "medium": return "#F59E0B";
      case "high": return "#EF4444";
      default: return "#56B7A5";
    }
  };

  const handleMultiplierChange = (barId: string, value: string) => {
    const num = parseFloat(value);
    if (!isNaN(num) && num >= 0 && num <= 5) {
      setMultipliers((prev) => ({ ...prev, [barId]: num }));
    }
  };

  const formatAbatement = (val: number, unit: string) => {
    if (unit === "tCO₂e") {
      return val >= 1000
        ? `${(val / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k tCO₂e`
        : `${val.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} tCO₂e`;
    }
    return `${val.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} ${unit}`;
  };

  return (
    <div className="p-7">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#030304] mb-1">Curva MACC</h1>
          <p className="text-sm text-[#808181]">
            Curva de Custo Marginal de Abatimento — materiais com maior potencial de redução de carbono
          </p>
        </div>
        {allBars.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-semibold text-[#808181] uppercase tracking-wide">EPDs de</label>
            <select
              value={countryFilter}
              onChange={(e) => setCountryFilter(e.target.value as CountryFilter)}
              className="px-3 py-1.5 border border-[#E0E4E3] rounded-lg text-xs text-[#030304] bg-white focus:outline-none focus:ring-2 focus:ring-[#56B7A5]/30"
            >
              <option value="all">Todos os países ({allBars.length})</option>
              <option value="brasil">Brasil ({countryStats.br})</option>
              <option value="outros">Outros países ({countryStats.other})</option>
            </select>
          </div>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20 text-[#808181]">
          <Loader2 className="animate-spin mr-2" size={18} />
          Calculando curva MACC...
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center text-red-600 text-sm">
          {error}
        </div>
      )}

      {!loading && !error && allBars.length === 0 && (
        <div className="bg-white rounded-xl border border-[#E0E4E3] p-12 text-center text-[#808181]">
          <p className="mb-2">Nenhuma alternativa encontrada.</p>
          <p className="text-[11px]">
            Importe uma curva ABC e rode o auto-map para que a MACC identifique alternativas.
          </p>
        </div>
      )}

      {!loading && !error && sorted.length > 0 && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-[#E0E4E3] p-4">
              <p className="text-[10px] text-[#808181] uppercase tracking-wide mb-1">Potencial Total</p>
              <p className="text-xl font-bold text-[#030304]">
                {formatAbatement(kpis?.total_abatement ?? 0, sorted[0]?.abatement_unit ?? "kgCO₂e")}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-[#E0E4E3] p-4">
              <p className="text-[10px] text-[#808181] uppercase tracking-wide mb-1">Com Economia</p>
              <p className="text-xl font-bold text-[#16A34A]">
                {formatAbatement(kpis?.savings_abatement ?? 0, sorted[0]?.abatement_unit ?? "kgCO₂e")}
              </p>
              <p className="text-[10px] text-[#808181] mt-0.5">
                {kpis?.savings_count ?? 0} alternativa{(kpis?.savings_count ?? 0) !== 1 ? "s" : ""} mais barata{(kpis?.savings_count ?? 0) !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-[#E0E4E3] p-4">
              <p className="text-[10px] text-[#808181] uppercase tracking-wide mb-1">Custo Médio</p>
              <p className="text-xl font-bold text-[#030304]">
                R$ {(kpis?.avg_cost ?? 0) > 0 ? "+" : ""}{(kpis?.avg_cost ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
                <span className="text-sm font-normal text-[#808181] ml-1">/tCO₂e</span>
              </p>
            </div>
            <div className="bg-white rounded-xl border border-[#E0E4E3] p-4">
              <p className="text-[10px] text-[#808181] uppercase tracking-wide mb-1">Materiais</p>
              <p className="text-xl font-bold text-[#030304]">{sorted.length}</p>
              <p className="text-[10px] text-[#808181] mt-0.5">de {allBars.length} alternativas totais</p>
            </div>
          </div>

          {/* MACC Chart */}
          <div className="bg-white rounded-xl border border-[#E0E4E3] shadow-[0_1px_3px_rgba(3,3,4,0.06)] p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-[#030304]">
                  Curva MACC — Principais Materiais
                </h2>
                <Info size={14} className="text-[#BDBDBC]" />
              </div>
              {!hasCostData && (
                <p className="text-[10px] text-[#808181] bg-[#F8FAF9] px-2 py-1 rounded">
                  Ajuste os multiplicadores abaixo para ver a curva de custo
                </p>
              )}
            </div>

            <svg
              viewBox={`0 0 ${chartW} ${chartH}`}
              className="w-full"
              style={{ maxHeight: 380 }}
            >
              {/* Grid lines */}
              {gridValues.map((v) => (
                <g key={v}>
                  <line
                    x1={padL} x2={chartW - padR}
                    y1={yScale(v)} y2={yScale(v)}
                    stroke={v === 0 ? "#030304" : "#F0F4F3"}
                    strokeWidth={v === 0 ? 1.5 : 1}
                  />
                  <text x={padL - 8} y={yScale(v) + 4} textAnchor="end" fill="#808181" className="text-[10px]">
                    {hasCostData
                      ? (v > 0 ? `+R$${v}` : v < 0 ? `-R$${Math.abs(v)}` : "0")
                      : (v === 0 ? "0" : `${Math.abs(v)}%`)}
                  </text>
                </g>
              ))}

              {/* Y-axis label */}
              <text x={4} y={chartH / 2} textAnchor="middle"
                transform={`rotate(-90, 4, ${chartH / 2})`} fill="#808181" className="text-[10px]">
                {hasCostData ? "R$/tCO₂e evitada" : "Redução de carbono (%)"}
              </text>

              {/* X-axis: abatement value below each bar */}
              {sorted.map((bar, idx) => {
                const barW = Math.max(xScale(bar.abatement_tco2e), 20);
                const xMid = (barPositions[idx] ?? padL) + barW / 2;
                const label = bar.abatement_tco2e >= 1000
                  ? `${(bar.abatement_tco2e / 1000).toFixed(1)}k`
                  : bar.abatement_tco2e.toFixed(0);
                return (
                  <text key={`xval-${idx}`} x={xMid} y={zeroY + 28} textAnchor="middle" fill="#808181" className="text-[9px]">
                    {label}
                  </text>
                );
              })}
              {/* X-axis label */}
              <text x={chartW - padR} y={chartH - 6} textAnchor="end" fill="#808181" className="text-[10px]">
                tCO₂e evitada por material
              </text>

              {/* Zones */}
              <rect x={padL} y={zeroY} width={innerW}
                height={Math.max(0, chartH - padB - zeroY)} fill="#F0FDF4" opacity={0.4} />
              {hasCostData && (
                <rect x={padL} y={padT} width={innerW}
                  height={Math.max(0, zeroY - padT)} fill="#FEF2F2" opacity={0.2} />
              )}
              <text x={padL - 8} y={zeroY + 20} textAnchor="end" fill="#16A34A" className="text-[8px]" fontWeight={600}>
                {hasCostData ? "ECONOMIA" : "MENOR"}
              </text>
              {hasCostData && (
                <text x={padL - 8} y={zeroY - 14} textAnchor="end" fill="#EF4444" className="text-[8px]" fontWeight={600}>
                  MAIS CARO
                </text>
              )}

              {/* Bars */}
              {sorted.map((bar, idx) => {
                const barW = Math.max(xScale(bar.abatement_tco2e), 20);
                const x = barPositions[idx];
                const yValue = hasCostData
                  ? bar.cost_per_tco2e
                  : -(reductionPcts[idx] || 0);
                const barH = Math.max(Math.abs(yValue / maxCost) * (innerH / 2), 8);
                const y = yValue >= 0 ? zeroY - barH : zeroY;
                const isHovered = hoveredBar === bar.id;
                const color = barColor(bar.category);

                return (
                  <g key={bar.id}
                    onMouseEnter={() => setHoveredBar(bar.id)}
                    onMouseLeave={() => setHoveredBar(null)}
                    className="cursor-pointer">
                    <rect x={x} y={y} width={barW} height={barH} rx={3}
                      fill={color} opacity={isHovered ? 1 : 0.85}
                      stroke={isHovered ? "#030304" : "none"} strokeWidth={1.5} />
                    {/* Number label centered in bar */}
                    <text x={x + barW / 2} y={y + barH / 2 + 5}
                      textAnchor="middle" fill="white" className="text-[13px]" fontWeight={800}>
                      {idx + 1}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Legend below chart */}
            <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4 px-2">
              {sorted.map((bar, idx) => {
                const reduction = bar.baseline_factor > 0
                  ? ((bar.baseline_factor - bar.alternative_factor) / bar.baseline_factor * 100).toFixed(0)
                  : "0";
                return (
                  <div key={bar.id} className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold text-white"
                      style={{ backgroundColor: barColor(bar.category) }}>
                      {idx + 1}
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-[#030304] leading-tight">
                        {bar.item_description.length > 25 ? bar.item_description.slice(0, 25) + "…" : bar.item_description}
                      </p>
                      <p className="text-[10px] text-[#808181] leading-tight">
                        {bar.supplier} · -{reduction}% CO₂
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Table with editable multipliers */}
          <div className="bg-white rounded-xl border border-[#E0E4E3] shadow-[0_1px_3px_rgba(3,3,4,0.06)] overflow-hidden mb-6">
            <div className="px-6 py-4 border-b border-[#E0E4E3]">
              <h2 className="text-sm font-semibold text-[#030304]">Substitutos EPD — Multiplicador de Custo</h2>
              <p className="text-[11px] text-[#808181] mt-0.5">
                Ajuste o multiplicador para simular o custo da alternativa vs. baseline.
                Ex: 0.90 = 10% mais barato, 1.10 = 10% mais caro.
              </p>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#F0F4F3]">
                  <th className="text-left text-[10px] font-semibold text-[#808181] uppercase tracking-wide px-6 py-3">Material (Item ABC)</th>
                  <th className="text-left text-[10px] font-semibold text-[#808181] uppercase tracking-wide px-6 py-3">Alternativa EPD</th>
                  <th className="text-left text-[10px] font-semibold text-[#808181] uppercase tracking-wide px-6 py-3">País</th>
                  <th className="text-right text-[10px] font-semibold text-[#808181] uppercase tracking-wide px-6 py-3">Redução CO₂</th>
                  <th className="text-center text-[10px] font-semibold text-[#808181] uppercase tracking-wide px-6 py-3">Multiplicador</th>
                  <th className="text-right text-[10px] font-semibold text-[#808181] uppercase tracking-wide px-6 py-3">R$/tCO₂e</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((bar) => {
                  const mult = multipliers[bar.id] ?? 1.0;
                  const isEditing = editingId === bar.id;
                  const reduction = bar.baseline_factor > 0
                    ? ((bar.baseline_factor - bar.alternative_factor) / bar.baseline_factor * 100)
                    : 0;

                  return (
                    <tr key={bar.id} className="border-b border-[#F0F4F3] last:border-0 hover:bg-[#F8FAF9] transition-colors">
                      <td className="px-6 py-3">
                        <p className="text-sm font-semibold text-[#030304]">{bar.item_description}</p>
                        <p className="text-[10px] text-[#808181]">{bar.item_cost_code}</p>
                      </td>
                      <td className="px-6 py-3">
                        <p className="text-sm text-[#404040]">{bar.alternative_name.slice(0, 45)}</p>
                        <p className="text-[10px] text-[#808181]">{bar.supplier}</p>
                      </td>
                      <td className="px-6 py-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          ((bar as unknown as Record<string,string>).country ?? "").toLowerCase().includes("brazil")
                            ? "bg-[#E6F3EE] text-[#1d7a6b]"
                            : "bg-[#F0F4F3] text-[#808181]"
                        }`}>
                          {(bar as unknown as Record<string,string>).country || "—"}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <span className="text-sm font-semibold text-[#16A34A]">
                          <ArrowDownRight size={13} className="inline mr-1" />
                          {reduction.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center justify-center gap-1">
                          {isEditing ? (
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max="5"
                              value={mult}
                              onChange={(e) => handleMultiplierChange(bar.id, e.target.value)}
                              onBlur={() => setEditingId(null)}
                              onKeyDown={(e) => e.key === "Enter" && setEditingId(null)}
                              autoFocus
                              className="w-16 h-7 text-center text-sm font-mono font-bold border border-[#56B7A5] rounded bg-white focus:outline-none focus:ring-1 focus:ring-[#56B7A5]"
                            />
                          ) : (
                            <button
                              onClick={() => setEditingId(bar.id)}
                              className={`flex items-center gap-1 px-2 py-1 rounded text-sm font-mono font-bold border transition-all hover:border-[#56B7A5] ${
                                mult === 1.0
                                  ? "text-[#808181] border-[#E0E4E3] bg-[#F8FAF9]"
                                  : mult < 1.0
                                  ? "text-[#16A34A] border-[#BBF7D0] bg-[#F0FDF4]"
                                  : "text-[#EF4444] border-[#FECACA] bg-[#FEF2F2]"
                              }`}
                            >
                              {mult.toFixed(2)}x
                              <Pencil size={10} className="opacity-40" />
                            </button>
                          )}
                        </div>
                        {/* Quick presets */}
                        <div className="flex items-center justify-center gap-1 mt-1">
                          {[0.85, 0.95, 1.0, 1.05, 1.15].map((preset) => (
                            <button
                              key={preset}
                              onClick={() => setMultipliers((prev) => ({ ...prev, [bar.id]: preset }))}
                              className={`text-[9px] px-1.5 py-0.5 rounded transition-all ${
                                Math.abs(mult - preset) < 0.005
                                  ? "bg-[#030304] text-white"
                                  : "text-[#808181] hover:bg-[#F0F4F3]"
                              }`}
                            >
                              {preset < 1 ? `${preset}x` : preset === 1 ? "1x" : `${preset}x`}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <span className={`text-sm font-bold ${
                          bar.cost_per_tco2e < 0 ? "text-[#16A34A]"
                          : bar.cost_per_tco2e === 0 ? "text-[#808181]"
                          : "text-[#EF4444]"
                        }`}>
                          {bar.cost_per_tco2e === 0 ? "—" : `R$ ${bar.cost_per_tco2e > 0 ? "+" : ""}${bar.cost_per_tco2e.toLocaleString("pt-BR")}`}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Disclaimer */}
          <div className="flex items-start gap-2 px-1">
            <Info size={13} className="text-[#BDBDBC] mt-0.5 shrink-0" />
            <p className="text-[11px] text-[#BDBDBC]">
              Escopo A1-A3 (cradle-to-gate) · Alternativas identificadas via EPDs com GWP.
              O multiplicador de custo converte para R$/tCO₂e evitada com base no custo unitário do ABC.
              Ajuste com cotações reais de fornecedores para valores precisos.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
