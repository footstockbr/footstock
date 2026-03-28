import { cn } from "@/lib/utils";
import { Skeleton } from "./skeleton";

interface StatCardProps {
  label: string;
  value: string;
  subValue?: string;
  subValueColor?: "positive" | "negative" | "neutral";
  icon?: React.ReactNode;
  isLoading?: boolean;
  className?: string;
}

function StatCard({
  label,
  value,
  subValue,
  subValueColor = "neutral",
  icon,
  isLoading,
  className,
}: StatCardProps) {
  const subColors = {
    positive: "text-[#22c55e]",
    negative: "text-[#ef4444]",
    neutral: "text-[#7a7060]",
  };

  if (isLoading) {
    return (
      <div className={cn("bg-[#141210] rounded-lg border border-[rgba(201,168,76,.18)] p-4", className)}>
        <Skeleton className="h-3 w-24 mb-3" />
        <Skeleton className="h-5 w-32 mb-2" />
        <Skeleton className="h-3 w-16" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "bg-[#141210] rounded-lg border border-[rgba(201,168,76,.18)] p-4 shadow-sm",
        className
      )}
    >
      <div className="flex items-start justify-between mb-1">
        <span className="text-xs uppercase tracking-widest text-[#7a7060] font-medium">
          {label}
        </span>
        {icon && <span className="text-[#7a7060]">{icon}</span>}
      </div>
      <p className="text-xl font-extrabold font-mono text-[#f0ead6] mt-1">
        {value}
      </p>
      {subValue && (
        <p className={cn("text-xs font-medium mt-0.5", subColors[subValueColor])}>
          {subValue}
        </p>
      )}
    </div>
  );
}

export { StatCard };
