'use client'

/**
 * T-013 — Onboarding Tour Adaptativo.
 *
 * Montado no layout da área autenticada. Verifica se o tour deve iniciar:
 *   - tourCompleted === false
 *   - investorProfile definido
 *
 * Tour adaptativo por perfil:
 *   INICIANTE / FA       → 6 passos (tour básico)
 *   INTERMEDIARIO / AVANCADO → 3 passos (tour avançado)
 *
 * Comportamento:
 *   - Auto-inicia no primeiro login completo
 *   - Não re-exibe em logins subsequentes
 *   - Pulável em qualquer passo (ESC ou botão "Pular")
 *   - Reativável pela página de Perfil via tour-reset endpoint
 *   - Acessível: foco gerenciado, ESC para pular, aria-labels corretos
 *   - Responsivo: tooltip clampar no viewport (375px+)
 */

import { useOnboardingTour } from '@/hooks/useOnboardingTour'
import { TourStep } from '@/components/onboarding/TourStep'

export function OnboardingTour() {
  const {
    isActive,
    isLoading,
    currentStep,
    steps,
    targetRect,
    advance,
    back,
    skip,
    complete,
  } = useOnboardingTour()

  // Não renderiza nada durante carregamento ou quando tour não está ativo
  if (isLoading || !isActive || steps.length === 0) return null

  const step = steps[currentStep]
  if (!step) return null

  return (
    <TourStep
      key={currentStep}
      step={step}
      stepIndex={currentStep}
      totalSteps={steps.length}
      targetRect={targetRect}
      onNext={advance}
      onBack={back}
      onSkip={skip}
      onComplete={complete}
    />
  )
}
