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
              <span className="text-xs text-[#929AA5]">Divisão</span>
              <span className="text-xs text-[#EAECEF]">Série A</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-[rgba(240,185,11,.06)]">
              <span className="text-xs text-[#929AA5]">Supply total</span>
              <span className="text-xs font-mono text-[#EAECEF]">10.000 ações</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-xs text-[#929AA5]">Sessão atual</span>
              <span className="text-xs text-[#2EBD85]">Negociação</span>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
