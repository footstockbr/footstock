'use client'

import { useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { ScoreBreakdown } from './ScoreBreakdown'
import type { LeagueMemberRanking } from '@/types'

interface Props {
  member: LeagueMemberRanking
  showPlanBadge?: boolean
}

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

/**
 * LeagueScoreCard — exibe score total de um membro com botão para abrir breakdown.
 * Usado na tabela de ranking de ligas.
 */
export function LeagueScoreCard({ member, showPlanBadge = false }: Props) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)

  return (
    <div className="flex items-center gap-2">
      {showPlanBadge && member.userPlan && (
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

      <div className="relative">
        <button
          ref={btnRef}
          onClick={() => setOpen((v) => !v)}
          className="text-sm font-semibold text-[#F0B90B] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F0B90B] rounded"
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={`Ver breakdown de score: ${member.score.finalScore?.toFixed(1) ?? '0.0'} pontos`}
        >
          {(member.score.finalScore ?? 0).toFixed(1)}
        </button>

        {open && (
          <ScoreBreakdown
            score={member.score}
            userName={member.isCurrentUser ? undefined : member.userName}
            onClose={() => setOpen(false)}
            triggerRef={btnRef as React.RefObject<HTMLElement>}
          />
        )}
      </div>
    </div>
  )
}
