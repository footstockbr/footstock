'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useAssetStatus } from '@/hooks/useAssetStatus'
import { ROUTES } from '@/lib/constants/routes'

export function useCircuitBreakerAlert(ticker: string) {
  const { isHalted, haltReason } = useAssetStatus(ticker)
  const previousIsHalted = useRef(false)
  const isFirstRender = useRef(true)
  const router = useRouter()

  useEffect(() => {
    // Skip toast on initial page load — user already sees the SUSPENSO badge
    if (isFirstRender.current) {
      isFirstRender.current = false
      previousIsHalted.current = isHalted
      return
    }

    // Only toast on runtime transition false → true
    if (isHalted && !previousIsHalted.current) {
      toast.warning(
        `Ativo ${ticker} suspenso temporariamente por circuit breaker.${haltReason ? ` Motivo: ${haltReason}` : ''}`,
        {
          duration: Infinity,
          action: {
            label: 'Ver Mercado',
            onClick: () => router.push(ROUTES.MERCADO),
          },
        }
      )
    }
    previousIsHalted.current = isHalted
  }, [isHalted, haltReason, ticker, router])
}
