"use client";
import { cn } from "@/lib/utils";

interface BadgeProps {
  children: React.ReactNode;
  color?: string;
  bg?: string;
  className?: string;
  size?: "sm" | "md";
}

export function Badge({ children, color, bg, className, size = "md" }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded font-semibold whitespace-nowrap",
        size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs",
        className
      )}
      style={{
        color: color ?? "#404040",
        backgroundColor: bg ?? "#F3F4F6",
      }}
    >
      {children}
    </span>
  );
}
