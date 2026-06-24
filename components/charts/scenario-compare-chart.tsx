"use client";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { mockCompareData } from "@/lib/mock/data";

const CustomTooltip = ({ active, payload, label }: {
  active?: boolean;
  label?: string;
  payload?: Array<{ name: string; value: number; fill: string }>;
}) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-[#E0E4E3] rounded-lg shadow-lg p-3 text-xs space-y-1">
        <p className="font-semibold text-[#030304] mb-1">{label}</p>
        {payload.map((p) => (
          <div key={p.name} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: p.fill }} />
            <span className="text-[#808181]">{p.name}:</span>
            <span className="font-semibold">{p.value.toLocaleString("pt-BR")} tCO₂e</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export function ScenarioCompareChart() {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={mockCompareData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E0E4E3" vertical={false} />
        <XAxis
          dataKey="category"
          tick={{ fontSize: 11, fill: "#808181" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#808181" }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: "11px", color: "#808181" }}
        />
        <Bar dataKey="base" name="Base" fill="#56B7A5" radius={[3, 3, 0, 0]} maxBarSize={28} />
        <Bar dataKey="scenA" name="Cenário A" fill="#81C8B9" radius={[3, 3, 0, 0]} maxBarSize={28} />
        <Bar dataKey="scenB" name="Cenário B" fill="#A9D7CD" radius={[3, 3, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}
