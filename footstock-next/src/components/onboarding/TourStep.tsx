'use client'

/**
 * T-013 — Wrapper que une Spotlight + Tooltip para um passo do tour.
 *
 * Calcula a posição do tooltip a partir do DOMRect do elemento alvo
 * e da posição preferida definida em tourSteps.ts.
 */

import { useMemo } from 'react'
import { createPortal } from 'react-dom'
import { TourSpotlight } from '@/components/onboarding/TourSpotlight'
import { TourTooltip } from '@/components/onboarding/TourTooltip'
import { calculateTooltipPosition, calculateSpotlightRect } from '@/utils/tourPositioning'
import type { TourStepDef } from '@/constants/tourSteps'

interface TourStepProps {
  step: TourStepDef
  stepIndex: number
  totalSteps: number
  targetRect: DOMRect | null
  onNext: () => void
  onBack: () => void
  onSkip: () => void
  onComplete: () => void
}

export function TourStep({
  step,
  stepIndex,
  totalSteps,
  targetRect,
  onNext,
  onBack,
  onSkip,
  onComplete,
}: TourStepProps) {
  // SSR guard: typeof document como inicializador síncrono (sem setState em useEffect)
  const isBrowser = typeof document !== 'undefined'

  const spotlight = useMemo(
    () => (targetRect ? calculateSpotlightRect(targetRect) : null),
    [targetRect]
  )

  const tooltipPosition = useMemo(() => {
    if (typeof window === 'undefined') return { top: 20, left: 20, arrowPlacement: 'bottom' as const }

    const vw = window.innerWidth
    const vh = window.innerHeight

    if (!targetRect) {
      // Sem elemento alvo: centralizar o tooltip
      return {
        top: Math.max(8, (vh - 200) / 2),
        left: Math.max(8, (vw - 280) / 2),
        arrowPlacement: 'bottom' as const,
      }
    }

    return calculateTooltipPosition(targetRect, step.placement, vw, vh)
  }, [targetRect, step.placement])

  const isLastStep = stepIndex === totalSteps - 1

  if (!isBrowser) return null

  return createPortal(
    <>
      <TourSpotlight spotlight={spotlight} />
      <TourTooltip
        step={step}
        stepIndex={stepIndex}
        totalSteps={totalSteps}
        position={tooltipPosition}
        onNext={isLastStep ? onComplete : onNext}
        onBack={onBack}
        onSkip={onSkip}
        isLastStep={isLastStep}
      />
    </>,
    document.body
  )
}
