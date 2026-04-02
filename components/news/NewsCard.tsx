'use client'

// ============================================================================
// Foot Stock — NewsCard
// Card de noticia individual com sentimento, ticker badges e link externo.
// Rastreabilidade: module-17-rss-noticias / TASK-5
// ============================================================================

import { ExternalLink } from 'lucide-react'
import type { NewsRecord } from '@/lib/types/news'

// ---------------------------------------------------------------------------
// Sentiment mapping
// ---------------------------------------------------------------------------

type SentimentLabel = 'VERY_POSITIVE' | 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'VERY_NEGATIVE'

interface SentimentStyle {
  label: string
  bg: string
  text: string
}

const SENTIMENT_STYLES: Record<SentimentLabel, SentimentStyle> = {
  VERY_POSITIVE: { label: 'Muito positivo', bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
  POSITIVE:      { label: 'Positivo',       bg: 'bg-emerald-700/20', text: 'text-emerald-600' },
  NEUTRAL:       { label: 'Neutro',         bg: 'bg-slate-700/20',   text: 'text-slate-400' },
  NEGATIVE:      { label: 'Negativo',       bg: 'bg-red-700/20',     text: 'text-red-600' },
  VERY_NEGATIVE: { label: 'Muito negativo', bg: 'bg-red-500/20',     text: 'text-red-400' },
}

/**
 * Mapeia o valor de sentiment (string enum do backend) para label de exibicao.
 * Backend retorna BULLISH | BEARISH | NEUTRAL; suporta tambem numerico (-1..1).
 *
 * GAP-016: VERY_POSITIVE/VERY_NEGATIVE só são atingíveis via path numérico (sentiment >= 0.6 / <= -0.6).
 * A API atual sempre retorna strings (BULLISH/BEARISH/NEUTRAL), portanto esses estilos ficam reservados
 * para quando a API for expandida com scoring numérico de alta granularidade.
 */
function getSentimentLabel(sentiment: string | number): SentimentLabel {
  if (typeof sentiment === 'number') {
    if (sentiment >= 0.6) return 'VERY_POSITIVE'
    if (sentiment >= 0.2) return 'POSITIVE'
    if (sentiment > -0.2) return 'NEUTRAL'
    if (sentiment > -0.6) return 'NEGATIVE'
    return 'VERY_NEGATIVE'
  }

  const upper = sentiment.toUpperCase()
  if (upper === 'BULLISH') return 'POSITIVE'
  if (upper === 'BEARISH') return 'NEGATIVE'
  return 'NEUTRAL'
}

// ---------------------------------------------------------------------------
// Relative date formatting
// ---------------------------------------------------------------------------

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 60 * 60],
  ['month', 30 * 24 * 60 * 60],
  ['week', 7 * 24 * 60 * 60],
  ['day', 24 * 60 * 60],
  ['hour', 60 * 60],
  ['minute', 60],
  ['second', 1],
]

function relativeDate(dateStr: string | null): string {
  if (!dateStr) return ''
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000
  const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })

  for (const [unit, secs] of UNITS) {
    if (Math.abs(diff) >= secs) {
      return rtf.format(-Math.round(diff / secs), unit)
    }
  }
  return rtf.format(0, 'second')
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface NewsCardProps {
  news: NewsRecord
}

export default function NewsCard({ news }: NewsCardProps) {
  const sentimentKey = getSentimentLabel(news.sentiment)
  const style = SENTIMENT_STYLES[sentimentKey]
  const dateLabel = relativeDate(news.publishedAt)
  const hasUrl = news.source && news.source.startsWith('http')

  const Wrapper = hasUrl ? 'a' : 'div'
  const linkProps = hasUrl
    ? { href: news.source!, target: '_blank' as const, rel: 'noopener noreferrer' }
    : {}

  return (
    <Wrapper
      {...linkProps}
      role="article"
      aria-label={`${news.title} - ${style.label}${news.source ? ` - ${news.source}` : ''}${dateLabel ? ` - ${dateLabel}` : ''}`}
      className="bg-[#1E2329] hover:bg-[#1a2230] rounded-xl p-4 min-h-[60px] transition-colors block"
    >
      {/* Header: sentiment badge + ticker badges */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span
          className={`${style.bg} ${style.text} text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full`}
        >
          {style.label}
        </span>

        {news.assetIds.map((ticker) => (
          <span
            key={ticker}
            className="bg-[#F0B90B]/20 text-[#F0B90B] border border-[#F0B90B]/30 text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full"
          >
            {ticker}
          </span>
        ))}
      </div>

      {/* Title */}
      <h3 className="text-sm font-medium text-white line-clamp-2">{news.title}</h3>

      {/* Footer: source + date + external link icon */}
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-slate-500">
          {news.source && !news.source.startsWith('http') && (
            <>{news.source} &middot; </>
          )}
          {dateLabel}
        </span>

        {hasUrl && (
          <ExternalLink className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" aria-hidden="true" />
        )}
      </div>
    </Wrapper>
  )
}
