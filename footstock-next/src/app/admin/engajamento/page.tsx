'use client'

import { useQuery } from '@tanstack/react-query'
import { AdminBreadcrumb } from '@/components/admin/AdminBreadcrumb'
import { EngagementDashboard } from '@/components/admin/EngagementDashboard'
import { RetentionTable } from '@/components/admin/RetentionTable'
import type { EngagementMetricsDTO, CohortWeek } from '@/lib/types/admin'

async function fetchEngagement(): Promise<EngagementMetricsDTO> {
  const res = await fetch('/api/v1/admin/engagement')
  if (!res.ok) throw new Error('Failed')
  const { data } = await res.json()
  return data
}

async function fetchCohort(): Promise<CohortWeek[]> {
  const res = await fetch('/api/v1/admin/engagement/cohort')
  if (!res.ok) throw new Error('Failed')
  const { data } = await res.json()
  return data
}

export default function AdminEngajamentoPage() {
  const { data: engagement, isLoading: loadingEng } = useQuery({
    queryKey: ['admin-engagement'],
    queryFn: fetchEngagement,
    staleTime: 300_000,
    refetchInterval: 300_000,
  })

  const { data: cohort = [], isLoading: loadingCohort } = useQuery({
    queryKey: ['cohort'],
    queryFn: fetchCohort,
    staleTime: 3_600_000,
  })

  return (
    <div className="p-4 md:p-6 space-y-5" data-testid="page-admin-engajamento">
      <AdminBreadcrumb />

      <div data-testid="admin-engajamento-header">
        <h1 className="text-xl font-bold text-[#EAECEF]">Engajamento</h1>
        <p className="text-xs text-[#929AA5] mt-0.5">Acessos, permanência e movimentação FS$</p>
      </div>

      <div data-testid="admin-engajamento-stats">
        <EngagementDashboard data={engagement ?? null} isLoading={loadingEng} />

        <RetentionTable cohortData={cohort} isLoading={loadingCohort} />
      </div>
    </div>
  )
}
