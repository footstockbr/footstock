'use client'

import { useState } from 'react'
import { Trophy, Users, Calendar, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useJoinSponsoredLeague, type SponsoredLeaguePublic, type SponsoredLeaguePrize } from '@/hooks/useSponsoredLeagues'

interface Props {
  league: SponsoredLeaguePublic
  onJoinSuccess?: () => void
}

export function SponsoredLeagueCard({ league, onJoinSuccess }: Props) {
  const { mutate: joinLeague, isPending: isJoining } = useJoinSponsoredLeague()
  const [joinError, setJoinError] = useState<string | null>(null)

  const isEncerrada = league.status === 'ENCERRADA'
  const isAgendada = league.status === 'AGENDADA'
  const isFull = league.participants >= league.maxParticipants
  const prizes: SponsoredLeaguePrize[] = Array.isArray(league.prizes) ? league.prizes : []
  const hasRealPrizes = prizes.some(p => p.description)
  const progressPercent = league.maxParticipants > 0
    ? Math.min(100, Math.round((league.participants / league.maxParticipants) * 100))
    : 0

  function handleJoin(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setJoinError(null)
    joinLeague(league.id, {
      onSuccess: () => onJoinSuccess?.(),
      onError: (err) => {
        setJoinError(err instanceof Error ? err.message : 'Erro ao entrar na liga')
      },
    })
  }

  return (
    <div
      data-testid={`sponsored-league-card-${league.id}`}
      className={cn(
        'rounded-xl p-4 transition-colors',
        'bg-[#1E2329] hover:bg-[#1a1816]',
        'border border-[#F0B90B]/30'
      )}
      style={{ borderLeftColor: league.borderColor, borderLeftWidth: '3px' }}
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-[#1a1816] flex items-center justify-center">
          <Trophy className="h-5 w-5 text-[#F0B90B]" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[#EAECEF] font-semibold truncate text-sm sm:text-base">
            {league.name}
          </h3>
          <div className="flex items-center gap-2 flex-wrap mt-1">
            <span className="text-xs text-gray-400">{league.company}</span>
            {league.sponsorUrl && (
              <a
                href={league.sponsorUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 text-xs text-[#F0B90B] hover:underline"
                onClick={(e) => e.stopPropagation()}
                data-testid={`sponsored-league-sponsor-link-${league.id}`}
              >
                <ExternalLink className="h-3 w-3" />
                site
              </a>
            )}
            <span className={cn(
              'text-xs px-2 py-0.5 rounded-full font-medium',
              league.status === 'ATIVA' ? 'text-[#2EBD85] bg-[#2EBD85]/10' :
              league.status === 'ENCERRADA' ? 'text-gray-500 bg-gray-500/10' :
              'text-[#FFC107] bg-[#FFC107]/10'
            )}>
              {league.status}
            </span>
            <span className={cn(
              'text-xs px-2 py-0.5 rounded-full font-medium',
              league.minPlan === 'LENDA' ? 'text-[#FFD700] bg-[#FFD700]/10' :
              league.minPlan === 'CRAQUE' ? 'text-[#F0B90B] bg-[#F0B90B]/10' :
              'text-gray-400 bg-gray-400/10'
            )}>
              {league.minPlan}
            </span>
          </div>
        </div>
      </div>

      {/* Prizes */}
      {hasRealPrizes && (
        <div className="mb-3 p-2.5 bg-[#181A20] rounded-lg" data-testid={`sponsored-league-prizes-${league.id}`}>
          {prizes.filter(p => p.description).map(p => (
            <div key={p.position} className="flex items-center gap-2 text-xs mb-1 last:mb-0">
              <span className="text-[#F0B90B] font-bold min-w-[55px]">{p.label}</span>
              <span className="text-[#EAECEF]">{p.description}</span>
            </div>
          ))}
        </div>
      )}

      {/* Info */}
      <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
        <span className="flex items-center gap-1">
          <Users className="h-3 w-3" />
          {league.participants}/{league.maxParticipants}
        </span>
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {new Date(league.startDate).toLocaleDateString('pt-BR')} - {new Date(league.endDate).toLocaleDateString('pt-BR')}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-[#181A20] rounded-full mb-3 overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${progressPercent}%`,
            background: league.borderColor,
          }}
        />
      </div>

      {/* Error feedback */}
      {joinError && (
        <div
          className="text-xs text-[#F6465D] bg-[#F6465D]/10 rounded-lg px-3 py-2 mb-3"
          data-testid={`sponsored-league-join-error-${league.id}`}
        >
          {joinError}
        </div>
      )}

      {/* CTA */}
      <div className="flex justify-end">
        {league.isMember ? (
          <span
            className="min-h-[44px] min-w-[44px] px-4 py-2 rounded-lg text-sm font-medium border border-[#2EBD85]/40 text-[#2EBD85] flex items-center"
            data-testid={`sponsored-league-inscrito-${league.id}`}
          >
            Inscrito
          </span>
        ) : isEncerrada ? null : isAgendada ? (
          <span
            className="min-h-[44px] min-w-[44px] px-4 py-2 rounded-lg text-sm font-medium bg-[#FFC107]/10 text-[#FFC107]"
            data-testid={`sponsored-league-em-breve-${league.id}`}
          >
            Em breve
          </span>
        ) : isFull ? (
          <span className="min-h-[44px] min-w-[44px] px-4 py-2 rounded-lg text-sm font-medium bg-gray-700/30 text-gray-500">
            Vagas Esgotadas
          </span>
        ) : (
          <button
            onClick={handleJoin}
            disabled={isJoining}
            data-testid={`sponsored-league-join-${league.id}`}
            className="min-h-[44px] min-w-[44px] px-4 py-2 rounded-lg text-sm font-medium bg-[#F0B90B] text-black hover:bg-[#d4ad52] transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F0B90B]"
          >
            {isJoining ? 'Entrando...' : 'Participar'}
          </button>
        )}
      </div>
    </div>
  )
}
