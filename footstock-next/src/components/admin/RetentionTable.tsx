import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { CohortWeek } from '@/lib/types/admin'

interface RetentionTableProps {
  cohortData: CohortWeek[]
  isLoading: boolean
}

function cellClass(v: number): string {
  if (v === 0) return 'bg-slate-700/30 text-slate-500'
  if (v > 60) return 'bg-emerald-500/20 text-emerald-400'
  if (v >= 40) return 'bg-yellow-500/20 text-yellow-400'
  return 'bg-red-500/20 text-red-400'
}

export function RetentionTable({ cohortData, isLoading }: RetentionTableProps) {
  if (isLoading) {
    return (
      <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4">
        <Skeleton className="h-5 w-40 mb-4" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full mb-2" />
        ))}
      </div>
    )
  }

  if (cohortData.length === 0) {
    return (
      <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4">
        <h3 className="text-sm font-semibold text-[#EAECEF] mb-3">Cohort de Retenção</h3>
        <div className="text-center py-8 text-[#929AA5] text-sm">
          Sem dados de cohort ainda. Continue acumulando usuários ativos.
        </div>
      </div>
    )
  }

  return (
    <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4">
      <h3 className="text-sm font-semibold text-[#EAECEF] mb-3">Cohort de Retenção Semanal</h3>

      <div className="overflow-x-auto rounded-lg">
        <table className="w-full min-w-[480px] text-xs">
          <thead>
            <tr className="text-[#929AA5] border-b border-[rgba(240,185,11,.08)]">
              <th className="text-left py-2 px-2 font-medium">Semana</th>
              <th className="text-center py-2 px-2 font-medium">Novos</th>
              <th className="text-center py-2 px-2 font-medium">Sem 1</th>
              <th className="text-center py-2 px-2 font-medium">Sem 2</th>
              <th className="text-center py-2 px-2 font-medium">Sem 3</th>
              <th className="text-center py-2 px-2 font-medium">Sem 4</th>
            </tr>
          </thead>
          <tbody>
            {cohortData.map((row) => (
              <tr key={row.weekLabel} className="border-b border-[rgba(240,185,11,.06)] last:border-0">
                <td className="py-2.5 px-2 text-[#c5b99a]">{row.weekLabel}</td>
                <td className="py-2.5 px-2 text-center text-[#EAECEF] font-medium">{row.newUsers}</td>
                {([row.week1, row.week2, row.week3, row.week4] as number[]).map((v, i) => (
                  <td key={i} className="py-2.5 px-2 text-center">
                    <span className={cn('inline-block px-2 py-0.5 rounded text-[11px] font-medium', cellClass(v))}>
                      {v}%
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-[#929AA5] mt-3">
        Os dados de cohort são aproximados com base em ordens executadas
      </p>
    </div>
  )
}
