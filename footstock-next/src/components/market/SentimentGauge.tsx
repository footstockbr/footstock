'use client'

import { Info } from 'lucide-react'

function getSentimentLabel(v: number): { label: string; color: string } {
  if (v <= -0.6) return { label: 'Muito Negativo', color: '#F6465D' }
  if (v <= -0.2) return { label: 'Negativo', color: '#f97316' }
  if (v <= 0.2) return { label: 'Neutro', color: '#929AA5' }
  if (v <= 0.6) return { label: 'Positivo', color: '#4ade80' }
  return { label: 'Muito Positivo', color: '#2EBD85' }
}

interface SentimentGaugeProps {
  sentiment: number
}

export function SentimentGauge({ sentiment }: SentimentGaugeProps) {
  const clamped = Math.max(-1, Math.min(1, sentiment))
  const { label, color } = getSentimentLabel(clamped)

  // Ângulo: -90° = muito negativo, 0° = neutro, +90° = muito positivo
  const angleDeg = -90 + clamped * 90
  const angleRad = (angleDeg * Math.PI) / 180

  const tipX = 100 + 70 * Math.cos(angleRad)
  const tipY = 100 + 70 * Math.sin(angleRad)

  return (
    <div
      role="img"
      aria-label={`Sentimento do ativo: ${label} (${clamped.toFixed(2)})`}
      data-testid="sentiment-gauge"
      className="flex flex-col items-center"
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

      <p className="text-center font-mono text-lg mt-1" style={{ color }}>
        {clamped.toFixed(2)}
      </p>
      <p className="text-center text-sm font-semibold mt-1 inline-flex items-center gap-1" style={{ color }}>
        {label}
        <span title="Indicador agregado de sentimento da torcida e do mercado — varia de -1 (muito negativo) a +1 (muito positivo)" aria-label="Explicacao do sentimento" className="cursor-help">
          <Info className="w-3 h-3 text-[#707A8A]" />
        </span>
      </p>
    </div>
  )
}
