import type { QuantLayer } from './base'
import type { AssetState, ClusterParams, LayerResult } from '../../types/motor.types'

/**
 * L3 - GARCH(1,1) Volatility Clustering
 * INTAKE canônico: Variance_t = omega + alpha*r² + beta*Var_{t-1}
 * omega = 0.000002 (constante), alpha = 0.12, beta = 0.85
 * Cap de volatilidade em 1.8x da variância base para evitar spikes.
 */
const OMEGA = 0.000002         // INTAKE canônico
const BASE_VARIANCE = 0.0001   // Variância base para cap
const VOLATILITY_CAP = 1.8     // Max 1.8x variância base

export class L3_GARCH implements QuantLayer {
  name = 'L3_GARCH'

  applyLayer(state: AssetState, params: ClusterParams, noise: number): LayerResult {
    const { garchAlpha, garchBeta } = params

    // Retorno desde o close (r)
    const lastReturn = state.closePrice > 0
      ? (state.currentPrice - state.closePrice) / state.closePrice
      : 0

    // GARCH(1,1): σ²_t = ω + α×r² + β×σ²_{t-1}
    let newVariance = OMEGA + garchAlpha * lastReturn ** 2 + garchBeta * state.variance

    // Cap: variância não pode exceder 1.8x a base
    const maxVariance = BASE_VARIANCE * VOLATILITY_CAP
    newVariance = Math.min(newVariance, maxVariance)

    // Atualizar variância no estado (será persistida pelo engine)
    state.variance = newVariance

    const sigma = Math.sqrt(newVariance)
    const deltaPrice = sigma * noise * state.currentPrice

    return {
      layer: this.name,
      deltaPrice,
      metadata: { sigma, variance: newVariance, capped: newVariance >= maxVariance ? 1 : 0 },
    }
  }
}
