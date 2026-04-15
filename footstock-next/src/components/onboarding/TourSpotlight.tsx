'use client'

/**
 * T-013 — Overlay semi-transparente com spotlight (recorte) no elemento alvo.
 *
 * Usa SVG clipPath para criar o "buraco" de spotlight com bordas arredondadas.
 * A área fora do spotlight tem opacidade reduzida (overlay escuro).
 */

import { useEffect, useState } from 'react'
import type { SpotlightRect } from '@/utils/tourPositioning'

interface TourSpotlightProps {
  spotlight: SpotlightRect | null
  onClick?: () => void
}

export function TourSpotlight({ spotlight, onClick }: TourSpotlightProps) {
  const [vw, setVw] = useState(0)
  const [vh, setVh] = useState(0)

  useEffect(() => {
    function update() {
      setVw(window.innerWidth)
      setVh(window.innerHeight)
    }
    update()
    window.addEventListener('resize', update, { passive: true })
    return () => window.removeEventListener('resize', update)
  }, [])

  if (vw === 0 || vh === 0) return null

  const clipId = 'tour-spotlight-clip'

  // Sem elemento alvo: overlay sólido (modo centralizado)
  if (!spotlight) {
    return (
      <div
        data-testid="tour-overlay"
        className="fixed inset-0 bg-black/60 z-[1000]"
        onClick={onClick}
        aria-hidden="true"
      />
    )
  }

  return (
    <div
      data-testid="tour-overlay"
      className="fixed inset-0 z-[1000] pointer-events-none"
      aria-hidden="true"
    >
      <svg
        width={vw}
        height={vh}
        className="absolute inset-0"
        style={{ display: 'block' }}
      >
        <defs>
          <clipPath id={clipId}>
            {/* Área total da tela */}
            <rect x={0} y={0} width={vw} height={vh} />
            {/* Recorte (spotlight) no elemento alvo — subtrai com evenodd */}
            <rect
              x={spotlight.left}
              y={spotlight.top}
              width={spotlight.width}
              height={spotlight.height}
              rx={spotlight.borderRadius}
              ry={spotlight.borderRadius}
            />
          </clipPath>
        </defs>

        {/* Overlay com buraco no spotlight */}
        <rect
          x={0}
          y={0}
          width={vw}
          height={vh}
          fill="rgba(0, 0, 0, 0.65)"
          clipPath={`url(#${clipId})`}
          clipRule="evenodd"
          fillRule="evenodd"
        />

        {/* Borda dourada no spotlight */}
        <rect
          x={spotlight.left}
          y={spotlight.top}
          width={spotlight.width}
          height={spotlight.height}
          rx={spotlight.borderRadius}
          ry={spotlight.borderRadius}
          fill="none"
          stroke="#F0B90B"
          strokeWidth="2"
          opacity="0.7"
        />
      </svg>
    </div>
  )
}
