'use client'
// ============================================================================
// Foot Stock — FansByPlan
// Donut chart com distribuição de fãs por plano + legenda detalhada.
// Rastreabilidade: INT-084, US-025, TASK-2/ST003
// ============================================================================

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import type { FansByPlan } from '@/types/club'

interface FansByPlanProps {
  fansByPlan: FansByPlan | undefined
}

const PLAN_COLORS: Record<string, string> = {
  Jogador: '#374151',
  Craque: '#C9A84C',
  Lenda: '#8B5E3C',
}

const ptBR = new Intl.NumberFormat('pt-BR')

export function FansByPlanChart({ fansByPlan }: FansByPlanProps) {
  if (!fansByPlan) {
    return (
      <div className="flex flex-col gap-3">
        <div className="skeleton h-5 w-48 rounded" />
        <Skeleton className="mx-auto h-[200px] w-[200px] rounded-full" />
      </div>
    )
  }

  const total = fansByPlan.JOGADOR + fansByPlan.CRAQUE + fansByPlan.LENDA
  const isEmpty = total === 0

  if (isEmpty) {
    return (
      <div className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold text-zinc-100">Fãs por Plano de Assinatura</h3>
        <EmptyState title="Nenhum torcedor com plano pago" />
      </div>
    )
  }

  const data = [
    { name: 'Jogador', value: fansByPlan.JOGADOR },
    { name: 'Craque', value: fansByPlan.CRAQUE },
    { name: 'Lenda', value: fansByPlan.LENDA },
  ]

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-lg font-semibold text-zinc-100">Fãs por Plano de Assinatura</h3>

      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            dataKey="value"
            role="img"
            aria-label="Distribuição de fãs por plano"
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={PLAN_COLORS[entry.name]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) => [
              `${ptBR.format(value as number)} (${total > 0 ? Math.round((value as number / total) * 100) : 0}%)`,
            ]}
            contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }}
            labelStyle={{ color: '#d4d4d8' }}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* Legenda */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-4">
        {data.map((entry) => {
          const pct = total > 0 ? Math.round((entry.value / total) * 100) : 0
          return (
            <div key={entry.name} className="flex items-center gap-2 text-sm">
              <span
                className="h-3 w-3 flex-shrink-0 rounded-full"
                style={{ background: PLAN_COLORS[entry.name] }}
              />
              <span className="text-zinc-300">{entry.name}</span>
              <span className="text-zinc-500">
                {ptBR.format(entry.value)} ({pct}%)
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
