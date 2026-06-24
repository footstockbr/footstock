'use client'

import useSWR from 'swr'
import {
  type CheckoutGateway,
  isKnownCheckoutGateway,
} from '@/lib/constants/checkout-gateways'

interface GatewaysResponse {
  data: { gateways: string[] }
}

interface UseCheckoutGatewaysResult {
  /** Gateways habilitados (credenciais presentes). [] enquanto carrega ou em erro. */
  gateways: CheckoutGateway[]
  isLoading: boolean
  isError: boolean
}

async function fetchEnabledGateways(): Promise<CheckoutGateway[]> {
  const res = await fetch('/api/v1/payments/gateways')
  if (!res.ok) throw new Error(`checkout-gateways: /api/v1/payments/gateways respondeu ${res.status}`)
  const json = (await res.json()) as GatewaysResponse
  return (json.data?.gateways ?? []).filter(isKnownCheckoutGateway)
}

/**
 * Resolve os gateways de checkout habilitados para consumidores client que nao
 * recebem a lista server-side como prop (ex.: subscription-manage,
 * PremiumFeatureCard). A pagina /planos (server) passa a lista direto como prop
 * e dispensa este hook.
 */
export function useCheckoutGateways(): UseCheckoutGatewaysResult {
  const { data, isLoading, error } = useSWR<CheckoutGateway[]>(
    'checkout-gateways',
    fetchEnabledGateways,
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  )

  return {
    gateways: data ?? [],
    isLoading,
    isError: Boolean(error),
  }
}
