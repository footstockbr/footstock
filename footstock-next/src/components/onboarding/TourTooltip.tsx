'use client'

/**
 * T-013 — Tooltip posicionado do tour.
 *
 * Recebe position (top/left) calculada pelo tourPositioning.ts e
 * renderiza o conteúdo do passo com navegação (Anterior / Próximo / Concluir).
 */

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui'
import { TourProgressBar } from '@/components/onboarding/TourProgressBar'
import type { TooltipRect } from '@/utils/tourPositioning'
import type { TourStepDef } from '@/constants/tourSteps'

interface TourTooltipProps {
  step: TourStepDef
  stepIndex: number
  totalSteps: number
  position: TooltipRect
  onNext: () => void
  onBack: () => void
  onSkip: () => void
  isLastStep: boolean
}

export function TourTooltip({
  step,
  stepIndex,
  totalSteps,
  position,
  onNext,
  onBack,
  onSkip,
  isLastStep,
}: TourTooltipProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Gerenciar foco: focar o tooltip ao aparecer
  useEffect(() => {
    containerRef.current?.focus()
  }, [stepIndex])

  return (
    <div
      ref={containerRef}
      data-testid="tour-tooltip"
      role="dialog"
      aria-modal="true"
      aria-label={`Tour: ${step.title}`}
      tabIndex={-1}
      className={cn(
        'fixed z-[1002] w-[280px] rounded-xl border border-[rgba(240,185,11,.25)]',
        'bg-[#1E2329] shadow-2xl shadow-black/60',
        'transition-all duration-300 ease-out',
        'outline-none'
      )}
      style={{ top: position.top, left: position.left }}
    >
      <div className="p-4 flex flex-col gap-3">
        {/* Progresso */}
        <TourProgressBar current={stepIndex} total={totalSteps} />

        {/* Conteúdo */}
        <div>
          <h3 className="text-sm font-semibold text-[#EAECEF] leading-snug">
            {step.title}
          </h3>
          <p className="text-xs text-[#929AA5] mt-1 leading-relaxed">
            {step.description}
          </p>
        </div>

        {/* Ações */}
        <div className="flex items-center gap-2">
          {/* Botão Pular — visível em TODOS os passos */}
          <button
            type="button"
            onClick={onSkip}
            className="text-xs text-[#929AA5] hover:text-[#EAECEF] transition-colors min-h-[36px] px-1 shrink-0"
            data-testid="tour-skip"
            aria-label="Pular tour de boas-vindas"
          >
            Pular
          </button>

          <div className="flex-1" />

          {/* Anterior */}
          {stepIndex > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              data-testid="tour-prev"
              className="text-xs"
            >
              Anterior
            </Button>
          )}

          {/* Próximo / Concluir */}
          <Button
            variant="primary"
            size="sm"
            onClick={onNext}
            data-testid={isLastStep ? 'tour-complete' : 'tour-next'}
            className="text-xs"
          >
            {isLastStep ? 'Concluir tour' : 'Próximo'}
          </Button>
        </div>
      </div>
    </div>
  )
}
