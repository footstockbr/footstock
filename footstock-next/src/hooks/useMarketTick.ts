'use client'

// Conexão real com o SSE endpoint /api/v1/market/stream (Redis market:tick).
// Substitui o stub anterior que sempre retornava null.
import { useEffect, useRef, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'

export interface MarketTick {
  ticker: string
  bid: number
  ask: number
  spread: number
  lastPrice: number
  change24h: number   // changePercent do motor (variação vs closePrice anterior)
  isHalted: boolean
  haltReason?: string | null
  estimatedResume?: string | null
  timestamp: number
}

interface RawMotorTick {
  ticker: string
  price: number
  changePercent: number
  timestamp: number
}

interface TickPayload {
  type: string
  ticks: RawMotorTick[]
}

export function useMarketTick(ticker: string): MarketTick | null {
  const [tick, setTick] = useState<MarketTick | null>(null)
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

      // Sem token não há como autenticar o SSE
      if (!token || closed) return

      const url = `/api/v1/market/stream?token=${encodeURIComponent(token)}`
      const es = new EventSource(url)
      esRef.current = es

      es.onmessage = (event) => {
        if (closed) return
        try {
          const payload = JSON.parse(event.data as string) as TickPayload
          if (payload.type !== 'TICK') return

          const raw = payload.ticks.find((t) => t.ticker === ticker)
          if (!raw) return

          // Motor usa bid = price * 0.999, ask = price * 1.001, spread = price * 0.002
          setTick({
            ticker: raw.ticker,
            lastPrice: raw.price,
            bid: raw.price * 0.999,
            ask: raw.price * 1.001,
            spread: raw.price * 0.002,
            change24h: raw.changePercent,
            isHalted: false,
            timestamp: raw.timestamp,
          })
        } catch {
          // parse error — ignora
        }
      }

      es.onerror = () => {
        // EventSource reconecta automaticamente após erro
      }
    }

    connect()

    return () => {
      closed = true
      esRef.current?.close()
      esRef.current = null
    }
  }, [ticker])

  return tick
}
