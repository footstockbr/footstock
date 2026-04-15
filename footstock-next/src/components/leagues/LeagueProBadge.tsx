import { cn } from '@/lib/utils'

interface Props {
  permiteAlavancagem?: boolean
  className?: string
}

/**
 * Badge PRO dourado para ligas do tipo PRO.
 * Exibe opcionalmente o badge de alavancagem habilitada.
 */
export function LeagueProBadge({ permiteAlavancagem, className }: Props) {
  return (
    <div className={cn('flex items-center gap-2 flex-wrap', className)}>
      <span
        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-[#F0B90B] text-black"
        aria-label="Liga PRO"
      >
        PRO
      </span>
      {permiteAlavancagem && (
        <span
          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-900/40 text-amber-400 border border-amber-700/50"
          aria-label="Alavancagem 2x habilitada nesta liga"
        >
          Alavancagem 2x habilitada
        </span>
      )}
    </div>
  )
}
