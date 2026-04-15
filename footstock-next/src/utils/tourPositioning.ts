/**
 * T-013 — Cálculo de posicionamento dinâmico do tooltip do onboarding tour.
 *
 * Garante que o tooltip não ultrapasse a viewport em mobile (375px+).
 * Retorna a posição final do tooltip e a seta de apontamento.
 */

import type { TourPlacement } from '@/constants/tourSteps'

export interface TooltipRect {
  top: number
  left: number
  arrowPlacement: TourPlacement
}

const TOOLTIP_WIDTH = 280
const TOOLTIP_HEIGHT = 160  // estimativa; ajustada pelo browser
const TOOLTIP_OFFSET = 12   // distância entre o elemento e o tooltip
const VIEWPORT_PADDING = 8  // margem mínima da borda da tela

/**
 * Calcula a posição absoluta do tooltip a partir do DOMRect do elemento alvo
 * e da posição preferida. Ajusta automaticamente se não couber na viewport.
 */
export function calculateTooltipPosition(
  targetRect: DOMRect,
  preferredPlacement: TourPlacement,
  viewportWidth: number,
  viewportHeight: number
): TooltipRect {
  const placements: TourPlacement[] = [
    preferredPlacement,
    getOpposite(preferredPlacement),
    'bottom',
    'top',
    'right',
    'left',
  ]

  for (const placement of placements) {
    const pos = tryPlacement(placement, targetRect, viewportWidth, viewportHeight)
    if (pos) return pos
  }

  // Fallback: centro da tela
  return {
    top: Math.max(VIEWPORT_PADDING, (viewportHeight - TOOLTIP_HEIGHT) / 2),
    left: Math.max(VIEWPORT_PADDING, (viewportWidth - TOOLTIP_WIDTH) / 2),
    arrowPlacement: 'bottom',
  }
}

function tryPlacement(
  placement: TourPlacement,
  targetRect: DOMRect,
  vw: number,
  vh: number
): TooltipRect | null {
  let top = 0
  let left = 0

  switch (placement) {
    case 'right':
      left = targetRect.right + TOOLTIP_OFFSET
      top = targetRect.top + targetRect.height / 2 - TOOLTIP_HEIGHT / 2
      break
    case 'left':
      left = targetRect.left - TOOLTIP_WIDTH - TOOLTIP_OFFSET
      top = targetRect.top + targetRect.height / 2 - TOOLTIP_HEIGHT / 2
      break
    case 'bottom':
      top = targetRect.bottom + TOOLTIP_OFFSET
      left = targetRect.left + targetRect.width / 2 - TOOLTIP_WIDTH / 2
      break
    case 'top':
      top = targetRect.top - TOOLTIP_HEIGHT - TOOLTIP_OFFSET
      left = targetRect.left + targetRect.width / 2 - TOOLTIP_WIDTH / 2
      break
  }

  // Clampar ao viewport
  left = Math.max(VIEWPORT_PADDING, Math.min(left, vw - TOOLTIP_WIDTH - VIEWPORT_PADDING))
  top = Math.max(VIEWPORT_PADDING, Math.min(top, vh - TOOLTIP_HEIGHT - VIEWPORT_PADDING))

  // Verificar se sobrepõe o elemento alvo após clampar
  const overlapH = left < targetRect.right && left + TOOLTIP_WIDTH > targetRect.left
  const overlapV = top < targetRect.bottom && top + TOOLTIP_HEIGHT > targetRect.top
  if (overlapH && overlapV) return null

  // Verificar se cabe na viewport
  if (left < 0 || top < 0 || left + TOOLTIP_WIDTH > vw || top + TOOLTIP_HEIGHT > vh) {
    return null
  }

  return { top, left, arrowPlacement: placement }
}

function getOpposite(p: TourPlacement): TourPlacement {
  const map: Record<TourPlacement, TourPlacement> = {
    top: 'bottom',
    bottom: 'top',
    left: 'right',
    right: 'left',
  }
  return map[p]
}

/**
 * Calcula o rect do spotlight (área recortada) com padding em volta do elemento.
 */
export interface SpotlightRect {
  top: number
  left: number
  width: number
  height: number
  borderRadius: number
}

const SPOTLIGHT_PADDING = 8

export function calculateSpotlightRect(targetRect: DOMRect): SpotlightRect {
  return {
    top: targetRect.top - SPOTLIGHT_PADDING,
    left: targetRect.left - SPOTLIGHT_PADDING,
    width: targetRect.width + SPOTLIGHT_PADDING * 2,
    height: targetRect.height + SPOTLIGHT_PADDING * 2,
    borderRadius: 8,
  }
}
