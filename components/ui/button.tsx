"use client";
import { cn } from "@/lib/utils";
import { type ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "outline";
  size?: "sm" | "md" | "lg";
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded font-semibold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";

  const variants = {
    primary:
      "bg-[#56B7A5] text-white hover:bg-[#3EA08E] active:bg-[#2E8577]",
    secondary:
      "bg-[#E6F3EE] text-[#1d7a6b] hover:bg-[#C8E6DE] active:bg-[#A9D7CD]",
    ghost:
      "bg-transparent text-[#404040] hover:bg-[rgba(86,183,165,0.08)] active:bg-[rgba(86,183,165,0.12)]",
    danger:
      "bg-[#DC2626] text-white hover:bg-[#B91C1C] active:bg-[#991B1B]",
    outline:
      "bg-transparent border border-[#BDBDBC] text-[#404040] hover:border-[#56B7A5] hover:text-[#56B7A5]",
  };

  const sizes = {
    sm: "h-7 px-3 text-xs",
    md: "h-9 px-4 text-sm",
    lg: "h-11 px-6 text-base",
  };

  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    >
      {children}
    </button>
  );
}
