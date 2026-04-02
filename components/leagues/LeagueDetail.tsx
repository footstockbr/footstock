'use client'

import { useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Trophy, Medal, Star, Users, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils/cn'
import { useLeagueDetail, useLeagueRanking } from '@/hooks/useLeagues'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { ScoreBreakdown } from './ScoreBreakdown'
import { InviteLink } from './InviteLink'
import type { LeagueMemberRanking } from '@/types'
import { ROUTES } from '@/lib/constants'

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
}

function ScoreCell({ member }: ScoreButtonProps) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const triggerRef = useRef<HTMLElement>(null)

  // Sync triggerRef to btnRef
  ;(triggerRef as React.MutableRefObject<HTMLElement | null>).current = btnRef.current

  return (
    <td className="py-3 px-4 text-right relative">
      <button
        ref={btnRef}
        onClick={() => setOpen(v => !v)}
        className="text-sm font-semibold text-[#F0B90B] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F0B90B] rounded"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Ver breakdown de score de ${member.userName}: ${member.score.finalScore.toFixed(1)} pontos`}
      >
        {member.score.finalScore.toFixed(1)}
      </button>
      {open && (
        <ScoreBreakdown
          score={member.score}
          userName={member.isCurrentUser ? undefined : member.userName}
          onClose={() => setOpen(false)}
          triggerRef={triggerRef as React.RefObject<HTMLElement>}
        />
      )}
    </td>
  )
}

export function LeagueDetail({ leagueId }: Props) {
  const { data: league, isPending: leaguePending, isError: leagueError } = useLeagueDetail(leagueId)
  const { data: ranking, isPending: rankingPending } = useLeagueRanking(leagueId)
  const { data: user } = useCurrentUser()
  const router = useRouter()
  const [leaveStep, setLeaveStep] = useState<'idle' | 'confirm' | 'loading'>('idle')
  const [removeMemberId, setRemoveMemberId] = useState<string | null>(null)
  const [removeLoading, setRemoveLoading] = useState(false)

  const handleLeave = useCallback(async () => {
    if (leaveStep === 'idle') { setLeaveStep('confirm'); return }
    setLeaveStep('loading')
    try {
      const res = await fetch(`/api/v1/leagues/${leagueId}/leave`, { method: 'POST' })
      if (res.ok) router.push('/ligas')
      else setLeaveStep('idle')
    } catch { setLeaveStep('idle') }
  }, [leaveStep, leagueId, router])

  const handleRemoveMember = useCallback(async (memberId: string) => {
    setRemoveLoading(true)
    try {
      await fetch(`/api/v1/leagues/${leagueId}/members/${memberId}`, { method: 'DELETE' })
      setRemoveMemberId(null)
      router.refresh()
    } finally {
      setRemoveLoading(false)
    }
  }, [leagueId, router])

  if (leagueError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-4">
        <Trophy className="h-10 w-10 text-gray-600 mb-3" aria-hidden="true" />
        <p className="text-gray-400 text-sm">Liga não encontrada.</p>
        <Link
          href={ROUTES.LIGAS}
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
    <div className="px-4 pt-4 pb-8 max-w-2xl mx-auto">
      {/* Back nav */}
      <Link
        href={ROUTES.LIGAS}
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

          {/* Current user position */}
          {currentUserEntry && (
            <div
              className="mt-4 p-3 rounded-lg bg-[#F0B90B]/10 border border-[#F0B90B]/20 flex items-center justify-between"
              aria-label={`Sua posição: ${currentUserEntry.rank}º com ${currentUserEntry.score.finalScore.toFixed(1)} pontos`}
            >
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 text-[#F0B90B]" aria-hidden="true" />
                <span className="text-sm font-medium text-[#EAECEF]">Sua posição</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-400">#{currentUserEntry.rank}</span>
                <span className="text-sm font-bold text-[#F0B90B]">
                  {currentUserEntry.score.finalScore.toFixed(1)} pts
                </span>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* Invite link — only visible to the league creator */}
      {league && user && league.createdBy === user.id && (
        <div className="mb-6">
          <InviteLink leagueId={league.id} />
        </div>
      )}

      {/* Member actions */}
      {league && user && league.createdBy !== user.id && (
        <div className="mb-6">
          {leaveStep === 'confirm' ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Tem certeza que deseja sair?</span>
              <button
                onClick={() => void handleLeave()}
                className="px-3 py-1.5 rounded bg-red-500 text-white text-xs font-medium hover:bg-red-600"
              >
                Confirmar saída
              </button>
              <button
                onClick={() => setLeaveStep('idle')}
                className="px-3 py-1.5 rounded border border-[#2a2724] text-xs text-gray-400 hover:bg-white/5"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              onClick={() => void handleLeave()}
              disabled={leaveStep === 'loading'}
              className="text-xs text-red-400 hover:text-red-300 hover:underline disabled:opacity-50 transition-colors"
            >
              {leaveStep === 'loading' ? 'Saindo...' : 'Sair da liga'}
            </button>
          )}
        </div>
      )}

      {/* Remove member confirm modal */}
      {removeMemberId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" role="dialog" aria-modal="true">
          <div className="w-full max-w-xs rounded-xl bg-[#1a1816] border border-[#2a2724] p-5 space-y-4">
            <p className="text-sm text-[#EAECEF] font-medium">Remover participante da liga?</p>
            <p className="text-xs text-gray-400">Esta ação não pode ser desfeita.</p>
            <div className="flex gap-2">
              <button
                onClick={() => void handleRemoveMember(removeMemberId)}
                disabled={removeLoading}
                className="flex-1 py-2 rounded-lg bg-red-500 text-white text-xs font-medium hover:bg-red-600 disabled:opacity-50"
              >
                {removeLoading ? 'Removendo...' : 'Remover'}
              </button>
              <button
                onClick={() => setRemoveMemberId(null)}
                className="flex-1 py-2 rounded-lg border border-[#2a2724] text-xs text-gray-400 hover:bg-white/5"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

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
                    Pontuação
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
                          <span className={cn(
                            'text-sm',
                            member.isCurrentUser ? 'font-semibold text-[#EAECEF]' : 'text-gray-300'
                          )}>
                            {member.userName}
                            {member.isCurrentUser && (
                              <span className="sr-only"> (você)</span>
                            )}
                          </span>
                        </td>
                        <ScoreCell member={member} />
                        {league && user && league.createdBy === user.id && !member.isCurrentUser && (
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => setRemoveMemberId(member.userId)}
                              className="text-xs text-red-400 hover:text-red-300 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 rounded"
                              aria-label={`Remover ${member.userName} da liga`}
                            >
                              Remover
                            </button>
                          </td>
                        )}
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
