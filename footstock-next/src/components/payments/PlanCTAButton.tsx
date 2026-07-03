'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  ALREADY_HAS_PLAN_MESSAGE,
  NO_GATEWAY_MESSAGE,
  PENDING_PAYMENT_MESSAGE,
  resolveBlockMessage,
} from '@/components/payments/CheckoutButton'
import { useAnalytics } from '@/hooks/useAnalytics'
import { usePlanGuard } from '@/hooks/usePlanGuard'
import { useCheckoutGateways } from '@/hooks/useCheckoutGateways'
import type { CheckoutGateway } from '@/lib/constants/checkout-gateways'

type PlanType = 'CRAQUE' | 'LENDA'
type CurrentPlan = 'JOGADOR' | 'CRAQUE' | 'LENDA'
type Period = 'MONTHLY' | 'YEARLY'


const TIER_ORDER: Record<string, number> = {
  'JOGADOR': 0,
  'CRAQUE': 1,
  'LENDA': 2,
}

interface PlanCTAButtonProps {
  planType: PlanType
  label: string
  /** Feature que motivou o upgrade prompt (ex: 'planos_page') */
  featureBlocked?: string
  /**
   * Plano atual resolvido server-side (fonte unica de verdade — task-006).
   * Quando fornecido, prevalece sobre o usePlanGuard (SWR) para o tier guard.
   */
  currentPlan?: CurrentPlan
  /**
   * Gateways habilitados resolvidos server-side (credenciais presentes).
   * Quando omitido (ex: PremiumFeatureCard), o hook useCheckoutGateways (SWR)
   * resolve client-side. A pagina /planos fornece para evitar flash + fetch extra.
   */
  enabledGateways?: CheckoutGateway[]
  defaultPeriod?: Period
  'data-testid'?: string
  className?: string
}

/**
 * CTA de upgrade que dispara o checkout DIRETO (sem modal intermediario). O
 * seletor de gateway foi removido porque a lista ja e filtrada server-side para
 * gateways com recorrencia real (na pratica um unico gateway ativo); o primeiro
 * da lista e a prioridade canonica de cobranca. O botao herda o label do card
 * (ex: "Assinar Craque"/"Assinar Lenda") e todos os estados (loading/erro/pendente)
 * ficam inline abaixo dele (Zero Silencio).
 */
export function PlanCTAButton({
  planType,
  label,
  featureBlocked = 'planos_page',
  currentPlan: currentPlanProp,
  enabledGateways: enabledGatewaysProp,
  defaultPeriod = 'MONTHLY',
  className,
  ...props
}: PlanCTAButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const inFlightRef = useRef(false)
  const { track } = useAnalytics()
  const { plan: guardPlan } = usePlanGuard()
  // Prop server-side prevalece; SWR e fallback para usos sem prop (ex: PremiumFeatureCard).
  const currentPlan = currentPlanProp ?? guardPlan

  // Gateways habilitados: prop server-side prevalece; hook (SWR) e o fallback
  // para consumidores client-only. Hook chamado incondicionalmente (rules of hooks).
  const { gateways: hookGateways, isLoading: gatewaysLoading } = useCheckoutGateways()
  const usingProp = enabledGatewaysProp !== undefined
  const enabledGateways = usingProp ? enabledGatewaysProp! : hookGateways
  const gatewaysResolving = !usingProp && gatewaysLoading
  const noGatewayAvailable = !gatewaysResolving && enabledGateways.length === 0

  // EVT-019 + checkout: o antigo botao de confirmacao do modal agora e o proprio
  // botao do card. Faz o tier guard, resolve o gateway e chama o checkout.
  async function handleUpgradeClick() {
    if (inFlightRef.current) return

    // Validar que é upgrade e não lateral/downgrade (N-05).
    const currentTierOrder = TIER_ORDER[currentPlan] ?? -1
    const selectedTierOrder = TIER_ORDER[planType] ?? -1
    if (selectedTierOrder <= currentTierOrder) {
      setPending(null)
      setError(ALREADY_HAS_PLAN_MESSAGE)
      return
    }

    // Gateway: sem seletor — primeiro habilitado (prioridade canonica de cobranca).
    const gateway = enabledGateways[0]
    if (!gateway) {
      setPending(null)
      setError(NO_GATEWAY_MESSAGE)
      return
    }

    inFlightRef.current = true
    setLoading(true)
    setError(null)
    setPending(null)

    // Abrir a aba do gateway de forma sincrona no gesto do usuario (antes de
    // qualquer await) para nao ser bloqueada por popup blocker. opener anulado
    // imediatamente por seguranca.
    const checkoutWindow = window.open('', '_blank')
    if (checkoutWindow) checkoutWindow.opener = null

    // EVT-019 + EVT-020: click de upgrade e selecao do plano.
    track('plan_upgrade_clicked', {
      origin: featureBlocked,
      current_plan: currentPlan,
    })
    track('plan_selected', {
      plan_selected: planType,
      billing_cycle: 'monthly',
      current_plan: currentPlan,
    })

    try {
      const res = await fetch('/api/v1/payments/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planType, gateway, period: defaultPeriod }),
      })

      const json = await res.json()

      if (!res.ok) {
        checkoutWindow?.close()
        setError(resolveBlockMessage(json?.error?.code, json?.error?.message))
        return
      }

      const redirectUrl: unknown = json?.data?.redirectUrl
      if (typeof redirectUrl !== 'string' || redirectUrl.length === 0) {
        checkoutWindow?.close()
        setError('URL de pagamento não recebida. Tente novamente.')
        return
      }

      // C1: short-circuit de pagamento pendente — servidor retorna redirect para
      // /planos?payment=pending (sem chamada ao gateway). Tratar como AVISO
      // distinto, nunca abrir a aba (que so mostraria a propria pagina /planos).
      let isPending = false
      try {
        isPending = new URL(redirectUrl, window.location.origin).searchParams.get('payment') === 'pending'
      } catch {
        isPending = false
      }
      if (isPending) {
        checkoutWindow?.close()
        setPending(PENDING_PAYMENT_MESSAGE)
        return
      }

      if (checkoutWindow && !checkoutWindow.closed) {
        checkoutWindow.location.href = redirectUrl
      } else {
        // Popup bloqueado ou fechado pelo usuario: fallback na mesma aba.
        window.location.href = redirectUrl
      }
    } catch {
      checkoutWindow?.close()
      setError('Erro de conexão. Verifique sua internet e tente novamente.')
    } finally {
      inFlightRef.current = false
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="plan"
        size="md"
        fullWidth
        onClick={handleUpgradeClick}
        disabled={loading || gatewaysResolving || noGatewayAvailable}
        className={className}
        {...props}
      >
        {loading ? 'Abrindo pagamento...' : label}
      </Button>

      {noGatewayAvailable && (
        <p
          data-testid="plan-cta-no-gateway"
          role="alert"
          className="text-xs text-[#F6465D] text-center"
        >
          {NO_GATEWAY_MESSAGE}
        </p>
      )}

      {error && (
        <div
          data-testid="plan-cta-block-reason"
          role="alert"
          className="text-sm text-red-400 bg-red-900/20 p-2 rounded border border-red-700/50"
        >
          {error}
        </div>
      )}

      {pending && (
        <p
          data-testid="plan-cta-pending-notice"
          role="status"
          className="text-xs text-[#F0B90B] text-center"
        >
          {pending}
        </p>
      )}
    </div>
  )
}
