"use client";

import { useRouter } from "next/navigation";
import { Briefcase, TrendingDown } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { OrderHistory } from "@/components/orders/OrderHistory";
import { ROUTES } from "@/lib/constants/routes";

export function PortfolioClient() {
  const router = useRouter();
  return (
    <div data-testid="portfolio-page" className="flex flex-col gap-0">
      <div className="px-4 pt-4 pb-3">
        <h1 className="text-lg font-bold text-[#EAECEF] mb-4">Minha Carteira</h1>

        <div data-testid="portfolio-stats-grid" className="grid grid-cols-2 gap-2 mb-4">
          <StatCard
            label="Portfólio Total"
            value="FS$ 12.456,78"
            subValue="+3,45% hoje ▲"
            subValueColor="positive"
            tooltip="Soma do saldo disponivel + valor atual de todas as posicoes abertas"
          />
          <StatCard
            label="P&L Hoje"
            value="+FS$ 384,20"
            subValue="3 operações"
            subValueColor="positive"
            tooltip="Lucro ou prejuizo acumulado nas operacoes do dia (Profit & Loss)"
          />
          <StatCard
            label="Saldo Disponível"
            value="FS$ 8.543,22"
            tooltip="Valor em FS$ livre para novas operacoes de compra"
          />
          <StatCard
            label="Em Posições"
            value="FS$ 3.913,56"
            tooltip="Valor total alocado em acoes de clubes que voce possui atualmente"
          />
        </div>

        <Tabs defaultValue="posicoes">
          <TabsList data-testid="portfolio-tabs" className="w-full">
            <TabsTrigger data-testid="portfolio-tab-posicoes" value="posicoes">Posições</TabsTrigger>
            <TabsTrigger data-testid="portfolio-tab-ordens" value="ordens">Ordens</TabsTrigger>
            <TabsTrigger data-testid="portfolio-tab-extrato" value="extrato">Extrato</TabsTrigger>
          </TabsList>

          <TabsContent data-testid="portfolio-content-posicoes" value="posicoes" className="mt-4">
            <EmptyState
              icon={<Briefcase />}
              title="Sua carteira está vazia"
              description="Explore o mercado e faça sua primeira operação"
              action={{
                label: "Ir ao Mercado",
                onClick: () => { router.push(ROUTES.MERCADO); },
              }}
            />
          </TabsContent>

          <TabsContent value="ordens" className="mt-4">
            <OrderHistory />
          </TabsContent>

          <TabsContent value="extrato" className="mt-4">
            <EmptyState
              icon={<TrendingDown />}
              title="Extrato vazio"
              description="Suas transações aparecerão aqui após a primeira operação"
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
