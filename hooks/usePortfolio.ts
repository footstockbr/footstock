'use client'
// ============================================================================
// Foot Stock — hooks/usePortfolio.ts (module-15)
// React Query hooks para o portfólio: summary, history, positions.
// Rastreabilidade: INT-023, INT-024, INT-034
// ============================================================================

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api/client'
import { ROUTES } from '@/lib/constants/routes'
import { useToast } from '@/hooks/useToast'
import type { PortfolioSummary, HistoryPoint, PositionWithPnL } from '@/types/portfolio'
import type { PortfolioPeriod } from '@/lib/enums'

const STALE_TIME_SUMMARY = 30_000 // 30s for summary (match API Cache-Control)
const STALE_TIME_HISTORY = 60_000 // 60s for history (match API Cache-Control)
const GC_TIME = 300_000
const RETRY = 2

// ---------------------------------------------------------------------------
// usePortfolioSummary
// ---------------------------------------------------------------------------

export function usePortfolioSummary() {
  const router = useRouter()

  const query = useQuery<PortfolioSummary>({
    queryKey: ['portfolio-summary'],
    queryFn: () =>
      apiClient
        .get<{ success: boolean; data: PortfolioSummary }>('/api/v1/positions/summary')
        .then((r) => r.data.data),
    staleTime: STALE_TIME_SUMMARY,
    gcTime: GC_TIME,
    retry: RETRY,
  })

  useEffect(() => {
    if (query.error) {
      const status = (query.error as { response?: { status?: number } }).response?.status
      if (status === 401) router.push(ROUTES.LOGIN)
    }
  }, [query.error, router])

  return query
}

// ---------------------------------------------------------------------------
// usePortfolioHistory
// ---------------------------------------------------------------------------

export function usePortfolioHistory(period: PortfolioPeriod) {
  const router = useRouter()

  const query = useQuery<HistoryPoint[]>({
    queryKey: ['portfolio-history', period],
    queryFn: () =>
      apiClient
        .get<{ success: boolean; data: HistoryPoint[] }>('/api/v1/portfolio/history', {
          params: { period },
        })
        .then((r) => r.data.data),
    staleTime: STALE_TIME_HISTORY,
    gcTime: GC_TIME,
    retry: RETRY,
  })

  useEffect(() => {
    if (query.error) {
      const status = (query.error as { response?: { status?: number } }).response?.status
      if (status === 401) router.push(ROUTES.LOGIN)
    }
  }, [query.error, router])

  return query
}

// ---------------------------------------------------------------------------
// usePositions
// ---------------------------------------------------------------------------

export function usePositions() {
  const router = useRouter()

  const query = useQuery<PositionWithPnL[]>({
    queryKey: ['positions'],
    queryFn: () =>
      apiClient
        .get<{ success: boolean; data: PositionWithPnL[] }>('/api/v1/positions')
        .then((r) => r.data.data),
    staleTime: STALE_TIME_SUMMARY,
    gcTime: GC_TIME,
    retry: RETRY,
  })

  useEffect(() => {
    if (query.error) {
      const status = (query.error as { response?: { status?: number } }).response?.status
      if (status === 401) router.push(ROUTES.LOGIN)
    }
  }, [query.error, router])

  return query
}

// ---------------------------------------------------------------------------
// useInvalidatePortfolio — invalida cache manualmente (ex: após nova ordem)
// ---------------------------------------------------------------------------

export function useInvalidatePortfolio() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: ['positions'] })
    queryClient.invalidateQueries({ queryKey: ['portfolio-summary'] })
    queryClient.invalidateQueries({ queryKey: ['portfolio-history'] })
  }
}

// ---------------------------------------------------------------------------
// useInvalidateOnMarginCall — reage ao evento MARGIN_CALL_ALERT via BroadcastChannel
// ---------------------------------------------------------------------------

export function useInvalidateOnMarginCall() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  useEffect(() => {
    // Fallback gracioso para SSR e browsers sem BroadcastChannel
    if (typeof BroadcastChannel === 'undefined') return

    const channel = new BroadcastChannel('foot-stock-notifications')

    const handler = (event: MessageEvent<{ type: string; ticker?: string }>) => {
      if (event.data?.type === 'MARGIN_CALL_ALERT') {
        const ticker = event.data?.ticker ?? ''
        queryClient.invalidateQueries({ queryKey: ['positions'] })
        queryClient.invalidateQueries({ queryKey: ['portfolio-summary'] })
        toast.error(
          'Margin Call',
          `Posição em ${ticker} liquidada por margem insuficiente.`,
        )
      }
    }

    channel.addEventListener('message', handler)
    return () => {
      channel.removeEventListener('message', handler)
      channel.close()
    }
  }, [queryClient, toast])
}
