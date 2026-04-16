import type { Metadata } from "next";
import { Newspaper } from "lucide-react";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export const metadata: Metadata = {
  title: "Notícias — FootStock",
};

type Sentiment = "BULLISH" | "BEARISH" | "NEUTRAL";

const SENTIMENT_MAP: Record<Sentiment, { variant: BadgeVariant; label: string }> = {
  BULLISH: { variant: "success", label: "Positivo" },
  BEARISH: { variant: "error", label: "Negativo" },
  NEUTRAL: { variant: "default", label: "Neutro" },
};

export default async function NoticiasPage() {
  const [newsList, assets] = await Promise.all([
    prisma.news.findMany({
      where: { isPublished: true },
      orderBy: { publishedAt: "desc" },
      take: 50,
    }),
    prisma.asset.findMany({
      select: { id: true, ticker: true },
    }),
  ]);

  const assetMap = new Map(assets.map((a) => [a.id, a.ticker]));

  return (
    <div data-testid="noticias-page" className="px-4 pt-4">
      <h1 className="text-lg font-bold text-[#EAECEF] mb-4 flex items-center gap-2">
        <Newspaper className="h-5 w-5 text-[#F0B90B]" />
        Feed de Noticias
      </h1>

      {newsList.length === 0 ? (
        <div className="text-center py-12">
          <Newspaper className="h-10 w-10 text-[#707A8A] mx-auto mb-3" />
          <p className="text-sm text-[#929AA5]">Nenhuma notícia publicada ainda.</p>
        </div>
      ) : (
        <div data-testid="noticias-list" className="flex flex-col gap-3">
          {newsList.map((news) => {
            const sentiment = SENTIMENT_MAP[news.sentiment as Sentiment] ?? SENTIMENT_MAP.NEUTRAL;
            const tickers = news.assetIds
              .map((id) => assetMap.get(id))
              .filter(Boolean);
            const timeAgo = news.publishedAt
              ? formatDistanceToNow(news.publishedAt, { addSuffix: true, locale: ptBR })
              : "";

            return (
              <div
                key={news.id}
                data-testid={`noticias-item-${news.id}`}
                className="bg-[#1E2329] rounded-lg border border-[rgba(240,185,11,.18)] p-4 transition-all hover:border-[rgba(240,185,11,.35)] hover:bg-[rgba(240,185,11,.04)] cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    {tickers.length > 0 && (
                      <span className="text-xs font-mono font-bold text-[#F0B90B]">
                        {tickers.join(", ")}
                      </span>
                    )}
                    <Badge variant={sentiment.variant} size="xs">
                      {sentiment.label}
                    </Badge>
                  </div>
                  {timeAgo && (
                    <span className="text-[10px] text-[#707A8A] shrink-0">{timeAgo}</span>
                  )}
                </div>
                <p className="text-sm font-medium text-[#EAECEF] leading-snug">{news.title}</p>
                {news.source && (
                  <p className="text-xs text-[#929AA5] mt-1">Fonte: {news.source}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
