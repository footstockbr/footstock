'use client'

import { useQuery } from '@tanstack/react-query'
import type { Candle } from '@/lib/utils/indicators'

export type ChartPeriod = '1H' | '1D' | '1W' | '1S' | '1M' | '3M' | '1Y' | 'ALL'

export interface OFIData {
  timestamp: string
  ofi: number
}

export interface PriceHistoryMeta {
  ticker: string
  period: ChartPeriod
  requestedFrom: string | null
  requestedTo: string | null
  effectiveFrom: string | null
  effectiveTo: string | null
  count: number
  bucketSeconds: number
  granularity: string
  truncated: boolean
  isDelayed: boolean
  delayMinutes: number
  firstTimestamp: string | null
  lastTimestamp: string | null
}

interface RateError extends Error {
  code: 'RATE_001'
  retryAfterSeconds: number
}

export interface UsePriceHistoryResult {
  candles: Candle[]
  ofiData: OFIData[]
  meta: PriceHistoryMeta | null
  isLoading: boolean
  isError: boolean
  isRateLimited: boolean
  isDelayed: boolean
  delayMinutes: number
  isEmpty: boolean
  rateError: RateError | null
  error: Error | null
  refetch: () => void
}

export function usePriceHistory(ticker: string, period: ChartPeriod): UsePriceHistoryResult {
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
          source: 'GBM' | 'REAL'
        }>
        _meta: PriceHistoryMeta
      }>
    },
    staleTime: (period === '1H' || period === '1D') ? 60_000 : 300_000,
    refetchInterval: (period === '1H' || period === '1D') ? 5 * 60 * 1000 : false,
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

  const meta = data?._meta ?? null
  const isDelayed = meta?.isDelayed ?? false
  const delayMinutes = meta?.delayMinutes ?? 0

  const rateError =
    isError && error && (error as RateError).code === 'RATE_001'
      ? (error as RateError)
      : null

  const isRateLimited = !!rateError
  const isEmpty = !isLoading && !isError && candles.length === 0

  return {
    candles,
    ofiData,
    meta,
    isLoading,
    isError,
    isRateLimited,
    isDelayed,
    delayMinutes,
    isEmpty,
    rateError,
    error: error as Error | null,
    refetch,
  }
}
