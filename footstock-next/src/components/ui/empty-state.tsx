"use client";

import { cn } from "@/lib/utils";
import { Button } from "./button";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-12 px-6 text-center",
        className
      )}
    >
      {icon && (
        <div className="text-4xl text-[#4a3d2a] mb-1">{icon}</div>
      )}
      <p className="text-base font-medium text-[#f0ead6]">{title}</p>
      {description && (
        <p className="text-sm text-[#7a7060] max-w-xs">{description}</p>
      )}
      {action && (
        <Button
          variant="outline"
          size="md"
          onClick={action.onClick}
          className="mt-2"
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}

export { EmptyState };
