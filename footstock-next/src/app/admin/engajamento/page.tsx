'use client'

import { useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { AdminBreadcrumb } from '@/components/admin/AdminBreadcrumb'
import { EngagementMetrics } from '@/components/admin/EngagementMetrics'
import { RetentionTable } from '@/components/admin/RetentionTable'
import type { EngagementMetricsDTO, EngagementDayPoint, CohortWeek } from '@/lib/types/admin'

async function fetchEngagement(): Promise<EngagementMetricsDTO> {
  const res = await fetch('/api/v1/admin/engagement')
  if (!res.ok) throw new Error('Failed')
  const { data } = await res.json()
  return data
}

async function fetchHistory(): Promise<EngagementDayPoint[]> {
  const res = await fetch('/api/v1/admin/engagement/history?days=30')
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

function exportCSV(history: EngagementDayPoint[]) {
  const rows = ['date,dau,wau', ...history.map((h) => `${h.date},${h.dau},${h.wau ?? 0}`)]
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `engagement-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function AdminEngajamentoPage() {
  const { data: engagement, isLoading: loadingEng } = useQuery({
    queryKey: ['admin-engagement'],
    queryFn: fetchEngagement,
    staleTime: 300_000,
    refetchInterval: 300_000,
  })

  const { data: history = [], isLoading: loadingHist } = useQuery({
    queryKey: ['engagement-history'],
    queryFn: fetchHistory,
    staleTime: 300_000,
  })

  const { data: cohort = [], isLoading: loadingCohort } = useQuery({
    queryKey: ['cohort'],
    queryFn: fetchCohort,
    staleTime: 3_600_000,
  })

  return (
    <div className="p-4 md:p-6 space-y-5">
      <AdminBreadcrumb />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#EAECEF]">Engajamento de Usuários</h1>
          <p className="text-xs text-[#929AA5] mt-0.5">Atualizado a cada 5 minutos</p>
        </div>
        <button
          onClick={() => exportCSV(history)}
          disabled={history.length === 0}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-[rgba(240,185,11,.15)] text-[#929AA5] hover:text-[#F0B90B] hover:border-[rgba(240,185,11,.4)] transition-colors disabled:opacity-40"
        >
          <Download className="h-3.5 w-3.5" />
          Exportar CSV
        </button>
      </div>

      <EngagementMetrics
        data={engagement ?? null}
        history={history}
        isLoading={loadingEng || loadingHist}
      />

      <RetentionTable cohortData={cohort} isLoading={loadingCohort} />
    </div>
  )
}
