import type { QuantLayer } from './base'
import type { AssetState, ClusterParams, LayerResult } from '../../types/motor.types'

/**
 * L3 - GARCH(1,1) Volatility
 * Modela a volatilidade variante no tempo usando GARCH.
 *
 * σ²_t = ω + α × ε²_{t-1} + β × σ²_{t-1}
 * onde ω = (1 - α - β) × variância_base
 * Movimento: Δp = σ_t × noise × currentPrice
 */
export class L3_GARCH implements QuantLayer {
  name = 'L3_GARCH'

  applyLayer(state: AssetState, params: ClusterParams, noise: number): LayerResult {
    const { garchAlpha, garchBeta } = params
    const omega = (1 - garchAlpha - garchBeta) * 0.0001  // variância base diária

    // Calcular novo sigma² (variance)
    const lastReturn = state.closePrice > 0
      ? (state.currentPrice - state.closePrice) / state.closePrice
      : 0
    const newVariance = omega + garchAlpha * lastReturn ** 2 + garchBeta * state.variance

    // Atualizar variância no estado (será persistida pelo engine)
    state.variance = newVariance

    const sigma = Math.sqrt(newVariance)
    const deltaPrice = sigma * noise * state.currentPrice

    return {
      layer: this.name,
      deltaPrice,
      metadata: { sigma, variance: newVariance },
    }
  }
}
