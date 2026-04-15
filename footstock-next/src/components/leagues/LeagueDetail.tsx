'use client'

import { useRef, useState } from 'react'
import { Trophy, Medal, Star, Users, ArrowLeft, Scale } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useLeagueDetail, useLeagueRanking, useMyScore } from '@/hooks/useLeagues'
import { ScoreBreakdown } from './ScoreBreakdown'
import { LeagueScoreHistory } from './LeagueScoreHistory'
import { LeagueInviteLink } from './LeagueInviteLink'
import { LeagueProBadge } from './LeagueProBadge'
import type { LeagueMemberRanking } from '@/types'

const PLAN_LABELS: Record<string, string> = {
  JOGADOR: 'J',
  CRAQUE:  'C',
  LENDA:   'L',
}
const PLAN_COLORS: Record<string, string> = {
  JOGADOR: 'text-amber-600 bg-amber-600/10',
  CRAQUE:  'text-gray-300 bg-gray-300/10',
  LENDA:   'text-[#F0B90B] bg-[#F0B90B]/10',
}

interface Props {
  leagueId: string
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <Medal className="h-5 w-5 text-[#F0B90B]" aria-label="1º lugar" />
  if (rank === 2) return <Medal className="h-5 w-5 text-gray-300" aria-label="2º lugar" />
  if (rank === 3) return <Medal className="h-5 w-5 text-amber-700" aria-label="3º lugar" />
  return <span className="text-xs font-semibold text-gray-500 w-5 text-center">#{rank}</span>
}

function SkeletonRow() {
  return (
    <tr aria-hidden="true">
      <td className="py-3 px-4"><div className="h-4 w-6 bg-white/10 rounded animate-pulse" /></td>
      <td className="py-3 px-4"><div className="h-4 w-32 bg-white/10 rounded animate-pulse" /></td>
      <td className="py-3 px-4 text-right"><div className="h-4 w-12 bg-white/10 rounded animate-pulse ml-auto" /></td>
    </tr>
  )
}

interface ScoreButtonProps {
  member: LeagueMemberRanking
  leagueId?: string
}

function ScoreCell({ member, leagueId }: ScoreButtonProps) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const { data: myScore } = useMyScore(leagueId ?? '')
  const p2Events = member.isCurrentUser ? (myScore?.p2Events ?? []) : undefined

  return (
    <td className="py-3 px-4 text-right relative">
      <button
        ref={btnRef}
        onClick={() => setOpen(v => !v)}
        className="text-sm font-semibold text-[#F0B90B] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F0B90B] rounded"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Ver breakdown de score: ${(member.score.finalScore ?? 0).toFixed(1)} pontos`}
      >
        {(member.score.finalScore ?? 0).toFixed(1)}
      </button>
      {open && (
        <ScoreBreakdown
          score={member.score}
          userName={member.isCurrentUser ? undefined : member.userName}
          p2Events={p2Events}
          onClose={() => setOpen(false)}
          triggerRef={btnRef as React.RefObject<HTMLElement>}
        />
      )}
    </td>
  )
}

export function LeagueDetail({ leagueId }: Props) {
  const { data: league, isPending: leaguePending, isError: leagueError } = useLeagueDetail(leagueId)
  const { data: ranking, isPending: rankingPending } = useLeagueRanking(leagueId)

  if (leagueError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-4">
        <Trophy className="h-10 w-10 text-gray-600 mb-3" aria-hidden="true" />
        <p className="text-gray-400 text-sm">Liga não encontrada.</p>
        <Link
          href="/ligas"
          className="mt-4 text-[#F0B90B] text-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F0B90B] rounded"
        >
          Voltar para Ligas
        </Link>
      </div>
    )
  }

  const members: LeagueMemberRanking[] = ranking ?? []
  const currentUserEntry = members.find(m => m.isCurrentUser)

  return (
    <div data-testid="league-detail" className="px-4 pt-4 pb-8 max-w-2xl mx-auto">
      {/* Back nav */}
      <Link
        href="/ligas"
        className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-[#EAECEF] mb-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F0B90B] rounded"
        aria-label="Voltar para lista de ligas"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Ligas
      </Link>

      {/* League header */}
      {leaguePending ? (
        <div className="mb-6">
          <div className="h-6 w-48 bg-white/10 rounded animate-pulse mb-2" />
          <div className="h-4 w-32 bg-white/10 rounded animate-pulse" />
        </div>
      ) : league ? (
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-[#1a1816] flex items-center justify-center flex-shrink-0">
              <Trophy className={cn('h-6 w-6', league.type === 'PRO' ? 'text-[#F0B90B]' : 'text-gray-400')} aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-[#EAECEF]">{league.name}</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-gray-500">{league.division}</span>
                <span className="text-gray-700">·</span>
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  <Users className="h-3 w-3" aria-hidden="true" />
                  {league.memberCount ?? members.length} participantes
                </span>
              </div>
            </div>
          </div>

          {/* Badge e info de liga PRO */}
          {league.type === 'PRO' && (
            <div className="mt-3 space-y-2">
              <LeagueProBadge permiteAlavancagem={league.permiteAlavancagem} />
              {league.sponsor?.name && (
                <p className="text-xs text-gray-400">
                  Patrocinada por <span className="text-[#F0B90B] font-medium">{league.sponsor.name}</span>
                </p>
              )}
            </div>
          )}

          {/* Nota de equidade — visível somente em ligas OPEN */}
          {league.division === 'OPEN' && (
            <div
              className="mt-3 px-3 py-2 rounded-lg bg-blue-400/5 border border-blue-400/20 flex items-center gap-2"
              aria-label="Fator de equidade ativo nesta liga"
            >
              <Scale className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" aria-hidden="true" />
              <p className="text-xs text-blue-300">
                Fator de equidade aplicado ao Pilar 1 para todos os planos.
              </p>
            </div>
          )}

          {/* Current user position */}
          {currentUserEntry && (
            <>
              <div
                className="mt-4 p-3 rounded-lg bg-[#F0B90B]/10 border border-[#F0B90B]/20 flex items-center justify-between"
                aria-label={`Sua posição: ${currentUserEntry.rank}º com ${(currentUserEntry.score.finalScore ?? 0).toFixed(1)} pontos`}
              >
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-[#F0B90B]" aria-hidden="true" />
                  <span className="text-sm font-medium text-[#EAECEF]">Sua posição</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-400">#{currentUserEntry.rank}</span>
                  <span className="text-sm font-bold text-[#F0B90B]">
                    {(currentUserEntry.score.finalScore ?? 0).toFixed(1)} pts
                  </span>
                </div>
              </div>
              <div className="mt-3">
                <LeagueScoreHistory leagueId={leagueId} />
              </div>
              {league?.type === 'AMIGOS' && (
                <LeagueInviteLink
                  leagueId={leagueId}
                  isCreator={!!league.createdBy && league.createdBy === currentUserEntry?.userId}
                />
              )}
            </>
          )}
        </div>
      ) : null}

      {/* Ranking table */}
      <section aria-label="Ranking da liga">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Ranking
        </h2>

        {members.length === 0 && !rankingPending ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Trophy className="h-8 w-8 text-gray-700 mb-3" aria-hidden="true" />
            <p className="text-sm text-gray-500">Nenhum participante ainda.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[#2a2724]">
            <table className="w-full text-left" aria-label="Ranking de participantes">
              <caption className="sr-only">
                Ranking dos participantes da liga {league?.name}
              </caption>
              <thead>
                <tr className="border-b border-[#2a2724]">
                  <th
                    scope="col"
                    className="py-2.5 px-4 text-xs font-medium text-gray-500 w-12"
                    aria-sort="ascending"
                  >
                    #
                  </th>
                  <th scope="col" className="py-2.5 px-4 text-xs font-medium text-gray-500">
                    Jogador
                  </th>
                  <th
                    scope="col"
                    className="py-2.5 px-4 text-xs font-medium text-gray-500 text-right"
                    aria-sort="descending"
                  >
                    Score
                  </th>
                </tr>
              </thead>
              <tbody>
                {rankingPending
                  ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                  : members.map(member => (
                      <tr
                        key={member.userId}
                        className={cn(
                          'border-b border-[#2a2724] last:border-0 transition-colors',
                          member.isCurrentUser
                            ? 'bg-[#F0B90B]/5'
                            : 'hover:bg-white/5',
                          member.rank <= 3 && 'bg-white/[0.02]'
                        )}
                        aria-current={member.isCurrentUser ? 'true' : undefined}
                      >
                        <td className="py-3 px-4">
                          <RankBadge rank={member.rank} />
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            {league?.division === 'OPEN' && member.userPlan && (
                              <span
                                className={cn(
                                  'text-[10px] font-bold px-1 py-0.5 rounded',
                                  PLAN_COLORS[member.userPlan] ?? 'text-gray-400 bg-gray-400/10'
                                )}
                                title={`Plano ${member.userPlan}`}
                                aria-label={`Plano ${member.userPlan}`}
                              >
                                {PLAN_LABELS[member.userPlan] ?? member.userPlan[0]}
                              </span>
                            )}
                            <span className={cn(
                              'text-sm',
                              member.isCurrentUser ? 'font-semibold text-[#EAECEF]' : 'text-gray-300'
                            )}>
                              {member.userName}
                              {member.isCurrentUser && (
                                <span className="sr-only"> (você)</span>
                              )}
                            </span>
                          </div>
                        </td>
                        <ScoreCell member={member} leagueId={leagueId} />
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
