"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Briefcase, TrendingDown, TrendingUp } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { OrderHistory } from "@/components/orders/OrderHistory";
import { TransactionHistory } from "@/components/portfolio/TransactionHistory";
import { ROUTES } from "@/lib/constants/routes";
import { formatFS, formatPct } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { PortfolioChart } from "@/components/portfolio/PortfolioChart";
import { GlossaryInfoIcon } from "@/components/ui/glossary-info-icon";

interface PortfolioPosition {
  ticker: string;
  name: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  totalInvested: number;
  side: string;
}

interface PortfolioData {
  balance: number;
  positionsValue: number;
  totalValue: number;
  pnl: number;
  pnlToday: number;
  todayTransactionsCount: number;
  positions: PortfolioPosition[];
}

export function PortfolioClient() {
  const router = useRouter();
  const [data, setData] = useState<PortfolioData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPortfolio() {
      try {
        const res = await fetch("/api/v1/portfolio");
        if (!res.ok) {
          setError("Erro ao carregar carteira");
          return;
        }
        const json = await res.json();
        setData(json.data);
      } catch {
        setError("Erro ao carregar carteira");
      } finally {
        setIsLoading(false);
      }
    }
    fetchPortfolio();
  }, []);

  const totalValue = data?.totalValue ?? 0;
  const pnlPct = totalValue > 0 && data ? (data.pnl / (totalValue - data.pnl)) * 100 : 0;
  const pnlTodaySign = (data?.pnlToday ?? 0) >= 0 ? "+" : "";
  const pnlTodayColor: "positive" | "negative" | "neutral" =
    (data?.pnlToday ?? 0) > 0 ? "positive" : (data?.pnlToday ?? 0) < 0 ? "negative" : "neutral";
  const pnlColor: "positive" | "negative" | "neutral" =
    (data?.pnl ?? 0) > 0 ? "positive" : (data?.pnl ?? 0) < 0 ? "negative" : "neutral";

  const hasPositions = (data?.positions.length ?? 0) > 0;

  return (
    <div data-testid="portfolio-page" data-tour="portfolio-section" className="flex flex-col gap-0">
      <div className="px-4 pt-4 pb-3">
        <h1 className="text-lg font-bold text-[#EAECEF] mb-4">Minha Carteira</h1>

        {/* T-019: banner saldo zerado */}
        {!isLoading && !error && data && data.balance <= 0 && (
          <div
            role="alert"
            data-testid="portfolio-balance-zero-banner"
            className="flex items-center gap-2 text-sm text-[#F6465D] bg-[rgba(246,70,93,.08)] border border-[rgba(246,70,93,.2)] rounded-lg px-3 py-2.5 mb-4"
          >
            <span aria-hidden="true" className="flex-shrink-0">&#9888;</span>
            <span>Saldo zerado — venda posições para negociar novamente.</span>
          </div>
        )}

        {error ? (
          <div className="bg-[rgba(246,70,93,.1)] border border-[#F6465D] rounded-lg p-4 mb-4 text-sm text-[#F6465D]">
            {error}
          </div>
        ) : (
          <div data-testid="portfolio-stats-grid" className="grid grid-cols-2 gap-2 mb-4">
            <StatCard
              label="Portfolio Total"
              value={isLoading ? "" : formatFS(totalValue)}
              subValue={isLoading ? "" : `${formatPct(pnlPct)} total`}
              subValueColor={pnlColor}
              tooltip="Soma do saldo disponível + valor atual de todas as posições abertas"
              isLoading={isLoading}
            />
            <StatCard
              label={<>P&L Hoje <GlossaryInfoIcon fieldKey="pnl" size={12} /></>}
              value={isLoading ? "" : `${pnlTodaySign}${formatFS(Math.abs(data?.pnlToday ?? 0))}`}
              subValue={isLoading ? "" : `${data?.todayTransactionsCount ?? 0} operações`}
              subValueColor={pnlTodayColor}
              tooltip="Lucro ou prejuízo acumulado nas operações do dia (Profit & Loss)"
              isLoading={isLoading}
            />
            <StatCard
              label="Saldo Disponível"
              value={isLoading ? "" : formatFS(data?.balance ?? 0)}
              tooltip="Valor em FS$ livre para novas operações de compra"
              isLoading={isLoading}
            />
            <StatCard
              label="Em Posições"
              value={isLoading ? "" : formatFS(data?.positionsValue ?? 0)}
              tooltip="Valor total alocado em ações de clubes que você possui atualmente"
              isLoading={isLoading}
            />
          </div>
        )}

        <PortfolioChart />

        <Tabs defaultValue="posicoes">
          <TabsList data-testid="portfolio-tabs" className="w-full">
            <TabsTrigger data-testid="portfolio-tab-posicoes" value="posicoes">Posições</TabsTrigger>
            <TabsTrigger data-testid="portfolio-tab-ordens" value="ordens">Ordens</TabsTrigger>
            <TabsTrigger data-testid="portfolio-tab-extrato" value="extrato">Extrato</TabsTrigger>
          </TabsList>

          <TabsContent data-testid="portfolio-content-posicoes" value="posicoes" className="mt-4">
            {isLoading ? (
              <div className="flex flex-col gap-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="bg-[#1E2329] rounded-lg border border-[rgba(240,185,11,.18)] p-4 animate-pulse">
                    <div className="h-4 bg-[#2B3139] rounded w-32 mb-2" />
                    <div className="h-3 bg-[#2B3139] rounded w-24" />
                  </div>
                ))}
              </div>
            ) : hasPositions ? (
              <div className="flex flex-col gap-2">
                {data!.positions.map((pos) => {
                  const currentValue = pos.quantity * pos.currentPrice;
                  const positionPnl = currentValue - pos.totalInvested;
                  const positionPnlPct = pos.totalInvested > 0 ? (positionPnl / pos.totalInvested) * 100 : 0;
                  const isPositive = positionPnl >= 0;

                  return (
                    <div
                      key={pos.ticker}
                      className="bg-[#1E2329] rounded-lg border border-[rgba(240,185,11,.18)] p-4 flex items-center justify-between"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-bold text-[#EAECEF]">{pos.ticker}</span>
                          <span className="text-xs text-[#929AA5]">{pos.name}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-[#929AA5]">
                          <span>{pos.quantity} cotas</span>
                          <span className="inline-flex items-center gap-0.5">PM: {formatFS(pos.avgPrice)} <GlossaryInfoIcon fieldKey="margem" size={11} /></span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold font-mono text-[#EAECEF]">
                          {formatFS(currentValue)}
                        </p>
                        <p className={cn(
                          "text-xs font-mono",
                          isPositive ? "text-[#2EBD85]" : "text-[#F6465D]",
                        )}>
                          {isPositive ? "+" : ""}{formatFS(positionPnl)} ({formatPct(positionPnlPct)})
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                icon={<Briefcase />}
                title="Sua carteira está vazia"
                description="Explore o mercado e faça sua primeira operação"
                action={{
                  label: "Ir ao Mercado",
                  onClick: () => { router.push(ROUTES.MERCADO); },
                }}
              />
            )}
          </TabsContent>

          <TabsContent value="ordens" className="mt-4">
            <OrderHistory />
          </TabsContent>

          <TabsContent value="extrato" className="mt-4">
            <TransactionHistory />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
