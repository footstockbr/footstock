'use client'

// T-022/T9: hook expõe snapshot SSE com estado de conexão (LIVE|DELAYED|BUFFERING).
// O delay é aplicado server-side — o cliente apenas consome o dado já atrasado.
// Preserva o último snapshot válido durante BUFFERING; nunca fallback para realtime.
// NXAUTH-04B: token vem de /api/v1/motor/token (Auth.js → motor JWT bridge).
import { useEffect, useRef, useState } from 'react'

import { fetchMotorToken, scheduleMotorTokenRefresh } from '@/lib/motor-token-client'
import type { MarketStreamState, ConnectionState } from './useAllMarketTicks'

export interface MarketTick {
  ticker: string
  bid: number
  ask: number
  spread: number
  lastPrice: number
  change24h: number // changePercent do motor (variação vs closePrice anterior)
  isHalted: boolean
  haltReason?: string | null
  estimatedResume?: string | null
  timestamp: number
  state: MarketStreamState
  delayed: boolean
  delayMs: number
  snapshotAgeMs: number | null
  isStale: boolean
}

interface RawMarketStreamTick {
  ticker: string
  state: MarketStreamState
  delayed: boolean
  delayMs: number
  price: number | null
  changePercent: number | null
  timestamp: number | null
  snapshotAgeMs: number | null
  isHalted?: boolean
  haltReason?: string | null
  estimatedResume?: number | null
}

interface TickPayload {
  type: string
  ticks: RawMarketStreamTick[]
}

export interface UseMarketTickResult {
  tick: MarketTick | null
  connectionState: ConnectionState
  isBuffering: boolean
  isOffline: boolean
  error: Error | null
}

const OFFLINE_ERROR_THRESHOLD = 3
const OFFLINE_SILENCE_MS = 10_000

export function useMarketTick(ticker: string): UseMarketTickResult {
  const [tick, setTick] = useState<MarketTick | null>(null)
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting')
  const [isBuffering, setIsBuffering] = useState(false)
  const [isOffline, setIsOffline] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const esRef = useRef<EventSource | null>(null)
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const errorCountRef = useRef(0)
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let closed = false

    function clearRefreshTimer() {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
    }

    function clearSilenceTimer() {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current)
        silenceTimerRef.current = null
      }
    }

    function closeStream() {
      esRef.current?.close()
      esRef.current = null
    }

    function resetSilenceTimer() {
      clearSilenceTimer()
      silenceTimerRef.current = setTimeout(() => {
        if (closed) return
        setIsOffline(true)
        setConnectionState('error')
      }, OFFLINE_SILENCE_MS)
    }

    async function connect() {
      const minted = await fetchMotorToken()
      if (!minted || closed) return

      setConnectionState('connecting')
      errorCountRef.current = 0
      setError(null)
      setIsOffline(false)
      setIsBuffering(false)

      const baseUrl = process.env.NEXT_PUBLIC_STREAM_URL ?? 'https://stream.footstock.com.br'
      const url = `${baseUrl}/stream/market?token=${encodeURIComponent(minted.token)}`
      const es = new EventSource(url)
      esRef.current = es

      es.onopen = () => {
        if (closed) return
        setConnectionState('open')
        errorCountRef.current = 0
        setError(null)
        setIsOffline(false)
        resetSilenceTimer()
      }

      es.onmessage = (event) => {
        if (closed) return
        resetSilenceTimer()

        try {
          const payload = JSON.parse(event.data as string) as TickPayload
          if (payload.type !== 'TICK') return

          const raw = payload.ticks.find((t) => t.ticker === ticker)
          if (!raw) return

          if (raw.state === 'BUFFERING') {
            setIsBuffering(true)
            setTick((prev) =>
              prev
                ? {
                    ...prev,
                    state: 'BUFFERING',
                    delayed: raw.delayed,
                    delayMs: raw.delayMs,
                    snapshotAgeMs: null,
                    isStale: true,
                  }
                : null
            )
            return
          }

          const price = raw.price ?? 0
          setTick({
            ticker: raw.ticker,
            lastPrice: price,
            bid: price * 0.999,
            ask: price * 1.001,
            spread: price * 0.002,
            change24h: raw.changePercent ?? 0,
            isHalted: raw.isHalted ?? false,
            haltReason: raw.haltReason ?? null,
            estimatedResume: raw.estimatedResume ? new Date(raw.estimatedResume).toISOString() : null,
            timestamp: raw.timestamp ?? Date.now(),
            state: raw.state,
            delayed: raw.delayed,
            delayMs: raw.delayMs,
            snapshotAgeMs: raw.snapshotAgeMs ?? null,
            isStale: false,
          })
          setIsBuffering(false)
        } catch (err) {
          setError(err instanceof Error ? err : new Error('Falha ao interpretar tick'))
        }
      }

      es.onerror = () => {
        if (closed) return
        errorCountRef.current += 1
        setConnectionState('error')
        setError(new Error('Erro na conexão de streaming de mercado'))
        if (errorCountRef.current >= OFFLINE_ERROR_THRESHOLD) {
          setIsOffline(true)
        }
      }

      refreshTimerRef.current = scheduleMotorTokenRefresh(minted.expiresAt, () => {
        if (closed) return
        closeStream()
        connect()
      })
    }

    connect()

    return () => {
      closed = true
      clearRefreshTimer()
      clearSilenceTimer()
      closeStream()
      setConnectionState('closed')
    }
  }, [ticker])

  return { tick, connectionState, isBuffering, isOffline, error }
}
