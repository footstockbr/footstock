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
    tourError,
    advance,
    back,
    skip,
    complete,
    retrySkip,
    retryComplete,
    clearTourError,
  } = useOnboardingTour()

  // Banner de falha do tour (auto-enroll ou persistência) — permite retry sem
  // reabrir o tour. Se o usuário dispensar, a falha fica registrada no console.
  if (tourError && !isActive) {
    return (
      <div
        data-testid="tour-error-banner"
        role="alert"
        className="fixed bottom-6 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-lg border border-red-200 bg-red-50 p-4 shadow-lg dark:border-red-900 dark:bg-red-950"
      >
        <p className="text-sm font-medium text-red-800 dark:text-red-100">
          {tourError}
        </p>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            data-testid="tour-retry-complete"
            onClick={retryComplete}
            className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
          >
            Tentar concluir
          </button>
          <button
            type="button"
            data-testid="tour-retry-skip"
            onClick={retrySkip}
            className="rounded bg-transparent px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 dark:text-red-200 dark:hover:bg-red-900"
          >
            Pular e salvar
          </button>
          <button
            type="button"
            data-testid="tour-dismiss-error"
            onClick={clearTourError}
            className="ml-auto text-sm text-red-700 underline dark:text-red-200"
          >
            Ignorar
          </button>
        </div>
      </div>
    )
  }

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
