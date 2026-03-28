"use client";

import Link from "next/link";
import { WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sparkline } from "@/components/ui/sparkline";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ROUTES } from "@/lib/constants/routes";
import { formatFS, formatPercent } from "@/lib/utils";

export interface AssetData {
  ticker: string;
  name: string;
  price: number;
  change24h: number;
  sentiment: "MUITO_POSITIVO" | "POSITIVO" | "NEUTRO" | "NEGATIVO" | "MUITO_NEGATIVO";
  sparkData?: number[];
  ofi?: number;
  halted?: boolean;
  offline?: boolean;
  division?: "A" | "B";
  clubColor?: string;
}

const SENTIMENT_LABELS = {
  MUITO_POSITIVO: "Muito Alta",
  POSITIVO: "Alta",
  NEUTRO: "Neutro",
  NEGATIVO: "Baixa",
  MUITO_NEGATIVO: "Muito Baixa",
};

const SENTIMENT_VARIANTS = {
  MUITO_POSITIVO: "success-strong",
  POSITIVO: "success",
  NEUTRO: "default",
  NEGATIVO: "error",
  MUITO_NEGATIVO: "error",
} as const;

interface AssetCardProps {
  asset: AssetData;
  isFavorite?: boolean;
}

function AssetCard({ asset, isFavorite }: AssetCardProps) {
  if (asset.halted) {
    return (
      <div
        data-testid="asset-card"
        className="relative bg-[#141210] rounded-lg border border-red-900/50 p-3 opacity-75"
      >
        <span
          data-testid="asset-card-halted-badge"
          className="absolute top-2 right-2 text-[10px] font-bold bg-red-900/80 text-red-300 px-1.5 py-0.5 rounded"
        >
          SUSPENSO
        </span>
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-full bg-[#2a2010] flex items-center justify-center text-xs font-black text-[#c9a84c] shrink-0">
            {asset.ticker.slice(0, 3)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-mono font-bold text-[#f0ead6]">{asset.ticker}</span>
            </div>
            <p className="text-xs text-[#7a7060] truncate">{asset.name}</p>
          </div>
          <div className="text-right">
            <p
              data-testid="asset-card-price"
              className="text-sm font-mono font-bold text-[#f0ead6]"
            >
              {formatFS(asset.price)}
            </p>
            <p data-testid="asset-card-change" className="text-xs text-[#94a3b8]">
              {formatPercent(asset.change24h)}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Link
      href={ROUTES.ATIVO(asset.ticker)}
      data-testid="asset-card"
      className={cn(
        "relative block bg-[#141210] rounded-lg border p-3 transition-all duration-150 hover:border-[rgba(201,168,76,.35)] hover:bg-[rgba(201,168,76,.04)] active:scale-[0.99]",
        isFavorite
          ? "border-[rgba(201,168,76,.3)]"
          : "border-[rgba(201,168,76,.18)]"
      )}
    >
      {asset.offline && (
        <WifiOff
          data-testid="asset-card-offline-icon"
          className="absolute bottom-2 right-2 h-4 w-4 text-[#4a3d2a]"
          aria-hidden
        />
      )}

      <div className="flex items-center gap-2.5">
        {/* Club avatar */}
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0 border border-[rgba(201,168,76,.12)]"
          style={{
            background: asset.clubColor
              ? `linear-gradient(145deg, ${asset.clubColor}, ${asset.clubColor}88)`
              : "linear-gradient(145deg, #c9a84c, #8a6820)",
          }}
        >
          {asset.ticker.slice(0, 3)}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-sm font-mono font-bold text-[#f0ead6]">{asset.ticker}</span>
            <Badge
              data-testid="asset-card-sentiment"
              variant={SENTIMENT_VARIANTS[asset.sentiment]}
              size="xs"
            >
              {SENTIMENT_LABELS[asset.sentiment]}
            </Badge>
          </div>
          <p className="text-xs text-[#7a7060] truncate">{asset.name}</p>
        </div>

        {/* Price + spark */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          <p
            data-testid="asset-card-price"
            className="text-sm font-mono font-bold text-[#f0ead6]"
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
                  ? "text-[#22c55e]"
                  : asset.change24h < 0
                  ? "text-[#ef4444]"
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
      className="bg-[#141210] rounded-lg border border-[rgba(201,168,76,.1)] p-3"
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
