import { Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'

export type TrophyType = 'PRO_LEAGUE_WINNER' | 'PRO_LEAGUE_RUNNER_UP' | 'PRO_LEAGUE_THIRD'

interface TrophyMeta {
  label:     string
  color:     string
  iconColor: string
  position:  string
}

const TROPHY_META: Record<TrophyType, TrophyMeta> = {
  PRO_LEAGUE_WINNER:    { label: '1o Lugar', color: 'bg-[#F0B90B]/10 border-[#F0B90B]/30', iconColor: 'text-[#F0B90B]', position: '1o' },
  PRO_LEAGUE_RUNNER_UP: { label: '2o Lugar', color: 'bg-gray-300/10 border-gray-300/30',   iconColor: 'text-gray-300',   position: '2o' },
  PRO_LEAGUE_THIRD:     { label: '3o Lugar', color: 'bg-amber-700/10 border-amber-700/30', iconColor: 'text-amber-700', position: '3o' },
}

interface Props {
  trophyType: TrophyType
  leagueName: string
  awardedAt:  string
  leagueStart?: string | null
  leagueEnd?:   string | null
  className?: string
}

/**
 * TrophyCard — exibe um troféu conquistado em liga PRO.
 * Troféus são puramente cosméticos — sem valor monetário.
 */
export function TrophyCard({ trophyType, leagueName, awardedAt, leagueStart, leagueEnd, className }: Props) {
  const meta = TROPHY_META[trophyType]
  const awarded = new Date(awardedAt)
  const period = leagueStart && leagueEnd
    ? `${new Date(leagueStart).toLocaleDateString('pt-BR')} — ${new Date(leagueEnd).toLocaleDateString('pt-BR')}`
    : null

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-xl border',
        meta.color,
        className
      )}
      role="article"
      aria-label={`Troféu ${meta.label} em ${leagueName}`}
    >
      <div className={cn('mt-0.5 shrink-0', meta.iconColor)}>
        <Trophy className="h-6 w-6" aria-hidden />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn('text-xs font-bold', meta.iconColor)}>{meta.position} lugar</span>
          <span className="text-xs text-gray-500">· Liga PRO</span>
        </div>
        <p className="text-sm font-semibold text-[#EAECEF] truncate mt-0.5">{leagueName}</p>
        <p className="text-xs text-gray-500 mt-0.5">
          Conquistado em {awarded.toLocaleDateString('pt-BR')}
        </p>
        {period && (
          <p className="text-xs text-gray-600 mt-0.5">{period}</p>
        )}
      </div>
    </div>
  )
}
