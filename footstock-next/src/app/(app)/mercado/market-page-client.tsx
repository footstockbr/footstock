"use client";

import { useState, useMemo, useEffect } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AssetCard, AssetCardSkeleton, type AssetData } from "@/components/market/asset-card";
import { EmptyState } from "@/components/ui/empty-state";

// Dados mock temporários para build — nomes fictícios conforme INTAKE
const MOCK_ASSETS: AssetData[] = [
  { ticker: "URU3", name: "Urubu da Gavea FC", price: 87.5, change24h: -1.5, sentiment: "NEGATIVO", sparkData: [90, 89, 88, 88.5, 87.8, 87.5], division: "A", clubColor: "#E32B28" },
  { ticker: "POR4", name: "Porco do Parque FC", price: 156.8, change24h: 1.4, sentiment: "POSITIVO", sparkData: [152, 153, 154, 155, 156, 156.8], division: "A", clubColor: "#006432" },
  { ticker: "TIM3", name: "Timão do São Jorge FC", price: 44.2, change24h: 0.3, sentiment: "NEUTRO", sparkData: [44, 44.1, 44.3, 44.1, 44.2, 44.2], division: "A", clubColor: "#444444" },
  { ticker: "MAL4", name: "Cruz de Malta de São Januário SC", price: 42.5, change24h: 2.3, sentiment: "POSITIVO", sparkData: [40, 41, 41.5, 42, 42.3, 42.5], division: "A", clubColor: "#111111" },
  { ticker: "FOG3", name: "Estrela do General Severiano RC", price: 31.8, change24h: 1.8, sentiment: "POSITIVO", sparkData: [30, 30.5, 31, 31.3, 31.6, 31.8], division: "A", clubColor: "#111111" },
  { ticker: "TRI4", name: "Tricolor do Morumbi AC", price: 55.2, change24h: 0.5, sentiment: "POSITIVO", sparkData: [54.8, 54.9, 55, 55.1, 55.2, 55.2], division: "A", clubColor: "#C40A0A" },
  { ticker: "IMO3", name: "Imortal da Arena FC", price: 68.4, change24h: -0.8, sentiment: "NEGATIVO", sparkData: [69, 68.9, 68.7, 68.6, 68.4, 68.4], division: "A", clubColor: "#003DA5" },
  { ticker: "COL3", name: "Colorado do Beira-Rio SC", price: 72.1, change24h: 2.1, sentiment: "POSITIVO", sparkData: [70, 71, 71.5, 71.8, 72, 72.1], division: "A", clubColor: "#CC0000" },
  { ticker: "FUR3", name: "Furacão do Capão da Imbuia FC", price: 38.9, change24h: -2.3, sentiment: "NEGATIVO", sparkData: [40, 39.8, 39.5, 39.2, 39, 38.9], division: "A", clubColor: "#CC0000" },
  { ticker: "RAP3", name: "Raposa do Mineirão FC", price: 23.4, change24h: -1.1, sentiment: "NEGATIVO", sparkData: [24, 23.9, 23.7, 23.5, 23.4, 23.4], division: "A", clubColor: "#003087" },
  { ticker: "LEI3", name: "Leão da Ilha do Retiro FC", price: 15.6, change24h: 3.2, sentiment: "MUITO_POSITIVO", sparkData: [14.8, 15, 15.2, 15.4, 15.5, 15.6], division: "B", clubColor: "#CC0000" },
  { ticker: "TIS3", name: "Tigre da Serra Dourada FC", price: 8.9, change24h: -0.5, sentiment: "NEUTRO", sparkData: [9, 9, 8.9, 8.9, 8.9, 8.9], division: "B", clubColor: "#CC0000" },
];

type Division = "all" | "A" | "B";
type SentimentFilter = "all" | "positive" | "neutral" | "negative";

export function MarketPageClient() {
  const [search, setSearch] = useState("");
  const [division, setDivision] = useState<Division>("all");
  const [sentiment, setSentiment] = useState<SentimentFilter>("all");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setIsLoading(false), 800);
    return () => clearTimeout(t);
  }, []);

  const filtered = useMemo(() => {
    return MOCK_ASSETS.filter((a) => {
      const matchSearch =
        !search ||
        a.ticker.toLowerCase().includes(search.toLowerCase()) ||
        a.name.toLowerCase().includes(search.toLowerCase());

      const matchDivision = division === "all" || a.division === division;

      const matchSentiment =
        sentiment === "all" ||
        (sentiment === "positive" &&
          (a.sentiment === "POSITIVO" || a.sentiment === "MUITO_POSITIVO")) ||
        (sentiment === "neutral" && a.sentiment === "NEUTRO") ||
        (sentiment === "negative" &&
          (a.sentiment === "NEGATIVO" || a.sentiment === "MUITO_NEGATIVO"));

      return matchSearch && matchDivision && matchSentiment;
    });
  }, [search, division, sentiment]);

  const clearFilters = () => {
    setSearch("");
    setDivision("all");
    setSentiment("all");
  };

  return (
    <div className="flex flex-col" data-testid="mercado-page">
      {/* Delay badge (for Jogador plan) */}
      {/* <div className="px-4 py-2 bg-[rgba(240,185,11,.08)] border-b border-[rgba(240,185,11,.1)]">
        <div data-testid="delay-badge" className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-[#F0B90B]" />
          <span className="text-xs text-[#F0B90B]">Dados com 1h de atraso</span>
          <Link href={ROUTES.PLANOS} className="text-xs text-[#F0B90B] underline ml-auto">Fazer upgrade →</Link>
        </div>
      </div> */}

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
          <legend className="sr-only">Filtrar por divisão</legend>
          <div className="flex gap-1.5 flex-wrap">
            {(["all", "A", "B"] as const).map((d) => (
              <button
                key={d}
                data-testid={`market-filter-division-${d === "all" ? "all" : d.toLowerCase()}`}
                onClick={() => setDivision(d)}
                aria-pressed={division === d}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium border transition-all",
                  division === d
                    ? "bg-[rgba(46,189,133,.2)] border-[#2EBD85] text-white"
                    : "bg-transparent border-[rgba(240,185,11,.18)] text-[#929AA5] hover:border-[rgba(240,185,11,.35)]"
                )}
              >
                {d === "all" ? "Todos" : `Série ${d}`}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="border-0 p-0 m-0">
          <legend className="sr-only">Filtrar por sentimento</legend>
          <div className="flex gap-1.5 flex-wrap">
            {(["all", "positive", "neutral", "negative"] as const).map((s) => (
              <button
                key={s}
                data-testid={`market-filter-sentiment-${s}`}
                onClick={() => setSentiment(s)}
                aria-pressed={sentiment === s}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium border transition-all",
                  sentiment === s
                    ? s === "positive"
                      ? "bg-[rgba(34,197,94,.2)] border-[#2EBD85] text-[#2EBD85]"
                      : s === "negative"
                      ? "bg-[rgba(239,68,68,.2)] border-[#F6465D] text-[#F6465D]"
                      : s === "neutral"
                      ? "bg-[rgba(148,163,184,.2)] border-[#94a3b8] text-[#94a3b8]"
                      : "bg-[rgba(46,189,133,.2)] border-[#2EBD85] text-white"
                    : "bg-transparent border-[rgba(240,185,11,.18)] text-[#929AA5] hover:border-[rgba(240,185,11,.35)]"
                )}
              >
                {s === "all" ? "Todos" : s === "positive" ? "Positivo" : s === "neutral" ? "Neutro" : "Negativo"}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      {/* Asset list */}
      {isLoading ? (
        <div className="flex flex-col gap-2 p-4">
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
          className="flex flex-col gap-2 p-4 md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {filtered.map((asset) => (
            <AssetCard key={asset.ticker} asset={asset} />
          ))}
        </div>
      )}
    </div>
  );
}
