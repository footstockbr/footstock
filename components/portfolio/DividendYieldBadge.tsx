'use client'

// ============================================================================
// Foot Stock — DividendYieldBadge (module-16, TASK-2/ST003 + TASK-3/ST002/ST003)
// Badge informativo de yield automático para planos Craque e Lenda.
// Client Component — toggle de tooltip para dispositivos touch.
// Rastreabilidade: INT-074
// ============================================================================

import { useState, useCallback, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils/cn'
import { PLAN_TYPE } from '@/lib/enums'
import type { PlanType } from '@/lib/enums'
import { PlanIcon } from '@/components/ui/PlanIcon'

interface DividendYieldBadgeProps {
  plan: PlanType
  className?: string
}

const TOOLTIP_ID = {
  [PLAN_TYPE.CRAQUE]: 'yield-tooltip-craque',
  [PLAN_TYPE.LENDA]: 'yield-tooltip-lenda',
  [PLAN_TYPE.JOGADOR]: 'yield-tooltip-jogador',
}

const BADGE_TEXT = {
  [PLAN_TYPE.CRAQUE]: 'Yield Financeiro Automático',
  [PLAN_TYPE.LENDA]: 'Yield Esportivo + Financeiro Automático',
  [PLAN_TYPE.JOGADOR]: null,
}

const TOOLTIP_TEXT = {
  [PLAN_TYPE.CRAQUE]:
    'Como Craque, você recebe 0,5% ao mês automaticamente sobre suas posições em clubes com sentimento positivo. Dividendos esportivos exigem ação manual.',
  [PLAN_TYPE.LENDA]:
    'Como Lenda, você recebe dividendos financeiros mensais (0,5% ao mês) E esportivos (VITÓRIA/TÍTULO) automaticamente. Sem necessidade de reinvestimento.',
  [PLAN_TYPE.JOGADOR]: null,
}

/**
 * Badge exibido na página de planos informando o benefício de yield automático.
 * Apenas Craque e Lenda recebem o badge (Jogador retorna null).
 * Desktop: tooltip via hover. Mobile/touch: toggle via click com onBlur para fechar.
 */
export function DividendYieldBadge({ plan, className }: DividendYieldBadgeProps) {
  const text = BADGE_TEXT[plan]
  const tooltipText = TOOLTIP_TEXT[plan]
  const tooltipId = TOOLTIP_ID[plan]
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLSpanElement>(null)

  const handleClick = useCallback(() => {
    setIsOpen((prev) => !prev)
  }, [])

  // Fechar ao clicar fora (para touch)
  useEffect(() => {
    if (!isOpen) return
    function handleOutsideClick(e: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('touchstart', handleOutsideClick)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('touchstart', handleOutsideClick)
    }
  }, [isOpen])

  if (!text || !tooltipText) return null

  return (
    <span
      ref={containerRef}
      className={cn('relative group inline-flex items-center gap-1', className)}
    >
      {/* Badge principal — clicável para toggle em touch */}
      <button
        type="button"
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold cursor-pointer',
          plan === PLAN_TYPE.LENDA
            ? 'bg-[#F0B90B]/10 text-[#F0B90B] border-[#F0B90B]/30'
            : 'bg-[#F0B90B]/10 text-[#F0B90B] border-[#F0B90B]/30'
        )}
        aria-describedby={tooltipId}
        aria-expanded={isOpen}
        onClick={handleClick}
      >
        {/* Ícone de informação */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-3.5 h-3.5 shrink-0"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
            clipRule="evenodd"
          />
        </svg>
        {text}
        {/* Ícone de plano */}
        <PlanIcon plan={plan} size={14} />
      </button>

      {/* Tooltip acessível (desktop: hover; mobile: click toggle) */}
      <span
        role="tooltip"
        id={tooltipId}
        className={cn(
          'absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-64',
          'px-3 py-2 rounded-lg text-xs text-white bg-slate-800 border border-slate-700',
          'shadow-xl',
          isOpen
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto',
          'transition-opacity duration-150'
        )}
      >
        {tooltipText}
        {/* Seta do tooltip */}
        <span
          aria-hidden="true"
          className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"
        />
      </span>
    </span>
  )
}
