"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AssetCard, AssetCardSkeleton, type AssetData } from "@/components/market/asset-card";
import { EmptyState } from "@/components/ui/empty-state";
import { useAllMarketTicks } from "@/hooks/useAllMarketTicks";
import { useBalance } from "@/hooks/useBalance";
import { useAnalytics } from "@/hooks/useAnalytics";
import { classifyTrend, type TrendDirection } from "@/lib/market/trend";

type Division = "SERIE_A" | "SERIE_B";
type TrendFilter = "positive" | "stable" | "negative";

export function MarketPageClient() {
  const [baseAssets, setBaseAssets] = useState<AssetData[]>([]);
  const [search, setSearch] = useState("");
  const [divisions, setDivisions] = useState<Set<Division>>(new Set());
  const [trends, setTrends] = useState<Set<TrendFilter>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [favoriteClubTicker, setFavoriteClubTicker] = useState<string | null>(null);
  const { track } = useAnalytics();
  const trackedRef = useRef(false);

  // Preços em tempo real via SSE (substitui valores do fetch inicial)
  const { ticks: tickMap, isBuffering, isOffline, error: streamError } = useAllMarketTicks();
  // T-019: saldo zero bloqueia compras
  const { fsBalance } = useBalance();
  const isBalanceZero = fsBalance !== null && fsBalance <= 0;

  // Merge preços e estado de halt em tempo real sobre a lista base
  const assets = useMemo<AssetData[]>(() => {
    return baseAssets.map((a) => {
      const live = tickMap[a.ticker];
      if (!live) return a;
      return {
        ...a,
        price: live.lastPrice,
        change24h: Math.round(live.change24h * 100) / 100,
        halted: live.isHalted,
        haltedUntil: live.haltedUntil ?? null,
        state: live.state,
        delayed: live.delayed,
        delayMs: live.delayMs,
        isStale: live.isStale,
      };
    });
  }, [baseAssets, tickMap]);

  useEffect(() => {
    async function fetchData() {
      try {
        const [assetsRes, meRes] = await Promise.all([
          fetch("/api/v1/assets", { credentials: "include" }),
          fetch("/api/v1/me", { credentials: "include" }),
        ]);

        if (meRes.ok) {
          const meJson = await meRes.json();
          setFavoriteClubTicker(meJson.data?.favoriteClub ?? null);
        }

        if (!assetsRes.ok) {
          setIsLoading(false);
          return;
        }
        const json = await assetsRes.json();
        const mapped: AssetData[] = (json.data ?? []).map((a: {
          ticker: string;
          displayName: string;
          currentPrice: number;
          openPrice: number;
          sentiment: string;
          division: string;
          colors: { primary: string; secondary: string };
          isHalted?: boolean;
        }) => {
          const change24h = a.openPrice > 0
            ? ((a.currentPrice - a.openPrice) / a.openPrice) * 100
            : 0;
          return {
            ticker: a.ticker,
            displayName: a.displayName,
            price: a.currentPrice,
            change24h: Math.round(change24h * 100) / 100,
            sentiment: a.sentiment as AssetData["sentiment"],
            sparkData: [],
            division: a.division as AssetData["division"],
            clubColor: a.colors.primary,
            clubColorSecondary: a.colors.secondary,
            halted: a.isHalted ?? false,
          };
        });
        setBaseAssets(mapped);
      } catch {
        // silently fail, show empty state
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, []);

  // EVT-016: market_list_viewed — rastreia quando a página do mercado é visualizada
  useEffect(() => {
    if (trackedRef.current) return;
    trackedRef.current = true;

    const filterApplied = divisions.size > 0 || trends.size > 0;
    const filterType = divisions.size > 0 ? "division" : trends.size > 0 ? "trend" : undefined;

    track("market_list_viewed", {
      plan: "JOGADOR" as const, // plano real é resolvido pelo provider via identify
      filter_applied: filterApplied,
      filter_type: filterType,
    });
  }, [track, divisions, trends]);

  const toggleDivision = (d: Division) => {
    const newSet = new Set(divisions);
    if (newSet.has(d)) {
      newSet.delete(d);
    } else {
      newSet.add(d);
    }
    setDivisions(newSet);
  };

  const toggleTrend = (s: TrendFilter) => {
    const newSet = new Set(trends);
    if (newSet.has(s)) {
      newSet.delete(s);
    } else {
      newSet.add(s);
    }
    setTrends(newSet);
  };

  const filtered = useMemo<AssetData[]>(() => {
    const list = assets.filter((a) => {
      const matchSearch =
        !search ||
        a.ticker.toLowerCase().includes(search.toLowerCase()) ||
        a.displayName.toLowerCase().includes(search.toLowerCase());

      const matchDivision = divisions.size === 0 || divisions.has(a.division as Division);

      const assetTrend = classifyTrend(a.change24h);
      const matchTrend =
        trends.size === 0 ||
        (trends.has("positive") && assetTrend === "up") ||
        (trends.has("stable") && assetTrend === "stable") ||
        (trends.has("negative") && assetTrend === "down");

      return matchSearch && matchDivision && matchTrend;
    });

    if (favoriteClubTicker) {
      const favIdx = list.findIndex((a) => a.ticker === favoriteClubTicker);
      if (favIdx > 0) {
        const [fav] = list.splice(favIdx, 1);
        list.unshift(fav);
      }
    }

    return list;
  }, [assets, search, divisions, trends, favoriteClubTicker]);

  const clearFilters = () => {
    setSearch("");
    setDivisions(new Set());
    setTrends(new Set());
  };

  return (
    <div className="flex flex-col" data-testid="mercado-page">
      {/* T-019: banner saldo zerado — visivel no topo da tela de mercado */}
      {isBalanceZero && (
        <div
          role="alert"
          data-testid="market-balance-zero-banner"
          className="flex items-center gap-2 text-sm text-[#F6465D] bg-[rgba(246,70,93,.08)] border-b border-[rgba(246,70,93,.2)] px-4 py-2.5"
        >
          <span aria-hidden="true" className="flex-shrink-0">&#9888;</span>
          Saldo zerado — venda posições para negociar novamente.
        </div>
      )}

      {/* Search */}
      <div className="px-4 pt-4 pb-3 border-b border-[rgba(240,185,11,.08)]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#707A8A]" aria-hidden="true" />
          <input
            data-testid="market-search-input"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar clube ou ticker..."
            aria-label="Buscar clube ou ticker"
            className="h-10 w-full rounded-lg border border-[rgba(240,185,11,.18)] bg-[#181A20] pl-9 pr-9 text-sm text-[#EAECEF] placeholder:text-[#707A8A] focus:outline-none focus:border-[rgba(240,185,11,.4)]"
          />
          {search && (
            <button
              data-testid="market-search-clear"
              onClick={() => setSearch("")}
              aria-label="Limpar busca"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#929AA5] hover:text-[#EAECEF]"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div
        data-testid="market-filters"
        className="px-4 py-2.5 flex flex-col gap-2 border-b border-[rgba(240,185,11,.08)]"
      >
        <fieldset className="border-0 p-0 m-0">
          <legend className="sr-only">Filtrar por divisao</legend>
          <div className="flex gap-1.5 flex-wrap">
            {(["SERIE_A", "SERIE_B"] as const).map((d) => (
              <button
                key={d}
                data-testid={`market-filter-division-${d === "SERIE_A" ? "a" : "b"}`}
                onClick={() => toggleDivision(d)}
                aria-pressed={divisions.has(d)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium border transition-all",
                  divisions.has(d)
                    ? "bg-[rgba(46,189,133,.2)] border-[#2EBD85] text-white"
                    : "bg-transparent border-[rgba(240,185,11,.18)] text-[#929AA5] hover:border-[rgba(240,185,11,.35)]"
                )}
              >
                {d === "SERIE_A" ? "Serie A" : "Serie B"}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="border-0 p-0 m-0">
          <legend className="sr-only">Filtrar por tendência</legend>
          <div className="flex gap-1.5 flex-wrap justify-end">
            {(["positive", "stable", "negative"] as const).map((s) => (
              <button
                key={s}
                data-testid={`market-filter-trend-${s}`}
                onClick={() => toggleTrend(s)}
                aria-pressed={trends.has(s)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium border transition-all",
                  trends.has(s)
                    ? s === "positive"
                      ? "bg-[rgba(34,197,94,.2)] border-[#2EBD85] text-[#2EBD85]"
                      : s === "negative"
                      ? "bg-[rgba(239,68,68,.2)] border-[#F6465D] text-[#F6465D]"
                      : s === "stable"
                      ? "bg-[rgba(148,163,184,.2)] border-[#94a3b8] text-[#94a3b8]"
                      : "bg-[rgba(46,189,133,.2)] border-[#2EBD85] text-white"
                    : "bg-transparent border-[rgba(240,185,11,.18)] text-[#929AA5] hover:border-[rgba(240,185,11,.35)]"
                )}
              >
                {s === "positive" ? "Em alta" : s === "stable" ? "Estável" : "Em baixa"}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      {/* T9: estados de conexão do stream */}
      {streamError && (
        <div
          role="alert"
          data-testid="market-error-state"
          className="mx-4 mt-4 rounded-lg border border-[#F6465D]/30 bg-[#F6465D]/10 px-4 py-3 text-sm text-[#F6465D]"
        >
          Erro ao conectar ao streaming de mercado. Tente recarregar a página.
        </div>
      )}
      {isOffline && !streamError && (
        <div
          role="alert"
          data-testid="market-stream-offline"
          className="mx-4 mt-4 rounded-lg border border-[#707A8A]/30 bg-[#707A8A]/10 px-4 py-3 text-sm text-[#EAECEF]"
        >
          Você está offline. As cotações podem estar desatualizadas.
        </div>
      )}
      {isBuffering && !isOffline && (
        <div
          role="status"
          data-testid="market-stream-buffering"
          className="mx-4 mt-4 rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/10 px-4 py-3 text-sm text-[#F59E0B]"
        >
          Cotação em aquecimento. Exibindo o último valor permitido para o seu plano.
        </div>
      )}

      {/* Asset list */}
      {isLoading ? (
        <div className="flex flex-col gap-2 p-4 md:flex-row md:flex-wrap">
          {Array.from({ length: 8 }).map((_, i) => (
            <AssetCardSkeleton key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          data-testid="market-empty-state"
          icon={<span>🔍</span>}
          title="Nenhum ativo encontrado"
          description="Tente ajustar os filtros ou limpar a busca."
          action={{ label: "Limpar filtros", onClick: clearFilters }}
          className="py-16"
        />
      ) : (
        <div
          data-testid="market-list"
          data-tour="market-list"
          className="flex flex-col gap-2 p-4 md:flex-row md:flex-wrap"
        >
          {filtered.map((asset) => (
            <AssetCard
              key={asset.ticker}
              asset={asset}
              isFavorite={!!favoriteClubTicker && asset.ticker === favoriteClubTicker}
            />
          ))}
        </div>
      )}
    </div>
  );
}
