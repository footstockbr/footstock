"use client";

import { cn } from "@/lib/utils";
import { MarketSession, SESSION_COLORS, SESSION_LABELS } from "@/lib/constants/market";

interface SessionIndicatorProps {
  session?: MarketSession;
  showLabel?: boolean;
  className?: string;
}

function SessionIndicator({
  session = MarketSession.FECHADO,
  showLabel = false,
  className,
}: SessionIndicatorProps) {
  const color = SESSION_COLORS[session];
  const label = SESSION_LABELS[session];

  return (
    <div
      className={cn("flex items-center gap-1.5", className)}
      title={`Sessão: ${label}`}
      aria-label={`Sessão de mercado: ${label}`}
    >
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{
          backgroundColor: color,
          boxShadow: `0 0 6px ${color}`,
        }}
        aria-hidden="true"
      />
      {showLabel && (
        <span className="text-xs font-medium" style={{ color }}>
          {label}
        </span>
      )}
    </div>
  );
}

export { SessionIndicator };
