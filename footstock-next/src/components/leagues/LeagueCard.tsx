'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Trophy, Users, Lock, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { League } from '@/types'
import { useJoinLeague } from '@/hooks/useLeagues'

interface Props {
  league: League
  isMember: boolean
  currentUserId?: string
  onJoinSuccess?: () => void
}

const DIVISION_COLORS: Record<string, string> = {
  BRONZE: 'text-amber-700 bg-amber-700/10',
  PRATA:  'text-gray-400 bg-gray-400/10',
  OURO:   'text-[#F0B90B] bg-[#F0B90B]/10',
  OPEN:   'text-blue-400 bg-blue-400/10',
}

const TYPE_LABELS: Record<string, string> = {
  PUBLICA: 'Pública',
  AMIGOS: 'Amigos',
  PRO: 'PRO',
}

const DURATION_LABELS: Record<string, string> = {
  '1S': '1 Semana',
  '1M': '1 Mês',
  'TEMPORADA': 'Temporada',
}

export function LeagueCard({ league, isMember, currentUserId: _currentUserId, onJoinSuccess }: Props) {
  const router = useRouter()
  const { mutate: joinLeague, isPending: isJoining } = useJoinLeague()

  const isFinished = league.status === 'FINISHED'
  const isAmigos = league.type === 'AMIGOS'
  const isPro = league.type === 'PRO'

  function handleJoin(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    joinLeague(league.id, {
      onSuccess: () => onJoinSuccess?.(),
    })
  }

  function handleView(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    router.push(`/ligas/${league.id}`)
  }

  return (
    <Link
      href={`/ligas/${league.id}`}
      data-testid="league-card"
      className={cn(
        'block rounded-xl p-4 transition-colors',
        'bg-[#1E2329] hover:bg-[#1a1816] cursor-pointer',
        isPro && 'border border-[#F0B90B]/30'
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-[#1a1816] flex items-center justify-center">
          <Trophy className={cn('h-5 w-5', isPro ? 'text-[#F0B90B]' : 'text-gray-400')} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 data-testid="league-card-title" className="text-[#EAECEF] font-semibold truncate text-sm sm:text-base">
            {league.name}
          </h3>
          <div className="flex items-center gap-2 flex-wrap mt-1">
            {league.division === 'OPEN' ? (
              <span
                className={cn('text-xs px-2 py-0.5 rounded-full font-medium cursor-help', DIVISION_COLORS['OPEN'])}
                title="Liga OPEN: aberta a todos os planos. Fator de equidade aplicado ao Pilar 1 para compensar assimetria entre planos."
                aria-label="Divisão OPEN — fator de equidade ativo"
              >
                OPEN ⚖
              </span>
            ) : (
              <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', DIVISION_COLORS[league.division] ?? 'text-gray-400 bg-gray-400/10')}>
                {league.division}
              </span>
            )}
            <span className={cn(
              'text-xs px-2 py-0.5 rounded-full font-medium',
              isPro ? 'text-[#F0B90B] bg-[#F0B90B]/10' : 'text-gray-400 bg-gray-400/10'
            )}>
              {TYPE_LABELS[league.type]}
            </span>
            {isFinished && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium text-gray-500 bg-gray-500/10">
                Encerrada
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
        <span className="flex items-center gap-1" aria-label={`${league.memberCount ?? 0} participantes`}>
          <Users className="h-3 w-3" />
          {league.memberCount ?? 0} participantes
        </span>
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {DURATION_LABELS[league.duration] ?? league.duration}
        </span>
        {league.endsAt && (
          <span>Até {new Date(league.endsAt).toLocaleDateString('pt-BR')}</span>
        )}
      </div>

      {/* CTA */}
      <div className="flex justify-end">
        {isMember ? (
          <button
            onClick={handleView}
            className="min-h-[44px] min-w-[44px] px-4 py-2 rounded-lg text-sm font-medium border border-[#F0B90B]/40 text-[#F0B90B] hover:bg-[#F0B90B]/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F0B90B]"
            aria-label={`Ver liga ${league.name}`}
          >
            Ver Liga
          </button>
        ) : isFinished ? null : isAmigos ? (
          <div className="relative">
            <button
              disabled
              aria-disabled="true"
              aria-describedby={`invite-tooltip-${league.id}`}
              className="min-h-[44px] min-w-[44px] px-4 py-2 rounded-lg text-sm font-medium bg-gray-700/30 text-gray-500 cursor-not-allowed opacity-50"
            >
              <Lock className="h-4 w-4 inline mr-1" />
              Entrar
            </button>
            <span
              id={`invite-tooltip-${league.id}`}
              className="sr-only"
            >
              Precisa de convite para ligas de amigos
            </span>
          </div>
        ) : (
          <button
            onClick={handleJoin}
            disabled={isJoining}
            data-testid="league-card-join-button"
            className="min-h-[44px] min-w-[44px] px-4 py-2 rounded-lg text-sm font-medium bg-[#F0B90B] text-black hover:bg-[#d4ad52] transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F0B90B]"
            aria-label={`Entrar na liga ${league.name}`}
          >
            {isJoining ? 'Entrando...' : 'Entrar'}
          </button>
        )}
      </div>
    </Link>
  )
}
