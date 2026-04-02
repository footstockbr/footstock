'use client'

// ============================================================================
// Foot Stock — SentimentGauge
// Gauge semicircular SVG indicando sentimento de mercado (-1 a +1).
// ============================================================================

import { cn } from '@/lib/utils/cn'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface SentimentGaugeProps {
  /** Valor entre -1 (muito negativo) e +1 (muito positivo) */
  value: number
  className?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function sentimentLabel(value: number): string {
  if (value <= -0.6) return 'Muito Negativo'
  if (value <= -0.2) return 'Negativo'
  if (value < 0.2) return 'Neutro'
  if (value < 0.6) return 'Positivo'
  return 'Muito Positivo'
}

function sentimentColor(value: number): string {
  if (value <= -0.6) return '#F6465D'
  if (value <= -0.2) return '#FF8C00'
  if (value < 0.2) return '#F0B90B'
  if (value < 0.6) return '#52C41A'
  return '#0ECB81'
}

// Converte valor (-1..+1) em ângulo da agulha em graus
// -1 → 0° (esquerda), 0 → 90° (topo), +1 → 180° (direita)
function valueToAngle(value: number): number {
  return 90 + value * 90
}

// Ponto na circunferência a partir do ângulo
function polarToXY(
  cx: number,
  cy: number,
  r: number,
  angleDeg: number
): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  }
}

// Cria o path de arco SVG
function arcPath(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number
): string {
  const start = polarToXY(cx, cy, r, startDeg)
  const end = polarToXY(cx, cy, r, endDeg)
  const large = endDeg - startDeg > 180 ? 1 : 0
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

const CX = 100
const CY = 100
const R = 75
const STROKE = 12

// Segmentos de cor do arco (de 0° a 180° = -1 a +1)
const SEGMENTS = [
  { from: 0, to: 36, color: '#F6465D' },    // muito negativo
  { from: 36, to: 72, color: '#FF8C00' },   // negativo
  { from: 72, to: 108, color: '#F0B90B' },  // neutro
  { from: 108, to: 144, color: '#52C41A' }, // positivo
  { from: 144, to: 180, color: '#0ECB81' }, // muito positivo
]

export function SentimentGauge({ value, className }: SentimentGaugeProps) {
  const clamped = clamp(value, -1, 1)
  const label = sentimentLabel(clamped)
  const color = sentimentColor(clamped)
  const needleAngle = valueToAngle(clamped)

  // Ponto da ponta da agulha
  const needleTip = polarToXY(CX, CY, R - STROKE / 2 - 4, needleAngle)

  return (
    <div
      className={cn('flex flex-col items-center gap-1', className)}
      style={{ maxWidth: 200 }}
      aria-label={`Sentimento de mercado: ${label}`}
      role="img"
    >
      <svg
        viewBox="0 0 200 110"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="w-full"
      >
        {/* Arco de fundo */}
        <path
          d={arcPath(CX, CY, R, 0, 180)}
          fill="none"
          stroke="#2B3139"
          strokeWidth={STROKE + 2}
          strokeLinecap="round"
        />

        {/* Segmentos coloridos */}
        {SEGMENTS.map((seg, i) => (
          <path
            key={i}
            d={arcPath(CX, CY, R, seg.from, seg.to)}
            fill="none"
            stroke={seg.color}
            strokeWidth={STROKE}
            opacity={0.35}
          />
        ))}

        {/* Arco preenchido até o valor atual */}
        {clamped !== -1 && (
          <path
            d={arcPath(CX, CY, R, 0, needleAngle)}
            fill="none"
            stroke={color}
            strokeWidth={STROKE}
            strokeLinecap="round"
            opacity={0.9}
          />
        )}

        {/* Centro da agulha */}
        <circle cx={CX} cy={CY} r={6} fill="#EAECEF" />

        {/* Agulha */}
        <line
          x1={CX}
          y1={CY}
          x2={needleTip.x}
          y2={needleTip.y}
          stroke="#EAECEF"
          strokeWidth={2.5}
          strokeLinecap="round"
        />

        {/* Rótulos extremos */}
        <text x="6" y={CY + 16} fontSize="8" fill="#F6465D" textAnchor="middle">
          −
        </text>
        <text x="194" y={CY + 16} fontSize="8" fill="#0ECB81" textAnchor="middle">
          +
        </text>
      </svg>

      {/* Label abaixo */}
      <span
        className="text-xs font-semibold tracking-wide"
        style={{ color }}
      >
        {label}
      </span>
    </div>
  )
}
