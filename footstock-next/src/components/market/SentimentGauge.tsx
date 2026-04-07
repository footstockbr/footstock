'use client'

import { Info } from 'lucide-react'

function getSentimentLabel(v: number): { label: string; color: string } {
  if (v <= -0.6) return { label: 'Muito Negativo', color: '#F6465D' }
  if (v <= -0.2) return { label: 'Negativo', color: '#f97316' }
  if (v <= 0.2) return { label: 'Neutro', color: '#929AA5' }
  if (v <= 0.6) return { label: 'Positivo', color: '#4ade80' }
  return { label: 'Muito Positivo', color: '#2EBD85' }
}

const NEWS_SENTIMENT_COLOR: Record<string, string> = {
  BULLISH: '#2EBD85',
  NEUTRAL: '#929AA5',
  BEARISH: '#F6465D',
}

const NEWS_SENTIMENT_LABEL: Record<string, string> = {
  BULLISH: 'Alta',
  NEUTRAL: 'Neutro',
  BEARISH: 'Baixa',
}

interface RecentNewsItem {
  title: string
  sentiment: 'BULLISH' | 'NEUTRAL' | 'BEARISH'
  publishedAt: string
}

interface SentimentGaugeProps {
  sentiment: number   // -1.0 a +1.0 (score real calculado a partir de notícias recentes)
  recentNews?: RecentNewsItem[]
}

export function SentimentGauge({ sentiment, recentNews = [] }: SentimentGaugeProps) {
  const clamped = Math.max(-1, Math.min(1, sentiment))
  const { label, color } = getSentimentLabel(clamped)

  // Ângulo: -90° = muito negativo (esquerda), 0° = neutro (cima), +90° = muito positivo (direita)
  const angleDeg = clamped * 90
  const angleRad = (angleDeg * Math.PI) / 180

  const tipX = 100 + 70 * Math.sin(angleRad)
  const tipY = 100 - 70 * Math.cos(angleRad)

  return (
    <div
      role="img"
      aria-label={`Sentimento do ativo: ${label} (${clamped.toFixed(2)})`}
      data-testid="sentiment-gauge"
      className="flex flex-col items-center gap-3 py-2"
    >
      <svg
        width="200"
        height="110"
        viewBox="0 0 200 110"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="sentimentGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#F6465D" />
            <stop offset="25%" stopColor="#f97316" />
            <stop offset="50%" stopColor="#929AA5" />
            <stop offset="75%" stopColor="#4ade80" />
            <stop offset="100%" stopColor="#2EBD85" />
          </linearGradient>
        </defs>

        {/* Arco de fundo */}
        <path
          d="M 10 100 A 90 90 0 0 1 190 100"
          stroke="url(#sentimentGradient)"
          strokeWidth="12"
          fill="none"
          strokeLinecap="round"
        />

        {/* Ponteiro */}
        <line
          x1="100"
          y1="100"
          x2={tipX}
          y2={tipY}
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          style={{ transition: 'all 0.5s ease' }}
        />

        {/* Centro */}
        <circle cx="100" cy="100" r="4" fill={color} />

        {/* Labels de extremos */}
        <text x="10" y="115" textAnchor="start" fontSize="8" fill="#929AA5">
          Muito Negativo
        </text>
        <text x="190" y="115" textAnchor="end" fontSize="8" fill="#929AA5">
          Muito Positivo
        </text>
      </svg>

      <p className="text-center font-mono text-lg -mt-2" style={{ color }}>
        {clamped >= 0 ? '+' : ''}{clamped.toFixed(2)}
      </p>
      <p
        className="text-center text-sm font-semibold inline-flex items-center gap-1"
        style={{ color }}
      >
        {label}
        <span
          title="Score agregado de sentimento baseado nas notícias das últimas 24h. Varia de -1 (muito negativo) a +1 (muito positivo)"
          aria-label="Explicação do sentimento"
          className="cursor-help"
        >
          <Info className="w-3 h-3 text-[#707A8A]" />
        </span>
      </p>

      {/* Notícias recentes */}
      {recentNews.length > 0 && (
        <div className="w-full mt-1 space-y-1.5">
          <p className="text-xs text-[#929AA5] px-1">Notícias recentes (24h)</p>
          {recentNews.slice(0, 5).map((n, i) => (
            <div
              key={i}
              className="flex items-start gap-2 px-1 py-1.5 rounded-lg bg-[#1E2329] border border-[#2B3139]"
            >
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5"
                style={{
                  color: NEWS_SENTIMENT_COLOR[n.sentiment],
                  backgroundColor: NEWS_SENTIMENT_COLOR[n.sentiment] + '22',
                }}
              >
                {NEWS_SENTIMENT_LABEL[n.sentiment]}
              </span>
              <p className="text-xs text-[#929AA5] leading-snug line-clamp-2">{n.title}</p>
            </div>
          ))}
        </div>
      )}

      {recentNews.length === 0 && (
        <p className="text-xs text-[#555e6a] text-center">
          Sem notícias nas últimas 24h
        </p>
      )}
    </div>
  )
}
