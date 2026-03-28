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

function colorDistance(c1: string, c2: string): number {
  const hsl1 = hexToHSL(c1)
  const hsl2 = hexToHSL(c2)
  return Math.sqrt(
    (hsl1.h - hsl2.h) ** 2 + (hsl1.s - hsl2.s) ** 2 + (hsl1.l - hsl2.l) ** 2
  )
}

export function hasCollision(c1: string, c2: string, threshold = 30): boolean {
  return colorDistance(c1, c2) < threshold
}

function adjustLightness(hex: string, delta: number): string {
  const { h, s, l } = hexToHSL(hex)
  const newL = Math.min(100, Math.max(0, l + delta))
  // Convert HSL back to hex (simplified)
  const newLFrac = newL / 100
  const sFrac = s / 100
  const q = newLFrac < 0.5 ? newLFrac * (1 + sFrac) : newLFrac + sFrac - newLFrac * sFrac
  const p = 2 * newLFrac - q
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

export function resolveCollisions(colors: string[]): string[] {
  const resolved = [...colors]
  for (let iteration = 0; iteration < 3; iteration++) {
    let changed = false
    for (let i = 0; i < resolved.length; i++) {
      for (let j = i + 1; j < resolved.length; j++) {
        if (hasCollision(resolved[i], resolved[j])) {
          resolved[j] = adjustLightness(resolved[j], 20)
          changed = true
        }
      }
    }
    if (!changed) break
  }
  return resolved
}

export function getContrastColor(bgColor: string): '#ffffff' | '#000000' {
  const { r, g, b } = hexToRGB(bgColor)
  // Relative luminance (WCAG formula)
  const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const L = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
  return L > 0.179 ? '#000000' : '#ffffff'
}

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
