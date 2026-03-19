import { cn } from "@/lib/utils";
import { AlertTriangle, Info, CheckCircle, XCircle } from "lucide-react";

interface AlertProps {
  children: React.ReactNode;
  variant?: "warning" | "info" | "success" | "danger";
  className?: string;
}

const alertConfig = {
  warning: {
    bg: "#FEF3C7",
    border: "#FCD34D",
    text: "#92400e",
    Icon: AlertTriangle,
  },
  info: {
    bg: "#DBEAFE",
    border: "#93C5FD",
    text: "#1e40af",
    Icon: Info,
  },
  success: {
    bg: "#E6F3EE",
    border: "#81C8B9",
    text: "#1d7a6b",
    Icon: CheckCircle,
  },
  danger: {
    bg: "#FEE2E2",
    border: "#FCA5A5",
    text: "#991B1B",
    Icon: XCircle,
  },
};

export function Alert({ children, variant = "info", className }: AlertProps) {
  const config = alertConfig[variant];
  const { Icon } = config;

  return (
    <div
      className={cn("flex items-start gap-3 px-4 py-3 rounded-lg border text-sm font-medium", className)}
      style={{
        backgroundColor: config.bg,
        borderColor: config.border,
        color: config.text,
      }}
    >
      <Icon size={16} className="flex-shrink-0 mt-0.5" />
      <div>{children}</div>
    </div>
  );
}
