'use client'

// ============================================================================
// Foot Stock — useAllMarketTicks
// Assina o SSE /api/v1/market/stream e retorna map ticker → preço atualizado.
// Atualiza automaticamente a cada tick do motor (a cada ~2s).
// Substituição do one-time fetch da MarketPageClient para preços em tempo real.
// ============================================================================

import { useEffect, useRef, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'

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

  useEffect(() => {
    let closed = false

    async function connect() {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token || closed) return

      const url = `/api/v1/market/stream?token=${encodeURIComponent(token)}`
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
    }

    connect()

    return () => {
      closed = true
      esRef.current?.close()
      esRef.current = null
    }
  }, [])

  return tickMap
}
