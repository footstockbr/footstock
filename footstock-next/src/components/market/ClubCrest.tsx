// ClubCrest — escudo do clube ficticio renderizado com as DUAS cores reais do
// time equivalente (primaria + secundaria), mantendo o mesmo padrao visual
// (circulo + iniciais do ticker). Antes cada local desenhava o avatar com uma
// cor unica (ou hardcoded amarelo), fazendo todos os escudos parecerem iguais.
//
// Fonte das cores: tabela `assets` (color_primary / color_secondary), derivada
// de CLUB_COLORS. Este componente apenas as aplica — nunca expoe realName.

import { cn } from '@/lib/utils'

interface ClubCrestProps {
  ticker: string
  colorPrimary?: string | null
  colorSecondary?: string | null
  /** Diametro em px. Default 40 (w-10/h-10). */
  size?: number
  className?: string
}

// Fallback usado quando o clube nao tem cores definidas (mantem o look antigo).
const FALLBACK_PRIMARY = '#F0B90B'
const FALLBACK_SECONDARY = '#8a6820'

/** Luminancia relativa (sRGB) para escolher cor de texto legivel. */
function readableTextColor(hex: string): string {
  const clean = hex.replace('#', '')
  if (clean.length < 6) return '#FFFFFF'
  const r = parseInt(clean.slice(0, 2), 16) / 255
  const g = parseInt(clean.slice(2, 4), 16) / 255
  const b = parseInt(clean.slice(4, 6), 16) / 255
  const toLin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const lum = 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b)
  // Limiar ~0.5 da luminancia: claro -> texto escuro, escuro -> texto claro.
  return lum > 0.55 ? '#0B0E11' : '#FFFFFF'
}

export function ClubCrest({
  ticker,
  colorPrimary,
  colorSecondary,
  size = 40,
  className,
}: ClubCrestProps) {
  const primary = colorPrimary || FALLBACK_PRIMARY
  const secondary = colorSecondary || FALLBACK_SECONDARY

  // Escudo bicolor: divisao diagonal nitida entre as duas cores do time.
  const background = `linear-gradient(135deg, ${primary} 0%, ${primary} 50%, ${secondary} 50%, ${secondary} 100%)`

  // Texto legivel sobre a metade primaria (onde a inicial fica centralizada).
  const textColor = readableTextColor(primary)

  // Escala da fonte conforme tamanho (3 caracteres do ticker).
  const fontSize = Math.round(size * 0.3)

  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center font-black shrink-0 border border-[rgba(240,185,11,.18)]',
        className,
      )}
      style={{
        width: size,
        height: size,
        background,
        color: textColor,
        fontSize,
        textShadow: '0 1px 2px rgba(0,0,0,.45)',
      }}
      aria-hidden="true"
    >
      {ticker.slice(0, 3)}
    </div>
  )
}
