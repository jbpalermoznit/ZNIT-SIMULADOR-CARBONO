"use client";
import {
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Line,
  ComposedChart,
} from "recharts";

export interface ParetoDataPoint {
  name: string;
  tco2e: number;
  pct: number;
  cumPct: number;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-[#E0E4E3] rounded-lg shadow-lg p-3 text-xs">
        <p className="font-semibold text-[#030304] mb-1">{label}</p>
        {payload[0]?.value > 0 && (
          <p className="text-[#56B7A5]">
            <span className="text-[#808181]">tCO₂e: </span>
            <span className="font-semibold">{payload[0].value.toLocaleString("pt-BR")}</span>
          </p>
        )}
        {payload[1]?.value && (
          <p className="text-[#404040]">
            <span className="text-[#808181]">Acumulado: </span>
            <span className="font-semibold">{payload[1].value.toFixed(1)}%</span>
          </p>
        )}
      </div>
    );
  }
  return null;
};

export function ParetoChart({ data }: { data?: ParetoDataPoint[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[260px] text-xs text-[#808181]">
        Gere o Cenário Base para visualizar o Pareto
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ top: 4, right: 48, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E0E4E3" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 10, fill: "#808181" }}
          tickLine={false}
          axisLine={false}
          interval={0}
          angle={-20}
          textAnchor="end"
          height={50}
        />
        <YAxis
          yAxisId="left"
          tick={{ fontSize: 11, fill: "#808181" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => v > 0 ? `${v}` : ""}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={{ fontSize: 11, fill: "#808181" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${v}%`}
          domain={[0, 100]}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar
          yAxisId="left"
          dataKey="tco2e"
          fill="#56B7A5"
          radius={[3, 3, 0, 0]}
          maxBarSize={48}
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="cumPct"
          stroke="#A9D7CD"
          strokeWidth={2}
          dot={{ r: 3, fill: "#56B7A5", strokeWidth: 0 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
