'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/select'
import { useAnalytics } from '@/hooks/useAnalytics'
import { usePlanGuard } from '@/hooks/usePlanGuard'
import { useCheckoutGateways } from '@/hooks/useCheckoutGateways'
import {
  type CheckoutGateway,
  CHECKOUT_GATEWAY_LABELS,
  getCheckoutGatewayOptions,
} from '@/lib/constants/checkout-gateways'


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

// Estado em que nenhum gateway esta configurado/disponivel (Zero Silencio: o
// usuario nunca ve um select vazio mudo).
export const NO_GATEWAY_MESSAGE =
  'Pagamento temporariamente indisponível. Tente novamente em alguns minutos.'

function resolveBlockMessage(code: string | undefined, fallback: string | undefined): string {
  if (code && CHECKOUT_BLOCK_MESSAGES[code]) return CHECKOUT_BLOCK_MESSAGES[code]
  return fallback ?? 'Não foi possível iniciar o pagamento. Tente novamente.'
}

type PlanType = 'CRAQUE' | 'LENDA'
type CurrentPlan = 'JOGADOR' | 'CRAQUE' | 'LENDA'
// Gateway types/labels e a lista do que e oferecido vivem em
// @/lib/constants/checkout-gateways (fonte unica de verdade). "PIX" NAO e um
// gateway — e um metodo dentro do Mercado Pago — por isso saiu do seletor.
type Gateway = CheckoutGateway
type Period = 'MONTHLY' | 'YEARLY'

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
  /**
   * Gateways habilitados resolvidos server-side (credenciais presentes).
   * Quando fornecido, prevalece sobre o useCheckoutGateways (SWR), evitando o
   * flash de carregamento na pagina /planos (server component). Consumidores
   * client-only (subscription-manage, PremiumFeatureCard) omitem e usam o hook.
   */
  enabledGateways?: CheckoutGateway[]
}

export function CheckoutButton({
  planType,
  label,
  defaultPeriod = 'MONTHLY',
  className,
  currentPlan: currentPlanProp,
  enabledGateways: enabledGatewaysProp,
}: CheckoutButtonProps) {
  const [period] = useState<Period>(defaultPeriod)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const { track } = useAnalytics()
  const { plan: guardPlan } = usePlanGuard()
  // Prop server-side prevalece; SWR e fallback para usos sem prop (ex: subscription-manage).
  const currentPlan = currentPlanProp ?? guardPlan
  const planSelectedTracked = useRef(false)

  // Gateways habilitados: prop server-side prevalece; hook (SWR) e o fallback
  // para consumidores client-only.
  const { gateways: hookGateways, isLoading: gatewaysLoading } = useCheckoutGateways()
  const usingProp = enabledGatewaysProp !== undefined
  const enabledGateways = usingProp ? enabledGatewaysProp! : hookGateways
  const gatewaysResolving = !usingProp && gatewaysLoading

  const [gateway, setGateway] = useState<Gateway | ''>(enabledGateways[0] ?? '')

  // Mantem o gateway selecionado coerente com a lista habilitada: ao resolver a
  // lista (ou se a selecao atual sair dela), seleciona o primeiro disponivel.
  useEffect(() => {
    if (enabledGateways.length === 0) {
      if (gateway !== '') setGateway('')
      return
    }
    if (!gateway || !enabledGateways.includes(gateway)) {
      setGateway(enabledGateways[0])
    }
  }, [enabledGateways, gateway])

  const noGatewayAvailable = !gatewaysResolving && enabledGateways.length === 0

  // EVT-021: payment_gateway_selected — when user changes the gateway
  function handleGatewayChange(value: string) {
    const newGateway = value as Gateway
    setGateway(newGateway)
    track('payment_gateway_selected', {
      gateway: newGateway as 'MERCADO_PAGO' | 'PAGSEGURO' | 'PAYPAL',
      plan: currentPlan,
    })
  }

  async function handleCheckout() {
    if (!gateway) {
      setError(NO_GATEWAY_MESSAGE)
      return
    }

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
    <div className="flex flex-col gap-2">
      {/* metodos de pagamento visiveis ANTES de abrir a lista suspensa, para o
          usuario saber que existem varias formas. Chips de texto por enquanto; quando
          houver assets de logo dos provedores em public/payments/, trocar por <Image>. */}
      {enabledGateways.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" aria-hidden="true">
          {enabledGateways.map((g) => (
            <span
              key={g}
              className="inline-flex items-center rounded-md border border-[rgba(240,185,11,.2)] bg-[#181A20] px-2 py-1 text-[11px] font-medium text-[#C0C4CE]"
            >
              {CHECKOUT_GATEWAY_LABELS[g]}
            </span>
          ))}
        </div>
      )}

      {gatewaysResolving ? (
        <div
          data-testid="checkout-gateway-loading"
          className="h-9 w-full animate-pulse rounded-md border border-[rgba(240,185,11,.2)] bg-[#1E2329]"
          role="status"
          aria-label="Carregando formas de pagamento"
        />
      ) : noGatewayAvailable ? (
        <p
          data-testid="checkout-no-gateway"
          className="text-xs text-[#F6465D] text-center"
          role="alert"
        >
          {NO_GATEWAY_MESSAGE}
        </p>
      ) : (
        <NativeSelect
          value={gateway}
          onValueChange={handleGatewayChange}
          disabled={loading}
          placeholder="Forma de pagamento"
          options={getCheckoutGatewayOptions(enabledGateways)}
          triggerClassName="bg-[#1E2329] border-[rgba(240,185,11,.2)] text-[#EAECEF] text-sm h-9"
          data-testid="checkout-gateway-select"
        />
      )}

      <Button
        type="button"
        data-testid="plan-checkout-modal-checkout-confirm"
        variant="plan"
        size="md"
        fullWidth
        disabled={loading || gatewaysResolving || noGatewayAvailable}
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
  )
}
