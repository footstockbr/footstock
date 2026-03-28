import { cn } from "@/lib/utils";

interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

function Spinner({ size = "md", className }: SpinnerProps) {
  const sizeClasses = {
    sm: "h-4 w-4 border-2",
    md: "h-6 w-6 border-2",
    lg: "h-10 w-10 border-2",
  };

  return (
    <div
      role="status"
      aria-label="Carregando"
      className={cn(
        "rounded-full border-[#2a2010] border-t-[#c9a84c] animate-spin",
        sizeClasses[size],
        className
      )}
    />
  );
}

export { Spinner };
