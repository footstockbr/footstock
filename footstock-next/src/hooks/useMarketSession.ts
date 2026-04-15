'use client'

// ============================================================================
// Foot Stock — useMarketSession + useCountdown
// Polling do endpoint /api/v1/market/session a cada 15s.
// useCountdown decrementa localmente a cada 1s entre polls para evitar
// polling a cada segundo.
// ============================================================================

import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getMarketSession, type MarketSessionData } from '@/lib/services/session-service'
import { MarketSession } from '@/lib/constants/market'

/**
 * Hook de countdown local — decrementa a cada segundo partindo de initialSeconds.
 * Reinicia automaticamente quando initialSeconds muda (novo poll).
 */
export function useCountdown(initialSeconds: number): number {
  const [remaining, setRemaining] = useState(initialSeconds)
  const ref = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    setRemaining(initialSeconds)
    if (ref.current) clearInterval(ref.current)

    ref.current = setInterval(() => {
      setRemaining(prev => Math.max(0, prev - 1))
    }, 1_000)

    return () => {
      if (ref.current) clearInterval(ref.current)
    }
  }, [initialSeconds])

  return remaining
}

export interface UseMarketSessionReturn {
  session: MarketSession
  countdownSeconds: number
  nextSession: MarketSession
  transitionAt: string | null
  isMarketOpen: boolean
  isLoading: boolean
  error: Error | null
}

/**
 * Hook principal — polling do endpoint de sessão a cada 15s.
 * Combina React Query para o fetch com useCountdown para decremento local.
 */
export function useMarketSession(): UseMarketSessionReturn {
  const { data, isLoading, error } = useQuery<MarketSessionData, Error>({
    queryKey: ['market-session'],
    queryFn: getMarketSession,
    refetchInterval: 15_000,
    staleTime: 10_000,
    retry: 2,
  })

  const countdown = useCountdown(data?.countdownSeconds ?? 0)

  return {
    session: data?.session ?? MarketSession.CLOSED,
    countdownSeconds: countdown,
    nextSession: data?.nextSession ?? MarketSession.TRADING,
    transitionAt: data?.transitionAt ?? null,
    isMarketOpen: data?.isMarketOpen ?? false,
    isLoading,
    error: error ?? null,
  }
}
