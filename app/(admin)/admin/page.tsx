'use client'
// ============================================================================
// Foot Stock — /admin (Dashboard Principal)
// KPIs, NSM, gráfico de MRR, top ativos. Requer sessão admin.
// Rastreabilidade: INT-085, TASK-2/ST006
// ============================================================================

import { useEffect, useState } from 'react'
import { AdminBreadcrumb } from '@/components/admin/AdminBreadcrumb'
import { KPICards } from '@/components/admin/KPICards'
import { NSMProgressBar } from '@/components/admin/NSMProgressBar'
import { RevenueChart } from '@/components/admin/RevenueChart'
import { SystemStatus } from '@/components/admin/SystemStatus'
import type { AdminDashboardDTO, RevenueDayPoint } from '@/lib/types/admin'
import type { AdminRole } from '@/lib/enums'
import { canAccess } from '@/lib/auth/canAccess'
import { ADMIN_POLL_SLOW_MS } from '@/lib/constants/timing'

export default function AdminDashboardPage() {
  const [dashboard, setDashboard] = useState<AdminDashboardDTO | null>(null)
  const [revenue, setRevenue] = useState<RevenueDayPoint[]>([])
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const canViewUsers = adminRole ? canAccess(adminRole, 'users:read') : false
  const canViewFinancial = adminRole ? canAccess(adminRole, 'financial:read') : false
  const canViewMotor = adminRole ? canAccess(adminRole, 'motor:read') : false

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true)
      setError(null)
      try {
        const [sessionRes, dashRes] = await Promise.all([
          fetch('/api/v1/admin/session/verify'),
          fetch('/api/v1/admin/dashboard'),
        ])

        if (!sessionRes.ok || !dashRes.ok) {
          throw new Error('Falha ao carregar dados do dashboard.')
        }

        const sessionJson = (await sessionRes.json()) as { adminRole?: AdminRole }
        setAdminRole(sessionJson.adminRole ?? null)
        const dashJson = await dashRes.json()
        setDashboard(dashJson.data)

        if (sessionJson.adminRole && canAccess(sessionJson.adminRole, 'financial:read')) {
          const revRes = await fetch('/api/v1/admin/revenue-history?days=30')
          if (revRes.ok) {
            const revJson = await revRes.json()
            setRevenue(revJson.data)
          } else {
            setRevenue([])
          }
        } else {
          setRevenue([])
        }
      } catch {
        setError('Não foi possível carregar os dados. Tente novamente.')
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()

    // Recarregar a cada 5 minutos
    const interval = setInterval(fetchData, ADMIN_POLL_SLOW_MS)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="space-y-6">
      <AdminBreadcrumb />

      <div>
        <h1 className="text-lg font-semibold text-zinc-100">Dashboard</h1>
        <p className="mt-0.5 text-sm text-zinc-500">Visão geral da plataforma em tempo real.</p>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-red-800/50 bg-red-900/20 p-3 text-sm text-red-400"
        >
          {error}
        </div>
      )}

      <KPICards
        data={dashboard}
        isLoading={isLoading}
        canViewUsers={canViewUsers}
        canViewFinancial={canViewFinancial}
        canViewMotor={canViewMotor}
      />

      <NSMProgressBar
        ordersToday={dashboard?.ordersVsTarget.today ?? 0}
        target={dashboard?.ordersVsTarget.target ?? 500}
      />

      {canViewFinancial && <RevenueChart data={revenue} isLoading={isLoading} />}

      {canViewMotor && <SystemStatus />}

      {/* Top ativos */}
      {!isLoading && dashboard?.topAssets && dashboard.topAssets.length > 0 && (
        <section
          aria-label="Top 5 ativos por volume"
          className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
        >
          <h3 className="mb-3 text-sm font-semibold text-zinc-100">Top 5 Ativos — Volume 24h</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Tabela de ativos com maior volume">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                  <th className="pb-2 pr-4">Ticker</th>
                  <th className="pb-2 pr-4 text-right">Volume</th>
                  <th className="pb-2 text-right">Variação</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.topAssets.map(asset => (
                  <tr key={asset.ticker} className="border-b border-zinc-800/50 last:border-0">
                    <td className="py-2 pr-4 font-mono font-semibold text-zinc-100">
                      {asset.ticker}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums text-zinc-300">
                      {asset.volume}
                    </td>
                    <td
                      className={`py-2 text-right tabular-nums ${
                        asset.priceChange >= 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {asset.priceChange >= 0 ? '+' : ''}
                      {asset.priceChange.toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
