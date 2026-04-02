// ============================================================================
// Foot Stock — /assessor (Assessor IA)
// Fonte: module-21/TASK-3/ST006
// ============================================================================

'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { AppLayout } from '@/components/layout'
import { Btn } from '@/components/ui/Btn'
import { ToastContainer } from '@/components/ui/Toast'
import { TickerSelector } from '@/components/ai/TickerSelector'
import { RateLimitBadge } from '@/components/ai/RateLimitBadge'
import { AIAnalysisCard } from '@/components/ai/AIAnalysisCard'
import { PlanGate } from '@/components/ai/PlanGate'
import { useAIAdvisor, useRateLimitStatus } from '@/hooks/useAIAdvisor'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useToast } from '@/hooks/useToast'

function AssessorPageContent() {
  const searchParams = useSearchParams()
  const [selectedTicker, setSelectedTicker] = useState<string | undefined>()
  const { data: user } = useCurrentUser()
  const { toasts, toast, removeToast } = useToast()

  const {
    data: analysis,
    isLoading,
    isError,
    error,
    isRateLimited,
    resetAt,
    isPlanGated,
    refetch,
  } = useAIAdvisor(selectedTicker)

  const { status: rateLimitStatus, isLoading: rateLimitLoading } = useRateLimitStatus()

  useEffect(() => {
    const tickerFromQuery = searchParams?.get('ticker')?.trim().toUpperCase()
    if (tickerFromQuery) {
      setSelectedTicker(tickerFromQuery)
    }
  }, [searchParams])

  // Exibir toast para erros da API (400, 503, 504)
  useEffect(() => {
    if (isError && error) {
      const msg = error.message ?? 'Assessor IA temporariamente indisponível. Tente novamente.'
      toast.error('Erro', msg)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isError, error])

  // Exibir toast quando rate limit é atingido
  useEffect(() => {
    if (isRateLimited) {
      toast.warning('Limite atingido', 'Limite de consultas ao Assessor IA atingido (10/hora).')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRateLimited])

  const currentRemaining =
    isRateLimited ? 0 : (rateLimitStatus?.remaining ?? 10)
  const currentResetAt =
    isRateLimited ? resetAt : (rateLimitStatus?.resetAt ?? 0)

  return (
    <AppLayout>
      {/* Toasts */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-100">Assessor IA</h1>
          <p className="mt-1 text-sm text-slate-400">
            Análise fundamentalista de ativos em tempo real com inteligência artificial.
          </p>
        </div>

        <PlanGate userPlan={user?.planType}>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_2fr]">
            {/* Painel esquerdo: controles */}
            <div className="space-y-4">
              <TickerSelector
                value={selectedTicker}
                onChange={setSelectedTicker}
              />

              <div className="flex items-center justify-between gap-2">
                <RateLimitBadge
                  remaining={currentRemaining}
                  resetAt={currentResetAt}
                  isLoading={rateLimitLoading}
                />
              </div>

              <Btn
                variant="primary"
                size="md"
                className="w-full"
                disabled={!selectedTicker || isLoading || isRateLimited}
                isLoading={isLoading}
                aria-busy={isLoading}
                onClick={() => {
                  if (selectedTicker) refetch()
                }}
              >
                {isLoading ? 'Analisando...' : 'Analisar'}
              </Btn>
            </div>

            {/* Painel direito: resultado */}
            <AIAnalysisCard
              analysis={isPlanGated ? undefined : analysis}
              isLoading={isLoading}
            />
          </div>
        </PlanGate>
      </div>
    </AppLayout>
  )
}

export default function AssessorPage() {
  return (
    <Suspense fallback={<AppLayout><div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 text-slate-400">Carregando assessor...</div></AppLayout>}>
      <AssessorPageContent />
    </Suspense>
  )
}
