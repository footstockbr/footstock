'use client'

import type { GatewayConfig } from '@/lib/types/admin'
import { PLAN_LABELS, PLAN_HEX_COLORS, PLAN_PRICE_VALUES, getGatewayMeta } from '@/lib/constants/admin-ui'
import { formatBRLValue } from '@/lib/utils/format'

interface FinancialData {
  mrr: number
  arr: number
  planDistribution: Record<string, number>
  revenueByGateway: Array<{ gateway: string; revenue: number }>
}

interface GatewayData {
  gateways: GatewayConfig[]
}

const PLAN_COLORS = PLAN_HEX_COLORS
const formatBRL = formatBRLValue

export function FinanceiroResume({ financial, gateways }: { financial: FinancialData; gateways: GatewayData }) {
  const planCounts = financial.planDistribution

  // Receita estimada por plano. FIX-12: preço unitário vem da SSoT
  // (PLAN_PRICE_VALUES deriva de PLAN_AMOUNTS_CENTS), nunca hardcoded.
  const mrrByPlan = {
    CRAQUE: (planCounts.CRAQUE || 0) * PLAN_PRICE_VALUES.CRAQUE,
    LENDA: (planCounts.LENDA || 0) * PLAN_PRICE_VALUES.LENDA,
  }

  const activeGateways = gateways.gateways.filter(g => g.active)
  const totalRevenue = financial.mrr

  return (
    <div className="space-y-4">
      {/* RECEITA RECORRENTE */}
      <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4">
        <div className="text-xs font-semibold text-[#929AA5] uppercase tracking-wide mb-2">Receita Recorrente</div>
        <div className="text-3xl font-extrabold text-[#2EBD85] font-mono mb-2">R${formatBRL(financial.mrr)}</div>
        <div className="text-xs text-[#929AA5] mb-4">ARR estimado: R${formatBRL(financial.arr)}</div>

        {/* Plan breakdown */}
        <div className="space-y-2">
          {Object.entries(mrrByPlan).map(([plan, mrr]) => (
            <div key={plan} className="flex justify-between items-center py-2 border-t border-[rgba(240,185,11,.08)]">
              <div className="flex items-center gap-2">
                <div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: PLAN_COLORS[plan] }}
                />
                <span className="text-xs font-bold" style={{ color: PLAN_COLORS[plan] }}>
                  {PLAN_LABELS[plan]}
                </span>
                <span className="text-[9px] text-[#929AA5]">{planCounts[plan] || 0} assinantes</span>
              </div>
              <span className="text-xs font-bold text-[#EAECEF] font-mono">R${formatBRL(mrr)}/mês</span>
            </div>
          ))}
        </div>
      </div>

      {/* GATEWAYS ATIVOS */}
      {activeGateways.length > 0 && (
        <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4">
          <div className="text-xs font-semibold text-[#929AA5] uppercase tracking-wide mb-3">Gateways Ativos</div>

          <div className="space-y-3">
            {activeGateways.map((gateway) => {
              // Calculate percentage based on simple distribution
              const pct = Math.round((activeGateways.length > 1 ? 100 / activeGateways.length : 100))
              const revenue = totalRevenue * (pct / 100)
              const emoji = getGatewayMeta(gateway.code).emoji

              return (
                <div key={gateway.code} className="flex justify-between items-center p-3 bg-[#0B0E11]/50 rounded-lg border border-[rgba(240,185,11,.08)]">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-6 h-6 rounded-md flex items-center justify-center text-sm"
                      style={{ backgroundColor: `${gateway.color}22`, borderColor: `${gateway.color}44`, borderWidth: '1px' }}
                    >
                      {emoji}
                    </div>
                    <span className="text-xs font-bold text-[#EAECEF]">{gateway.name}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold" style={{ color: gateway.color }}>
                      {pct}%
                    </div>
                    <div className="text-[9px] text-[#929AA5] font-mono">R${formatBRL(revenue)}/mês</div>
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
