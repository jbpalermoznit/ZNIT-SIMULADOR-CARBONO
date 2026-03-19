import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  brand?: boolean;
  highlight?: boolean;
}

export function Card({ children, className, brand, highlight }: CardProps) {
  return (
    <div
      className={cn(
        "bg-white rounded-lg border",
        brand
          ? "border-t-2 border-t-[#56B7A5] border-x-[#E0E4E3] border-b-[#E0E4E3]"
          : "border-[#E0E4E3]",
        highlight && "bg-[#E6F3EE]",
        "shadow-[0_1px_3px_rgba(3,3,4,0.06)]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("px-5 pt-5 pb-3", className)}>{children}</div>
  );
}

export function CardBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("px-5 pb-5", className)}>{children}</div>;
}
