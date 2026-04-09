'use client'

import { useQuery } from '@tanstack/react-query'
import { PLAN_LABELS, PLAN_HEX_COLORS, PLAN_PRICE_VALUES } from '@/lib/constants/admin-ui'
import { formatBRLValue } from '@/lib/utils/format'

interface FinancialData {
  mrr: number
  planDistribution: Record<string, number>
}

interface SubscriptionsData {
  byStatus: Record<string, number>
}

interface SubscriptionMetrics {
  byPlan: {
    CRAQUE: { active: number; churnRate: number }
    LENDA: { active: number; churnRate: number }
  }
}

const PLAN_COLORS = PLAN_HEX_COLORS
const PLAN_PRICES = PLAN_PRICE_VALUES

const formatBRL = formatBRLValue

async function fetchMetrics() {
  const res = await fetch('/api/v1/admin/subscriptions/metrics', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed')
  const { data } = await res.json()
  return data as SubscriptionMetrics
}

export function FinanceiroAssinaturas({
  financial,
  subscriptions,
}: {
  financial: FinancialData
  subscriptions: SubscriptionsData
}) {
  const { data: metrics } = useQuery({
    queryKey: ['subscription-metrics'],
    queryFn: fetchMetrics,
    staleTime: 60_000,
  })

  const planCounts = financial.planDistribution

  // Usa dados reais de metrics se disponível
  const plans = ['LENDA', 'CRAQUE'].map((plan) => {
    const count = planCounts[plan] || 0
    const price = PLAN_PRICES[plan] || 0
    const mrr = count * price
    const arr = mrr * 12
    const churnRate = metrics?.byPlan[plan as keyof typeof metrics.byPlan]?.churnRate ?? 0
    const ticketMedio = count > 0 ? mrr / count : 0

    return {
      plan,
      count,
      mrr,
      arr,
      churnRate,
      ticketMedio,
    }
  })

  return (
    <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4">
      <div className="text-xs font-semibold text-[#929AA5] uppercase tracking-wide mb-4">MRR Por Plano</div>

      <div className="space-y-3">
        {plans.map(({ plan, count, mrr, arr, churnRate, ticketMedio }) => (
          <div key={plan} className="bg-[#0B0E11]/50 border border-[rgba(240,185,11,.08)] rounded-lg p-3">
            {/* Header */}
            <div className="flex justify-between mb-3">
              <div>
                <div className="text-sm font-bold" style={{ color: PLAN_COLORS[plan] }}>
                  {PLAN_LABELS[plan]}
                </div>
                <div className="text-[9px] text-[#929AA5] mt-0.5">{count} assinantes</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-[#EAECEF] font-mono">R${formatBRL(mrr)}/mês</div>
                <div className="text-[9px] text-[#929AA5] mt-0.5">R${formatBRL(arr)}/ano</div>
              </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-[#1E2329]/50 rounded border border-[rgba(240,185,11,.08)] p-2 text-center">
                <div className="text-[9px] text-[#929AA5] mb-1">Churn</div>
                <div
                  className="text-sm font-bold font-mono"
                  style={{ color: churnRate > 5 ? '#FF7A45' : '#2EBD85' }}
                >
                  {churnRate}%
                </div>
              </div>
              <div className="bg-[#1E2329]/50 rounded border border-[rgba(240,185,11,.08)] p-2 text-center">
                <div className="text-[9px] text-[#929AA5] mb-1">Ticket Médio</div>
                <div className="text-sm font-bold font-mono text-[#EAECEF]">R${ticketMedio.toFixed(2)}</div>
              </div>
              <div className="bg-[#1E2329]/50 rounded border border-[rgba(240,185,11,.08)] p-2 text-center">
                <div className="text-[9px] text-[#929AA5] mb-1">MRR</div>
                <div className="text-sm font-bold font-mono text-[#2EBD85]">R${formatBRL(mrr)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Subscription Status Summary */}
      <div className="mt-5 pt-4 border-t border-[rgba(240,185,11,.08)]">
        <div className="text-xs font-semibold text-[#929AA5] uppercase tracking-wide mb-3">Status de Assinaturas</div>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-[#0B0E11]/50 rounded p-2 border border-[rgba(52,211,153,.2)]">
            <div className="text-[9px] text-[#929AA5]">ATIVAS</div>
            <div className="text-lg font-bold text-[#2EBD85]">{subscriptions.byStatus.ACTIVE || 0}</div>
          </div>
          <div className="bg-[#0B0E11]/50 rounded p-2 border border-[rgba(246,70,93,.2)]">
            <div className="text-[9px] text-[#929AA5]">CANCELADAS</div>
            <div className="text-lg font-bold text-[#F6465D]">{subscriptions.byStatus.CANCELLED || 0}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
