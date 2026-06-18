import type { QuantLayer } from './base'
import type { AssetState, ClusterParams, LayerResult } from '../../types/motor.types'
import { getTickDt } from '../tick-dt'

/**
 * L2 — Fundamental Anchor — Componente Determinística (Mean Reversion Capped)
 *
 * Implementa a componente determinística do processo OU:
 *   ΔP_anchor = clamp( θ × (FV - P) × dt , −0.3%×P , +0.3%×P )
 *
 * O cap de 0.3%/tick garante que a âncora fundamental não domine o
 * movimento de preço em um único tick, mesmo com grandes desvios do FV.
 *
 * FV (Fair Value estático) deve ser calculado externamente como:
 *   FV = (EV × float_percentage) / total_shares_circulating
 * e armazenado em `clubs.currentFairValue` (atualizado via painel admin).
 *
 * Separação de L1: L1 cuida do ruído estocástico, L2 cuida do pull determinístico.
 * Sem double-counting: cada componente do OU tem sua camada.
 */
const DEFAULT_MAX_ANCHOR_PERCENT = 0.003  // 0.3% por tick (cap absoluto)

export class L2_FundamentalAnchor implements QuantLayer {
  name = 'L2_FundamentalAnchor'

  applyLayer(state: AssetState, params: ClusterParams, _noise: number): LayerResult {
    const fv = state.fairValue > 0 ? state.fairValue : state.closePrice
    if (fv === 0 || state.currentPrice === 0) {
      return { layer: this.name, deltaPrice: 0, metadata: { theta: params.theta } }
    }

    // dt EXPLÍCITO (T3.3): mesma fonte de L1/L3 via getTickDt(). Lido por tick.
    const dt = getTickDt()
    const theta = params.theta ?? 0.05
    // volatilityMultiplier: sessão (CLOSED=0, TRADING=1.0, etc.)
    // Congela mean-reversion durante sessões inativas (mercado fechado = sem movimento)
    const sessionMul = state.volatilityMultiplier ?? 1.0

    // Componente determinística: θ × (FV − P) × dt × sessionMul
    const raw = theta * (fv - state.currentPrice) * dt * sessionMul

    // Cap: máximo 0.3% do preço atual por tick em direção ao FV
    const anchorCap = params.fundamentalReversionRate ?? DEFAULT_MAX_ANCHOR_PERCENT
    const maxDelta = state.currentPrice * anchorCap
    const deltaPrice = Math.max(-maxDelta, Math.min(maxDelta, raw))

    const capped = Math.abs(raw) > maxDelta ? 1 : 0

    return {
      layer: this.name,
      deltaPrice,
      metadata: {
        theta,
        fairValue: fv,
        deviation: (state.currentPrice - fv) / fv,
        rawDelta: raw,
        cappedAt: anchorCap,
        capped,
        volatilityMultiplier: sessionMul,
      },
    }
  }
}
