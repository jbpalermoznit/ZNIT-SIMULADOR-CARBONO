"use client";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

export interface ScopeDataPoint {
  name: string;
  value: number;
  color: string;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-[#E0E4E3] rounded-lg shadow-lg p-3 text-xs">
        <p className="font-semibold text-[#030304]">{payload[0].name}</p>
        <p className="text-[#56B7A5] font-bold">{payload[0].value.toFixed(1)}%</p>
      </div>
    );
  }
  return null;
};

export function ScopeDonut({ data }: { data?: ScopeDataPoint[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-xs text-[#808181]">
        Gere o Cenário Base para visualizar
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={80}
          paddingAngle={2}
          dataKey="value"
        >
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: "11px", color: "#808181" }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
