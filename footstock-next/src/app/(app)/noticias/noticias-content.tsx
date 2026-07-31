"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Newspaper } from "lucide-react";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { NewsFeedItem, NewsTeamLine } from "@/lib/types/news";
import type { AssetSentiment } from "@/types";

const SENTIMENT_MAP: Record<AssetSentiment, { variant: BadgeVariant; label: string }> = {
  BULLISH: { variant: "success", label: "Positivo" },
  BEARISH: { variant: "error", label: "Negativo" },
  NEUTRAL: { variant: "default", label: "Neutro" },
};

// M067 item 016 — uma linha de time do grupo ja resolvida para exibicao.
// `isUnresolved` cobre DB-20: a linha tem `ticker` mas nenhum asset resolvivel
// no `assetMap`, entao ela continua visivel (Zero Silencio) e ainda navega pelo
// proprio ticker.
// `navTicker` e `badgeKey` sao `string` (nunca nulos/vazios): os dois ramos
// construtores exigem ticker para produzir uma badge — sem ticker a linha vira
// `null` e e filtrada. Manter o tipo estreito evita ressuscitar o `disabled`,
// que quebraria o criterio 45 (badge tem de ser parada de foco).
interface ResolvedTeamBadge {
  team: NewsTeamLine;
  badgeKey: string;
  label: string;
  navTicker: string;
  isUnresolved: boolean;
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

  const [newsList, setNewsList] = useState<NewsFeedItem[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [assetMap, setAssetMap] = useState<Map<string, { ticker: string; displayName: string }>>(new Map());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // T-09: buscar notícias + assets ao montar e quando filtro mudar
  const loadNews = useCallback(async () => {
    setIsLoading(true);
    setHasError(false);
    try {
      const [newsRes, assetsRes] = await Promise.all([
        fetch(
          `/api/v1/news?${selectedTicker ? `ticker=${encodeURIComponent(selectedTicker)}` : ""}`
        ),
        fetch("/api/v1/assets?active=true"),
      ]);

      if (!newsRes.ok) {
        throw new Error(`Falha ao buscar noticias: HTTP ${newsRes.status}`);
      }

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
      setHasError(true);
      setNewsList([]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedTicker]);

  useEffect(() => {
    loadNews();
  }, [loadNews]);

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
      ) : hasError ? (
        <div data-testid="noticias-error" className="text-center py-12">
          <Newspaper className="h-10 w-10 text-[#F6465D] mx-auto mb-3" />
          <p className="text-sm text-[#929AA5] mb-3">
            Nao foi possivel carregar as noticias. Tente novamente.
          </p>
          <button
            type="button"
            data-testid="noticias-error-retry"
            onClick={() => loadNews()}
            className="px-4 py-2 rounded-lg border border-[rgba(240,185,11,.35)] text-sm text-[#F0B90B] hover:bg-[rgba(240,185,11,.08)] focus:outline-none focus:border-[#F0B90B]"
          >
            Tentar novamente
          </button>
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
            const groupId = news.groupId ?? news.id;

            // ST002 / D-C — resolve cada linha do grupo para uma badge propria.
            // A identidade vem sempre do payload (`team.id`, `team.assetIds`,
            // `team.ticker`), nunca da posicao no array (D-B) nem de parsing do
            // texto renderizado (DB-22).
            const teamBadges: ResolvedTeamBadge[] = (Array.isArray(news.teams) ? news.teams : [])
              .map((team): ResolvedTeamBadge | null => {
                const resolvedAsset = team.assetIds.length > 0 ? assetMap.get(team.assetIds[0]) : undefined;

                if (resolvedAsset) {
                  return {
                    team,
                    badgeKey: resolvedAsset.ticker,
                    label: resolvedAsset.displayName,
                    navTicker: resolvedAsset.ticker,
                    isUnresolved: false,
                  };
                }

                // DB-20 — tem ticker mas nenhum asset resolvido: a linha continua
                // visivel e marcada, em vez de sumir com `return null`.
                if (team.ticker) {
                  return {
                    team,
                    badgeKey: team.ticker,
                    label: team.ticker,
                    navTicker: team.ticker,
                    isUnresolved: true,
                  };
                }

                // Sem asset e sem ticker nao ha nada a exibir; nao e caso DB-20.
                return null;
              })
              .filter((entry): entry is ResolvedTeamBadge => entry !== null);

            return (
              <div
                key={news.id}
                data-testid={`noticias-item-${news.id}`}
                className="min-w-0 bg-[#1E2329] rounded-lg border border-[rgba(240,185,11,.18)] p-4 transition-all hover:border-[rgba(240,185,11,.35)] hover:bg-[rgba(240,185,11,.04)]"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    {teamBadges.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {teamBadges.map(({ team, badgeKey, label, navTicker, isUnresolved }) => {
                          const teamSentiment = SENTIMENT_MAP[team.sentiment] ?? SENTIMENT_MAP.NEUTRAL;
                          const testidBase = `noticias-item-${groupId}-badge-${badgeKey}`;

                          return (
                            // Sem `disabled` aqui de proposito: o criterio 45 exige que
                            // toda badge seja parada de foco propria, e elemento
                            // `disabled` nao recebe foco. Como `navTicker` e sempre
                            // string, tambem nao havia caso real de desabilitar.
                            <button
                              key={team.id}
                              type="button"
                              data-testid={testidBase}
                              aria-label={`${label}, ${teamSentiment.label}`}
                              onClick={(e) => {
                                // ST005 / D-F + DB-21: stopPropagation permanece como
                                // camada defensiva mesmo com os controles ja separados.
                                e.stopPropagation();
                                router.push(`?ticker=${encodeURIComponent(navTicker)}`);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.stopPropagation();
                                }
                              }}
                              className="inline-flex items-center gap-1 rounded-sm focus:outline-none focus:ring-1 focus:ring-[#F0B90B] cursor-pointer"
                            >
                              <span className="text-xs font-medium text-[#C0C4CE]">{label}</span>
                              {isUnresolved && (
                                <span
                                  data-testid={`${testidBase}-unresolved`}
                                  className="text-[10px] text-[#929AA5]"
                                  title="Time sem ativo identificado"
                                >
                                  (nao identificado)
                                </span>
                              )}
                              <Badge
                                variant={teamSentiment.variant}
                                size="xs"
                                data-testid={`${testidBase}-sentiment`}
                              >
                                {teamSentiment.label}
                              </Badge>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {teamBadges.length === 0 && (
                      <Badge variant={sentiment.variant} size="xs">
                        {sentiment.label}
                      </Badge>
                    )}
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
                  // ST004 / D-D — controle de expansao dedicado no rodape. O card
                  // deixou de ser `role="button"`, entao badge e expansao sao
                  // paradas de foco distintas e nao ha `nested-interactive`.
                  <button
                    type="button"
                    data-testid={`noticias-item-${groupId}-expand`}
                    aria-expanded={isExpanded}
                    onClick={() => setExpandedId(isExpanded ? null : news.id)}
                    className="text-[10px] text-[#707A8A] mt-2 hover:text-[#929AA5] focus:outline-none focus:ring-1 focus:ring-[#F0B90B] rounded-sm"
                  >
                    {isExpanded ? "Clique para recolher" : "Clique para ler a noticia"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
