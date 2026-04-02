// ============================================================================
// Foot Stock — RetentionTable
// Tabela de coorte de retenção semanal com células color-coded.
// Rastreabilidade: INT-088, TASK-4/ST005
// ============================================================================

import { cn } from '@/lib/utils/cn'
import type { CohortWeek } from '@/lib/types/admin'

interface RetentionTableProps {
  cohortData: CohortWeek[]
  isLoading: boolean
}

function cellClass(v: number): string {
  if (v === 0) return 'bg-zinc-800/60 text-zinc-500'
  if (v > 60) return 'bg-emerald-500/20 text-emerald-400'
  if (v >= 40) return 'bg-yellow-500/20 text-yellow-400'
  return 'bg-red-500/20 text-red-400'
}

export function RetentionTable({ cohortData, isLoading }: RetentionTableProps) {
  if (isLoading) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="skeleton mb-4 h-5 w-40 rounded" aria-hidden="true" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton mb-2 h-9 w-full rounded" aria-hidden="true" />
        ))}
      </div>
    )
  }

  if (cohortData.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <h3 className="mb-3 text-sm font-semibold text-zinc-100">Cohort de Retenção</h3>
        <div className="py-8 text-center text-sm text-zinc-500">
          Sem dados de cohort ainda. Continue acumulando usuários ativos.
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <h3 className="mb-3 text-sm font-semibold text-zinc-100">Cohort de Retenção Semanal</h3>

      <div className="overflow-x-auto rounded-lg">
        <table
          className="w-full min-w-[480px] text-xs"
          aria-label="Tabela de coorte de retenção semanal"
        >
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-500">
              <th className="px-2 py-2 text-left font-medium">Semana</th>
              <th className="px-2 py-2 text-center font-medium">Novos</th>
              <th className="px-2 py-2 text-center font-medium">Sem 1</th>
              <th className="px-2 py-2 text-center font-medium">Sem 2</th>
              <th className="px-2 py-2 text-center font-medium">Sem 3</th>
              <th className="px-2 py-2 text-center font-medium">Sem 4</th>
            </tr>
          </thead>
          <tbody>
            {cohortData.map(row => (
              <tr key={row.weekLabel} className="border-b border-zinc-800/50 last:border-0">
                <td className="px-2 py-2.5 text-zinc-300">{row.weekLabel}</td>
                <td className="px-2 py-2.5 text-center font-medium text-zinc-100">{row.newUsers}</td>
                {([row.week1, row.week2, row.week3, row.week4] as number[]).map((v, i) => (
                  <td key={i} className="px-2 py-2.5 text-center">
                    <span
                      className={cn(
                        'inline-block rounded px-2 py-0.5 text-[11px] font-medium',
                        cellClass(v)
                      )}
                    >
                      {v}%
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11px] text-zinc-600">
        Dados aproximados — baseados em ordens executadas (sem tabela de sessões real)
      </p>
    </div>
  )
}
