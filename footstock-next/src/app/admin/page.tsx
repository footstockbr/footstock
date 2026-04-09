'use client'

import { useQuery } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { AdminBreadcrumb } from '@/components/admin/AdminBreadcrumb'
import { KPICards } from '@/components/admin/KPICards'
import { NSMProgressBar } from '@/components/admin/NSMProgressBar'
import { RevenueChart } from '@/components/admin/RevenueChart'
import { UserStatsCard } from '@/components/admin/UserStatsCard'
import { FinanceiroCard } from '@/components/admin/FinanceiroCard'
import { EngagementCard } from '@/components/admin/EngagementCard'
import type { AdminDashboardDTO, RevenueDayPoint, EngagementMetricsDTO } from '@/lib/types/admin'

async function fetchDashboard(): Promise<AdminDashboardDTO> {
  const res = await fetch('/api/v1/admin/dashboard', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed')
  const { data } = await res.json()
  return data
}

async function fetchRevenue(): Promise<RevenueDayPoint[]> {
  const res = await fetch('/api/v1/admin/revenue-history?days=30', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed')
  const { data } = await res.json()
  return data
}

async function fetchFinancial() {
  const res = await fetch('/api/v1/admin/financial', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed')
  const { data } = await res.json()
  return data
}

async function fetchEngagement(): Promise<EngagementMetricsDTO> {
  const res = await fetch('/api/v1/admin/engagement', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed')
  const { data } = await res.json()
  return data
}


export default function AdminDashboardPage() {
  const {
    data: dashboard,
    isLoading: loadingDash,
    dataUpdatedAt,
    refetch,
  } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: fetchDashboard,
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  const { data: revenue = [], isLoading: loadingRevenue } = useQuery({
    queryKey: ['revenue-history'],
    queryFn: fetchRevenue,
    staleTime: 300_000,
  })

  const { data: financial, isLoading: loadingFinancial } = useQuery({
    queryKey: ['admin-financial'],
    queryFn: fetchFinancial,
    staleTime: 120_000,
  })

  const { data: engagement, isLoading: loadingEngagement } = useQuery({
    queryKey: ['admin-engagement'],
    queryFn: fetchEngagement,
    staleTime: 120_000,
  })

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="p-4 md:p-6 space-y-5">
      <AdminBreadcrumb />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#EAECEF]">Dashboard</h1>
          <p className="text-xs text-[#929AA5] mt-0.5">Visão geral do sistema em tempo real</p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-[#929AA5]">Atualizado às {lastUpdated}</span>
          )}
          <button
            onClick={() => refetch()}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-[#929AA5] hover:text-[#F0B90B] hover:bg-[rgba(240,185,11,.08)] transition-colors"
            title="Atualizar"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* KPIs */}
      <KPICards data={dashboard ?? null} isLoading={loadingDash} />

      {/* NSM + Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3">
          <RevenueChart data={revenue} isLoading={loadingRevenue} />
        </div>
        <div className="lg:col-span-2 space-y-4">
          <NSMProgressBar
            ordersToday={dashboard?.ordersVsTarget.today ?? 0}
            target={dashboard?.ordersVsTarget.target ?? 500}
          />

          {/* Top Assets */}
          {dashboard?.topAssets && dashboard.topAssets.length > 0 && (
            <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4">
              <h3 className="text-xs font-semibold text-[#929AA5] uppercase tracking-wider mb-3">
                Top Ativos (24h)
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[240px]">
                  <thead>
                    <tr className="text-[#929AA5] border-b border-[rgba(240,185,11,.08)]">
                      <th className="text-left py-1.5 font-medium">Ticker</th>
                      <th className="text-right py-1.5 font-medium">Volume</th>
                      <th className="text-right py-1.5 font-medium">Var%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.topAssets.map((a) => (
                      <tr key={a.ticker} className="border-b border-[rgba(240,185,11,.06)] last:border-0">
                        <td className="py-1.5 font-mono text-[#c5b99a]">{a.ticker}</td>
                        <td className="py-1.5 text-right text-[#929AA5]">{a.volume}</td>
                        <td className={`py-1.5 text-right font-medium ${a.priceChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {a.priceChange > 0 ? '+' : ''}{a.priceChange.toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dashboard Cards Section */}
      <div className="space-y-4">
        {/* User Stats Panel */}
        <UserStatsCard data={dashboard ?? null} isLoading={loadingDash} />

        {/* Financeiro Card */}
        <FinanceiroCard
          data={financial}
          isLoading={loadingFinancial}
        />

        {/* Engajamento Card */}
        <EngagementCard data={engagement ?? null} isLoading={loadingEngagement} />
      </div>
    </div>
  )
}
