'use client'

// ============================================================================
// Foot Stock — PlansPageClient: client component para seleção e upgrade de plano
// ============================================================================

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import type { PlanType } from '@/lib/enums'
import { SUBSCRIPTION_STATUS } from '@/lib/enums'
import { ROUTES } from '@/lib/constants'
import { PlanCards } from '@/components/plans/PlanCards'
import { PlanComparison } from '@/components/plans/PlanComparison'
import { GatewaySelector } from '@/components/plans/GatewaySelector'
import { CancellationLockWarning } from '@/components/plans/CancellationLockWarning'
import { Btn } from '@/components/ui/Btn'
import { ToastContainer } from '@/components/ui/Toast'
import { useToast } from '@/hooks/useToast'
import { useSubscriptionData } from '@/hooks/useSubscriptionData'
import { usePlansCheckout } from '@/hooks/usePlansCheckout'

export default function PlansPageClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const preSelectedPlan = searchParams?.get('plan') as PlanType | null
  const upgradedParam = searchParams?.get('upgraded') as PlanType | null

  const { toasts, toast, removeToast } = useToast()

  const {
    subscription,
    isLoadingSubscription,
    networkError,
    setIsLoadingSubscription,
    setNetworkError,
    fetchSubscription,
  } = useSubscriptionData()

  const currentPlan = subscription?.planType ?? 'JOGADOR'

  const {
    selectedPlan,
    setSelectedPlan,
    selectedPeriod,
    setSelectedPeriod,
    selectedGateway,
    setSelectedGateway,
    isCancelling,
    error,
    showCancellationWarning,
    setShowCancellationWarning,
    handleSelectPlan,
    handleCheckout,
    handleCancelConfirm,
    handleLiquidate,
    canCheckout,
    btnLabel,
    isSubscriptionInactive,
    isEligibleForRefund,
  } = usePlansCheckout({
    currentPlan,
    subscriptionStatus: subscription?.status,
    subscriptionPlanType: subscription?.planType,
    isEligibleForRefund: subscription?.isEligibleForRefund,
    fetchSubscription,
    toast,
  })

  const [welcomePlan, setWelcomePlan] = useState<PlanType | null>(null)
  const [pollingPayment, setPollingPayment] = useState(false)

  // Apply pre-selected plan from query param
  useEffect(() => {
    if (preSelectedPlan) setSelectedPlan(preSelectedPlan)
  }, [preSelectedPlan, setSelectedPlan])

  // Welcome modal after gateway return with ?upgraded=PLANO
  useEffect(() => {
    if (upgradedParam && (upgradedParam === 'CRAQUE' || upgradedParam === 'LENDA')) {
      setWelcomePlan(upgradedParam)
    }
  }, [upgradedParam])

  // Polling de status de pagamento após retorno do gateway
  // O gateway retorna com ?payment=success&sub={id} ou ?payment=pending&sub={id}
  useEffect(() => {
    const paymentParam = searchParams?.get('payment')
    const subId = searchParams?.get('sub')
    if (!paymentParam || !subId || pollingPayment) return
    if (paymentParam !== 'success' && paymentParam !== 'pending') return

    setPollingPayment(true)

    let attempts = 0
    const MAX_ATTEMPTS = 15 // ~45s total
    const INTERVAL_MS = 3_000

    const interval = setInterval(async () => {
      attempts++
      try {
        const res = await fetch('/api/v1/subscriptions/me', { credentials: 'include' })
        if (res.ok) {
          const json: { data?: { planType?: PlanType; status?: string } } = await res.json()
          const plan = json.data?.planType
          const status = json.data?.status
          if (status === 'ACTIVE' && plan && plan !== 'JOGADOR') {
            clearInterval(interval)
            setPollingPayment(false)
            setWelcomePlan(plan)
            // Remove query params de pagamento da URL
            router.replace('/planos?upgraded=' + plan)
            return
          }
        }
      } catch {
        // Ignora erros de rede e tenta novamente
      }

      if (attempts >= MAX_ATTEMPTS) {
        clearInterval(interval)
        setPollingPayment(false)
        // Força recarregar dados da assinatura manualmente
        fetchSubscription()
      }
    }, INTERVAL_MS)

    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-5xl mx-auto px-4 py-8 sm:px-6">
        <h1 className="text-2xl sm:text-3xl font-bold mb-2">Escolha seu Plano</h1>
        <p className="text-gray-400 mb-6">Invista com mais liberdade. Comece gratuito, evolua quando quiser.</p>

        {pollingPayment && (
          <div role="status" aria-live="polite" className="mb-4 p-3 bg-blue-900/40 border border-blue-700 rounded-lg text-sm text-blue-200 flex items-center gap-3">
            <span className="animate-spin text-blue-300 shrink-0" aria-hidden="true">⟳</span>
            <span>Aguardando confirmação do pagamento… Isso pode levar alguns segundos.</span>
          </div>
        )}

        {networkError && (
          <div role="alert" className="mb-4 p-3 bg-yellow-900/40 border border-yellow-700 rounded-lg text-sm text-yellow-300 flex items-center justify-between">
            <span>Não foi possível carregar seu plano. Verifique sua conexão.</span>
            <button
              onClick={() => {
                setIsLoadingSubscription(true)
                setNetworkError(false)
                fetchSubscription()
              }}
              className="ml-3 text-yellow-200 underline hover:text-white text-sm flex-shrink-0"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {isSubscriptionInactive && (
          <div role="status" className="mb-4 p-3 bg-indigo-900/40 border border-indigo-700 rounded-lg text-sm text-indigo-200">
            Sua assinatura está {subscription?.status === SUBSCRIPTION_STATUS.CANCELLED ? 'cancelada' : 'expirada'}.
            Selecione um plano abaixo para reativar seu acesso.
          </div>
        )}

        <div className="flex w-full sm:w-auto gap-1 p-1 bg-gray-800 rounded-lg mb-6">
          <button
            className={`flex-1 sm:flex-none px-4 py-2 rounded-md text-sm font-medium transition-all ${selectedPeriod === 'monthly' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'}`}
            onClick={() => setSelectedPeriod('monthly')}
          >
            Mensal
          </button>
          <button
            className={`flex-1 sm:flex-none px-4 py-2 rounded-md text-sm font-medium transition-all ${selectedPeriod === 'yearly' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'}`}
            onClick={() => setSelectedPeriod('yearly')}
          >
            Anual
            <span className="ml-1 text-xs text-green-400">-25%</span>
          </button>
        </div>

        <PlanCards
          currentPlan={currentPlan}
          isLoading={isLoadingSubscription}
          onSelectPlan={handleSelectPlan}
          period={selectedPeriod}
        />

        <PlanComparison currentPlan={currentPlan} />

        {selectedPlan && selectedPlan !== 'JOGADOR' && (
          <GatewaySelector
            value={selectedGateway}
            onChange={setSelectedGateway}
            isPlanFree={false}
          />
        )}

        {error && (
          <div role="alert" className="mt-4 p-3 bg-red-900/40 border border-red-700 rounded-lg text-sm text-red-300">
            {error}
          </div>
        )}

        {selectedPlan && selectedPlan !== 'JOGADOR' && (
          <div className="mt-6">
            <Btn
              variant="primary"
              className="w-full py-3 text-base font-semibold"
              disabled={!canCheckout}
              aria-disabled={!canCheckout}
              onClick={handleCheckout}
              data-testid="btn-checkout"
            >
              {btnLabel}
            </Btn>
          </div>
        )}
      </div>

      {showCancellationWarning && (
        <>
          {isEligibleForRefund && (
            <div role="status" className="fixed inset-x-0 top-4 z-50 mx-auto max-w-md px-4">
              <div className="rounded-lg bg-blue-900/90 border border-blue-600 p-3 text-sm text-blue-200 shadow-lg">
                <strong>Direito a reembolso total:</strong> sua assinatura foi iniciada há menos de 7 dias.
                Você pode solicitar o cancelamento com reembolso integral (CDC Art. 49 — arrependimento).
              </div>
            </div>
          )}
          <CancellationLockWarning
            positions={subscription?.cancellationLock?.positions ?? []}
            cancellationLockExpiresAt={subscription?.cancellationLock?.expiresAt}
            onConfirm={handleCancelConfirm}
            onLiquidate={handleLiquidate}
            onClose={() => setShowCancellationWarning(false)}
            isCancelling={isCancelling}
          />
        </>
      )}

      <div className="mt-4 text-center">
        <Link
          href={ROUTES.PLANOS_HISTORICO}
          className="text-xs text-text-muted hover:text-text-secondary underline underline-offset-2 transition-colors"
        >
          Ver histórico de assinaturas e pagamentos
        </Link>
      </div>

      {welcomePlan && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="max-w-sm w-full rounded-2xl bg-gray-900 border border-gray-700 p-6 text-center shadow-2xl">
            <div className="text-4xl mb-3">{welcomePlan === 'LENDA' ? '🏆' : '⭐'}</div>
            <h2 className="text-xl font-bold text-white mb-2">
              Bem-vindo ao {welcomePlan === 'LENDA' ? 'Lenda' : 'Craque'}!
            </h2>
            <p className="text-sm text-gray-400 mb-4">
              {welcomePlan === 'LENDA'
                ? 'Você agora tem acesso completo: ordens OCO, short, posições ilimitadas e análises avançadas.'
                : 'Você agora tem acesso a ordens limit, ordens agendadas e posições ampliadas.'}
            </p>
            <Btn
              variant="primary"
              className="w-full"
              onClick={() => {
                setWelcomePlan(null)
                router.replace('/planos')
              }}
            >
              Começar a investir
            </Btn>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  )
}
