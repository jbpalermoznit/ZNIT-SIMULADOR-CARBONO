import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTCO2(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k tCO₂e`;
  if (value >= 100) return `${value.toFixed(0)} tCO₂e`;
  return `${value.toFixed(1)} tCO₂e`;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(value: number, decimals = 0): string {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(value);
}

export function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}
