// T-022: AssetCard agora suporta badge de cotação atrasada para JOGADOR/CRAQUE.
"use client";

import Link from "next/link";
import { WifiOff, Star } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Sparkline } from "@/components/ui/sparkline";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ROUTES } from "@/lib/constants/routes";
import { formatFS, formatPercent } from "@/lib/utils";
import { PriceBadge } from "@/components/market/PriceBadge";
import { ClubCrest } from "@/components/market/ClubCrest";

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
  clubColorSecondary?: string;
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

/** Selo de destaque do clube favorito (time do coracao) — estrela amarela + label. */
function FavoriteBadge() {
  return (
    <span
      data-testid="asset-card-favorite-badge"
      className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[#F0B90B] bg-[rgba(240,185,11,.14)] border border-[rgba(240,185,11,.4)] px-2 py-0.5 rounded-full"
    >
      <Star size={11} className="fill-[#F0B90B] text-[#F0B90B]" aria-hidden="true" />
      Time do coração
    </span>
  );
}

// Estilo do card destacado para o clube favorito (borda+fundo dourados + anel).
const FAVORITE_CARD_CLASSES =
  "border-[rgba(240,185,11,.55)] bg-[rgba(240,185,11,.06)] shadow-[0_0_0_1px_rgba(240,185,11,.25)]";

function AssetCard({ asset, isFavorite }: AssetCardProps) {
  const countdown = useHaltCountdown(asset.haltedUntil);

  if (asset.halted) {
    return (
      <Link
        href={ROUTES.MERCADO_DETALHE(asset.ticker)}
        data-testid="asset-card"
        className={cn(
          "block bg-[#1E2329] rounded-lg border p-3 hover:border-[rgba(240,185,11,.35)] transition-colors",
          isFavorite ? FAVORITE_CARD_CLASSES : "border-[rgba(240,185,11,.2)]"
        )}
      >
        {isFavorite && (
          <div className="mb-2">
            <FavoriteBadge />
          </div>
        )}
        <div className="flex items-center gap-2.5">
          <ClubCrest
            ticker={asset.ticker}
            colorPrimary={asset.clubColor}
            colorSecondary={asset.clubColorSecondary}
            className={isFavorite ? "ring-2 ring-[#F0B90B] ring-offset-1 ring-offset-[#1E2329]" : undefined}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-mono font-bold text-[#EAECEF]">{asset.ticker}</span>
              {isFavorite && (
                <Star
                  data-testid={`asset-card-favorite-star-${asset.ticker}`}
                  size={16}
                  className="text-[#F0B90B] fill-[#F0B90B]"
                  aria-label="Clube favorito"
                />
              )}
              <span
                data-testid="asset-card-halted-badge"
                aria-label="Negociação pausada temporariamente por circuit breaker"
                title="Negociação pausada temporariamente por circuit breaker"
                className="text-[9px] font-semibold tracking-widest uppercase bg-[rgba(240,185,11,.12)] text-[#F0B90B] border border-[rgba(240,185,11,.3)] px-1.5 py-0.5 rounded-sm"
              >
                Pausado
              </span>
              {countdown && (
                <span
                  data-testid="asset-card-halt-countdown"
                  className="text-[9px] font-mono text-[#929AA5]"
                >
                  {countdown}
                </span>
              )}
            </div>
            <p className="text-xs text-[#929AA5] leading-snug line-clamp-2 break-words">{asset.displayName}</p>
          </div>
          <div className="text-right shrink-0">
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
        isFavorite ? FAVORITE_CARD_CLASSES : "border-[rgba(240,185,11,.18)]"
      )}
    >
      {isFavorite && (
        <div className="mb-2">
          <FavoriteBadge />
        </div>
      )}
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
        {/* Club crest — cores reais do time (primaria + secundaria) */}
        <ClubCrest
          ticker={asset.ticker}
          colorPrimary={asset.clubColor}
          colorSecondary={asset.clubColorSecondary}
          className={isFavorite ? "ring-2 ring-[#F0B90B] ring-offset-1 ring-offset-[#1E2329]" : undefined}
        />

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-sm font-mono font-bold text-[#EAECEF]">{asset.ticker}</span>
            {isFavorite && (
              <Star
                data-testid={`asset-card-favorite-star-${asset.ticker}`}
                size={16}
                className="text-[#F0B90B] fill-[#F0B90B]"
                aria-label="Clube favorito"
              />
            )}
            <Badge
              data-testid="asset-card-sentiment"
              variant={SENTIMENT_VARIANTS[asset.sentiment]}
              size="xs"
            >
              {SENTIMENT_LABELS[asset.sentiment]}
            </Badge>
          </div>
          <p className="text-xs text-[#929AA5] leading-snug line-clamp-2 break-words">{asset.displayName}</p>
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
