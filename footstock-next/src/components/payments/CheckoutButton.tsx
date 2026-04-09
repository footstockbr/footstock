'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type PlanType = 'CRAQUE' | 'LENDA'
type Gateway = 'MERCADO_PAGO' | 'PAGSEGURO' | 'PAYPAL'
type Period = 'MONTHLY' | 'YEARLY'

const GATEWAY_LABELS: Record<Gateway, string> = {
  MERCADO_PAGO: 'Mercado Pago',
  PAGSEGURO: 'PagSeguro',
  PAYPAL: 'PayPal',
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

  async function handleCheckout() {
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
    <div className="flex flex-col gap-2">
      <Select
        value={gateway}
        onValueChange={(v) => setGateway(v as Gateway)}
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
        data-testid={`checkout-button-${planType.toLowerCase()}`}
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
  )
}
