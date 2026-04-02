'use client'
// ============================================================================
// Foot Stock — /admin/engajamento (Métricas de Engajamento)
// DAU/WAU/MAU, gráfico histórico, cohort de retenção.
// Rastreabilidade: INT-088, TASK-4/ST006
// ============================================================================

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api/client'
import { AdminBreadcrumb } from '@/components/admin/AdminBreadcrumb'
import { EngagementMetrics } from '@/components/admin/EngagementMetrics'
import { RetentionTable } from '@/components/admin/RetentionTable'
import { canAccess } from '@/lib/auth/canAccess'
import type { AdminRole } from '@/lib/enums'
import type { EngagementMetricsDTO, EngagementDayPoint, CohortWeek } from '@/lib/types/admin'
import { ADMIN_POLL_SLOW_MS } from '@/lib/constants/timing'

export default function AdminEngagementPage() {
  const router = useRouter()
  const [isAuthorizing, setIsAuthorizing] = useState(true)
  const [metrics, setMetrics] = useState<EngagementMetricsDTO | null>(null)
  const [history, setHistory] = useState<EngagementDayPoint[]>([])
  const [cohort, setCohort] = useState<CohortWeek[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function verifyRole() {
      try {
        const res = await apiClient.get('/api/v1/admin/session/verify')
        const json = res.data as { adminRole?: AdminRole }
        if (!json.adminRole || !canAccess(json.adminRole, 'forum:moderate')) {
          router.replace('/admin')
          return false
        }
        return true
      } catch {
        router.replace('/admin/login')
        return false
      } finally {
        setIsAuthorizing(false)
      }
    }

    async function fetchData() {
      setIsLoading(true)
      setError(null)
      try {
        const [mRes, hRes, cRes] = await Promise.all([
          apiClient.get('/api/v1/admin/engagement'),
          apiClient.get('/api/v1/admin/engagement/history?days=30'),
          apiClient.get('/api/v1/admin/engagement/cohort'),
        ])

        setMetrics(mRes.data.data)
        setHistory(hRes.data.data)
        setCohort(cRes.data.data)
      } catch {
        setError('Não foi possível carregar as métricas de engajamento.')
      } finally {
        setIsLoading(false)
      }
    }

    let interval: ReturnType<typeof setInterval> | null = null
    void (async () => {
      const ok = await verifyRole()
      if (!ok) return
      await fetchData()
      interval = setInterval(fetchData, ADMIN_POLL_SLOW_MS)
    })()
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [router])

  if (isAuthorizing) {
    return (
      <div className="space-y-6">
        <div className="skeleton h-6 w-40 rounded" aria-hidden="true" />
        <div className="skeleton h-24 w-full rounded-xl" aria-hidden="true" />
        <div className="skeleton h-64 w-full rounded-xl" aria-hidden="true" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <AdminBreadcrumb />

      <div>
        <h1 className="text-lg font-semibold text-zinc-100">Engajamento</h1>
        <p className="mt-0.5 text-sm text-zinc-500">
          Métricas de usuários ativos, retenção e movimentações na plataforma.
        </p>
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-red-800/50 bg-red-900/20 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <EngagementMetrics data={metrics} history={history} isLoading={isLoading} />

      <RetentionTable cohortData={cohort} isLoading={isLoading} />
    </div>
  )
}
