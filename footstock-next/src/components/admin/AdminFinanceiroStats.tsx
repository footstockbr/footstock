'use client'

import { useQuery } from '@tanstack/react-query'
import { Skeleton } from '@/components/ui/skeleton'
import type { FinancialStatsDTO } from '@/app/api/v1/admin/financial/stats/route'

async function fetchFinancialStats(): Promise<FinancialStatsDTO> {
  const res = await fetch('/api/v1/admin/financial/stats', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed')
  const { data } = await res.json()
  return data
}

const PLAN_COLORS: Record<string, string> = {
  JOGADOR: '#929AA5',
  CRAQUE: '#F0B90B',
  LENDA: '#FCD535',
}

const PLAN_LABELS: Record<string, string> = {
  JOGADOR: 'Jogador',
  CRAQUE: 'Craque',
  LENDA: 'Lenda',
}

const GATEWAY_LABELS: Record<string, string> = {
  MERCADO_PAGO: 'Mercado Pago',
  PAGSEGURO: 'PagSeguro',
  PAYPAL: 'PayPal',
}

function fmtBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function StatCard({ label, value, sub, testid }: {
  label: string
  value: string | number
  sub?: string
  testid: string
}) {
  return (
    <div
      data-testid={testid}
      className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4"
    >
      <p className="text-[11px] font-medium text-[#929AA5] uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-extrabold text-[#EAECEF]">{value}</p>
      {sub && <p className="text-[11px] text-[#929AA5] mt-1">{sub}</p>}
    </div>
  )
}

function LoadingGrid() {
  return (
    <div data-testid="admin-financeiro-stats-loading" className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-[90px] w-full rounded-xl" />
      ))}
    </div>
  )
}

export function AdminFinanceiroStats() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-financeiro-stats'],
    queryFn: fetchFinancialStats,
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  if (isLoading) return <LoadingGrid />

  if (isError || !data) {
    return (
      <div
        data-testid="admin-financeiro-stats-error"
        className="flex items-center gap-3 p-4 bg-[#F6465D]/10 border border-[#F6465D]/20 rounded-lg text-sm text-[#F6465D]"
      >
        Erro ao carregar métricas financeiras
      </div>
    )
  }

  return (
    <div data-testid="admin-financeiro-stats" className="grid grid-cols-2 md:grid-cols-3 gap-3">

      {/* 1. Receita Total */}
      <StatCard
        testid="admin-financeiro-kpi-receita-total"
        label="Receita Total"
        value={fmtBRL(data.totalRevenue)}
        sub="todos os pagamentos confirmados"
      />

      {/* 2. MRR */}
      <StatCard
        testid="admin-financeiro-kpi-mrr"
        label="MRR"
        value={fmtBRL(data.mrr)}
        sub="receita mensal recorrente"
      />

      {/* 3. Inadimplência */}
      <div
        data-testid="admin-financeiro-kpi-inadimplencia"
        className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4"
      >
        <p className="text-[11px] font-medium text-[#929AA5] uppercase tracking-wide mb-2">
          Inadimplência
        </p>
        <p
          className="text-2xl font-extrabold"
          style={{ color: data.inadimplencia.rate > 5 ? '#F6465D' : '#EAECEF' }}
        >
          {data.inadimplencia.rate.toFixed(1)}%
        </p>
        <div className="mt-1 space-y-0.5">
          <p className="text-[11px] text-[#929AA5]">{data.inadimplencia.failedCount} falhas este mês</p>
          <p className="text-[11px] text-[#929AA5]">{fmtBRL(data.inadimplencia.failedAmount)} perdidos</p>
        </div>
      </div>

      {/* 4. Receita por Plano */}
      <div
        data-testid="admin-financeiro-kpi-receita-planos"
        className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4"
      >
        <p className="text-[11px] font-medium text-[#929AA5] uppercase tracking-wide mb-2">
          Receita por Plano
        </p>
        <div className="space-y-2">
          {data.revenueByPlan.map(({ plan, revenue, pct }) => (
            <div key={plan} className="flex items-center gap-2">
              <div
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: PLAN_COLORS[plan] ?? '#929AA5' }}
              />
              <span className="text-[11px] text-[#929AA5] w-14 flex-shrink-0">
                {PLAN_LABELS[plan] ?? plan}
              </span>
              <div className="flex-1 h-1.5 rounded-full bg-[#2B3139] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, background: PLAN_COLORS[plan] ?? '#929AA5' }}
                />
              </div>
              <span className="text-[11px] font-mono text-[#EAECEF] w-16 text-right flex-shrink-0">
                {fmtBRL(revenue)}
              </span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-[#707A8A] mt-2">pagamentos aprovados no mês</p>
      </div>

      {/* 5. Receita por Método de Pagamento */}
      <div
        data-testid="admin-financeiro-kpi-receita-gateway"
        className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4"
      >
        <p className="text-[11px] font-medium text-[#929AA5] uppercase tracking-wide mb-2">
          Receita por Método
        </p>
        <div className="space-y-2">
          {data.revenueByGateway.length === 0 ? (
            <p className="text-[11px] text-[#929AA5]">Sem dados este mês</p>
          ) : (
            data.revenueByGateway.map(({ gateway, revenue, pct }) => (
              <div key={gateway} className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-[#F0B90B]" />
                <span className="text-[11px] text-[#929AA5] w-24 flex-shrink-0 truncate">
                  {GATEWAY_LABELS[gateway] ?? gateway}
                </span>
                <div className="flex-1 h-1.5 rounded-full bg-[#2B3139] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#F0B90B] transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-[11px] font-mono text-[#EAECEF] w-16 text-right flex-shrink-0">
                  {fmtBRL(revenue)}
                </span>
              </div>
            ))
          )}
        </div>
        <p className="text-[10px] text-[#707A8A] mt-2">pagamentos aprovados no mês</p>
      </div>

      {/* 6. Assinantes por Plano */}
      <div
        data-testid="admin-financeiro-kpi-assinantes-plano"
        className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4"
      >
        <p className="text-[11px] font-medium text-[#929AA5] uppercase tracking-wide mb-2">
          Assinantes por Plano
        </p>
        <div className="space-y-2">
          {data.subscribersByPlan.map(({ plan, count, pct }) => (
            <div key={plan} className="flex items-center gap-2">
              <div
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: PLAN_COLORS[plan] ?? '#929AA5' }}
              />
              <span className="text-[11px] text-[#929AA5] w-14 flex-shrink-0">
                {PLAN_LABELS[plan] ?? plan}
              </span>
              <div className="flex-1 h-1.5 rounded-full bg-[#2B3139] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, background: PLAN_COLORS[plan] ?? '#929AA5' }}
                />
              </div>
              <span className="text-[11px] font-mono text-[#EAECEF] w-8 text-right flex-shrink-0">
                {count}
              </span>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
