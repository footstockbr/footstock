'use client'

// ============================================================================
// FootStock — useAllMarketTicks
// Assina o SSE /stream/market no motor Railway e retorna map ticker → snapshot.
// T9: expõe estado de conexão, buffering, offline e erro; preserva último
// snapshot válido durante BUFFERING sem substituí-lo por realtime.
// NXAUTH-04B: token vem de /api/v1/motor/token (Auth.js → motor JWT bridge).
// ============================================================================

import { useEffect, useRef, useState } from 'react'

import { fetchMotorToken, scheduleMotorTokenRefresh } from '@/lib/motor-token-client'

export type MarketStreamState = 'LIVE' | 'DELAYED' | 'BUFFERING'
export type ConnectionState = 'connecting' | 'open' | 'error' | 'closed'

export interface MarketTickItem {
  lastPrice: number
  change24h: number
  isHalted: boolean
  haltedUntil: number | null // Unix ms estimado para retomada (null = desconhecido ou não halted)
  timestamp: number
  state: MarketStreamState
  delayed: boolean
  delayMs: number
  snapshotAgeMs: number | null
  isStale: boolean
}

export interface MarketTickMap {
  [ticker: string]: MarketTickItem
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

export interface UseAllMarketTicksResult {
  ticks: MarketTickMap
  connectionState: ConnectionState
  isBuffering: boolean
  isOffline: boolean
  error: Error | null
}

const OFFLINE_ERROR_THRESHOLD = 3
const OFFLINE_SILENCE_MS = 10_000

/**
 * Retorna mapa de todos os preços via SSE, com estados de conexão.
 * Reconecta automaticamente em caso de erro (EventSource padrão).
 */
export function useAllMarketTicks(): UseAllMarketTicksResult {
  const [tickMap, setTickMap] = useState<MarketTickMap>({})
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

          const hasBuffering = payload.ticks.some((t) => t.state === 'BUFFERING')
          const receivedAt = Date.now()

          setTickMap((prev) => {
            const next = { ...prev }
            for (const raw of payload.ticks) {
              if (raw.state === 'BUFFERING') {
                const prevEntry = prev[raw.ticker]
                if (prevEntry) {
                  next[raw.ticker] = { ...prevEntry, state: 'BUFFERING', isStale: true }
                }
                continue
              }

              const prevEntry = prev[raw.ticker]
              next[raw.ticker] = {
                lastPrice: raw.price ?? prevEntry?.lastPrice ?? 0,
                change24h: raw.changePercent ?? prevEntry?.change24h ?? 0,
                isHalted: raw.isHalted ?? false,
                haltedUntil:
                  raw.estimatedResume ?? (raw.isHalted ? (prevEntry?.haltedUntil ?? null) : null),
                timestamp: raw.timestamp ?? receivedAt,
                state: raw.state,
                delayed: raw.delayed,
                delayMs: raw.delayMs,
                snapshotAgeMs: raw.snapshotAgeMs ?? null,
                isStale: false,
              }
            }
            return next
          })

          setIsBuffering(hasBuffering)
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
  }, [])

  return { ticks: tickMap, connectionState, isBuffering, isOffline, error }
}
