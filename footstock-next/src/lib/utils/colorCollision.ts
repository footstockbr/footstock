import {
  COMPARISON_FALLBACK_PALETTE,
  COLOR_COLLISION_THRESHOLD,
} from '@/lib/constants/comparisonPalette'

// ============================================================================
// RGB / HSL conversions
// ============================================================================

function hexToRGB(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '')
  return {
    r: parseInt(clean.slice(0, 2), 16) / 255,
    g: parseInt(clean.slice(2, 4), 16) / 255,
    b: parseInt(clean.slice(4, 6), 16) / 255,
  }
}

function rgbToHSL(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2

  if (max === min) return { h: 0, s: 0, l: l * 100 }

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6

  return { h: h * 360, s: s * 100, l: l * 100 }
}

export function hexToHSL(hex: string): { h: number; s: number; l: number } {
  const { r, g, b } = hexToRGB(hex)
  return rgbToHSL(r, g, b)
}

// ============================================================================
// CIE Lab conversion (for perceptual distance)
// ============================================================================

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function hexToLab(hex: string): { L: number; a: number; b: number } {
  const { r, g, b } = hexToRGB(hex)
  // sRGB -> linear
  const lr = srgbToLinear(r)
  const lg = srgbToLinear(g)
  const lb = srgbToLinear(b)
  // linear RGB -> XYZ (D65)
  const x = (0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) / 0.95047
  const y = (0.2126729 * lr + 0.7151522 * lg + 0.0721750 * lb) / 1.0
  const z = (0.0193339 * lr + 0.1191920 * lg + 0.9503041 * lb) / 1.08883
  // XYZ -> Lab
  const f = (t: number) => (t > 0.008856 ? t ** (1 / 3) : 7.787 * t + 16 / 116)
  const fx = f(x)
  const fy = f(y)
  const fz = f(z)
  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  }
}

// ============================================================================
// CIEDE2000-simplified perceptual distance
// Uses CIE76 (Euclidean in Lab) which is simpler but adequate for this
// threshold-based use case. True CIEDE2000 is ~200 lines; this captures
// the perceptual improvement of Lab space over HSL.
// ============================================================================

function colorDistanceLab(c1: string, c2: string): number {
  const lab1 = hexToLab(c1)
  const lab2 = hexToLab(c2)
  return Math.sqrt(
    (lab1.L - lab2.L) ** 2 + (lab1.a - lab2.a) ** 2 + (lab1.b - lab2.b) ** 2
  )
}

export function hasCollision(c1: string, c2: string, threshold = COLOR_COLLISION_THRESHOLD): boolean {
  return colorDistanceLab(c1, c2) < threshold
}

// ============================================================================
// Collision resolution with fallback palette
// ============================================================================

export function resolveCollisions(colors: string[]): string[] {
  const resolved = [...colors]
  let paletteIdx = 0

  for (let i = 0; i < resolved.length; i++) {
    for (let j = i + 1; j < resolved.length; j++) {
      if (hasCollision(resolved[i], resolved[j])) {
        // Tentar paleta alternativa antes de ajustar lightness
        let replaced = false
        while (paletteIdx < COMPARISON_FALLBACK_PALETTE.length) {
          const candidate = COMPARISON_FALLBACK_PALETTE[paletteIdx]
          paletteIdx++
          // Verificar se o candidato não colide com nenhuma cor já resolvida
          const collidesWithExisting = resolved.slice(0, j).some(
            (existing) => hasCollision(existing, candidate)
          )
          if (!collidesWithExisting) {
            resolved[j] = candidate
            replaced = true
            break
          }
        }
        // Fallback: ajustar lightness se paleta esgotou
        if (!replaced) {
          const { h, s, l } = hexToHSL(resolved[j])
          const newL = Math.min(100, Math.max(0, l + 20))
          resolved[j] = hslToHex(h, s, newL)
        }
      }
    }
  }
  return resolved
}

// ============================================================================
// Utility: HSL -> Hex
// ============================================================================

function hslToHex(h: number, s: number, l: number): string {
  const sFrac = s / 100
  const lFrac = l / 100
  const q = lFrac < 0.5 ? lFrac * (1 + sFrac) : lFrac + sFrac - lFrac * sFrac
  const p = 2 * lFrac - q
  const hFrac = h / 360

  function hue2rgb(p: number, q: number, t: number) {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }

  const r = Math.round(hue2rgb(p, q, hFrac + 1 / 3) * 255)
  const g = Math.round(hue2rgb(p, q, hFrac) * 255)
  const b = Math.round(hue2rgb(p, q, hFrac - 1 / 3) * 255)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

// ============================================================================
// Contrast color (WCAG)
// ============================================================================

export function getContrastColor(bgColor: string): '#ffffff' | '#000000' {
  const { r, g, b } = hexToRGB(bgColor)
  const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const L = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
  return L > 0.179 ? '#000000' : '#ffffff'
}

// ============================================================================
// Main API: assign chart colors for comparison mode
// ============================================================================

export function assignChartColors(
  assets: Array<{ ticker: string; primaryColor: string }>
): Record<string, string> {
  const colors = assets.map((a) => a.primaryColor)
  const resolved = resolveCollisions(colors)
  const result: Record<string, string> = {}
  assets.forEach((a, i) => {
    result[a.ticker] = resolved[i]
  })
  return result
}
