import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChevronLeft, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { ROUTES } from "@/lib/constants/routes";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { AtivoClient } from "./ativo-client";
import { prisma } from "@/lib/prisma";
import { SponsorBanner } from "@/components/shared/sponsor-banner";
import { ClubCrest } from "@/components/market/ClubCrest";

interface Props {
  params: Promise<{ ticker: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ticker } = await params;
  return { title: `${ticker} — FootStock` };
}

export default async function AtivoPage({ params }: Props) {
  const { ticker } = await params;

  const asset = await prisma.asset.findUnique({ where: { ticker } });

  if (!asset) notFound();

  const currentPrice = asset.currentPrice.toNumber();
  const openPrice = asset.openPrice.toNumber();
  const changePercent = openPrice > 0
    ? ((currentPrice - openPrice) / openPrice) * 100
    : 0;
  const changeSign = changePercent >= 0 ? "+" : "";
  const changeColor = changePercent >= 0 ? "text-[#2EBD85]" : "text-[#F6465D]";
  const changeArrow = changePercent >= 0 ? "\u25B2" : "\u25BC";

  const sentiment = asset.sentiment as "BULLISH" | "BEARISH" | "NEUTRAL";
  const sentimentBadgeVariant = sentiment === "BULLISH"
    ? "success"
    : sentiment === "BEARISH"
      ? "error"
      : ("default" as const);

  const volume = Number(asset.volume);

  // 24h high/low from PriceHistory
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentHistory = await prisma.priceHistory.findMany({
    where: {
      assetId: asset.id,
      timestamp: { gte: twentyFourHoursAgo },
    },
    orderBy: { timestamp: "desc" },
    select: { high: true, low: true },
  });

  let high24h = currentPrice;
  let low24h = currentPrice;

  if (recentHistory.length > 0) {
    high24h = Math.max(...recentHistory.map((h) => h.high.toNumber()));
    low24h = Math.min(...recentHistory.map((h) => h.low.toNumber()));
  }

  const divisionLabel = asset.division === "SERIE_A" ? "Série A" : "Série B";

  // Serialize asset data for the client component
  const serializedAsset = {
    displayName: asset.displayName,
    division: asset.division as string,
    currentSupply: Number(asset.currentSupply),
    totalShares: Number(asset.totalShares),
    sentiment: asset.sentiment,
    isHalted: asset.isHalted,
  };

  return (
    <div className="flex flex-col">
      {/* Header com back + ação */}
      <div className="sticky top-14 z-[100] flex items-center justify-between px-4 py-3 bg-[#181A20] border-b border-[rgba(240,185,11,.1)]">
        <Link
          href={ROUTES.MERCADO}
          className="flex items-center gap-1 text-sm text-[#929AA5] hover:text-[#EAECEF] transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Mercado
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono font-bold text-[#EAECEF]">{ticker}</span>
          <Badge variant={sentimentBadgeVariant} size="sm">{sentiment}</Badge>
        </div>
        <Link
          href="#operar"
          className="flex items-center gap-1.5 bg-[#F0B90B] text-[#0B0E11] text-sm font-semibold px-3 py-1.5 rounded-md hover:bg-[#FCD535] transition-colors"
        >
          <ShoppingCart className="h-4 w-4" />
          Operar
        </Link>
      </div>

      {/* Price hero */}
      <div className="px-4 pt-4 pb-3 border-b border-[rgba(240,185,11,.08)]">
        <div className="flex items-center gap-3 mb-3">
          <ClubCrest
            ticker={ticker}
            colorPrimary={asset.colorPrimary}
            colorSecondary={asset.colorSecondary}
            size={48}
          />
          <div>
            <h1 className="text-lg font-bold text-[#EAECEF]">{asset.displayName}</h1>
            <p className="text-sm text-[#929AA5]">{divisionLabel}</p>
          </div>
        </div>
        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-extrabold font-mono text-[#EAECEF]">
            FS$ {currentPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className={`text-sm font-medium ${changeColor}`}>
            {changeArrow} {changeSign}{changePercent.toFixed(2)}%
          </span>
        </div>
        <p className="text-xs text-[#707A8A] mt-0.5">Última atualização: {asset.updatedAt.toLocaleString("pt-BR")}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 px-4 py-3 border-b border-[rgba(240,185,11,.08)]">
        <StatCard label="Volume 24h" value={volume.toLocaleString("pt-BR")} />
        <StatCard
          label="Variação"
          value={`${changeSign}${changePercent.toFixed(1)}%`}
          subValue={changePercent >= 0 ? "Tendência de alta" : "Tendência de baixa"}
          subValueColor={changePercent >= 0 ? "positive" : "negative"}
        />
        <StatCard label="Máx. 24h" value={`FS$ ${high24h.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
        <StatCard label="Mín. 24h" value={`FS$ ${low24h.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
      </div>

      {/* Interactive tabs (client component) */}
      <AtivoClient ticker={ticker} asset={serializedAsset} />

      {/* Banner DETAIL_BOT: 360×80 — rodapé da página de detalhe do ativo */}
      <div className="flex justify-center px-4 py-4">
        <SponsorBanner position="detail_bot" />
      </div>
    </div>
  );
}
