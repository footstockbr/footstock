import { useCallback, useEffect, useState } from 'react'
import type { PlanType } from '@/lib/enums'

export interface SubscriptionData {
  planType: PlanType
  status: string
  isEligibleForRefund: boolean
  daysUntilExpiry: number
  cancellationLock?: {
    expiresAt: string
    hoursRemaining: number
    requiresLiquidation: boolean
    positions?: Array<{ ativo: string; tipo: string; quantidade: number; valorEstimado: number }>
  } | null
  bonusCredit?: { amount: number; scheduledAt: string; credited: boolean }
}

const FALLBACK: SubscriptionData = {
  planType: 'JOGADOR',
  status: 'ACTIVE',
  isEligibleForRefund: false,
  daysUntilExpiry: 0,
}

export function useSubscriptionData() {
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null)
  const [isLoadingSubscription, setIsLoadingSubscription] = useState(true)
  const [networkError, setNetworkError] = useState(false)

  const fetchSubscription = useCallback(async () => {
    setNetworkError(false)
    try {
      const res = await fetch('/api/v1/subscriptions/me')
      if (res.ok) {
        const data = await res.json()
        setSubscription(data.data ?? FALLBACK)
      } else {
        setSubscription(FALLBACK)
      }
    } catch {
      setNetworkError(true)
      setSubscription(FALLBACK)
    } finally {
      setIsLoadingSubscription(false)
    }
  }, [])

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (isLoadingSubscription) {
        setIsLoadingSubscription(false)
        setNetworkError(true)
        setSubscription(FALLBACK)
      }
    }, 3000)
    fetchSubscription()
    return () => clearTimeout(timeout)
  }, [fetchSubscription, isLoadingSubscription])

  return {
    subscription,
    isLoadingSubscription,
    networkError,
    setIsLoadingSubscription,
    setNetworkError,
    fetchSubscription,
  }
}
