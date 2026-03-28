'use client'

import { useQuery } from '@tanstack/react-query'
import type { Candle } from '@/lib/utils/indicators'

export type ChartPeriod = '1D' | '1W' | '1M' | '3M' | '1Y' | 'ALL'

export interface OFIData {
  timestamp: string
  ofi: number
}

interface RateError extends Error {
  code: 'RATE_001'
  retryAfterSeconds: number
}

export function usePriceHistory(ticker: string, period: ChartPeriod) {
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['price-history', ticker, period],
    queryFn: async () => {
      const res = await fetch(
        `/api/v1/assets/${encodeURIComponent(ticker)}/history?period=${period}`
      )
      if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After') ?? '30'
        const err = Object.assign(new Error('Rate limit excedido'), {
          code: 'RATE_001' as const,
          retryAfterSeconds: parseInt(retryAfter, 10),
        }) as RateError
        throw err
      }
      if (!res.ok) throw new Error('Falha ao buscar histórico')
      return res.json() as Promise<{
        data: Array<{
          timestamp: string
          open: number
          high: number
          low: number
          close: number
          volume: number
          ofi: number
        }>
      }>
    },
    staleTime: period === '1D' ? 60_000 : 300_000,
    refetchInterval: period === '1D' ? 5 * 60 * 1000 : false,
    retry: 2,
    enabled: !!ticker,
  })

  const candles: Candle[] =
    data?.data?.map((p) => ({
      timestamp: new Date(p.timestamp).getTime() / 1000, // lightweight-charts usa unix seconds
      open: p.open,
      high: p.high,
      low: p.low,
      close: p.close,
      volume: p.volume,
    })) ?? []

  const ofiData: OFIData[] =
    data?.data?.map((p) => ({ timestamp: p.timestamp, ofi: p.ofi })) ?? []

  const rateError =
    isError && error && (error as RateError).code === 'RATE_001'
      ? (error as RateError)
      : null

  const isRateLimited = !!rateError

  return {
    candles,
    ofiData,
    isLoading,
    isError,
    isRateLimited,
    rateError,
    error,
    refetch,
  }
}
