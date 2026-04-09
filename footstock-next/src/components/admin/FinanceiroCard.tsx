'use client'

import { CreditCard, Lock } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { formatBRL } from '@/lib/utils/format'
import type { AdminUserInfo } from '@/lib/auth'

interface FinanceiroData {
  mrr: number
  planDistribution: Record<string, number>
  revenueByGateway: { gateway: string; revenue: number }[]
}

interface FinanceiroCardProps {
  data: FinanceiroData | null
  isLoading: boolean
}

const GATEWAY_META: Record<string, { label: string; color: string; icon: string }> = {
  stripe: { label: 'Stripe', color: '#635BFF', icon: '💳' },
  mercadopago: { label: 'Mercado Pago', color: '#009EE3', icon: '💰' },
  pix: { label: 'PIX', color: '#00D4FF', icon: '🏦' },
  manual: { label: 'Manual', color: '#929AA5', icon: '✋' },
}

const PLAN_META: Record<string, { label: string; color: string; icon: string }> = {
  LENDA: { label: 'Lenda', color: '#F0B90B', icon: '👑' },
  CRAQUE: { label: 'Craque', color: '#6c63ff', icon: '⭐' },
  JOGADOR: { label: 'Jogador', color: '#929AA5', icon: '⚡' },
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
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-7 rounded" />
          ))}
        </div>
      </div>
    )
  }

  const totalRevenue = data?.revenueByGateway.reduce((sum, g) => sum + g.revenue, 0) ?? 0
  const planCounts = data?.planDistribution ?? {}
  const totalPaidSubscribers = (planCounts.CRAQUE ?? 0) + (planCounts.LENDA ?? 0)

  return (
    <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <CreditCard className="h-4 w-4 text-[#F0B90B]" />
        <h3 className="text-xs font-bold text-[#929AA5] uppercase tracking-wider">Financeiro</h3>
      </div>

      {/* KPI Grid: MRR and Paid Subscribers */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#181A20] rounded-lg p-3">
          <p className="text-[10px] text-[#929AA5] uppercase tracking-wide mb-1">Receita Total/Mês</p>
          <p className="text-lg font-extrabold text-[#2EBD85]">{formatBRL(data?.mrr ?? 0)}</p>
          <p className="text-[10px] text-[#929AA5] mt-1">{totalPaidSubscribers} assinantes pagos</p>
        </div>

        <div className="bg-[#181A20] rounded-lg p-3">
          <p className="text-[10px] text-[#929AA5] uppercase tracking-wide mb-1">Gateway Status</p>
          <p className="text-lg font-extrabold text-[#929AA5]">
            {(data?.revenueByGateway?.length ?? 0) > 0 ? data.revenueByGateway.length : '0'}
          </p>
          <p className="text-[10px] text-[#929AA5] mt-1">gateways ativos</p>
        </div>
      </div>

      {/* MRR by Plan */}
      {data?.planDistribution && (
        <div>
          <p className="text-[10px] font-bold text-[#929AA5] uppercase tracking-wider mb-3">
            MRR por Plano
          </p>
          <div className="space-y-2.5">
            {Object.entries(PLAN_META).map(([planKey, { label, color, icon }]) => {
              const count = data.planDistribution[planKey] ?? 0
              const mrrValue = (count * getPlanPrice(planKey))
              if (count === 0) return null
              return (
                <div key={planKey} className="flex justify-between items-center py-2 border-t border-[rgba(240,185,11,.06)]">
                  <div className="flex items-center gap-2">
                    <span style={{ color }}>{icon}</span>
                    <span className="text-[11px] font-bold" style={{ color }}>
                      {label}
                    </span>
                    <span className="text-[10px] text-[#929AA5]">{count} assinante{count !== 1 ? 's' : ''}</span>
                  </div>
                  <span className="text-[11px] font-bold font-mono" style={{ color }}>
                    {formatBRL(mrrValue)}/mês
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Payment Methods */}
      {data?.revenueByGateway && data.revenueByGateway.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-[#929AA5] uppercase tracking-wider mb-3">
            Métodos de Pagamento
          </p>
          <div className="space-y-2.5">
            {data.revenueByGateway.map((gw) => {
              const meta = GATEWAY_META[gw.gateway] ?? { label: gw.gateway, color: '#929AA5', icon: '💳' }
              const pct = totalRevenue > 0 ? Math.round((gw.revenue / totalRevenue) * 100) : 0
              return (
                <div key={gw.gateway} className="py-2 border-t border-[rgba(240,185,11,.06)] last:border-0">
                  <div className="flex justify-between items-center mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{meta.icon}</span>
                      <span className="text-[11px] font-bold text-[#EAECEF]">{meta.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-bold" style={{ color: meta.color }}>
                        {pct}%
                      </span>
                      <span className="text-[9px] text-[#929AA5] font-mono">
                        {formatBRL(gw.revenue)}
                      </span>
                    </div>
                  </div>
                  <div className="h-1 rounded-full bg-[#2B2F36] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, background: meta.color }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// Helper to get plan prices
function getPlanPrice(plan: string): number {
  const prices: Record<string, number> = {
    JOGADOR: 0,
    CRAQUE: 19.9,
    LENDA: 39.9,
  }
  return prices[plan] ?? 0
}
