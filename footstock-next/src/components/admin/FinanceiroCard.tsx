'use client'

import { CreditCard } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { formatBRL } from '@/lib/utils/format'
import type { FinancialMetricsDTO } from '@/lib/types/admin'
import { getGatewayMeta, PLAN_PRICE_VALUES } from '@/lib/constants/admin-ui'

interface FinanceiroCardProps {
  data: FinancialMetricsDTO | null
  isLoading: boolean
}

export function FinanceiroCard({ data, isLoading }: FinanceiroCardProps) {

  if (isLoading) {
    return (
      <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4 space-y-4">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-[#F0B90B]" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-4 w-32" />
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-7 rounded" />
          ))}
        </div>
      </div>
    )
  }

  const totalRevenue = data?.revenueByGateway?.reduce((sum, g) => sum + g.revenue, 0) ?? 0
  const planCounts = data?.planDistribution ?? {}
  const totalPaidSubscribers = (planCounts.CRAQUE ?? 0) + (planCounts.LENDA ?? 0)
  const hasPaymentMethods = data?.revenueByGateway && data.revenueByGateway.length > 0

  return (
    <div data-testid="section-financeiro" className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <CreditCard className="h-4 w-4 text-[#F0B90B]" />
        <h3 className="text-xs font-bold text-[#929AA5] uppercase tracking-wider">Financeiro</h3>
      </div>

      {/* KPI Grid: Receita Total/Mês + Volume 24H (side-by-side) */}
      <div className="grid grid-cols-2 gap-3 mb-2">
        <div className="bg-[#181A20] rounded-lg p-3">
          <p className="text-[10px] text-[#929AA5] uppercase tracking-wide mb-1">Receita Total/Mês</p>
          <p className="text-xl font-extrabold text-[#2EBD85]" style={{ fontSize: '20px' }}>{formatBRL(data?.mrr ?? 0)}</p>
          <p className="text-[10px] text-[#929AA5] mt-1">{totalPaidSubscribers} assinantes pagos</p>
        </div>

        <div className="bg-[#181A20] rounded-lg p-3">
          <p className="text-[10px] text-[#929AA5] uppercase tracking-wide mb-1">Volume 24H</p>
          <p className="text-xl font-extrabold text-[#009EE3]" style={{ fontSize: '20px' }}>
            {formatVolume24h(data?.volume24h ?? 0)}
          </p>
          <p className="text-[10px] text-[#929AA5] mt-1">cotas negociadas</p>
        </div>
      </div>

      {/* MRR by Plan - linha simples */}
      {data?.planDistribution && (
        <div>
          {[
            { key: 'LENDA', label: '👑 Lenda', color: '#F0B90B' },
            { key: 'CRAQUE', label: '⭐ Craque', color: '#6c63ff' },
          ].map(({ key, label, color }) => {
            const count = planCounts[key] ?? 0
            const price = PLAN_PRICE_VALUES[key] ?? 0
            const mrrValue = count * price
            return (
              <div
                key={key}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '6px 0',
                  borderTop: '1px solid rgba(240,185,11,.08)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color }}>{label}</span>
                  <span style={{ fontSize: '9px', color: '#929AA5' }}>{count} assinante{count !== 1 ? 's' : ''}</span>
                </div>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#fff', fontFamily: 'monospace' }}>
                  {formatBRL(mrrValue)}/mês
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Métodos de Pagamento */}
      <div>
        <p className="text-[10px] font-bold text-[#929AA5] uppercase tracking-wider mb-3">
          Métodos de Pagamento
        </p>
        {hasPaymentMethods ? (
          <div className="space-y-3">
            {data!.revenueByGateway!.map((gw) => {
              const meta = getGatewayMeta(gw.gateway)
              const pct = totalRevenue > 0 ? Math.round((gw.revenue / totalRevenue) * 100) : 0
              return (
                <div key={gw.gateway}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '11px', color: '#fff', fontWeight: 600 }}>
                        {meta.label}
                      </span>
                    </div>
                    <div>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: meta.color, fontFamily: 'monospace' }}>
                        {pct}%
                      </span>
                      <span style={{ fontSize: '9px', color: '#929AA5', fontFamily: 'monospace', marginLeft: '6px' }}>
                        {formatBRL(gw.revenue)}
                      </span>
                    </div>
                  </div>
                  <div style={{ height: '4px', borderRadius: '8px', background: '#2B2F36', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        borderRadius: '8px',
                        width: `${pct}%`,
                        background: meta.color,
                        transition: 'all 0.5s ease',
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-[10px] text-[#929AA5] italic">Sem pagamentos neste período</p>
        )}
      </div>
    </div>
  )
}

function formatVolume24h(volume: number): string {
  if (volume >= 1_000_000) {
    return (volume / 1_000_000).toFixed(1) + 'M'
  }
  if (volume >= 1_000) {
    return (volume / 1_000).toFixed(1) + 'k'
  }
  return volume.toString()
}
