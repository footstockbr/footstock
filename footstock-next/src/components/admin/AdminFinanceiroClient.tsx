'use client'

import { CreditCard, AlertTriangle, RefreshCw, Loader2 } from 'lucide-react'
import useSWR from 'swr'
import { MRRDashboard } from '@/components/admin/MRRDashboard'
import { SubscriptionStats } from '@/components/admin/SubscriptionStats'
import { GatewayConfig } from '@/components/admin/GatewayConfig'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function AdminFinanceiroClient() {
  const { data, error, isLoading, mutate } = useSWR('/api/v1/admin/financial', fetcher, {
    refreshInterval: 60_000,
  })

  const financial = data?.data

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#EAECEF] flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-[#F0B90B]" />
            Dashboard Financeiro
          </h1>
          <p className="text-sm text-[#929AA5] mt-0.5">MRR, ARR, churn e status dos gateways</p>
        </div>
        <button
          onClick={() => mutate()}
          disabled={isLoading}
          aria-label="Atualizar dados financeiros"
          className="h-9 w-9 flex items-center justify-center rounded-lg border border-[rgba(240,185,11,.18)] text-[#929AA5] hover:text-[#F0B90B] disabled:opacity-50 min-h-[44px] min-w-[44px]"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-[rgba(239,68,68,.08)] border border-[rgba(239,68,68,.2)] text-sm text-[#F6465D] mb-4" role="alert">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <span>Erro ao carregar dados financeiros.</span>
          <button onClick={() => mutate()} className="ml-auto text-xs underline hover:no-underline">
            Tentar novamente
          </button>
        </div>
      )}

      {isLoading && !financial && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#F0B90B]" />
        </div>
      )}

      {financial && (
        <div className="space-y-6">
          <MRRDashboard
            mrr={financial.mrr}
            arr={financial.arr}
            churnRate={financial.churnRate}
            newSubscriptions24h={financial.newSubscriptions24h}
            cancelledThisMonth={financial.cancelledThisMonth}
            cancelledPrevMonth={financial.cancelledPrevMonth}
            mrrHistory={financial.mrrHistory}
          />

          <SubscriptionStats
            planDistribution={financial.planDistribution}
            revenueByGateway={financial.revenueByGateway}
          />

          <GatewayConfig gatewayStatus={financial.gatewayStatus} />
        </div>
      )}
    </div>
  )
}
