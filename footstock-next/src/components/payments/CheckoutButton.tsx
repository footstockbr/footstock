'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/select'
import { PixQRModal } from '@/components/payments/PixQRModal'
import { useAnalytics } from '@/hooks/useAnalytics'
import { usePlanGuard } from '@/hooks/usePlanGuard'


const TIER_ORDER: Record<string, number> = {
  'JOGADOR': 0,
  'CRAQUE': 1,
  'LENDA': 2,
}

// Mapeia codigos de bloqueio do servidor (PlanService) para copy humana especifica,
// eliminando o erro generico (criterio Zero Silencio). Codigos: PlanService.ts.
export const CHECKOUT_BLOCK_MESSAGES: Record<string, string> = {
  'AUTH-009': 'Contas administrativas não podem contratar planos.',
  'ORDER_081': 'Você já possui uma assinatura ativa para este plano.',
  'PAYMENT_054': 'Este plano não está disponível a partir do seu plano atual.',
  'DECLINED': 'Pagamento recusado. Verifique os dados ou tente outro método de pagamento.',
}

// Bloqueio cliente (tier guard) — compartilhado com PlanCTAButton.
export const ALREADY_HAS_PLAN_MESSAGE = 'Você já possui este plano ou superior.'

// Estado de pagamento pendente (C1): NAO e bloqueio, e aviso de que ja existe
// uma intencao de pagamento em aberto. Comunicado de forma distinta do erro.
export const PENDING_PAYMENT_MESSAGE =
  'Você já tem um pagamento pendente para este plano. Conclua ou aguarde a confirmação antes de tentar novamente.'

function resolveBlockMessage(code: string | undefined, fallback: string | undefined): string {
  if (code && CHECKOUT_BLOCK_MESSAGES[code]) return CHECKOUT_BLOCK_MESSAGES[code]
  return fallback ?? 'Não foi possível iniciar o pagamento. Tente novamente.'
}

type PlanType = 'CRAQUE' | 'LENDA'
type CurrentPlan = 'JOGADOR' | 'CRAQUE' | 'LENDA'
type Gateway = 'MERCADO_PAGO' | 'PAGSEGURO' | 'PAYPAL' | 'PIX'
type Period = 'MONTHLY' | 'YEARLY'

const GATEWAY_LABELS: Record<Gateway, string> = {
  MERCADO_PAGO: 'Mercado Pago',
  PAGSEGURO: 'PagSeguro',
  PAYPAL: 'PayPal',
  PIX: 'Pix (Mercado Pago)',
}

interface CheckoutButtonProps {
  planType: PlanType
  label?: string
  defaultPeriod?: Period
  className?: string
  /**
   * Plano atual resolvido server-side (fonte unica de verdade — task-006).
   * Quando fornecido, prevalece sobre o usePlanGuard (SWR) para o tier guard,
   * eliminando a divergencia com o texto do card de /planos (C2/H5).
   */
  currentPlan?: CurrentPlan
}

export function CheckoutButton({
  planType,
  label,
  defaultPeriod = 'MONTHLY',
  className,
  currentPlan: currentPlanProp,
}: CheckoutButtonProps) {
  const [gateway, setGateway] = useState<Gateway>('MERCADO_PAGO')
  const [period] = useState<Period>(defaultPeriod)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [pixOpen, setPixOpen] = useState(false)
  const { track } = useAnalytics()
  const { plan: guardPlan } = usePlanGuard()
  // Prop server-side prevalece; SWR e fallback para usos sem prop (ex: subscription-manage).
  const currentPlan = currentPlanProp ?? guardPlan
  const planSelectedTracked = useRef(false)

  // EVT-021: payment_gateway_selected — when user changes the gateway
  function handleGatewayChange(value: string) {
    const newGateway = value as Gateway
    setGateway(newGateway)
    // Only track non-PIX gateways (PIX maps to Mercado Pago internally)
    const trackableGateway = newGateway === 'PIX' ? 'MERCADO_PAGO' : newGateway
    track('payment_gateway_selected', {
      gateway: trackableGateway as 'MERCADO_PAGO' | 'PAGSEGURO' | 'PAYPAL',
      plan: currentPlan,
    })
  }

  async function handleCheckout() {
    // Validar que é upgrade e não lateral/downgrade (N-05)
    const currentTierOrder = TIER_ORDER[currentPlan] ?? -1
    const selectedTierOrder = TIER_ORDER[planType] ?? -1
    if (selectedTierOrder <= currentTierOrder) {
      setPending(null)
      setError(ALREADY_HAS_PLAN_MESSAGE)
      return
    }

    // EVT-020: plan_selected — track once per checkout session
    if (!planSelectedTracked.current) {
      track('plan_selected', {
        plan_selected: planType,
        billing_cycle: 'monthly',
        current_plan: currentPlan,
      })
      planSelectedTracked.current = true
    }

    // Pix opens inline modal — no redirect
    if (gateway === 'PIX') {
      setPixOpen(true)
      return
    }

    setLoading(true)
    setError(null)
    setPending(null)

    // Abrir a aba do gateway de forma sincrona no gesto do usuario para nao ser
    // bloqueada por popup blocker (a URL so fica disponivel apos o fetch async).
    // Sem 'noopener' aqui: ele faz window.open retornar null e perderiamos o handle
    // para setar location depois. opener e anulado abaixo apos definir a URL.
    const checkoutWindow = window.open('', '_blank')

    try {
      const res = await fetch('/api/v1/payments/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planType, gateway, period }),
      })

      const json = await res.json()

      if (!res.ok) {
        checkoutWindow?.close()
        setError(resolveBlockMessage(json?.error?.code, json?.error?.message))
        return
      }

      const redirectUrl: string = json?.data?.redirectUrl

      // C1: short-circuit de pagamento pendente — o servidor retorna 201 com um
      // redirect para /planos?payment=pending (sem chamada ao gateway). Tratar como
      // AVISO distinto, nunca abrir a aba (que so mostraria a propria pagina /planos).
      if (redirectUrl && /[?&]payment=pending\b/.test(redirectUrl)) {
        checkoutWindow?.close()
        setPending(PENDING_PAYMENT_MESSAGE)
        return
      }

      if (redirectUrl) {
        if (checkoutWindow) {
          checkoutWindow.opener = null
          checkoutWindow.location.href = redirectUrl
        } else {
          // Popup bloqueado: fallback para redirect na mesma aba.
          window.location.href = redirectUrl
        }
      } else {
        checkoutWindow?.close()
        setError('URL de pagamento não recebida. Tente novamente.')
      }
    } catch {
      checkoutWindow?.close()
      setError('Erro de conexão. Verifique sua internet e tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {pixOpen && (
        <PixQRModal
          planType={planType}
          period={period.toLowerCase() as 'monthly' | 'yearly'}
          onClose={() => setPixOpen(false)}
        />
      )}

      <div className="flex flex-col gap-2">
        <NativeSelect
          value={gateway}
          onValueChange={handleGatewayChange}
          disabled={loading}
          placeholder="Forma de pagamento"
          options={(Object.keys(GATEWAY_LABELS) as Gateway[]).map((g) => ({
            value: g,
            label: GATEWAY_LABELS[g],
          }))}
          triggerClassName="bg-[#1E2329] border-[rgba(240,185,11,.2)] text-[#EAECEF] text-sm h-9"
          data-testid="checkout-gateway-select"
        />

        <Button
          data-testid="plan-checkout-modal-checkout-confirm"
          variant="plan"
          size="md"
          fullWidth
          disabled={loading}
          onClick={handleCheckout}
          className={className}
        >
          {loading ? 'Abrindo pagamento...' : (label ?? `Assinar ${planType === 'CRAQUE' ? 'Craque' : 'Lenda'}`)}
        </Button>

        {error && (
          <p
            data-testid="checkout-block-reason"
            className="text-xs text-[#F6465D] text-center"
            role="alert"
          >
            {error}
          </p>
        )}

        {pending && (
          <p
            data-testid="checkout-pending-notice"
            className="text-xs text-[#F0B90B] text-center"
            role="status"
          >
            {pending}
          </p>
        )}
      </div>
    </>
  )
}
