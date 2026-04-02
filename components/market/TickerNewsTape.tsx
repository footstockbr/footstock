'use client'

// ============================================================================
// Foot Stock — TickerNewsTape (Should)
// Faixa de notícias em tempo real via SSE /api/v1/news/stream.
// Fallback: esconde após 3 falhas de conexão.
// ============================================================================

import { useState, useEffect, useRef } from 'react'
import { getSupabaseClient } from '@/lib/auth/session'

interface NewsItem {
  id: string
  title: string
  ticker: string
  sentiment: string
  timestamp: number
}

export default function TickerNewsTape() {
  const [news, setNews] = useState<NewsItem[]>([])
  const [isVisible, setIsVisible] = useState(true)
  const failCount = useRef(0)
  const MAX_FAILS = 3

  useEffect(() => {
    let es: EventSource | null = null
    let retryCount = 0

    async function connect() {
      // EventSource não suporta headers — passa token como query param
      let sseUrl = '/api/v1/news/stream'
      try {
        const supabase = getSupabaseClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.access_token) {
          sseUrl = `/api/v1/news/stream?token=${encodeURIComponent(session.access_token)}`
        }
      } catch {
        // Supabase indisponível — tenta sem token
      }

      es = new EventSource(sseUrl)

      es.onopen = () => {
        retryCount = 0
        failCount.current = 0
      }

      es.onmessage = event => {
        try {
          const item: NewsItem = JSON.parse(event.data as string)
          setNews(prev => [item, ...prev].slice(0, 10))
        } catch {
          // ignorar mensagens malformadas
        }
      }

      es.onerror = () => {
        es?.close()
        retryCount++
        failCount.current++

        if (failCount.current >= MAX_FAILS) {
          setIsVisible(false)
          return
        }

        if (retryCount < MAX_FAILS) {
          setTimeout(connect, 2 ** retryCount * 1000)
        }
      }
    }

    connect()

    return () => {
      es?.close()
    }
  }, [])

  if (!isVisible || news.length === 0) return null

  const duplicate = [...news, ...news]

  return (
    <div
      data-testid="ticker-news-tape"
      role="marquee"
      aria-live="off"
      aria-label="Faixa de notícias de mercado"
      className="overflow-hidden bg-bg-elevated border-y border-border-default py-1.5"
    >
      <div className="flex gap-8 animate-marquee whitespace-nowrap">
        {duplicate.map((item, i) => (
          <span
            key={`${item.id}-${i}`}
            className={`text-xs flex-shrink-0 ${
              item.sentiment === 'positive'
                ? 'text-green-400'
                : item.sentiment === 'negative'
                  ? 'text-red-400'
                  : 'text-text-secondary'
            }`}
          >
            <span className="font-mono font-bold text-text-primary mr-1">{item.ticker}</span>
            {item.title}
          </span>
        ))}
      </div>
    </div>
  )
}
