'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PixQRModal } from '@/components/payments/PixQRModal'
import { useAnalytics } from '@/hooks/useAnalytics'
import { usePlanGuard } from '@/hooks/usePlanGuard'


const TIER_ORDER: Record<string, number> = {
  'JOGADOR': 0,
  'CRAQUE': 1,
  'LENDA': 2,
}

type PlanType = 'CRAQUE' | 'LENDA'
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
}

export function CheckoutButton({
  planType,
  label,
  defaultPeriod = 'MONTHLY',
  className,
}: CheckoutButtonProps) {
  const [gateway, setGateway] = useState<Gateway>('MERCADO_PAGO')
  const [period] = useState<Period>(defaultPeriod)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pixOpen, setPixOpen] = useState(false)
  const { track } = useAnalytics()
  const { plan: currentPlan } = usePlanGuard()
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
      setError('Você já possui este plano ou superior.')
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

    try {
      const res = await fetch('/api/v1/payments/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planType, gateway, period }),
      })

      const json = await res.json()

      if (!res.ok) {
        setError(json?.error?.message ?? 'Erro ao iniciar pagamento.')
        return
      }

      const redirectUrl: string = json?.data?.redirectUrl
      if (redirectUrl) {
        window.location.href = redirectUrl
      } else {
        setError('URL de pagamento não recebida. Tente novamente.')
      }
    } catch {
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
        <Select
          value={gateway}
          onValueChange={handleGatewayChange}
          disabled={loading}
        >
          <SelectTrigger
            className="bg-[#1E2329] border-[rgba(240,185,11,.2)] text-[#EAECEF] text-sm h-9"
            data-testid="checkout-gateway-select"
          >
            <SelectValue placeholder="Forma de pagamento" />
          </SelectTrigger>
          <SelectContent className="bg-[#1E2329] border-[rgba(240,185,11,.2)]">
            {(Object.keys(GATEWAY_LABELS) as Gateway[]).map((g) => (
              <SelectItem
                key={g}
                value={g}
                className="text-[#EAECEF] focus:bg-[rgba(240,185,11,.1)]"
              >
                {GATEWAY_LABELS[g]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          data-testid="plan-checkout-modal-checkout-confirm"
          variant="plan"
          size="md"
          fullWidth
          disabled={loading}
          onClick={handleCheckout}
          className={className}
        >
          {loading ? 'Redirecionando...' : (label ?? `Assinar ${planType === 'CRAQUE' ? 'Craque' : 'Lenda'}`)}
        </Button>

        {error && (
          <p className="text-xs text-[#F6465D] text-center" role="alert">
            {error}
          </p>
        )}
      </div>
    </>
  )
}
