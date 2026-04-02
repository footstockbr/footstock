'use client'
// ============================================================================
// Foot Stock — NSMProgressBar
// Barra de progresso da North Star Metric (500 ordens/dia).
// Rastreabilidade: INT-085, TASK-2/ST004
// ============================================================================

import { cn } from '@/lib/utils/cn'

interface NSMProgressBarProps {
  ordersToday: number
  target?: number
}

export function NSMProgressBar({ ordersToday, target = 500 }: NSMProgressBarProps) {
  const percent = Math.min((ordersToday / target) * 100, 100)
  const percentDisplay = percent.toFixed(1)
  const metaAtingida = ordersToday >= target

  const barColor =
    percent < 25
      ? 'bg-red-500'
      : percent < 50
      ? 'bg-orange-500'
      : percent < 75
      ? 'bg-yellow-500'
      : 'bg-emerald-500'

  return (
    <div
      className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
      title="North Star Metric — 500 ordens/dia valida a viabilidade da plataforma"
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs text-zinc-500">North Star Metric: {target} ordens/dia em 3 meses</span>
        {metaAtingida && (
          <span className="rounded border border-emerald-500/30 bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-400">
            Meta atingida!
          </span>
        )}
      </div>

      <div
        className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-zinc-800"
        role="progressbar"
        aria-valuenow={ordersToday}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-label={`Progresso NSM: ${ordersToday} de ${target} ordens, ${percentDisplay}%`}
      >
        <div
          className={cn('h-full rounded-full transition-all duration-500', barColor)}
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-300">
          {ordersToday} / {target} ordens hoje
        </span>
        <span className="text-sm font-semibold text-[#F0B90B]">{percentDisplay}%</span>
      </div>
    </div>
  )
}
