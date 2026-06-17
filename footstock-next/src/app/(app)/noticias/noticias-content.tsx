"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Newspaper } from "lucide-react";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

type Sentiment = "BULLISH" | "BEARISH" | "NEUTRAL";

const SENTIMENT_MAP: Record<Sentiment, { variant: BadgeVariant; label: string }> = {
  BULLISH: { variant: "success", label: "Positivo" },
  BEARISH: { variant: "error", label: "Negativo" },
  NEUTRAL: { variant: "default", label: "Neutro" },
};

interface News {
  id: string;
  title: string;
  content: string | null;
  assetIds: string[];
  sentiment: Sentiment;
  source: string | null;
  publishedAt: string | null;
}

interface Asset {
  id: string;
  ticker: string;
  displayName: string;
}

export function NoticiasContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedTicker = searchParams.get("ticker");

  const [newsList, setNewsList] = useState<News[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [assetMap, setAssetMap] = useState<Map<string, { ticker: string; displayName: string }>>(new Map());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // T-09: buscar notícias + assets ao montar e quando filtro mudar
  useEffect(() => {
    (async () => {
      setIsLoading(true);
      try {
        const [newsRes, assetsRes] = await Promise.all([
          fetch(
            `/api/v1/news?${selectedTicker ? `ticker=${encodeURIComponent(selectedTicker)}` : ""}`
          ),
          fetch("/api/v1/assets?active=true"),
        ]);

        const newsData = await newsRes.json();

        // T-09: buscar assets ativos para o dropdown
        let assetsData = { data: [] };
        try {
          assetsData = await assetsRes.json();
        } catch {
          // Fallback: extrair assets das notícias
          console.warn("Erro ao buscar assets, usando fallback das notícias");
        }

        setNewsList(newsData.data || []);
        const assetsList = (assetsData.data || []).filter((a: Asset) => a.ticker && a.displayName);
        setAssets(assetsList);
        setAssetMap(
          new Map(assetsList.map((a: Asset) => [a.id, { ticker: a.ticker, displayName: a.displayName }]))
        );
      } catch (err) {
        console.error("Erro ao buscar notícias:", err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [selectedTicker]);

  return (
    <div data-testid="noticias-page" className="px-4 pt-4 max-w-5xl mx-auto">
      <h1 className="text-lg font-bold text-[#EAECEF] mb-4 flex items-center gap-2">
        <Newspaper className="h-5 w-5 text-[#F0B90B]" />
        Feed de Noticias
      </h1>

      {/* T-09: Filtro por clube */}
      <div className="mb-4 flex gap-2 items-center">
        <label htmlFor="noticias-filter-clube" className="text-xs font-medium text-[#929AA5]">
          Filtrar por time:
        </label>
        <select
          id="noticias-filter-clube"
          data-testid="noticias-filter-clube"
          value={selectedTicker || ""}
          onChange={(e) => {
            if (e.target.value) {
              router.push(`?ticker=${e.target.value}`);
            } else {
              router.push("");
            }
          }}
          className="h-9 px-3 rounded-lg border border-[rgba(240,185,11,.18)] bg-[#1E2329] text-sm text-[#EAECEF] focus:outline-none focus:border-[#F0B90B]"
        >
          <option value="">Todos os times</option>
          {assets.map((a) => (
            <option
              key={a.id}
              value={a.ticker}
              data-testid={`noticias-filter-clube-option-${a.ticker}`}
            >
              {a.displayName} ({a.ticker})
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-5 h-5 rounded-full border-2 border-[#F0B90B] border-t-transparent animate-spin" />
        </div>
      ) : newsList.length === 0 ? (
        <div className="text-center py-12">
          <Newspaper className="h-10 w-10 text-[#707A8A] mx-auto mb-3" />
          <p className="text-sm text-[#929AA5]">
            {selectedTicker ? "Nenhuma notícia encontrada para este time." : "Nenhuma notícia publicada ainda."}
          </p>
        </div>
      ) : (
        <div data-testid="noticias-list" className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 items-start gap-3">
          {newsList.map((news) => {
            const sentiment = SENTIMENT_MAP[news.sentiment] ?? SENTIMENT_MAP.NEUTRAL;
            const timeAgo = news.publishedAt
              ? formatDistanceToNow(new Date(news.publishedAt), { addSuffix: true, locale: ptBR })
              : "";
            const hasContent = !!news.content && news.content.trim().length > 0;
            const isExpanded = expandedId === news.id;

            return (
              <div
                key={news.id}
                data-testid={`noticias-item-${news.id}`}
                onClick={hasContent ? () => setExpandedId(isExpanded ? null : news.id) : undefined}
                role={hasContent ? "button" : undefined}
                tabIndex={hasContent ? 0 : undefined}
                onKeyDown={
                  hasContent
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setExpandedId(isExpanded ? null : news.id);
                        }
                      }
                    : undefined
                }
                aria-expanded={hasContent ? isExpanded : undefined}
                className={`min-w-0 bg-[#1E2329] rounded-lg border border-[rgba(240,185,11,.18)] p-4 transition-all hover:border-[rgba(240,185,11,.35)] hover:bg-[rgba(240,185,11,.04)] ${hasContent ? "cursor-pointer" : "cursor-default"}`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    {news.assetIds.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {news.assetIds.map((id) => {
                          const asset = assetMap.get(id);
                          if (!asset) return null;
                          return (
                            <span key={id} className="text-xs font-medium text-[#C0C4CE]">
                              {asset.displayName}
                              <span className="text-[#929AA5] ml-1">({asset.ticker})</span>
                            </span>
                          );
                        })}
                      </div>
                    )}
                    <Badge variant={sentiment.variant} size="xs">
                      {sentiment.label}
                    </Badge>
                  </div>
                  {timeAgo && <span className="text-[10px] text-[#707A8A] shrink-0">{timeAgo}</span>}
                </div>
                <p className="text-sm font-medium text-[#EAECEF] leading-snug break-words">{news.title}</p>
                {isExpanded && hasContent && (
                  <p className="text-sm text-[#C0C4CE] mt-3 leading-relaxed whitespace-pre-wrap break-words">
                    {news.content}
                  </p>
                )}
                {news.source && <p className="text-xs text-[#929AA5] mt-1 break-words">Fonte: {news.source}</p>}
                {hasContent && (
                  <p className="text-[10px] text-[#707A8A] mt-2">
                    {isExpanded ? "Clique para recolher" : "Clique para ler a noticia"}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
