"use client";

import { TrendingUp } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { YieldPendingBadge } from "@/components/dividends/YieldPendingBadge";
import { YieldPendingTooltip } from "@/components/dividends/YieldPendingTooltip";

interface AtivoClientProps {
  ticker: string;
  asset: {
    displayName: string;
    division: string;
    currentSupply: number;
    totalShares: number;
    sentiment: string;
    isHalted: boolean;
  };
}

/** Hook para buscar yield pendente do ticker atual (apenas JOGADOR tem dados) */
function useYieldPending(ticker: string) {
  return useQuery<{ totalPending: number }>({
    queryKey: ["yield-pending", ticker],
    queryFn: async () => {
      const res = await fetch("/api/v1/dividends/yield-pending");
      if (!res.ok) return { totalPending: 0 };
      const json = await res.json();
      const items: Array<{ ticker: string; totalPending: number }> =
        json.data?.items ?? [];
      const found = items.find((i) => i.ticker === ticker);
      return { totalPending: found?.totalPending ?? 0 };
    },
    staleTime: 60_000,
  });
}

export function AtivoClient({ ticker, asset }: AtivoClientProps) {
  const divisionLabel = asset.division === "SERIE_A" ? "Série A" : "Série B";
  const supplyDisplay = asset.currentSupply.toLocaleString("pt-BR");
  const tradingStatus = asset.isHalted ? "Suspensa" : "Negociação";
  const tradingStatusColor = asset.isHalted ? "text-[#F6465D]" : "text-[#2EBD85]";

  const { data: yieldData } = useYieldPending(ticker);
  const totalYieldPending = yieldData?.totalPending ?? 0;

  return (
    <div data-testid="ativo-page" className="px-4 pt-3">
      {/* Yield Pendente — visível apenas para JOGADOR com yield acumulado */}
      {totalYieldPending > 0 && (
        <div className="mb-4 space-y-3" data-testid="yield-pending-section">
          <YieldPendingBadge totalPending={totalYieldPending} showTooltip />
          <YieldPendingTooltip ticker={ticker} totalPending={totalYieldPending} />
        </div>
      )}

      <Tabs defaultValue="grafico">
        <TabsList data-testid="ativo-tabs" className="w-full">
          <TabsTrigger data-testid="ativo-tab-grafico" value="grafico">Gráfico</TabsTrigger>
          <TabsTrigger data-testid="ativo-tab-ordens" value="ordens">Ordens</TabsTrigger>
          <TabsTrigger data-testid="ativo-tab-analise" value="analise">Análise</TabsTrigger>
          <TabsTrigger data-testid="ativo-tab-info" value="info">Info</TabsTrigger>
        </TabsList>

        <TabsContent data-testid="ativo-content-grafico" value="grafico" className="mt-4">
          <div className="h-48 bg-[#1E2329] rounded-lg border border-[rgba(240,185,11,.1)] flex items-center justify-center">
            <div className="text-center">
              <TrendingUp className="h-8 w-8 text-[#707A8A] mx-auto mb-2" />
              <p className="text-sm text-[#929AA5]">Gráfico OHLC</p>
              <p className="text-xs text-[#707A8A] mt-1">Integração com backend pendente</p>
            </div>
          </div>
        </TabsContent>

        <TabsContent data-testid="ativo-content-ordens" value="ordens" className="mt-4">
          <div id="operar" data-testid="ativo-order-form" className="flex flex-col gap-3">
            <h2 className="text-base font-semibold text-[#EAECEF]">Nova Ordem</h2>
            <Tabs defaultValue="mercado">
              <TabsList data-testid="ativo-order-type-tabs">
                <TabsTrigger data-testid="ativo-order-type-mercado" value="mercado">Mercado</TabsTrigger>
                <TabsTrigger data-testid="ativo-order-type-limitada" value="limitada">Limitada</TabsTrigger>
                <TabsTrigger data-testid="ativo-order-type-agendada" value="agendada">Agendada</TabsTrigger>
              </TabsList>
              <TabsContent value="mercado" className="mt-3">
                <div className="bg-[#1E2329] rounded-lg border border-[rgba(240,185,11,.1)] p-4 text-center">
                  <p className="text-sm text-[#929AA5]">Formulário de ordem — backend pendente</p>
                </div>
              </TabsContent>
              <TabsContent value="limitada" className="mt-3">
                <div className="bg-[#1E2329] rounded-lg border border-[rgba(240,185,11,.1)] p-4 text-center">
                  <p className="text-sm text-[#929AA5]">Ordem limitada — backend pendente</p>
                </div>
              </TabsContent>
              <TabsContent value="agendada" className="mt-3">
                <div className="bg-[#1E2329] rounded-lg border border-[rgba(240,185,11,.1)] p-4 text-center">
                  <p className="text-sm text-[#929AA5]">Ordem agendada — backend pendente</p>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </TabsContent>

        <TabsContent value="analise" className="mt-4">
          <div className="bg-[#1E2329] rounded-lg border border-[rgba(240,185,11,.1)] p-4 text-center">
            <p className="text-sm text-[#929AA5]">Análise técnica — backend pendente</p>
          </div>
        </TabsContent>

        <TabsContent value="info" className="mt-4">
          <div className="bg-[#1E2329] rounded-lg border border-[rgba(240,185,11,.1)] p-4 space-y-2">
            <div className="flex justify-between py-1.5 border-b border-[rgba(240,185,11,.06)]">
              <span className="text-xs text-[#929AA5]">Ticker</span>
              <span className="text-xs font-mono font-bold text-[#EAECEF]">{ticker}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-[rgba(240,185,11,.06)]">
              <span className="text-xs text-[#929AA5]">Clube</span>
              <span className="text-xs font-bold text-[#EAECEF]">{asset.displayName}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-[rgba(240,185,11,.06)]">
              <span className="text-xs text-[#929AA5]">Divisão</span>
              <span className="text-xs text-[#EAECEF]">{divisionLabel}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-[rgba(240,185,11,.06)]">
              <span className="text-xs text-[#929AA5]">Supply total</span>
              <span className="text-xs font-mono text-[#EAECEF]">{supplyDisplay} ações</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-xs text-[#929AA5]">Sessão atual</span>
              <span className={`text-xs ${tradingStatusColor}`}>{tradingStatus}</span>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
