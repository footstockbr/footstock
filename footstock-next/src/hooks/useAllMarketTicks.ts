'use client'

// ============================================================================
// FootStock — useAllMarketTicks
// Assina o SSE /stream/market no motor Railway e retorna map ticker → preço atualizado.
// Atualiza automaticamente a cada tick do motor (a cada ~10s).
// Substituição do one-time fetch da MarketPageClient para preços em tempo real.
// NXAUTH-04B: token vem de /api/v1/motor/token (Auth.js → motor JWT bridge).
// ============================================================================

import { useEffect, useRef, useState } from 'react'

import { fetchMotorToken, scheduleMotorTokenRefresh } from '@/lib/motor-token-client'

export interface MarketTickMap {
  [ticker: string]: {
    lastPrice: number
    change24h: number
    isHalted: boolean
    haltedUntil: number | null  // Unix ms estimado para retomada (null = desconhecido ou não halted)
    timestamp: number
  }
}

interface RawMotorTick {
  ticker: string
  price: number
  changePercent: number
  timestamp: number
  isHalted?: boolean
  haltReason?: string | null
  estimatedResume?: number | null
}

interface TickPayload {
  type: string
  ticks: RawMotorTick[]
}

/**
 * Retorna um mapa de todos os preços em tempo real via SSE.
 * Reconecta automaticamente em caso de erro (EventSource padrão).
 */
export function useAllMarketTicks(): MarketTickMap {
  const [tickMap, setTickMap] = useState<MarketTickMap>({})
  const esRef = useRef<EventSource | null>(null)
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let closed = false

    function clearRefreshTimer() {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
    }

    function closeStream() {
      esRef.current?.close()
      esRef.current = null
    }

    async function connect() {
      const minted = await fetchMotorToken()
      if (!minted || closed) return

      const baseUrl = process.env.NEXT_PUBLIC_STREAM_URL ?? 'https://stream.footstock.com.br'
      const url = `${baseUrl}/market?token=${encodeURIComponent(minted.token)}`
      const es = new EventSource(url)
      esRef.current = es

      es.onmessage = (event) => {
        if (closed) return
        try {
          const payload = JSON.parse(event.data as string) as TickPayload
          if (payload.type !== 'TICK') return

          setTickMap((prev) => {
            const next = { ...prev }
            for (const raw of payload.ticks) {
              const prev_entry = prev[raw.ticker]
              next[raw.ticker] = {
                lastPrice: raw.price,
                change24h: raw.changePercent,
                isHalted: raw.isHalted ?? false,
                // Preservar haltedUntil anterior se o tick atual não traz estimativa
                // (evita que countdown suma nos ticks intermediários de halt)
                haltedUntil: raw.estimatedResume ?? (raw.isHalted ? (prev_entry?.haltedUntil ?? null) : null),
                timestamp: raw.timestamp,
              }
            }
            return next
          })
        } catch {
          // parse error — ignora tick malformado
        }
      }

      es.onerror = () => {
        // EventSource reconecta automaticamente em 3s após erro
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
      closeStream()
    }
  }, [])

  return tickMap
}
