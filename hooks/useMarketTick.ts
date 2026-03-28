'use client'

// ============================================================================
// Foot Stock — useMarketTick Hook
// Consome o SSE endpoint /api/v1/market/stream e atualiza estado React.
// ============================================================================

import { useState, useEffect, useRef, useCallback } from 'react'

export interface TickData {
  assetId: string
  ticker: string
  price: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  change: number
  changePercent: number
  sessionType: 'PRE_MARKET' | 'REGULAR' | 'AFTER_MARKET' | 'CLOSED'
  timestamp: number
}

interface MarketTickEvent {
  type: 'TICK'
  timestamp: number
  ticks: TickData[]
}

interface UseMarketTickOptions {
  /** Se falso, não conecta ao SSE (útil para telas sem preços em tempo real) */
  enabled?: boolean
  /** Filtra apenas os tickers especificados (undefined = todos) */
  tickers?: string[]
  /** Callback chamado em cada tick recebido */
  onTick?: (ticks: TickData[]) => void
}

interface UseMarketTickReturn {
  /** Mapa de ticker → último tick recebido */
  ticks: Map<string, TickData>
  /** Se a conexão SSE está ativa */
  isConnected: boolean
  /** Se os preços estão atrasados (plano JOGADOR) */
  isDelayed: boolean
  /** Timestamp do último tick recebido */
  lastUpdate: number | null
  /** Último erro de conexão */
  error: string | null
  /** Força reconexão manual */
  reconnect: () => void
}

const SSE_URL = '/api/v1/market/stream'
const BACKOFF_BASE_MS = 1_000
const BACKOFF_MAX_MS = 30_000
const MAX_RECONNECT_ATTEMPTS = 10

export function useMarketTick(options: UseMarketTickOptions = {}): UseMarketTickReturn {
  const { enabled = true, tickers, onTick } = options

  const [ticks, setTicks] = useState<Map<string, TickData>>(new Map())
  const [isConnected, setIsConnected] = useState(false)
  const [isDelayed, setIsDelayed] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectAttempts = useRef(0)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  const cleanup = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current)
      reconnectTimer.current = null
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    if (mountedRef.current) {
      setIsConnected(false)
    }
  }, [])

  const connect = useCallback(() => {
    if (!mountedRef.current || !enabled) return

    cleanup()

    const es = new EventSource(SSE_URL)
    eventSourceRef.current = es

    es.onopen = () => {
      if (!mountedRef.current) return
      setIsConnected(true)
      setError(null)
      reconnectAttempts.current = 0
    }

    es.onmessage = event => {
      if (!mountedRef.current) return

      try {
        const parsed: MarketTickEvent & { delayed?: boolean } = JSON.parse(event.data as string)
        if (parsed.type !== 'TICK') return

        if (typeof parsed.delayed === 'boolean') {
          setIsDelayed(parsed.delayed)
        }

        const filtered = tickers
          ? parsed.ticks.filter(t => tickers.includes(t.ticker))
          : parsed.ticks

        if (filtered.length === 0) return

        setTicks(prev => {
          const next = new Map(prev)
          for (const tick of filtered) {
            next.set(tick.ticker, tick)
          }
          return next
        })

        setLastUpdate(Date.now())
        onTick?.(filtered)
      } catch {
        // Ignorar mensagens malformadas
      }
    }

    es.onerror = () => {
      if (!mountedRef.current) return
      setIsConnected(false)
      es.close()
      eventSourceRef.current = null

      if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
        const backoffMs = Math.min(BACKOFF_BASE_MS * 2 ** reconnectAttempts.current, BACKOFF_MAX_MS)
        reconnectAttempts.current++
        setError(`Reconectando... (tentativa ${reconnectAttempts.current}/${MAX_RECONNECT_ATTEMPTS})`)
        reconnectTimer.current = setTimeout(() => {
          if (mountedRef.current) connect()
        }, backoffMs)
      } else {
        setError('Falha ao conectar ao feed de preços. Recarregue a página.')
      }
    }
  }, [enabled, tickers, onTick, cleanup])

  const reconnect = useCallback(() => {
    reconnectAttempts.current = 0
    setError(null)
    connect()
  }, [connect])

  useEffect(() => {
    mountedRef.current = true
    if (enabled) connect()

    return () => {
      mountedRef.current = false
      cleanup()
    }
  }, [enabled, connect, cleanup])

  return { ticks, isConnected, isDelayed, lastUpdate, error, reconnect }
}
