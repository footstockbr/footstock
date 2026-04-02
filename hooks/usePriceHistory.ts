'use client'

// ============================================================================
// Foot Stock — usePriceHistory Hook
// React Query hook para buscar histórico OHLC de um ativo.
// ============================================================================

import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/constants/query-keys'

export type PricePeriod = '1H' | '1D' | '1W' | '1M' | '3M' | '1Y'

export interface OHLCBar {
  time: number // Unix timestamp em segundos (exigido pelo lightweight-charts)
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface PriceHistoryResponse {
  success: boolean
  data: Array<{
    timestamp: string
    open: string | number
    high: string | number
    low: string | number
    close: string | number
    volume: string | number
  }>
  _meta: {
    period: PricePeriod
    count: number
    granularity: string
    delayed: boolean
    delayMs: number
  }
}

async function fetchPriceHistory(ticker: string, period: PricePeriod): Promise<OHLCBar[]> {
  const res = await fetch(`/api/v1/assets/${ticker}/history?period=${period}`, {
    credentials: 'include',
  })

  if (!res.ok) {
    throw new Error(`Erro ao buscar histórico: ${res.status}`)
  }

  const body: PriceHistoryResponse = await res.json()

  if (!body.success) {
    throw new Error('Falha ao carregar histórico de preços')
  }

  return body.data.map((bar) => ({
    time: Math.floor(new Date(bar.timestamp).getTime() / 1_000),
    open: Number(bar.open),
    high: Number(bar.high),
    low: Number(bar.low),
    close: Number(bar.close),
    volume: Number(bar.volume),
  }))
}

export function usePriceHistory(ticker: string, period: PricePeriod) {
  return useQuery<OHLCBar[], Error>({
    queryKey: queryKeys.assets.priceHistory(ticker, period),
    queryFn: () => fetchPriceHistory(ticker, period),
    staleTime: 60_000,
    refetchInterval: period === '1D' || period === '1H' ? 300_000 : false,
    enabled: Boolean(ticker),
  })
}
