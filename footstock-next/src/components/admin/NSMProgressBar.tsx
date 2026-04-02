import { cn } from '@/lib/utils'

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
      className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4"
      title="North Star Metric — alcançar 500 ordens/dia valida a viabilidade da plataforma"
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-[#929AA5]">North Star Metric: {target} ordens/dia em 3 meses</span>
        {metaAtingida && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            Meta atingida!
          </span>
        )}
      </div>

      <div
        className="h-2.5 w-full rounded-full bg-zinc-800 overflow-hidden mt-2"
        role="progressbar"
        aria-valuenow={ordersToday}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-label={`Progresso da meta NSM: ${ordersToday} de ${target} ordens, ${percentDisplay}%`}
      >
        <div
          className={cn('h-full rounded-full transition-all duration-500', barColor)}
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="flex items-center justify-between mt-1.5">
        <span className="text-sm font-medium text-[#c5b99a]">
          {ordersToday} / {target} ordens hoje
        </span>
        <span className="text-sm font-semibold text-[#F0B90B]">{percentDisplay}%</span>
      </div>
    </div>
  )
}
