"use client";

import { TrendingUp } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface AtivoClientProps {
  ticker: string;
}

export function AtivoClient({ ticker }: AtivoClientProps) {
  return (
    <div data-testid="ativo-page" className="px-4 pt-3">
      <Tabs defaultValue="grafico">
        <TabsList data-testid="ativo-tabs" className="w-full">
          <TabsTrigger data-testid="ativo-tab-grafico" value="grafico">Gráfico</TabsTrigger>
          <TabsTrigger data-testid="ativo-tab-ordens" value="ordens">Ordens</TabsTrigger>
          <TabsTrigger data-testid="ativo-tab-analise" value="analise">Análise</TabsTrigger>
          <TabsTrigger data-testid="ativo-tab-info" value="info">Info</TabsTrigger>
        </TabsList>

        <TabsContent data-testid="ativo-content-grafico" value="grafico" className="mt-4">
          <div className="h-48 bg-[#141210] rounded-lg border border-[rgba(201,168,76,.1)] flex items-center justify-center">
            <div className="text-center">
              <TrendingUp className="h-8 w-8 text-[#4a3d2a] mx-auto mb-2" />
              <p className="text-sm text-[#7a7060]">Gráfico OHLC</p>
              <p className="text-xs text-[#4a3d2a] mt-1">Integração com backend pendente</p>
            </div>
          </div>
        </TabsContent>

        <TabsContent data-testid="ativo-content-ordens" value="ordens" className="mt-4">
          <div id="operar" data-testid="ativo-order-form" className="flex flex-col gap-3">
            <h2 className="text-base font-semibold text-[#f0ead6]">Nova Ordem</h2>
            <Tabs defaultValue="mercado">
              <TabsList data-testid="ativo-order-type-tabs">
                <TabsTrigger data-testid="ativo-order-type-mercado" value="mercado">Mercado</TabsTrigger>
                <TabsTrigger data-testid="ativo-order-type-limitada" value="limitada">Limitada</TabsTrigger>
                <TabsTrigger data-testid="ativo-order-type-agendada" value="agendada">Agendada</TabsTrigger>
              </TabsList>
              <TabsContent value="mercado" className="mt-3">
                <div className="bg-[#141210] rounded-lg border border-[rgba(201,168,76,.1)] p-4 text-center">
                  <p className="text-sm text-[#7a7060]">Formulário de ordem — backend pendente</p>
                </div>
              </TabsContent>
              <TabsContent value="limitada" className="mt-3">
                <div className="bg-[#141210] rounded-lg border border-[rgba(201,168,76,.1)] p-4 text-center">
                  <p className="text-sm text-[#7a7060]">Ordem limitada — backend pendente</p>
                </div>
              </TabsContent>
              <TabsContent value="agendada" className="mt-3">
                <div className="bg-[#141210] rounded-lg border border-[rgba(201,168,76,.1)] p-4 text-center">
                  <p className="text-sm text-[#7a7060]">Ordem agendada — backend pendente</p>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </TabsContent>

        <TabsContent value="analise" className="mt-4">
          <div className="bg-[#141210] rounded-lg border border-[rgba(201,168,76,.1)] p-4 text-center">
            <p className="text-sm text-[#7a7060]">Análise técnica — backend pendente</p>
          </div>
        </TabsContent>

        <TabsContent value="info" className="mt-4">
          <div className="bg-[#141210] rounded-lg border border-[rgba(201,168,76,.1)] p-4 space-y-2">
            <div className="flex justify-between py-1.5 border-b border-[rgba(201,168,76,.06)]">
              <span className="text-xs text-[#7a7060]">Ticker</span>
              <span className="text-xs font-mono font-bold text-[#f0ead6]">{ticker}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-[rgba(201,168,76,.06)]">
              <span className="text-xs text-[#7a7060]">Divisão</span>
              <span className="text-xs text-[#f0ead6]">Série A</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-[rgba(201,168,76,.06)]">
              <span className="text-xs text-[#7a7060]">Supply total</span>
              <span className="text-xs font-mono text-[#f0ead6]">10.000 ações</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-xs text-[#7a7060]">Sessão atual</span>
              <span className="text-xs text-[#8b5cf6]">Negociação</span>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
