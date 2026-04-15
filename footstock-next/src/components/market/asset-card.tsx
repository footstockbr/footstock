// T-022: AssetCard agora suporta badge de cotação atrasada para JOGADOR/CRAQUE.
"use client";

import Link from "next/link";
import { WifiOff } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Sparkline } from "@/components/ui/sparkline";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ROUTES } from "@/lib/constants/routes";
import { formatFS, formatPercent } from "@/lib/utils";
import { PriceBadge } from "@/components/market/PriceBadge";

export interface AssetData {
  ticker: string;
  displayName: string;
  price: number;
  change24h: number;
  sentiment: "BULLISH" | "NEUTRAL" | "BEARISH";
  sparkData?: number[];
  ofi?: number;
  halted?: boolean;
  haltedUntil?: number | null;  // Unix ms — quando o halt expira
  offline?: boolean;
  division?: "SERIE_A" | "SERIE_B";
  clubColor?: string;
  /** Indica se o preço exibido tem delay server-side por plano */
  isDelayed?: boolean;
  /** Atraso em minutos (0 = tempo real) */
  delayMinutes?: number;
}

/** Countdown em segundos até resumeAt — atualiza a cada segundo. */
function useHaltCountdown(haltedUntil?: number | null): string {
  const [seconds, setSeconds] = useState<number>(() => {
    if (!haltedUntil) return 0;
    return Math.max(0, Math.ceil((haltedUntil - Date.now()) / 1000));
  });

  useEffect(() => {
    if (!haltedUntil) return;
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((haltedUntil - Date.now()) / 1000));
      setSeconds(remaining);
      if (remaining <= 0) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [haltedUntil]);

  if (!haltedUntil || seconds <= 0) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

const SENTIMENT_LABELS = {
  BULLISH: "Alta",
  NEUTRAL: "Neutro",
  BEARISH: "Baixa",
};

const SENTIMENT_VARIANTS = {
  BULLISH: "success",
  NEUTRAL: "default",
  BEARISH: "error",
} as const;

interface AssetCardProps {
  asset: AssetData;
  isFavorite?: boolean;
}

function AssetCard({ asset, isFavorite }: AssetCardProps) {
  const countdown = useHaltCountdown(asset.haltedUntil);

  if (asset.halted) {
    return (
      <Link
        href={ROUTES.MERCADO_DETALHE(asset.ticker)}
        data-testid="asset-card"
        className="relative block bg-[#1E2329] rounded-lg border border-red-900/50 p-3 opacity-75 hover:opacity-85 transition-opacity"
      >
        <div className="absolute top-2 right-2 flex flex-col items-end gap-0.5">
          <span
            data-testid="asset-card-halted-badge"
            className="text-[10px] font-bold bg-red-900/80 text-red-300 px-1.5 py-0.5 rounded"
          >
            SUSPENSO
          </span>
          {countdown && (
            <span
              data-testid="asset-card-halt-countdown"
              className="text-[9px] font-mono text-red-400/80"
            >
              {countdown}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-full bg-[#2B3139] flex items-center justify-center text-xs font-black text-[#F0B90B] shrink-0">
            {asset.ticker.slice(0, 3)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-mono font-bold text-[#EAECEF]">{asset.ticker}</span>
            </div>
            <p className="text-xs text-[#929AA5] truncate">{asset.displayName}</p>
          </div>
          <div className="text-right">
            <p
              data-testid="asset-card-price"
              className="text-sm font-mono font-bold text-[#EAECEF]"
            >
              {formatFS(asset.price)}
            </p>
            <p data-testid="asset-card-change" className="text-xs text-[#94a3b8]">
              {formatPercent(asset.change24h)}
            </p>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={ROUTES.MERCADO_DETALHE(asset.ticker)}
      data-testid="asset-card"
      className={cn(
        "relative block bg-[#1E2329] rounded-lg border p-3 transition-all duration-150 hover:border-[rgba(240,185,11,.35)] hover:bg-[rgba(240,185,11,.04)] active:scale-[0.99]",
        isFavorite
          ? "border-[rgba(240,185,11,.3)]"
          : "border-[rgba(240,185,11,.18)]"
      )}
    >
      {asset.offline && (
        <WifiOff
          data-testid="asset-card-offline-icon"
          className="absolute bottom-2 right-2 h-4 w-4 text-[#707A8A]"
          aria-hidden
        />
      )}

      {/* Badge de cotação atrasada — T-022 */}
      {asset.isDelayed && (
        <PriceBadge
          isDelayed={asset.isDelayed}
          delayMinutes={asset.delayMinutes ?? 0}
          className="absolute top-2 right-2 z-10"
          size="sm"
        />
      )}

      <div className="flex items-center gap-2.5">
        {/* Club avatar */}
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0 border border-[rgba(240,185,11,.12)]"
          style={{
            background: asset.clubColor
              ? `linear-gradient(145deg, ${asset.clubColor}, ${asset.clubColor}88)`
              : "linear-gradient(145deg, #F0B90B, #8a6820)",
          }}
        >
          {asset.ticker.slice(0, 3)}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-sm font-mono font-bold text-[#EAECEF]">{asset.ticker}</span>
            <Badge
              data-testid="asset-card-sentiment"
              variant={SENTIMENT_VARIANTS[asset.sentiment]}
              size="xs"
            >
              {SENTIMENT_LABELS[asset.sentiment]}
            </Badge>
          </div>
          <p className="text-xs text-[#929AA5] truncate">{asset.displayName}</p>
        </div>

        {/* Price + spark */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          <p
            data-testid="asset-card-price"
            className="text-sm font-mono font-bold text-[#EAECEF]"
          >
            {formatFS(asset.price)}
          </p>
          <div className="flex items-center gap-2">
            {asset.sparkData && (
              <Sparkline data={asset.sparkData} width={60} height={20} />
            )}
            <p
              data-testid="asset-card-change"
              className={cn(
                "text-xs font-medium",
                asset.change24h > 0
                  ? "text-[#2EBD85]"
                  : asset.change24h < 0
                  ? "text-[#F6465D]"
                  : "text-[#94a3b8]"
              )}
            >
              {asset.change24h > 0 ? "▲" : asset.change24h < 0 ? "▼" : ""}{" "}
              {formatPercent(asset.change24h)}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}

function AssetCardSkeleton() {
  return (
    <div
      data-testid="asset-card-skeleton"
      className="bg-[#1E2329] rounded-lg border border-[rgba(240,185,11,.1)] p-3"
      aria-hidden="true"
    >
      <div className="flex items-center gap-2.5">
        <Skeleton className="w-10 h-10 rounded-full shrink-0" />
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-28" />
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="w-16 h-5" />
        </div>
      </div>
    </div>
  );
}

export { AssetCard, AssetCardSkeleton };
