import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PlanType } from '@/lib/enums'
import type { useToast } from '@/hooks/useToast'

type ToastApi = ReturnType<typeof useToast>['toast']

const PAYMENT_ERROR_MESSAGES: Record<string, string> = {
  PAYMENT_050: 'Pagamento não processado. Verifique seus dados ou tente outro gateway de pagamento.',
  PAYMENT_051: 'Erro de segurança. Tente novamente.',
  PAYMENT_053: 'Gateway de pagamento inválido. Escolha entre Mercado Pago, PagSeguro ou PayPal.',
  ORDER_081: 'Você já possui este plano ativo.',
  PAYMENT_080: 'Assinatura não encontrada.',
  SYS_001: 'Erro interno. Tente novamente em instantes.',
  RATE_001: 'Muitas tentativas. Aguarde antes de tentar novamente.',
}

function getErrorMessage(err: { code?: string; retryAfter?: number }): string {
  if (err.code === 'RATE_001' && err.retryAfter) {
    return `Muitas tentativas. Aguarde ${err.retryAfter}s antes de tentar novamente.`
  }
  return PAYMENT_ERROR_MESSAGES[err.code ?? ''] ?? 'Erro interno. Tente novamente em instantes.'
}

interface UsePlansCheckoutParams {
  currentPlan: PlanType
  subscriptionStatus: string | undefined
  subscriptionPlanType: PlanType | undefined
  isEligibleForRefund: boolean | undefined
  fetchSubscription: () => Promise<void>
  toast: ToastApi
}

export function usePlansCheckout({
  currentPlan,
  subscriptionStatus,
  subscriptionPlanType,
  isEligibleForRefund,
  fetchSubscription,
  toast,
}: UsePlansCheckoutParams) {
  const router = useRouter()

  const [selectedPlan, setSelectedPlan] = useState<PlanType | null>(null)
  const [selectedPeriod, setSelectedPeriod] = useState<'monthly' | 'yearly'>('monthly')
  const [selectedGateway, setSelectedGateway] = useState<string | null>(null)
  const [isCheckingOut, setIsCheckingOut] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryAfterCountdown, setRetryAfterCountdown] = useState<number>(0)
  const [showCancellationWarning, setShowCancellationWarning] = useState(false)

  const checkoutInFlight = useRef(false)

  useEffect(() => {
    if (retryAfterCountdown <= 0) return
    const timer = setInterval(() => setRetryAfterCountdown((v) => Math.max(0, v - 1)), 1000)
    return () => clearInterval(timer)
  }, [retryAfterCountdown])

  const handleSelectPlan = (plan: PlanType, period: 'monthly' | 'yearly') => {
    const hierarchy: Record<PlanType, number> = { JOGADOR: 0, CRAQUE: 1, LENDA: 2 }
    if (hierarchy[plan] < hierarchy[currentPlan]) {
      setError(
        'Para fazer downgrade: cancele sua assinatura atual em "Cancelar plano". ' +
        'Seu acesso permanece ativo até a data de renovação e, após expirar, ' +
        'você retorna automaticamente ao plano Jogador (gratuito).'
      )
      return
    }
    setSelectedPlan(plan)
    setSelectedPeriod(period)
    setError(null)
    setSelectedGateway(null)
  }

  const handleCheckout = async () => {
    if (!selectedPlan || !selectedGateway || isCheckingOut || retryAfterCountdown > 0) return
    if (checkoutInFlight.current) return
    checkoutInFlight.current = true

    setIsCheckingOut(true)
    setError(null)

    try {
      const res = await fetch('/api/v1/payments/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planType: selectedPlan, period: selectedPeriod, gateway: selectedGateway }),
      })
      const data = await res.json()
      if (!res.ok) {
        const errCode = data?.error?.code ?? 'SYS_001'
        if (res.status === 429 && data?.error?.retryAfter) {
          setRetryAfterCountdown(data.error.retryAfter)
        }
        setError(getErrorMessage({ code: errCode, retryAfter: data?.error?.retryAfter }))
        return
      }
      if (data?.data?.redirectUrl) {
        toast.info('Redirecionando para o gateway seguro...', 'Você será levado à página de pagamento.')
        setTimeout(() => { window.location.href = data.data.redirectUrl }, 800)
        return
      }
    } catch {
      setError('Sem conexão com a internet. Verifique sua rede.')
    } finally {
      setIsCheckingOut(false)
      checkoutInFlight.current = false
    }
  }

  const handleCancelConfirm = async () => {
    if (isCancelling) return
    setIsCancelling(true)
    try {
      const res = await fetch('/api/v1/subscriptions/me', { method: 'DELETE' })
      if (res.ok) {
        setShowCancellationWarning(false)
        toast.success('Assinatura cancelada', 'Seu plano foi alterado com sucesso.')
        await fetchSubscription()
      } else {
        toast.error('Erro ao cancelar', 'Não foi possível cancelar a assinatura. Tente novamente.')
      }
    } catch {
      toast.error('Erro de conexão', 'Erro ao cancelar assinatura. Verifique sua rede.')
    } finally {
      setIsCancelling(false)
    }
  }

  const handleLiquidate = () => {
    setShowCancellationWarning(false)
    router.push('/carteira?tab=posicoes')
  }

  const isSubscriptionInactive = subscriptionStatus === 'CANCELLED' || subscriptionStatus === 'EXPIRED'
  const isReactivation = isSubscriptionInactive && selectedPlan === subscriptionPlanType
  const canCheckout = !!(selectedPlan && selectedPlan !== 'JOGADOR' && selectedGateway && !isCheckingOut && retryAfterCountdown === 0)
  const btnLabel = isCheckingOut
    ? 'Processando...'
    : retryAfterCountdown > 0
      ? `Aguarde ${retryAfterCountdown}s`
      : isReactivation
        ? 'Reativar plano'
        : 'Continuar para Pagamento'

  return {
    selectedPlan,
    setSelectedPlan,
    selectedPeriod,
    setSelectedPeriod,
    selectedGateway,
    setSelectedGateway,
    isCheckingOut,
    isCancelling,
    error,
    retryAfterCountdown,
    showCancellationWarning,
    setShowCancellationWarning,
    handleSelectPlan,
    handleCheckout,
    handleCancelConfirm,
    handleLiquidate,
    canCheckout,
    btnLabel,
    isSubscriptionInactive,
    isEligibleForRefund: isEligibleForRefund ?? false,
  }
}
