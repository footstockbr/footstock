import { cn } from "@/lib/utils";
import { formatFS, formatPercent } from "@/lib/utils";

interface PriceDisplayProps {
  price: number;
  change?: number;
  showFS?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

function PriceDisplay({
  price,
  change,
  showFS = true,
  size = "md",
  className,
}: PriceDisplayProps) {
  const isPositive = change !== undefined && change > 0;
  const isNegative = change !== undefined && change < 0;

  const sizeClasses = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-lg",
    xl: "text-xl",
  };

  return (
    <div className={cn("flex items-baseline gap-2 font-mono", className)}>
      <span className={cn("font-bold text-[#f0ead6]", sizeClasses[size])}>
        {showFS ? formatFS(price) : price.toFixed(2)}
      </span>
      {change !== undefined && (
        <span
          className={cn(
            "text-sm font-medium",
            isPositive && "text-[#22c55e]",
            isNegative && "text-[#ef4444]",
            !isPositive && !isNegative && "text-[#94a3b8]"
          )}
        >
          {isPositive && "▲"} {isNegative && "▼"}{" "}
          {formatPercent(change)}
        </span>
      )}
    </div>
  );
}

export { PriceDisplay };
