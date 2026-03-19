import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: string | number;
  unit?: string;
  sub?: string;
  icon?: React.ReactNode;
  highlight?: boolean;
  className?: string;
}

export function KpiCard({
  label,
  value,
  unit,
  sub,
  icon,
  highlight,
  className,
}: KpiCardProps) {
  return (
    <div
      className={cn(
        "bg-white rounded-lg border border-[#E0E4E3] px-5 py-4",
        "shadow-[0_1px_3px_rgba(3,3,4,0.06)]",
        highlight && "border-t-2 border-t-[#56B7A5]",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-[#808181] uppercase tracking-wide mb-1">
            {label}
          </p>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-[#030304] leading-none">
              {value}
            </span>
            {unit && (
              <span className="text-sm font-medium text-[#808181]">{unit}</span>
            )}
          </div>
          {sub && (
            <p className="text-xs text-[#808181] mt-1">{sub}</p>
          )}
        </div>
        {icon && (
          <div className="text-[#56B7A5] opacity-70 flex-shrink-0">{icon}</div>
        )}
      </div>
    </div>
  );
}
